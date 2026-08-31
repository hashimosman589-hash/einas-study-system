import { Router } from 'express';
import db from '../db.js';
import { auth } from '../lib/auth.js';
import { analyzeWrongAnswers } from '../lib/ai.js';

const router = Router();
router.use(auth);

function gradeResult(userId, answers, examId) {
  const correctByQid = {};
  const lectureContent = {};

  // جمع الإجابات الصحيحة من قاعدة الأسئلة
  for (const a of answers) {
    const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(a.questionId);
    if (q) correctByQid[a.questionId] = q.correct_answer;
  }

  let score = 0;
  const wrongItems = [];
  const detail = answers.map((a) => {
    const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(a.questionId);
    const correct = String(correctByQid[a.questionId]).trim();
    const userAns = String(a.answer == null ? '' : a.answer).trim();
    const isCorrect = userAns === correct;
    if (isCorrect) score += 1;
    else if (q) wrongItems.push({ topic: q.topic, question: q.text, correct: q.correct_answer, explanation: q.explanation });
    return {
      questionId: a.questionId,
      text: q ? q.text : '',
      topic: q ? q.topic : '',
      userAnswer: a.answer,
      correctAnswer: correct,
      isCorrect,
      explanation: q ? q.explanation : '',
    };
  });

  const total = answers.length;
  const percentage = total ? Math.round((score / total) * 100) : 0;

  return { score, total, percentage, detail, wrongItems };
}

router.post('/submit', async (req, res) => {
  const { examId, answers, startedAt, skipAi = false } = req.body || {};
  if (!Array.isArray(answers) || !answers.length) return res.status(400).json({ error: 'لا توجد إجابات' });

  const graded = gradeResult(req.user.id, answers, examId);

  const info = db
    .prepare('INSERT INTO results (user_id, exam_id, score, total, percentage, answers, started_at, finished_at) VALUES (?,?,?,?,?,?,?,datetime(\'now\'))')
    .run(req.user.id, examId || null, graded.score, graded.total, graded.percentage, JSON.stringify(graded.detail), startedAt || null);

  const resultId = Number(info.lastInsertRowid);

  // توصيات AI — تحليل كامل للأداء: قوة/ضعف/مواضيع مراجعة
  let recommendations = [];
  let source = 'none';
  let strengths = [];
  let weaknesses = [];
  let reviewTopics = [];
  let revisionPlan = [];
  let mastery = null;
  let skillLevels = null;
  let recap = '';
  if (graded.wrongItems.length && !skipAi) {
    // استخدام محتوى المحاضرة المرتبطة بأول سؤال خاطئ (من المكتبة المشتركة)
    const firstQ = db.prepare('SELECT lecture_id FROM questions WHERE id = ?').get((answers[0] && answers[0].questionId));
    const lecture = firstQ && firstQ.lecture_id
      ? db.prepare('SELECT * FROM lectures WHERE id = ?').get(firstQ.lecture_id)
      : db.prepare("SELECT * FROM lectures WHERE status = 'ready' ORDER BY created_at DESC LIMIT 1").get();
    const content = lecture ? lecture.content : '';
    const rec = await analyzeWrongAnswers(content, lecture ? lecture.title : '', graded.wrongItems, graded);
    recommendations = rec.recommendations || [];
    strengths = rec.strengths || [];
    weaknesses = rec.weaknesses || [];
    reviewTopics = rec.reviewTopics || [];
    revisionPlan = rec.revisionPlan || [];
    mastery = rec.mastery || null;
    skillLevels = rec.skillLevels || null;
    recap = rec.recap || '';
    source = rec.source || 'local';
  }

  // حفظ التحليل
  db.prepare('INSERT INTO analytics (user_id, type, key, value) VALUES (?,?,?,?)')
    .run(req.user.id, 'result', String(resultId), JSON.stringify({ percentage: graded.percentage, score: graded.score, total: graded.total }));
  // حفظ التوصيات والتحليل الكامل
  db.prepare('INSERT INTO analytics (user_id, type, key, value) VALUES (?,?,?,?)')
    .run(req.user.id, 'recommendations', String(resultId), JSON.stringify({ recommendations, source, strengths, weaknesses, reviewTopics, recap, revisionPlan, mastery, skillLevels }));

  res.json({ resultId, ...graded, recommendations, recSource: source, strengths, weaknesses, reviewTopics, revisionPlan, mastery, skillLevels, recap });
});

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT r.*, e.title AS exam_title FROM results r LEFT JOIN exams e ON e.id = r.exam_id WHERE r.user_id = ? ORDER BY r.created_at DESC')
    .all(req.user.id);
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const r = db.prepare('SELECT r.*, e.title AS exam_title FROM results r LEFT JOIN exams e ON e.id = r.exam_id WHERE r.id = ? AND r.user_id = ?').get(req.params.id, req.user.id);
  if (!r) return res.status(404).json({ error: 'غير موجود' });
  r.answers = r.answers ? JSON.parse(r.answers) : [];
  const recRow = db.prepare('SELECT value FROM analytics WHERE user_id = ? AND type = ? AND key = ?').get(req.user.id, 'recommendations', String(r.id));
  let recommendations = [];
  let recSource = 'none';
  if (recRow && recRow.value) {
    try {
      const parsed = JSON.parse(recRow.value);
      recommendations = parsed.recommendations || [];
      recSource = parsed.source || 'none';
    } catch {}
  }
  // استخراج نقاط الضعف من الإجابات الخاطئة
  const wrong = (r.answers || []).filter((a) => !a.isCorrect);
  res.json({ ...r, wrongCount: wrong.length, wrongAnswers: wrong, recommendations, recSource });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM results WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
