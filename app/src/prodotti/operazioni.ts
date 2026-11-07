/** Controlli sui prodotti e sulle ricette prima di salvarli. Puro e testato. */
import type { AliquotaVendita, Prodotto, RigaRicetta } from '../foodcost/modello';

export class ErroreProdotto extends Error {
  override name = 'ErroreProdotto';
}

export const ALIQUOTE: readonly AliquotaVendita[] = ['4', '5', '10', '22'];
const num = (v: string | number) => Number(String(v).replace(',', '.'));

/** C'è un giro nelle ricette? (es. salsa A usa salsa B che usa salsa A) */
export function creaGiro(id: string, ricetta: readonly RigaRicetta[], prodotti: ReadonlyMap<string, Prodotto>): boolean {
  const visti = new Set<string>();
  const pila = ricetta.filter((r) => r.tipo === 'prodotto').map((r) => r.id);
  while (pila.length) {
    const x = pila.pop()!;
    if (x === id) return true;
    if (visti.has(x)) continue;
    visti.add(x);
    for (const r of prodotti.get(x)?.ricetta ?? []) if (r.tipo === 'prodotto') pila.push(r.id);
  }
  return false;
}

export function preparaProdotto(
  x: {
    nome: string; nomeEn: string; tipo: Prodotto['tipo']; gruppo: string; prezzo: string | number; iva: string;
    resaQuantita: string | number; resaUnita: string; inMenu: boolean; soglia: string | number | null;
    ricetta: { tipo: RigaRicetta['tipo']; id: string; quantita: string | number }[];
  },
  id: string | null,
  prodotti: ReadonlyMap<string, Prodotto>,
  quotaVendite = 0,
): Omit<Prodotto, 'id'> {
  const nome = x.nome.trim();
  if (!nome) throw new ErroreProdotto('Scrivi il nome del prodotto.');
  if (nome.length > 80 || x.nomeEn.trim().length > 80) throw new ErroreProdotto('Nome troppo lungo.');
  const vendibile = x.tipo === 'vendibile';
  const prezzo = vendibile ? num(x.prezzo) : 0;
  if (vendibile && !(prezzo > 0)) throw new ErroreProdotto('Scrivi il prezzo di vendita.');
  if (!(ALIQUOTE as readonly string[]).includes(x.iva)) throw new ErroreProdotto('Scegli l\'aliquota IVA.');
  const resa = num(x.resaQuantita);
  if (!(resa > 0)) throw new ErroreProdotto(vendibile ? 'Scrivi quanti pezzi fa la ricetta (di solito 1).' : 'Scrivi quanto rende la ricetta (es. 1000 g).');
  const unita = x.resaUnita.trim() || (vendibile ? 'pz' : 'g');
  const soglia = x.soglia === null || x.soglia === '' ? null : num(x.soglia);
  if (soglia !== null && !(soglia > 0 && soglia < 100)) throw new ErroreProdotto('La soglia di food cost va tra 1 e 99 %.');
  if (x.ricetta.length > 100) throw new ErroreProdotto('Ricetta troppo lunga.');
  const ricetta: RigaRicetta[] = x.ricetta.map((r, i) => {
    const q = num(r.quantita);
    if (!r.id) throw new ErroreProdotto(`Riga ${i + 1}: scegli l'ingrediente.`);
    if (!(q > 0)) throw new ErroreProdotto(`Riga ${i + 1}: scrivi la quantità.`);
    if (r.tipo === 'prodotto' && r.id === id) throw new ErroreProdotto('Una ricetta non può contenere sé stessa.');
    return { tipo: r.tipo, id: r.id, quantita: q };
  });
  if (id && creaGiro(id, ricetta, prodotti)) throw new ErroreProdotto('Le ricette si richiamano a vicenda: un semilavorato contiene questo prodotto.');
  return {
    nome, nomeEn: x.nomeEn.trim(), tipo: x.tipo, gruppo: x.gruppo.trim().slice(0, 40), prezzo,
    iva: x.iva as AliquotaVendita, resa: { quantita: resa, unita }, ricetta, quotaVendite,
    inMenu: vendibile && x.inMenu, soglia,
  };
}

/** Prodotti che usano questo semilavorato nella ricetta. */
export function usatoIn(id: string, prodotti: Iterable<Prodotto>): Prodotto[] {
  return [...prodotti].filter((p) => p.ricetta.some((r) => r.tipo === 'prodotto' && r.id === id));
}
