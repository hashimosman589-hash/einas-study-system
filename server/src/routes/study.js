import { Router } from 'express';
import db from '../db.js';
import { auth } from '../lib/auth.js';
import { reviewSchedule } from '../lib/weak.js';

const router = Router();
router.use(auth);

function fmt(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(dayStr, n) {
  const [y, m, d] = dayStr.split('-').map(Number);
  return fmt(new Date(y, m - 1, d + n));
}

const WINDOW = 7;

function getJSON(userId, type, key) {
  const row = db.prepare("SELECT value FROM analytics WHERE user_id = ? AND type = ? AND key = ?").get(userId, type, key);
  if (!row || !row.value) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}
function setJSON(userId, type, key, val) {
  const exists = db.prepare('SELECT 1 FROM analytics WHERE user_id = ? AND type = ? AND key = ?').get(userId, type, key);
  if (exists) {
    db.prepare('UPDATE analytics SET value = ? WHERE user_id = ? AND type = ? AND key = ?').run(JSON.stringify(val), userId, type, key);
  } else {
    db.prepare('INSERT INTO analytics (user_id, type, key, value) VALUES (?,?,?,?)').run(userId, type, key, JSON.stringify(val));
  }
}

// بناء مهام يوم محدد (حتمي من البيانات الحالية)
function buildTasksForDay(userId, dayIdx) {
  const tasks = [];
  // مراجعة متباعدة: أسوأ المواضيع أولًا، موزعة على 7 أيام
  const sched = reviewSchedule(userId);
  sched.forEach((s, i) => {
    if (Math.min(i, WINDOW - 1) !== dayIdx) return;
    tasks.push({ id: `rev:${s.topic}`, kind: 'review', topic: s.topic, wrong: s.wrong, label: `راجع «${s.topic}»`, link: `/review?start=${encodeURIComponent(s.topic)}` });
  });
  // مادة جديدة: محاضرة واحدة مذاكرة يوميًا (توزيع دائري) من المكتبة المشتركة
  const ready = db.prepare("SELECT * FROM lectures WHERE status = 'ready' ORDER BY created_at DESC").all();
  ready.forEach((lec, i) => {
    if (i % WINDOW === dayIdx) {
      tasks.push({ id: `study:${lec.id}`, kind: 'study', lectureId: lec.id, label: `ادرس ملخص «${lec.title}»`, link: '/summaries' });
    }
  });
  // تدريب يومي
  tasks.push({ id: 'practice', kind: 'practice', label: 'حل اختبارًا ذكيًا (10 أسئلة)', link: '/exams' });
  return tasks;
}

function markDone(userId, date, tasks) {
  for (const t of tasks) {
    const c = db.prepare("SELECT value FROM analytics WHERE user_id = ? AND type = 'study' AND key = ?").get(userId, `c:${date}:${t.id}`);
    t.done = Boolean(c && c.value === '1');
  }
  return tasks;
}

function calcStreak(userId, today) {
  const rows = db.prepare("SELECT key, value FROM analytics WHERE user_id = ? AND type = 'study' AND key LIKE 'day:%'").all(userId);
  const ratio = new Map();
  for (const r of rows) {
    const date = (r.key || '').replace('day:', '');
    if (!date) continue;
    let tasks = [];
    try { tasks = JSON.parse(r.value || '[]'); } catch {}
    if (!tasks.length) continue;
    const done = tasks.filter((t) => {
      const c = db.prepare("SELECT value FROM analytics WHERE user_id = ? AND type = 'study' AND key = ?").get(userId, `c:${date}:${t.id}`);
      return c && c.value === '1';
    }).length;
    ratio.set(date, done / tasks.length);
  }
  let streak = 0;
  let cursor = ratio.get(today) >= 0.5 ? today : addDays(today, -1);
  while (ratio.get(cursor) !== undefined && ratio.get(cursor) >= 0.5) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function planFor(userId) {
  const today = fmt(new Date());
  const days = [];
  for (let d = 0; d < WINDOW; d++) {
    const date = addDays(today, d);
    let tasks = getJSON(userId, 'study', `day:${date}`);
    if (!tasks || !Array.isArray(tasks) || !tasks.length) {
      tasks = buildTasksForDay(userId, d);
      setJSON(userId, 'study', `day:${date}`, tasks);
    }
    tasks = markDone(userId, date, tasks);
    days.push({ date, isToday: d === 0, tasks, doneCount: tasks.filter((t) => t.done).length });
  }
  const settings = getJSON(userId, 'study', 'settings') || {};
  const todayDay = days[0];
  return {
    todayDate: today,
    days,
    streak: calcStreak(userId, today),
    settings,
    weakTotal: reviewSchedule(userId).length,
    todayDone: todayDay.doneCount,
    todayTotal: todayDay.tasks.length,
  };
}

router.get('/plan', (req, res) => res.json(planFor(req.user.id)));

router.post('/complete', (req, res) => {
  const { date, taskId, done } = req.body || {};
  if (!date || !taskId) return res.status(400).json({ error: 'بيانات غير مكتملة' });
  setJSON(req.user.id, 'study', `c:${date}:${taskId}`, done ? 1 : 0);
  res.json(planFor(req.user.id));
});

router.post('/settings', (req, res) => {
  const cur = getJSON(req.user.id, 'study', 'settings') || {};
  const merged = { ...cur, ...(req.body || {}) };
  setJSON(req.user.id, 'study', 'settings', merged);
  res.json(merged);
});

export default router;