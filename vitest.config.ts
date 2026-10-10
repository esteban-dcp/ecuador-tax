import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const pkg = (n: string) => fileURLToPath(new URL(`./packages/${n}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@ecuador-tax/core': pkg('core'),
      '@ecuador-tax/identification': pkg('identification'),
      '@ecuador-tax/access-key': pkg('access-key'),
      '@ecuador-tax/xml': pkg('xml'),
      '@ecuador-tax/signature': pkg('signature'),
      '@ecuador-tax/sri': pkg('sri'),
      '@ecuador-tax/testing': pkg('testing'),
    },
  },
  test: { include: ['packages/*/test/**/*.test.ts'], exclude: ['**/*.integration.test.ts', '**/node_modules/**'] },
});
