import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5055/api';
const tmp = path.join(__dirname, '..', 'data', 'test.txt');
fs.writeFileSync(tmp, 'الخلية هي الوحدة الأساسية للحياة. تتكون الخلية من نواة وغشاء خلوي وسيتوبلازم. الميتوكوندريا هي مصدر الطاقة في الخلية ويجب فهم دورها. ينقسم الانقسام الخلوي إلى متساوي وميوزي. الجين هو وحدة الوراثة. الكروموسوم يحمل المعلومة الوراثية وهذا مهم.', 'utf8');

// بدء الخادم على منفذ اختبار
const server = spawn(process.execPath, ['src/index.js'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT: '5055' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', (d) => (logs += d));
server.stderr.on('data', (d) => (logs += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(BASE + '/health');
      if (r.ok) return;
    } catch {}
    await sleep(400);
  }
  throw new Error('Server not ready: ' + logs);
}

function j(body) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function main() {
  await waitReady();
  console.log('[1] server ready');

  let token;
  const reg = await (await fetch(BASE + '/auth/register', j({ name: 'ايناس', email: 'test@einas.com', password: 'secret123' }))).json().catch(() => null);
  if (reg && reg.token) token = reg.token;
  else {
    const login = await (await fetch(BASE + '/auth/login', j({ email: 'test@einas.com', password: 'secret123' }))).json();
    token = login.token;
  }
  console.log('[2] auth ok, token len', token.length);
  const H = { Authorization: 'Bearer ' + token };

  // رفع محاضرة
  const fd = new FormData();
  fd.append('title', 'مقدمة علم الأحياء');
  fd.append('file', new File([fs.readFileSync(tmp)], 'lec.txt', { type: 'text/plain' }));
  const up = await (await fetch(BASE + '/lectures', { method: 'POST', headers: H, body: fd })).json();
  console.log('[3] upload:', JSON.stringify(up));

  const lectId = up.id;
  await sleep(1500);
  const lecDetail = await (await fetch(BASE + '/lectures/' + lectId, { headers: H })).json();
  console.log('[4] lecture summary keyPoints:', JSON.stringify((lecDetail.summary && JSON.parse(lecDetail.summary.key_points || '[]')).slice(0, 2)));
  console.log('[5] questions generated:', (lecDetail.questions || []).length);

  // توليد اختبار
  const gen = await (await fetch(BASE + '/exams/generate', { method: 'POST', headers: H, body: JSON.stringify({ count: 5, duration: 10 }) })).json();
  console.log('[6] exam generated:', gen.questions ? gen.questions.length : 'ERR', 'examId', gen.examId);
  if (!gen.questions || !gen.questions.length) throw new Error('no questions in exam');

  // إرسال إجابات (نخلي كلها خاطئة عمدًا لنحصل على تحليل)
  const fakeAnswers = gen.questions.map((q) => ({
    questionId: q.id,
    answer: q.type === 'mcq' ? 'Z' : '2',
  }));
  const sub = await (await fetch(BASE + '/results/submit', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ examId: gen.examId, answers: fakeAnswers, startedAt: new Date().toISOString() }) })).json();
  console.log('[7] result: score', sub.score, '/', sub.total, 'pct', sub.percentage, 'recommendations', (sub.recommendations || []).length);

  // لوحة التحكم
  const dash = await (await fetch(BASE + '/analytics/dashboard', { headers: H })).json();
  console.log('[8] dashboard:', 'lectures', dash.lectureCount, 'avg', dash.avgScore, 'weak', (dash.weakTopics || []).length);

  console.log('=== ALL OK ===');
}

main()
  .catch((e) => {
    console.error('TEST FAILED:', e.message);
    console.error(logs);
    process.exitCode = 1;
  })
  .finally(() => server.kill());
