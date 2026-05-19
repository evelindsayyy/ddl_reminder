import type { Config } from 'tailwindcss';

// Tokens come from DESIGN_TOKENS.md. Keep this file the single source of
// design constants — components reference these utility classes, never
// raw hex values, except for course-color arbitrary values.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand
        brand: '#6366f1',
        // Surfaces
        bg: '#ffffff',
        'bg-soft': '#fafaf7',
        'bg-dim': '#f2f0e8',
        // Text
        ink: '#1a1a1a',
        'ink-soft': '#525252',
        'ink-faint': '#a3a3a3',
        // Semantic
        urgent: '#d94a38',
        success: '#4a7c59',
        info: '#3a6ea8',
        // Application stage tints (mirrored from DESIGN_TOKENS.md §Stage colors)
        stage: {
          applied: '#525252',
          interview: '#3a6ea8',
          offer: '#4a7c59',
          rejected: '#a3a3a3',
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
