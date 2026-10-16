import type { Config } from 'tailwindcss';

// Paleta institucional: marino (estructura), clínico (acción), teal (confirmación), con semánticos sobrios.
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        marino: { DEFAULT: '#0B2545', 700: '#13315C', 600: '#1B3F72', 300: '#8EA4C3', 100: '#DCE5F2' },
        clinico: { DEFAULT: '#1D5FA8', oscuro: '#164A85', claro: '#E8F0FA' },
        teal: { DEFAULT: '#0E7C74', claro: '#E1F3F1' },
        fondo: '#F3F5F8',
        linea: '#D9E0E8',
        tinta: '#13202E',
        tenue: '#5A6A7C',
        alerta: { DEFAULT: '#9A5800', claro: '#FCF0DA' },
        peligro: { DEFAULT: '#B42318', claro: '#FDE9E7' },
        frio: { DEFAULT: '#0B6A9E', claro: '#E0F1FB' },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        titulo: ['"IBM Plex Sans Condensed"', '"IBM Plex Sans"', '"Arial Narrow"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: { tarjeta: '0 1px 2px rgb(11 37 69 / 0.06), 0 1px 1px rgb(11 37 69 / 0.04)' },
    },
  },
  plugins: [],
} satisfies Config;
