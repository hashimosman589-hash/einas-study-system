import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import db from '../db.js';
import { auth } from '../lib/auth.js';
import { enqueueAnalysis, deleteJobsForLecture, latestJobForUser } from '../lib/jobs.js';
import { analysisProgress } from '../lib/jobs.js';
import { dataDir } from '../lib/dataDir.js';

export { analysisProgress };

const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_EXTS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.text', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tif', '.tiff'];

const storage = multer.diskStorage({
  destination: (_req, _f, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = Date.now() + '-' + file.originalname.replace(/[^\w.\-\u0600-\u06FF ]/g, '_');
    cb(null, safe);
  },
});
const upload = multer({ storage, limits: { fileSize: 30 * 1024 * 1024 } });

const router = Router();
router.use(auth);

// يحوّل مسارات الملفات المخزنة (JSON أو مسار مفرد) ويحذفها إن وُجدت
function unlinkStored(paths) {
  if (!paths) return;
  let list = [];
  try { list = JSON.parse(paths); } catch { list = [paths]; }
  if (!Array.isArray(list)) list = [paths];
  for (const p of list) {
    if (typeof p === 'string' && p && fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
}

// SHA-256 للملف (بقراءة متدفقة دون تحميل كامل للذاكرة)
function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(p);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

// هاش موحّد لمجموعة ملفات (ترتيب مستقل — نفس المجموعة = نفس الهاش)
async function combinedHash(paths) {
  const hashes = [];
  for (const p of paths) hashes.push(await sha256File(p));
  if (hashes.length === 1) return hashes[0];
  return crypto.createHash('sha256').update(hashes.sort().join(':')).digest('hex');
}

// نسخ نتيجة تحليل سابقة إلى محاضرة جديدة (استخدام التخزين المؤقت للملف المكرر)
function cloneLectureFromCache(cached, { userId, title, subject, storeNames, storePaths, fileType, hash }) {
  db.exec('BEGIN');
  let newId = null;
  try {
    const info = db.prepare(
      `INSERT INTO lectures (user_id, title, subject, file_name, file_path, file_type, content, status, file_hash, progress, current_stage, updated_at)
       VALUES (?,?,?,?,?,?,?,'ready',?,100,'completed',datetime('now'))`
    ).run(userId, title, subject, storeNames, storePaths, fileType, cached.content || '', hash);
    newId = Number(info.lastInsertRowid);
    db.prepare(`INSERT INTO summaries (lecture_id, user_id, summary, key_points, important_terms, review_topics)
                SELECT ?, user_id, summary, key_points, important_terms, review_topics FROM summaries WHERE lecture_id = ?`)
      .run(newId, cached.id);
    db.prepare(`INSERT INTO questions (lecture_id, user_id, text, type, options, correct_answer, explanation, topic, question_en, question_ar, answer_en, answer_ar, difficulty, page)
                SELECT ?, user_id, text, type, options, correct_answer, explanation, topic, question_en, question_ar, answer_en, answer_ar, difficulty, page FROM questions WHERE lecture_id = ?`)
      .run(newId, cached.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  const questionCount = db.prepare('SELECT COUNT(*) AS c FROM questions WHERE lecture_id = ?').get(newId).c;
  return { newId, questionCount };
}

// التقدم: يقرأ أحدث وظيفة للمستخدم من قاعدة البيانات (تنجو من إعادة تشغيل الخادم).
// عند تمرير ?lectureId= يُعيد وظيفة تلك المحاضرة تحديدًا (لا يختلط التقدم بين الملفات).
router.get('/analysis-status', (req, res) => {
  const lectureId = req.query.lectureId ? Number(req.query.lectureId) : null;
  res.json(latestJobForUser(req.user.id, Number.isFinite(lectureId) ? lectureId : null));
});

// المكتبة المشتركة: كل المستخدمين يرون كل المحاضرات (الجاهزة وغيرها) بغض النظر عن مالكها
// ?deleted=1 (مدير فقط) يعرض سلة المحذوفات لاسترجاعها
router.get('/', (req, res) => {
  const showDeleted = req.query.deleted === '1';
  if (showDeleted && !req.user.isAdmin) return res.status(403).json({ error: 'غير مسموح' });
  const rows = db
    .prepare(`
      SELECT l.*, u.name AS owner_name, u.username AS owner_username
      FROM lectures l JOIN users u ON u.id = l.user_id
      ${showDeleted ? 'WHERE l.deleted_at IS NOT NULL' : 'WHERE l.deleted_at IS NULL'}
      ORDER BY l.created_at DESC
    `)
    .all();
  // إرفاق علم الملكية ليساعد الواجهة في إظهار الحذف للمدير فقط
  rows.forEach((r) => { r.owner = r.user_id === req.user.id ? true : false; });
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const lec = db
    .prepare('SELECT * FROM lectures WHERE id = ?')
    .get(req.params.id);
  if (!lec) return res.status(404).json({ error: 'غير موجود' });
  const summary = db.prepare('SELECT * FROM summaries WHERE lecture_id = ?').get(lec.id);
  const questions = db.prepare('SELECT * FROM questions WHERE lecture_id = ?').all(lec.id);
  res.json({ lecture: lec, summary, questions });
});

// الرفع يعود فورًا: يُحفظ الملف + الهاش، يُكتشف المكرر (تخزين مؤقت)، ثم تُسلَّم
// الوظيفة للمعالجة الخلفية (استخراج + تحليل AI) دون انتظار في طلب HTTP.
router.post('/', upload.fields([{ name: 'files', maxCount: 10 }, { name: 'file', maxCount: 1 }]), async (req, res) => {
  const fileArray = (req.files && req.files.files) || [];
  if (req.files && req.files.file) fileArray.push(req.files.file[0]);
  const { title, subject } = req.body || {};
  if (!fileArray.length) return res.status(400).json({ error: 'يرجى رفع ملف واحد على الأقل' });

  // التحقق السريع من الصيغة قبل أي معالجة
  for (const f of fileArray) {
    const ext = path.extname(f.originalname).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      return res.status(400).json({ error: `صيغة «${f.originalname}» غير مدعومة. الصيغ المسموحة: PDF / Word / Excel / نص / صور` });
    }
  }

  let hash;
  try {
    hash = await combinedHash(fileArray.map((f) => f.path));
  } catch {
    return res.status(500).json({ error: 'تعذر حساب بصمة الملف' });
  }

  // إعادة استخدام نتيجة تحليل سابقة لنفس الملف (لا تحليل مزدوج)
  const cached = db.prepare("SELECT * FROM lectures WHERE user_id = ? AND file_hash = ? AND status = 'ready' ORDER BY id DESC LIMIT 1")
    .get(req.user.id, hash);
  if (cached && cached.content) {
    const first = fileArray[0];
    const lecTitle = title || path.basename(first.originalname, path.extname(first.originalname));
    const storePaths = fileArray.length > 1 ? JSON.stringify(fileArray.map((x) => x.path)) : first.path;
    const storeNames = fileArray.length > 1
      ? `${path.basename(first.originalname, path.extname(first.originalname))} + ${fileArray.length - 1} ملفات`
      : first.originalname;
    const fileType = fileArray.length > 1 ? 'multi' : (() => {
      const ext = path.extname(first.originalname).toLowerCase();
      return /\.(png|jpe?g|webp|bmp|gif|tiff?)$/.test(ext) ? 'image' : /\.(txt|text)$/.test(ext) ? 'text' : ext.replace('.', '');
    })();
    try {
      const cloned = cloneLectureFromCache(cached, { userId: req.user.id, title: lecTitle, subject: subject || '', storeNames, storePaths, fileType, hash });
      return res.json({ id: cloned.newId, status: 'ready', cached: true, questionCount: cloned.questionCount, message: 'تم استخدام النتيجة المحفوظة من تحليل سابق لنفس الملف' });
    } catch {
      // تعذّر النسخ: نواصل كتحليل جديد
    }
  }

  const first = fileArray[0];
  const lecTitle = title || path.basename(first.originalname, path.extname(first.originalname));
  const storePaths = fileArray.length > 1 ? JSON.stringify(fileArray.map((x) => x.path)) : first.path;
  const storeNames = fileArray.length > 1
    ? `${path.basename(first.originalname, path.extname(first.originalname))} + ${fileArray.length - 1} ملفات`
    : first.originalname;
  const fileType = fileArray.length > 1 ? 'multi' : (() => {
    const ext = path.extname(first.originalname).toLowerCase();
    return /\.(png|jpe?g|webp|bmp|gif|tiff?)$/.test(ext) ? 'image' : /\.(txt|text)$/.test(ext) ? 'text' : ext.replace('.', '');
  })();

  const info = db.prepare(
    `INSERT INTO lectures (user_id, title, subject, file_name, file_path, file_type, content, status, file_hash, progress, current_stage, updated_at)
     VALUES (?,?,?,?,?,?,'','processing',?,0,'queued',datetime('now'))`
  ).run(req.user.id, lecTitle, subject || '', storeNames, storePaths, fileType, hash);
  const id = Number(info.lastInsertRowid);

  // تسليم وظيفة المعالجة للعامل الخلفي — الاستجابة فورية
  const jobId = enqueueAnalysis({ userId: req.user.id, lectureId: id, fileHash: hash });
  res.json({ id, jobId, status: 'queued', message: 'تم رفع الملف بنجاح — جارٍ التحليل في الخلفية' });
});

// إعادة محاولة تحليل محاضرة فشلت دون إعادة رفع الملف (متاحة من المكتبة المشتركة)
router.post('/:id/retry', (req, res) => {
  const lec = db.prepare('SELECT * FROM lectures WHERE id = ?').get(req.params.id);
  if (!lec) return res.status(404).json({ error: 'غير موجود' });
  const hasSummary = db.prepare('SELECT COUNT(*) AS c FROM summaries WHERE lecture_id = ?').get(lec.id).c > 0;
  if (lec.status === 'ready' && hasSummary) {
    return res.json({ ok: true, id: lec.id, status: 'ready', message: 'المحاضرة محللة بالفعل' });
  }
  const hash = lec.file_hash || '';
  db.prepare(
    `UPDATE lectures SET status='processing', progress=0, current_stage='queued', error_message=NULL, updated_at=datetime('now') WHERE id=?`
  ).run(lec.id);
  const jobId = enqueueAnalysis({ userId: lec.user_id, lectureId: lec.id, fileHash: hash });
  res.json({ ok: true, id: lec.id, jobId, status: 'queued', message: 'أُعيدت جدولة التحليل' });
});

// حذف المحاضرة من المكتبة المشتركة: صلاحية المدير فقط.
// حذف ناعم: تُعلَّم المحاضرة محذوفة ويبقى الملف والأسئلة في القاعدة، ويمكن استرجاعها
router.delete('/:id', (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'غير مسموح — صلاحية المدير مطلوبة للحذف من المكتبة' });
  const lec = db.prepare('SELECT * FROM lectures WHERE id = ?').get(req.params.id);
  if (!lec) return res.status(404).json({ error: 'غير موجود' });
  deleteJobsForLecture(lec.user_id, lec.id);
  if (analysisProgress.has(lec.user_id) && analysisProgress.get(lec.user_id).lectureId === lec.id) {
    analysisProgress.delete(lec.user_id);
  }
  db.prepare(`UPDATE lectures SET deleted_at = datetime('now') WHERE id = ?`).run(req.params.id);
  res.json({ ok: true, soft: true });
});

// استرجاع محاضرة من سلة المحذوفات: صلاحية المدير فقط
router.post('/:id/restore', (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'غير مسموح — صلاحية المدير مطلوبة للاسترجاع' });
  const lec = db.prepare('SELECT * FROM lectures WHERE id = ?').get(req.params.id);
  if (!lec) return res.status(404).json({ error: 'غير موجود' });
  db.prepare(`UPDATE lectures SET deleted_at = NULL WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

export default router;