/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: '#4f46e5',
          hover: '#4338ca',
          subtle: 'rgba(79, 70, 229, 0.12)',
          border: 'rgba(79, 70, 229, 0.35)',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#6366f1',
          hover: '#4f46e5',
          subtle: 'rgba(99, 102, 241, 0.12)',
          border: 'rgba(99, 102, 241, 0.35)',
          foreground: '#ffffff',
        },
        // Anti-slop mineral dark palette: warm graphite/slate undertone, not dead gray
        zinc: {
          950: '#0b0c0e',
          900: '#111317',
          850: '#16191f',
          800: '#20242c',
          750: '#292e39',
          700: '#353c4a',
        },
      },
    },
  },
  plugins: [],
};
