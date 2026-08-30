import { Router } from 'express';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { auth, adminOnly } from '../lib/auth.js';
import { aiMetricsSnapshot, resetAiMetrics } from '../lib/metrics.js';
import { analysisProgress } from './lectures.js';

const router = Router();
router.use(auth, adminOnly);

function fmtUptime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (h) parts.push(`${h} س`);
  if (m) parts.push(`${m} د`);
  parts.push(`${s} ث`);
  return parts.join(' ');
}

// حذف الملفات المرفوعة المخزنة (مسار مفرد أو JSON)
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

// ---------- لوحة صحة النظام ----------
router.get('/system/health', (_req, res) => {
  const metrics = aiMetricsSnapshot();
  const active = [];
  for (const [userId, entry] of analysisProgress) {
    active.push({
      userId,
      lectureId: entry.lectureId || null,
      pct: entry.pct,
      message: entry.message,
    });
  }
  res.json({
    ok: true,
    ai: Boolean(process.env.AI_API_KEY),
    model: process.env.AI_MODEL || 'غير مضبوط',
    baseUrl: (process.env.AI_BASE_URL || '').replace(/\/+$/, ''),
    concurrency: process.env.AI_PIPELINE_CONCURRENCY || '1',
    metrics,
    activeAnalyses: active,
  });
});

router.post('/system/health/reset', (_req, res) => {
  const metrics = resetAiMetrics();
  res.json({ ok: true, metrics });
});

// ---------- إدارة المستخدمين ----------
router.get('/users', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.username, u.email, u.avatar, u.role, u.created_at,
      (SELECT COUNT(*) FROM lectures l WHERE l.user_id = u.id) AS lectures,
      (SELECT COUNT(*) FROM exams e WHERE e.user_id = u.id) AS exams,
      (SELECT COUNT(*) FROM results r WHERE r.user_id = u.id) AS results,
      (SELECT COALESCE(ROUND(AVG(r.percentage)),0) FROM results r WHERE r.user_id = u.id) AS avgScore
    FROM users u
    ORDER BY u.created_at DESC
  `).all();
  res.json({ users: rows, selfId: req.user.id });
});

function adminCount() {
  return db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c;
}

router.post('/users/:id/role', (req, res) => {
  const { role } = req.body || {};
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'دور غير صالح' });
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });

  if (role === 'user') {
    if (Number(target.id) === Number(req.user.id)) {
      return res.status(400).json({ error: 'لا يمكن سحب صلاحية المدير من حسابك الحالي' });
    }
    if (target.role === 'admin' && adminCount() <= 1) {
      return res.status(400).json({ error: 'لا يمكن سحب آخر صلاحية مدير في النظام' });
    }
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, target.id);
  res.json({ ok: true, id: target.id, role });
});

router.post('/users/:id/reset-password', (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 3) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة قصيرة (3 أحرف على الأقل)' });
  }
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), target.id);
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (Number(target.id) === Number(req.user.id)) {
    return res.status(400).json({ error: 'لا يمكنك حذف حسابك الحالي' });
  }
  if (target.role === 'admin' && adminCount() <= 1) {
    return res.status(400).json({ error: 'لا يمكن حذف آخر مدير في النظام' });
  }
  const files = db.prepare('SELECT file_path FROM lectures WHERE user_id = ?').all(target.id);
  for (const f of files) unlinkStored(f.file_path);
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  res.json({ ok: true });
});

export default router;