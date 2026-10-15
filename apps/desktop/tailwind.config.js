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
          DEFAULT: '#2563eb',
          hover: '#1d4ed8',
          subtle: 'rgba(37, 99, 235, 0.12)',
          border: 'rgba(37, 99, 235, 0.35)',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#6366f1',
          hover: '#4f46e5',
          subtle: 'rgba(99, 102, 241, 0.12)',
          border: 'rgba(99, 102, 241, 0.35)',
          foreground: '#ffffff',
        },
        zinc: {
          850: '#151518',
        },
      },
    },
  },
  plugins: [],
};
