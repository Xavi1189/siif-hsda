import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  test: { environment: 'node', testTimeout: 60000, hookTimeout: 120000, fileParallelism: false },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
