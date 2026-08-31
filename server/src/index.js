import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import lectureRoutes from './routes/lectures.js';
import examRoutes from './routes/exams.js';
import resultRoutes from './routes/results.js';
import analyticsRoutes from './routes/analytics.js';
import reviewRoutes from './routes/reviews.js';
import cardsRoutes from './routes/cards.js';
import chatRoutes from './routes/chat.js';
import studyRoutes from './routes/study.js';
import translateRoutes from './routes/translate.js';
import adminRoutes from './routes/admin.js';
import { aiAvailable } from './lib/ai.js';
import { promoteAdmins } from './lib/auth.js';
import { startWorker } from './lib/jobs.js';
import { dataDir } from './lib/dataDir.js';
import { seedExamples } from './lib/examples.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// تقديم ملفات مرفوعة للعرض
app.use('/uploads', express.static(path.join(dataDir, 'uploads')));

// تقديم بيانات لغة التعرف الضوئي (تُقرأ محليًا عبر HTTP داخل عملية الخادم)
import { TESSDATA_PATH } from './lib/ocr.js';
app.use(TESSDATA_PATH, express.static(path.join(dataDir, 'lang-data')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: aiAvailable ? 'ai' : 'local', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/lectures', lectureRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/review-cards', cardsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/study', studyRoutes);
app.use('/api/translate', translateRoutes);
app.use('/api/admin', adminRoutes);

// رفع عناوين البريد المدرجة في .env إلى صلاحية مدير عند الإقلاع
promoteAdmins();
// إضافة محاضرات وأسئلة نموذجية عند قاعدة بيانات فارغة (للتوضيح)
try { seedExamples(); } catch (e) { console.error('فشل إضافة الأمثلة:', e.message); }

// تقديم الواجهة المبنية (إن وُجد build)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(404).json({ error: 'غير موجود' });
  });
});

app.use((req, res) => res.status(404).json({ error: 'المسار غير موجود' }));

app.listen(PORT, () => {
  console.log(`نظام إيناس - الخادم يعمل على http://localhost:${PORT}`);
  console.log(`وضع الذكاء الاصطناعي: ${aiAvailable ? 'OpenAI API' : 'المحلل المحلي (دون مفتاح)'}`);
  // إعادة جدولة الوظائف الباقية من جلسة سابقة وبدء عامل المعالجة الخلفية
  startWorker();
});
