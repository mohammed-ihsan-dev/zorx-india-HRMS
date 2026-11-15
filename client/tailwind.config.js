/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ZORX INDIA brand identity (Nov 2026). The five official colours, exact:
        //   black #000000 · sea white #E9EEF4 · blueberry #4881FF · red #F43737 · neon green #32EA6F
        // Also exposed as CSS variables (--brand-*) in styles/index.css.
        zx: {
          black: '#000000',
          sea: '#E9EEF4',
          blueberry: '#4881FF',
          red: '#F43737',
          neon: '#32EA6F',
        },
        // Primary accent scale, built on Blueberry (500 = #4881FF exactly). Existing
        // components keep their shade numbers; the darker shades (700+) are for text so
        // it stays readable on white / sea white (700: 5.8:1 on white, 4.97:1 on sea white).
        brand: {
          50: '#EEF3FF',
          100: '#DDE7FF',
          200: '#C3D5FF', // soft highlight (was pista)
          300: '#9DBBFF',
          400: '#7AA2FF',
          500: '#4881FF', // Blueberry — primary buttons, links, active states
          600: '#3570F5', // hover / pressed
          700: '#2A5CD8', // accent text
          800: '#2149B0', // strong accent text
          900: '#1B3B8A',
          950: '#0F2257',
        },
        // Success = Neon Green (400 = #32EA6F exactly, for fills/badges with dark text);
        // 700+ for success text on light backgrounds (700: 5.1:1 on white).
        green: {
          50: '#EBFDF1', 100: '#D2FADF', 200: '#A6F5C0', 300: '#6FEF98', 400: '#32EA6F', 500: '#1FD15C',
          600: '#14A24A', 700: '#0E7F38', 800: '#0D6630', 900: '#0B5228', 950: '#042E15',
        },
        emerald: {
          50: '#EBFDF1', 100: '#D2FADF', 200: '#A6F5C0', 300: '#6FEF98', 400: '#32EA6F', 500: '#1FD15C',
          600: '#14A24A', 700: '#0E7F38', 800: '#0D6630', 900: '#0B5228', 950: '#042E15',
        },
        // Errors / destructive = Highlighter Red (500 = #F43737 exactly); 600+ for text.
        red: {
          50: '#FEF0F0', 100: '#FEDDDD', 200: '#FCBDBD', 300: '#F99191', 400: '#F76262', 500: '#F43737',
          600: '#D92424', 700: '#B51D1D', 800: '#941C1C', 900: '#7A1C1C', 950: '#430A0A',
        },
        // Mobile employee shell only (see MobileShellContext): black foundation,
        // sea-white text, Blueberry accent, Neon Green for success.
        zm: {
          bg: '#000000',
          card: '#121519',
          elev: '#1B1F25',
          border: '#272C34',
          text: '#E9EEF4',
          muted: '#9AA4B0',
          accent: '#4881FF',
          'accent-dark': '#3570F5',
          'accent-light': '#7AA2FF', // accent text/icons on dark surfaces
          'accent-soft': '#DDE7FF',
          success: '#32EA6F',
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
