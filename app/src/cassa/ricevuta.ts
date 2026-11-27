/**
 * Testo e nome del file che accompagnano il documento per il cliente (il PDF a striscia di
 * cassa/pdf.ts) su WhatsApp o email.
 */
import type { ScontrinoArchivio } from './archivio';

export const FRASE = 'Grazie! Cibo 100% vegetale 🌱';

const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

/** Testo che accompagna il PDF su WhatsApp o email. */
export function messaggioInvio(s: ScontrinoArchivio): string {
  return [
    `VegMan · ${s.tipo === 'A' ? 'annullo' : 'scontrino'} ${s.progressivo} · ${euro(s.totale)}`,
    s.ambiente === 'simulatore' ? 'PROVA: non è un documento fiscale.' : 'In allegato il documento commerciale (PDF).',
    FRASE,
  ].join('\n');
}

/** Nome del file da allegare (solo lettere, cifre e trattini). */
export function nomeFile(s: Pick<ScontrinoArchivio, 'progressivo'>, estensione: 'pdf'): string {
  return `VegMan-${s.progressivo.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.${estensione}`;
}
