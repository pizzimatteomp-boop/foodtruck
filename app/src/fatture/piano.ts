/**
 * Cosa entra nel database caricando delle fatture: fatture nuove, righe (acquisti), articoli nuovi.
 * Puro e testato. Regole:
 * - una fattura si riconosce da fornitore + tipo + numero + data: ricaricarla non crea doppioni;
 * - le fatture già importate da VegMan Planner (stesso numero e data) si saltano;
 * - un articolo si riconosce da partita IVA del fornitore + codice articolo (o descrizione se manca il codice):
 *   se è già collegato a un ingrediente, il prezzo si aggiorna da solo;
 * - le note di credito si archiviano ma non toccano i prezzi; le righe a prezzo zero o negativo nemmeno.
 */
import type { Acquisto, Articolo } from '../foodcost/modello';
import { eNotaDiCredito, type Fattura } from './fatturapa';

/** Impronta breve e stabile di un testo (FNV-1a, 2×32 bit): stessi dati → stesso codice. */
export function impronta(testo: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < testo.length; i++) {
    const c = testo.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 + 2) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

const normale = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim();
const chiaveFornitore = (f: Fattura['fornitore']) => normale(f.partitaIva || f.codiceFiscale || f.nome);

export const idFattura = (f: Fattura) => `fat-${impronta([chiaveFornitore(f.fornitore), f.tipo, normale(f.numero), f.data].join('|'))}`;
export const idArticolo = (fornitore: Fattura['fornitore'], codice: string, descrizione: string) =>
  `art-${impronta([chiaveFornitore(fornitore), codice ? `C:${normale(codice)}` : `D:${normale(descrizione)}`].join('|'))}`;

export interface DocFattura {
  fornitore: string;
  partitaIva: string;
  tipo: string;
  numero: string;
  data: string;
  totale: number;
  righe: number;
  file: string;
}

export interface PianoFatture {
  fatture: { id: string; dati: DocFattura }[];
  acquisti: Acquisto[];
  articoliNuovi: Articolo[];
  saltate: { fornitore: string; numero: string; motivo: string }[];
  /** Righe che aggiornano subito il prezzo di un ingrediente (articolo già collegato). */
  righeCollegate: number;
  noteDiCredito: number;
}

export function pianoFatture(
  lette: { file: string; fattura: Fattura }[],
  esistenti: { fatture: ReadonlySet<string>; acquisti: readonly Acquisto[]; articoli: readonly Articolo[] },
): PianoFatture {
  const piano: PianoFatture = { fatture: [], acquisti: [], articoliNuovi: [], saltate: [], righeCollegate: 0, noteDiCredito: 0 };
  const daPlanner = new Set(esistenti.acquisti.filter((a) => a.origine === 'planner' && a.fattura)
    .map((a) => `${normale(a.fattura!.numero)}|${a.data}`));
  const articoli = new Map(esistenti.articoli.map((a) => [a.id, a] as const));
  const viste = new Set<string>();

  for (const { file, fattura: f } of lette) {
    const id = idFattura(f);
    const salta = (motivo: string) => piano.saltate.push({ fornitore: f.fornitore.nome, numero: f.numero, motivo });
    if (esistenti.fatture.has(id)) { salta('già caricata'); continue; }
    if (viste.has(id)) { salta('presente due volte nei file caricati'); continue; }
    if (daPlanner.has(`${normale(f.numero)}|${f.data}`)) { salta('già importata da VegMan Planner'); continue; }
    viste.add(id);
    piano.fatture.push({ id, dati: {
      fornitore: f.fornitore.nome, partitaIva: f.fornitore.partitaIva, tipo: f.tipo, numero: f.numero,
      data: f.data, totale: f.totale, righe: f.righe.length, file,
    } });
    if (eNotaDiCredito(f)) { piano.noteDiCredito++; continue; }

    for (const r of f.righe) {
      if (!(r.prezzoTotale > 0) || !(r.quantita > 0)) continue;
      const idArt = idArticolo(f.fornitore, r.codice, r.descrizione);
      let art = articoli.get(idArt);
      if (!art) {
        art = {
          id: idArt, nome: r.descrizione || r.codice || '(senza descrizione)', unita: r.unita, categoria: null,
          ingrediente: null, fattore: 1, fornitore: f.fornitore.nome, partitaIva: f.fornitore.partitaIva, codice: r.codice,
        };
        articoli.set(idArt, art);
        piano.articoliNuovi.push(art);
      }
      if (art.ingrediente) piano.righeCollegate++;
      piano.acquisti.push({
        id: `${id}-${r.linea}`, data: f.data, fornitore: f.fornitore.nome, descrizione: r.descrizione, articolo: idArt,
        quantita: r.quantita, unita: r.unita, prezzoUnitario: r.prezzoUnitario, fattura: { numero: f.numero, id }, origine: 'fattura',
      });
    }
  }
  return piano;
}
