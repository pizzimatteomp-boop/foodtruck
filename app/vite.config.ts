import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    // WebView Android recenti e Safari di iPhone/iPad: niente codice di compatibilità inutile.
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // accesso.ts richiede un vero accesso Google: si prova nell'app, non qui.
      exclude: ['src/**/*.test.ts', 'src/firebase/accesso.ts'],
      reporter: ['text', 'json-summary'],
      // Soglie minime: se i test coprono meno codice di così, il controllo fallisce.
      // Il modulo fiscale deve restare coperto per intero (righe e funzioni).
      thresholds: {
        lines: 90,
        functions: 90,
        'src/fiscal/**': { lines: 100, functions: 100, statements: 95, branches: 80 },
      },
    },
  },
});
