/**
 * Pagina «Inventario» (magazziniere e titolare): si conta a confezioni (+ / −) e sfuso, voce per voce.
 * La conta resta nel telefono finché non si preme «Fine inventario». Solo ingredienti, packaging e semilavorati.
 */
import type { Firestore } from 'firebase/firestore';
import { useMemo, useState } from 'preact/hooks';
import { oggi } from '../dati/oggi';
import { useRaccolta } from '../dati/useRaccolta.db';
import type { Ingrediente, Prodotto } from '../foodcost/modello';
import {
  cambiaScelta, daContare, ErroreInventario, leggiBozza, NOMI_SEZIONE, numero, preparaInventario, preparaUnita, totale, vociMagazzino, type Bozza, type Conta, type Sezione, type VoceMagazzino,
} from '../magazzino/inventario';
import { registraInventario, salvaSceltaInventario, salvaUnita, useInventari, useSceltaInventario, useUnitaConta } from '../magazzino/inventario.db';
import { quantitaLeggibile } from '../produzione/produzione';

const BOZZA = 'vegman-inventario-bozza';
const leggi = () => { try { return localStorage.getItem(BOZZA); } catch { return null; } };
const scrivi = (b: Bozza | null) => { try { if (b) localStorage.setItem(BOZZA, JSON.stringify(b)); else localStorage.removeItem(BOZZA); } catch { /* solo comodità */ } };

export function Inventario({ db, uid, titolare }: { db: Firestore; uid: string; titolare: boolean }) {
  const ing = useRaccolta<Ingrediente>(db, 'ingredienti');
  const pro = useRaccolta<Prodotto>(db, 'prodotti');
  const unita = useUnitaConta(db);
  const scelta = useSceltaInventario(db);
  const [scegli, setScegli] = useState(false);
  const passati = useInventari(db, 5);
  const [bozza, setBozzaStato] = useState<Bozza>(() => leggiBozza(leggi(), oggi()));
  const setBozza = (b: Bozza) => { scrivi(b); setBozzaStato(b); };
  const [sezione, setSezione] = useState<Sezione>('alimentare');
  const [cerca, setCerca] = useState('');
  const [nota, setNota] = useState('');
  const [esito, setEsito] = useState<{ testo: string; errore: boolean } | null>(null);
  const [invio, setInvio] = useState(false);

  const tutte = useMemo(() => vociMagazzino(ing.dati, pro.dati, unita), [ing.dati, pro.dati, unita]);
  // Il magazziniere conta solo le voci scelte dal titolare; il titolare, scegliendo, le vede tutte.
  const voci = useMemo(() => (scegli ? tutte : daContare(tutte, scelta ?? null)), [tutte, scelta, scegli]);
  const scelte = new Set(daContare(tutte, scelta ?? null).map((v) => v.chiave));
  const visibili = voci.filter((v) => (cerca.trim() ? v.nome.toLowerCase().includes(cerca.trim().toLowerCase()) : v.sezione === sezione));
  const contate = voci.filter((v) => bozza.conte[v.chiave]).length;

  async function spunta(chiavi: string[], si: boolean) {
    try { await salvaSceltaInventario(db, cambiaScelta(tutte, scelta ?? null, chiavi, si)); } catch {
      setEsito({ testo: 'Scelta non salvata: riprova.', errore: true });
    }
  }

  function conta(v: VoceMagazzino, c: Conta | null) {
    const conte = { ...bozza.conte };
    if (c) conte[v.chiave] = c; else delete conte[v.chiave];
    setBozza({ ...bozza, conte });
  }

  async function fine() {
    if (invio) return;
    try {
      const inv = preparaInventario(voci, bozza.conte, oggi(), nota);
      if (!confirm(`Registrare l'inventario con ${inv.righe.length} voci contate? Le voci non contate restano come prima.`)) return;
      setInvio(true);
      await registraInventario(db, uid, inv);
      setBozza({ giorno: oggi(), conte: {} });
      scrivi(null);
      setNota('');
      setEsito({ testo: `✅ Inventario registrato: ${inv.righe.length} voci.`, errore: false });
    } catch (e) {
      setEsito({ testo: e instanceof ErroreInventario ? e.message : 'Inventario non registrato: riprova.', errore: true });
    }
    setInvio(false);
  }

  if (!ing.caricato || !pro.caricato || scelta === undefined) return <section class="scheda"><p>Carico…</p></section>;
  return (
    <section class="scheda" aria-label="Inventario">
      <h1>Inventario</h1>
      {titolare && (
        <div class="comandi">
          <p class="nota">{scelta ? `Il magazziniere conta ${scelte.size} voci su ${tutte.length}.` : 'Il magazziniere vede tutte le voci.'}</p>
          <button type="button" class={scegli ? 'primario piccolo' : 'secondario piccolo'} aria-pressed={scegli} onClick={() => setScegli(!scegli)}>{scegli ? 'Fatto' : 'Scegli cosa contare'}</button>
        </div>
      )}
      {scegli
        ? <p class="nota">Spunta le voci da contare: le altre il magazziniere non le vede. Gli ingredienti nuovi restano fuori finché non li spunti.</p>
        : <p class="nota">Contate <strong>{contate}</strong> voci su {voci.length}. La conta resta nel telefono finché non premi «Fine inventario».</p>}
      {esito && <p class={esito.errore ? 'esito errore' : 'esito'} role={esito.errore ? 'alert' : 'status'}>{esito.testo}</p>}
      <input aria-label="Cerca nel magazzino" placeholder="🔍 Cerca" value={cerca} onInput={(e) => setCerca(e.currentTarget.value)} />
      {!cerca.trim() && (
        <div class="schede" role="tablist">
          {(['alimentare', 'packaging', 'semilavorato'] as Sezione[]).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={sezione === s} onClick={() => setSezione(s)}>{NOMI_SEZIONE[s]}</button>
          ))}
        </div>
      )}
      {scegli ? (<>
        <div class="comandi">
          <button type="button" class="secondario piccolo" onClick={() => void spunta(visibili.map((v) => v.chiave), true)}>Tutte</button>
          <button type="button" class="secondario piccolo" onClick={() => void spunta(visibili.map((v) => v.chiave), false)}>Nessuna</button>
        </div>
        <ul class="inventario" aria-label="Scelta delle voci">
          {visibili.map((v) => (
            <li key={v.chiave}><label class="spunta"><input type="checkbox" checked={scelte.has(v.chiave)} onChange={(e) => void spunta([v.chiave], e.currentTarget.checked)} /> {v.nome}</label></li>
          ))}
        </ul>
      </>) : (
        <ul class="inventario" aria-label="Voci da contare">
          {visibili.map((v) => <RigaVoce key={v.chiave} db={db} v={v} c={bozza.conte[v.chiave] ?? null} onConta={(c) => conta(v, c)} />)}
        </ul>
      )}
      {!visibili.length && <p class="nota">{scelta && !scegli ? 'Niente da contare qui: il titolare non ha scelto voci di questa sezione.' : 'Niente da contare qui.'}</p>}
      {!scegli && <div class="inventario-fine">
        <input aria-label="Nota dell'inventario" placeholder="Nota (facoltativa, es. dopo la fiera)" maxLength={300} value={nota} onInput={(e) => setNota(e.currentTarget.value)} />
        <button type="button" class="primario" disabled={invio || !contate} onClick={() => void fine()}>Fine inventario ({contate})</button>
      </div>}
      {passati.dati.length > 0 && (<>
        <h2>Inventari registrati</h2>
        <ul class="persone" aria-label="Inventari registrati">
          {passati.dati.map((x) => <li key={x.id}><div class="nome"><strong>{x.giorno.split('-').reverse().join('/')}</strong> <small>{x.righe.length} voci{x.nota ? ` · ${x.nota}` : ''}</small></div></li>)}
        </ul>
      </>)}
    </section>
  );
}

