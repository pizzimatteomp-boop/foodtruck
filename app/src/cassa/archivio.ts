/**
 * Archivio degli scontrini (fase «Cassa», C2): ogni scontrino emesso si registra nel database
 * e non si modifica né si cancella (regole Firestore). Id = ambiente + idtrx: niente doppioni.
 */
import type { Riga } from './carrello';

export type Ambiente = 'simulatore' | 'agenzia';
export type PagamentoArchivio = 'contanti' | 'elettronico' | 'nessuno';

export interface ScontrinoArchivio {
  tipo: 'V' | 'A' | 'R';
  idtrx: string;
  progressivo: string;
  evento: string;
  /** Euro, IVA inclusa (per annulli e resi: l'importo restituito, positivo). */
  totale: number;
  ambiente: Ambiente;
  cassa: string;
  pagamento: PagamentoArchivio;
  righe: { descrizione: string; quantita: number; prezzo: number; aliquota: string; prodotto?: string }[];
  /** aaaa-mm-gg sul fuso di Roma. */
  giorno: string;
  sumup?: string;
  progressivoOriginale?: string;
  idtrxOriginale?: string;
  /** Emesso dopo, dal registro di emergenza: millisecondi della vendita vera. */
  emergenza?: number;
}

/** Evento provvisorio finché non c'è la scelta dell'evento (passo C3). */
export const SENZA_EVENTO = 'senza-evento';

export const idScontrino = (s: Pick<ScontrinoArchivio, 'ambiente' | 'idtrx'>) => `${s.ambiente}-${s.idtrx}`;

export function scontrinoVendita(a: {
  idtrx: string; progressivo: string; righe: readonly Riga[]; pagamento: 'contanti' | 'elettronico'; ambiente: Ambiente;
  cassa: string; giorno: string; evento?: string; sumup?: string; emergenza?: number;
}): ScontrinoArchivio {
  const s: ScontrinoArchivio = {
    tipo: 'V', idtrx: a.idtrx, progressivo: a.progressivo, evento: a.evento ?? SENZA_EVENTO,
    totale: a.righe.reduce((t, r) => t + r.quantita * r.centesimi, 0) / 100,
    ambiente: a.ambiente, cassa: a.cassa, pagamento: a.pagamento, giorno: a.giorno,
    righe: a.righe.map((r) => ({ descrizione: r.descrizione, quantita: r.quantita, prezzo: r.centesimi / 100, aliquota: r.aliquota, ...(r.prodotto ? { prodotto: r.prodotto } : {}) })),
  };
  if (a.sumup) s.sumup = a.sumup;
  if (a.emergenza) s.emergenza = a.emergenza;
  return s;
}

export function scontrinoAnnullo(originale: ScontrinoArchivio, a: { idtrx: string; progressivo: string; cassa: string; giorno: string }): ScontrinoArchivio {
  return {
    tipo: 'A', idtrx: a.idtrx, progressivo: a.progressivo, evento: originale.evento, totale: originale.totale,
    ambiente: originale.ambiente, cassa: a.cassa, pagamento: 'nessuno', giorno: a.giorno, righe: originale.righe,
    progressivoOriginale: originale.progressivo, idtrxOriginale: originale.idtrx,
  };
}

export interface RiepilogoGiorno {
  vendite: number;
  annullati: number;
  /** Totali al netto degli annulli, in euro. */
  contanti: number;
  elettronico: number;
  totale: number;
}

/** Vendite del giorno al netto degli annulli; insieme degli idtrx annullati. */
export function riepilogo(scontrini: readonly ScontrinoArchivio[]): RiepilogoGiorno & { annullatiIdtrx: Set<string> } {
  const annullatiIdtrx = new Set(scontrini.filter((s) => s.tipo === 'A' && s.idtrxOriginale).map((s) => s.idtrxOriginale!));
  const cent = { contanti: 0, elettronico: 0 };
  let vendite = 0;
  for (const s of scontrini) {
    if (s.tipo !== 'V' || annullatiIdtrx.has(s.idtrx)) continue;
    vendite++;
    if (s.pagamento === 'contanti' || s.pagamento === 'elettronico') cent[s.pagamento] += Math.round(s.totale * 100);
  }
  return {
    vendite, annullati: annullatiIdtrx.size, annullatiIdtrx,
    contanti: cent.contanti / 100, elettronico: cent.elettronico / 100, totale: (cent.contanti + cent.elettronico) / 100,
  };
}

/** Nome di questa cassa (per più casse nello stesso evento): testo breve, mai vuoto. */
export function nomeCassa(v: string | null | undefined): string {
  const n = (v ?? '').trim().slice(0, 30);
  return n || 'Cassa 1';
}
