import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Card, Badge, Spinner } from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';
import TranslationBox from '../components/TranslationBox.jsx';

function parseList(str, fallback = []) {
  try {
    const arr = JSON.parse(str || '[]');
    return Array.isArray(arr) ? arr : fallback;
  } catch {
    return fallback;
  }
}

// استخراج لغة السؤال/الجواب من الحقول المنظمة أو النص المركّب
function resolveLang(q) {
  // الأولوية للحقول المنظمة من قاعدة البيانات
  const qEn = (q.question_en || '').trim();
  const qAr = (q.question_ar || '').trim();
  const aEn = (q.answer_en || '').trim();
  const aAr = (q.answer_ar || '').trim();

  // كل سطر بلغة واحدة نقية: إنجليزي نقي أو عربي نقي (لا خلط مطلقًا)
  const pureEn = (t) => (/[a-zA-Z]/.test(t) && !/[\u0600-\u06FF]/.test(t) ? t : '');
  const pureAr = (t) => (/[\u0600-\u06FF]/.test(t) && !/[a-zA-Z]/.test(t) ? t : '');

  let res = { qEn: pureEn(qEn), qAr: pureAr(qAr), aEn: pureEn(aEn), aAr: pureAr(aAr) };
  const hadEnglishQ = Boolean(qEn);
  const hadEnglishA = Boolean(aEn);

  // حال عدم توفر ترجمة في الاتجاه المطلوب: استرجاع اللغة المتاحة دون خلط أبدًا
  if (hadEnglishQ && (res.qAr || res.aAr)) {
    // نعرض العربي إن وُجد، وإلا نلجأ للإنجليزي
    res.qAr = res.qAr || res.qEn;
    res.aAr = res.aAr || res.aEn;
  } else {
    res.qEn = res.qEn || res.qAr;
    res.aEn = res.aEn || res.aAr;
  }

  // خلاف ذلك تحليل النص المركّب: س (Q): <en>\n<ar>\n\nج (A): <en>\n<ar>
  const text = q.text || '';
  const qaMark = text.split('\n\nج (A):');
  const question = (qaMark.length > 1 ? qaMark[0].replace('س (Q):', '').trim() : text).split('\n').map((p) => p.trim()).filter(Boolean);
  const answer = (qaMark.length > 1 ? qaMark[1].trim() : '').split('\n').map((p) => p.trim()).filter(Boolean);
  const pickEn = (parts) => (parts.find((p) => /[a-zA-Z]/.test(p) && !/[\u0600-\u06FF]/.test(p)) || '');
  const pickAr = (parts) => (parts.find((p) => /[\u0600-\u06FF]/.test(p)) || '');
  return {
    ...res,
    qEn: res.qEn || pureEn(pickEn(question)) || pickEn(question),
    qAr: res.qAr || pureAr(pickAr(question)) || pickAr(question),
    aEn: res.aEn || pureEn(pickEn(answer)) || pickEn(answer),
    aAr: res.aAr || pureAr(pickAr(answer)) || pickAr(answer),
    translated: hadEnglishQ && hadEnglishA,
  };
}

const stripQa = (v) => String(v || '').replace(/^\s*(س|ج|Q|A)[:：]\s*/, '').trim();

// ===================== أدوات الأسئلة التفاعلية =====================

function parseOpts(s) {
  try { return JSON.parse(s || 'null'); } catch { return null; }
}

