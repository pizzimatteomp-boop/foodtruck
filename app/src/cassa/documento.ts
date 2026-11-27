/**
 * Documento commerciale per il cliente, impaginato come uno scontrino (come Billy, deciso da Matteo il
 * 27/11/2026): lo stesso contenuto diventa il PDF da mandare su WhatsApp o email (cassa/pdf.ts) e la
 * stampa sulla stampantina Bluetooth (stampa/escpos.ts). I dati vengono dallo scontrino emesso
 * e dai dati dell'esercente letti dall'Agenzia (`dati/fiscali`). Modulo puro.
 */
import type { Cedente } from '../fiscal/dco';
import type { ScontrinoArchivio } from './archivio';

export interface Esercente {
  /** Denominazione, oppure nome e cognome. */
  nome: string;
  indirizzo: string;
  /** «60027 - Osimo (AN)». */
  luogo: string;
  partitaIva: string;
}

export function esercenteDa(c: Cedente): Esercente {
  return {
    nome: c.denominazione || [c.nome, c.cognome].filter(Boolean).join(' '),
    indirizzo: [c.indirizzo, c.numeroCivico].filter(Boolean).join(', '),
    luogo: `${c.cap} - ${c.comune}${c.provincia ? ` (${c.provincia})` : ''}`,
    partitaIva: c.partitaIva,
  };
}

/** Esercente finto per gli scontrini del simulatore. */
export const ESERCENTE_PROVA: Esercente = { nome: 'Esercente di prova', indirizzo: '', luogo: '', partitaIva: '' };

export const SITO = 'www.vegman.it';

/** Un pezzo del documento: lo impagina chi lo disegna (PDF o carta), alla sua larghezza. */
export type Voce =
  | { tipo: 'testo'; testo: string; centro?: boolean; grassetto?: boolean; grande?: boolean }
  | { tipo: 'coppia'; sinistra: string; destra: string; grassetto?: boolean; grande?: boolean }
  | { tipo: 'linea' }
  | { tipo: 'vuota' };

const cifre = (n: number) => n.toFixed(2);
const PROVA = 'PROVA - NON È UN DOCUMENTO FISCALE';

