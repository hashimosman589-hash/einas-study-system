import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Card, Button, Badge, Spinner, Progress, Input } from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';

const ARABIC_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAY_NAME = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return ARABIC_DAYS[new Date(y, m - 1, d).getDay()];
};
const DAY_SHORT = (date) => {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
};

const KIND_META = {
  review: { icon: 'repeat', tone: 'amber' },
  study: { icon: 'book', tone: 'blue' },
  practice: { icon: 'quiz', tone: 'violet' },
};

export default function Study() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [goalDate, setGoalDate] = useState('');
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/study/plan').then(setPlan).catch((e) => setErr(e.message)).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const toggle = async (date, taskId) => {
    const day = plan.days.find((d) => d.date === date);
    const task = day.tasks.find((t) => t.id === taskId);
    const done = !task.done;
    setPlan((p) => ({
      ...p,
      days: p.days.map((d) => (d.date === date ? { ...d, tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, done } : t)) } : d)),
    }));
    try {
      const updated = await api.post('/study/complete', { date, taskId, done });
      setPlan(updated);
    } catch (e) {
      setErr(e.message);
      load();
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.post('/study/settings', { goalDate, dailyMinutes: Number(dailyMinutes) || 60 });
      setShowSettings(false);
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const daysLeft = plan && plan.settings.goalDate ? Math.max(0, Math.ceil((new Date(plan.settings.goalDate) - new Date()) / 86400000)) : null;

  return (
    <div className="space-y-6 no-print-app">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-main">وضع المذاكرة الموجه</h1>
          <p className="text-muted text-sm">خطة أسبوعية ذكية من مراجعة نقاط ضعفك، مادة جديدة، وتدريب يومي.</p>
        </div>
        <div className="flex items-center gap-2 hide-print">
          <Button tone="ghost" onClick={() => setShowSettings((s) => !s)}>
            <Icon name="target" className="w-4 h-4" /> هدفك
          </Button>
          <Button onClick={() => window.print()}>
            <Icon name="download" className="w-4 h-4" /> تصدير PDF
          </Button>
        </div>
      </div>

      {showSettings && (
        <Card className="p-5">
          <div className="text-sm font-bold text-main mb-3">هدف المذاكرة</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="تاريخ الهدف (مثل موعد الامتحان)" type="date" value={goalDate || (plan?.settings.goalDate || '')} onChange={(e) => setGoalDate(e.target.value)} />
            <Input label="دقائق المذاكرة اليومية" type="number" min={15} max={480} value={dailyMinutes || plan?.settings.dailyMinutes || 60} onChange={(e) => setDailyMinutes(Number(e.target.value))} />
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? <Spinner className="w-5 h-5" /> : <Icon name="check" className="w-5 h-5" />} حفظ الهدف
            </Button>
            <Button tone="ghost" onClick={() => setShowSettings(false)}>إغلاق</Button>
          </div>
        </Card>
      )}

      {err && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-lg">{err}</div>}

      {loading || !plan ? (
        <div className="flex items-center justify-center py-20"><Spinner className="w-8 h-8 text-brand-600" /></div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-5" gradientTop>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-black text-brand-600">{plan.todayDone}/{plan.todayTotal}</div>
                  <div className="text-xs text-muted font-bold mt-1">مهام اليوم</div>
                </div>
                <Icon name="calendar" className="w-8 h-8 text-brand-500/40" />
              </div>
              <Progress value={plan.todayTotal ? (plan.todayDone / plan.todayTotal) * 100 : 0} className="h-1.5 mt-3" />
            </Card>
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-black text-main">{plan.streak} 🔥</div>
                  <div className="text-xs text-muted font-bold mt-1">أيام متتالية</div>
                </div>
                <Icon name="award" className="w-8 h-8 text-amber-500/50" />
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-black text-amber-600">{plan.weakTotal}</div>
                  <div className="text-xs text-muted font-bold mt-1">نقاط ضعف تُدار</div>
                </div>
                <Icon name="alert" className="w-8 h-8 text-amber-500/40" />
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-black text-violet-600">{daysLeft === null ? '—' : daysLeft}</div>
                  <div className="text-xs text-muted font-bold mt-1">{daysLeft === null ? 'لم تحدد هدفًا بعد' : 'يوم حتى الهدف'}</div>
                </div>
                <Icon name="target" className="w-8 h-8 text-violet-500/40" />
              </div>
            </Card>
          </div>

          {/* اليوم */}
          {(() => {
            const day = plan.days[0];
            return (
              <Card className="p-6 lift">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-brand-100 dark:bg-brand-900/40 text-brand-600">
                      <Icon name="sparkles" className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-extrabold text-main">مهام اليوم — {DAY_NAME(day.date)} {DAY_SHORT(day.date)}</h2>
                      <p className="text-xs text-muted">{day.doneCount} من {day.tasks.length} مكتملة</p>
                    </div>
                  </div>
                  <Badge tone={day.doneCount === day.tasks.length ? 'green' : 'blue'}>
                    {day.doneCount === day.tasks.length ? 'أنجزت مهام اليوم' : `${Math.round((day.doneCount / day.tasks.length) * 100) || 0}%`}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {day.tasks.map((t) => {
                    const meta = KIND_META[t.kind] || { icon: 'check', tone: 'slate' };
                    return (
                      <div key={t.id} className={`flex items-center gap-3 p-3 rounded-xl border transition ${t.done ? 'border-emerald-200 bg-emerald-50/60 dark:bg-emerald-900/15 opacity-80' : 'border-soft bg-card'}`}>
                        <button onClick={() => toggle(day.date, t.id)} className="hide-print w-6 h-6 rounded-md border flex items-center justify-center shrink-0 transition" title={t.done ? 'إلغاء الإنجاز' : 'إنجاز'}>
                          {t.done ? <Icon name="check" className={`w-4 h-4 ${t.done ? 'text-emerald-500' : ''}`} /> : null}
                        </button>
                        <Icon name={meta.icon} className={`w-5 h-5 shrink-0 ${t.done ? 'text-emerald-500' : 'text-muted'}`} />
                        <span className={`flex-1 text-sm ${t.done ? 'text-muted line-through' : 'text-main font-semibold'}`}>{t.label}</span>
                        {t.wrong ? <Badge tone="amber">{t.wrong} أخطاء</Badge> : null}
                        <Link to={t.link} className="hide-print text-xs font-bold text-brand-600 hover:underline shrink-0">ابدأ</Link>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })()}

          {/* الأسبوع */}
          <div>
            <div className="text-sm font-extrabold text-main mb-3 flex items-center gap-2">
              <Icon name="calendar" className="w-4 h-4 text-brand-500" /> بقية الأسبوع
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {plan.days.slice(1).map((day) => (
                <Card key={day.date} className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-extrabold text-main">{DAY_NAME(day.date)} <span className="text-muted font-normal">{DAY_SHORT(day.date)}</span></div>
                    <Badge tone={day.doneCount === day.tasks.length ? 'green' : 'slate'}>{day.doneCount}/{day.tasks.length}</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {day.tasks.map((t) => {
                      const meta = KIND_META[t.kind] || { icon: 'check', tone: 'slate' };
                      return (
                        <div key={t.id} className="flex items-center gap-2 text-xs">
                          <button onClick={() => toggle(day.date, t.id)} className="hide-print w-5 h-5 rounded border flex items-center justify-center shrink-0" title={t.done ? 'إلغاء' : 'إنجاز'}>
                            {t.done ? <Icon name="check" className="w-3.5 h-3.5 text-emerald-500" /> : null}
                          </button>
                          <Icon name={meta.icon} className="w-4 h-4 shrink-0 text-muted" />
                          <Link to={t.link} className={`hide-print flex-1 truncate ${t.done ? 'text-muted line-through' : 'text-main'}`}>{t.label}</Link>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}