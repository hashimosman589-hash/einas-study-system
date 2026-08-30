import { Router } from 'express';
import db from '../db.js';
import { auth } from '../lib/auth.js';
import { applySm2, buildCardFromQuestion, validGrade, stateLabel } from '../lib/sm2.js';

// بطاقات SM-2 (التكرار المتباعد) — تُبنى تلقائيًا من بنك الأسئلة
const router = Router();
router.use(auth);

const CARD_SOURCES = "type IN ('mcq','truefalse','qa')";

// يضمن وجود بطاقة لكل سؤال صالح لدى المستخدم حتى لا يلتقط الأثر بالبطاقات الجديدة
function syncCards(userId) {
  const rows = db
    .prepare(`SELECT q.id, q.text, q.type, q.options, q.correct_answer, q.explanation, q.topic
              FROM questions q JOIN lectures l ON l.id = q.lecture_id
              WHERE q.user_id = ? AND ${CARD_SOURCES} AND l.status = 'ready'`)
    .all(userId);
  const ins = db.prepare(
    'INSERT OR IGNORE INTO review_cards (user_id, question_id, topic, front, back, state) VALUES (?,?,?,?,?,\'new\')'
  );
  db.exec('BEGIN');
  try {
    for (const q of rows) {
      const card = buildCardFromQuestion(q);
      ins.run(userId, q.id, card.topic, card.front, card.back);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return rows.length;
}

function cardStats(userId) {
  const now = new Date().toISOString();
  const rows = db.prepare('SELECT state, due_at FROM review_cards WHERE user_id = ?').all(userId);
  let due = 0, newC = 0, learning = 0, review = 0;
  for (const r of rows) {
    if (r.due_at != null && r.due_at <= now) due++;
    else if (r.due_at == null) newC++;
    if (r.state === 'learning') learning++;
    if (r.state === 'review') review++;
  }
  return { due, new: newC, learning, review, total: rows.length };
}

// طابور البطاقات الذكية + إحصائيات
router.get('/queue', (req, res) => {
  syncCards(req.user.id);
  const now = new Date().toISOString();
  const stats = cardStats(req.user.id);

  const due = db
    .prepare(`SELECT id, topic, front, state, interval_days, reps, lapses FROM review_cards
              WHERE user_id = ? AND due_at IS NOT NULL AND due_at <= ? ORDER BY due_at ASC LIMIT 12`)
    .all(req.user.id, now)
    .map((c) => ({ ...c, label: stateLabel(c.state, -1) }));

  res.json({ stats, due });
});

// جلسة بطاقات: المستحقة أولًا ثم الجديدة لملء العدد
router.post('/session', (req, res) => {
  syncCards(req.user.id);
  const count = Math.min(25, Math.max(1, Number((req.body || {}).count) || 12));
  const now = new Date().toISOString();

  const due = db
    .prepare(`SELECT * FROM review_cards WHERE user_id = ? AND due_at IS NOT NULL AND due_at <= ? ORDER BY due_at ASC LIMIT ?`)
    .all(req.user.id, now, count);
  const remaining = count - due.length;
  const fresh = remaining > 0
    ? db.prepare(`SELECT * FROM review_cards WHERE user_id = ? AND due_at IS NULL ORDER BY id ASC LIMIT ?`).all(req.user.id, remaining)
    : [];

  const cards = [...due, ...fresh].map((c) => ({
    id: c.id,
    topic: c.topic,
    front: c.front,
    back: c.back,
    state: c.state,
    box: c.box,
    ease: c.ease,
    intervalDays: c.interval_days,
    reps: c.reps,
    lapses: c.lapses,
  }));

  res.json({ cards, dueCount: due.length, newCount: fresh.length });
});

// تقييم بطاقة حسب SM-2
router.post('/:id/grade', (req, res) => {
  const grade = Number((req.body || {}).grade);
  if (!validGrade(grade)) return res.status(400).json({ error: 'تقييم غير صالح' });

  const card = db.prepare('SELECT * FROM review_cards WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!card) return res.status(404).json({ error: 'البطاقة غير موجودة' });

  const next = applySm2(card, grade);
  db.prepare(
    `UPDATE review_cards SET box=?, ease=?, interval_days=?, reps=?, lapses=?, state=?, due_at=?, last_reviewed_at=? WHERE id=?`
  ).run(next.box, next.easeNumber, next.intervalDays, next.reps, next.lapses, next.state, next.dueAt, next.lastReviewedAt, card.id);
  db.prepare('INSERT INTO analytics (user_id, type, key, value) VALUES (?,?,?,?)').run(
    req.user.id,
    'review_grade',
    String(card.id),
    JSON.stringify({ grade, ...next })
  );

  const stats = cardStats(req.user.id);
  res.json({
    ok: true,
    card: {
      id: card.id,
      box: next.box,
      ease: next.easeNumber,
      intervalDays: next.intervalDays,
      reps: next.reps,
      lapses: next.lapses,
      state: next.state,
      grade,
    },
    stats,
  });
});

export default router;