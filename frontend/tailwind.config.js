/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // P43: every token resolves to a CSS variable (raw RGB triplets) so the
        // palette has ONE source in index.css :root — and alpha modifiers
        // (bg-clinical-600/20) keep working via <alpha-value>.
        //
        // primary = deep ink (warm green-grey), anchor #14201F
        primary: {
          950: 'rgb(var(--c-ink-950) / <alpha-value>)',
          900: 'rgb(var(--c-ink-900) / <alpha-value>)',
          850: 'rgb(var(--c-ink-800) / <alpha-value>)',
          800: 'rgb(var(--c-ink-800) / <alpha-value>)',
          700: 'rgb(var(--c-ink-700) / <alpha-value>)',
          600: 'rgb(var(--c-ink-600) / <alpha-value>)',
          500: 'rgb(var(--c-ink-500) / <alpha-value>)',
          400: 'rgb(var(--c-ink-400) / <alpha-value>)',
          300: 'rgb(var(--c-ink-300) / <alpha-value>)',
          200: 'rgb(var(--c-ink-200) / <alpha-value>)',
          100: 'rgb(var(--c-ink-100) / <alpha-value>)',
          50: 'rgb(var(--c-ink-50) / <alpha-value>)'
        },
        // clinical = spruce / verdigris, anchor #1F5E5A, hover #174B48
        clinical: {
          900: 'rgb(var(--c-spruce-900) / <alpha-value>)',
          800: 'rgb(var(--c-spruce-800) / <alpha-value>)',
          700: 'rgb(var(--c-spruce-700) / <alpha-value>)',
          600: 'rgb(var(--c-spruce-600) / <alpha-value>)',
          500: 'rgb(var(--c-spruce-500) / <alpha-value>)',
          400: 'rgb(var(--c-spruce-400) / <alpha-value>)',
          300: 'rgb(var(--c-spruce-300) / <alpha-value>)',
          200: 'rgb(var(--c-spruce-200) / <alpha-value>)',
          100: 'rgb(var(--c-spruce-100) / <alpha-value>)',
          50: 'rgb(var(--c-spruce-50) / <alpha-value>)'
        },
        // accent = clay, used sparingly (ONE warm accent)
        accent: {
          DEFAULT: 'rgb(var(--c-clay-600) / <alpha-value>)',
          600: 'rgb(var(--c-clay-600) / <alpha-value>)',
          500: 'rgb(var(--c-clay-500) / <alpha-value>)',
          text: 'rgb(var(--c-clay-text) / <alpha-value>)',
          bg: 'rgb(var(--c-clay-bg) / <alpha-value>)',
          border: 'rgb(var(--c-clay-border) / <alpha-value>)'
        },
        surface: {
          base: 'rgb(var(--c-paper) / <alpha-value>)',      // warm off-white paper
          warm: 'rgb(var(--c-paper-warm) / <alpha-value>)',
          card: 'rgb(var(--c-card) / <alpha-value>)',
          border: 'rgb(var(--c-hairline) / <alpha-value>)', // hairline 1px borders
          subtle: 'rgb(var(--c-paper-subtle) / <alpha-value>)',
          hover: 'rgb(var(--c-paper-hover) / <alpha-value>)'
        },
        warning: {
          DEFAULT: 'rgb(var(--c-warning) / <alpha-value>)',
          text: 'rgb(var(--c-warning-text) / <alpha-value>)',
          bg: 'rgb(var(--c-warning-bg) / <alpha-value>)',
          border: 'rgb(var(--c-warning-border) / <alpha-value>)'
        },
        danger: {
          DEFAULT: 'rgb(var(--c-danger) / <alpha-value>)',
          text: 'rgb(var(--c-danger-text) / <alpha-value>)',
          bg: 'rgb(var(--c-danger-bg) / <alpha-value>)',
          border: 'rgb(var(--c-danger-border) / <alpha-value>)'
        },
        success: {
          DEFAULT: 'rgb(var(--c-success) / <alpha-value>)',
          text: 'rgb(var(--c-success-text) / <alpha-value>)',
          bg: 'rgb(var(--c-success-bg) / <alpha-value>)',
          border: 'rgb(var(--c-success-border) / <alpha-value>)'
        }
      },
      fontFamily: {
        // P44 wires the @fontsource packages; fallbacks keep the app sane offline.
        sans: ['"Hanken Grotesk"', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['"Fraunces"', '"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      boxShadow: {
        // P43: hairline borders carry the structure; shadows only for floating
        // layers. The old glow shadows are deliberately dead (map to none).
        'subtle': '0 1px 2px 0 rgb(20 32 31 / 0.04)',
        'card': '0 1px 3px 0 rgb(20 32 31 / 0.05), 0 1px 2px -1px rgb(20 32 31 / 0.03)',
        'modal': '0 24px 48px -12px rgb(20 32 31 / 0.18), 0 4px 12px -4px rgb(20 32 31 / 0.08)',
        'glow-teal': '0 0 0 0 transparent',
        'glow-teal-lg': '0 0 0 0 transparent',
        'glow-danger': '0 0 0 0 transparent'
      },
      borderRadius: {
        'card': '0.625rem',
        'button': '0.5rem'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        pulseSoft: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.18)', opacity: '0.75' }
        },
        drawPulse: {
          '0%': { strokeDashoffset: '320' },
          '100%': { strokeDashoffset: '0' }
        }
      },
      animation: {
        fadeIn: 'fadeIn 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        slideUp: 'slideUp 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
        pulseSoft: 'pulseSoft 2.2s ease-in-out infinite',
        drawPulse: 'drawPulse 2.8s ease-in-out infinite'
      }
    },
  },
  plugins: [],
}
