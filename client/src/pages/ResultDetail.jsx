import { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Card, Badge, Spinner, Button } from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';
import TranslationBox from '../components/TranslationBox.jsx';

export default function ResultDetail() {
  const { id } = useParams();
  const loc = useLocation();
  const [result, setResult] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // من حالة التسليم المباشرة إن وُجدت
    const stateResult = loc.state?.result;
    if (stateResult && String(stateResult.resultId) === String(id)) {
      setResult(stateResult);
      setRecommendations(stateResult.recommendations || []);
      setLoading(false);
      return;
    }
    api.get('/results/' + id).then((r) => { setResult(r); setRecommendations(r.recommendations || []); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center py-20"><Spinner className="w-10 h-10 text-brand-600" /></div>;
  if (!result) return <div className="text-red-500 text-center py-20">النتيجة غير موجودة</div>;

  const answers = result.answers || [];
  const wrong = answers.filter((a) => !a.isCorrect);
  const right = answers.filter((a) => a.isCorrect);

  return (
    <div className="space-y-6">
      <Link to="/results" className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600">
        <Icon name="trending" className="w-4 h-4 rotate-180" />
        العودة للنتائج
      </Link>

      {/* بطاقة النتيجة */}
      <Card className="p-6 lift gradient-top">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className={`w-32 h-32 rounded-full flex items-center justify-center text-4xl font-black text-white shadow-glow ${result.percentage >= 70 ? 'bg-gradient-to-br from-emerald-500 to-green-400' : result.percentage >= 40 ? 'bg-gradient-to-br from-amber-500 to-orange-400' : 'bg-gradient-to-br from-rose-500 to-red-400'}`}>
            {result.percentage}%
          </div>
          <div className="flex-1 text-center sm:text-right">
            <h1 className="text-2xl font-extrabold text-main">{result.exam_title || 'نتيجة الاختبار'}</h1>
            <div className="text-muted mt-1 text-sm">{result.created_at}</div>
            <div className="flex flex-wrap justify-center sm:justify-start gap-3 mt-3">
              <Badge tone={result.percentage >= 70 ? 'green' : 'amber'}>
                <Icon name="award" className="w-4 h-4" /> الدرجة: {result.score} / {result.total}
              </Badge>
              <Badge tone="green"><Icon name="check" className="w-4 h-4" /> صحيحة: {right.length}</Badge>
              <Badge tone="red"><Icon name="x" className="w-4 h-4" /> خاطئة: {wrong.length}</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* توصيات الذكاء الاصطناعي */}
      {recommendations && recommendations.length > 0 ? (
        <Card className="p-6 lift" gradientTop>
          <h2 className="font-extrabold text-main mb-4 flex items-center gap-2">
            <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-600">
              <Icon name="sparkles" className="w-5 h-5" />
            </div>
            توصيات الذكاء الاصطناعي للمذاكرة
          </h2>
          <div className="space-y-4">
            {recommendations.map((r, i) => {
              const nTips = (r.tips || []).length;
              const parts = [r.topic, ...(r.tips || [])];
              const priorityBg =
                r.priority === 'high'
                  ? 'border-rose-200 dark:border-rose-900/50 bg-gradient-to-l from-rose-50 to-orange-50 dark:from-rose-900/20 dark:to-orange-900/15'
                  : r.priority === 'medium'
                  ? 'border-amber-200 dark:border-amber-900/50 bg-gradient-to-l from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/15'
                  : 'border-emerald-200 dark:border-emerald-900/50 bg-gradient-to-l from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/15';
              return (
                <div key={i} className={`p-4 rounded-xl border ${priorityBg}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-main">{r.topic}</span>
                    <Badge tone={r.priority === 'high' ? 'red' : r.priority === 'medium' ? 'amber' : 'green'}>
                      {r.priority === 'high' ? 'أولوية عالية' : r.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
                    </Badge>
                  </div>
                  <TranslationBox
                    parts={parts}
                    render={(vals) => (
                      <ul className="space-y-1">
                        {vals.slice(1, 1 + nTips).map((t, j) => (
                          <li key={j} className="text-sm text-main flex gap-2">
                            <span className="text-violet-500 font-bold">{j + 1}.</span>
                            {t}
                          </li>
                        ))}
                      </ul>
                    )}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        wrong.length > 0 && (
          <Card className="p-6">
            <div className="flex items-center gap-3 text-muted">
              <Icon name="sparkles" className="w-6 h-6 text-violet-500" />
              <span>يمكنك العودة لاحقًا لعرض توصيات مفصلة من الذكاء الاصطناعي بناءً على أخطائك.</span>
            </div>
          </Card>
        )
      )}

      {/* تحليل الإجابات */}
      <Card className="p-6">
        <h2 className="font-bold text-main mb-4 flex items-center gap-2">
          <Icon name="chart" className="w-5 h-5 text-brand-600" />
          تحليل الإجابات ({answers.length})
        </h2>
        <div className="space-y-2">
          {answers.map((a, i) => {
            const parts = [a.text];
            if (a.explanation) parts.push(String(a.explanation));
            return (
              <div key={i} className={`p-4 rounded-xl border ${a.isCorrect ? 'border-green-200 bg-green-50 dark:bg-green-900/10' : 'border-red-200 bg-red-50 dark:bg-red-900/10'}`}>
                <TranslationBox
                  parts={parts}
                  render={(vals, view, { dir }) => (
                    <div className="flex items-start gap-2">
                      <span className={`shrink-0 w-6 h-6 rounded-full text-white flex items-center justify-center text-xs ${a.isCorrect ? 'bg-green-500' : 'bg-red-500'}`}>
                        <Icon name={a.isCorrect ? 'check' : 'x'} className="w-3.5 h-3.5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div dir={dir} style={{ textAlign: dir === 'ltr' ? 'left' : 'right' }} className="font-semibold text-main text-sm">{vals[0]}</div>
                        {a.topic && <Badge tone="slate" className="mt-1">{a.topic}</Badge>}
                        <div className="mt-2 text-sm">
                          {a.isCorrect ? (
                            <span className="text-green-600 dark:text-green-300 font-medium">إجابة صحيحة</span>
                          ) : (
                            <div className="space-y-0.5">
                              <div><span className="text-muted">إجابتك: </span><span className="font-semibold text-red-600 dark:text-red-300">{a.userAnswer === '1' ? 'صحيح' : a.userAnswer === '0' ? 'خطأ' : a.userAnswer}</span></div>
                              <div><span className="text-muted">الصحيح: </span><span className="font-semibold text-green-600 dark:text-green-300">{a.correctAnswer === '1' ? 'صحيح' : a.correctAnswer === '0' ? 'خطأ' : a.correctAnswer}</span></div>
                            </div>
                          )}
                        </div>
                        {vals.length > 1 && vals[1] && <div className="text-xs text-muted mt-1.5"><span className="font-bold">الشرح: </span>{vals[1]}</div>}
                      </div>
                    </div>
                  )}
                />
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex gap-3">
        <Link to="/exams"><Button variant="primary"><Icon name="target" className="w-5 h-5" /> اختبار جديد</Button></Link>
        <Link to="/summaries"><Button variant="secondary"><Icon name="summary" className="w-5 h-5" /> مراجعة الملخصات</Button></Link>
      </div>
    </div>
  );
}
