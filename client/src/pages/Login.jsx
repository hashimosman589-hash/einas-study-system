import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useTheme } from '../lib/useTheme.js';
import { Button, Input, Spinner } from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';

export default function Login() {
  const { login, register } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const identifier = username || email;
        if (!identifier) throw new Error('أدخل اسم المستخدم أو البريد الإلكتروني');
        await login(identifier, password);
      } else {
        await register(name, username, email, password);
      }
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-app bg-blobs flex items-center justify-center p-4 relative overflow-hidden">
      <button onClick={toggle} className={`absolute top-5 left-5 z-20 p-2 rounded-xl text-main ${dark ? 'bg-slate-800/80' : 'bg-white/70'} hover:bg-opacity-100 backdrop-blur shadow-soft`}>
        <Icon name={dark ? 'sun' : 'moon'} className="w-5 h-5" />
      </button>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-6">
          <div className="relative inline-flex mb-5">
            <div className="absolute inset-0 -m-3 rounded-[2rem] bg-gradient-to-br from-brand-500 via-violet-500 to-cyan-400 opacity-40 blur-lg animate-pulse-soft" />
            <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-brand-500 via-violet-500 to-cyan-400 text-white flex items-center justify-center text-4xl font-black shadow-glow">
              ا
            </div>
          </div>
          <h1 className="text-3xl font-black text-main"><span className="gradient-text">نظام إيناس</span> للمذاكرة الذكية</h1>
        </div>

        <div className="bg-card/90 backdrop-blur border border-soft rounded-3xl shadow-glow p-6 sm:p-8 gradient-top">
          <div className="grid grid-cols-2 gap-2 mb-6 bg-slate-100/90 dark:bg-slate-800/70 p-1 rounded-xl">
            {[
              { k: 'login', l: 'تسجيل الدخول' },
              { k: 'register', l: 'حساب جديد' },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => { setMode(t.k); setError(''); }}
                className={`py-2 rounded-lg text-sm font-bold transition ${mode === t.k ? 'bg-white dark:bg-slate-700 text-main shadow' : 'text-muted'}`}
              >
                {t.l}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <Input label="الاسم الكامل" value={name} onChange={(e) => setName(e.target.value)} placeholder="ايناس محمد" required />
            )}
            {mode === 'register' && (
              <Input label="اسم المستخدم" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" required minLength={3} />
            )}
            {mode === 'login' ? (
              <Input label="اسم المستخدم أو البريد الإلكتروني" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" />
            ) : (
              <Input label="البريد الإلكتروني" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            )}
            <Input label="كلمة المرور" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={3} />

            {error && (
              <div className="text-sm text-red-600 bg-red-50/90 dark:bg-red-900/30 px-3 py-2 rounded-lg">{error}</div>
            )}

            <Button type="submit" className="w-full py-3 text-base" disabled={loading}>
              {loading ? <Spinner className="w-5 h-5" /> : (
                <>
                  <Icon name={mode === 'login' ? 'trending' : 'sparkles'} className="w-5 h-5" />
                  {mode === 'login' ? 'دخول' : 'إنشاء الحساب'}
                </>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-[11px] text-muted mt-5">مدعوم بالذكاء الاصطناعي للتحليل والتوليد والتوصيات</p>
      </div>
    </div>
  );
}