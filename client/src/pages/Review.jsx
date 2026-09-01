import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { Card, Button, Badge, Spinner, Progress } from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';
import TranslationBox, { detectLang } from '../components/TranslationBox.jsx';

const DUE_LABEL = (d) => (d === 0 ? 'مستحق اليوم' : d === 1 ? 'غدًا' : `بعد ${d} أيام`);

const GRADES = [
  { v: 1, label: 'أكملها مرّة أخرى', desc: 'لم أتذكرها', cls: 'from-rose-500 to-red-600 text-white shadow-glow-red' },
  { v: 3, label: 'صعب', desc: 'تذكرتها بصعوبة', cls: 'from-amber-500 to-orange-600 text-white' },
  { v: 4, label: 'جيد', desc: 'تذكرتها', cls: 'from-brand-600 to-violet-600 text-white shadow-glow' },
  { v: 5, label: 'سهل', desc: 'تذكرتها فورًا', cls: 'from-emerald-500 to-teal-600 text-white' },
];

function ReviewTopicFlow({ autoStart, onErr }) {
  const nav = useNavigate();
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [session, setSession] = useState(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [chosen, setChosen] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get('/reviews/queue')
      .then(async (q) => {
        setQueue(q);
        setLoading(false);
        if (autoStart) {
          const found = [...q.due, ...q.empty].find((s) => s.topic === autoStart);
          if (found && found.available > 0) await startSession(found.topic);
          else setErr('لا توجد أسئلة عن هذا الموضوع بعد.');
        }
      })
      .catch((e) => { setErr(e.message); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSession = async (topic) => {
    setErr('');
    setLoading(true);
    try {
      const s = await api.post('/reviews/session', { topic, count: 6 });
      setSession(s);
      setIdx(0);
      setAnswers({});
      setChosen(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const pick = (value) => {
    if (chosen !== null) return;
    setChosen(value);
    setAnswers((a) => ({ ...a, [session.questions[idx].id]: value }));
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload = session.questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? '' }));
      const d = await api.post('/results/submit', { examId: session.examId, answers: payload, startedAt: new Date().toISOString(), skipAi: true });
      nav('/results/' + d.resultId, { state: { result: d } });
    } catch (e) {
      setErr(e.message);
      setSubmitting(false);
    }
  };

  if (session) {
    const q = session.questions[idx];
    const opts = q.options || {};
    const oKeys = Object.keys(opts);
    const answeredN = Object.keys(answers).length;
    const correctForQ = String(q.correctAnswer).trim();
    const chosenForQ = chosen !== null ? String(chosen) : null;
    const revealed = chosenForQ !== null;
    const wasRight = revealed && chosenForQ === correctForQ;
    const isLast = idx === session.questions.length - 1;

    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600">
              <Icon name="repeat" className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-main">مراجعة: {session.topic}</h1>
              <p className="text-xs text-muted">بطاقة {idx + 1} من {session.questions.length}</p>
            </div>
          </div>
          <Badge tone={answeredN === session.questions.length ? 'green' : 'blue'}>{answeredN}/{session.questions.length} أُجيب</Badge>
        </div>

        <Progress value={(idx / session.questions.length) * 100} className="h-2" />

        {err && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-lg">{err}</div>}

        <Card className="p-6 lift">
          <div className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 font-extrabold flex items-center justify-center mb-4">
            {idx + 1}
          </div>

          <TranslationBox parts={q.type === 'mcq' ? [q.text, ...oKeys.map((k) => opts[k])] : [q.text]} source={detectLang(q.text)} noTranslate render={(vals, _view, { dir }) => (
            <>
              <div dir={dir} style={{ textAlign: dir === 'ltr' ? 'left' : 'right' }} className="font-extrabold text-lg text-main mb-5">
                {vals[0]}
              </div>

              {q.type === 'mcq' ? (
                <div className="space-y-2">
                  {oKeys.map((k, i) => {
                    const val = String(k);
                    const isSel = revealed && chosenForQ === val;
                    const isCorrectOpt = revealed && correctForQ === val;
                    return (
                      <button
                        key={k}
                        disabled={revealed}
                        onClick={() => pick(val)}
                        className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-right transition ${
                          revealed
                            ? isCorrectOpt
                              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                              : isSel
                                ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20'
                                : 'border-soft opacity-60'
                            : 'border-soft bg-card hover:border-brand-400 hover:shadow-soft cursor-pointer'
                        }`}
                      >
                        <span className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${revealed && isCorrectOpt ? 'border-emerald-500 text-emerald-600' : isSel ? 'border-rose-500 text-rose-600' : 'border-soft text-muted'}`}>
                          {revealed && isCorrectOpt ? <Icon name="check" className="w-3.5 h-3.5" /> : k}
                        </span>
                        <span dir={dir} className="text-sm text-main">{vals[1 + i]}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    disabled={revealed}
                    onClick={() => pick('1')}
                    className={`flex-1 p-4 rounded-xl border font-bold transition ${
                      revealed
                        ? '1' === correctForQ
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700'
                          : chosenForQ === '1'
                            ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20 text-rose-700'
                            : 'border-soft opacity-60'
                        : 'border-soft bg-card hover:border-emerald-400 hover:shadow-soft cursor-pointer text-main'
                    }`}
                  >
                    صحيح
                  </button>
                  <button
                    disabled={revealed}
                    onClick={() => pick('0')}
                    className={`flex-1 p-4 rounded-xl border font-bold transition ${
                      revealed
                        ? '0' === correctForQ
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700'
                          : chosenForQ === '0'
                            ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20 text-rose-700'
                            : 'border-soft opacity-60'
                        : 'border-soft bg-card hover:border-rose-400 hover:shadow-soft cursor-pointer text-main'
                    }`}
                  >
                    خطأ
                  </button>
                </div>
              )}
            </>
          )} />

          {revealed && (
            <div className={`mt-4 rounded-xl border p-4 ${wasRight ? 'border-emerald-200 bg-emerald-50/70 dark:bg-emerald-900/20' : 'border-amber-200 bg-amber-50/70 dark:bg-amber-900/20'}`}>
              <div className={`flex items-center gap-2 font-extrabold text-sm ${wasRight ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                <Icon name={wasRight ? 'check' : 'x'} className="w-4 h-4" />
                {wasRight ? 'إجابة صحيحة' : 'ليست دقيقة'}
              </div>
              {q.explanation ? (
                <div className="text-sm text-main mt-1.5 leading-relaxed" dir="auto">{q.explanation}</div>
              ) : (
                <div className="text-sm text-muted mt-1.5" dir="auto">الإجابة الصحيحة: {correctForQ}</div>
              )}
            </div>
          )}
        </Card>

        <div className="flex items-center justify-between gap-3">
          {revealed ? (
            <Button onClick={() => (isLast ? submit() : (setIdx((i) => i + 1), setChosen(null)))} className="flex-1" disabled={submitting}>
              {submitting ? <Spinner className="w-5 h-5" /> : <Icon name="check" className="w-5 h-5" />}
              {isLast ? 'إنهاء المراجعة' : 'البطاقة التالية'}
            </Button>
          ) : (
            <div className="flex-1 text-center text-xs text-muted">اختر إجابة لإظهار التصحيح</div>
          )}
          <Button variant="ghost" onClick={() => setSession(null)} disabled={submitting}>خروج</Button>
        </div>
      </div>
    );
  }

  const dueToday = queue ? queue.due.filter((s) => s.dueInDays === 0).length : 0;

  return (
    <div className="space-y-6">
      {err && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-lg">{err}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner className="w-8 h-8 text-brand-600" /></div>
      ) : (
        <>
          {queue.due.length > 0 && (
            <div className="grid sm:grid-cols-3 gap-3">
              <Card className="p-5" gradientTop>
                <div className="text-3xl font-black text-amber-600">{dueToday}</div>
                <div className="text-xs text-muted font-bold mt-1">مستحق اليوم</div>
              </Card>
              <Card className="p-5">
                <div className="text-3xl font-black text-main">{queue.due.length}</div>
                <div className="text-xs text-muted font-bold mt-1">موضوع قابل للمراجعة الآن</div>
              </Card>
              <Card className="p-5">
                <div className="text-3xl font-black text-muted">{queue.total}</div>
                <div className="text-xs text-muted font-bold mt-1">نقاط ضعف تراكمية</div>
              </Card>
            </div>
          )}

          {queue.due.map((s, i) => (
            <Card key={i} className="p-5 lift">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-extrabold text-main truncate">{s.topic}</div>
                    <Badge tone={s.dueInDays === 0 ? 'red' : s.dueInDays === 1 ? 'amber' : 'slate'}>{DUE_LABEL(s.dueInDays)}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Progress value={s.accuracy} className="w-40 h-1.5" />
                    <span className={`text-[10px] font-bold ${s.accuracy >= 70 ? 'text-emerald-600 dark:text-emerald-400' : s.accuracy >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      دقة {s.accuracy}%
                    </span>
                  </div>
                  <div className="text-[11px] text-muted mt-1">
                    {s.wrong} خطأ من {s.attempts} إجابة{s.lastAt ? ` • آخر خطأ ${s.lastAt.slice(0, 10)}` : ''}
                  </div>
                </div>
                <Button onClick={() => startSession(s.topic)} disabled={loading || s.available === 0}>
                  <Icon name="repeat" className="w-4 h-4" />
                  راجع الآن ({s.available})
                </Button>
              </div>
            </Card>
          ))}

          {queue.due.length === 0 && (
            <Card className="p-10 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 flex items-center justify-center mb-3">
                <Icon name="award" className="w-7 h-7" />
              </div>
              <div className="text-lg font-extrabold text-main">لا توجد مواضيع مستحقة للمراجعة</div>
              <p className="text-sm text-muted mt-1">ادخل اختبارات جديدة؛ وستظهر هنا مواضيع أخطأت فيها مع أسئلة للمراجعة.</p>
            </Card>
          )}

          {queue.empty.length > 0 && (
            <div className="p-4 rounded-xl border border-soft bg-slate-50/60 dark:bg-slate-800/40">
              <div className="text-xs font-bold text-muted mb-2">مواضيع ضعيفة بلا أسئلة محفوظة (حلّل محاضرة عنها أولًا):</div>
              <div className="flex flex-wrap gap-1.5">
                {queue.empty.map((s, i) => <Badge key={i} tone="slate">{s.topic}</Badge>)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SmartCardsTab() {
  const [stats, setStats] = useState(null);
  const [due, setDue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [cards, setCards] = useState(null);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [grading, setGrading] = useState(false);
  const [counts, setCounts] = useState({ 1: 0, 3: 0, 4: 0, 5: 0 });
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .get('/review-cards/queue')
      .then((q) => { setStats(q.stats); setDue(q.due); setLoading(false); })
      .catch((e) => { setErr(e.message); setLoading(false); });
  }, []);

  const start = async (n) => {
    setErr('');
    setCards(null);
    setTimeout(() => setLoading(true), 0);
    try {
      const s = await api.post('/review-cards/session', { count: n });
      if (!s.cards.length) {
        setErr('لا توجد بطاقات بعد — حلّل محاضرة أولًا لتوليد بنك الأسئلة.');
        setLoading(false);
        return;
      }
      setCards(s.cards);
      setIdx(0);
      setFlipped(false);
      setCounts({ 1: 0, 3: 0, 4: 0, 5: 0 });
      setDone(false);
    } catch (e) {
      setErr(e.message);
      setLoading(false);
    }
  };

  const grade = async (g) => {
    if (grading) return;
    setGrading(true);
    try {
      const card = cards[idx];
      await api.post(`/review-cards/${card.id}/grade`, { grade: g });
      setCounts((c) => ({ ...c, [g]: (c[g] || 0) + 1 }));
      if (idx + 1 < cards.length) {
        setIdx((i) => i + 1);
        setFlipped(false);
      } else {
        setDone(true);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setGrading(false);
    }
  };

  // جلسة البطاقات
  if (cards && !done) {
    const card = cards[idx];
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-brand-100 dark:bg-brand-900/40 text-brand-700">
              <Icon name="repeat" className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-main">جلسة بطاقات ذكية</h1>
              <p className="text-xs text-muted">بطاقة {idx + 1} من {cards.length}</p>
            </div>
          </div>
          {card.topic && <Badge tone="violet">{card.topic}</Badge>}
        </div>

        <Progress value={(idx / cards.length) * 100} className="h-2" />
        {err && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-lg">{err}</div>}

        <Card className="p-8 lift">
          <div className="perspective-1000">
            <div key={`${card.id}-${flipped}`} className="flip-in">
              {!flipped ? (
                <div>
                  <div className="text-xs font-bold text-muted mb-3">✦ السؤال</div>
                  <div className="font-extrabold text-lg text-main leading-relaxed" dir="auto">{card.front}</div>
                </div>
              ) : (
                <div>
                  <div className="text-xs font-bold text-brand-600 dark:text-brand-300 mb-3">✦ الإجابة</div>
                  <div className="text-main leading-relaxed whitespace-pre-wrap" dir="auto">{card.back}</div>
                </div>
              )}
            </div>
          </div>
        </Card>

        {!flipped ? (
          <Button onClick={() => setFlipped(true)} className="w-full py-3.5" disabled={loading}>
            <Icon name="sparkles" className="w-5 h-5" /> إظهار الإجابة
          </Button>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {GRADES.map((gr) => (
              <Button key={gr.v} onClick={() => grade(gr.v)} disabled={grading} className={`flex-col !gap-1 py-4 bg-gradient-to-r ${gr.cls}`}>
                <span className="text-sm font-bold">{gr.label}</span>
                <span className="text-[10px] opacity-80 font-medium">{gr.desc}</span>
              </Button>
            ))}
          </div>
        )}
        <div className="text-center">
          <Button variant="ghost" onClick={() => setCards(null)}>إنهاء الجلسة</Button>
        </div>
      </div>
    );
  }

  // شاشة النهاية
  if (cards && done) {
    const total = cards.length;
    const ok = counts[4] + counts[5];
    return (
      <div className="max-w-xl mx-auto space-y-6 py-10">
        <Card className="p-8 text-center lift">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 flex items-center justify-center mb-4">
            <Icon name="award" className="w-9 h-9" />
          </div>
          <h2 className="text-2xl font-extrabold text-main">أنجزت {total} بطاقات</h2>
          <p className="text-sm text-muted mt-1">تابع مراجعاتك يوميًا لتثبيت المعلومات في الذاكرة طويلة المدى.</p>

          <div className="grid grid-cols-4 gap-3 mt-6">
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20">
              <div className="text-2xl font-black text-rose-600">{counts[1]}</div>
              <div className="text-[11px] font-bold text-muted">مرة أخرى</div>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <div className="text-2xl font-black text-amber-600">{counts[3]}</div>
              <div className="text-[11px] font-bold text-muted">صعب</div>
            </div>
            <div className="p-3 rounded-xl bg-brand-50 dark:bg-brand-900/20">
              <div className="text-2xl font-black text-brand-700">{counts[4]}</div>
              <div className="text-[11px] font-bold text-muted">جيد</div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
              <div className="text-2xl font-black text-emerald-600">{counts[5]}</div>
              <div className="text-[11px] font-bold text-muted">سهل</div>
            </div>
          </div>

          <div className="mt-4 text-sm text-muted">
            {ok / total >= 0.8 ? 'أداء ممتاز — ستتأخر هذه البطاقات تلقائيًا حسب الإتقان.' : 'بخير — البطاقات الصعبة ستعود لك قريبًا حتى تتقنها.'}
          </div>

          <div className="flex justify-center gap-3 mt-6">
            <Button onClick={() => start(Math.min(12, (cards?.length || 12)))}>
              <Icon name="repeat" className="w-4 h-4" /> جلسة أخرى
            </Button>
            <Button variant="ghost" onClick={() => setCards(null)}>العودة للطابور</Button>
          </div>
        </Card>
      </div>
    );
  }

  // شاشة الطابور الرئيسية
  const noCards = stats && stats.total === 0;
  return (
    <div className="space-y-6">
      {err && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-lg">{err}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner className="w-8 h-8 text-brand-600" /></div>
      ) : (
        <>
          <Card className="p-6 lift">
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 text-white flex items-center justify-center shadow-glow">
                <Icon name="repeat" className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className="font-extrabold text-main text-lg">المراجعة المتباعدة الذكية (SM-2)</div>
                <p className="text-xs text-muted">البطاقات المستحقة تظهر أولًا، ثم الجديدة. تقييمك (مرة أخرى/صعب/جيد/سهل) يضبط الفترة التالية تلقائيًا — من يسهل عليه الأمر يبتعد، ومن يتعثر يعود قريبًا.</p>
              </div>
              <Button onClick={() => start(12)} disabled={noCards}>
                <Icon name="sparkles" className="w-4 h-4" />
                {noCards ? 'لا توجد بطاقات بعد' : 'ابدأ جلسة (12)'}
              </Button>
            </div>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="p-4">
              <div className="text-3xl font-black text-rose-600">{stats.due}</div>
              <div className="text-xs text-muted font-bold mt-1">مستحقة الآن</div>
            </Card>
            <Card className="p-4">
              <div className="text-3xl font-black text-brand-700">{stats.new}</div>
              <div className="text-xs text-muted font-bold mt-1">جديدة لم تُراجع</div>
            </Card>
            <Card className="p-4">
              <div className="text-3xl font-black text-amber-600">{stats.learning}</div>
              <div className="text-xs text-muted font-bold mt-1">قيد التعلم</div>
            </Card>
            <Card className="p-4">
              <div className="text-3xl font-black text-emerald-600">{stats.review}</div>
              <div className="text-xs text-muted font-bold mt-1">في المراجعة</div>
            </Card>
            <Card className="p-4">
              <div className="text-3xl font-black text-muted">{stats.total}</div>
              <div className="text-xs text-muted font-bold mt-1">إجمالي البطاقات</div>
            </Card>
          </div>

          {due.length > 0 && (
            <div>
              <h3 className="font-bold text-main mb-3">الطابور المستحق الآن</h3>
              <div className="space-y-2">
                {due.map((c) => (
                  <Card key={c.id} className="p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-main font-medium truncate" dir="auto">{c.front}</div>
                        <div className="text-[11px] text-muted mt-0.5">{c.topic}{c.lapses ? ` • تعثرت ${c.lapses} مرات` : ''}</div>
                      </div>
                      <Badge tone="amber">{c.state === 'relearning' ? 'تعثر' : 'مستحقة'}</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Review() {
  const [params] = useSearchParams();
  const autoStart = params.get('start');
  const [tab, setTab] = useState(autoStart ? 'topic' : 'cards');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-main">بطاقات المراجعة</h1>
        <p className="text-muted text-sm">مراجعة متباعدة ذكية بإنقاذ SM-2 على أسئلة بنكك، بالإضافة لمراجعة مواضيع نقاط الضعف.</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab('cards')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'cards' ? 'text-white bg-gradient-to-l from-brand-600 via-brand-500 to-violet-600 shadow-glow' : 'text-muted bg-card border border-soft hover:text-main'}`}
        >
          <Icon name="repeat" className="w-4 h-4" /> بطاقات ذكية
        </button>
        <button
          onClick={() => setTab('topic')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'topic' ? 'text-white bg-gradient-to-l from-brand-600 via-brand-500 to-violet-600 shadow-glow' : 'text-muted bg-card border border-soft hover:text-main'}`}
        >
          <Icon name="target" className="w-4 h-4" /> مواضيع الضعف
        </button>
      </div>

      {tab === 'cards' ? <SmartCardsTab /> : <ReviewTopicFlow autoStart={autoStart} />}
    </div>
  );
}