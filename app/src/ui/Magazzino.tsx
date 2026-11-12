/**
 * Pagina «Magazzino» (titolare): stock teorico di ogni voce e confronto dell'ultimo inventario con l'atteso.
 * Usa fatture, scontrini e movimenti senza incasso (che vede solo il titolare).
 */
import type { Firestore } from 'firebase/firestore';
import { useMemo } from 'preact/hooks';
import type { ScontrinoArchivio } from '../cassa/archivio';
import type { Movimento } from '../cassa/movimenti';
import { oggi } from '../dati/oggi';
import { useRaccolta } from '../dati/useRaccolta.db';
import { foodCost } from '../foodcost/calcolo';
import type { Acquisto, Articolo, Ingrediente, Prodotto } from '../foodcost/modello';
import { NOMI_SEZIONE, vociMagazzino } from '../magazzino/inventario';
import { useInventari, useUnitaConta } from '../magazzino/inventario.db';
import { confronto, eventi, stockTeorico, type InventarioConOra } from '../magazzino/stock';
import { quantitaLeggibile } from '../produzione/produzione';
import { euro } from './formato';
import { FINESTRA_GIORNI } from './Ingredienti';

type ConOra = { creatoIl?: { toMillis?: () => number } };
const ms = (x: ConOra) => x.creatoIl?.toMillis?.() ?? Date.now();
const segno = (n: number, unita: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${quantitaLeggibile(Math.abs(n), unita)}`;

export function Magazzino({ db }: { db: Firestore }) {
  const ing = useRaccolta<Ingrediente>(db, 'ingredienti');
  const pro = useRaccolta<Prodotto>(db, 'prodotti');
  const art = useRaccolta<Articolo>(db, 'articoli');
  const acq = useRaccolta<Acquisto>(db, 'acquisti');
  const prod = useRaccolta<{ id: string; prodotto: string; quantita: number } & ConOra>(db, 'produzioni');
  const sc = useRaccolta<ScontrinoArchivio & { id: string } & ConOra>(db, 'scontrini');
  const mov = useRaccolta<Movimento & { id: string } & ConOra>(db, 'movimenti');
  const inv = useInventari(db, 50);
  const unita = useUnitaConta(db);
  const pronto = ing.caricato && pro.caricato && art.caricato && acq.caricato && prod.caricato && sc.caricato && mov.caricato && inv.caricato;

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
    return { voci, stock, ultimo, diff, prezzo, prova: !veri && scontrini.length > 0 };
  }, [pronto, ing.dati, pro.dati, art.dati, acq.dati, prod.dati, sc.dati, mov.dati, inv.dati, unita]);

  if (!calcolo) return <section class="scheda"><p>Carico…</p></section>;
  const { voci, stock, ultimo, diff, prezzo, prova } = calcolo;
  const perChiave = new Map(voci.map((v) => [v.chiave, v] as const));
  const contate = stock.filter((s) => s.teorico !== null);
  const valoreDiff = diff.reduce((t, d) => t + d.differenza * (prezzo(d.chiave) ?? 0), 0);
  return (
    <section class="scheda" aria-label="Magazzino">
      <h1>Magazzino</h1>
      {prova && <p class="simulatore" role="note">Le vendite usate sono scontrini di <strong>prova</strong> (simulatore).</p>}
      {ultimo ? (<>
        <h2>Ultimo inventario · {ultimo.giorno.split('-').reverse().join('/')}</h2>
        {diff.length ? (<>
          <p class="nota">Contato contro atteso (dall'inventario precedente + fatture + produzione − vendite − senza incasso). Valore delle differenze ai prezzi di oggi: <strong>{euro(valoreDiff)}</strong>.</p>
          <table class="tabella" aria-label="Differenze dell'inventario">
            <thead><tr><th>Voce</th><th>Atteso</th><th>Contato</th><th>Diff.</th></tr></thead>
            <tbody>{diff.map((d) => (
              <tr key={d.chiave} class={d.percentuale !== null && Math.abs(d.percentuale) >= 10 ? 'fuori-soglia' : ''}>
                <th scope="row">{d.nome}</th><td>{quantitaLeggibile(d.atteso, d.unita)}</td><td>{quantitaLeggibile(d.contato, d.unita)}</td>
                <td>{segno(d.differenza, d.unita)}{d.percentuale !== null ? ` (${d.percentuale.toString().replace('.', ',')}%)` : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        </>) : <p class="nota">Per il confronto serve un inventario precedente delle stesse voci: dal prossimo inventario vedrai le differenze.</p>}
      </>) : <p class="nota">Ancora nessun inventario: fai il primo dalla pagina «Inventario», sarà il punto di partenza.</p>}

      <h2>Stock oggi (teorico)</h2>
      <table class="tabella" aria-label="Stock teorico">
        <thead><tr><th>Voce</th><th>Contato</th><th>Movimenti</th><th>Oggi</th></tr></thead>
        <tbody>{contate.map((s) => {
          const v = perChiave.get(s.chiave)!;
          return (
            <tr key={s.chiave}>
              <th scope="row">{v.nome}<br /><small>{NOMI_SEZIONE[v.sezione]} · {s.base!.giorno.split('-').reverse().slice(0, 2).join('/')}</small></th>
              <td>{quantitaLeggibile(s.base!.quantita, v.unita)}</td>
              <td>{s.entrate ? `+${quantitaLeggibile(s.entrate, v.unita)}` : ''}{s.entrate && s.uscite ? ' ' : ''}{s.uscite ? `−${quantitaLeggibile(s.uscite, v.unita)}` : ''}{!s.entrate && !s.uscite ? '—' : ''}</td>
              <td class={s.teorico! < 0 ? 'negativo' : ''}><strong>{quantitaLeggibile(s.teorico!, v.unita)}</strong></td>
            </tr>
          );
        })}</tbody>
      </table>
      {stock.some((s) => s.teorico !== null && s.teorico < 0) && <p class="errore" role="note">Stock negativo: manca una fattura o una produzione registrata, oppure la ricetta non corrisponde.</p>}
      <p class="nota">{stock.length - contate.length} voci mai contate: entrano nello stock dal primo inventario. Le fatture con la stessa data dell'inventario, se l'inventario è del pomeriggio, si considerano già contate.</p>
    </section>
  );
}
