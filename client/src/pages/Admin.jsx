import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { Card, Button, Badge, Spinner } from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';

const fmtUptime = (sec) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (h) parts.push(`${h} س`);
  if (m) parts.push(`${m} د`);
  parts.push(`${s} ث`);
  return parts.join(' ');
};

function Stat({ label, value, sub, tone = 'text-brand-700 dark:text-brand-300' }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted font-medium">{label}</div>
      <div className={`text-2xl font-extrabold mt-1 ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </Card>
  );
}

function HealthTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = () =>
    api.get('/admin/system/health').then(setData).catch((e) => setMsg(e.message)).finally(() => setLoading(false));

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const reset = async () => {
    if (!confirm('تصفير عدادات صحة النظام الآن؟')) return;
    await api.post('/admin/system/health/reset', {});
    setMsg('تم تصفير العدادات');
    load();
  };

  if (loading && !data) return <div className="flex justify-center py-12"><Spinner className="w-8 h-8 text-brand-600" /></div>;
  if (!data) return <div className="text-red-500 text-sm">{msg}</div>;

  const m = data.metrics || {};
  const active = data.activeAnalyses || [];

  return (
    <div className="space-y-5">
      {msg && <div className="text-sm text-green-600 bg-green-50 dark:bg-green-900/30 px-3 py-2 rounded-lg">{msg}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <Card className="p-4 flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 text-xs text-muted font-medium">النموذج الذكي</div>
          <div className="text-xl font-extrabold text-main mt-1">{data.model}</div>
          <div className="text-xs text-muted mt-1" dir="ltr">{data.baseUrl}</div>
        </Card>
        <Card className="p-4 flex-1 min-w-[160px]">
          <div className="flex items-center gap-2 text-xs text-muted font-medium">الحالة</div>
          <div className="mt-1">{data.ai ? <Badge tone="green">ذكاء صناعي متصل</Badge> : <Badge tone="amber">محلل محلي فقط</Badge>}</div>
          <div className="text-xs text-muted mt-1">توازي الأجزاء: {data.concurrency}</div>
        </Card>
        <Card className="p-4 flex-1 min-w-[160px]">
          <div className="flex items-center gap-2 text-xs text-muted font-medium">تحليلات نشطة الآن</div>
          <div className="text-2xl font-extrabold text-main mt-1">{active.length}</div>
          <div className="text-xs text-muted mt-1">زمن التشغيل: {fmtUptime(m.uptimeS || 0)}</div>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="إجمالي طلبات النموذج" value={m.calls ?? 0} />
        <Stat label="طلبات ناجحة" value={m.ok ?? 0} tone="text-green-600 dark:text-green-400" />
        <Stat label="أخطاء" value={m.errors ?? 0} tone="text-red-600 dark:text-red-400" />
        <Stat label="إعادة محاولة (تحديد حصة)" value={m.retries ?? 0} tone="text-amber-600 dark:text-amber-400" />
        <Stat label="متوسط زمن الاستجابة" value={m.avgMs ? `${(m.avgMs / 1000).toFixed(2)} ث` : '—'} />
        <Stat label="نسبة النجاح" value={`${m.successRate ?? 100}%`} />
        <Stat label="إجمالي زمن الطلبات" value={m.totalMs ? `${Math.round(m.totalMs / 60000 * 10) / 10} د` : '—'} />
        <div className="p-4">
          <Button variant="danger" onClick={reset} className="w-full">
            <Icon name="refresh" className="w-4 h-4" /> تصفير العدادات
          </Button>
        </div>
      </div>

      {active.length > 0 && (
        <Card className="p-5">
          <h3 className="font-bold text-main mb-3">قوائم التحليل الحالية</h3>
          <div className="space-y-2">
            {active.map((a, i) => (
              <div key={i} className="flex items-center gap-3 text-sm border border-soft rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-800/50">
                <Spinner className="w-4 h-4 text-brand-600" />
                <span className="text-main flex-1 truncate">مستخدم #{a.userId}{a.lectureId ? ` — محاضرة #${a.lectureId}` : ''}: {a.message}</span>
                <span className="text-xs font-bold text-brand-600">{a.pct}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {(m.bySource || []).length > 0 && (
          <Card className="p-5">
            <h3 className="font-bold text-main mb-3">حسب المصدر</h3>
            {m.bySource.map((s) => (
              <div key={s.key} className="flex items-center justify-between text-sm border-b border-soft last:border-0 py-2">
                <span className="font-bold text-main">{s.key === 'pipeline' ? 'خط أنابيب التحليل' : 'الاستخدام العام'}</span>
                <span className="text-muted text-xs">{s.calls} طلب • نجاح {s.successRate === undefined ? ((s.calls ? Math.round((s.ok / s.calls) * 100) : 0) + '%') : s.successRate}</span>
              </div>
            ))}
          </Card>
        )}
        {(m.byModel || []).length > 0 && (
          <Card className="p-5">
            <h3 className="font-bold text-main mb-3">حسب النموذج</h3>
            {m.byModel.map((s) => (
              <div key={s.key} className="flex items-center justify-between text-sm border-b border-soft last:border-0 py-2">
                <span className="font-bold text-main truncate" dir="ltr">{s.key}</span>
                <span className="text-muted text-xs">{s.calls} • {s.errors ? `${s.errors} أخطاء • ` : ''}{s.retries ? `${s.retries} إعادة • ` : ''}الوسط {(s.avgMs / 1000).toFixed(2)}ث</span>
              </div>
            ))}
          </Card>
        )}
      </div>

      {(m.recent || []).length > 0 && (
        <Card className="p-5">
          <h3 className="font-bold text-main mb-3">آخر الأحداث</h3>
          <div className="space-y-1.5 text-xs">
            {m.recent.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-muted" dir="ltr">
                <span className={r.ok ? 'text-green-500' : 'text-red-500'}>{r.ok ? '✓' : '✗'}</span>
                <span>{r.source}</span>
                <span className="flex-1 truncate">{r.model}</span>
                <span>{r.retries ? `${r.retries}إ ≥` : ''}{(r.ms / 1000).toFixed(1)}ث</span>
                <span className="text-soft">{new Date(r.ts).toLocaleTimeString('ar')}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function UsersTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = () =>
    api.get('/admin/users').then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const act = async (fn, okMsg) => {
    try {
      await fn();
      if (okMsg) setMsg(okMsg);
      setErr('');
      load();
    } catch (e) {
      setErr(e.message);
      setMsg('');
    }
  };

  const toggleRole = (u) =>
    act(() => api.post(`/admin/users/${u.id}/role`, { role: u.role === 'admin' ? 'user' : 'admin' }),
      u.role === 'admin' ? 'أُزيلت صلاحية المدير' : 'أُضيفت صلاحية المدير');

  const resetPassword = (u) => {
    const pw = prompt(`كلمة مرور جديدة لـ ${u.username || u.email} (3 أحرف على الأقل):`);
    if (!pw) return;
    act(() => api.post(`/admin/users/${u.id}/reset-password`, { password: pw }), 'تم تغيير كلمة المرور');
  };

  const remove = (u) => {
    if (!confirm(`حذف المستخدم «${u.name}» نهائيًا مع كل بياناته (محاضرات، اختبارات، نتائج)؟`)) return;
    act(() => api.del(`/admin/users/${u.id}`), 'تم حذف المستخدم');
  };

  if (loading && !data) return <div className="flex justify-center py-12"><Spinner className="w-8 h-8 text-brand-600" /></div>;

  const isSelf = (u) => data && Number(data.selfId) === Number(u.id);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-main text-lg">المستخدمون ({data?.users?.length || 0})</h3>
          <p className="text-xs text-muted">إدارة الحسابات: رفع المديرين، تغيير كلمات المرور، وحذف الحسابات مع بياناتها.</p>
        </div>
        <Button onClick={load} variant="ghost">
          <Icon name="refresh" className="w-4 h-4" /> تحديث
        </Button>
      </div>
      {msg && <div className="text-sm text-green-600 bg-green-50 dark:bg-green-900/30 px-3 py-2 rounded-lg">{msg}</div>}
      {err && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-lg">{err}</div>}

      <Card className="divide-y divide-soft">
        {(data?.users || []).map((u) => (
          <div key={u.id} className="p-4 flex flex-wrap items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-brand-500 text-white flex items-center justify-center font-bold shrink-0">
              {String(u.name || '?').slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-main">{u.name}</span>
                {u.role === 'admin' ? <Badge tone="blue">مدير</Badge> : <Badge>مستخدم</Badge>}
                {isSelf(u) && <Badge tone="green">أنت</Badge>}
              </div>
              <div className="text-xs text-muted truncate" dir="ltr">
                {u.username ? `@${u.username}` : ''} {u.email}
              </div>
              <div className="text-xs text-muted mt-0.5">
                {u.lectures} محاضرة • {u.exams} اختبار • {u.results} نتيجة • متوسط {u.avgScore || 0}%
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => toggleRole(u)} variant={u.role === 'admin' ? 'ghost' : 'primary'} className="text-xs px-3 py-1.5">
                {u.role === 'admin' ? 'إزالة المدير' : 'رفع لمدير'}
              </Button>
              <Button onClick={() => resetPassword(u)} variant="ghost" className="text-xs px-3 py-1.5">
                <Icon name="settings" className="w-4 h-4" /> كلمة مرور
              </Button>
              <button onClick={() => remove(u)} disabled={isSelf(u)} className="p-2 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-30" title="حذف">
                <Icon name="trash" className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
        {!data?.users?.length && <div className="p-8 text-center text-muted text-sm">لا يوجد مستخدمون</div>}
      </Card>
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState('health');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-main">الإدارة</h1>
        <p className="text-muted text-sm">لوحة صحة النظام وإدارة المستخدمين</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab('health')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'health' ? 'text-white bg-gradient-to-l from-brand-600 via-brand-500 to-violet-600 shadow-glow' : 'text-muted bg-card border border-soft hover:text-main'}`}
        >
          <Icon name="activity" className="w-4 h-4" /> صحة النظام
        </button>
        <button
          onClick={() => setTab('users')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'users' ? 'text-white bg-gradient-to-l from-brand-600 via-brand-500 to-violet-600 shadow-glow' : 'text-muted bg-card border border-soft hover:text-main'}`}
        >
          <Icon name="users" className="w-4 h-4" /> المستخدمون
        </button>
      </div>

      {tab === 'health' ? <HealthTab /> : <UsersTab />}
    </div>
  );
}