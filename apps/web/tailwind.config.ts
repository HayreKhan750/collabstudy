import type { Config } from 'tailwindcss';

/**
 * CollabStudy Design System — Tailwind Configuration
 * FAANG-level premium UI token system.
 *
 * Conventions:
 *  - All brand/surface/semantic colors are exposed as Tailwind utilities
 *    so components can use `bg-surface`, `text-fg-muted`, `border-border`, etc.
 *  - 8pt grid: all spacing multiples of 8px (2rem = 32px base unit).
 *  - Custom shadows map to layered elevation tokens.
 *  - darkMode: 'class' — toggled by next-themes adding `.dark` to <html>.
 */
const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',

  theme: {
    extend: {
      // ── Font Family ─────────────────────────────────────────────────────
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },

      // ── Design Token Colors (mapped to CSS variables) ──────────────────
      // Usage: bg-brand, text-fg-muted, border-border, bg-surface-2, etc.
      colors: {
        // Brand / Primary
        brand: {
          DEFAULT:  'var(--color-primary)',
          hover:    'var(--color-primary-hover)',
          light:    'var(--color-primary-light)',
          muted:    'var(--color-primary-muted)',
          fg:       'var(--color-primary-fg)',
        },
        // Surfaces — 5 elevation levels
        surface: {
          DEFAULT: 'var(--color-surface-1)',
          1:       'var(--color-surface-1)',
          2:       'var(--color-surface-2)',
          3:       'var(--color-surface-3)',
          4:       'var(--color-surface-4)',
          5:       'var(--color-surface-5)',
          hover:   'var(--color-surface-hover)',
          inset:   'var(--color-surface-inset)',
        },
        // Page background
        canvas: 'var(--color-bg)',
        // Borders
        border: {
          DEFAULT: 'var(--color-border)',
          strong:  'var(--color-border-strong)',
          subtle:  'var(--color-border-subtle)',
        },
        // Text
        fg: {
          DEFAULT: 'var(--color-fg)',
          muted:   'var(--color-fg-muted)',
          subtle:  'var(--color-fg-subtle)',
          inverse: 'var(--color-fg-inverse)',
          link:    'var(--color-primary-light)',
        },
        // Semantic
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover:   'var(--color-accent-hover)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          muted:   'var(--color-success-muted)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          hover:   'var(--color-danger-hover)',
          muted:   'var(--color-danger-muted)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          muted:   'var(--color-warning-muted)',
        },
        info: 'var(--color-info)',
        // Presence
        online:  'var(--color-online)',
        away:    'var(--color-away)',
        offline: 'var(--color-offline)',
        // Mention
        mention: {
          bg:     'var(--color-mention-bg)',
          border: 'var(--color-mention-border)',
        },
      },

      // ── 8pt Spacing Grid ─────────────────────────────────────────────────
      // Base: 8px. Every step is a multiple of 8.
      // Tailwind's default 4pt grid is kept for micro-adjustments (0.5, 1, 1.5…)
      // This extension adds semantic 8pt tokens on top.
      spacing: {
        // 8pt grid named tokens
        'grid-1':  '8px',    // 1 unit
        'grid-2':  '16px',   // 2 units
        'grid-3':  '24px',   // 3 units
        'grid-4':  '32px',   // 4 units
        'grid-5':  '40px',   // 5 units
        'grid-6':  '48px',   // 6 units
        'grid-8':  '64px',   // 8 units
        'grid-10': '80px',   // 10 units
        'grid-12': '96px',   // 12 units
        'grid-16': '128px',  // 16 units
        // Sidebar / layout dimensions
        'sidebar':           '240px',
        'sidebar-collapsed': '64px',
        'header':            '56px',
        'input':             '40px',
      },

      // ── Border Radius ─────────────────────────────────────────────────────
      borderRadius: {
        'xs':   '2px',
        'sm':   '4px',
        'md':   '6px',     // slightly tighter than default 8px
        'lg':   '10px',
        'xl':   '14px',
        '2xl':  '20px',
        '3xl':  '28px',
      },

      // ── Box Shadows (elevation system) ───────────────────────────────────
      boxShadow: {
        // Dark-mode layered shadows
        'elevation-1': 'var(--shadow-elevation-1)',
        'elevation-2': 'var(--shadow-elevation-2)',
        'elevation-3': 'var(--shadow-elevation-3)',
        'elevation-4': 'var(--shadow-elevation-4)',
        'elevation-5': 'var(--shadow-elevation-5)',
        // Glows
        'glow-brand':  'var(--shadow-glow-primary)',
        'glow-accent': 'var(--shadow-glow-accent)',
        'glow-sm':     '0 0 12px rgba(124, 58, 237, 0.25)',
        // Premium inner shadow for inputs
        'inner-subtle': 'inset 0 1px 3px rgba(0, 0, 0, 0.2)',
        'inner-strong': 'inset 0 2px 6px rgba(0, 0, 0, 0.4)',
      },

      // ── Typography Scale ──────────────────────────────────────────────────
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],       // 10px
        'xs':  ['0.75rem',  { lineHeight: '1.125rem' }],   // 12px
        'sm':  ['0.875rem', { lineHeight: '1.375rem' }],   // 14px
        'base':['1rem',     { lineHeight: '1.625rem' }],   // 16px
        'lg':  ['1.125rem', { lineHeight: '1.75rem' }],    // 18px
        'xl':  ['1.25rem',  { lineHeight: '1.875rem' }],   // 20px
        '2xl': ['1.5rem',   { lineHeight: '2rem' }],       // 24px
        '3xl': ['1.875rem', { lineHeight: '2.375rem' }],   // 30px
        '4xl': ['2.25rem',  { lineHeight: '2.75rem' }],    // 36px
        '5xl': ['3rem',     { lineHeight: '3.5rem' }],     // 48px
      },

      // ── Backdrop Blur ─────────────────────────────────────────────────────
      backdropBlur: {
        'xs':   '2px',
        'sm':   '6px',
        'md':   '12px',
        'lg':   '20px',
        'xl':   '32px',
        '2xl':  '48px',
        '3xl':  '64px',
      },

      // ── Keyframe Animations ──────────────────────────────────────────────
      keyframes: {
        // Entrance
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-out': {
          '0%':   { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(6px)' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.94)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'scale-out': {
          '0%':   { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.94)' },
        },
        'slide-in-right': {
          '0%':   { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-out-right': {
          '0%':   { opacity: '1', transform: 'translateX(0)' },
          '100%': { opacity: '0', transform: 'translateX(100%)' },
        },
        'slide-in-left': {
          '0%':   { opacity: '0', transform: 'translateX(-100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-up': {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%':   { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(12px)' },
        },
        // Loaders
        'spin-slow': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'bounce-dot': {
          '0%, 80%, 100%': { transform: 'translateY(0)' },
          '40%':           { transform: 'translateY(-6px)' },
        },
        // Effects
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(124,58,237,0.3)' },
          '50%':      { boxShadow: '0 0 28px rgba(124,58,237,0.7)' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-4px)' },
        },
        'ping-slow': {
          '0%':     { transform: 'scale(1)', opacity: '0.8' },
          '75%, 100%': { transform: 'scale(2)', opacity: '0' },
        },
      },
      animation: {
        'fade-in':         'fade-in 200ms cubic-bezier(0,0,0.2,1) forwards',
        'fade-out':        'fade-out 150ms cubic-bezier(0.4,0,1,1) forwards',
        'scale-in':        'scale-in 150ms cubic-bezier(0.34,1.56,0.64,1) forwards',
        'scale-out':       'scale-out 120ms cubic-bezier(0.4,0,1,1) forwards',
        'slide-in-right':  'slide-in-right 250ms cubic-bezier(0,0,0.2,1) forwards',
        'slide-out-right': 'slide-out-right 200ms cubic-bezier(0.4,0,1,1) forwards',
        'slide-in-left':   'slide-in-left 250ms cubic-bezier(0,0,0.2,1) forwards',
        'slide-up':        'slide-up 200ms cubic-bezier(0,0,0.2,1) forwards',
        'slide-down':      'slide-down 150ms cubic-bezier(0.4,0,1,1) forwards',
        'bounce-dot':      'bounce-dot 1.2s ease-in-out infinite',
        'pulse-glow':      'pulse-glow 2.5s ease-in-out infinite',
        'shimmer':         'shimmer 1.6s linear infinite',
        'float':           'float 3s ease-in-out infinite',
        'ping-slow':       'ping-slow 2s cubic-bezier(0,0,0.2,1) infinite',
        'spin-slow':       'spin-slow 2s linear infinite',
      },

      // ── Transition Timing ─────────────────────────────────────────────────
      transitionTimingFunction: {
        'spring':  'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth':  'cubic-bezier(0.4, 0, 0.2, 1)',
        'ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
        'ease-out':'cubic-bezier(0, 0, 0.2, 1)',
      },
      transitionDuration: {
        '50':  '50ms',
        '80':  '80ms',
        '120': '120ms',
        '200': '200ms',
        '350': '350ms',
        '500': '500ms',
        '700': '700ms',
      },

      // ── Screens — standard breakpoints ───────────────────────────────────
      screens: {
        'xs': '480px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },

      // ── Max Widths — semantic content widths ──────────────────────────────
      maxWidth: {
        'content-sm': '480px',
        'content':    '680px',
        'content-lg': '800px',
        'content-xl': '960px',
      },
    },
  },
  plugins: [],
};

export default config;
