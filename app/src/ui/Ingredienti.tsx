/** Pagina «Ingredienti» (solo titolare): elenco con prezzi, oppure la scheda di un ingrediente. */
import type { Firestore } from 'firebase/firestore';
import { useMemo, useState } from 'preact/hooks';
import { prezzoIngrediente, type PrezzoIngrediente } from '../foodcost/calcolo';
import type { Acquisto, Articolo, Ingrediente, Prodotto } from '../foodcost/modello';
import { prezzoMostrato } from '../foodcost/unita';
import { useRaccolta } from '../dati/useRaccolta';
import { euro } from './formato';
import { SchedaIngrediente } from './SchedaIngrediente';

export const FINESTRA_GIORNI = 60;
export const oggi = () => new Date().toISOString().slice(0, 10);
export const dataItaliana = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export function TestoPrezzo({ p, unita }: { p: PrezzoIngrediente; unita: string }) {
  if (!p.prezzo) return <span class="stato mancante">senza prezzo</span>;
  const m = prezzoMostrato(p.prezzo, unita);
  return (
    <span>
      {euro(m.valore)}/{m.per}
      {p.stato === 'vecchio' && <span class="stato vecchio" title={`ultimo acquisto ${dataItaliana(p.ultimoAcquisto!)}`}> vecchio</span>}
    </span>
  );
}

export interface DatiFoodCost {
  ingredienti: Ingrediente[];
  articoli: Articolo[];
  acquisti: Acquisto[];
  prodotti: Prodotto[];
}

export function Ingredienti({ db, parametro }: { db: Firestore; parametro: string | null }) {
  const ing = useRaccolta<Ingrediente>(db, 'ingredienti');
  const art = useRaccolta<Articolo>(db, 'articoli');
  const acq = useRaccolta<Acquisto>(db, 'acquisti');
  const pro = useRaccolta<Prodotto>(db, 'prodotti');
  const [cerca, setCerca] = useState('');
  const dati: DatiFoodCost = { ingredienti: ing.dati, articoli: art.dati, acquisti: acq.dati, prodotti: pro.dati };

  const prezzi = useMemo(() => new Map(ing.dati.map((i) =>
    [i.id, prezzoIngrediente(i.id, art.dati, acq.dati, { finestraGiorni: FINESTRA_GIORNI, oggi: oggi() })] as const)),
  [ing.dati, art.dati, acq.dati]);

  const errore = ing.errore || art.errore || acq.errore || pro.errore;
  if (errore) return <section class="scheda"><p class="errore">{errore}</p></section>;
  if (!ing.caricato || !art.caricato || !acq.caricato || !pro.caricato) return <section class="scheda"><p>Caricamento…</p></section>;

  if (parametro) return <SchedaIngrediente key={parametro} db={db} id={parametro === 'nuovo' ? null : parametro} dati={dati} />;

  const filtro = cerca.trim().toLowerCase();
  const elenco = ing.dati.filter((i) => !filtro || i.nome.toLowerCase().includes(filtro) || i.gruppo.toLowerCase().includes(filtro))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  const fonti = (id: string) => art.dati.filter((a) => a.ingrediente === id).length;
  const senzaPrezzo = ing.dati.filter((i) => !prezzi.get(i.id)?.prezzo).length;

  return (
    <section class="scheda" aria-label="Ingredienti">
      <div class="riga-titolo">
        <h1>Ingredienti</h1>
        <a class="pulsante primario piccolo" href="#/ingredienti/nuovo">+ Nuovo</a>
      </div>
      <p class="nota">Prezzo = media degli acquisti degli ultimi {FINESTRA_GIORNI} giorni, di tutti i fornitori.
        {senzaPrezzo > 0 && <> <strong>{senzaPrezzo} su {ing.dati.length}</strong> senza prezzo: aprili e collega un articolo.</>}</p>
      <input type="search" aria-label="Cerca ingrediente" placeholder="Cerca…" value={cerca} onInput={(e) => setCerca(e.currentTarget.value)} />
      {ing.dati.length === 0 && <p>Nessun ingrediente. Importali da VegMan Planner (menu Importa) o creane uno nuovo.</p>}
      {(['alimentare', 'packaging'] as const).map((cat) => {
        const righe = elenco.filter((i) => i.categoria === cat);
        if (righe.length === 0) return null;
        return (
          <div key={cat}>
            <h2>{cat === 'alimentare' ? 'Alimentare' : 'Packaging'} <small>({righe.length})</small></h2>
            <ul class="elenco">
              {righe.map((i) => {
                const p = prezzi.get(i.id)!;
                const n = fonti(i.id);
                return (
                  <li key={i.id}>
                    <a href={`#/ingredienti/${encodeURIComponent(i.id)}`}>
                      <span class="nome">{i.nome}{i.gruppo && <small> · {i.gruppo}</small>}</span>
                      <span class="valore"><TestoPrezzo p={p} unita={i.unita} /></span>
                      <small class="dettaglio">{n === 0 ? 'nessuna fonte' : n === 1 ? '1 fonte' : `${n} fonti`}
                        {p.ultimoAcquisto && ` · ultimo acquisto ${dataItaliana(p.ultimoAcquisto)}`}</small>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
