/** Scheda prodotto: dati, editor della ricetta con costi, lista ingredienti e allergeni che si aggiornano mentre scrivi. */
import type { Firestore } from 'firebase/firestore';
import { useMemo, useState } from 'preact/hooks';
import { listaIngredienti } from '../etichette/lista';
import { costoProdotto, foodCost } from '../foodcost/calcolo';
import type { Prodotto, RigaRicetta } from '../foodcost/modello';
import { prezzoMostrato } from '../foodcost/unita';
import { ALIQUOTE, ErroreProdotto, preparaProdotto, usatoIn } from '../prodotti/operazioni';
import { eliminaProdotto, impostaInMenu, salvaProdotto } from '../prodotti/operazioni.db';
import { TestoLista } from './Allergeni';
import { AndamentoFoodCost } from './Andamenti';
import { euro, percentuale } from './formato';
import { FINESTRA_GIORNI, oggi } from './Ingredienti';
import type { DatiProdotti } from './Prodotti';

const BOZZA = '__bozza__';
type Riga = { tipo: RigaRicetta['tipo']; id: string; quantita: string };
const num = (v: string) => Number(v.replace(',', '.'));

export function SchedaProdotto({ db, id, dati }: { db: Firestore; id: string | null; dati: DatiProdotti }) {
  const esistente = id ? dati.prodotti.find((p) => p.id === id) : undefined;
  const [m, setM] = useState({
    nome: esistente?.nome ?? '', nomeEn: esistente?.nomeEn ?? '', tipo: esistente?.tipo ?? 'vendibile' as Prodotto['tipo'],
    gruppo: esistente?.gruppo ?? '', prezzo: esistente?.prezzo ? String(esistente.prezzo) : '', iva: esistente?.iva ?? '10',
    resaQuantita: String(esistente?.resa.quantita ?? 1), resaUnita: esistente?.resa.unita ?? 'pz',
    inMenu: esistente?.inMenu ?? false, soglia: esistente?.soglia == null ? '' : String(esistente.soglia),
  });
  const [righe, setRighe] = useState<Riga[]>(esistente?.ricetta.map((r) => ({ ...r, quantita: String(r.quantita) })) ?? []);
  const [esito, setEsito] = useState<{ testo: string; errore: boolean } | null>(null);

  // Prodotto in bozza (anche con dati incompleti), per costi e lista ingredienti dal vivo.
  const chiave = id ?? BOZZA;
  const bozza: Prodotto = {
    id: chiave, nome: m.nome || 'Nuovo prodotto', nomeEn: m.nomeEn, tipo: m.tipo, gruppo: m.gruppo, prezzo: m.tipo === 'vendibile' ? num(m.prezzo) || 0 : 0,
    resa: { quantita: num(m.resaQuantita) > 0 ? num(m.resaQuantita) : 1, unita: m.resaUnita || 'pz' },
    ricetta: righe.filter((r) => r.id && num(r.quantita) > 0).map((r) => ({ tipo: r.tipo, id: r.id, quantita: num(r.quantita) })),
    quotaVendite: esistente?.quotaVendite ?? 0,
  };
  const prodotti = useMemo(() => [...dati.prodotti.filter((p) => p.id !== chiave), bozza], [dati.prodotti, JSON.stringify(bozza)]);
  const fc = useMemo(() => foodCost({ ...dati, prodotti }, { finestraGiorni: FINESTRA_GIORNI, oggi: oggi() }), [prodotti, dati.ingredienti, dati.articoli, dati.acquisti]);
  const mappe = useMemo(() => ({
    prodotti: new Map(prodotti.map((p) => [p.id, p] as const)),
    ingredienti: new Map(dati.ingredienti.map((i) => [i.id, i] as const)),
    prezzi: fc.prezzi,
  }), [prodotti, dati.ingredienti, fc]);
  const c = fc.prodotti.get(chiave)!;
  const lista = useMemo(() => listaIngredienti(chiave, mappe), [mappe]);

  if (id && !esistente) return <section class="scheda"><p>Prodotto non trovato.</p><a href="#/prodotti">← Prodotti</a></section>;

  const costoRiga = (r: Riga) => {
    if (!r.id || !(num(r.quantita) > 0)) return null;
    const x = costoProdotto('__riga__', { ...mappe, prodotti: new Map([...mappe.prodotti, ['__riga__', { ...bozza, id: '__riga__', ricetta: [{ tipo: r.tipo, id: r.id, quantita: num(r.quantita) }] }]]) });
    return x.completo ? x.costo : null;
  };
  const unitaRiga = (r: Riga) => r.tipo === 'ingrediente' ? dati.ingredienti.find((i) => i.id === r.id)?.unita ?? '' : dati.prodotti.find((p) => p.id === r.id)?.resa.unita ?? '';
  const aggiorna = (i: number, v: Partial<Riga>) => setRighe(righe.map((r, j) => (j === i ? { ...r, ...v } : r)));
  const ordinati = <T extends { nome: string }>(x: T[]) => [...x].sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  const usi = id ? usatoIn(id, dati.prodotti) : [];
  const unitaCosto = prezzoMostrato(c.costoUnitario, bozza.resa.unita);
  const oltre = c.percentuale && num(m.soglia) > 0 ? c.percentuale.gt(num(m.soglia)) : false;

  async function salva(ev: Event) {
    ev.preventDefault();
    try {
      const datiOk = preparaProdotto({ ...m, ricetta: righe }, id, new Map(dati.prodotti.map((p) => [p.id, p])), esistente?.quotaVendite ?? 0);
      const nuovoId = await salvaProdotto(db, id, datiOk);
      setEsito({ testo: 'Salvato.', errore: false });
      if (!id) location.hash = `#/prodotti/${encodeURIComponent(nuovoId)}`;
    } catch (e) {
      setEsito({ testo: e instanceof ErroreProdotto ? e.message : (e as { code?: string }).code === 'permission-denied' ? 'Operazione non permessa.' : 'Salvataggio non riuscito: riprova.', errore: true });
    }
  }
  /** La spunta «In menu» sui prodotti già salvati si salva subito. */
  async function cambiaMenu(v: boolean) {
    setM({ ...m, inMenu: v });
    if (!id) return;
    try {
      await impostaInMenu(db, id, v);
      setEsito({ testo: v ? 'Aggiunto al menu.' : 'Tolto dal menu.', errore: false });
    } catch { setEsito({ testo: 'Salvataggio non riuscito: riprova.', errore: true }); setM({ ...m, inMenu: !v }); }
  }

  async function elimina() {
    if (!id || !confirm(`Eliminare «${esistente!.nome}»?`)) return;
    await eliminaProdotto(db, id);
    location.hash = '#/prodotti';
  }

  return (
    <section class="scheda" aria-label="Scheda prodotto">
      <a href="#/prodotti">← Prodotti</a>
      <h1>{esistente?.nome ?? 'Nuovo prodotto'}</h1>

      <form class="nuova" onSubmit={salva} aria-label="Dati del prodotto">
        <div class="scelte" role="group" aria-label="Tipo">
          {(['vendibile', 'semilavorato'] as const).map((t) => (
            <button key={t} type="button" class={m.tipo === t ? 'scelta attiva' : 'scelta'} aria-pressed={m.tipo === t}
              onClick={() => setM({ ...m, tipo: t, resaUnita: t === 'vendibile' ? 'pz' : (m.resaUnita === 'pz' ? 'g' : m.resaUnita), resaQuantita: t === 'vendibile' ? '1' : m.resaQuantita })}>
              {t === 'vendibile' ? 'In vendita' : 'Semilavorato'}
            </button>
          ))}
        </div>
        {m.tipo === 'vendibile' && (
          <label class={m.inMenu ? 'riquadro-menu attivo' : 'riquadro-menu'}>
            <input type="checkbox" aria-label="In menu" checked={m.inMenu} onChange={(e) => void cambiaMenu(e.currentTarget.checked)} />
            <span><strong>{m.inMenu ? 'In menu' : 'Non in menu'}</strong>
              <small>{m.inMenu ? 'Compare nel menu pubblico (dopo «Pubblica» in Menu e QR)' : 'Spunta per metterlo nel menu pubblico'}</small></span>
          </label>
        )}
        <label class="campo"><span>Nome</span>
          <input aria-label="Nome" required value={m.nome} onInput={(e) => setM({ ...m, nome: e.currentTarget.value })} /></label>
        <div class="due">
          <label class="campo"><span>Nome in inglese</span>
            <input aria-label="Nome in inglese" value={m.nomeEn} onInput={(e) => setM({ ...m, nomeEn: e.currentTarget.value })} /></label>
          <label class="campo"><span>Gruppo</span>
            <input aria-label="Gruppo" placeholder="es. Burger" value={m.gruppo} onInput={(e) => setM({ ...m, gruppo: e.currentTarget.value })} /></label>
        </div>
        {m.tipo === 'vendibile' && (
          <div class="due">
            <label class="campo"><span>Prezzo (€, IVA inclusa)</span>
              <input aria-label="Prezzo di vendita" inputMode="decimal" value={m.prezzo} onInput={(e) => setM({ ...m, prezzo: e.currentTarget.value })} /></label>
            <label class="campo"><span>IVA</span>
              <select aria-label="IVA" value={m.iva} onChange={(e) => setM({ ...m, iva: e.currentTarget.value as typeof m.iva })}>
                {ALIQUOTE.map((a) => <option key={a} value={a}>{a}%</option>)}
              </select></label>
          </div>
        )}
        <label class="conversione">La ricetta fa
          <input aria-label="Resa" inputMode="decimal" value={m.resaQuantita} onInput={(e) => setM({ ...m, resaQuantita: e.currentTarget.value })} />
          <input aria-label="Unità della resa" class="corto" value={m.resaUnita} onInput={(e) => setM({ ...m, resaUnita: e.currentTarget.value })} />
        </label>

        <h2>Ricetta</h2>
        <ul class="ricetta" aria-label="Righe della ricetta">
          {righe.map((r, i) => {
            const costo = costoRiga(r);
            return (
              <li key={i} aria-label={`Riga ${i + 1}`}>
                <select aria-label="Ingrediente o semilavorato" value={r.id ? `${r.tipo}:${r.id}` : ''}
                  onChange={(e) => { const [t, v] = e.currentTarget.value.split(/:(.*)/); aggiorna(i, { tipo: t as Riga['tipo'], id: v ?? '' }); }}>
                  <option value="">Scegli…</option>
                  <optgroup label="Ingredienti">{ordinati(dati.ingredienti.filter((x) => x.categoria === 'alimentare')).map((x) => <option key={x.id} value={`ingrediente:${x.id}`}>{x.nome}</option>)}</optgroup>
                  <optgroup label="Semilavorati">{ordinati(dati.prodotti.filter((x) => x.tipo === 'semilavorato' && x.id !== id)).map((x) => <option key={x.id} value={`prodotto:${x.id}`}>{x.nome}</option>)}</optgroup>
                  <optgroup label="Packaging">{ordinati(dati.ingredienti.filter((x) => x.categoria === 'packaging')).map((x) => <option key={x.id} value={`ingrediente:${x.id}`}>{x.nome}</option>)}</optgroup>
                </select>
                <span class="quantita">
                  <input aria-label="Quantità" inputMode="decimal" value={r.quantita} onInput={(e) => aggiorna(i, { quantita: e.currentTarget.value })} />
                  <small>{unitaRiga(r)}</small>
                </span>
                <span class="costo-riga">{costo ? euro(costo) : r.id ? <small class="incompleto-inline">senza prezzo</small> : ''}</span>
                <button type="button" class="secondario piccolo" aria-label={`Togli la riga ${i + 1}`} onClick={() => setRighe(righe.filter((_, j) => j !== i))}>✕</button>
              </li>
            );
          })}
        </ul>
        <button type="button" class="secondario" onClick={() => setRighe([...righe, { tipo: 'ingrediente', id: '', quantita: '' }])}>+ Aggiungi riga</button>

        <div class="riepilogo" aria-label="Food cost">
          <div><small>Costo ricetta</small><strong>{euro(c.costo)}</strong></div>
          <div><small>Costo per {unitaCosto.per}</small><strong>{euro(unitaCosto.valore)}</strong></div>
          {m.tipo === 'vendibile' && <>
            <div><small>Food cost</small><strong class={oltre ? 'oltre' : ''}>{c.percentuale ? percentuale(c.percentuale) : '—'}</strong></div>
            <div><small>Margine</small><strong>{bozza.prezzo > 0 ? euro(bozza.prezzo - c.costoUnitario.toNumber()) : '—'}</strong></div>
          </>}
        </div>
        {!c.completo && <p class="errore">Food cost incompleto, mancano i prezzi di: {c.mancanti.join(', ')}.</p>}

        {m.tipo === 'vendibile' && (
          <>
            <label class="conversione">Avvisami se il food cost supera
              <input aria-label="Soglia food cost" inputMode="decimal" class="corto" value={m.soglia} onInput={(e) => setM({ ...m, soglia: e.currentTarget.value })} /> %
            </label>
          </>
        )}

        {bozza.ricetta.length > 0 && (
          <div class="nuova" aria-label="Lista ingredienti">
            <h2>Lista ingredienti</h2>
            <TestoLista l={lista} lingua="it" />
            <TestoLista l={lista} lingua="en" />
            {lista.problemi.it.length > 0 && <ul class="avvisi errore">{lista.problemi.it.map((x) => <li key={x}>{x}</li>)}</ul>}
            {lista.problemi.en.length > 0 && <ul class="avvisi">{lista.problemi.en.map((x) => <li key={x}>Inglese: {x}</li>)}</ul>}
          </div>
        )}

        <button type="submit" class="primario">{id ? 'Salva' : 'Crea prodotto'}</button>
        <p role="status" class={esito?.errore ? 'esito errore' : 'esito'}>{esito?.testo ?? ''}</p>
      </form>

      {esistente && esistente.tipo === 'vendibile' && <AndamentoFoodCost db={db} prodotto={esistente} dati={dati} />}

      {id && (
        <details>
          <summary>Elimina prodotto</summary>
          {usi.length > 0
            ? <p class="nota">Non si può eliminare: è usato in {usi.map((p) => p.nome).join(', ')}.</p>
            : <button type="button" class="secondario pericolo" onClick={() => void elimina()}>Elimina «{esistente!.nome}»</button>}
        </details>
      )}
    </section>
  );
}
