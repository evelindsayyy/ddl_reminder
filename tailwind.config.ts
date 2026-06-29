import type { Config } from 'tailwindcss';

// Tokens come from DESIGN_TOKENS.md. This file maps token names to utility
// classes; the color *values* live in app/globals.css as CSS variables (so
// they can be re-themed for dark mode). Components reference these utility
// classes, never raw hex values, except for course-color arbitrary values.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // Colors are backed by CSS variables (RGB channel triplets) defined in
      // app/globals.css `:root`, referenced as `rgb(var(--token) / <alpha-value>)`
      // so Tailwind's `/<alpha>` opacity modifiers (e.g. `bg-urgent/5`) keep
      // working. Light values are unchanged from DESIGN_TOKENS.md; routing them
      // through variables lets a future `.dark` block re-theme without touching
      // components.
      colors: {
        // Brand
        brand: 'rgb(var(--color-brand) / <alpha-value>)',
        // Surfaces
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        'bg-soft': 'rgb(var(--color-bg-soft) / <alpha-value>)',
        'bg-dim': 'rgb(var(--color-bg-dim) / <alpha-value>)',
        // Text
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        'ink-soft': 'rgb(var(--color-ink-soft) / <alpha-value>)',
        'ink-faint': 'rgb(var(--color-ink-faint) / <alpha-value>)',
        // Semantic
        urgent: 'rgb(var(--color-urgent) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        info: 'rgb(var(--color-info) / <alpha-value>)',
        // Application stage tints (mirrored from DESIGN_TOKENS.md §Stage colors)
        stage: {
          applied: 'rgb(var(--color-stage-applied) / <alpha-value>)',
          interview: 'rgb(var(--color-stage-interview) / <alpha-value>)',
          offer: 'rgb(var(--color-stage-offer) / <alpha-value>)',
          rejected: 'rgb(var(--color-stage-rejected) / <alpha-value>)',
        },
      },
      fontFamily: {
        // Hand-drawn type system — see DESIGN_TOKENS.md "Type".
        sans: ['var(--font-sans)', '"Patrick Hand"', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Caveat', 'cursive'],
        mono: ['var(--font-mono)', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '2px',
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
      },
    },
  },
  plugins: [],
};

export default config;
