import { Router } from 'express';
import db from '../db.js';
import { auth } from '../lib/auth.js';
import { reviewSchedule } from '../lib/weak.js';

const router = Router();
router.use(auth);

function topicQuestions(userId, topic, limit) {
  const like = `%${String(topic).trim()}%`;
  return db
    .prepare(`SELECT * FROM questions WHERE user_id = ? AND type IN ('mcq','truefalse') AND (topic LIKE ? OR text LIKE ?) ORDER BY RANDOM() LIMIT ?`)
    .all(userId, like, like, limit);
}

function countTopicQuestions(userId, topic) {
  const like = `%${String(topic).trim()}%`;
  return db
    .prepare(`SELECT COUNT(*) c FROM questions WHERE user_id = ? AND type IN ('mcq','truefalse') AND (topic LIKE ? OR text LIKE ?)`)
    .get(userId, like, like).c;
}

// طوابير المراجعة المستحقة حسب جدولة الأخطاء التراكمية
router.get('/queue', (req, res) => {
  const sched = reviewSchedule(req.user.id);
  const withCounts = sched.map((s) => ({ ...s, available: countTopicQuestions(req.user.id, s.topic) }));
  const due = withCounts
    .filter((s) => s.available > 0)
    .sort((a, b) => (a.dueInDays - b.dueInDays) || (b.available - a.available));
  const empty = withCounts.filter((s) => s.available === 0);
  res.json({ due, empty, total: due.length + empty.length });
});

// بدء جلسة مراجعة على شكل بطاقات من الأسئلة المحفوظة لموضوع محدد
router.post('/session', (req, res) => {
  const { topic, count = 6 } = req.body || {};
  const clean = String(topic || '').trim();
  if (!clean) return res.status(400).json({ error: 'حدد الموضوع للمراجعة' });

  const picked = topicQuestions(req.user.id, clean, Math.min(10, Math.max(3, Number(count) || 6)));
  if (!picked.length) {
    return res.status(400).json({ error: 'لا توجد أسئلة عن هذا الموضوع بعد. أضف محاضرة محلّلة أو أنشئ اختبارًا أولًا.' });
  }

  const info = db
    .prepare('INSERT INTO exams (user_id, title, question_count, duration_minutes) VALUES (?,?,?,?)')
    .run(req.user.id, `مراجعة: ${clean}`, picked.length, 10);
  const examId = Number(info.lastInsertRowid);
  const ins = db.prepare('INSERT INTO exam_questions (exam_id, question_id) VALUES (?,?)');
  db.exec('BEGIN');
  try {
    picked.forEach((q) => ins.run(examId, q.id));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  res.json({
    examId,
    topic: clean,
    questions: picked.map((q) => {
      let opts = q.options;
      if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch { opts = null; } }
      return { id: q.id, text: q.text, type: q.type, options: opts, topic: q.topic, correctAnswer: q.correct_answer, explanation: q.explanation };
    }),
    duration: 10,
  });
});

export default router;