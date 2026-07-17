/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#FAF7F4',
        surface: '#F0EBE3',
        'text-primary': '#1A1714',
        'text-secondary': '#6B6460',
        border: '#E0D8D0',
        accent: '#C4956A',
        agent: {
          1: '#8C9BAB',
          2: '#9B8FAA',
          3: '#8AA899',
          4: '#B0977E',
        },
      },
      fontFamily: {
        sans: [
          '"Tiempos Text"',
          '"Copernicus"',
          '"Source Serif 4"',
          '"Iowan Old Style"',
          '"Palatino Linotype"',
          '"Book Antiqua"',
          '"New York"',
          '"Times New Roman"',
          'serif',
        ],
        serif: [
          '"Tiempos Text"',
          '"Copernicus"',
          '"Source Serif 4"',
          '"Iowan Old Style"',
          '"Palatino Linotype"',
          '"Book Antiqua"',
          '"New York"',
          '"Times New Roman"',
          'serif',
        ],
      },
    },
  },
  plugins: [],
}
