import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    // WebView Android recenti e Safari di iPhone/iPad: niente codice di compatibilità inutile.
    target: 'es2022',
    sourcemap: false,
    // Firebase in un file a parte: cambia di rado e resta nella cache del telefono tra un aggiornamento e l'altro.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/ }],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Schermate (*.tsx) e accesso Google si provano nel browser (tests/browser); il codice che legge e scrive
      // nel database (*.db.ts) si prova sull'emulatore (tests/regole). Qui resta la logica pura.
      exclude: ['src/**/*.test.ts', 'src/**/*.tsx', 'src/**/*.db.ts', 'src/firebase/accesso.ts', 'src/vite-env.d.ts'],
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
