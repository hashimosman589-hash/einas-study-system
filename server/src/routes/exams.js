import { Router } from 'express';
import db from '../db.js';
import { auth } from '../lib/auth.js';
import { generateExamFromLecture, distributeExam } from '../lib/ai.js';
import { weakTopicNames } from '../lib/weak.js';

const router = Router();
router.use(auth);

function gatherQuestions(userId) {
  // أسئلة الاختبار: MCQ وصح/خطأ فقط (نستبعد نوع القراءة qa)
  return db.prepare('SELECT * FROM questions WHERE user_id = ? AND type IN (?, ?)').all(userId, 'mcq', 'truefalse');
}

// نقاط ضعف الطالب التراكمية عبر كل النتائج والمحاضرات (لترجيحها في التوليد والتوزيع)
const weakTopics = (userId, limit = 8) => weakTopicNames(userId, limit);

// بيانات الربط: كل المحاضرات الجاهزة من المكتبة المشتركة (مع معلومات تحليلها وملخصاتها)
router.get('/sources', (req, res) => {
  const lectures = db.prepare("SELECT * FROM lectures WHERE status = 'ready' ORDER BY created_at DESC").all();
  const sources = lectures.map((lec) => {
    const summary = db.prepare('SELECT * FROM summaries WHERE lecture_id = ?').get(lec.id);
    let summaryText = '';
    let reviewTopics = [];
    let keyPoints = [];
    let importantTerms = [];
    if (summary) {
      summaryText = summary.summary || '';
      try { keyPoints = JSON.parse(summary.key_points || '[]'); } catch {}
      try { reviewTopics = JSON.parse(summary.review_topics || '[]'); } catch {}
      try { importantTerms = JSON.parse(summary.important_terms || '[]'); } catch {}
    }
    const rows = db.prepare('SELECT type, COUNT(*) as c FROM questions WHERE lecture_id = ? GROUP BY type').all(lec.id);
    const counts = { mcq: 0, truefalse: 0, qa: 0 };
    rows.forEach((r) => { if (counts[r.type] !== undefined) counts[r.type] = r.c; });
    return {
      id: lec.id,
      title: lec.title,
      subject: lec.subject,
      status: lec.status,
      createdAt: lec.created_at,
      summaryExcerpt: (summaryText || '').slice(0, 220),
      reviewTopics: reviewTopics.slice(0, 6),
      keyPoints: keyPoints.slice(0, 4),
      importantTerms: importantTerms.slice(0, 6),
      mcqCount: counts.mcq,
      tfCount: counts.truefalse,
      qaCount: counts.qa,
      totalCount: counts.mcq + counts.truefalse,
    };
  });
  res.json(sources);
});

// نقاط الضعف التراكمية لتبويزها في واجهة الطالب
router.get('/weak-focus', (req, res) => {
  res.json({ topics: weakTopicNames(req.user.id, 6), recent: weakTopicNames(req.user.id, 8) });
});

