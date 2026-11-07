/**
 * I plugin di Capacitor (Preferences, SecureStorage, …) sono oggetti che rispondono a qualunque nome,
 * anche «then»: se una funzione async li restituisce, chi aspetta il risultato resta bloccato per sempre
 * (successo il 7/11/2026 con «Controllo blocco»). Qui si controlla che nel codice non succeda.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PLUGIN = ['Preferences', 'SecureStorage', 'FirebaseAuthentication', 'CapacitorHttp'];

function file(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? file(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

describe('plugin di Capacitor', () => {
  it('non vengono mai restituiti da funzioni async né dati a await da soli', () => {
    const problemi: string[] = [];
    for (const f of file(join(__dirname, '..'))) {
      const testo = readFileSync(f, 'utf8');
      for (const nome of PLUGIN) {
        const vietati = [
          new RegExp(`\\(await import\\([^)]*\\)\\)\\.${nome}\\b(?!\\s*\\.)`), // (await import('x')).Preferences  senza chiamata
          new RegExp(`return\\s+${nome}\\s*;`),
          new RegExp(`await\\s+${nome}\\s*[;)]`),
          new RegExp(`=>\\s*${nome}\\s*\\)`), // .then(() => Preferences)
        ];
        if (vietati.some((r) => r.test(testo))) problemi.push(`${f}: ${nome}`);
      }
    }
    expect(problemi).toEqual([]);
  });
});
