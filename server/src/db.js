import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { dataDir } from './lib/dataDir.js';

const db = new DatabaseSync(path.join(dataDir, 'einas.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  avatar TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lectures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject TEXT DEFAULT '',
  file_name TEXT,
  file_path TEXT,
  file_type TEXT DEFAULT 'pdf',
  content TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lecture_id INTEGER NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary TEXT,
  key_points TEXT,
  important_terms TEXT,
  review_topics TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lecture_id INTEGER NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  type TEXT NOT NULL,
  options TEXT,
  correct_answer TEXT,
  explanation TEXT,
  topic TEXT DEFAULT '',
  question_en TEXT,
  question_ar TEXT,
  answer_en TEXT,
  answer_ar TEXT,
  difficulty TEXT DEFAULT 'medium',
  page TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  question_count INTEGER DEFAULT 10,
  duration_minutes INTEGER DEFAULT 15,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exam_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id INTEGER REFERENCES exams(id) ON DELETE SET NULL,
  score INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  percentage REAL DEFAULT 0,
  answers TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  key TEXT,
  value TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
  topic TEXT DEFAULT '',
  front TEXT NOT NULL,
  back TEXT,
  box INTEGER DEFAULT 0,
  ease REAL DEFAULT 2.5,
  interval_days INTEGER DEFAULT 0,
  reps INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0,
  due_at TEXT,
  last_reviewed_at TEXT,
  state TEXT DEFAULT 'new',
  UNIQUE(user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_review_cards_due ON review_cards(user_id, due_at);
`);

// ترحيل: إضافة أعمدة الأسئلة ثنائية اللغة لقواعد البيانات القائمة
const questionCols = [
  ['question_en', 'TEXT'],
  ['question_ar', 'TEXT'],
  ['answer_en', 'TEXT'],
  ['answer_ar', 'TEXT'],
  ['difficulty', 'TEXT DEFAULT \'medium\''],
  ['page', 'TEXT DEFAULT \'\''],
];
const existingCols = db.prepare('PRAGMA table_info(questions)').all().map((c) => c.name);
for (const [name, type] of questionCols) {
  if (!existingCols.includes(name)) {
    db.exec(`ALTER TABLE questions ADD COLUMN ${name} ${type}`);
  }
}

// ترحيل: دور المستخدم (admin/user) لإدارة المستخدمين
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userCols.includes('role')) {
  db.exec('ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT \'user\'');
}

// ترحيل: اسم المستخدم (username) لتسجيل الدخول بدل البريد أو بالإضافة إليه
if (!userCols.includes('username')) {
  db.exec('ALTER TABLE users ADD COLUMN username TEXT');
  // تهيئة بيانات موجودة بأسماء فريدة مستندة إلى id (نفس قاعدة البريد)
  db.exec("UPDATE users SET username = lower(email) WHERE username IS NULL OR username = ''");
  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)');
  } catch {
    // بعض المستخدمين القدامى قد يتشاركون البريد المُصفّى؛ نزيل التكرارات قبل فهرسة فريدة
    db.exec(`
      UPDATE users
      SET username = lower(email) || '_' || id
      WHERE id IN (
        SELECT id FROM users u1
        WHERE (SELECT COUNT(*) FROM users u2 WHERE u2.username = u1.username) > 1
      )
    `);
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)');
  }
}

// ============================================================
// طبقة المعالجة غير المتزامنة (Upload Fast → Analyze in Background)
// جداول: طوابير الوظائف، ذات الصلة لكل محاضرة، مستخرجة نص البرسلة
// ============================================================
db.exec(`
CREATE TABLE IF NOT EXISTS analysis_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lecture_id INTEGER NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  file_hash TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  current_stage TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  eta_seconds INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  retry_at TEXT,
  sections_total INTEGER DEFAULT 0,
  sections_done INTEGER DEFAULT 0,
  error_message TEXT,
  error_detail TEXT,
  cached INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  file_hash TEXT PRIMARY KEY,
  file_name TEXT DEFAULT '',
  file_type TEXT DEFAULT 'pdf',
  size_bytes INTEGER DEFAULT 0,
  page_count INTEGER DEFAULT 0,
  source_files TEXT,
  content TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS document_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_hash TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  text_len INTEGER DEFAULT 0,
  needs_ocr INTEGER DEFAULT 0,
  ocr_used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_hash TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_total INTEGER DEFAULT 0,
  char_count INTEGER DEFAULT 0,
  page_first TEXT,
  page_last TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analysis_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  lecture_id INTEGER NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  file_hash TEXT NOT NULL DEFAULT '',
  result_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs(status, retry_at);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_user ON analysis_jobs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_lecture ON analysis_jobs(lecture_id);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_hash ON analysis_jobs(file_hash);
CREATE INDEX IF NOT EXISTS idx_doc_pages_hash ON document_pages(file_hash, page_number);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_hash ON document_chunks(file_hash, chunk_index);
CREATE INDEX IF NOT EXISTS idx_analysis_results_hash ON analysis_results(file_hash);
`);

// ترحيل: أعمدة المحاضرة لدعم المعالجة غير المتزامنة والتخزين المؤقت بالهاش
const lectureCols = [
  ['file_hash', 'TEXT'],
  ['progress', 'INTEGER DEFAULT 0'],
  ['current_stage', 'TEXT DEFAULT \'\''],
  ['error_message', 'TEXT'],
  ['updated_at', 'TEXT'],
];
const existingLectureCols = db.prepare('PRAGMA table_info(lectures)').all().map((c) => c.name);
for (const [name, type] of lectureCols) {
  if (!existingLectureCols.includes(name)) {
    db.exec(`ALTER TABLE lectures ADD COLUMN ${name} ${type}`);
  }
}

// ترحيل: عمود deleted_at للاحتفاظ بالمحاضرات المحذوفة (حذف ناعم قابل للاسترجاع)
if (!existingLectureCols.includes('deleted_at')) {
  db.exec('ALTER TABLE lectures ADD COLUMN deleted_at TEXT');
}

export default db;
