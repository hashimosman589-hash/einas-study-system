import jwt from 'jsonwebtoken';
import db from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'einas-super-secret';

export function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES || '7d',
  });
}

const SAFE_SELECT = 'id, name, username, email, avatar, role';

export function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'غير مصرح' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare(`SELECT ${SAFE_SELECT} FROM users WHERE id = ?`).get(payload.id);
    if (!user) return res.status(401).json({ error: 'المستخدم غير موجود' });
    req.user = user;
    req.user.isAdmin = user.role === 'admin';
    next();
  } catch {
    return res.status(401).json({ error: 'الجلسة منتهية' });
  }
}

// استخدام داخل مسارات الإدارة: مفوتر فقط ولمدير فقط
export function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'غير مسموح — صلاحية المدير مطلوبة' });
  }
  next();
}

// عند الإقلاع: أي بريد في ADMIN_EMAILS (مفصول بفواصل) يُرفع إلى مدير
export function promoteAdmins() {
  const raw = process.env.ADMIN_EMAILS || '';
  const emails = raw.split(/[,،;\s]+/).map((e) => e.toLowerCase()).filter(Boolean);
  if (!emails.length) return;
  const upd = db.prepare("UPDATE users SET role = 'admin' WHERE email = ?");
  for (const email of emails) upd.run(email);
}