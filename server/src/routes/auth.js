import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { signToken } from '../lib/auth.js';

const router = Router();

// كلمة المرور الدنيا (الافتراضي 6، لكن يسمح بالإداري admin بباسورد 123)
const MIN_PASSWORD = 3;

// اسم مستخدم مقبول: أحرف/أرقام/شرطة سفلية، 3–24 حرفًا
function normalizeUsername(v) {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, '_');
}
function validUsername(u) {
  return /^[a-z0-9_]{3,24}$/.test(u);
}
function validPassword(p) {
  return typeof p === 'string' && p.length >= MIN_PASSWORD;
}

// أي حساب 'admin' حالي يتم تثبيت باسورده إلى 123 وإصلاح اسمه،
// وإن لم يوجد ننشئ مديرًا افتراضيًا admin/123
function ensureAdmin() {
  const existing = db.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
  const wantUsername = 'admin';
  if (existing) {
    if (existing.username !== wantUsername) {
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(wantUsername, existing.id);
    }
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync('123', 10), existing.id);
    return;
  }
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(wantUsername)) return;
  const hash = bcrypt.hashSync('123', 10);
  db.prepare('INSERT INTO users (name, username, email, password, role) VALUES (?, ?, ?, ?, ?)')
    .run('مدير النظام', wantUsername, 'admin@einas.local', hash, 'admin');
}
ensureAdmin();

router.post('/register', (req, res) => {
  const { name, username, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'البيانات ناقصة' });
  const uname = normalizeUsername(username || email);
  if (password.length < MIN_PASSWORD) return res.status(400).json({ error: 'كلمة المرور قصيرة جدًا' });
  if (!validUsername(uname)) return res.status(400).json({ error: 'اسم المستخدم غير صالح (3–24 حرفًا، حروف/أرقام/شرطة سفلية)' });
  const byEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (byEmail) return res.status(409).json({ error: 'البريد مسجل مسبقًا' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(uname)) {
    return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقًا' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (name, username, email, password) VALUES (?, ?, ?, ?)')
    .run(name, uname, email.toLowerCase(), hash);
  const user = db.prepare('SELECT id, name, username, email, avatar, role FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ token: signToken(user), user });
});

router.post('/login', (req, res) => {
  const { email, username, password } = req.body || {};
  if (!validPassword(password)) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  let user = null;
  if (username) {
    user = db.prepare('SELECT * FROM users WHERE username = ?').get(normalizeUsername(username));
  }
  if (!user && email) {
    user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase());
  }
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }
  const safe = {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    role: user.role,
  };
  res.json({ token: signToken(safe), user: safe });
});

router.get('/me', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'غير مصرح' });
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const user = db.prepare('SELECT id, name, username, email, avatar, role FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'غير موجود' });
    res.json({ user });
  } catch {
    res.status(401).json({ error: 'الجلسة منتهية' });
  }
});

export default router;
