export function Card({ children, className = '', lift = false, gradientTop = false }) {
  return (
    <div className={`bg-card border border-soft rounded-2xl shadow-soft ${lift ? 'lift' : ''} ${gradientTop ? 'gradient-top' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function Button({ children, variant = 'primary', className = '', ...rest }) {
  const base = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]';
  const variants = {
    primary: 'text-white bg-gradient-to-l from-brand-600 via-brand-500 to-violet-600 hover:bg-gradient-to-l hover:from-brand-700 hover:to-violet-700 shadow-glow',
    secondary: 'bg-brand-100 text-brand-700 hover:bg-brand-200 dark:bg-brand-900/40 dark:text-brand-300',
    ghost: 'hover:bg-slate-100 dark:hover:bg-slate-700/50',
    danger: 'bg-gradient-to-l from-red-500 to-rose-600 text-white hover:from-red-600 hover:to-rose-700 shadow-glow-red',
    outline: 'border border-soft bg-card text-main hover:bg-slate-50 dark:hover:bg-slate-800 shadow-soft',
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'slate', className = '' }) {
  const tones = {
    slate: 'bg-gradient-to-r from-slate-100 to-slate-200 text-slate-600 dark:from-slate-700 dark:to-slate-600 dark:text-slate-200',
    green: 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 dark:from-green-900/50 dark:to-emerald-900/50 dark:text-green-300',
    red: 'bg-gradient-to-r from-red-100 to-rose-100 text-red-600 dark:from-red-900/50 dark:to-rose-900/50 dark:text-red-300',
    amber: 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 dark:from-amber-900/50 dark:to-orange-900/50 dark:text-amber-300',
    blue: 'bg-gradient-to-r from-brand-100 to-indigo-100 text-brand-700 dark:from-brand-900/50 dark:to-indigo-900/50 dark:text-brand-300',
    violet: 'bg-gradient-to-r from-violet-100 to-fuchsia-100 text-violet-700 dark:from-violet-900/50 dark:to-fuchsia-900/50 dark:text-violet-300',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function Spinner({ className = 'w-6 h-6' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

export function Input({ label, className = '', ...rest }) {
  return (
    <label className="block">
      {label && <span className="block text-sm font-bold text-main mb-1.5">{label}</span>}
      <input
        className={`w-full px-3.5 py-2.5 rounded-xl border border-soft bg-white dark:bg-slate-800/70 text-main focus-glow focus:ring-2 focus:ring-brand-500 ${className}`}
        {...rest}
      />
    </label>
  );
}

export function Progress({ value, className = '' }) {
  return (
    <div className={`h-2 rounded-full bg-slate-200/80 dark:bg-slate-700/80 overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-500 via-violet-500 to-cyan-400 shadow-[0_0_8px_rgba(51,102,255,0.5)] transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}