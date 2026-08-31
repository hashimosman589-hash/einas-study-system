import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createWorker } from 'tesseract.js';
import { dataDir } from './dataDir.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// مصدر بيانات اللغة المرفوعة مع الريبو (لكي يعمل OCR على الاستضافة السحابية)
const assetsLangDir = path.join(__dirname, '..', '..', 'assets', 'lang');
const langDir = path.join(dataDir, 'lang-data');
if (!fs.existsSync(langDir)) fs.mkdirSync(langDir, { recursive: true });

// نسخ ملفات اللغة المرفوعة إلى مجلد البيانات عند النقص (يعمل حتى بلا DATA_DIR)
if (fs.existsSync(assetsLangDir)) {
  for (const f of fs.readdirSync(assetsLangDir)) {
    if (!f.endsWith('.traineddata')) continue;
    const dest = path.join(langDir, f);
    if (!fs.existsSync(dest)) {
      try { fs.copyFileSync(path.join(assetsLangDir, f), dest); } catch {}
    }
  }
}

// بيانات اللغة تُقدَّم محليًا عبر HTTP (Global fetch لا يدعم file:// في Node 24)
export const TESSDATA_PATH = '/tessdata';
export function langDataPath() {
  const port = (process.env.PORT || '5000');
  return `http://127.0.0.1:${port}${TESSDATA_PATH}/`;
}

let worker = null;
let workerReady = null;

async function getWorker() {
  if (!workerReady) {
    workerReady = (async () => {
      worker = await createWorker(['ara', 'eng'], 1, {
        langPath: langDataPath(),
        cachePath: langDir,
      });
      return worker;
    })();
  }
  return workerReady;
}

export async function ocrImage(filePath) {
  const w = await getWorker();
  const { data } = await w.recognize(filePath);
  const text = (data && data.text) || '';
  return text.replace(/\n{2,}/g, '\n').trim();
}

export function isImageFile(filePath) {
  return /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(filePath);
}