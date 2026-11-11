/**
 * Ricevuta di cortesia VegMan (fase «Cassa», C2b): accompagna il PDF dell'Agenzia, che è il documento
 * fiscale e non si modifica. Qui solo i contenuti; il disegno col marchio è in ui/ricevutaImmagine.ts.
 */
import type { ScontrinoArchivio } from './archivio';

export const FRASE = 'Grazie! Cibo 100% vegetale 🌱';
export const FRASE_EN = 'Thank you! 100% plant-based food';

const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

export interface ContenutoRicevuta {
  titolo: string;
  quando: string;
  righe: { testo: string; importo: string }[];
  totale: string;
  pagamento: string;
  documento: string;
  nota: string;
}

/** Contenuti della ricevuta (data e ora già nel formato italiano). */
export function contenutoRicevuta(s: ScontrinoArchivio, quando: Date): ContenutoRicevuta {
  const data = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(quando);
  return {
    titolo: s.tipo === 'A' ? 'Annullo' : 'Ricevuta',
    quando: data,
    righe: s.righe.map((r) => ({ testo: `${r.quantita} × ${r.descrizione}`, importo: euro(r.quantita * r.prezzo) })),
    totale: euro(s.totale),
    pagamento: s.pagamento === 'contanti' ? 'Contanti' : s.pagamento === 'elettronico' ? `Carta${s.sumup ? ` · ${s.sumup}` : ''}` : '—',
    documento: `Documento commerciale n. ${s.progressivo}`,
    nota: s.ambiente === 'simulatore' ? 'PROVA · non è un documento fiscale' : 'Il documento commerciale è nel PDF allegato',
  };
}

/** Testo che accompagna i file su WhatsApp o email. */
export function messaggioInvio(s: ScontrinoArchivio): string {
  return [
    `VegMan · ${s.tipo === 'A' ? 'annullo' : 'scontrino'} ${s.progressivo} · ${euro(s.totale)}`,
    s.ambiente === 'simulatore' ? 'PROVA: non è un documento fiscale.' : 'In allegato il documento commerciale (PDF).',
    FRASE,
  ].join('\n');
}

/** Nome dei file da allegare (solo lettere, cifre e trattini). */
export function nomeFile(s: Pick<ScontrinoArchivio, 'progressivo'>, estensione: 'png' | 'pdf'): string {
  return `VegMan-${s.progressivo.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.${estensione}`;
}
