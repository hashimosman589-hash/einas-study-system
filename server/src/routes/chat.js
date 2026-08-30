import { Router } from 'express';
import db from '../db.js';
import { auth } from '../lib/auth.js';
import { chatWithLecture, retrieveContext, aiAvailable } from '../lib/ai.js';

const router = Router();
router.use(auth);

const TRIM = 20; // أقصى رسائل محفوظة في الذاكرة

function loadHistory(userId, lectureId) {
  const row = db.prepare("SELECT value FROM analytics WHERE user_id = ? AND type = 'chat' AND key = ?").get(userId, String(lectureId));
  if (!row || !row.value) return [];
  try {
    const arr = JSON.parse(row.value);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveHistory(userId, lectureId, messages) {
  const trimmed = messages.slice(-TRIM);
  const exists = db.prepare("SELECT 1 FROM analytics WHERE user_id = ? AND type = 'chat' AND key = ?").get(userId, String(lectureId));
  if (exists) {
    db.prepare('UPDATE analytics SET value = ? WHERE user_id = ? AND type = ? AND key = ?').run(JSON.stringify(trimmed), userId, 'chat', String(lectureId));
  } else {
    db.prepare('INSERT INTO analytics (user_id, type, key, value) VALUES (?,?,?,?)').run(userId, 'chat', String(lectureId), JSON.stringify(trimmed));
  }
}

function summaryOf(userId, lectureId) {
  const sum = db.prepare('SELECT * FROM summaries WHERE lecture_id = ?').get(lectureId);
  let text = sum ? (sum.summary || '') : '';
  let keyPoints = '';
  try { keyPoints = JSON.parse(sum ? (sum.key_points || '[]') : '[]').join('\n- '); } catch {}
  if (keyPoints) text += '\n\nنقاط التركيز:\n- ' + keyPoints;
  return text;
}

function ownLecture(userId, lectureId) {
  return db.prepare('SELECT * FROM lectures WHERE id = ? AND user_id = ?').get(lectureId, userId);
}

// سجل المحادثة ومعلومات المحاضرة
router.get('/:id/history', (req, res) => {
  const lec = ownLecture(req.user.id, req.params.id);
  if (!lec) return res.status(404).json({ error: 'المحاضرة غير موجودة' });
  res.json({
    id: lec.id,
    title: lec.title,
    subject: lec.subject,
    messages: loadHistory(req.user.id, lec.id),
    summaryExcerpt: summaryOf(req.user.id, lec.id).slice(0, 260),
    ready: true,
  });
});

// إرسال رسالة وإجابة مثبتة على مصدر المحاضرة
router.post('/:id', async (req, res) => {
  const lec = ownLecture(req.user.id, req.params.id);
  if (!lec) return res.status(404).json({ error: 'المحاضرة غير موجودة' });
  const message = String((req.body || {}).message || '').trim();
  if (!message) return res.status(400).json({ error: 'اكتب سؤالك أولًا' });
  if (!aiAvailable) return res.status(503).json({ error: 'الذكاء الاصطناعي غير مكوَّن — أضف مفتاح API أولًا.' });

  const history = loadHistory(req.user.id, lec.id);
  const top = retrieveContext(lec.content || '', message, 3);
  const sources = top.map((s) => ({ excerpt: s.text.slice(0, 90) }));
  const reference = [summaryOf(req.user.id, lec.id), ...top.map((s, i) => `[مقطع ${i + 1}]\n${s.text}`)].join('\n\n');

  try {
    const { reply, followUps } = await chatWithLecture({ title: lec.title, reference, history, message });
    if (!reply) return res.status(502).json({ error: 'تعذّر توليد الإجابة. حاول مرة أخرى.' });
    const updated = [...history, { role: 'user', content: message, ts: new Date().toISOString() }, { role: 'assistant', content: reply, ts: new Date().toISOString() }];
    saveHistory(req.user.id, lec.id, updated);
    res.json({ reply, followUps, sources });
  } catch (e) {
    const msg = /AI_ERROR/.test(String(e && e.message)) ? 'خدمة الذكاء الاصطناعي مشغولة حاليًا — أعد المحاولة بعد قليل.' : 'حدث خطأ أثناء توليد الإجابة. حاول مرة أخرى.';
    res.status(502).json({ error: msg });
  }
});

export default router;