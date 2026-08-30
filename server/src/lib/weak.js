import db from '../db.js';

// ============================================================
// الذاكرة التراكمية لنقاط الضعف (Weak Memory)
// تجميع أخطاء الطالب عبر كل النتائج وجميع المحاضرات/المواد،
// مع حساب الدقة وتاريخ آخر خطأ، لتغذية التوليد والتوزيع وجداول المراجعة.
// ============================================================

export function collectWeakStats(userId) {
  const rows = db.prepare('SELECT answers, created_at FROM results WHERE user_id = ? ORDER BY created_at ASC').all(userId);
  const map = new Map();
  for (const r of rows) {
    if (!r.answers) continue;
    let arr = [];
    try { arr = JSON.parse(r.answers); } catch { continue; }
    for (const a of arr) {
      if (!a || !a.topic) continue;
      const t = String(a.topic).trim();
      if (!t) continue;
      const cur = map.get(t) || { wrong: 0, attempts: 0, lastAt: '' };
      cur.attempts++;
      if (a.isCorrect !== true) cur.wrong++;
      cur.lastAt = r.created_at || cur.lastAt;
      map.set(t, cur);
    }
  }
  return [...map.entries()]
    .map(([topic, s]) => ({ topic, wrong: s.wrong, attempts: s.attempts, lastAt: s.lastAt }))
    .filter((s) => s.wrong > 0)
    .sort((a, b) => (b.wrong - a.wrong) || (b.attempts - a.attempts));
}

export function weakTopicNames(userId, limit = 8) {
  return collectWeakStats(userId).slice(0, limit).map((s) => s.topic);
}

// جدولة مراجعة متباعدة بسيطة: خطأ أكثر = مراجعة أحدث (بالأيام)
export function reviewSchedule(userId) {
  return collectWeakStats(userId).slice(0, 8).map((s) => {
    const accuracy = s.attempts ? Math.round((1 - s.wrong / s.attempts) * 100) : 0;
    const dueInDays = s.wrong >= 4 ? 0 : s.wrong === 3 ? 1 : s.wrong === 2 ? 2 : 3;
    return {
      topic: s.topic,
      wrong: s.wrong,
      attempts: s.attempts,
      accuracy,
      dueInDays,
      lastAt: s.lastAt || '',
    };
  });
}