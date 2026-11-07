/** Scheda di un ingrediente: dati, fonti (articoli dei fornitori) con il loro prezzo, collegamenti, unione, eliminazione. */
import { deleteDoc, doc, type Firestore } from 'firebase/firestore';
import { useState } from 'preact/hooks';
import { prezzoIngrediente } from '../foodcost/calcolo';
import type { Articolo, CategoriaIngrediente } from '../foodcost/modello';
import { suggerimenti } from '../foodcost/somiglianza';
import { fattoreSuggerito } from '../foodcost/unita';
import { CATEGORIE, ErroreIngrediente, preparaFattore, preparaIngrediente } from '../ingredienti/operazioni';
import { collegaArticolo, salvaIngrediente, unisciIngredienti } from '../ingredienti/operazioni.db';
import { AndamentoPrezzo } from './Andamenti';
import { EtichettaIngrediente } from './EtichettaIngrediente';
import { dataItaliana, FINESTRA_GIORNI, oggi, TestoPrezzo, type DatiFoodCost } from './Ingredienti';

type Esito = { testo: string; errore: boolean } | null;
const NOME_CATEGORIA: Record<CategoriaIngrediente, string> = { alimentare: 'Alimentare', packaging: 'Packaging' };

function messaggio(e: unknown): string {
  if (e instanceof ErroreIngrediente) return e.message;
  return (e as { code?: string }).code === 'permission-denied' ? 'Operazione non permessa.' : 'Salvataggio non riuscito: riprova.';
}

function Fonte({ db, a, unitaIngrediente, dati, onEsito }: {
  db: Firestore; a: Articolo; unitaIngrediente: string; dati: DatiFoodCost; onEsito: (e: Esito) => void;
}) {
  const [fattore, setFattore] = useState(String(a.fattore));
  const righe = dati.acquisti.filter((x) => x.articolo === a.id);
  const fornitori = [...new Set(righe.map((x) => x.fornitore).filter(Boolean))].join(', ');
  const prezzo = prezzoIngrediente(a.ingrediente!, [a], dati.acquisti, { finestraGiorni: FINESTRA_GIORNI, oggi: oggi() });
  const azione = async (f: () => Promise<void>, fatto: string) => {
    try { await f(); onEsito({ testo: fatto, errore: false }); } catch (e) { onEsito({ testo: messaggio(e), errore: true }); }
  };
  return (
    <li>
      <div class="nome"><strong>{a.nome}</strong>{fornitori && <small> · {fornitori}</small>}</div>
      <small class="dettaglio">
        <TestoPrezzo p={prezzo} unita={unitaIngrediente} /> · {righe.length} {righe.length === 1 ? 'acquisto' : 'acquisti'}
        {prezzo.ultimoAcquisto && ` · ultimo ${dataItaliana(prezzo.ultimoAcquisto)}`}
      </small>
      <div class="comandi">
        <label class="conversione">1 {a.unita || 'unità'} =
          <input aria-label={`Conversione di ${a.nome}`} inputMode="decimal" value={fattore} onInput={(e) => setFattore(e.currentTarget.value)} />
          {unitaIngrediente}
        </label>
        <button type="button" class="secondario piccolo" disabled={fattore === String(a.fattore)}
          onClick={() => void azione(() => collegaArticolo(db, a, a.ingrediente, preparaFattore(fattore), a.categoria), `Conversione di «${a.nome}» aggiornata.`)}>
          Salva
        </button>
        <button type="button" class="secondario piccolo"
          onClick={() => void azione(() => collegaArticolo(db, a, null, a.fattore, a.categoria), `«${a.nome}» scollegato.`)}>
          Scollega
        </button>
      </div>
    </li>
  );
}