/** Data e ora come sul documento: «25-10-2026 21:48:07» (fuso di Roma). */
export function dataOra(quando: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(quando).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

/** IVA compresa nel totale (centesimi), scorporata per aliquota come fa l'Agenzia; le nature (N1…N6) non hanno IVA. */
export function ivaCompresa(righe: ScontrinoArchivio['righe']): number {
  const perAliquota = new Map<number, number>();
  for (const r of righe) {
    const a = Number(r.aliquota);
    if (!Number.isFinite(a) || a <= 0) continue;
    perAliquota.set(a, (perAliquota.get(a) ?? 0) + Math.round(r.quantita * r.prezzo * 100));
  }
  let iva = 0;
  for (const [a, lordo] of perAliquota) iva += lordo - Math.round(lordo / (1 + a / 100));
  return iva;
}

/** Contenuto del documento per il cliente. */
export function documentoCliente(s: ScontrinoArchivio, quando: Date, esercente: Esercente): Voce[] {
  const prova = s.ambiente === 'simulatore';
  const annullo = s.tipo !== 'V';
  const v: Voce[] = [];
  if (prova) v.push({ tipo: 'testo', testo: PROVA, centro: true, grassetto: true }, { tipo: 'vuota' });
  v.push({ tipo: 'testo', testo: 'VEGMAN', centro: true, grassetto: true, grande: true });
  for (const t of [esercente.nome, esercente.indirizzo, esercente.luogo, esercente.partitaIva && `P.IVA ${esercente.partitaIva}`, SITO]) {
    if (t) v.push({ tipo: 'testo', testo: t, centro: true });
  }
  v.push({ tipo: 'vuota' }, { tipo: 'testo', testo: 'DOCUMENTO COMMERCIALE', centro: true, grassetto: true });
  v.push({ tipo: 'testo', testo: annullo ? `emesso per ${s.tipo === 'A' ? 'ANNULLAMENTO' : 'RESO MERCE'}` : 'di vendita o prestazione', centro: true });
  if (annullo && s.progressivoOriginale) v.push({ tipo: 'testo', testo: `Documento di riferimento N.${s.progressivoOriginale}`, centro: true });
  v.push({ tipo: 'vuota' }, { tipo: 'coppia', sinistra: 'DESCRIZIONE', destra: `${'IVA%'.padStart(5)}  ${'Prezzo'.padStart(8)}`, grassetto: true });
  for (const r of s.righe) {
    if (r.quantita !== 1) v.push({ tipo: 'testo', testo: `N. ${r.quantita} x ${cifre(r.prezzo)}€` });
    const iva = Number.isFinite(Number(r.aliquota)) ? cifre(Number(r.aliquota)) : r.aliquota;
    v.push({ tipo: 'coppia', sinistra: r.descrizione, destra: `${iva.padStart(5)}  ${cifre(r.quantita * r.prezzo).padStart(8)}` });
  }
  v.push({ tipo: 'linea' });
  v.push({ tipo: 'coppia', sinistra: annullo ? 'TOTALE ANNULLATO' : 'TOTALE COMPLESSIVO', destra: cifre(s.totale), grassetto: true });
  v.push({ tipo: 'coppia', sinistra: 'di cui IVA', destra: cifre(ivaCompresa(s.righe) / 100) });
  if (!annullo) {
    v.push({ tipo: 'coppia', sinistra: s.pagamento === 'elettronico' ? 'Pagamento elettronico' : 'Pagamento contante', destra: cifre(s.totale) });
    v.push({ tipo: 'coppia', sinistra: 'Importo pagato', destra: cifre(s.totale) });
  }
  v.push({ tipo: 'vuota' }, { tipo: 'testo', testo: dataOra(quando), centro: true });
  v.push({ tipo: 'testo', testo: `Documento N.${s.progressivo}`, centro: true });
  if (s.pagamento === 'elettronico' && s.sumup) {
    v.push({ tipo: 'linea' }, { tipo: 'testo', testo: 'Pagamento elettronico · SumUp', centro: true });
    v.push({ tipo: 'testo', testo: `Codice transazione: ${s.sumup}`, centro: true });
    v.push({ tipo: 'testo', testo: `IMPORTO EUR ${cifre(s.totale)}`, centro: true });
  }
  v.push({ tipo: 'vuota' }, { tipo: 'testo', testo: 'Grazie! Cibo 100% vegetale', centro: true });
  if (prova) v.push({ tipo: 'vuota' }, { tipo: 'testo', testo: PROVA, centro: true, grassetto: true });
  return v;
}

/** Riga già impaginata: esattamente `colonne` caratteri (o metà, se grande). */
export interface RigaImpaginata { testo: string; grassetto: boolean; grande: boolean }

function aCapo(testo: string, larghezza: number): string[] {
  const out: string[] = [];
  let r = '';
  for (const p of testo.split(' ')) {
    if (p.length > larghezza) { if (r) out.push(r); for (let i = 0; i < p.length; i += larghezza) out.push(p.slice(i, i + larghezza)); r = ''; continue; }
    if (r && (r + ' ' + p).length > larghezza) { out.push(r); r = p; } else r = r ? `${r} ${p}` : p;
  }
  if (r || !out.length) out.push(r);
  return out;
}

/**
 * Impagina il documento a `colonne` caratteri (32 sulla carta da 58 mm, 40 nel PDF). Le righe grandi
 * hanno caratteri larghi il doppio, quindi metà colonne. `pulisci` adatta i caratteri al mezzo
 * (la stampantina conosce solo l'ASCII).
 */
export function impagina(voci: readonly Voce[], colonne: number, pulisci: (s: string) => string = (s) => s): RigaImpaginata[] {
  const out: RigaImpaginata[] = [];
  for (const v of voci) {
    if (v.tipo === 'vuota') { out.push({ testo: '', grassetto: false, grande: false }); continue; }
    if (v.tipo === 'linea') { out.push({ testo: '-'.repeat(colonne), grassetto: false, grande: false }); continue; }
    const grande = !!v.grande;
    const w = grande ? Math.floor(colonne / 2) : colonne;
    const g = !!v.grassetto;
    if (v.tipo === 'testo') {
      for (const t of aCapo(pulisci(v.testo).trim(), w)) {
        const spazio = v.centro ? Math.floor((w - t.length) / 2) : 0;
        out.push({ testo: ' '.repeat(spazio) + t, grassetto: g, grande });
      }
      continue;
    }
    const d = pulisci(v.destra).trim();
    const righe = aCapo(pulisci(v.sinistra).trim(), w);
    const ultima = righe[righe.length - 1]!;
    if (ultima.length + 1 + d.length <= w) righe[righe.length - 1] = ultima + ' '.repeat(w - ultima.length - d.length) + d;
    else righe.push(' '.repeat(Math.max(0, w - d.length)) + d);
    for (const t of righe) out.push({ testo: t.slice(0, w), grassetto: g, grande });
  }
  return out;
}
