// Flat config (ESLint 9) — replaces `next lint`, which Next 16 removed.
//
// eslint-config-next 16 ships flat-config arrays and bundles every plugin it
// needs (typescript-eslint, react, react-hooks, import, jsx-a11y, @next/next)
// as its own dependencies, so the only devDeps we add are `eslint` and
// `eslint-config-next`. We compose the two published arrays:
//   ./core-web-vitals → base React/import/a11y rules + Next core-web-vitals
//   ./typescript      → typescript-eslint recommended (+ its default ignores)
// then append our own global ignores. Run via `npm run lint` (`eslint .`).
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    // Global ignores (own config object — applies to the whole run). The
    // bundled typescript config already ignores .next/**, out/**, build/** and
    // next-env.d.ts; these add node_modules, the SQL-only supabase tree, and
    // the sharp-generated PWA icon output from scripts/generate-icons.mjs.
    //
    // design/** is the static design-handoff wireframe kit (README + HANDOFF.md
    // + standalone .jsx sketches). It is NOT application source: nothing imports
    // it, it is excluded from tsconfig, and the sketches deliberately reference
    // undefined primitives (INK_SOFT, CourseChip, …). Linting design mockups
    // with app rules is pure noise, so the whole tree is out of lint scope.
    ignores: [
      '.next/**',
      'node_modules/**',
      'supabase/**',
      'design/**',
      'public/icon-*.png',
      'public/icon-maskable-*.png',
    ],
  },
];

export default config;
