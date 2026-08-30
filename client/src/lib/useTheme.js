import { useEffect, useState } from 'react';

export function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem('einas_theme') === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (dark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    try {
      localStorage.setItem('einas_theme', dark ? 'dark' : 'light');
    } catch {}
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}
