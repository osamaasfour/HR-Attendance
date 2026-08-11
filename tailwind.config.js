/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.js',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EBF2FA',
          100: '#D6E6F5',
          200: '#A8CCE9',
          300: '#7AB3DE',
          400: '#4C99D3',
          500: '#1E3A5F',    /* Navy blue - primary brand color */
          600: '#183050',
          700: '#122640',
          800: '#0C1C30',
          900: '#061220',
        },
        accent: {
          50: '#E8F8F0',
          100: '#C5EEDA',
          200: '#8FDDBA',
          300: '#59CC99',
          400: '#34BF80',
          500: '#10B981',    /* Emerald green - success/clock-in */
          600: '#0DA572',
          700: '#0A8D60',
          800: '#08764F',
          900: '#055E3E',
        },
        danger: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          400: '#F87171',
          500: '#EF4444',    /* Red - error/clock-out/danger */
          600: '#DC2626',
          700: '#B91C1C',
          800: '#991B1B',
          900: '#7F1D1D',
        },
        warning: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          500: '#F59E0B',
          600: '#D97706',
        },
        surface: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'System', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
};
