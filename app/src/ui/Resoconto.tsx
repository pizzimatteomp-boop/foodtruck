/** Pagina «Resoconto» (titolare): un evento in numeri, dagli scontrini e dai movimenti della cassa. */
import type { Firestore } from 'firebase/firestore';
import { useMemo, useState } from 'preact/hooks';
import { useScontriniEvento } from '../cassa/archivio.db';
import { useMovimentiEvento } from '../cassa/movimenti.db';
import { oggi } from '../dati/oggi';
import { useRaccolta } from '../dati/useRaccolta.db';
import { descriviEvento, type Evento } from '../eventi/eventi';
import { foodCost } from '../foodcost/calcolo';
import type { Acquisto, Articolo, Ingrediente, Prodotto } from '../foodcost/modello';
import { resoconto, type Costi } from '../resoconto/resoconto';
import { euro } from './formato';
import { FINESTRA_GIORNI } from './Ingredienti';

const e = (cent: number) => euro(cent / 100);
const giorno = (g: string) => g.split('-').reverse().slice(0, 2).join('/');

export function Resoconto({ db }: { db: Firestore }) {
  const ev = useRaccolta<Evento>(db, 'eventi');
  const elenco = useMemo(() => [...ev.dati].sort((a, b) => b.dal.localeCompare(a.dal)), [ev.dati]);
  const [scelto, setScelto] = useState('');
  const id = scelto || elenco[0]?.id || '';
  if (!ev.caricato) return <section class="scheda"><p>Carico…</p></section>;
  if (!elenco.length) return <section class="scheda" aria-label="Resoconto"><h1>Resoconto</h1><p class="nota">Ancora nessun evento.</p></section>;
  return (
    <section class="scheda" aria-label="Resoconto">
      <h1>Resoconto</h1>
      <label class="campo"><span>Evento</span>
        <select aria-label="Evento del resoconto" value={id} onChange={(x) => setScelto(x.currentTarget.value)}>
          {elenco.map((x) => <option key={x.id} value={x.id}>{descriviEvento(x)}{x.stato === 'chiuso' ? ' · chiuso' : ''}</option>)}
        </select>
      </label>
      <ResocontoEvento key={id} db={db} evento={id} />
    </section>
  );
}

function ResocontoEvento({ db, evento }: { db: Firestore; evento: string }) {
  const sc = useScontriniEvento(db, evento);
  const mov = useMovimentiEvento(db, evento, true);
  const pro = useRaccolta<Prodotto>(db, 'prodotti');
  const ing = useRaccolta<Ingrediente>(db, 'ingredienti');
  const art = useRaccolta<Articolo>(db, 'articoli');
  const acq = useRaccolta<Acquisto>(db, 'acquisti');
  const costi: Costi = useMemo(() => {
    const fc = foodCost({ prodotti: pro.dati, ingredienti: ing.dati, articoli: art.dati, acquisti: acq.dati }, { finestraGiorni: FINESTRA_GIORNI, oggi: oggi() });
    return new Map(pro.dati.map((p) => {
      const c = fc.prodotti.get(p.id)!;
      return [p.id, { costo: c.costoUnitario.toNumber(), completo: c.completo, nome: p.nome }] as const;
    }));
  }, [pro.dati, ing.dati, art.dati, acq.dati]);
  const r = useMemo(() => resoconto(sc.dati, mov.dati, costi), [sc.dati, mov.dati, costi]);
  if (!sc.caricato || !pro.caricato) return <p class="nota">Carico…</p>;
  return (
    <div class="resoconto">
      {r.prova && <p class="simulatore" role="note">Solo scontrini di <strong>prova</strong> (simulatore): numeri non fiscali.</p>}
      <div class="riquadri" aria-label="Incassi">
        <div><small>Incasso</small><strong>{e(r.incasso)}</strong></div>
        <div><small>Contanti</small><strong>{e(r.contanti)}</strong></div>
        <div><small>Carta</small><strong>{e(r.carta)}</strong></div>
        <div><small>Scontrini</small><strong>{r.scontrini}</strong></div>
        <div><small>Scontrino medio</small><strong>{e(r.medio)}</strong></div>
        <div><small>Margine stimato</small><strong>{e(r.margine)}</strong></div>
      </div>
      <p class="nota">Netto IVA {e(r.netto)} − materie vendute {e(r.costoVenduto)}{r.costoSenzaIncasso ? ` − senza incasso ${e(r.costoSenzaIncasso)}` : ''} = <strong>{e(r.margine)}</strong>
        {r.foodCost !== null ? ` · food cost ${r.foodCost.toString().replace('.', ',')}%` : ''}{r.annullati ? ` · ${r.annullati} annullati (esclusi)` : ''}.
        Costi delle materie ai prezzi di oggi; personale, posteggio e altre spese non comprese.</p>
      {r.incompleti.length > 0 && <p class="errore" role="note">Costo incompleto (manca il prezzo di qualche ingrediente): {r.incompleti.join(', ')}.</p>}

      <h2>Prodotti venduti</h2>
      <table class="tabella" aria-label="Prodotti venduti">
        <thead><tr><th>Prodotto</th><th>Pz</th><th>Incasso</th><th>Costo</th></tr></thead>
        <tbody>{r.prodotti.map((x) => (
          <tr key={x.chiave}><th scope="row">{x.nome}{x.costo !== null && !x.completo ? ' *' : ''}</th><td>{x.pezzi}</td><td>{e(x.incasso)}</td><td>{x.costo === null ? '—' : e(x.costo)}</td></tr>
        ))}</tbody>
      </table>
      {!r.prodotti.length && <p class="nota">Nessuna vendita.</p>}

      {r.senzaIncasso.length > 0 && (<>
        <h2>Senza incasso</h2>
        <table class="tabella" aria-label="Senza incasso">
          <thead><tr><th>Tipo</th><th>Pz</th><th>Costo</th></tr></thead>
          <tbody>{r.senzaIncasso.map((x) => <tr key={x.tipo}><th scope="row">{x.nome}<br /><small>{x.dettaglio}</small></th><td>{x.pezzi}</td><td>{e(x.costo)}</td></tr>)}</tbody>
        </table>
      </>)}

      {r.perGiorno.length > 1 && (<>
        <h2>Per giorno</h2>
        <table class="tabella" aria-label="Per giorno"><tbody>{r.perGiorno.map((x) => <tr key={x.giorno}><th scope="row">{giorno(x.giorno)}</th><td>{x.scontrini} scontrini</td><td>{e(x.incasso)}</td></tr>)}</tbody></table>
      </>)}
      {r.perCassa.length > 1 && (<>
        <h2>Per cassa</h2>
        <table class="tabella" aria-label="Per cassa"><tbody>{r.perCassa.map((x) => <tr key={x.cassa}><th scope="row">{x.cassa}</th><td>{x.scontrini} scontrini</td><td>{e(x.incasso)}</td></tr>)}</tbody></table>
      </>)}
    </div>
  );
}
