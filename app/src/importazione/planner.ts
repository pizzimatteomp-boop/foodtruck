/**
 * Import una tantum da VegMan Planner (file di backup JSON o cella A1 del foglio «Data»).
 * Gli identificativi di Planner restano gli stessi: rifare l'import non crea doppioni.
 * Eventi e comande non si importano qui (decisione del 6/11/2026: comande storiche escluse).
 */
import type { Acquisto, Articolo, Ingrediente, Prodotto, RigaRicetta } from '../foodcost/modello';

export class ErroreImport extends Error {
  override name = 'ErroreImport';
}

export interface RisultatoImport {
  ingredienti: Ingrediente[];
  prodotti: Prodotto[];
  articoli: Articolo[];
  acquisti: Acquisto[];
  /** Cose da sistemare dopo l'import, in parole semplici. */
  avvisi: string[];
}

type Grezzo = Record<string, unknown>;
const lista = (v: unknown): Grezzo[] => (Array.isArray(v) ? v.filter((x): x is Grezzo => !!x && typeof x === 'object') : []);
const testo = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const numero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const idValido = (v: unknown): string | null => {
  const s = testo(v);
  return /^[A-Za-z0-9_-]{1,100}$/.test(s) ? s : null;
};

export function leggiPlanner(json: string | unknown): RisultatoImport {
  let db: unknown = json;
  if (typeof json === 'string') {
    try { db = JSON.parse(json); } catch { throw new ErroreImport('Il file non è un backup di VegMan Planner (JSON non valido).'); }
  }
  if (!db || typeof db !== 'object' || !Array.isArray((db as Grezzo).ingredients) || !Array.isArray((db as Grezzo).products)) {
    throw new ErroreImport('Il file non sembra un backup di VegMan Planner: mancano ingredienti e prodotti.');
  }
  const d = db as Grezzo;
  const avvisi: string[] = [];

  // Ingredienti. In Planner l'ingrediente punta a un solo articolo; qui è l'articolo a puntare all'ingrediente.
  const collegamenti = new Map<string, { ingrediente: string; fattore: number }>();
  const ingredienti: Ingrediente[] = [];
  for (const i of lista(d.ingredients)) {
    const id = idValido(i.id);
    if (!id) { avvisi.push(`Ingrediente senza codice valido saltato: «${testo(i.name)}».`); continue; }
    ingredienti.push({
      id,
      nome: testo(i.name) || '(senza nome)',
      categoria: 'alimentare',
      unita: testo(i.unit) || 'pz',
      gruppo: testo(i.category),
      confezione: numero(i.packageSize) > 0 ? numero(i.packageSize) : null,
    });
    const art = idValido(i.priceArticleId);
    if (art) {
      if (collegamenti.has(art)) avvisi.push(`L'articolo ${art} era collegato a più ingredienti: tenuto il primo, controlla «${testo(i.name)}».`);
      else collegamenti.set(art, { ingrediente: id, fattore: numero(i.priceFactor) > 0 ? numero(i.priceFactor) : 1 });
    }
  }
  const idIngredienti = new Set(ingredienti.map((i) => i.id));

  // Prodotti e semilavorati con le loro ricette.
  const prodotti: Prodotto[] = [];
  for (const p of lista(d.products)) {
    const id = idValido(p.id);
    if (!id) { avvisi.push(`Prodotto senza codice valido saltato: «${testo(p.name)}».`); continue; }
    const semilavorato = p.kind === 'component';
    const ricetta: RigaRicetta[] = lista(p.recipe).map((r) => ({
      tipo: r.refType === 'product' ? 'prodotto' as const : 'ingrediente' as const,
      id: idValido(r.refId ?? r.ingredientId) ?? '',
      quantita: numero(r.qty),
    })).filter((r) => r.id && r.quantita > 0);
    const resa = numero(p.yieldQty) > 0 ? numero(p.yieldQty) : 1;
    prodotti.push({
      id,
      nome: testo(p.name) || '(senza nome)',
      tipo: semilavorato ? 'semilavorato' : 'vendibile',
      gruppo: testo(p.category),
      prezzo: semilavorato ? 0 : numero(p.price),
      resa: { quantita: resa, unita: testo(p.yieldUnit) || 'pz' },
      ricetta,
      quotaVendite: semilavorato ? 0 : numero(p.pct),
    });
    if (ricetta.length === 0) avvisi.push(`«${testo(p.name)}» ha la ricetta vuota.`);
    else if (semilavorato && resa <= 1) avvisi.push(`«${testo(p.name)}» ha una resa di ${resa} ${testo(p.yieldUnit)}: controlla.`);
  }
  const idProdotti = new Set(prodotti.map((p) => p.id));
  for (const p of prodotti) {
    for (const r of p.ricetta) {
      const esiste = r.tipo === 'prodotto' ? idProdotti.has(r.id) : idIngredienti.has(r.id);
      if (!esiste) avvisi.push(`«${p.nome}» usa un ${r.tipo === 'prodotto' ? 'semilavorato' : 'ingrediente'} che non esiste più.`);
    }
  }

  // Acquisti (righe di fattura) e articoli.
  const acquisti: Acquisto[] = [];
  for (const a of lista(d.purchases)) {
    const id = idValido(a.id);
    if (!id) continue;
    const data = testo(a.date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { avvisi.push(`Acquisto «${testo(a.description)}» senza data valida saltato.`); continue; }
    const numeroFattura = testo(a.invoiceNumber);
    acquisti.push({
      id,
      data,
      fornitore: testo(a.supplier),
      descrizione: testo(a.description),
      articolo: idValido(a.articleId),
      quantita: numero(a.qty),
      unita: testo(a.unit),
      prezzoUnitario: numero(a.unitPrice),
      fattura: numeroFattura ? { numero: numeroFattura, id: testo(a.invoiceId) } : null,
      origine: 'planner',
    });
  }
  const articoli: Articolo[] = [];
  for (const x of lista(d.priceArticles)) {
    const id = idValido(x.id);
    if (!id) continue;
    const c = collegamenti.get(id);
    articoli.push({
      id,
      nome: testo(x.name) || '(senza nome)',
      unita: testo(x.unit),
      categoria: c ? 'alimentare' : null,
      ingrediente: c && idIngredienti.has(c.ingrediente) ? c.ingrediente : null,
      fattore: c?.fattore ?? 1,
    });
  }

  const senzaArticolo = acquisti.filter((a) => !a.articolo).length;
  if (senzaArticolo) avvisi.push(senzaArticolo === 1 ? '1 riga di fattura non è collegata a nessun articolo.' : `${senzaArticolo} righe di fattura non sono collegate a nessun articolo.`);
  const collegati = new Set(articoli.map((a) => a.ingrediente).filter(Boolean));
  const senzaPrezzo = ingredienti.filter((i) => !collegati.has(i.id)).length;
  if (senzaPrezzo) avvisi.push(`${senzaPrezzo === 1 ? '1 ingrediente' : `${senzaPrezzo} ingredienti`} su ${ingredienti.length} ${senzaPrezzo === 1 ? 'non ha' : 'non hanno'} ancora un prezzo (nessun articolo collegato).`);

  return { ingredienti, prodotti, articoli, acquisti, avvisi };
}
