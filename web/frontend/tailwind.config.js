/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0B0C0A',
        surface: '#151713',
        'text-primary': '#F3F0E7',
        'text-secondary': '#A0A39A',
        border: 'rgba(243, 240, 231, 0.20)',
        accent: '#F0B84E',
        prism: {
          carbon: '#0B0C0A',
          paper: '#F8F5EC',
          ivory: '#F3F0E7',
          cyan: '#5ED8FF',
          violet: '#A98CF8',
          coral: '#FF6652',
          acid: '#D7F64A',
          amber: '#F0B84E',
        },
        agent: {
          1: '#5ED8FF',
          2: '#A98CF8',
          3: '#D7F64A',
          4: '#FF6652',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        serif: ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        sm: '2px',
        DEFAULT: '4px',
        md: '4px',
        lg: '6px',
        xl: '6px',
      },
      boxShadow: {
        sm: '1px 1px 0 rgba(0,0,0,.35)',
        DEFAULT: '2px 2px 0 rgba(0,0,0,.4)',
        lg: '4px 4px 0 rgba(0,0,0,.45)',
      },
    },
  },
  plugins: [],
}
