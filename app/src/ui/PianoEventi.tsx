/**
 * Pagina «Piano eventi» (titolare, passo P2): per ogni evento fatturato previsto, scorta di sicurezza e,
 * per ogni prodotto, % del fatturato o pezzi fissi; dal vivo i pezzi e il piano di carico con lo stock.
 * «Salva e prepara il piano di carico» lo rende visibile a chi carica il furgone (pagina «Carico»).
 */
import type { Firestore } from 'firebase/firestore';
import { useMemo, useState } from 'preact/hooks';
import type { ScontrinoArchivio } from '../cassa/archivio';
import { oggi } from '../dati/oggi';
import { useRaccolta } from '../dati/useRaccolta.db';
import {
  daCaricare, ErrorePrevisione, NOMI_SEZIONE_CARICO, numeroPrevisione, percentualiReali, pezziPrevisti, pianoDiCarico,
  previsioneDiBase, SCORTA_BASE, sommaPercentuali, testoManca, type Modo, type Previsione,
} from '../eventi/carico';
import { salvaBasePrevisione, salvaCalendario, salvaCarico, salvaPrevisione, useBasePrevisione, useCalendario, usePrevisione, type BasePrevisione, type PrevisioneEvento } from '../eventi/carico.db';
import { eventiDalCalendario, eventiNuovi, indirizzoValido, leggiCsv, type EventoCalendario } from '../eventi/calendario';
import { scaricaCalendario } from './calendarioRete';
import { descriviEvento, ErroreEvento, eventiPerCassa, preparaEvento, type Evento } from '../eventi/eventi';
import { creaEvento } from '../eventi/eventi.db';
import type { Prodotto } from '../foodcost/modello';
import { euro } from './formato';
import { useStockMagazzino } from './stockMagazzino';

const testo = (n: number) => (n ? String(n).replace('.', ',') : '');

export function PianoEventi({ db }: { db: Firestore }) {
  const ev = useRaccolta<Evento>(db, 'eventi');
  const lista = useMemo(() => eventiPerCassa(ev.dati, oggi()), [ev.dati]);
  const [scelto, setScelto] = useState('');
  const id = scelto && lista.some((e) => e.id === scelto) ? scelto : lista[0]?.id ?? '';
  const evento = lista.find((e) => e.id === id);
  const base = useBasePrevisione(db);
  const prev = usePrevisione(db, id);

  if (!ev.caricato) return <section class="scheda"><p>Carico…</p></section>;
  return (
    <section class="scheda" aria-label="Piano eventi">
      <h1>Piano eventi</h1>
      {lista.length ? (
        <label class="campo"><span>Evento</span>
          <select aria-label="Evento da pianificare" value={id} onChange={(e) => setScelto(e.currentTarget.value)}>
            {lista.map((x) => <option key={x.id} value={x.id}>{descriviEvento(x)}</option>)}
          </select>
        </label>
      ) : <p class="nota">Nessun evento aperto: creane uno qui sotto.</p>}
      <NuovoEvento db={db} onCreato={setScelto} aperto={!lista.length} />
      <Calendario db={db} esistenti={ev.dati} scorta={base?.scorta ?? SCORTA_BASE} />
      {evento && base !== undefined && prev !== undefined && <Previsione key={id} db={db} evento={evento} base={base} salvata={prev} />}
    </section>
  );
}

