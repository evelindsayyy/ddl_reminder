import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

// vitest joins the repo ALONGSIDE the tsx chain (23 suites in lib/*.test.ts,
// run by `npm test`). This harness owns only tests/**: route tests run under
// the default `node` environment; component tests opt into jsdom per file with
// a `// @vitest-environment jsdom` pragma. `vite-tsconfig-paths` supplies the
// `@/` → repo-root alias from tsconfig.json so tests import like app code.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts?(x)'],
  },
});
