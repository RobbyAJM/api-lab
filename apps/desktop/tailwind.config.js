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
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          hover: 'rgb(var(--color-primary-hover) / <alpha-value>)',
          subtle: 'rgb(var(--color-primary) / 0.12)',
          border: 'rgb(var(--color-primary) / 0.35)',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: 'rgb(var(--color-secondary) / <alpha-value>)',
          hover: 'rgb(var(--color-secondary-hover) / <alpha-value>)',
          subtle: 'rgb(var(--color-secondary) / 0.12)',
          border: 'rgb(var(--color-secondary) / 0.35)',
          foreground: '#ffffff',
        },
        // Themeable mineral / custom palette: dynamic CSS variables with alpha support
        zinc: {
          950: 'rgb(var(--color-zinc-950) / <alpha-value>)',
          900: 'rgb(var(--color-zinc-900) / <alpha-value>)',
          850: 'rgb(var(--color-zinc-850) / <alpha-value>)',
          800: 'rgb(var(--color-zinc-800) / <alpha-value>)',
          750: 'rgb(var(--color-zinc-750) / <alpha-value>)',
          700: 'rgb(var(--color-zinc-700) / <alpha-value>)',
          600: 'rgb(var(--color-zinc-600) / <alpha-value>)',
          500: 'rgb(var(--color-zinc-500) / <alpha-value>)',
          400: 'rgb(var(--color-zinc-400) / <alpha-value>)',
          300: 'rgb(var(--color-zinc-300) / <alpha-value>)',
          200: 'rgb(var(--color-zinc-200) / <alpha-value>)',
          100: 'rgb(var(--color-zinc-100) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