function NuovoEvento({ db, onCreato, aperto }: { db: Firestore; onCreato: (id: string) => void; aperto: boolean }) {
  const [m, setM] = useState({ nome: '', dal: oggi(), al: '', luogo: '', paese: 'IT' });
  const [errore, setErrore] = useState('');
  async function crea(e: Event) {
    e.preventDefault();
    try { onCreato(await creaEvento(db, preparaEvento(m))); setM({ nome: '', dal: oggi(), al: '', luogo: '', paese: 'IT' }); setErrore(''); } catch (err) {
      setErrore(err instanceof ErroreEvento ? err.message : 'Evento non salvato: riprova.');
    }
  }
  return (
    <details open={aperto}>
      <summary>＋ Nuovo evento</summary>
      <form class="nuova" onSubmit={(e) => void crea(e)}>
        <input aria-label="Nome del nuovo evento" placeholder="Nome (es. Sagra di Osimo)" value={m.nome} onInput={(e) => setM({ ...m, nome: e.currentTarget.value })} />
        <div class="due">
          <label class="campo"><span>Dal</span><input type="date" value={m.dal} onInput={(e) => setM({ ...m, dal: e.currentTarget.value })} /></label>
          <label class="campo"><span>Al</span><input type="date" value={m.al} min={m.dal} onInput={(e) => setM({ ...m, al: e.currentTarget.value })} /></label>
        </div>
        <div class="due">
          <input aria-label="Luogo del nuovo evento" placeholder="Luogo" value={m.luogo} onInput={(e) => setM({ ...m, luogo: e.currentTarget.value })} />
          <input aria-label="Paese del nuovo evento" placeholder="Paese (IT)" maxLength={2} value={m.paese} onInput={(e) => setM({ ...m, paese: e.currentTarget.value })} />
        </div>
        <button type="submit" class="secondario">Crea evento</button>
        {errore && <p class="errore" role="alert">{errore}</p>}
      </form>
    </details>
  );
}

type Riga = { modo: Modo; testo: string };

