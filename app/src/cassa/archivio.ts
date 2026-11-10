/**
 * Archivio degli scontrini (fase «Cassa», C2): ogni scontrino emesso si registra nel database
 * e non si modifica né si cancella (regole Firestore). Id = ambiente + idtrx: niente doppioni.
 */
import type { Pagamento } from '../fiscal/prova';
import type { Riga } from './carrello';

export type Ambiente = 'simulatore' | 'agenzia';
/** «nessuno»: annulli e omaggi (vendita a 0 €). «non_riscosso»: vedi `nonRiscosso`. */
export type PagamentoArchivio = 'contanti' | 'elettronico' | 'nessuno' | 'non_riscosso';

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
  righe: { descrizione: string; quantita: number; prezzo: number; aliquota: string; prodotto?: string; omaggio?: true }[];
  /** aaaa-mm-gg sul fuso di Roma. */
  giorno: string;
  sumup?: string;
  progressivoOriginale?: string;
  idtrxOriginale?: string;
  /** Non riscosso: «fattura» (seguirà fattura) o «credito» (beni consegnati, si pagherà dopo). */
  nonRiscosso?: 'fattura' | 'credito';
  /** Omaggio e non riscosso: a chi e perché (obbligatorio). */
  motivo?: string;
}

/** Come si registra un modo di chiudere lo scontrino. */
function pagamentoArchivio(p: Pagamento): PagamentoArchivio {
  return p === 'omaggio' ? 'nessuno' : p === 'fattura' || p === 'credito' ? 'non_riscosso' : p;
}

/** Omaggio = vendita a 0 € senza pagamento. */
export const eOmaggio = (s: Pick<ScontrinoArchivio, 'tipo' | 'pagamento'>) => s.tipo === 'V' && s.pagamento === 'nessuno';

/** Valore di listino delle righe (euro, centesimi esatti). */
export const valoreRighe = (s: Pick<ScontrinoArchivio, 'righe'>) => s.righe.reduce((t, r) => t + Math.round(r.quantita * r.prezzo * 100), 0) / 100;

/** Come è stato chiuso, in parole. */
export function descriviPagamento(s: ScontrinoArchivio): string {
  if (s.tipo !== 'V') return '—';
  if (s.pagamento === 'contanti') return 'Contanti';
  if (s.pagamento === 'elettronico') return `Carta${s.sumup ? ` · ${s.sumup}` : ''}`;
  if (s.pagamento === 'non_riscosso') return s.nonRiscosso === 'fattura' ? 'Non riscosso · seguirà fattura' : 'Non riscosso · da pagare';
  return 'Omaggio';
}

/** Evento provvisorio finché non c'è la scelta dell'evento (passo C3). */
export const SENZA_EVENTO = 'senza-evento';

export const idScontrino = (s: Pick<ScontrinoArchivio, 'ambiente' | 'idtrx'>) => `${s.ambiente}-${s.idtrx}`;

/**
 * Scontrino di vendita da registrare. Totale = quanto vale il documento (0 per l'omaggio);
 * per il non riscosso è l'importo da incassare dopo, non un incasso.
 */
export function scontrinoVendita(a: {
  idtrx: string; progressivo: string; righe: readonly Riga[]; pagamento: Pagamento; ambiente: Ambiente;
  cassa: string; giorno: string; evento?: string; sumup?: string; motivo?: string;
}): ScontrinoArchivio {
  const omaggio = a.pagamento === 'omaggio';
  const s: ScontrinoArchivio = {
    tipo: 'V', idtrx: a.idtrx, progressivo: a.progressivo, evento: a.evento ?? SENZA_EVENTO,
    totale: omaggio ? 0 : a.righe.reduce((t, r) => t + r.quantita * r.centesimi, 0) / 100,
    ambiente: a.ambiente, cassa: a.cassa, pagamento: pagamentoArchivio(a.pagamento), giorno: a.giorno,
    righe: a.righe.map((r) => ({
      descrizione: r.descrizione, quantita: r.quantita, prezzo: r.centesimi / 100, aliquota: r.aliquota,
      ...(r.prodotto ? { prodotto: r.prodotto } : {}), ...(omaggio ? { omaggio: true as const } : {}),
    })),
  };
  if (a.sumup) s.sumup = a.sumup;
  if (a.pagamento === 'fattura' || a.pagamento === 'credito') s.nonRiscosso = a.pagamento;
  const motivo = a.motivo?.trim().slice(0, 200);
  if (motivo) s.motivo = motivo;
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
  /** Incassato: contanti + carta. */
  totale: number;
  /** Da incassare dopo (non riscosso), euro. */
  nonRiscosso: number;
  /** Omaggi: quanti scontrini e valore di listino delle righe, euro. */
  omaggi: number;
  valoreOmaggi: number;
}

/** Vendite del giorno al netto degli annulli; insieme degli idtrx annullati. */
export function riepilogo(scontrini: readonly ScontrinoArchivio[]): RiepilogoGiorno & { annullatiIdtrx: Set<string> } {
  const annullatiIdtrx = new Set(scontrini.filter((s) => s.tipo === 'A' && s.idtrxOriginale).map((s) => s.idtrxOriginale!));
  const cent = { contanti: 0, elettronico: 0, non_riscosso: 0, omaggi: 0 };
  let vendite = 0, omaggi = 0;
  for (const s of scontrini) {
    if (s.tipo !== 'V' || annullatiIdtrx.has(s.idtrx)) continue;
    vendite++;
    if (s.pagamento === 'nessuno') { omaggi++; cent.omaggi += Math.round(valoreRighe(s) * 100); }
    else cent[s.pagamento] += Math.round(s.totale * 100);
  }
  return {
    vendite, annullati: annullatiIdtrx.size, annullatiIdtrx,
    contanti: cent.contanti / 100, elettronico: cent.elettronico / 100, totale: (cent.contanti + cent.elettronico) / 100,
    nonRiscosso: cent.non_riscosso / 100, omaggi, valoreOmaggi: cent.omaggi / 100,
  };
}

/** Nome di questa cassa (per più casse nello stesso evento): testo breve, mai vuoto. */
export function nomeCassa(v: string | null | undefined): string {
  const n = (v ?? '').trim().slice(0, 30);
  return n || 'Cassa 1';
}
