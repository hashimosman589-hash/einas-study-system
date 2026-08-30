import fs from 'fs';
import path from 'path';

let main = null;

async function getMain() {
  if (main) return main;
  const [{ createCanvas, DOMMatrix, Path2D }, { getDocument }] = await Promise.all([
    import('@napi-rs/canvas'),
    import('pdfjs-dist/legacy/build/pdf.mjs'),
  ]);
  globalThis.DOMMatrix = DOMMatrix;
  globalThis.Path2D = Path2D;
  main = { createCanvas, getDocument };
  return main;
}

class CanvasFactory {
  create(w, h) {
    const canvas = main.createCanvas(w, h);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(cv, w, h) {
    cv.canvas.width = w;
    cv.canvas.height = h;
  }
  destroy(cv) {
    return cv;
  }
}

// يحوّل صفحات PDF إلى صور PNG لعمل التعرف الضوئي عليها
// يُرجع قائمة { index, pngPath }
// الخيار only: قائمة أرقام صفحات محددة للتحويل فقط (بقية الصفحات تُتجاهل) — يوفّر الرسم
// والذاكرة عندما يكون النص الرقمي كافيًا لبعض الصفحات (PDF مختلط).
export async function rasterizePdf(pdfPath, outDir, { scale = 2, maxPages = 60, only = null, onPage = null } = {}) {
  const { createCanvas, getDocument } = await getMain();
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({ data, CanvasFactory, isEvalSupported: false }).promise;
  const wanted = only && only.length
    ? [...new Set(only.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= maxPages))]
    : Array.from({ length: Math.min(doc.numPages, maxPages) }, (_, i) => i + 1);
  if (wanted.length < 1) throw new Error('لا توجد صفحات مقروءة في هذا الـ PDF');

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const pages = [];

  for (let i = 0; i < wanted.length; i++) {
    const n = wanted[i];
    if (typeof onPage === 'function') onPage(i + 1, wanted.length);
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport, CanvasFactory }).promise;
    const pngPath = path.join(outDir, `page-${n}.png`);
    fs.writeFileSync(pngPath, await canvas.encode('png'));
    pages.push({ index: n, pngPath });
  }
  return { pages, truncated: doc.numPages > maxPages, totalPages: doc.numPages };
}