function Previsione({ db, evento, base, salvata }: { db: Firestore; evento: Evento; base: BasePrevisione | null; salvata: PrevisioneEvento | null }) {
  const pro = useRaccolta<Prodotto>(db, 'prodotti');
  const sc = useRaccolta<ScontrinoArchivio & { id: string }>(db, 'scontrini');
  const magazzino = useStockMagazzino(db);
  const vendibili = useMemo(() => pro.dati.filter((p) => p.tipo === 'vendibile').sort((a, b) => b.quotaVendite - a.quotaVendite || a.nome.localeCompare(b.nome, 'it')), [pro.dati]);
  const [fatturato, setFatturato] = useState(testo(salvata?.fatturato ?? 0));
  const [scorta, setScorta] = useState(String(salvata?.scorta ?? base?.scorta ?? SCORTA_BASE));
  const [righe, setRighe] = useState<Record<string, Riga> | null>(null);
  const [esito, setEsito] = useState<{ testo: string; errore: boolean } | null>(null);
  const [occupato, setOccupato] = useState(false);

  // Prima volta: dai valori dell'evento, se salvati, altrimenti da quelli di base.
  const iniziali = useMemo(() => {
    const b = previsioneDiBase(pro.dati, base?.voci);
    const p = salvata ? { ...b, ...salvata.voci } : b;
    return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { modo: v.modo, testo: testo(v.valore) }]));
  }, [pro.dati, base, salvata]);
  const r = righe ?? iniziali;

  // con scontrini veri si usano solo quelli, come nel resoconto
  const reali = useMemo(() => {
    const veri = sc.dati.some((s) => s.ambiente === 'agenzia');
    return { perc: percentualiReali(sc.dati.filter((s) => s.ambiente === (veri ? 'agenzia' : 'simulatore'))), prova: !veri };
  }, [sc.dati]);

  const numeri = (() => {
    try {
      const voci: Record<string, { modo: Modo; valore: number }> = {};
      for (const p of vendibili) {
        const x = r[p.id] ?? { modo: '%', testo: '' };
        voci[p.id] = { modo: x.modo, valore: numeroPrevisione(x.testo, `${p.nome}`, x.modo === '%' ? 100 : 100_000) };
      }
      return { voci: voci as Previsione, fatturato: numeroPrevisione(fatturato, 'Fatturato previsto'), scorta: numeroPrevisione(scorta, 'Scorta', 100), errore: '' };
    } catch (e) {
      return { voci: {} as Previsione, fatturato: 0, scorta: 0, errore: e instanceof ErrorePrevisione ? e.message : 'Numeri non validi.' };
    }
  })();
  const pezzi = useMemo(() => pezziPrevisti(pro.dati, numeri.voci, numeri.fatturato, numeri.scorta), [pro.dati, JSON.stringify(numeri)]);
  const piano = useMemo(() => {
    if (!magazzino) return null;
    const stock = new Map(magazzino.stock.map((s) => [s.chiave, s.teorico] as const));
    return pianoDiCarico(pezzi, pro.dati, magazzino.voci, stock);
  }, [pezzi, pro.dati, magazzino]);

  if (!pro.caricato) return <p class="nota">Carico…</p>;
  const somma = sommaPercentuali(numeri.voci);
  const cambia = (id: string, x: Partial<Riga>) => setRighe({ ...r, [id]: { ...(r[id] ?? { modo: '%', testo: '' }), ...x } });
  const usaReali = () => {
    if (!reali.perc) return;
    const n: Record<string, Riga> = { ...r };
    for (const p of vendibili) if ((n[p.id]?.modo ?? '%') === '%') n[p.id] = { modo: '%', testo: testo(reali.perc[p.id] ?? 0) };
    setRighe(n);
    setEsito({ testo: 'Messe le % reali delle vendite in cassa: controlla e salva.', errore: false });
  };

  async function salvaBase() {
    if (numeri.errore) { setEsito({ testo: numeri.errore, errore: true }); return; }
    await salvaBasePrevisione(db, { voci: numeri.voci, scorta: numeri.scorta });
    setEsito({ testo: '✅ Salvati come valori di base per i prossimi eventi.', errore: false });
  }
  async function prepara() {
    if (numeri.errore) { setEsito({ testo: numeri.errore, errore: true }); return; }
    if (!piano) return;
    setOccupato(true);
    try {
      await salvaPrevisione(db, evento.id, { fatturato: numeri.fatturato, scorta: numeri.scorta, voci: numeri.voci });
      await salvaCarico(db, evento, piano);
      setEsito({ testo: `✅ Piano di carico pronto (${piano.length} voci): chi carica il furgone lo trova in «Carico».`, errore: false });
    } catch {
      setEsito({ testo: 'Piano non salvato: riprova.', errore: true });
    }
    setOccupato(false);
  }

  const sezioni = (['alimentare', 'semilavorato', 'packaging'] as const).map((s) => ({ s, righe: (piano ?? []).filter((x) => x.sezione === s) })).filter((x) => x.righe.length);
  return (
    <div class="nuova" aria-label="Previsione">
      <div class="due">
        <label class="campo"><span>Fatturato previsto (€)</span><input aria-label="Fatturato previsto" inputMode="decimal" placeholder="es. 3000" value={fatturato} onInput={(e) => setFatturato(e.currentTarget.value)} /></label>
        <label class="campo"><span>Scorta in più (%)</span><input aria-label="Scorta in più" inputMode="decimal" value={scorta} onInput={(e) => setScorta(e.currentTarget.value)} /></label>
      </div>

      <h2>Prodotti</h2>
      <p class="nota">Per ogni prodotto la % del fatturato oppure, per chi non segue il fatturato (es. tempeh), i pezzi fissi da portare. Somma delle %: <strong class={Math.abs(somma - 100) > 0.5 ? 'oltre' : ''}>{String(somma).replace('.', ',')}%</strong>{Math.abs(somma - 100) > 0.5 ? ' (dovrebbe fare 100)' : ''}.</p>
      <ul class="persone previsione" aria-label="Prodotti della previsione">
        {vendibili.map((p) => {
          const x = r[p.id] ?? { modo: '%' as Modo, testo: '' };
          return (
            <li key={p.id}>
              <div class="nome"><strong>{p.nome}</strong> <small>{euro(p.prezzo)}{reali.perc ? ` · reale ${String(reali.perc[p.id] ?? 0).replace('.', ',')}%` : ''}</small></div>
              <div class="valore">
                <input aria-label={`Previsione di ${p.nome}`} inputMode="decimal" placeholder="0" value={x.testo} onInput={(e) => cambia(p.id, { testo: e.currentTarget.value })} />
                <select aria-label={`Modo di ${p.nome}`} value={x.modo} onChange={(e) => cambia(p.id, { modo: e.currentTarget.value as Modo })}>
                  <option value="%">% fatturato</option>
                  <option value="pz">pezzi fissi</option>
                </select>
              </div>
            </li>
          );
        })}
      </ul>
      <div class="comandi">
        {reali.perc && <button type="button" class="secondario piccolo" onClick={usaReali}>Usa le % reali{reali.prova ? ' (prova)' : ''}</button>}
        <button type="button" class="secondario piccolo" onClick={() => { setRighe(null); setEsito(null); }}>Ripristina</button>
        <button type="button" class="secondario piccolo" onClick={() => void salvaBase()}>Salva come valori di base</button>
      </div>
      {numeri.errore && <p class="errore" role="alert">{numeri.errore}</p>}

      <h2>Pezzi previsti</h2>
      {pezzi.length ? (
        <div class="scorre"><table class="tabella" aria-label="Pezzi previsti">
          <thead><tr><th>Prodotto</th><th>Pezzi</th><th>Incasso</th></tr></thead>
          <tbody>{pezzi.map((x) => <tr key={x.id}><th scope="row">{x.nome}</th><td>{x.pezzi}{x.modo === 'pz' ? ' (fissi)' : ''}</td><td>{euro(x.incasso)}</td></tr>)}</tbody>
        </table></div>
      ) : <p class="nota">Scrivi il fatturato previsto e le % dei prodotti.</p>}

      <h2>Piano di carico</h2>
      {!piano ? <p class="nota">Calcolo lo stock…</p> : !piano.length ? <p class="nota">Niente da caricare: controlla le ricette dei prodotti.</p> : sezioni.map(({ s, righe: rr }) => (
        <div key={s}>
          <h3>{NOMI_SEZIONE_CARICO[s]}</h3>
          <ul class="elenco carico" aria-label={`Anteprima ${NOMI_SEZIONE_CARICO[s]}`}>
            {rr.map((x) => <li key={x.chiave}><span class="nome">{x.nome}</span><span>{daCaricare(x)}{testoManca(x) && <small class={x.manca ? 'manca' : 'tenue'}> · {testoManca(x)}</small>}</span></li>)}
          </ul>
        </div>
      ))}
      {esito && <p class={esito.errore ? 'esito errore' : 'esito'} role={esito.errore ? 'alert' : 'status'}>{esito.testo}</p>}
      <button type="button" class="primario" disabled={occupato || !piano?.length} onClick={() => void prepara()}>Salva e prepara il piano di carico</button>
    </div>
  );
}