// إنشاء اختبار من محاضرات محددة أو من كل المحاضرات
router.post('/generate', async (req, res) => {
  const { lectureIds, count = 10, duration = 15, mode = 'smart' } = req.body || {};
  let pool = [];
  const generationSource = mode === 'smart' ? 'ai-summary' : 'stored';
  const weakTopics = weakTopicNames(req.user.id, 8);

  // [الوضع الذكي] توليد أسئلة من محتوى الملف + الملخص عبر الذكاء الاصطناعي
  if (mode === 'smart' && Array.isArray(lectureIds) && lectureIds.length) {
    const insertQ = db.prepare('INSERT INTO questions (lecture_id, user_id, text, type, options, correct_answer, explanation, topic, question_en, question_ar, answer_en, answer_ar, difficulty, page) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const per = Math.max(2, Math.ceil(count / lectureIds.length));
    let freshly = [];
    db.exec('BEGIN');
    try {
      for (const lid of lectureIds) {
        // المكتبة المشتركة: أي محاضرة جاهزة يمكن التذاكر منها بغض النظر عن مالكها
        const lec = db.prepare("SELECT * FROM lectures WHERE id = ? AND status = 'ready'").get(lid);
        if (!lec) continue;
        const summary = db.prepare('SELECT * FROM summaries WHERE lecture_id = ?').get(lid);
        const result = await generateExamFromLecture(lec.content || '', summary || null, lec.title, per, weakTopics);
        for (const q of result.questions || []) {
          const info = insertQ.run(
            lid, req.user.id, q.text, q.type, q.options ? JSON.stringify(q.options) : null,
            String(q.correctAnswer ?? q.correct ?? ''), q.explanation || '', q.topic || '',
            q.questionEn ?? null, q.questionAr ?? null, q.answerEn ?? null, q.answerAr ?? null,
            q.difficulty || 'medium', q.page || ''
          );
          freshly.push({ ...q, id: Number(info.lastInsertRowid), lecture_id: lid });
        }
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    if (freshly.length) {
      pool = freshly;
    } else {
      const placeholders = lectureIds.map(() => '?').join(',');
      pool = db.prepare(`SELECT * FROM questions WHERE lecture_id IN (${placeholders}) AND type IN ('mcq','truefalse')`).all(...lectureIds);
    }
  } else if (Array.isArray(lectureIds) && lectureIds.length) {
    const placeholders = lectureIds.map(() => '?').join(',');
    pool = db
      .prepare(`SELECT * FROM questions WHERE lecture_id IN (${placeholders}) AND type IN ('mcq','truefalse')`)
      .all(...lectureIds);
  } else {
    pool = gatherQuestions(req.user.id);
  }

  // إن كان المخزون قليلًا واخترنا كل المحاضرات، نولّد من المحتوى عبر AI
  if (pool.length < count * 2 && !(Array.isArray(lectureIds) && lectureIds.length)) {
    const lectures = db.prepare("SELECT * FROM lectures WHERE status = 'ready' ORDER BY created_at DESC").all();
    const insertQ = db.prepare('INSERT INTO questions (lecture_id, user_id, text, type, options, correct_answer, explanation, topic, question_en, question_ar, answer_en, answer_ar, difficulty, page) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const lec of lectures) {
      const summary = db.prepare('SELECT * FROM summaries WHERE lecture_id = ?').get(lec.id);
      const result = await generateExamFromLecture(lec.content || '', summary || null, lec.title, Math.max(4, Math.ceil(count / lectures.length)), weakTopics);
      for (const q of result.questions || []) {
        insertQ.run(lec.id, req.user.id, q.text, q.type, q.options ? JSON.stringify(q.options) : null, String(q.correctAnswer ?? q.correct ?? ''), q.explanation || '', q.topic || '', null, null, null, null, q.difficulty || 'medium', q.page || '');
      }
    }
    pool = gatherQuestions(req.user.id); // إعادة جلب بمعرّفات حقيقية من قاعدة البيانات
  }

  // توزيع ذكي: تغطية الموضوعات + توازن أنواع الأسئلة + ترجيح نقاط الضعف + منع التكرار (لا توزيع عشوائي فارغ)
  const shuffled = distributeExam(pool, count, weakTopics);
  if (!shuffled.length) return res.status(400).json({ error: 'لا توجد أسئلة كافية. أضف محاضرات أولًا.' });

  const info = db
    .prepare('INSERT INTO exams (user_id, title, question_count, duration_minutes) VALUES (?,?,?,?)')
    .run(req.user.id, `اختبار ${'#' + Date.now().toString().slice(-4)}`, shuffled.length, duration);
  const examId = Number(info.lastInsertRowid);
  const ins = db.prepare('INSERT INTO exam_questions (exam_id, question_id) VALUES (?,?)');
  db.exec('BEGIN');
  try {
    shuffled.forEach((q) => ins.run(examId, q.id));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  res.json({ examId, questions: shuffled.map((q) => {
    let opts = q.options;
    if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch { opts = null; } }
    return { id: q.id, text: q.text, type: q.type, options: opts, topic: q.topic, lecture_id: q.lecture_id };
  }), title: `اختبار ${'#' + Date.now().toString().slice(-4)}`, duration, generationSource });
});

router.get('/', (req, res) => {
  const exams = db.prepare('SELECT * FROM exams WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(exams);
});

router.get('/:id', (req, res) => {
  // تُستخدم لاحقًا لعرض الاختبار
  const exam = db.prepare('SELECT * FROM exams WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!exam) return res.status(404).json({ error: 'غير موجود' });
  res.json(exam);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM exams WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
