/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: 'rgb(var(--bg-base) / <alpha-value>)',
          elev: 'rgb(var(--bg-elev) / <alpha-value>)',
          row: 'rgb(var(--bg-row) / <alpha-value>)',
          hover: 'rgb(var(--bg-hover) / <alpha-value>)',
        },
        accent: 'rgb(var(--accent) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        'fg-dim': 'rgb(var(--fg-dim) / <alpha-value>)',
        'on-accent': 'rgb(var(--on-accent) / <alpha-value>)',
        'on-danger': 'rgb(var(--on-danger) / <alpha-value>)',
        state: {
          ok: 'rgb(var(--state-ok) / <alpha-value>)',
          warn: 'rgb(var(--state-warn) / <alpha-value>)',
          info: 'rgb(var(--state-info) / <alpha-value>)',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
