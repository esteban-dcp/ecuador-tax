import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';

export default defineConfig({
  resolve: base.resolve ?? {},
  test: { include: ['packages/*/test/**/*.integration.test.ts'], exclude: ['**/node_modules/**'], testTimeout: 120_000 },
});