export function SchedaIngrediente({ db, id, dati }: { db: Firestore; id: string | null; dati: DatiFoodCost }) {
  const esistente = id ? dati.ingredienti.find((i) => i.id === id) : null;
  const [modulo, setModulo] = useState({
    nome: esistente?.nome ?? '', categoria: esistente?.categoria ?? 'alimentare', unita: esistente?.unita ?? 'g',
    gruppo: esistente?.gruppo ?? '', confezione: esistente?.confezione == null ? '' : String(esistente.confezione),
  });
  const [esito, setEsito] = useState<Esito>(null);
  const [scelto, setScelto] = useState('');
  const [fattore, setFattore] = useState('1');
  const [unisciCon, setUnisciCon] = useState('');

  if (id && !esistente) {
    return <section class="scheda"><p>Ingrediente non trovato.</p><a href="#/ingredienti">← Ingredienti</a></section>;
  }

  async function salva(ev: Event) {
    ev.preventDefault();
    try {
      const nuovoId = await salvaIngrediente(db, id, preparaIngrediente(modulo));
      setEsito({ testo: 'Salvato.', errore: false });
      if (!id) location.hash = `#/ingredienti/${encodeURIComponent(nuovoId)}`;
    } catch (e) { setEsito({ testo: messaggio(e), errore: true }); }
  }

  const fonti = id ? dati.articoli.filter((a) => a.ingrediente === id) : [];
  const liberi = dati.articoli.filter((a) => !a.ingrediente && a.categoria !== 'non_alimentare');
  const consigliati = suggerimenti(modulo.nome, liberi);
  const altri = liberi.filter((a) => !consigliati.includes(a)).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  const usatoIn = id ? dati.prodotti.filter((p) => p.ricetta.some((r) => r.tipo === 'ingrediente' && r.id === id)) : [];
  const prezzo = id ? prezzoIngrediente(id, dati.articoli, dati.acquisti, { finestraGiorni: FINESTRA_GIORNI, oggi: oggi() }) : null;

  function scegli(artId: string) {
    setScelto(artId);
    const a = dati.articoli.find((x) => x.id === artId);
    setFattore(a ? String(fattoreSuggerito(a, modulo.unita)) : '1');
  }

  async function collega() {
    const a = dati.articoli.find((x) => x.id === scelto);
    if (!a || !id) return;
    try {
      await collegaArticolo(db, a, id, preparaFattore(fattore), modulo.categoria);
      setScelto('');
      setEsito({ testo: `«${a.nome}» collegato.`, errore: false });
    } catch (e) { setEsito({ testo: messaggio(e), errore: true }); }
  }

  async function unisci() {
    const verso = dati.ingredienti.find((i) => i.id === unisciCon);
    if (!id || !verso) return;
    if (!confirm(`Unire «${esistente!.nome}» in «${verso.nome}»? Fonti e ricette passano a «${verso.nome}» e «${esistente!.nome}» viene eliminato.`)) return;
    try {
      await unisciIngredienti(db, id, verso.id, dati.prodotti, dati.articoli);
      location.hash = `#/ingredienti/${encodeURIComponent(verso.id)}`;
    } catch (e) { setEsito({ testo: messaggio(e), errore: true }); }
  }

  async function elimina() {
    if (!id || !confirm(`Eliminare «${esistente!.nome}»?`)) return;
    try {
      await deleteDoc(doc(db, 'ingredienti', id));
      location.hash = '#/ingredienti';
    } catch (e) { setEsito({ testo: messaggio(e), errore: true }); }
  }

  return (
    <section class="scheda" aria-label="Scheda ingrediente">
      <a href="#/ingredienti">← Ingredienti</a>
      <h1>{esistente?.nome ?? 'Nuovo ingrediente'}</h1>
      {prezzo && <p class="prezzo-grande"><TestoPrezzo p={prezzo} unita={modulo.unita} /></p>}

      <form class="nuova" onSubmit={salva}>
        <input aria-label="Nome" placeholder="Nome" required value={modulo.nome} onInput={(e) => setModulo({ ...modulo, nome: e.currentTarget.value })} />
        <div class="due">
          <select aria-label="Categoria" value={modulo.categoria} onChange={(e) => setModulo({ ...modulo, categoria: e.currentTarget.value as CategoriaIngrediente })}>
            {CATEGORIE.map((c) => <option key={c} value={c}>{NOME_CATEGORIA[c]}</option>)}
          </select>
          <input aria-label="Unità" placeholder="g, ml, pz" value={modulo.unita} onInput={(e) => setModulo({ ...modulo, unita: e.currentTarget.value })} />
        </div>
        <div class="due">
          <input aria-label="Gruppo" placeholder="Gruppo (es. Salse)" value={modulo.gruppo} onInput={(e) => setModulo({ ...modulo, gruppo: e.currentTarget.value })} />
          <input aria-label="Confezione" placeholder={`Confezione (${modulo.unita || 'unità'})`} inputMode="decimal" value={modulo.confezione}
            onInput={(e) => setModulo({ ...modulo, confezione: e.currentTarget.value })} />
        </div>
        <button type="submit" class="primario">{id ? 'Salva' : 'Crea ingrediente'}</button>
      </form>
      <p role="status" class={esito?.errore ? 'esito errore' : 'esito'}>{esito?.testo ?? ''}</p>

      {id && esistente && <AndamentoPrezzo ingrediente={esistente} articoli={dati.articoli} acquisti={dati.acquisti} />}
      {id && esistente && esistente.categoria === 'alimentare' && <EtichettaIngrediente db={db} ingrediente={esistente} />}

      {id && (
        <>
          <h2>Fonti <small>({fonti.length})</small></h2>
          {fonti.length === 0 && <p class="nota">Nessun articolo collegato: senza fonti l'ingrediente non ha prezzo.</p>}
          <ul class="persone">
            {fonti.map((a) => <Fonte key={a.id} db={db} a={a} unitaIngrediente={modulo.unita} dati={dati} onEsito={setEsito} />)}
          </ul>

          <h2>Collega un articolo</h2>
          {liberi.length === 0 ? <p class="nota">Nessun articolo libero: arriveranno con le fatture.</p> : (
            <div class="nuova">
              <select aria-label="Articolo da collegare" value={scelto} onChange={(e) => scegli(e.currentTarget.value)}>
                <option value="">Scegli un articolo…</option>
                {consigliati.length > 0 && <optgroup label="Suggeriti">{consigliati.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</optgroup>}
                <optgroup label="Tutti">{altri.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</optgroup>
              </select>
              {scelto && (
                <div class="comandi">
                  <label class="conversione">1 {dati.articoli.find((x) => x.id === scelto)?.unita || 'unità'} =
                    <input aria-label="Conversione" inputMode="decimal" value={fattore} onInput={(e) => setFattore(e.currentTarget.value)} />
                    {modulo.unita}
                  </label>
                  <button type="button" class="primario piccolo" onClick={() => void collega()}>Collega</button>
                </div>
              )}
            </div>
          )}

          <h2>Usato in</h2>
          {usatoIn.length === 0 ? <p class="nota">Nessuna ricetta.</p>
            : <p>{usatoIn.map((p) => p.nome).sort((a, b) => a.localeCompare(b, 'it')).join(', ')}</p>}

          <details>
            <summary>È un doppione? Unisci o elimina</summary>
            <div class="nuova">
              <select aria-label="Unisci con" value={unisciCon} onChange={(e) => setUnisciCon(e.currentTarget.value)}>
                <option value="">Unisci con…</option>
                {dati.ingredienti.filter((i) => i.id !== id).sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
                  .map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </select>
              <button type="button" class="secondario" disabled={!unisciCon} onClick={() => void unisci()}>Unisci</button>
              <button type="button" class="secondario pericolo" disabled={fonti.length > 0 || usatoIn.length > 0} onClick={() => void elimina()}
                title={fonti.length || usatoIn.length ? 'Si può eliminare solo se non ha fonti e non è in nessuna ricetta' : ''}>
                Elimina ingrediente
              </button>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
