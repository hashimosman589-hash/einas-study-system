// ============================================================
// المعالجة غير المتزامنة للمحاضرات (Background Analysis Worker)
// طابور دائم (analysis_jobs) + عامل يعالج الوظائف بتوازٍ محدود.
// - الرفع يعود فورًا؛ المعالجة (الاستخراج + الذكاء الاصطناعي) جارٍ هنا.
// - الوظائف الباقية من جلسة سابقة يُعاد جدولتها عند إعادة التشغيل.
// - تأجيل تلقائي بفشل مؤقت مع إعادة محاولة أُسّية (Exponential Backoff).
// - التقدم يُكتب في قاعدة البيانات + خريطة الذاكرة (لوحة الإدارة).
// ============================================================
import path from 'path';
import fs from 'fs';
import db from '../db.js';
import { extractDocument } from './parser.js';
import { annotatePageSplits, chunkContent } from './engines.js';
import { analyzeLecture } from './ai.js';

function clampEnv(name, def, min, max) {
  const v = parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, v));
}

// عدد الوظائف المتزامنة (مستخرِج + محلل). سقف التوكنات (TPM) مشترك بينها جميعًا في موزّع engines.
const WORKER_CONCURRENCY = clampEnv('AI_WORKER_CONCURRENCY', 2, 1, 4);
const MAX_ATTEMPTS = clampEnv('AI_JOB_MAX_ATTEMPTS', 3, 1, 10);
const RETRY_BASE_MS = clampEnv('AI_JOB_RETRY_BASE_MS', 3000, 1000, 600000);
const DB_WRITE_INTERVAL = 1200;
const STALE_MS = 15 * 60 * 1000;

// خريطة التقدم الخاصة بالمستخدم (تستهلكها لوحة الإدارة كما كان سابقًا)
export const analysisProgress = new Map();

const ACTIVE_STATUSES = ['extracting', 'chunking', 'analyzing', 'generating_questions', 'quality_review'];

let running = 0;
let ticking = false;

// ---------- أدوات الطابور ----------
function parseStoredPaths(filePath) {
  if (!filePath) return [];
  let arr;
  try { arr = JSON.parse(filePath); } catch { arr = [filePath]; }
  if (!Array.isArray(arr)) arr = [filePath];
  return arr.filter((x) => typeof x === 'string' && x);
}

function sqlNow() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function sqlAt(msOffset) {
  return new Date(Date.now() + msOffset).toISOString().replace('T', ' ').slice(0, 19);
}

// ---------- إضافة/استرجاع ----------
export function enqueueAnalysis({ userId, lectureId, fileHash = '', maxAttempts = null }) {
  const info = db.prepare(
    `INSERT INTO analysis_jobs (user_id, lecture_id, file_hash, status, progress, current_stage, message, max_attempts, created_at, updated_at)
     VALUES (?,?,?,'queued',0,'queued','بانتظار المعالجة',?,datetime('now'),datetime('now'))`
  ).run(userId, lectureId, fileHash, maxAttempts || MAX_ATTEMPTS);
  const jobId = Number(info.lastInsertRowid);
  pump();
  return jobId;
}

export function deleteJobsForLecture(userId, lectureId) {
  db.prepare('DELETE FROM analysis_jobs WHERE lecture_id = ? AND user_id = ?').run(lectureId, userId);
}

export function latestJobForUser(userId) {
  const row = db.prepare(
    `SELECT j.*, l.title AS lecture_title, l.status AS lecture_status
     FROM analysis_jobs j LEFT JOIN lectures l ON l.id = j.lecture_id
     WHERE j.user_id = ? ORDER BY j.id DESC LIMIT 1`
  ).get(userId);
  if (!row) return null;
  // موقع التحليل داخل الملف: الأجزاء تصدر من خط الإنتاج بصيغة «الجزء X/N»
  const pm = String(row.message || '').match(/الجزء (\d+)\/(\d+)/);
  const part = pm ? Number(pm[1]) : Math.min((row.sections_done || 0) + 1, row.sections_total || 1);
  const partsTotal = pm ? Number(pm[2]) : row.sections_total || 0;
  return {
    jobId: row.id,
    lectureId: row.lecture_id,
    pct: row.progress || 0,
    message: row.message || row.current_stage || '',
    eta: row.eta_seconds ?? null,
    stage: row.current_stage || 'queued',
    status: row.status,
    sectionsDone: row.sections_done || 0,
    sectionsTotal: row.sections_total || 0,
    part,
    partsTotal,
    partPct: partsTotal > 0 ? Math.round(((part - 1) / partsTotal) * 100) : 0,
    error: row.error_message || null,
    lectureTitle: row.lecture_title || null,
    lectureStatus: row.lecture_status || null,
    cached: !!row.cached,
  };
}

