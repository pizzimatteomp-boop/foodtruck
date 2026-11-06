import { defineConfig } from 'vitest/config';

// Test delle regole del database: girano sull'emulatore Firestore (npm run test:regole).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/regole/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
