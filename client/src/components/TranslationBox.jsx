import { useRef, useState } from 'react';
import { api } from '../api/client.js';
import { Spinner } from './ui.jsx';

const AR = /[\u0600-\u06FF]/;

// تحديد لغة النص الأصلي (وضع بسيط: عربي إذا احتوى على أحرف عربية وإلا إنجليزي)
export function detectLang(text) {
  return AR.test(String(text || '')) ? 'ar' : 'en';
}

const DIR_LABELS = { ar: 'العربية → English', en: 'English → العربية' };

// 🌐 ترجمة: زر وقائمة بخيارَي الترجمة والعودة للأصل
// parts: نصوص تُعرض وتُترجم | staticValue: ترجمات جاهزة {ar?, en?} (لا استدعاء API)
// render: (values, view, opts) => node — يبني واجهة العرض (عندها تُترجَم النصوص فقط)
export default function TranslationBox({
  parts = [],
  staticValue = null,
  render = null,
  source = null,
  triggerClassName = '',
  className = '',
  align = 'left',
  label = 'ترجمة',
  noTranslate = false,
}) {
  const originals = parts.map((p) => String(p == null ? '' : p));
  const src = source || detectLang(originals.join(' ').trim());

  const [view, setView] = useState('orig'); // 'orig' | 'en' | 'ar'
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const cacheRef = useRef(new Map());
  const [translated, setTranslated] = useState(null);

  const shown = noTranslate || view === 'orig' ? originals : translated || originals;
  const shownText = shown.join(' ').trim();
  const dir = detectLang(shownText) === 'ar' ? 'rtl' : 'ltr';

  const staticValues = (to) => {
    if (!staticValue || !staticValue[to]) return null;
    const raw = String(staticValue[to]);
    const vals = raw.split('\n');
    return vals.length === originals.length ? vals : null;
  };

  const go = async (to) => {
    setOpen(false);
    if ((to === view && translated) || busy) return;
    setErr('');

    // ترجمات جاهزة (ثنائية من قاعدة البيانات) — بدون استدعاء
    const sv = staticValues(to);
    if (sv) { setTranslated(sv); setView(to); return; }

    if (to === src) { setView('orig'); return; } // ترجمة لنفس اللغة = عرض الأصل

    const key = to + '|' + originals.join('\u0001');
    if (cacheRef.current.has(key)) { setTranslated(cacheRef.current.get(key)); setView(to); return; }

    setBusy(true);
    try {
      let vals;
      const clean = originals.filter(Boolean);
      if (clean.length === 1) {
        const res = await api.post('/translate', { text: clean[0], to });
        vals = [res && res.text ? res.text : clean[0]];
      } else if (clean.length) {
        const res = await api.post('/translate', { texts: clean, to });
        vals = res && Array.isArray(res.texts) && res.texts.length === clean.length ? res.texts : originals;
      } else {
        vals = originals;
      }
      cacheRef.current.set(key, vals);
      setTranslated(vals);
      setView(to);
    } catch (e) {
      setErr(e.message || 'تعذّرت الترجمة');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setView('orig'); setTranslated(null); setOpen(false); };

  const content = render
    ? render(shown, view, { reset, dir })
    : (
      <div className="mt-1.5 space-y-1">
        {shown.map((v, i) => (
          <p key={i} dir={dir} className="text-sm text-main leading-relaxed whitespace-pre-line">{v}</p>
        ))}
      </div>
    );

  return (
    <div className={className}>
      <div className="relative inline-flex items-center gap-2">
        {!noTranslate && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-soft bg-card text-main hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-60 ${triggerClassName}`}
          >
            <span aria-hidden className="text-sm leading-none">🌐</span>
            {label}
            {busy && <Spinner className="w-3 h-3 text-brand-600" />}
          </button>
        )}
        {err && <span dir="rtl" className="text-[11px] text-red-500">{err}</span>}

        {open && (
          <div className={`absolute z-30 mt-1.5 top-full w-48 py-1.5 rounded-xl border border-soft bg-card shadow-lg dark:bg-slate-800 ${align === 'left' ? 'left-0' : 'right-0'}`}>
            <button
              type="button"
              onClick={() => go('en')}
              className={`block w-full text-right px-3 py-1.5 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 ${view === 'en' && translated ? 'text-brand-600' : 'text-main'}`}
            >
              {DIR_LABELS.ar}
            </button>
            <button
              type="button"
              onClick={() => go('ar')}
              className={`block w-full text-right px-3 py-1.5 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 ${view === 'ar' && translated ? 'text-brand-600' : 'text-main'}`}
            >
              {DIR_LABELS.en}
            </button>
            <div className="my-1 h-px bg-slate-200 dark:bg-slate-700 mx-3" />
            <button
              type="button"
              onClick={reset}
              className="block w-full text-right px-3 py-1.5 text-xs font-bold text-muted hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              عرض الأصل
            </button>
          </div>
        )}
      </div>
      {content}
    </div>
  );
}