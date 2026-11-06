/**
 * Verifica al centesimo: il motore nuovo deve dare gli stessi food cost di VegMan Planner.
 * Le funzioni di calcolo di Planner si leggono direttamente da ../index.html (il codice in uso),
 * e si confrontano su 200 archivi inventati, generati a caso ma riproducibili.
 *
 * Unica differenza voluta: un articolo con sole righe a quantità 0 per Planner costa 0 € (e il prodotto
 * risulta completo); qui è «senza prezzo», perché un prezzo inventato a zero falserebbe il food cost.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { leggiPlanner } from '../importazione/planner';
import { foodCost } from './calcolo';

type Planner = Record<string, unknown[]>;
type Calcolo = (db: Planner, id: string) => { cost: number; complete: boolean; missing: string[] };

function caricaPlanner(): Calcolo {
  const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8');
  const da = html.indexOf('function getArticleStats(');
  const a = html.indexOf('function computeCostSummary(');
  const ref = html.match(/function recipeRef\(r\)\{[\s\S]*?\n\}/);
  if (da < 0 || a < 0 || !ref) throw new Error('Funzioni di calcolo non trovate in index.html');
  const corpo = `function byId(arr,id){ return arr.find(function(x){ return x.id===id; }); }\n${ref[0]}\n${html.slice(da, a)}\nreturn computeProductCost(id, {});`;
  const f = new Function('db', 'id', corpo) as Calcolo;
  return f;
}

// Generatore pseudo-casuale riproducibile.
function casuale(seme: number) {
  let s = seme;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

function archivio(seme: number): Planner {
  const r = casuale(seme);
  const intero = (n: number) => Math.floor(r() * n);
  const nI = 3 + intero(8), nA = 2 + intero(6), nP = 2 + intero(6);
  const articoli = Array.from({ length: nA }, (_, k) => ({ id: `art${k}`, name: `Articolo ${k}`, unit: 'KG' }));
  const ingredienti = Array.from({ length: nI }, (_, k) => {
    const collegato = r() < 0.7;
    return {
      id: `ing${k}`, name: `Ingrediente ${k}`, unit: r() < 0.5 ? 'g' : 'pz', category: 'X', type: 'consumable',
      ...(collegato ? { priceArticleId: `art${k % nA}`, priceFactor: [1, 1000, 24, 0, 2.5][intero(5)] } : {}),
    };
  });
  // un articolo può essere collegato a un solo ingrediente nel modello nuovo: si tiene il primo
  const visti = new Set<string>();
  for (const i of ingredienti) {
    const art = (i as { priceArticleId?: string }).priceArticleId;
    if (art && visti.has(art)) { delete (i as { priceArticleId?: string }).priceArticleId; }
    else if (art) visti.add(art);
  }
  const acquisti = Array.from({ length: intero(25) }, (_, k) => ({
    id: `acq${k}`, date: `2026-0${1 + intero(9)}-1${intero(9)}`, supplier: 'F', description: 'x',
    articleId: r() < 0.85 ? `art${intero(nA)}` : null, qty: [0.5, 1, 2.5, 10, 3][intero(5)], unit: 'KG',
    unitPrice: Math.round(r() * 5000) / 100,
  }));
  const prodotti = Array.from({ length: nP }, (_, k) => ({
    id: `p${k}`, name: `Prodotto ${k}`, kind: r() < 0.4 ? 'component' : 'sellable', price: 5 + intero(8),
    yieldQty: [1, 0, 500, 5600][intero(4)], yieldUnit: 'g',
    recipe: Array.from({ length: 1 + intero(4) }, () => r() < 0.7
      ? { refType: 'ingredient', refId: `ing${intero(nI + 1)}`, qty: [0, 1, 15, 40, 250][intero(5)] }
      : { refType: 'product', refId: `p${intero(nP + 1)}`, qty: [1, 30, 40][intero(3)] }),
  }));
  return { ingredients: ingredienti, products: prodotti, purchases: acquisti, priceArticles: articoli };
}

describe('stessi numeri di VegMan Planner', () => {
  const planner = caricaPlanner();

  it('food cost identico al centesimo (e oltre) su 200 archivi inventati', () => {
    let confronti = 0;
    for (let seme = 1; seme <= 200; seme++) {
      const db = archivio(seme);
      const nuovo = foodCost(leggiPlanner(db), { finestraGiorni: null, oggi: '2099-12-31' });
      for (const p of db.products as { id: string }[]) {
        const vecchio = planner(db, p.id);
        const n = nuovo.prodotti.get(p.id)!;
        // Tolleranza relativa di un miliardesimo: Planner calcola con i decimali approssimati di JavaScript.
        expect(Math.abs(n.costo.toNumber() - vecchio.cost), `archivio ${seme}, ${p.id}`).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(vecchio.cost)));
        expect(n.completo, `archivio ${seme}, ${p.id}`).toBe(vecchio.complete);
        confronti++;
      }
    }
    expect(confronti).toBeGreaterThan(500);
  });

  it('differenza voluta: righe di fattura solo a quantità 0 non danno un prezzo di 0 €', () => {
    const db = {
      ingredients: [{ id: 'i', name: 'Ceci', unit: 'g', priceArticleId: 'a', priceFactor: 1 }],
      products: [{ id: 'p', name: 'Hummus', kind: 'sellable', price: 5, yieldQty: 1, recipe: [{ refType: 'ingredient', refId: 'i', qty: 100 }] }],
      purchases: [{ id: 'r', date: '2026-10-01', articleId: 'a', qty: 0, unitPrice: 3 }],
      priceArticles: [{ id: 'a', name: 'Ceci', unit: 'KG' }],
    };
    expect(planner(db, 'p')).toMatchObject({ cost: 0, complete: true });
    expect(foodCost(leggiPlanner(db), { finestraGiorni: null, oggi: '2099-12-31' }).prodotti.get('p')).toMatchObject({ completo: false, mancanti: ['Ceci'] });
  });
});
