import { defineConfig, devices } from '@playwright/test';

// Prove nel browser: l'app gira collegata agli emulatori Auth e Firestore (npm run test:browser).
export default defineConfig({
  testDir: 'tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'off',
    ...devices['Pixel 7'],
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    // Si prova il pacchetto vero (come quello pubblicato), collegato agli emulatori.
    command: 'npx vite build --outDir dist-prove && npx vite preview --outDir dist-prove --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    env: { VITE_EMULATORI: '1', VITE_AMBIENTE: 'prova' },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
