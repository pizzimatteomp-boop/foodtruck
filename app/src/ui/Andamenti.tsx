/** Grafici dell'andamento: prezzo pagato di un ingrediente, food cost di un prodotto. */
import BigNumber from 'bignumber.js';
import type { Firestore } from 'firebase/firestore';
import { useMemo } from 'preact/hooks';
import { oggi } from '../dati/oggi';
import type { Acquisto, Articolo, Ingrediente, Prodotto } from '../foodcost/modello';
import { prezzoMostrato } from '../foodcost/unita';
import { andamentoFoodCost, meseDi, meseSpostato, mesiTra, nomeMese, prezziMensili, variazione } from '../storico/storico';
import { useFotografie } from '../storico/storico.db';
import { euro, percentuale } from './formato';
import { COLORI_SERIE, Grafico } from './Grafico';

const MESI_MOSTRATI = 12;

/** Mesi da mostrare: dal primo acquisto (al massimo 12 mesi fa) a oggi. */
function mesiDaMostrare(acquisti: readonly Acquisto[]): string[] {
  const ora = meseDi(oggi());
  const primo = acquisti.reduce((m, a) => (a.data < m ? a.data : m), `${ora}-01`).slice(0, 7);
  const da = primo > meseSpostato(ora, -(MESI_MOSTRATI - 1)) ? primo : meseSpostato(ora, -(MESI_MOSTRATI - 1));
  return mesiTra(da, ora);
}

function Variazione({ etichetta, v }: { etichetta: string; v: number | null }) {
  return (
    <div><small>{etichetta}</small>
      {v === null ? <strong>—</strong> : <strong class={v > 0.5 ? 'su' : v < -0.5 ? 'giu' : ''}>{v > 0 ? '+' : ''}{v.toFixed(0)}%</strong>}
    </div>
  );
}

export function AndamentoPrezzo({ ingrediente, articoli, acquisti }: { ingrediente: Ingrediente; articoli: Articolo[]; acquisti: Acquisto[] }) {
  const mesi = useMemo(() => mesiDaMostrare(acquisti.filter((a) => articoli.some((x) => x.id === a.articolo && x.ingrediente === ingrediente.id))), [acquisti, articoli, ingrediente.id]);
  const serie = useMemo(() => prezziMensili(ingrediente.id, articoli, acquisti, mesi), [ingrediente.id, articoli, acquisti, mesi]);
  if (!serie.some((s) => s.prezzo !== null)) return null;
  const mostra = (v: number | null) => (v === null ? null : prezzoMostrato(new BigNumber(v), ingrediente.unita).valore.toNumber());
  const per = prezzoMostrato(new BigNumber(1), ingrediente.unita).per;
  const fonti = articoli.filter((a) => a.ingrediente === ingrediente.id && serie.some((s) => s.perFonte[a.id] !== undefined));
  const valori = serie.map((s) => mostra(s.prezzo));
  const ultimo = [...serie].reverse().find((s) => s.prezzo !== null)!;
  const indietro = (n: number) => serie.find((s) => s.mese === meseSpostato(ultimo.mese, -n))?.prezzo ?? null;
  return (
    <div class="nuova" aria-label="Andamento del prezzo">
      <h2>Andamento del prezzo</h2>
      <p class="nota">Prezzo medio pagato mese per mese (€/{per}), da tutte le fonti.</p>
      <div class="variazioni">
        <Variazione etichetta="su 1 mese" v={variazione(indietro(1), ultimo.prezzo)} />
        <Variazione etichetta="su 3 mesi" v={variazione(indietro(3), ultimo.prezzo)} />
        <Variazione etichetta="su 12 mesi" v={variazione(indietro(12), ultimo.prezzo)} />
      </div>
      <Grafico titolo={`Prezzo di ${ingrediente.nome} mese per mese`} etichette={mesi.map((m) => nomeMese(m))} formato={(n) => euro(n)}
        serie={[
          { nome: fonti.length > 1 ? 'Media' : `€/${per}`, colore: COLORI_SERIE[0]!, valori },
          ...(fonti.length > 1 ? fonti.slice(0, 3).map((a, i) => ({ nome: a.nome, colore: COLORI_SERIE[i + 1]!, sottile: true, valori: serie.map((s) => mostra(s.perFonte[a.id] ?? null)) })) : []),
        ]} />
    </div>
  );
}

export function AndamentoFoodCost({ db, prodotto, dati }: { db: Firestore; prodotto: Prodotto; dati: { ingredienti: Ingrediente[]; prodotti: Prodotto[]; articoli: Articolo[]; acquisti: Acquisto[] } }) {
  const { fotografie, caricato } = useFotografie(db);
  const mesi = useMemo(() => mesiDaMostrare(dati.acquisti), [dati.acquisti]);
  const punti = useMemo(() => (caricato ? andamentoFoodCost(prodotto.id, mesi, fotografie, dati, oggi()) : []),
    [caricato, prodotto.id, mesi, fotografie, dati.ingredienti, dati.prodotti, dati.articoli, dati.acquisti]);
  if (!caricato || !punti.some((p) => p.percentuale !== null)) return null;
  const ricalcolati = punti.some((p) => p.origine === 'ricalcolato');
  return (
    <div class="nuova" aria-label="Andamento del food cost">
      <h2>Andamento del food cost</h2>
      <Grafico titolo={`Food cost di ${prodotto.nome} mese per mese`} etichette={punti.map((p) => nomeMese(p.mese))} formato={(n) => percentuale(n)}
        serie={[{ nome: 'Food cost', colore: COLORI_SERIE[0]!, valori: punti.map((p) => p.percentuale), vuoti: punti.map((p) => p.origine === 'ricalcolato') }]}
        {...(prodotto.soglia ? { soglia: { valore: prodotto.soglia, nome: `soglia ${prodotto.soglia}%` } } : {})} />
      <p class="nota">Pallini pieni: fotografia salvata a fine mese, o oggi. {ricalcolati && 'Pallini vuoti (*): mesi senza fotografia, ricalcolati con la ricetta attuale.'}</p>
    </div>
  );
}
