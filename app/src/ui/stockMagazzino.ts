/**
 * Calcolo dello stock del magazzino (passo M3) e delle scorte minime (P1), comune alle pagine
 * «Magazzino» e «Avvisi». Usa fatture, scontrini e movimenti senza incasso: solo per il titolare.
 */
import type { Firestore } from 'firebase/firestore';
import { useMemo } from 'preact/hooks';
import type { ScontrinoArchivio } from '../cassa/archivio';
import type { Movimento } from '../cassa/movimenti';
import { oggi } from '../dati/oggi';
import { useRaccolta } from '../dati/useRaccolta.db';
import { foodCost } from '../foodcost/calcolo';
import type { Acquisto, Articolo, Ingrediente, Prodotto } from '../foodcost/modello';
import { vociMagazzino } from '../magazzino/inventario';
import { useInventari, useScorte, useUnitaConta } from '../magazzino/inventario.db';
import { sottoScorta } from '../magazzino/scorte';
import { confronto, eventi, stockTeorico, type InventarioConOra } from '../magazzino/stock';
import { FINESTRA_GIORNI } from './Ingredienti';

type ConOra = { creatoIl?: { toMillis?: () => number } };
const ms = (x: ConOra) => x.creatoIl?.toMillis?.() ?? Date.now();


/** Stock teorico, confronto dell'ultimo inventario e scorte minime: per Magazzino e Avvisi (solo titolare). */
export function useStockMagazzino(db: Firestore) {
  const ing = useRaccolta<Ingrediente>(db, 'ingredienti');
  const pro = useRaccolta<Prodotto>(db, 'prodotti');
  const art = useRaccolta<Articolo>(db, 'articoli');
  const acq = useRaccolta<Acquisto>(db, 'acquisti');
  const prod = useRaccolta<{ id: string; prodotto: string; quantita: number } & ConOra>(db, 'produzioni');
  const sc = useRaccolta<ScontrinoArchivio & { id: string } & ConOra>(db, 'scontrini');
  const mov = useRaccolta<Movimento & { id: string } & ConOra>(db, 'movimenti');
  const inv = useInventari(db, 50);
  const unita = useUnitaConta(db);
  const scorte = useScorte(db);
  const pronto = ing.caricato && pro.caricato && art.caricato && acq.caricato && prod.caricato && sc.caricato && mov.caricato && inv.caricato && scorte !== undefined;

  const calcolo = useMemo(() => {
    if (!pronto) return null;
    const voci = vociMagazzino(ing.dati, pro.dati, unita);
    // come nel resoconto: con scontrini veri si usano solo quelli
    const veri = sc.dati.some((s) => s.ambiente === 'agenzia');
    const scontrini = sc.dati.filter((s) => s.ambiente === (veri ? 'agenzia' : 'simulatore'));
    const annullati = new Set(scontrini.filter((s) => s.tipo === 'A' && s.idtrxOriginale).map((s) => s.idtrxOriginale!));
    const uscite = [
      ...scontrini.filter((s) => s.tipo === 'V' && !annullati.has(s.idtrx))
        .flatMap((s) => s.righe.filter((r) => r.prodotto).map((r) => ({ prodotto: r.prodotto!, quantita: r.quantita, ms: s.emergenza ?? ms(s), causa: 'vendita' as const }))),
      ...mov.dati.map((m) => ({ prodotto: m.prodotto, quantita: m.quantita, ms: ms(m), causa: 'senza incasso' as const })),
    ];
    const ev = eventi({
      prodotti: new Map(pro.dati.map((p) => [p.id, p] as const)), articoli: art.dati, acquisti: acq.dati,
      produzioni: prod.dati.map((p) => ({ prodotto: p.prodotto, quantita: p.quantita, ms: ms(p) })), uscite,
    });
    const inventari: InventarioConOra[] = inv.dati.map((x) => ({ ms: x.creatoIl?.toDate?.()?.getTime() ?? Date.now(), giorno: x.giorno, righe: x.righe }));
    const stock = stockTeorico(voci, inventari, ev, Date.now());
    const ultimo = [...inventari].sort((a, b) => b.ms - a.ms)[0];
    const diff = ultimo ? confronto(voci, inventari, ev, ultimo) : [];
    // valore delle differenze ai prezzi di oggi
    const fc = foodCost({ prodotti: pro.dati, ingredienti: ing.dati, articoli: art.dati, acquisti: acq.dati }, { finestraGiorni: FINESTRA_GIORNI, oggi: oggi() });
    const prezzo = (chiave: string): number | null => {
      const [tipo, ...resto] = chiave.split('-');
      const id = resto.join('-');
      if (tipo === 'ingrediente') return fc.prezzi.get(id)?.prezzo?.toNumber() ?? null;
      const c = fc.prodotti.get(id);
      return c?.completo ? c.costoUnitario.toNumber() : null;
    };
    return { voci, stock, ultimo, diff, prezzo, prova: !veri && scontrini.length > 0, scorte: scorte!, sotto: sottoScorta(voci, stock, scorte!) };
  }, [pronto, ing.dati, pro.dati, art.dati, acq.dati, prod.dati, sc.dati, mov.dati, inv.dati, unita, scorte]);
  return calcolo;
}


