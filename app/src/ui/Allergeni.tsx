/** Pagina «Allergeni» (titolare): lista ingredienti generata per ogni prodotto in vendita, IT/EN, e tabella allergeni. */
import type { Firestore } from 'firebase/firestore';
import { useMemo } from 'preact/hooks';
import { useRaccolta } from '../dati/useRaccolta.db';
import { ALLERGENI, type Lingua } from '../etichette/allergeni';
import { listaIngredienti, riepilogoAllergeni, segmentiLista, type ListaIngredienti } from '../etichette/lista';
import type { Ingrediente, Prodotto } from '../foodcost/modello';

function Testo({ l, lingua }: { l: ListaIngredienti; lingua: Lingua }) {
  const r = riepilogoAllergeni(l, lingua);
  const t = lingua === 'it' ? { ing: 'Ingredienti', con: 'Contiene', puo: 'Può contenere', nessuno: 'nessun allergene' } : { ing: 'Ingredients', con: 'Contains', puo: 'May contain', nessuno: 'no allergens' };
  return (
    <div class="lista-ingredienti" lang={lingua}>
      <p><strong>{t.ing}:</strong> {segmentiLista(l.voci, lingua).map((s, i) => (s.grassetto ? <strong key={i}>{s.testo}</strong> : <span key={i}>{s.testo}</span>))}.</p>
      <p><strong>{t.con}:</strong> {r.contiene || t.nessuno}.{r.puoContenere && <> <strong>{t.puo}:</strong> {r.puoContenere}.</>}</p>
    </div>
  );
}

export function Allergeni({ db }: { db: Firestore }) {
  const pro = useRaccolta<Prodotto>(db, 'prodotti');
  const ing = useRaccolta<Ingrediente>(db, 'ingredienti');
  const liste = useMemo(() => {
    const dati = { prodotti: new Map(pro.dati.map((p) => [p.id, p])), ingredienti: new Map(ing.dati.map((i) => [i.id, i])) };
    return pro.dati.filter((p) => p.tipo === 'vendibile').sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
      .map((p) => ({ p, l: listaIngredienti(p.id, dati) }));
  }, [pro.dati, ing.dati]);

  if (pro.errore || ing.errore) return <section class="scheda"><p class="errore">{pro.errore || ing.errore}</p></section>;
  if (!pro.caricato || !ing.caricato) return <section class="scheda"><p>Caricamento…</p></section>;
  const daSistemare = liste.filter(({ l }) => l.problemi.it.length || l.problemi.en.length).length;

  return (
    <section class="scheda" aria-label="Allergeni">
      <h1>Allergeni e ingredienti</h1>
      <p class="nota">Calcolati dalle ricette e dalle etichette degli ingredienti (che compili tu nella pagina Ingredienti).
        {daSistemare > 0 && <> <strong>{daSistemare} prodotti su {liste.length}</strong> hanno dati da completare.</>}</p>

      <h2>Tabella allergeni</h2>
      <div class="scorri">
        <table class="tabella matrice" aria-label="Tabella allergeni">
          <thead><tr><th>Prodotto</th>{ALLERGENI.map((a) => <th key={a.id} title={a.it}><span>{a.breve.it}</span></th>)}</tr></thead>
          <tbody>{liste.map(({ p, l }) => (
            <tr key={p.id}>
              <th scope="row">{p.nome}{(l.problemi.it.length > 0) && <small class="incompleto"> da completare</small>}</th>
              {ALLERGENI.map((a) => (
                <td key={a.id} aria-label={a.it}>{l.allergeni.includes(a.id) ? '●' : l.tracce.includes(a.id) ? '○' : ''}</td>
              ))}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p class="nota"><span class="pallino">●</span> contiene · <span class="pallino">○</span> può contenere tracce</p>

      {liste.map(({ p, l }) => (
        <article key={p.id} class="prodotto-etichetta" aria-label={`Etichetta ${p.nome}`}>
          <h2>{p.nome}</h2>
          {l.problemi.it.length > 0 && <ul class="avvisi errore">{l.problemi.it.map((x) => <li key={x}>{x}</li>)}</ul>}
          {l.voci.length === 0 ? <p class="nota">Ricetta vuota.</p> : (
            <>
              <Testo l={l} lingua="it" />
              <Testo l={l} lingua="en" />
              {l.problemi.en.length > 0 && <ul class="avvisi">{l.problemi.en.map((x) => <li key={x}>Inglese: {x}</li>)}</ul>}
            </>
          )}
        </article>
      ))}
    </section>
  );
}
