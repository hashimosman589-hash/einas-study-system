import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Icon } from '../components/Icons.jsx';
import { Button } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useTheme } from '../lib/useTheme.js';

const nav = [
  { to: '/', label: 'لوحة التحكم', icon: 'dashboard', end: true },
  { to: '/lectures', label: 'المحاضرات', icon: 'file' },
  { to: '/summaries', label: 'الملخصات والتحليل', icon: 'summary' },
  { to: '/exams', label: 'الاختبارات', icon: 'quiz' },
  { to: '/review', label: 'بطاقات المراجعة', icon: 'repeat' },
  { to: '/study', label: 'وضع المذاكرة الموجه', icon: 'calendar' },
  { to: '/results', label: 'الدرجات والملاحظات', icon: 'chart' },
  { to: '/admin', label: 'الإدارة', icon: 'admin', admin: true },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-500 via-violet-500 to-cyan-400 text-white flex items-center justify-center text-xl font-black shadow-glow">
          ا
        </div>
        <div>
          <div className="font-extrabold text-lg text-main leading-tight">إيناس</div>
          <div className="text-xs text-muted">للمذاكرة الذكية</div>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1.5 overflow-y-auto scrollbar-thin">
        {nav.filter((item) => !item.admin || user?.role === 'admin').map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${
                isActive
                  ? 'text-white bg-gradient-to-l from-brand-600 via-brand-500 to-violet-600 shadow-glow'
                  : 'text-muted hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-main'
              }`
            }
          >
            <Icon name={item.icon} className="w-5 h-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pt-1 pb-2">
        <div className="text-[7.5px] text-muted/80 font-normal text-center truncate tracking-wide" dir="ltr">Developed by HO</div>
      </div>

      <div className="p-3 border-t border-soft">
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-400 to-brand-500 text-white flex items-center justify-center font-bold shadow-soft">
            {user ? user.name?.slice(0, 1) : '؟'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-main truncate">{user?.name}</div>
            <div className="text-xs text-muted truncate">{user?.email}</div>
          </div>
          <button onClick={() => { logout(); navigate('/login'); }} title="تسجيل الخروج" className="text-muted hover:text-red-500 hover:scale-110 transition-transform">
            <Icon name="logout" className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-app bg-blobs">
      {/* Sidebar desktop */}
      <aside className="hidden lg:block w-64 bg-card border-l border-soft shrink-0 relative z-10">
        {sidebar}
      </aside>

      {/* Sidebar mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-64 bg-card border-l border-soft shadow-2xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <header className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-card/80 backdrop-blur border-b border-soft sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-main" onClick={() => setOpen(true)}>
              <Icon name="menu" className="w-6 h-6" />
            </button>
            <span className="hidden sm:block">
              <span className="text-muted">نظام إيناس</span>{' '}
              <span className="gradient-text font-extrabold">للمذاكرة الذكية</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-main hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              title={dark ? 'الوضع الفاتح' : 'الوضع الداكن'}
            >
              <Icon name={dark ? 'sun' : 'moon'} className="w-5 h-5" />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin">
          <Outlet />
        </main>
      </div>
    </div>
  );
}