// توصيل: اختر عنصرًا من اليسار ثم انقر نظيرَه من اليمين لربطهما
function MatchingCard({ q, index }) {
  const opts = parseOpts(q.options);
  const correct = (() => { try { return JSON.parse(q.correct_answer || '[]'); } catch { return []; } })();
  if (!opts) return null;
  const left = opts.left || [];
  const right = opts.right || [];
  const [rOrder] = useState(() => [...right].sort(() => Math.random() - 0.5));
  const [sel, setSel] = useState(null);
  const [links, setLinks] = useState({});
  const [checked, setChecked] = useState(false);

  const isRight = (lId, rId) => correct.some((c) => c[0] === lId && c[1] === rId);
  const done = Object.keys(links).length === left.length;
  const allCorrect = done && left.every((l) => links[l.id] && isRight(l.id, links[l.id]));

  const clickLeft = (id) => { setChecked(false); setSel((s) => (s === id ? null : id)); };
  const clickRight = (rid) => {
    setChecked(false);
    if (!sel) return;
    setLinks((l) => {
      const next = { ...l };
      if (next[sel] === rid) delete next[sel];
      else next[sel] = rid;
      return next;
    });
    setSel(null);
  };

  return (
    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-soft">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-bold flex items-center justify-center text-xs shrink-0">{index}</span>
        <span className="text-xs font-bold text-violet-700 dark:text-violet-300">توصيل</span>
      </div>
      <p className="text-sm font-semibold text-main mb-3 leading-relaxed" dir="auto">{q.text}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          {left.map((l) => (
            <button key={l.id} onClick={() => clickLeft(l.id)}
              className={`w-full text-right p-2.5 rounded-lg border text-xs transition ${sel === l.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 ring-1 ring-brand-500' : links[l.id] ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20' : 'border-soft bg-card hover:border-brand-300'}`}>
              <div dir="auto" className="text-main leading-relaxed">{l.label}</div>
              {links[l.id] && <div className="text-[10px] text-emerald-600 mt-0.5 truncate" dir="auto">← {right.find((r) => r.id === links[l.id])?.label}</div>}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          {rOrder.map((r) => {
            const connected = Object.entries(links).some(([lid, rid]) => rid === r.id);
            return (
              <button key={r.id} onClick={() => clickRight(r.id)}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition ${connected ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 opacity-60' : sel ? 'border-brand-300 bg-card hover:shadow-soft' : 'border-soft bg-card opacity-60 hover:border-brand-300'}`}>
                <div dir="auto" className="text-main leading-relaxed">{r.label}</div>
              </button>
            );
          })}
        </div>
      </div>
      {(done || checked) && (
        <div className="mt-3 text-xs font-bold">
          {checked ? (allCorrect
            ? <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><Icon name="check" className="w-4 h-4" /> التوصيل صحيح بالكامل</span>
            : <span className="text-amber-600 dark:text-amber-400">عمود اليسار مكتمل لكن هناك ربطًا غير صحيح — راجعه</span>)
            : <span className="text-muted">اكتمل التوصيل — اضغط «تحقق»</span>}
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        <button disabled={!done}
          onClick={() => { setChecked(true); if (allCorrect) { /* لا شيء */ } }}
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 transition disabled:opacity-40">
          تحقق من التوصيل
        </button>
        <button onClick={() => { setLinks({}); setChecked(false); setSel(null); }}
          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-soft text-muted hover:border-brand-300 transition">
          إعادة
        </button>
      </div>
      {checked && q.explanation && (
        <div className="mt-3 text-xs text-muted leading-relaxed border-t border-soft pt-2" dir="auto"><span className="font-bold text-brand-600">الشرح:</span> {q.explanation}</div>
      )}
    </div>
  );
}

// ترتيب: انقل الخطوات أعلى/أسفل لتكوين التسلسل الصحيح
function OrderingCard({ q, index }) {
  const opts = parseOpts(q.options);
  const correct = (() => { try { return JSON.parse(q.correct_answer || '[]'); } catch { return []; } })();
  if (!opts) return null;
  const steps = opts.steps || [];
  const [order, setOrder] = useState(() => [...steps].sort(() => Math.random() - 0.5));
  const [checked, setChecked] = useState(false);

  const move = (i, dir) => {
    setChecked(false);
    setOrder((o) => {
      const next = [...o];
      const j = i + dir;
      if (j < 0 || j >= next.length) return o;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const okIds = order.map((s) => s.id);
  const allCorrect = okIds.every((id, i) => correct[i] === id);

  return (
    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-soft">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-6 h-6 rounded-lg bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 font-bold flex items-center justify-center text-xs shrink-0">{index}</span>
        <span className="text-xs font-bold text-cyan-700 dark:text-cyan-300">ترتيب</span>
      </div>
      <p className="text-sm font-semibold text-main mb-3 leading-relaxed" dir="auto">{q.text}</p>
      <div className="space-y-1.5">
        {order.map((s, i) => {
          const wrongPos = checked && correct[i] !== s.id;
          return (
            <div key={s.id} className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs transition ${checked && !allCorrect && correct[i] === s.id ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20' : wrongPos ? 'border-rose-300 bg-rose-50 dark:bg-rose-900/20' : 'border-soft bg-card'}`}>
              <span className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 text-muted font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <span dir="auto" className="flex-1 text-main">{s.label}</span>
              <div className="flex flex-col gap-0.5 shrink-0">
                <button disabled={i === 0} onClick={() => move(i, -1)} className="p-1 rounded text-muted hover:text-brand-600 disabled:opacity-30 transition" title="أعلى">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="18 15 12 9 6 15" /></svg>
                </button>
                <button disabled={i === order.length - 1} onClick={() => move(i, 1)} className="p-1 rounded text-muted hover:text-brand-600 disabled:opacity-30 transition" title="أسفل">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button onClick={() => { setChecked(true); }}
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-600 text-white hover:bg-cyan-700 transition">
          تحقق من الترتيب
        </button>
        <button onClick={() => { setOrder([...steps].sort(() => Math.random() - 0.5)); setChecked(false); }}
          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-soft text-muted hover:border-brand-300 transition">
          خلط وإعادة
        </button>
      </div>
      {checked && (
        <div className="mt-2 text-xs font-bold">{allCorrect
          ? <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><Icon name="check" className="w-4 h-4" /> الترتيب صحيح</span>
          : <span className="text-amber-600 dark:text-amber-400">بعض المواضع غير صحيحة — المواضع الصحيحة مظللة أعلاه</span>}
        </div>
      )}
      {checked && q.explanation && (
        <div className="mt-3 text-xs text-muted leading-relaxed border-t border-soft pt-2" dir="auto"><span className="font-bold text-brand-600">الشرح:</span> {q.explanation}</div>
      )}
    </div>
  );
}

// عنصر سؤال/جواب مع زر الترجمة 🌐
function QaCard({ q, index }) {
  const parts = resolveLang(q);
  const qAr = parts.qAr || parts.qEn || '';
  const aAr = parts.aAr || parts.aEn || '';
  const hasStoredEn = parts.translated && parts.qEn && parts.aEn;
  const items = [`س: ${qAr}`, `ج: ${aAr}`];

  return (
    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-soft">
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-bold flex items-center justify-center text-xs shrink-0">{index}</span>
          <span className="text-xs text-muted">{parts.aAr || q.topic || 'سؤال وجواب'}</span>
        </span>
      </div>

      <TranslationBox
        parts={items}
        source="ar"
        staticValue={hasStoredEn ? { en: `${parts.qEn}\n${parts.aEn}` } : null}
        render={(vals, view, { dir }) => (
          <div>
            {/* السؤال */}
            <div className="mb-2">
              <div className="flex items-start gap-2">
                <span className="text-brand-600 font-black text-sm shrink-0 ml-1">س:</span>
                <p className="text-sm font-semibold text-main leading-relaxed" dir={dir} style={{ textAlign: dir === 'ltr' ? 'left' : 'right' }}>
                  {stripQa(vals[0])}
                </p>
              </div>
            </div>
            {/* الإجابة */}
            <div className="border-t border-soft pt-2">
              <div className="flex items-start gap-2">
                <span className="text-green-600 dark:text-green-400 font-black text-sm shrink-0 ml-1">ج:</span>
                <p className="text-sm text-main leading-relaxed" dir={dir} style={{ textAlign: dir === 'ltr' ? 'left' : 'right' }}>
                  {stripQa(vals[1])}
                </p>
              </div>
            </div>
          </div>
        )}
      />
    </div>
  );
}

export default function Summaries() {
  const [lectures, setLectures] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/lectures').then((l) => {
      const ready = l.filter((x) => x.status === 'ready');
      setLectures(ready);
      if (ready.length) {
        setSelected(ready[0].id);
        setDetail(null);
        api.get('/lectures/' + ready[0].id).then(setDetail);
      }
      setLoading(false);
    });
  }, []);

  const select = async (id) => {
    setSelected(id);
    setDetail(null);
    api.get('/lectures/' + id).then(setDetail);
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner className="w-10 h-10 text-brand-600" /></div>;
  if (!lectures.length) {
    return (
      <Card className="p-12 text-center text-muted">
        <Icon name="summary" className="w-12 h-12 mx-auto mb-3 opacity-40" />
        لا توجد محاضرات محلّلة بعد. ارفع محاضرة من قسم "المحاضرات" أولًا.
      </Card>
    );
  }

  const keyPoints = detail?.summary ? parseList(detail.summary.key_points, []) : [];
  const terms = detail?.summary ? parseList(detail.summary.important_terms, []) : [];
  const review = detail?.summary ? parseList(detail.summary.review_topics, []) : [];
  const qaList = (detail?.questions || []).filter((q) => q.type === 'qa');
  const mcqs = (detail?.questions || []).filter((q) => q.type === 'mcq');
  const tfs = (detail?.questions || []).filter((q) => q.type === 'truefalse');
  const matches = (detail?.questions || []).filter((q) => q.type === 'matching');
  const orders = (detail?.questions || []).filter((q) => q.type === 'ordering');

  // تحليل نص الملخص المنظّم إلى عناوين/أسطر
  function renderSummary(summaryText) {
    if (!summaryText) return null;
    const lines = summaryText.split('\n');
    const els = [];
    let inBoldSection = null;
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      const headingMatch = t.match(/^\*\*(.+?)\*\*\s*$/);
      if (headingMatch) {
        els.push(<h3 key={els.length} className="font-bold text-main mt-4 mb-1.5 first:mt-0 text-sm">{headingMatch[1]}</h3>);
        inBoldSection = null;
        continue;
      }
      const numbered = t.match(/^(\d+)[.)]\s*\*\*(.+?)\*\*\s*:\s*(.*)$/);
      if (numbered) {
        els.push(
          <div key={els.length} className="flex gap-2 text-sm text-main leading-relaxed mb-1.5">
            <span className="text-brand-600 font-bold shrink-0">{numbered[1]}.</span>
            <span><span className="font-bold text-brand-700 dark:text-brand-300">{numbered[2]}:</span> {numbered[3]}</span>
          </div>
        );
        continue;
      }
      const simpleNum = t.match(/^(\d+)[.)]\s*(.*)$/);
      if (simpleNum) {
        els.push(
          <div key={els.length} className="flex gap-2 text-sm text-main leading-relaxed mb-1.5">
            <span className="text-brand-600 font-bold shrink-0">{simpleNum[1]}.</span>
            <span>{simpleNum[2]}</span>
          </div>
        );
        continue;
      }
      els.push(<p key={els.length} className="text-sm text-main leading-relaxed mb-1.5">{t}</p>);
    }
    return els;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-main">الملخصات والتحليل</h1>
        <p className="text-muted text-sm">ملخص منظّم، نقاط تركيز مختصرة، وأسئلة وأجوبة ثنائية مع خيار الترجمة</p>
      </div>

      {/* اختيار المحاضرة */}
      <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-2">
        {lectures.map((l) => (
          <button
            key={l.id}
            onClick={() => select(l.id)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-bold border transition ${selected === l.id ? 'bg-gradient-to-l from-brand-600 to-violet-600 text-white border-brand-600 shadow-glow' : 'bg-card border-soft text-muted hover:border-brand-400 hover:shadow-soft'}`}
          >
            {l.title}
          </button>
        ))}
      </div>

      {!detail ? (
        <div className="flex justify-center py-16"><Spinner className="w-8 h-8 text-brand-600" /></div>
      ) : (
        <>
{/* الملخص المنظّم */}
      <Card className="p-6 lift" gradientTop>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="font-extrabold text-main flex items-center gap-2">
            <div className="p-2 rounded-lg bg-brand-100 dark:bg-brand-900/40 text-brand-600">
              <Icon name="summary" className="w-5 h-5" />
            </div>
            ملخص المحاضرة
          </h2>
          <Link to={'/chat/' + selected} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-brand-600 to-violet-600 text-white px-3.5 py-2 text-sm font-bold hover:brightness-110 transition shadow-glow">
            <Icon name="chat" className="w-4 h-4" /> تحدث عن المحاضرة
          </Link>
        </div>
        <TranslationBox
          parts={[detail.summary?.summary || '']}
          render={(vals) => renderSummary(vals[0]) || <p className="text-muted text-sm">لا يوجد ملخص</p>}
        />
      </Card>

          {/* نقاط التركيز */}
          <Card className="p-6 lift" gradientTop>
            <h2 className="font-extrabold text-main mb-1 flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600">
                <Icon name="target" className="w-5 h-5" />
              </div>
              نقاط التركيز للحفظ
            </h2>
            <p className="text-xs text-muted mb-3">هذه المواضع التي يُنصح الطالب بالتركيز عليها أثناء المذاكرة</p>
            {keyPoints.length ? (
              <TranslationBox
                parts={keyPoints}
                render={(vals) => (
                  <div className="grid md:grid-cols-2 gap-2">
                    {vals.map((p, i) => (
                      <div key={i} className="flex gap-2 p-3 rounded-xl bg-amber-50/60 dark:bg-amber-900/15 border border-amber-100 dark:border-amber-900/30">
                        <Icon name="sparkles" className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-main leading-relaxed">{String(p).replace(/^\d+[.)]\s*/, '')}</p>
                      </div>
                    ))}
                  </div>
                )}
              />
            ) : <p className="text-muted text-sm">لا توجد نقاط تركيز.</p>}
          </Card>

          {/* المصطلحات + المواضيع */}
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <h2 className="font-bold text-main mb-3 flex items-center gap-2">
                <Icon name="book" className="w-5 h-5 text-violet-500" />
                المصطلحات المهمة
              </h2>
              {terms.length ? (
                <div className="flex flex-wrap gap-2">
                  {terms.map((t, i) => <Badge key={i} tone="violet">{t}</Badge>)}
                </div>
              ) : <p className="text-muted text-sm">لا توجد مصطلحات</p>}
            </Card>
            <Card className="p-6">
              <h2 className="font-bold text-main mb-3 flex items-center gap-2">
                <Icon name="alert" className="w-5 h-5 text-amber-500" />
                مواضيع تحتاج مراجعة
              </h2>
              {review.length ? (
                <div className="flex flex-wrap gap-2">
                  {review.map((t, i) => <Badge key={i} tone="amber">{t}</Badge>)}
                </div>
              ) : (
                <p className="text-muted text-sm">جميع المواضيع واضحة حسب التحليل الحالي.</p>
              )}
            </Card>
          </div>

          {/* الأسئلة والأجوبة مع الترجمة */}
          <Card className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <h2 className="font-bold text-main flex items-center gap-2">
                <Icon name="quiz" className="w-5 h-5 text-brand-600" />
                أسئلة وأجوبة ({qaList.length})
              </h2>
              <span className="text-xs text-muted">اضغط 🌐 ترجمة لتحويل السؤال والإجابة بين العربية والإنجليزية</span>
            </div>
            <div className="space-y-3 mt-3">
              {qaList.map((q, i) => <QaCard key={q.id} q={q} index={i + 1} />)}
              {!qaList.length && <p className="text-muted text-sm">لا توجد أسئلة وأجوبة مرتبة بعد.</p>}
            </div>
          </Card>

          {/* أسئلة تفاعلية: توصيل + ترتيب */}
          {(matches.length || orders.length) && (
            <Card className="p-6">
              <h2 className="font-bold text-main mb-4 flex items-center gap-2">
                <Icon name="target" className="w-5 h-5 text-violet-600" />
                أسئلة تفاعلية — توصيل وترتيب ({matches.length + orders.length})
              </h2>
              <div className="space-y-3">
                {matches.map((q, i) => <MatchingCard key={q.id} q={q} index={i + 1} />)}
                {orders.map((q, i) => <OrderingCard key={q.id} q={q} index={i + 1} />)}
              </div>
            </Card>
          )}

          {/* أسئلة الاختبار (MCQ + صح/خطأ) */}
          {(mcqs.length || tfs.length) && (
            <Card className="p-6">
              <h2 className="font-bold text-main mb-4 flex items-center gap-2">
                <Icon name="target" className="w-5 h-5 text-brand-600" />
                أسئلة اختبار المحاضرة (اختيار من متعدد + صح/خطأ) — {mcqs.length + tfs.length}
              </h2>
              <div className="space-y-3">
                {mcqs.map((q) => {
                  const opts = q.options ? JSON.parse(q.options) : {};
                  const oKeys = Object.keys(opts);
                  const parts = [q.text, ...oKeys.map((k) => opts[k])];
                  if (q.explanation) parts.push(String(q.explanation));
                  return (
                    <div key={q.id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-soft">
                      <TranslationBox
                        parts={parts}
                        render={(vals) => {
                          const exp = vals.length === 1 + oKeys.length + (q.explanation ? 1 : 0) && q.explanation ? vals[vals.length - 1] : null;
                          return (
                            <>
                              <div className="font-semibold text-main text-sm mb-2">{vals[0]}</div>
                              {oKeys.length ? (
                                <div className="grid sm:grid-cols-2 gap-1.5 mb-2">
                                  {oKeys.map((k, i) => (
                                    <div key={k} className={`text-sm px-3 py-1.5 rounded-lg ${k === q.correct_answer ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-semibold' : 'text-muted'}`}>
                                      {k}: {vals[1 + i]}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              <div className="text-xs text-muted mt-1"><span className="font-bold text-brand-600">الإجابة الصحيحة: </span>{q.correct_answer}</div>
                              {exp && <div className="text-xs text-muted mt-1"><span className="font-bold text-brand-600">شرح: </span>{exp}</div>}
                            </>
                          );
                        }}
                      />
                    </div>
                  );
                })}
                {tfs.map((q) => (
                  <div key={q.id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-soft">
                    <TranslationBox
                      parts={[q.text]}
                      render={(vals) => (
                        <>
                          <div className="font-semibold text-main text-sm mb-1">{vals[0]}</div>
                          <div className="text-sm">
                            <span className="font-bold text-brand-600">الإجابة: </span>
                            <Badge tone={q.correct_answer === '1' ? 'green' : 'red'}>{q.correct_answer === '1' ? 'صحيح' : 'خطأ'}</Badge>
                          </div>
                        </>
                      )}
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
