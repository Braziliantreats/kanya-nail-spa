/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built game can be hosted from any sub-path or embedded
  // in the dispensary site without rebuild-time knowledge of the final URL.
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    // Game logic is deliberately DOM-free so the test suite runs in plain Node —
    // no jsdom dependency needed (spec: no extra deps without asking).
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
