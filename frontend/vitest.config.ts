import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig sets `jsx: preserve` for Next's compiler; the test runner has to
  // transform pdf.tsx itself.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
