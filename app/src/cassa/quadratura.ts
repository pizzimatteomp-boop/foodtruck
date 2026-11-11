/**
 * Chiusura e quadratura di cassa (fase «Cassa», C6). All'apertura si annota il fondo cassa; alla chiusura
 * chi è in cassa conta contanti e carta «alla cieca» (non vede l'atteso): il confronto lo vede il titolare.
 * Atteso = fondo + vendite di questa cassa dall'apertura, meno gli annulli fatti da questa cassa.
 * Importi in centesimi interi; in euro solo nel documento salvato.
 */
import type { ScontrinoArchivio } from './archivio';
import { ErroreCassa } from './carrello';

/** Apertura di una cassa su questo telefono. */
export interface Apertura {
  evento: string;
  cassa: string;
  /** Millisecondi dell'apertura. */
  da: number;
  /** Fondo cassa iniziale in centesimi. */
  fondo: number;
}

export interface Quadratura {
  evento: string;
  cassa: string;
  /** aaaa-mm-gg sul fuso di Roma (giorno della chiusura). */
  giorno: string;
  /** Millisecondi dell'apertura. */
  dal: number;
  /** Euro. */
  fondo: number;
  contanti: number;
  pos: number;
  attesoContanti: number;
  attesoPos: number;
  /** Vendite e annulli di questa cassa nel periodo. */
  scontrini: number;
  annulli: number;
  nota?: string;
}

/** «123,5» o «123.50» → centesimi; vuoto = 0. */
export function centesimi(testo: string, campo: string): number {
  const t = testo.trim().replace(/\s|€/g, '');
  if (!t) return 0;
  const v = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^\d+(\.\d{1,2})?$/.test(v)) throw new ErroreCassa(`${campo}: scrivi un importo (es. 120,50).`);
  const c = Math.round(Number(v) * 100);
  if (c > 10_000_000) throw new ErroreCassa(`${campo}: importo troppo alto.`);
  return c;
}

type ConOra = ScontrinoArchivio & { creatoIl?: unknown };
/** Ora di registrazione (in attesa del server = adesso). */
export function msDi(s: ConOra, adesso: number): number {
  const c = s.creatoIl as { toMillis?: () => number } | null | undefined;
  return typeof c?.toMillis === 'function' ? c.toMillis() : adesso;
}

/** Contanti e carta attesi per questa cassa dall'apertura (scontrini dell'evento, tutte le casse). */
export function atteso(scontrini: readonly ConOra[], a: Apertura, adesso: number): { contanti: number; pos: number; scontrini: number; annulli: number } {
  const perIdtrx = new Map(scontrini.filter((s) => s.tipo === 'V').map((s) => [s.idtrx, s]));
  const nel = scontrini.filter((s) => s.evento === a.evento && s.cassa === a.cassa && msDi(s, adesso) >= a.da);
  const c = { contanti: a.fondo, pos: 0, scontrini: 0, annulli: 0 };
  for (const s of nel) {
    if (s.tipo === 'V') {
      c.scontrini++;
      if (s.pagamento === 'contanti') c.contanti += Math.round(s.totale * 100);
      if (s.pagamento === 'elettronico') c.pos += Math.round(s.totale * 100);
    } else if (s.tipo === 'A') {
      // Il rimborso esce dalla cassa che annulla, col mezzo della vendita originale.
      c.annulli++;
      const o = s.idtrxOriginale ? perIdtrx.get(s.idtrxOriginale) : undefined;
      const importo = Math.round(s.totale * 100);
      if (o?.pagamento === 'elettronico') c.pos -= importo; else if (o?.pagamento === 'contanti') c.contanti -= importo;
    }
  }
  return c;
}

/** Documento della chiusura (euro). */
export function preparaQuadratura(a: Apertura, conta: { contanti: string; pos: string; nota?: string }, scontrini: readonly ConOra[], adesso: number, giorno: string): Quadratura {
  const contanti = centesimi(conta.contanti, 'Contanti contati');
  const pos = centesimi(conta.pos, 'Carta (POS)');
  const at = atteso(scontrini, a, adesso);
  const nota = conta.nota?.trim().slice(0, 300);
  return {
    evento: a.evento, cassa: a.cassa, giorno, dal: a.da, fondo: a.fondo / 100,
    contanti: contanti / 100, pos: pos / 100, attesoContanti: at.contanti / 100, attesoPos: at.pos / 100,
    scontrini: at.scontrini, annulli: at.annulli, ...(nota ? { nota } : {}),
  };
}

/** Differenze contato − atteso (euro, centesimi esatti): positive = in più, negative = mancano. */
export function differenze(q: Pick<Quadratura, 'contanti' | 'pos' | 'attesoContanti' | 'attesoPos'>): { contanti: number; pos: number; quadra: boolean } {
  const dc = Math.round(q.contanti * 100) - Math.round(q.attesoContanti * 100);
  const dp = Math.round(q.pos * 100) - Math.round(q.attesoPos * 100);
  return { contanti: dc / 100, pos: dp / 100, quadra: dc === 0 && dp === 0 };
}

const segno = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(2).replace('.', ',')} €`;

/** Avvisi per il titolare: chiusure che non quadrano. */
export function avvisiQuadrature(q: readonly Quadratura[], nomeEvento: (id: string) => string): string[] {
  return q.flatMap((x) => {
    const d = differenze(x);
    if (d.quadra) return [];
    const parti = [d.contanti ? `contanti ${segno(d.contanti)}` : '', d.pos ? `carta ${segno(d.pos)}` : ''].filter(Boolean);
    return [`Quadratura ${nomeEvento(x.evento)} · ${x.cassa} · ${x.giorno.split('-').reverse().join('/')}: ${parti.join(', ')}`];
  });
}
