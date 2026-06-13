/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        pitch: {
          900: '#0a1f12',
          800: '#0d2818',
          700: '#11371f',
          600: '#176633',
          500: '#1f8a45',
        },
        gold: {
          400: '#f5c542',
          500: '#e0a82e',
        },
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'Impact', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'dice-roll': {
          '0%': { transform: 'rotate(0deg) scale(1)' },
          '25%': { transform: 'rotate(180deg) scale(1.15)' },
          '50%': { transform: 'rotate(360deg) scale(0.95)' },
          '75%': { transform: 'rotate(540deg) scale(1.1)' },
          '100%': { transform: 'rotate(720deg) scale(1)' },
        },
        'card-in': {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'pop': {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '60%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'dice-roll': 'dice-roll 0.8s ease-in-out',
        'card-in': 'card-in 0.35s ease-out both',
        'pop': 'pop 0.3s ease-out both',
      },
    },
  },
  plugins: [],
};
