/** Pagina «Prodotti» (solo titolare): prodotti in vendita e semilavorati con food cost; scheda con l'editor della ricetta. */
import type { Firestore } from 'firebase/firestore';
import { useMemo, useState } from 'preact/hooks';
import { useRaccolta } from '../dati/useRaccolta.db';
import { foodCost } from '../foodcost/calcolo';
import type { Acquisto, Articolo, Ingrediente, Prodotto } from '../foodcost/modello';
import { prezzoMostrato } from '../foodcost/unita';
import { euro, percentuale } from './formato';
import { FINESTRA_GIORNI, oggi } from './Ingredienti';
import { SchedaProdotto } from './SchedaProdotto';

export interface DatiProdotti { prodotti: Prodotto[]; ingredienti: Ingrediente[]; articoli: Articolo[]; acquisti: Acquisto[] }

export function Prodotti({ db, parametro }: { db: Firestore; parametro: string | null }) {
  const pro = useRaccolta<Prodotto>(db, 'prodotti');
  const ing = useRaccolta<Ingrediente>(db, 'ingredienti');
  const art = useRaccolta<Articolo>(db, 'articoli');
  const acq = useRaccolta<Acquisto>(db, 'acquisti');
  const [cerca, setCerca] = useState('');
  const dati: DatiProdotti = { prodotti: pro.dati, ingredienti: ing.dati, articoli: art.dati, acquisti: acq.dati };
  const fc = useMemo(() => foodCost(dati, { finestraGiorni: FINESTRA_GIORNI, oggi: oggi() }), [pro.dati, ing.dati, art.dati, acq.dati]);

  const errore = pro.errore || ing.errore || art.errore || acq.errore;
  if (errore) return <section class="scheda"><p class="errore">{errore}</p></section>;
  if (!pro.caricato || !ing.caricato || !art.caricato || !acq.caricato) return <section class="scheda"><p>Caricamento…</p></section>;
  if (parametro) return <SchedaProdotto key={parametro} db={db} id={parametro === 'nuovo' ? null : parametro} dati={dati} />;

  const filtro = cerca.trim().toLowerCase();
  const elenco = pro.dati.filter((p) => !filtro || p.nome.toLowerCase().includes(filtro) || p.gruppo.toLowerCase().includes(filtro))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));

  return (
    <section class="scheda" aria-label="Prodotti">
      <div class="riga-titolo">
        <h1>Prodotti</h1>
        <a class="pulsante primario piccolo" href="#/prodotti/nuovo">+ Nuovo</a>
      </div>
      <input type="search" aria-label="Cerca prodotto" placeholder="Cerca…" value={cerca} onInput={(e) => setCerca(e.currentTarget.value)} />
      {pro.dati.length === 0 && <p>Nessun prodotto. Importali da VegMan Planner o creane uno nuovo.</p>}
      {(['vendibile', 'semilavorato'] as const).map((tipo) => {
        const righe = elenco.filter((p) => p.tipo === tipo);
        if (righe.length === 0) return null;
        return (
          <div key={tipo}>
            <h2>{tipo === 'vendibile' ? 'In vendita' : 'Semilavorati'} <small>({righe.length})</small></h2>
            <ul class="elenco">
              {righe.map((p) => {
                const c = fc.prodotti.get(p.id)!;
                const oltre = c.percentuale && p.soglia ? c.percentuale.gt(p.soglia) : false;
                const unita = prezzoMostrato(c.costoUnitario, p.resa.unita);
                return (
                  <li key={p.id}>
                    <a href={`#/prodotti/${encodeURIComponent(p.id)}`}>
                      <span class="nome">{p.nome}{p.inMenu && <small class="badge-menu"> in menu</small>}</span>
                      <span class={oltre ? 'valore oltre' : 'valore'}>
                        {tipo === 'vendibile' ? (c.percentuale ? percentuale(c.percentuale) : '—') : `${euro(unita.valore)}/${unita.per}`}
                      </span>
                      <small class="dettaglio">
                        {tipo === 'vendibile' ? `${euro(p.prezzo)} · costo ${euro(c.costoUnitario)}` : `resa ${p.resa.quantita} ${p.resa.unita}`}
                        {!c.completo && <span class="incompleto-inline"> · incompleto</span>}
                        {oltre && <span class="incompleto-inline"> · sopra soglia ({p.soglia}%)</span>}
                      </small>
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
