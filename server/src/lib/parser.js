import fs from 'fs';
import path from 'path';
import os from 'os';
import pdfparse from 'pdf-parse';
import mammoth from 'mammoth';
import xlsx from 'xlsx';
import { ocrImage, isImageFile } from './ocr.js';
import { rasterizePdf } from './pdfRaster.js';

// أدنى طول لنص الصفحة الرقمية لاعتبارها "نصية" (لا تحتاج تعرفًا ضوئيًا)
const DIGITAL_PAGE_MIN = 20;
const MARKER = /\[\[(PAGE:[^\]]+|صفحة \d+[^\]]*)\]\]/g;

// إزالة علامات [[PAGE:..]] من نص (لا يُستخدم حاليًا — يُحتفظ بها لوسم الصفحات)
export function stripMarkers(text) {
  return String(text || '').replace(MARKER, ' ').replace(/\s{2,}/g, ' ').trim();
}

let pdfjs = null;
async function getPdfTextEngine() {
  if (pdfjs) return pdfjs;
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs = { getDocument };
  return pdfjs;
}

// ============================================================
// PDF نصي تعقّد لكل صفحة: يكتشف طبقة النص الرقمية لكل صفحة على حدة،
// فيحوّل للتعرف الضوئي الصفحات الممسوحة فقط (لا كامل المستند).
// يبني النص النهائي بالترتيب الصحيح للصفحات: الرقمية كما هي + الممسوحة عبر OCR.
// ============================================================
async function extractPdfSmart(pdfPath, onProgress = null) {
  const { getDocument } = await getPdfTextEngine();
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({ data, isEvalSupported: false }).promise;
  const total = doc.numPages;

  const pages = []; // { number, text, textLen, needsOcr, ocrUsed }
  const digitalTexts = new Map();
  const ocrNeeded = [];

  if (typeof onProgress === 'function') onProgress(0, total, 'فحص صفحات الـ PDF وتحديد المحتاج للتعرف الضوئي');

  for (let i = 1; i <= total; i++) {
    let pageText = '';
    try {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      pageText = (tc.items || []).map((it) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' ').trim();
    } catch {
      pageText = '';
    }
    const textLen = pageText.replace(/\s+/g, '').length;
    pages.push({ number: i, textLen, needsOcr: textLen < DIGITAL_PAGE_MIN, ocrUsed: false, text: pageText });
    if (textLen >= DIGITAL_PAGE_MIN) digitalTexts.set(i, pageText);
    else ocrNeeded.push(i);
  }

  // ترشيد عدد صفحات OCR (أول 60 فقط كي لا يستهلك وقتًا لا نهائيًا)
  const ocrMaxed = ocrNeeded.filter((n) => n <= 60);
  const truncated = ocrNeeded.length > ocrMaxed.length;

  if (ocrMaxed.length) {
    const ocrDir = path.join(os.tmpdir(), 'einas-ocr-' + Date.now());
    const { pages: rasters } = await rasterizePdf(pdfPath, ocrDir, {
      scale: 2,
      maxPages: 60,
      only: ocrMaxed,
      onPage: (done, ttl) => {
        if (typeof onProgress === 'function') onProgress(done, ttl, `التعرف الضوئي على الصفحة الممسوحة ${OCR_INDEX_MSGS[done - 1] || done} من ${ttl}`);
      },
    });
    for (const r of rasters) {
      const pageText = await ocrImage(r.pngPath);
      const idx = pages.findIndex((p) => p.number === r.index);
      if (idx >= 0) {
        pages[idx].text = pageText;
        pages[idx].textLen = pageText.replace(/\s+/g, '').length;
        pages[idx].ocrUsed = true;
      }
    }
    try { fs.rmSync(ocrDir, { recursive: true, force: true }); } catch {}
  }

  // تجميع النص الكامل بترتيب الصفحات
  const parts = [];
  for (const p of pages) {
    if (p.ocrUsed) parts.push(`[[PAGE:${p.number}]]\n[[صفحة ${p.number} - تعرّف ضوئي]]\n${p.text}`);
    else if (p.text) parts.push(`[[PAGE:${p.number}]]\n${p.text}`);
  }
  if (truncated) {
    parts.push(`\n[[ملاحظة: الـ PDF يحتوي ${total} صفحة؛ حُدّدت ${ocrNeeded.length} صفحات ممسوحة وعولجت أول ${Math.min(60, ocrNeeded.length)} منها بالتعرف الضوئي. ارفع بقية الصفحات كملفات إضافية لضمان التغطية الكاملة.]]`);
  }

  return {
    text: parts.join('\n').replace(/\n{3,}/g, '\n\n'),
    pages: pages.map(({ number, textLen, needsOcr, ocrUsed }) => ({ number, textLen, needsOcr, ocrUsed })),
    pageCount: total,
    truncated,
    ocrPageCount: ocrMaxed.length,
  };
}

