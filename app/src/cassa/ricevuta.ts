/**
 * Ricevuta per il cliente, in testo semplice (inviata o stampata). Il documento fiscale è il PDF
 * dell'Agenzia: con gli scontrini veri si invia quello; il testo serve al simulatore, alla stampa e
 * come riserva se il PDF non si scarica.
 */
import type { ScontrinoArchivio } from './archivio';

export const FRASE = 'Grazie! Cibo 100% vegetale 🌱';

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
export function nomeFile(s: Pick<ScontrinoArchivio, 'progressivo'>, estensione: 'txt' | 'pdf'): string {
  return `VegMan-${s.progressivo.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.${estensione}`;
}

/** Ricevuta in testo semplice (WhatsApp, email, SMS): niente grafica, si legge ovunque. */
export function testoRicevuta(s: ScontrinoArchivio, quando: Date): string {
  const c = contenutoRicevuta(s, quando);
  return [
    `VegMan · ${c.titolo.toLowerCase()} ${s.progressivo}`,
    c.quando,
    '',
    ...c.righe.map((r) => `${r.testo}  ${r.importo}`),
    '',
    `TOTALE ${c.totale}`,
    `Pagamento: ${c.pagamento}`,
    ...(s.ambiente === 'simulatore' ? ['PROVA: non è un documento fiscale.'] : []),
    '',
    FRASE,
  ].join('\n');
}
