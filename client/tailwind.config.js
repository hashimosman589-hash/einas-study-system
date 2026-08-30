/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Cairo"', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e5ff',
          200: '#bcd2ff',
          300: '#8eb5ff',
          400: '#598dff',
          500: '#3366ff',
          600: '#1f47f5',
          700: '#1a3be0',
          800: '#182eb6',
          900: '#1a2e8f',
        },
      },
      boxShadow: {
        soft: '0 2px 12px -2px rgba(15, 23, 42, 0.08)',
        glow: '0 10px 30px -8px rgba(51, 102, 255, 0.45)',
        'glow-violet': '0 10px 30px -8px rgba(139, 92, 246, 0.45)',
        'glow-green': '0 10px 30px -8px rgba(16, 185, 129, 0.45)',
        'glow-red': '0 10px 30px -8px rgba(244, 63, 94, 0.5)',
        inner: 'inset 0 1px 3px rgba(15, 23, 42, 0.06)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'gradient-drift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        shimmer: 'shimmer 2.2s linear infinite',
        'gradient-x': 'gradient-drift 8s ease infinite',
      },
    },
  },
  plugins: [],
};