// رسائل تقدم المسح الضوئي بقراءة عربية مبسطة
const numbersAr = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة'];
const OCR_INDEX_MSGS = numbersAr;

// ============================================================
// استخراج مستند كامل مع وسائط بيانات الصفحات (تُخزَّن في document_pages)
// ============================================================
export async function extractDocument(filePath, fileType, onProgress = null) {
  const ext = path.extname(filePath).toLowerCase();
  let text = '';
  let pageCount = 1;
  let pages = [];
  let truncated = false;

  // الصور (PNG/JPG/WebP/BMP/GIF/TIFF) عبر التعرف الضوئي OCR (عربي + إنجليزي)
  if (isImageFile(filePath) || fileType === 'image') {
    text = await ocrImage(filePath);
    pages = [{ number: 1, textLen: text.replace(/\s+/g, '').length, needsOcr: true, ocrUsed: true }];
  } else if (ext === '.pdf' || fileType === 'pdf') {
    const info = await extractPdfSmart(filePath, onProgress);
    text = info.text;
    pages = info.pages;
    pageCount = info.pageCount;
    truncated = info.truncated;
  } else if (ext === '.docx' || fileType === 'docx' || ext === '.doc') {
    const buf = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer: buf });
    text = result.value || '';
    pages = [{ number: 1, textLen: text.replace(/\s+/g, '').length, needsOcr: false, ocrUsed: false }];
  } else if (ext === '.xlsx' || ext === '.xls' || fileType === 'xlsx' || fileType === 'excel') {
    const wb = xlsx.readFile(filePath);
    const parts = [];
    pages = [];
    wb.SheetNames.forEach((name, si) => {
      const rows = xlsx.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
      const sheetParts = [];
      for (const row of rows) {
        if (Array.isArray(row)) sheetParts.push(row.filter((c) => c != null).join(' | '));
      }
      pages.push({ number: si + 1, textLen: sheetParts.join(' ').replace(/\s+/g, '').length, needsOcr: false, ocrUsed: false });
      parts.push(`[[ورقة ${name}]]\n${sheetParts.join('\n')}`);
    });
    pageCount = Math.max(1, pages.length);
    text = parts.join('\n');
  } else if (ext === '.txt' || fileType === 'text') {
    text = fs.readFileSync(filePath, 'utf8');
    pages = [{ number: 1, textLen: text.replace(/\s+/g, '').length, needsOcr: false, ocrUsed: false }];
  } else {
    throw new Error('صيغة الملف غير مدعومة');
  }

  const clean = text.replace(/\n{2,}/g, '\n');
  return { text: clean, pages, pageCount, truncated };
}

// ============================================================
// التوافق الكامل مع الاستدعاءات القديمة: parseFile تُعيد النص فقط
// ============================================================
export async function parseFile(filePath, fileType, onProgress = null) {
  const { text } = await extractDocument(filePath, fileType, onProgress);
  return text;
}