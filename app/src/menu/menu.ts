/**
 * Menu pubblico: la copia che vedono i clienti (QR code e cartello). Contiene solo nomi, prezzi,
 * ingredienti e allergeni dei prodotti «in menu»: niente costi, fornitori o ricette. Puro e testato.
 */
import { listaIngredienti, segmentiLista, type Segmento } from '../etichette/lista';
import type { Allergene } from '../etichette/allergeni';
import type { Ingrediente, Prodotto } from '../foodcost/modello';

export interface VoceMenu {
  id: string;
  nome: { it: string; en: string };
  gruppo: string;
  prezzo: number;
  lista: { it: Segmento[]; en: Segmento[] };
  allergeni: Allergene[];
  tracce: Allergene[];
}

export interface Costruzione {
  voci: VoceMenu[];
  /** Impediscono la pubblicazione: dati delle etichette mancanti o non controllati. */
  bloccanti: string[];
  /** Non bloccano: mancano traduzioni (si mostra l'italiano). */
  avvisi: string[];
}

export function costruisciMenu(prodotti: readonly Prodotto[], ingredienti: readonly Ingrediente[]): Costruzione {
  const dati = { prodotti: new Map(prodotti.map((p) => [p.id, p] as const)), ingredienti: new Map(ingredienti.map((i) => [i.id, i] as const)) };
  const r: Costruzione = { voci: [], bloccanti: [], avvisi: [] };
  const inMenu = prodotti.filter((p) => p.tipo === 'vendibile' && p.inMenu)
    .sort((a, b) => a.gruppo.localeCompare(b.gruppo, 'it') || a.nome.localeCompare(b.nome, 'it'));
  for (const p of inMenu) {
    const l = listaIngredienti(p.id, dati);
    if (l.voci.length === 0) r.bloccanti.push(`${p.nome}: ricetta vuota`);
    for (const x of l.problemi.it) r.bloccanti.push(`${p.nome}: ${x}`);
    for (const x of l.problemi.en) r.avvisi.push(`${p.nome}: ${x}`);
    r.voci.push({
      id: p.id, nome: { it: p.nome, en: p.nomeEn?.trim() || p.nome }, gruppo: p.gruppo, prezzo: p.prezzo,
      lista: { it: segmentiLista(l.voci, 'it'), en: segmentiLista(l.voci, 'en') }, allergeni: l.allergeni, tracce: l.tracce,
    });
  }
  return r;
}

/** Il menu pubblicato è uguale a quello attuale? (per avvisare di modifiche non pubblicate) */
export function stessoMenu(a: readonly VoceMenu[] | undefined, b: readonly VoceMenu[]): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b);
}

/** Voci raggruppate per gruppo, nell'ordine del menu. */
export function perGruppo(voci: readonly VoceMenu[]): { gruppo: string; voci: VoceMenu[] }[] {
  const g: { gruppo: string; voci: VoceMenu[] }[] = [];
  for (const v of voci) {
    const ult = g.at(-1);
    if (ult && ult.gruppo === v.gruppo) ult.voci.push(v);
    else g.push({ gruppo: v.gruppo, voci: [v] });
  }
  return g;
}