// ---------- التقدم والتخزين ----------
function stageForPct(pct) {
  if (pct >= 100) return 'completed';
  if (pct >= 90) return 'quality_review';
  if (pct >= 85) return 'generating_questions';
  if (pct >= 40) return 'analyzing';
  if (pct >= 30) return 'chunking';
  if (pct >= 10) return 'extracting';
  return 'validating';
}

function writeJobProgress(jobId, { pct, message, stage, eta, sectionsDone }) {
  // حالة الوظيفة تعكس المرحلة الحية (استخراج/تقسيم/تحليل/توليد/مراجعة)
  const status = ACTIVE_STATUSES.includes(stage) ? stage : 'extracting';
  db.prepare(
    `UPDATE analysis_jobs SET status=?, progress=?, current_stage=?, message=?, eta_seconds=?, sections_done=?, updated_at=datetime('now') WHERE id=?`
  ).run(status, pct, stage, message, eta ?? null, sectionsDone || 0, jobId);
}

function mapProgress(userId, lectureId, jobId, obj) {
  analysisProgress.set(userId, {
    lectureId,
    jobId,
    pct: obj.pct,
    message: obj.message,
    eta: obj.eta ?? null,
    stage: obj.stage,
    status: obj.status || 'running',
  });
}

// ---------- فشل/إعادة محاولة / إكمال ----------
function failJob(jobId, userId, lectureId, message, detail) {
  const job = db.prepare('SELECT * FROM analysis_jobs WHERE id = ?').get(jobId);
  if (!job) return;
  const attempts = (job.attempts || 0) + 1;
  const maxAtt = job.max_attempts || MAX_ATTEMPTS;
  if (attempts < maxAtt) {
    const backoffMs = RETRY_BASE_MS * Math.pow(2, attempts);
    db.prepare(
      `UPDATE analysis_jobs SET attempts=?, status='queued', retry_at=?, error_message=?, error_detail=?, updated_at=datetime('now') WHERE id=?`
    ).run(attempts, sqlAt(backoffMs), message, String(detail || '').slice(0, 500), jobId);
    db.prepare(
      `UPDATE lectures SET status='processing', progress=0, current_stage='queued', error_message=NULL, updated_at=datetime('now') WHERE id=?`
    ).run(lectureId);
    analysisProgress.delete(userId);
    pump();
  } else {
    db.prepare(
      `UPDATE analysis_jobs SET attempts=?, status='failed', error_message=?, error_detail=?, finished_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
    ).run(attempts, message, String(detail || '').slice(0, 500), jobId);
    db.prepare(
      `UPDATE lectures SET status='error', progress=0, current_stage='failed', error_message=?, updated_at=datetime('now') WHERE id=?`
    ).run(message, lectureId);
    mapProgress(userId, lectureId, jobId, { pct: 0, message: 'فشل التحليل', eta: null, stage: 'failed', status: 'failed' });
    setTimeout(() => analysisProgress.delete(userId), 15000);
  }
}

function completeJob(jobId, lectureId, userId) {
  db.prepare(
    `UPDATE analysis_jobs SET status='completed', progress=100, current_stage='completed', message='اكتمل التحليل', eta_seconds=0, finished_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
  ).run(jobId);
  db.prepare(
    `UPDATE lectures SET status='ready', progress=100, current_stage='completed', error_message=NULL, updated_at=datetime('now') WHERE id=?`
  ).run(lectureId);
  mapProgress(userId, lectureId, jobId, { pct: 100, message: 'اكتمل التحليل', eta: 0, stage: 'completed', status: 'completed' });
  setTimeout(() => analysisProgress.delete(userId), 60000);
}

// ---------- حفظ النتائج (كما في التدفق القديم — بلا تغيير في البيانات) ----------
function saveAnalysisResult({ jobId, lectureId, userId, result }) {
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO summaries (lecture_id, user_id, summary, key_points, important_terms, review_topics) VALUES (?,?,?,?,?,?)')
      .run(lectureId, userId, result.summary || '', JSON.stringify(result.keyPoints || []), JSON.stringify(result.importantTerms || []), JSON.stringify(result.reviewTopics || []));
    const insertQ = db.prepare('INSERT INTO questions (lecture_id, user_id, text, type, options, correct_answer, explanation, topic, question_en, question_ar, answer_en, answer_ar, difficulty, page) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const q of result.questions || []) {
      insertQ.run(
        lectureId, userId, q.text, q.type, q.options ? JSON.stringify(q.options) : null,
        String(q.correctAnswer ?? q.correct ?? ''), q.explanation || '', q.topic || '',
        q.questionEn ?? null, q.questionAr ?? null, q.answerEn ?? null, q.answerAr ?? null,
        q.difficulty || 'medium', q.page || ''
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return (result.questions || []).length;
}

// ---------- تخزين مستند/صفحات/أجزاء (بناء الطلب على الجداول المستضافة) ----------
function persistDocument({ fileHash, fileName, fileType, sizeBytes, sourceFiles, filesMeta, content, pageCount }) {
  const allPages = [];
  for (const f of filesMeta) if (Array.isArray(f.pages)) allPages.push(...f.pages);
  const safe = (x) => String(x || '').replace(/[\u0000-\u001f]/g, '');

  db.prepare(
    `INSERT INTO documents (file_hash, file_name, file_type, size_bytes, page_count, source_files, content, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))
     ON CONFLICT(file_hash) DO UPDATE SET content=excluded.content, page_count=excluded.page_count, source_files=excluded.source_files, updated_at=datetime('now')`
  ).run(fileHash, safe(fileName), safe(fileType), sizeBytes, pageCount, JSON.stringify(sourceFiles), safe(content));

  db.prepare('DELETE FROM document_pages WHERE file_hash=?').run(fileHash);
  const ins = db.prepare('INSERT INTO document_pages (file_hash, page_number, text_len, needs_ocr, ocr_used) VALUES (?,?,?,?,?)');
  for (const pg of allPages) {
    ins.run(fileHash, Number(pg.number) || 1, Number(pg.textLen) || 0, pg.needsOcr ? 1 : 0, pg.ocrUsed ? 1 : 0);
  }
}

function persistChunks(fileHash, chunksInfo) {
  if (!Array.isArray(chunksInfo) || !chunksInfo.length) return;
  db.prepare('DELETE FROM document_chunks WHERE file_hash=?').run(fileHash);
  const ins = db.prepare('INSERT INTO document_chunks (file_hash, chunk_index, chunk_total, char_count, page_first, page_last) VALUES (?,?,?,?,?,?)');
  for (const c of chunksInfo) {
    ins.run(fileHash, Number(c.index) || 1, Number(c.total) || 1, Number(c.charCount) || 0, c.pageFirst || null, c.pageLast || null);
  }
}

// ---------- الاستخراج متعدد الملفات (بنفس سيمانتيك التدفق القديم) ----------
async function extractFiles(filePaths, onProgress) {
  let content = '';
  const filesMeta = [];
  const sourceNames = [];
  for (let i = 0; i < filePaths.length; i++) {
    const p = filePaths[i];
    if (!fs.existsSync(p)) throw new Error('أحد الملفات مفقود على الخادم');
    const base = path.basename(p).replace(/^\d+-/, '');
    const ext = path.extname(base).toLowerCase();
    const fileType = /\.(xlsx|xls|csv)$/.test(ext) ? 'xlsx'
      : /\.(docx|doc)$/.test(ext) ? 'docx'
        : /\.(txt|text)$/.test(ext) ? 'text'
          : /\.(png|jpe?g|webp|bmp|gif|tiff?)$/.test(ext) ? 'image'
            : 'pdf';
    const info = await extractDocument(p, fileType, (done, total, msg) => {
      if (typeof onProgress === 'function') onProgress(i + 1, filePaths.length, done, total, msg);
    });
    if (info.text.replace(/\s+/g, '').length < 20) {
      throw new Error(`الملف «${base}» لا يحتوي على نص قابل للقراءة (ربما ممسوح ضوئيًا بصيغة قديمة أو غير مدعومة)`);
    }
    if (filePaths.length > 1) content += (i > 0 ? '\n' : '') + `===== الملف ${i + 1}: ${base} =====\n`;
    content += info.text;
    filesMeta.push({ name: base, pageCount: info.pageCount, ocrPageCount: info.ocrPageCount || 0, pages: info.pages || [] });
    sourceNames.push(base);
  }
  return { content, filesMeta, sourceNames };
}

// ---------- تشغيل وظيفة واحدة ----------
async function runJob(job) {
  const lecture = db.prepare('SELECT * FROM lectures WHERE id = ? AND user_id = ?').get(job.lecture_id, job.user_id);
  if (!lecture) {
    failJob(job.id, job.user_id, job.lecture_id, 'المحاضرة غير موجودة', '');
    return;
  }

  // تقدم رتيب (لا تراجع): نحتفظ بآخر قيمة لإخفاء تداخل مراحل الأنابيب
  let lastPct = 0;
  let lastMsg = '';
  let lastDbWrite = 0;
  let lastStage = 'queued';
  const report = (pct, message, eta) => {
    let out = pct;
    let done = 0;
    const total = job.sections_total || 0;
    // رسائل خط الإنتاج «الجزء X/N»: نعيد تمييز مداها (5-85) إلى النطاق العالمي للتحليل (36-88)
    // لتتحرك النسبة مع أجزاء الملف بدل التجمد عند نطاق التقسيم
    if (message && /الجزء (\d+)\/(\d+)/.test(message)) {
      const m = message.match(/الجزء (\d+)\/(\d+)/);
      done = Math.min((Number(m[1]) || 1) - 1, total);
      out = Math.round(36 + 52 * ((Math.max(0, Math.min(pct, 85)) - 5) / 80));
    } else if (out >= 88 && total > 0) {
      done = total;
    }
    lastPct = Math.max(lastPct, out);
    if (message) lastMsg = message;
    lastStage = stageForPct(lastPct);
    mapProgress(job.user_id, job.lecture_id, job.id, { pct: lastPct, message: lastMsg, eta, stage: lastStage });
    const now = Date.now();
    if (now - lastDbWrite >= DB_WRITE_INTERVAL) {
      lastDbWrite = now;
      writeJobProgress(job.id, { pct: lastPct, message: lastMsg, stage: lastStage, eta, sectionsDone: done });
    }
  };
  report(5, 'التحقق من الملفات وتجهيز التحليل');
  report(10, 'استخراج النص من الملفات');

  // استخراج النص (مع تخزين مؤقت بالهاش لتجنّب إعادة القراءة/OCR)
  const cached = db.prepare('SELECT * FROM documents WHERE file_hash = ?').get(job.file_hash);
  let content = '';
  let filesMeta = [];
  let sourceNames = [];
  if (cached && cached.content && cached.content.replace(/\s+/g, '').length >= 20) {
    content = cached.content;
    report(10, 'استخدام النص المستخرج سابقًا (تخزين مؤقت)');
  } else {
    const paths = parseStoredPaths(lecture.file_path);
    try {
      const res = await extractFiles(paths, (fi, fn, done, total, msg) => {
        // تقدّم الاستخراج ضمن نطاق 10-30%: يتدرج مع الملفات ثم مع صفحات كل ملف
        const fileBase = fn > 0 ? (fi - 1) / fn : 0;
        const pagePart = fn > 0 && total > 0 ? Math.min(done / total, 1) / fn : (fn > 0 ? 1 / fn : 1);
        report(Math.round(10 + 20 * Math.min(1, fileBase + pagePart)), msg);
      });
      content = res.content;
      filesMeta = res.filesMeta;
      sourceNames = res.sourceNames;
    } catch (e) {
      failJob(job.id, job.user_id, job.lecture_id, String(e.message || e), String(e.stack || ''));
      return;
    }
    if (content.replace(/\s+/g, '').length < 20) {
      failJob(job.id, job.user_id, job.lecture_id, 'الملفات لا تحتوي على نص قابل للقراءة', '');
      return;
    }
    persistDocument({
      fileHash: job.file_hash,
      fileName: lecture.file_name || '',
      fileType: lecture.file_type || 'pdf',
      sizeBytes: 0,
      sourceFiles: sourceNames,
      filesMeta,
      content,
      pageCount: filesMeta.reduce((a, f) => a + (f.pageCount || 1), 0),
    });
  }

  db.prepare("UPDATE lectures SET content=?, updated_at=datetime('now') WHERE id=?").run(content, job.lecture_id);

  // تقسيم ذكي مع تخزين وسائط الأجزاء (document_chunks)
  const chunks = chunkContent(annotatePageSplits(content));
  const sectionsTotal = chunks.length;
  report(30, `تقسيم المحتوى إلى ${sectionsTotal} جزء ذكي مع الحفاظ على ترتيب الصفحات والأقسام`);
  db.prepare('UPDATE analysis_jobs SET sections_total=?, updated_at=datetime(\'now\') WHERE id=?').run(sectionsTotal, job.id);

  job.sections_total = sectionsTotal;

  report(35, 'بدء التحليل الذكي للأجزاء (بالتوازي)');
  let result;
  try {
    result = await analyzeLecture(content, lecture.title, (pct, message, eta) => report(pct, message, eta));
  } catch (e) {
    failJob(job.id, job.user_id, job.lecture_id, 'فشل التحليل: ' + String(e.message || e), String(e.stack || ''));
    return;
  }

  report(96, 'حفظ النتائج في قاعدة البيانات');
  let questionCount = 0;
  try {
    questionCount = saveAnalysisResult({ jobId: job.id, lectureId: job.lecture_id, userId: job.user_id, result });
    // أرشيف النتائج لكل وظيفة (تحليل كامل)
    db.prepare('INSERT INTO analysis_results (job_id, lecture_id, file_hash, result_json) VALUES (?,?,?,?)')
      .run(job.id, job.lecture_id, job.file_hash || '', JSON.stringify(result));
    // وسائط الأجزاء (إن وفرها المحرك)
    if (Array.isArray(result.chunksInfo)) persistChunks(job.file_hash, result.chunksInfo);
  } catch (e) {
    failJob(job.id, job.user_id, job.lecture_id, 'تعذر حفظ النتائج: ' + String(e.message || e), String(e.stack || ''));
    return;
  }

  report(100, 'اكتمل التحليل');
  completeJob(job.id, job.lecture_id, job.user_id);
  void questionCount;
}

// ---------- الضخ والمحافظة على الوظائف ----------
function nextDue() {
  // وظيفة واحدة جارية لكل مستخدم كحد أقصى (طلب تقدم واضح في الواجهة وتوازن استهلاك)
  return db.prepare(
    `SELECT * FROM analysis_jobs
     WHERE status = 'queued'
       AND (retry_at IS NULL OR retry_at <= datetime('now'))
       AND user_id NOT IN (SELECT DISTINCT user_id FROM analysis_jobs WHERE status IN ('extracting','chunking','analyzing','generating_questions','quality_review'))
     ORDER BY id ASC LIMIT 1`
  ).get();
}

function staleCrashed() {
  const ts = sqlAt(-STALE_MS);
  db.prepare(
    `UPDATE analysis_jobs SET status='failed', error_message='تعطلت المعالجة (انقطاع في الخادم) — أعد المحاولة', finished_at=datetime('now'), updated_at=datetime('now')
     WHERE status IN ('extracting','chunking','analyzing','generating_questions','quality_review') AND updated_at <= ?`
  ).run(ts);
}

async function pump() {
  if (ticking) return;
  ticking = true;
  try {
    while (running < WORKER_CONCURRENCY) {
      const job = nextDue();
      if (!job) break;
      db.prepare("UPDATE analysis_jobs SET status='extracting', started_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(job.id);
      running++;
      runJob({ ...job, status: 'extracting', max_attempts: job.max_attempts || MAX_ATTEMPTS })
        .catch((e) => failJob(job.id, job.user_id, job.lecture_id, 'خطأ غير متوقع في المعالج: ' + String(e.message || e), String(e.stack || '')))
        .finally(() => { running--; pump(); });
    }
  } finally {
    ticking = false;
  }
}

// ---------- إعادة الجدولة عند الإقلاع + تشغيل العامل ----------
export function recoverUnfinishedJobs() {
  db.prepare(
    `UPDATE analysis_jobs SET status='queued', started_at=NULL, error_message='أُعيدت جدولتها بعد إعادة تشغيل الخادم', updated_at=datetime('now')
     WHERE status IN ('extracting','chunking','analyzing','generating_questions','quality_review')`
  ).run();
  // إعادة أي وظيفة مكتملة لفظيًا لكن محاضرة قديمة اكتفت: لا حاجة
}

export function startWorker() {
  recoverUnfinishedJobs();
  setInterval(() => { staleCrashed(); pump(); }, 10000);
  pump();
}