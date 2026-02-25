import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'JetBrains Mono', 'monospace'],
      },
      colors: {
        brand: {
          DEFAULT: '#7C5CFF',
          hover:   '#6B4EF0',
          muted:   'rgba(124,92,255,0.15)',
        },
        surface: {
          base:     'var(--color-bg)',
          DEFAULT:  'var(--color-surface)',
          elevated: 'var(--color-surface-elevated)',
          hover:    'var(--color-surface-hover)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          strong:  'var(--color-border-strong)',
        },
        fg: {
          DEFAULT: 'var(--color-fg)',
          muted:   'var(--color-fg-muted)',
          subtle:  'var(--color-fg-subtle)',
        },
      },
      boxShadow: {
        'sm':         'var(--shadow-sm)',
        'md':         'var(--shadow-md)',
        'lg':         'var(--shadow-lg)',
        'xl':         'var(--shadow-xl)',
        'glow':       'var(--shadow-glow-primary)',
        'glow-accent':'var(--shadow-glow-accent)',
        'glow-sm':    '0 0 12px rgba(124,92,255,0.35)',
        'glow-lg':    '0 0 40px rgba(124,92,255,0.5)',
      },
      borderRadius: {
        'sm':   'var(--radius-sm)',
        'md':   'var(--radius-md)',
        'lg':   'var(--radius-lg)',
        'xl':   'var(--radius-xl)',
        '2xl':  'var(--radius-2xl)',
        'full': 'var(--radius-full)',
      },
      transitionDuration: {
        'fast':   '120ms',
        'normal': '200ms',
        'slow':   '350ms',
        'slower': '500ms',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'premium': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      animation: {
        'bounce-dot':   'bounce 0.8s infinite ease-in-out',
        'fade-in':      'fadeIn 200ms cubic-bezier(0.4,0,0.2,1) forwards',
        'scale-in':     'scaleIn 120ms cubic-bezier(0.34,1.56,0.64,1) forwards',
        'slide-in':     'slideInRight 200ms cubic-bezier(0.4,0,0.2,1) forwards',
        'pulse-glow':   'pulse-glow 2s cubic-bezier(0.4,0,0.2,1) infinite',
        'shimmer':      'shimmer 1.5s cubic-bezier(0.4,0,0.2,1) infinite',
        'float':        'float 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(124,92,255,0.3)' },
          '50%':      { boxShadow: '0 0 20px rgba(124,92,255,0.6)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-6px)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};

export default config;