/** Calendario Google (P5): la scheda «App» di «CALENDARIO 2027» pubblicata come CSV; aggiunge solo gli eventi nuovi. */
function Calendario({ db, esistenti, scorta }: { db: Firestore; esistenti: readonly Evento[]; scorta: number }) {
  const cal = useCalendario(db);
  const [url, setUrl] = useState('');
  const [modifica, setModifica] = useState(false);
  const [letti, setLetti] = useState<{ nuovi: EventoCalendario[]; gia: number; scartate: string[] } | null>(null);
  const [esito, setEsito] = useState<{ testo: string; errore: boolean } | null>(null);
  const [occupato, setOccupato] = useState(false);
  const [aperto, setAperto] = useState<boolean | null>(null);
  if (cal === undefined) return null;
  const salvato = cal?.url ?? '';
  // aperto la prima volta se il calendario non è ancora collegato; poi decide chi lo usa

  async function salva() {
    if (!indirizzoValido(url)) { setEsito({ testo: 'Serve l\'indirizzo della scheda pubblicata come CSV (File › Condividi › Pubblica sul web › scheda «App» › CSV).', errore: true }); return; }
    await salvaCalendario(db, url);
    setModifica(false); setUrl('');
    setEsito({ testo: '✅ Calendario collegato.', errore: false });
  }
  async function leggi() {
    setOccupato(true); setEsito(null);
    try {
      const { eventi, scartate } = eventiDalCalendario(leggiCsv(await scaricaCalendario(salvato)));
      const nuovi = eventiNuovi(eventi, esistenti);
      setLetti({ nuovi, gia: eventi.length - nuovi.length, scartate });
    } catch (e) {
      setEsito({ testo: `Calendario non letto (${(e as Error)?.message || 'errore di rete'}): controlla la rete e che la scheda sia pubblicata.`, errore: true });
    }
    setOccupato(false);
  }
  async function aggiungi() {
    if (!letti) return;
    setOccupato(true);
    let fatti = 0;
    try {
      for (const e of letti.nuovi) {
        const id = await creaEvento(db, { nome: e.nome, dal: e.dal, al: e.al, ...(e.luogo ? { luogo: e.luogo } : {}), paese: e.paese, stato: 'aperto' });
        if (e.fatturato > 0) await salvaPrevisione(db, id, { fatturato: e.fatturato, scorta, voci: {} });
        fatti++;
      }
      setEsito({ testo: `✅ Aggiunti ${fatti} eventi dal calendario.`, errore: false });
      setLetti(null);
    } catch {
      setEsito({ testo: `Aggiunti ${fatti} eventi, poi un errore: premi di nuovo «Leggi il calendario» (i già aggiunti non si ripetono).`, errore: true });
    }
    setOccupato(false);
  }
  const data = (g: string) => g.split('-').reverse().join('/');
  return (
    <details open={aperto ?? !salvato} onToggle={(e) => setAperto((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>📅 Calendario Google</summary>
      <div class="nuova">
        {salvato && !modifica ? (
          <div class="comandi">
            <button type="button" class="primario" disabled={occupato} onClick={() => void leggi()}>{occupato ? 'Leggo…' : 'Leggi il calendario'}</button>
            <button type="button" class="secondario piccolo" onClick={() => setModifica(true)}>Cambia indirizzo</button>
          </div>
        ) : (<>
          <p class="nota">Incolla l'indirizzo della scheda «App» pubblicata come CSV: in Google Fogli File › Condividi › Pubblica sul web, scegli la scheda «App» e «Valori separati da virgola (.csv)».</p>
          <input aria-label="Indirizzo del calendario" placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?…output=csv" value={url} onInput={(e) => setUrl(e.currentTarget.value)} />
          <button type="button" class="secondario" onClick={() => void salva()}>Collega il calendario</button>
        </>)}
        {letti && (<>
          <p class="nota" aria-label="Lettura del calendario">{letti.nuovi.length ? `${letti.nuovi.length} eventi nuovi` : 'Nessun evento nuovo'}{letti.gia ? ` · ${letti.gia} già nell'app` : ''}{letti.scartate.length ? ` · ${letti.scartate.length} righe saltate` : ''}.</p>
          {letti.nuovi.length > 0 && (
            <ul class="persone" aria-label="Eventi nuovi dal calendario">
              {letti.nuovi.map((e) => <li key={`${e.nome}-${e.dal}`}><div class="nome"><strong>{e.nome}</strong> <small>{data(e.dal)}{e.al !== e.dal ? `–${data(e.al)}` : ''}{e.luogo ? ` · ${e.luogo}` : ''}{e.paese !== 'IT' ? ` · ${e.paese}` : ''}{e.fatturato ? ` · ${euro(e.fatturato)} previsti` : ''}</small></div></li>)}
            </ul>
          )}
          {letti.scartate.length > 0 && <p class="nota">Saltate: {letti.scartate.join('; ')}.</p>}
          {letti.nuovi.length > 0 && <button type="button" class="primario" disabled={occupato} onClick={() => void aggiungi()}>Aggiungi {letti.nuovi.length} eventi</button>}
        </>)}
        {esito && <p class={esito.errore ? 'esito errore' : 'esito'} role={esito.errore ? 'alert' : 'status'}>{esito.testo}</p>}
      </div>
    </details>
  );
}
