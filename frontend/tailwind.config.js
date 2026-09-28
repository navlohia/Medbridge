/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          950: '#090D16',
          900: '#0F172A',
          850: '#152033',
          800: '#1E293B',
          700: '#334155',
          600: '#475569',
          500: '#64748B',
          400: '#94A3B8',
          300: '#CBD5E1',
          200: '#E2E8F0',
          100: '#F1F5F9',
          50: '#F8FAFC'
        },
        clinical: {
          900: '#134E4A',
          800: '#115E59',
          700: '#0F766E',
          600: '#0D9488',
          500: '#14B8A6',
          400: '#2DD4BF',
          300: '#5EEAD4',
          200: '#99F6E4',
          100: '#CCFBF1',
          50: '#F0FDFA'
        },
        surface: {
          base: '#F8FAFC',
          warm: '#FAFAF9',
          card: '#FFFFFF',
          border: '#E2E8F0',
          subtle: '#F1F5F9',
          hover: '#F8FAFC'
        },
        warning: {
          DEFAULT: '#B45309',
          text: '#92400E',
          bg: '#FFFBEB',
          border: '#FDE68A'
        },
        danger: {
          DEFAULT: '#B91C1C',
          text: '#991B1B',
          bg: '#FEF2F2',
          border: '#FECACA'
        },
        success: {
          DEFAULT: '#15803D',
          text: '#166534',
          bg: '#F0FDF4',
          border: '#BBF7D0'
        }
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['"Plus Jakarta Sans"', '"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace']
      },
      boxShadow: {
        'subtle': '0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.03)',
        'card': '0 2px 6px -1px rgba(15, 23, 42, 0.06), 0 1px 4px -2px rgba(15, 23, 42, 0.04)',
        'modal': '0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.08)',
        'glow-teal': '0 0 16px -2px rgba(20, 184, 166, 0.25)',
        'glow-teal-lg': '0 0 32px -6px rgba(20, 184, 166, 0.45)',
        'glow-danger': '0 0 16px -4px rgba(185, 28, 28, 0.35)'
      },
      borderRadius: {
        'card': '0.625rem', // 10px consistent radius
        'button': '0.5rem'   // 8px consistent radius
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
        fadeIn: 'fadeIn 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        slideUp: 'slideUp 320ms cubic-bezier(0.16, 1, 0.3, 1) both',
        pulseSoft: 'pulseSoft 2.2s ease-in-out infinite',
        drawPulse: 'drawPulse 2.8s ease-in-out infinite'
      }
    },
  },
  plugins: [],
}
