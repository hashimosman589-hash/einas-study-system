import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { Card, Button, Badge, Spinner, Input } from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';
import TranslationBox, { detectLang } from '../components/TranslationBox.jsx';

export default function Exams() {
  const [sources, setSources] = useState([]);
  const [weakFocus, setWeakFocus] = useState([]);
  const [count, setCount] = useState(10);
  const [duration, setDuration] = useState(15);
  const [selected, setSelected] = useState([]);
  const [mode, setMode] = useState('smart'); // 'smart' AI من المحتوى+الملخص | 'stored' أسئلة محفوظة
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const nav = useNavigate();
  const timerRef = useRef(null);

  useEffect(() => {
    api.get('/exams/sources').then(setSources).catch(() => api.get('/lectures').then((l) => setSources(l.filter((x) => x.status === 'ready'))));
    api.get('/exams/weak-focus').then((d) => setWeakFocus(d.topics || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (selected.length && mode === 'stored' && sources.length) {
      const total = sources.filter((s) => selected.includes(s.id)).reduce((a, s) => a + s.totalCount, 0);
      setCount((c) => Math.min(c, Math.max(total, 5)));
    }
  }, [selected, mode, sources]);

  const toggleSelect = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const selectAll = () => {
    setSelected(sources.length ? sources.map((s) => s.id) : []);
  };

  const generate = async () => {
    setLoading(true); setErr('');
    try {
      const d = await api.post('/exams/generate', { lectureIds: selected, count, duration, mode });
      setExam(d);
      setTimeLeft(duration * 60);
      setAnswers({});
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  // المؤقّت
  useEffect(() => {
    if (exam && timeLeft > 0) {
      timerRef.current = setInterval(() => setTimeLeft((t) => t - 1), 1000);
      return () => clearInterval(timerRef.current);
    }
    if (timeLeft === 0 && exam) submit(true);
  }, [exam, timeLeft]);

  const setAns = (qid, val) => setAnswers((a) => ({ ...a, [qid]: val }));

  const submit = async (auto = false) => {
    if (submitting) return;
    setSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const payload = exam.questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? '' }));
      const d = await api.post('/results/submit', { examId: exam.examId, answers: payload, startedAt: new Date().toISOString() });
      nav('/results/' + d.resultId, { state: { result: d } });
    } catch (e) {
      setErr(e.message); setSubmitting(false);
    }
  };

  const mmss = (s) => {
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${m}:${ss < 10 ? '0' : ''}${ss}`;
  };

  // شاشة عرض الاختبار
  if (exam) {
    const answered = Object.keys(answers).length;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-extrabold text-main">{exam.title}</h1>
          <div className="flex items-center gap-3">
            <Badge tone="slate">{exam.generationSource === 'ai-summary' ? 'مولّد بالذكاء الاصطناعي' : 'أسئلة محفوظة'}</Badge>
            <Badge tone={timeLeft < 60 ? 'red' : 'blue'}>
              <Icon name="clock" className="w-4 h-4" /> {mmss(timeLeft)}
            </Badge>
            <Badge tone="slate">{answered}/{exam.questions.length} أُجيب</Badge>
          </div>
        </div>

        {err && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-lg">{err}</div>}

        <div className="space-y-4">
          {exam.questions.map((q, idx) => {
            const val = answers[q.id] ?? '';
            const opts = q.options || {};
            const oKeys = Object.keys(opts);
            const parts = q.type === 'mcq' ? [q.text, ...oKeys.map((k) => opts[k])] : [q.text];
            return (
              <Card key={q.id} className="p-5">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/40 font-bold flex items-center justify-center shrink-0 text-sm">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    {q.topic && <div className="text-xs text-muted mb-1"><span className="text-brand-600 font-semibold">الموضوع:</span> {q.topic}</div>}
                    <TranslationBox
                      parts={parts}
                      source={detectLang(q.text)}
                      render={(vals, view, { dir }) => (
                        <>
                          <div dir={dir} style={{ textAlign: dir === 'ltr' ? 'left' : 'right' }} className="font-semibold text-main mb-3">{vals[0]}</div>
                          {q.type === 'mcq' ? (
                            <div className="space-y-2">
                              {oKeys.map((k, i) => (
                                <label key={k} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${val === k ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-soft hover:border-brand-300'}`}>
                                  <input type="radio" name={q.id} value={k} checked={val === k} onChange={() => setAns(q.id, k)} className="accent-brand-600" />
                                  <span dir={dir} className="text-sm text-main">{k}) {vals[1 + i]}</span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <div className="flex gap-3">
                              <label className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer ${val === '1' ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-soft'}`}>
                                <input type="radio" name={q.id} value="1" checked={val === '1'} onChange={() => setAns(q.id, '1')} className="accent-brand-600" />
                                <span className="text-sm text-main">صحيح</span>
                              </label>
                              <label className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer ${val === '0' ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-soft'}`}>
                                <input type="radio" name={q.id} value="0" checked={val === '0'} onChange={() => setAns(q.id, '0')} className="accent-brand-600" />
                                <span className="text-sm text-main">خطأ</span>
                              </label>
                            </div>
                          )}
                        </>
                      )}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="p-5 sticky bottom-0 bg-card/95 backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">أُجبت على {answered} من {exam.questions.length}</span>
            <Button onClick={() => submit(false)} disabled={submitting || answered < exam.questions.length}>
              {submitting ? <Spinner className="w-5 h-5" /> : <Icon name="check" className="w-5 h-5" />}
              تسليم الاختبار
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // شاشة الإعداد
  const selectedSources = sources.filter((s) => selected.includes(s.id));
  const selectedTotal = selectedSources.reduce((a, s) => a + s.totalCount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-main">الاختبارات</h1>
        <p className="text-muted text-sm">اختبار ذكي مربوط بمحاضراتك وملخصاتك — توليد الأسئلة من الملف المرفوع والملخص المُحلَّل</p>
      </div>

      <Card className="p-6 lift" gradientTop>
        <h2 className="font-extrabold text-main mb-1 flex items-center gap-2">
          <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600">
            <Icon name="target" className="w-5 h-5" />
          </div>
          إعداد اختبار جديد
        </h2>
        <p className="text-xs text-muted mb-4">اختر المحاضرات، والوضع الذكي يولّد أسئلة جديدة من المحتوى + الملخص تلقائيًا</p>

        {/* اختيار المحاضرات المربوطة بالتحليل والملخصات */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="text-sm font-semibold text-main">المحاضرات ({selected.length} محددة)</div>
            {sources.length > 0 && (
              <button onClick={selectAll} className="text-xs font-bold text-brand-600 hover:underline">
                تحديد الكل ({sources.length})
              </button>
            )}
          </div>

          {sources.length ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
              {sources.map((s) => (
                <button
                  key={s.id}
                  onClick={() => toggleSelect(s.id)}
                  className={`text-right p-3 rounded-xl border transition ${selected.includes(s.id) ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 ring-1 ring-brand-500' : 'border-soft bg-card hover:border-brand-300'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-main text-sm">{s.title}</div>
                    <Badge tone={selected.includes(s.id) ? 'green' : 'slate'}>{s.totalCount} سؤال</Badge>
                  </div>
                  {s.subject && <div className="text-xs text-muted mt-0.5">المادة: {s.subject}</div>}
                  {s.summaryExcerpt ? (
                    <p className="text-[11px] text-muted mt-1.5 line-clamp-2 leading-relaxed">{s.summaryExcerpt}</p>
                  ) : (
                    <p className="text-[11px] text-muted mt-1.5">لا يوجد ملخص بعد.</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Badge tone="blue">{s.mcqCount} MCQ</Badge>
                    <Badge tone="amber">{s.tfCount} صح/خطأ</Badge>
                    <Badge tone="violet">{s.qaCount} س/ج</Badge>
                  </div>
                  {s.reviewTopics.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {s.reviewTopics.map((t, i) => <Badge key={i} tone="slate">{t}</Badge>)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">لا توجد محاضرات محلّلة. أضف محاضرات من قسم "المحاضرات" أولًا.</p>
          )}
        </div>

        {/* وضع التوليد الذكي */}
        <div className="mb-5">
          <div className="text-sm font-semibold text-main mb-2">طريقة توليد الأسئلة</div>
          <div className="grid sm:grid-cols-2 gap-2">
            <button
              onClick={() => setMode('smart')}
              className={`p-3 rounded-xl border text-right transition ${mode === 'smart' ? 'border-brand-500 bg-gradient-to-l from-brand-50 to-violet-50 dark:from-brand-900/30 dark:to-violet-900/30 ring-1 ring-brand-500' : 'border-soft hover:border-brand-300 hover:shadow-soft'}`}
            >
              <div className="flex items-center gap-2 font-bold text-main text-sm">
                <Icon name="sparkles" className="w-4 h-4 text-amber-500" />
                ذكي — من الملف + الملخص
              </div>
              <p className="text-[11px] text-muted mt-1 leading-relaxed">الذكاء الاصطناعي يقرأ محتوى الملف المرفوع وملخص القسم التحليلي ثم يولّد أسئلة جديدة (MCQ + صح/خطأ).</p>
            </button>
            <button
              onClick={() => setMode('stored')}
              className={`p-3 rounded-xl border text-right transition ${mode === 'stored' ? 'border-brand-500 bg-gradient-to-l from-brand-50 to-violet-50 dark:from-brand-900/30 dark:to-violet-900/30 ring-1 ring-brand-500' : 'border-soft hover:border-brand-300 hover:shadow-soft'}`}
            >
              <div className="flex items-center gap-2 font-bold text-main text-sm">
                <Icon name="book" className="w-4 h-4 text-violet-500" />
                أسئلة محفوظة
              </div>
              <p className="text-[11px] text-muted mt-1 leading-relaxed">استخدام الأسئلة الحالية المخزنة في التحليل دون توليد جديد.</p>
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-5">
          <Input label="عدد الأسئلة" type="number" min={5} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          <Input label="المدة (دقائق)" type="number" min={1} max={120} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
        </div>

        {mode === 'smart' && selected.length > 0 && (
          <div className="text-xs text-muted mb-4 bg-slate-50 dark:bg-slate-800/50 border border-soft rounded-lg px-3 py-2">
            سيتم توليد أسئلة جديدة من محتوى الملف والملخص التحليلي لـ {selectedSources.length} محاضرة مختارة ({selectedTotal}+ سؤال متاح محفوظ).
          </div>
        )}

        {weakFocus.length > 0 && (
          <div className="mb-5 p-3 rounded-xl border border-amber-200/60 dark:border-amber-900/40 bg-gradient-to-l from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/15">
            <div className="flex items-center gap-2 text-sm font-bold text-main mb-2">
              <Icon name="alert" className="w-4 h-4 text-amber-600" />
              سيُرَجّح الاختبار على نقاط ضعفك التراكمية:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {weakFocus.map((t, i) => <Badge key={i} tone="amber">{t}</Badge>)}
            </div>
          </div>
        )}

        {err && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-lg mb-4">{err}</div>}

        <Button onClick={generate} disabled={loading || !selected.length}>
          {loading ? <Spinner className="w-5 h-5" /> : <Icon name="sparkles" className="w-5 h-5" />}
          {loading ? 'جارٍ الإنشاء والتوليد...' : 'إنشاء الاختبار'}
        </Button>
      </Card>
    </div>
  );
}