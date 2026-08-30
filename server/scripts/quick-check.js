import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');
const verify = fs.existsSync(path.join(serverDir, 'src', 'index.js'));
console.log('serverDir:', serverDir);
console.log('index exists:', verify);

// قتل أي عمليات خادم عالقة قد تمسك المنفذ
const child = spawn(process.execPath, ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: '5098' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
child.stdout.on('data', (d) => (out += d.toString()));
child.stderr.on('data', (d) => (out += d.toString()));
child.on('exit', (code) => console.log('child exited', code));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch('http://localhost:5098/api/health', { signal: AbortSignal.timeout(1500) });
      if (r.ok) {
        console.log('HEALTH OK:', JSON.stringify(await r.json()));
        child.kill();
        await sleep(300);
        console.log('OUTPUT:', JSON.stringify(out));
        process.exit(0);
      }
    } catch {}
    await sleep(500);
  }
  console.log('NOT READY after retries');
  console.log('OUTPUT:', JSON.stringify(out));
  child.kill();
  process.exit(1);
})();
