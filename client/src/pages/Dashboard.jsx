import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Card, Badge, Progress, Spinner } from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';

const statCards = [
  { key: 'lectureCount', label: 'المحاضرات', icon: 'file', chip: 'from-brand-500 to-indigo-500 shadow-glow' },
  { key: 'questionCount', label: 'الأسئلة المولّدة', icon: 'quiz', chip: 'from-violet-500 to-fuchsia-500 shadow-glow-violet' },
  { key: 'examCount', label: 'الاختبارات', icon: 'target', chip: 'from-amber-500 to-orange-500 shadow-glow' },
  { key: 'avgScore', label: 'متوسط الدرجات', icon: 'award', chip: 'from-emerald-500 to-green-500 shadow-glow-green' },
];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/analytics/dashboard').then(setData).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="text-red-500">{err}</div>;
  if (!data) return <div className="flex justify-center py-20"><Spinner className="w-10 h-10 text-brand-600" /></div>;

  const history = (data.resultsHistory || []).slice(-10);

  return (
    <div className="space-y-6">
      {/* لافتة ترحيبية متدرجة */}
      <div className="rounded-2xl gradient-animated text-white p-6 sm:p-8 relative overflow-hidden shadow-glow shine glow-pulse">
        <div className="absolute -top-10 -left-10 w-48 h-48 rounded-full bg-white/15 blur-2xl orb" />
        <div className="absolute -bottom-16 right-10 w-56 h-56 rounded-full bg-cyan-300/25 blur-2xl orb" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-8 right-1/4 w-24 h-24 rounded-full bg-fuchsia-400/25 blur-2xl orb" style={{ animationDelay: '3s' }} />
        <div className="relative">
          <h1 className="text-2xl sm:text-3xl font-black drop-shadow">لوحة التحكم</h1>
          <p className="mt-1 opacity-95 text-sm sm:text-base">نظرة عامة على تقدمك الدراسي وتحليل ذكاء نظام إيناس — تابع، اختبر، وتفوّق.</p>
          <div className="flex flex-wrap gap-3 mt-5">
            <Link to="/exams" className="inline-flex items-center gap-2 rounded-xl bg-white text-brand-700 px-4 py-2.5 text-sm font-bold hover:scale-[1.03] hover:bg-brand-50 transition shadow-soft">
              <Icon name="quiz" className="w-4 h-4" /> اختبر الآن
            </Link>
            <Link to="/study" className="inline-flex items-center gap-2 rounded-xl bg-white text-brand-700 px-4 py-2.5 text-sm font-bold hover:scale-[1.03] hover:bg-brand-50 transition shadow-soft">
              <Icon name="calendar" className="w-4 h-4" /> مذاكرة اليوم
            </Link>
            <Link to="/lectures" className="inline-flex items-center gap-2 rounded-xl bg-white/15 text-white px-4 py-2.5 text-sm font-bold hover:bg-white/25 hover:scale-[1.03] transition backdrop-blur">
              <Icon name="upload" className="w-4 h-4" /> ارفع محاضرة
            </Link>
          </div>
        </div>
      </div>

      {/* بطاقات الإحصائيات */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.key} className="p-5 lift">
            <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br text-white ${s.chip} mb-3 glow-pulse`}>
              <Icon name={s.icon} className="w-6 h-6" />
            </div>
            <div className="text-3xl font-black text-main">{data[s.key] ?? 0}{s.key === 'avgScore' ? '%' : ''}</div>
            <div className="text-sm text-muted font-medium">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* نسبة الإنجاز */}
      <Card className="p-6 lift" gradientTop>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-extrabold text-main">نسبة الإنجاز</h2>
          <Badge tone="blue">{data.progressPct}%</Badge>
        </div>
        <Progress value={data.progressPct} className="h-3" />
        <p className="text-xs text-muted mt-3">
          {data.readyCount} من {data.lectureCount} محاضرة تم تحليلها بالذكاء الاصطناعي
        </p>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* نقاط الضعف التراكمية */}
        <Card className="p-6 lift">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600">
              <Icon name="alert" className="w-5 h-5" />
            </div>
            <h2 className="font-extrabold text-main">نقاط ضعفك عبر المحاضرات</h2>
          </div>
          {data.weakTopics && data.weakTopics.length ? (
            <ul className="space-y-3">
              {data.weakTopics.map((w, i) => (
                <li key={i} className="p-3 rounded-xl border border-amber-200/60 dark:border-amber-900/40 bg-gradient-to-l from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/15">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-bold text-main truncate">{w.topic}</div>
                    <Badge tone="amber">{w.count} خطأ</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Progress value={w.accuracy} className="flex-1 h-1.5" />
                    <span className={`text-[10px] font-bold ${w.accuracy >= 70 ? 'text-emerald-600 dark:text-emerald-400' : w.accuracy >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      دقة {w.accuracy}%
                    </span>
                  </div>
                  {w.lastAt && <div className="text-[10px] text-muted mt-1.5">آخر خطأ: {w.lastAt.slice(0, 10)}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-8 text-muted text-sm">لا توجد نقاط ضعف مسجلة بعد. أعد الاختبارات لاكتشافها.</div>
          )}

          {/* مراجعة متباعدة */}
          {data.dueReviews && data.dueReviews.length > 0 && (
            <div className="mt-4 pt-4 border-t border-soft">
              <div className="text-xs font-bold text-main mb-2">جدول مراجعة مقترح (حسب الأخطاء التراكمية)</div>
              <div className="space-y-1.5">
                {data.dueReviews.map((d, i) => (
                  <Link
                    key={i}
                    to={`/review?start=${encodeURIComponent(d.topic)}`}
                    className="group flex items-center justify-between text-xs rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition"
                  >
                    <span className={`truncate ${d.dueInDays === 0 ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-main'} group-hover:text-brand-600`}>
                      {d.topic}
                    </span>
                    <span className="flex items-center gap-1 text-muted shrink-0 ms-2">
                      {d.dueInDays === 0 ? 'مستحق اليوم' : d.dueInDays === 1 ? 'غدًا' : `بعد ${d.dueInDays} أيام`}
                      <Icon name="repeat" className="w-3.5 h-3.5" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <Link to="/exams" className="inline-flex items-center gap-2 text-sm font-bold text-brand-600 mt-4 hover:text-brand-700 transition">
            أنشئ اختبارًا جديدًا
            <Icon name="trending" className="w-4 h-4" />
          </Link>
        </Card>

        {/* تقدم الدرجات */}
        <Card className="p-6 lift">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-brand-100 dark:bg-brand-900/40 text-brand-600">
              <Icon name="chart" className="w-5 h-5" />
            </div>
            <h2 className="font-extrabold text-main">تقدم الدرجات</h2>
          </div>
          {history.length ? (
            <div className="flex items-end gap-2 h-40">
              {history.map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-muted">{h.percentage}%</span>
                  <div
                    className={`w-full rounded-t-lg ${h.percentage >= 70 ? 'bg-gradient-to-t from-emerald-500 to-green-300 shadow-glow-green' : h.percentage >= 40 ? 'bg-gradient-to-t from-amber-500 to-yellow-300' : 'bg-gradient-to-t from-rose-500 to-red-300'}`}
                    style={{ height: `${Math.max(4, h.percentage)}%` }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted text-sm">لم تنفّذ أي اختبار بعد. ابدأ للظهور هنا.</div>
          )}
          <div className="flex justify-between text-xs text-muted mt-3 font-medium">
            <span>أفضل نتيجة: <b className="text-emerald-600 dark:text-emerald-400">{data.bestScore}%</b></span>
            <span>متوسط: <b className="text-brand-600 dark:text-brand-400">{data.avgScore}%</b></span>
          </div>
        </Card>
      </div>

      {/* آخر الاختبارات */}
      <Card className="p-6 lift" gradientTop>
        <h2 className="font-extrabold text-main mb-4">آخر الاختبارات</h2>
        {data.recent && data.recent.length ? (
          <div className="divide-y divide-soft">
            {data.recent.map((r) => (
              <Link to="/results" key={r.id} className="flex items-center justify-between py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg px-2 transition">
                <div>
                  <div className="font-bold text-main text-sm">اختبار #{r.examId || '-'}</div>
                  <div className="text-xs text-muted">{r.createdAt}</div>
                </div>
                <Badge tone={r.percentage >= 70 ? 'green' : r.percentage >= 40 ? 'amber' : 'red'}>
                  {r.score}/{r.total} • {r.percentage}%
                </Badge>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted text-sm">لا توجد نتائج بعد</div>
        )}
      </Card>
    </div>
  );
}