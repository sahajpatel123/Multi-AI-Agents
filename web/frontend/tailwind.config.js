/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: '#0A0E14',
        surface: '#0E1520',
        bezel: '#111824',
        'text-primary': '#E6EDF3',
        'text-secondary': '#AEB9C4',
        'text-mute': '#6B7785',
        border: '#1B2A38',
        accent: '#7DD3C0',
        amber: '#E8B86D',
        crimson: '#E5594F',
        agent: {
          1: '#6F8DAD',
          2: '#9B8FAA',
          3: '#8AA899',
          4: '#C49A6D',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', '"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
        serif: ['"Space Grotesk"', '"Inter"', 'sans-serif'],
      },
      boxShadow: {
        'glow-teal': '0 0 24px -6px rgba(125,211,192,0.45)',
        'glow-amber': '0 0 24px -6px rgba(232,184,109,0.45)',
      },
      keyframes: {
        risefade: { '0%': { opacity: '0', transform: 'translateY(14px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: { risefade: 'risefade 600ms cubic-bezier(0.16,1,0.3,1) both' },
    },
  },
  plugins: [],
}