/**
 * Pagina «Carico» (passo P3: magazziniere, team e titolare): il piano di carico preparato dal titolare
 * per il prossimo evento. Solo cosa caricare (niente fatturato né prezzi), spunta «caricato» condivisa
 * tra i telefoni, avviso di cosa manca in magazzino, stampa A4.
 */
import { stampaPagina } from './stampaPagina';
import type { Firestore } from 'firebase/firestore';
import { useMemo, useState } from 'preact/hooks';
import { oggi } from '../dati/oggi';
import { daCaricare, NOMI_SEZIONE_CARICO, testoManca } from '../eventi/carico';
import { segnaCaricata, useCarichi } from '../eventi/carico.db';

const data = (g: string) => g.split('-').reverse().slice(0, 2).join('/');

export function Carico({ db }: { db: Firestore }) {
  const c = useCarichi(db);
  // prima i prossimi (dal più vicino), poi i passati (dal più recente)
  const lista = useMemo(() => {
    const o = oggi();
    const prossimi = c.dati.filter((x) => x.al >= o).sort((a, b) => a.dal.localeCompare(b.dal));
    const passati = c.dati.filter((x) => x.al < o).sort((a, b) => b.al.localeCompare(a.al)).slice(0, 5);
    return [...prossimi, ...passati];
  }, [c.dati]);
  const [scelto, setScelto] = useState('');
  const [errore, setErrore] = useState('');
  const carico = lista.find((x) => x.id === scelto) ?? lista[0];

  if (!c.caricato) return <section class="scheda"><p>Carico…</p></section>;
  if (!carico) return <section class="scheda" aria-label="Carico"><h1>Carico</h1><p class="nota">Nessun piano di carico: lo prepara il titolare dalla pagina «Piano eventi».</p></section>;
  const fatte = new Set(carico.caricate);
  const totali = carico.righe.length;
  const caricate = carico.righe.filter((r) => fatte.has(r.chiave)).length;
  const mancano = carico.righe.filter((r) => r.manca);
  async function spunta(chiave: string, si: boolean) {
    try { await segnaCaricata(db, carico!.id, chiave, si); setErrore(''); } catch { setErrore('Spunta non salvata: riprova.'); }
  }
  const sezioni = (['alimentare', 'semilavorato', 'packaging'] as const).map((s) => ({ s, righe: carico.righe.filter((r) => r.sezione === s) })).filter((x) => x.righe.length);
  return (
    <section class="scheda carico-pagina" aria-label="Carico">
      <h1>Carico</h1>
      {lista.length > 1 && (
        <select class="no-stampa" aria-label="Evento del carico" value={carico.id} onChange={(e) => setScelto(e.currentTarget.value)}>
          {lista.map((x) => <option key={x.id} value={x.id}>{x.evento} · {data(x.dal)}{x.al !== x.dal ? `–${data(x.al)}` : ''}</option>)}
        </select>
      )}
      <h2>{carico.evento} · {data(carico.dal)}{carico.al !== carico.dal ? `–${data(carico.al)}` : ''}</h2>
      <p class="nota" aria-label="Avanzamento">Caricate <strong>{caricate}</strong> di {totali}{carico.preparato?.toDate ? ` · piano del ${carico.preparato.toDate().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}` : ''}</p>
      {mancano.length > 0 && <p class="errore" role="note">⚠ In magazzino non basta: {mancano.map((r) => `${r.nome} (${testoManca(r)})`).join(', ')}.</p>}
      {errore && <p class="errore" role="alert">{errore}</p>}
      {sezioni.map(({ s, righe }) => (
        <div key={s}>
          <h3>{NOMI_SEZIONE_CARICO[s]}</h3>
          <ul class="carico-lista" aria-label={NOMI_SEZIONE_CARICO[s]}>
            {righe.map((r) => (
              <li key={r.chiave} class={fatte.has(r.chiave) ? 'fatto' : ''}>
                <label>
                  <input type="checkbox" checked={fatte.has(r.chiave)} onChange={(e) => void spunta(r.chiave, e.currentTarget.checked)} />
                  <span class="nome">{r.nome}</span>
                  <strong class="quanto">{daCaricare(r)}</strong>
                </label>
                {r.manca ? <small class="manca">{testoManca(r)}</small> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <button type="button" class="secondario no-stampa" onClick={() => stampaPagina(`Carico ${carico.evento}`)}>🖨 Stampa</button>
      {/* Foglio di stampa: tabella compatta su due colonne, caselle da spuntare a penna; si vede solo in stampa. */}
      <div class="carico-stampa" aria-hidden="true">
        <div class="carico-stampa-testa">
          <strong>CARICO · {carico.evento}</strong>
          <span>{data(carico.dal)}{carico.al !== carico.dal ? `–${data(carico.al)}` : ''} · {totali} voci · caricato da ____________</span>
        </div>
        {mancano.length > 0 && <p class="carico-stampa-manca">⚠ Non basta in magazzino: {mancano.map((r) => `${r.nome} (${testoManca(r)})`).join(', ')}</p>}
        <div class="carico-stampa-colonne">
          {sezioni.map(({ s, righe }) => (
            <table key={s}>
              <thead><tr><th colSpan={3}>{NOMI_SEZIONE_CARICO[s]}</th></tr></thead>
              <tbody>{righe.map((r) => (
                <tr key={r.chiave}><td class="box">☐</td><td>{r.nome}{r.manca ? ' ⚠' : ''}</td><td class="q">{daCaricare(r)}</td></tr>
              ))}</tbody>
            </table>
          ))}
        </div>
      </div>
    </section>
  );
}
