import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5056/api';
const imgPath = path.join(__dirname, '..', 'data', 'testimg.png');

const server = spawn(process.execPath, ['src/index.js'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT: '5056' },
  stdio: ['ignore', 'ignore', 'ignore'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(BASE + '/health')).ok) break; } catch {}
    await sleep(400);
  }
  const reg = await (await fetch(BASE + '/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'صورة', email: 'img@einas.com', password: 'secret123' }),
  })).json();
  const token = reg.token;
  const H = { Authorization: 'Bearer ' + token };

  const fd = new FormData();
  const buf = await (await import('fs')).promises.readFile(imgPath);
  fd.append('title', 'اختبار صورة');
  fd.append('file', new File([buf], 'testimg.png', { type: 'image/png' }));
  const up = await (await fetch(BASE + '/lectures', { method: 'POST', headers: H, body: fd })).json();
  console.log('[UPLOAD IMAGE]:', JSON.stringify(up));
  if (!up.id) { console.log('FAILED'); return; }

  await sleep(1500);
  const d = await (await fetch(BASE + '/lectures/' + up.id, { headers: H })).json();
  console.log('[lecture content preview]:', (d.lecture.content || '').slice(0, 120));
  console.log('[questions count]:', (d.questions || []).length);
  const qas = (d.questions || []).filter((q) => q.type === 'qa');
  console.log('[qa count]:', qas.length);
  if (qas.length) console.log('[sample qa text]:', qas[0].text.slice(0, 200));
  console.log('=== IMAGE TEST OK ===');
  server.kill();
}

main().catch((e) => { console.error('TEST FAILED', e.message); server.kill(); process.exitCode = 1; });
