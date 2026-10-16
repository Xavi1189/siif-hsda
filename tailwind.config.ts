import type { Config } from 'tailwindcss';

// Paleta del Manual de Identidad HSDA (2025): #33394C, #3C5775, #A5B7CF, #F8F4EF. Teal y semánticos solo para estados.
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        marino: { DEFAULT: '#33394C', 700: '#3C4560', 600: '#3C5775', 300: '#A5B7CF', 100: '#E4EAF2' },
        clinico: { DEFAULT: '#3C5775', oscuro: '#33394C', claro: '#EBF0F6' },
        teal: { DEFAULT: '#0E7C74', claro: '#E1F3F1' },
        fondo: '#F8F4EF',
        linea: '#DEDBD5',
        tinta: '#1F2433',
        tenue: '#5B6474',
        alerta: { DEFAULT: '#9A5800', claro: '#FCF0DA' },
        peligro: { DEFAULT: '#B42318', claro: '#FDE9E7' },
        frio: { DEFAULT: '#0B6A9E', claro: '#E0F1FB' },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        // Avenir (tipografía del manual) es de licencia; Poppins es el sustituto web acordado.
        titulo: ['Avenir', '"Avenir Next"', 'Poppins', '"IBM Plex Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: { tarjeta: '0 1px 2px rgb(51 57 76 / 0.04), 0 6px 18px rgb(51 57 76 / 0.05)' },
    },
  },
  plugins: [],
} satisfies Config;
