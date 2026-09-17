/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f2f8f2',
          100: '#e0efdf',
          200: '#c8e6c0', // pista green — highlights
          300: '#a3d195',
          400: '#78b568',
          500: '#569645',
          600: '#3f7a33',
          700: '#2f5f28',
          800: '#1f5138', // deep green — primary
          900: '#173d29',
          950: '#0d2417',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
        popover: '0 10px 30px -10px rgb(0 0 0 / 0.15)',
      },
    },
  },
  plugins: [],
};