function RigaVoce({ db, v, c, onConta }: { db: Firestore; v: VoceMagazzino; c: Conta | null; onConta: (c: Conta | null) => void }) {
  const [modifica, setModifica] = useState(false);
  const [conf, setConf] = useState({ nome: v.conta?.nome ?? '', quantita: v.conta ? String(v.conta.quantita) : '' });
  const [errore, setErrore] = useState('');
  const attuale = c ?? { confezioni: 0, sfuso: 0 };
  const cambia = (x: Partial<Conta>) => onConta({ ...attuale, ...x });

  async function salva() {
    try { await salvaUnita(db, v.chiave, preparaUnita(conf.nome, conf.quantita)); setModifica(false); setErrore(''); } catch (e) {
      setErrore(e instanceof ErroreInventario ? e.message : 'Non salvata: riprova.');
    }
  }
  return (
    <li class={c ? 'contata' : ''} aria-label={v.nome}>
      <div class="nome">
        <strong>{c ? '✓ ' : ''}{v.nome}</strong>
        <small>{v.conta ? `${v.conta.nome} da ${quantitaLeggibile(v.conta.quantita, v.unita)}` : 'nessuna confezione'} · <button type="button" class="collegamento" onClick={() => setModifica(!modifica)}>{v.conta ? 'cambia' : 'imposta'}</button></small>
      </div>
      {modifica && (
        <div class="due">
          <input aria-label={`Nome confezione di ${v.nome}`} placeholder="sacco, busta…" value={conf.nome} maxLength={30} onInput={(e) => setConf({ ...conf, nome: e.currentTarget.value })} />
          <input aria-label={`Quantità confezione di ${v.nome}`} inputMode="decimal" placeholder={`quanto (${v.unita})`} value={conf.quantita} onInput={(e) => setConf({ ...conf, quantita: e.currentTarget.value })} />
          <button type="button" class="secondario piccolo" onClick={() => void salva()}>Salva</button>
        </div>
      )}
      {errore && <small class="errore" role="alert">{errore}</small>}
      <div class="inventario-conta">
        {v.conta && (
          <div class="piu-meno" role="group" aria-label={`Confezioni di ${v.nome}`}>
            <button type="button" aria-label="Una in meno" onClick={() => cambia({ confezioni: Math.max(0, attuale.confezioni - 1) })}>−</button>
            <strong>{attuale.confezioni}</strong>
            <button type="button" aria-label="Una in più" onClick={() => cambia({ confezioni: attuale.confezioni + 1 })}>+</button>
          </div>
        )}
        <label class="sfuso"><span>{v.conta ? '+ sfuso' : 'quantità'}</span>
          <input aria-label={`Sfuso di ${v.nome}`} inputMode="decimal" placeholder="0" value={c?.sfuso ? String(c.sfuso).replace('.', ',') : ''}
            onInput={(e) => { try { cambia({ sfuso: numero(e.currentTarget.value, 'Sfuso') }); } catch { /* si corregge scrivendo */ } }} />
          <small>{v.unita}</small>
        </label>
        <small class="totale">{c ? `= ${quantitaLeggibile(totale(attuale, v.conta), v.unita)}` : ''}</small>
        {c && <button type="button" class="collegamento" aria-label={`Togli la conta di ${v.nome}`} onClick={() => onConta(null)}>✕</button>}
      </div>
    </li>
  );
}
