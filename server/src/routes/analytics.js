import { Router } from 'express';
import db from '../db.js';
import { auth } from '../lib/auth.js';
import { collectWeakStats, reviewSchedule } from '../lib/weak.js';

const router = Router();
router.use(auth);

router.get('/dashboard', (req, res) => {
  const userId = req.user.id;

  const lectureCount = db.prepare('SELECT COUNT(*) c FROM lectures').get().c;
  const readyCount = db.prepare("SELECT COUNT(*) c FROM lectures WHERE status = 'ready'").get().c;
  const examCount = db.prepare('SELECT COUNT(*) c FROM exams WHERE user_id = ?').get(userId).c;
  const questionCount = db.prepare('SELECT COUNT(*) c FROM questions').get().c;

  const results = db.prepare('SELECT * FROM results WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  const avgScore = results.length ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / results.length) : 0;
  const bestScore = results.length ? Math.max(...results.map((r) => r.percentage)) : 0;

  // نسبة الإنجاز: محاضرات جاهزة محللة من إجمالي المكتبة + اختبارات منجزة إلي متوسط
  const completion = lecturesTarget();
  const progressPct = completion;

  // نقاط الضعف التراكمية عبر كل النتائج (ذاكرة الطالب عبر المحاضرات)
  const weakTopics = collectWeakStats(userId).slice(0, 5).map((s) => ({
    topic: s.topic,
    count: s.wrong,
    attempts: s.attempts,
    accuracy: s.attempts ? Math.round((1 - s.wrong / s.attempts) * 100) : 0,
    lastAt: s.lastAt,
  }));

  // جدولة المراجعة المتباعدة
  const dueReviews = reviewSchedule(userId);

  const recent = results.slice(0, 5).map((r) => ({ id: r.id, examId: r.exam_id, score: r.score, total: r.total, percentage: r.percentage, createdAt: r.created_at }));

  res.json({
    lectureCount,
    readyCount,
    examCount,
    questionCount,
    avgScore,
    bestScore,
    weakTopics,
    dueReviews,
    recent,
    resultsHistory: results.map((r) => ({ id: r.id, percentage: r.percentage, createdAt: r.created_at })),
    progressPct,
  });
});

function lecturesTarget() {
  const total = db.prepare('SELECT COUNT(*) c FROM lectures').get().c;
  const ready = db.prepare("SELECT COUNT(*) c FROM lectures WHERE status = 'ready'").get().c;
  if (!total) return 0;
  return Math.round((ready / total) * 100);
}

export default router;
