/** Pagina «Fatture» (solo titolare): caricamento, righe nuove da controllare, acquisti a mano, elenco. */
import { Capacitor } from '@capacitor/core';
import type { Firestore } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useRaccolta } from '../dati/useRaccolta.db';
import { leggiFatturaPA, type Fattura } from '../fatture/fatturapa';
import { elencoRicevute, giaPresente, scaricaFattura } from '../fiscal/cassetto';
import { AccessoRifiutato, Interrotta, PortaleCambiato, type Traccia } from '../fiscal/portale';
import { AccessoNonPossibile, apriSessione, nuovaTraccia } from './portaleTelefono';
import { leggiFileFatture } from '../fatture/file';
import { ErroreAcquisto, preparaAcquistoManuale } from '../fatture/manuale';
import { pianoFatture, type DocFattura, type PianoFatture } from '../fatture/piano';
import { salvaAcquistoManuale, salvaFatture } from '../fatture/salva.db';
import type { Acquisto, Articolo, CategoriaArticolo, Ingrediente } from '../foodcost/modello';
import { suggerimenti } from '../foodcost/somiglianza';
import { fattoreSuggerito } from '../foodcost/unita';
import { ErroreIngrediente, preparaFattore } from '../ingredienti/operazioni';
import { collegaArticolo } from '../ingredienti/operazioni.db';
import { euro } from './formato';
import { dataItaliana, oggi } from './Ingredienti';

type Esito = { testo: string; errore: boolean } | null;
const errore = (e: unknown) => e instanceof ErroreAcquisto || e instanceof ErroreIngrediente ? e.message
  : (e as { code?: string }).code === 'permission-denied' ? 'Operazione non permessa.' : 'Salvataggio non riuscito: riprova.';

const NOMI: Record<CategoriaArticolo, string> = { alimentare: 'Alimentare', packaging: 'Packaging', non_alimentare: 'Non alimentare' };

function DaControllare({ db, a, ingredienti, acquisti }: { db: Firestore; a: Articolo; ingredienti: Ingrediente[]; acquisti: Acquisto[] }) {
  const [categoria, setCategoria] = useState<CategoriaArticolo | ''>('');
  const [ingrediente, setIngrediente] = useState('');
  const [fattore, setFattore] = useState('1');
  const [esito, setEsito] = useState<Esito>(null);
  const ultima = acquisti.filter((x) => x.articolo === a.id).sort((x, y) => y.data.localeCompare(x.data))[0];
  const adatti = ingredienti.filter((i) => i.categoria === categoria);
  const consigliati = suggerimenti(a.nome, adatti, 3);
  const altri = adatti.filter((i) => !consigliati.includes(i)).sort((x, y) => x.nome.localeCompare(y.nome, 'it'));

  function scegliCategoria(c: CategoriaArticolo) {
    setCategoria(c);
    const primo = suggerimenti(a.nome, ingredienti.filter((i) => i.categoria === c), 1)[0];
    setIngrediente(primo?.id ?? '');
    setFattore(primo ? String(fattoreSuggerito(a, primo.unita)) : '1');
  }
  function scegliIngrediente(id: string) {
    setIngrediente(id);
    const i = ingredienti.find((x) => x.id === id);
    if (i) setFattore(String(fattoreSuggerito(a, i.unita)));
  }
  async function conferma() {
    try {
      if (categoria === 'non_alimentare') await collegaArticolo(db, a, null, a.fattore, 'non_alimentare');
      else if (categoria) await collegaArticolo(db, a, ingrediente || null, preparaFattore(fattore), categoria);
    } catch (e) { setEsito({ testo: errore(e), errore: true }); }
  }
  const unita = ingredienti.find((i) => i.id === ingrediente)?.unita ?? '';

  return (
    <li aria-label={`Da controllare: ${a.nome}`}>
      <div class="nome"><strong>{a.nome}</strong>{a.fornitore && <small> · {a.fornitore}</small>}</div>
      {ultima && <small class="dettaglio">ultima riga {dataItaliana(ultima.data)}: {ultima.quantita} {ultima.unita} a {euro(ultima.prezzoUnitario)}</small>}
      <div class="scelte" role="group" aria-label="Categoria">
        {(Object.keys(NOMI) as CategoriaArticolo[]).map((c) => (
          <button key={c} type="button" class={categoria === c ? 'scelta attiva' : 'scelta'} aria-pressed={categoria === c} onClick={() => scegliCategoria(c)}>{NOMI[c]}</button>
        ))}
      </div>
      {(categoria === 'alimentare' || categoria === 'packaging') && (
        <div class="nuova">
          <select aria-label="Ingrediente" value={ingrediente} onChange={(e) => scegliIngrediente(e.currentTarget.value)}>
            <option value="">Nessun ingrediente (solo categoria)</option>
            {consigliati.length > 0 && <optgroup label="Suggeriti">{consigliati.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}</optgroup>}
            <optgroup label="Tutti">{altri.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}</optgroup>
          </select>
          {ingrediente && (
            <label class="conversione">1 {a.unita || 'unità'} =
              <input aria-label="Conversione" inputMode="decimal" value={fattore} onInput={(e) => setFattore(e.currentTarget.value)} />{unita}
            </label>
          )}
          <a class="nota" href="#/ingredienti/nuovo">Manca l'ingrediente? Crealo</a>
        </div>
      )}
      {categoria && <button type="button" class="primario piccolo" onClick={() => void conferma()}>Conferma</button>}
      {esito && <p class="errore">{esito.testo}</p>}
    </li>
  );
}

function AcquistoManuale({ db, ingredienti }: { db: Firestore; ingredienti: Ingrediente[] }) {
  const vuoto = { ingrediente: '', fornitore: '', data: oggi(), quantita: '', totale: '' };
  const [m, setM] = useState(vuoto);
  const [esito, setEsito] = useState<Esito>(null);
  const ing = ingredienti.find((i) => i.id === m.ingrediente);
  async function registra(ev: Event) {
    ev.preventDefault();
    try {
      if (!ing) throw new ErroreAcquisto('Scegli l\'ingrediente.');
      const r = preparaAcquistoManuale(m, ing, oggi());
      await salvaAcquistoManuale(db, r.articolo, r.acquisto);
      setEsito({ testo: `Registrato: ${ing.nome} da ${r.articolo.fornitore}.`, errore: false });
      setM(vuoto);
    } catch (e) { setEsito({ testo: errore(e), errore: true }); }
  }
  return (
    <form class="nuova" onSubmit={registra} aria-label="Acquisto senza fattura">
      <select aria-label="Ingrediente comprato" value={m.ingrediente} onChange={(e) => setM({ ...m, ingrediente: e.currentTarget.value })}>
        <option value="">Ingrediente…</option>
        {[...ingredienti].sort((a, b) => a.nome.localeCompare(b.nome, 'it')).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
      </select>
      <input aria-label="Da chi" placeholder="Da chi (es. Contadino Rossi)" value={m.fornitore} onInput={(e) => setM({ ...m, fornitore: e.currentTarget.value })} />
      <div class="due">
        <input aria-label="Data dell'acquisto" type="date" value={m.data} max={oggi()} onInput={(e) => setM({ ...m, data: e.currentTarget.value })} />
        <input aria-label="Quantità" inputMode="decimal" placeholder={`Quantità (${ing?.unita ?? 'unità'})`} value={m.quantita} onInput={(e) => setM({ ...m, quantita: e.currentTarget.value })} />
      </div>
      <input aria-label="Totale pagato" inputMode="decimal" placeholder="Totale pagato (€)" value={m.totale} onInput={(e) => setM({ ...m, totale: e.currentTarget.value })} />
      <button type="submit" class="primario">Registra acquisto</button>
      <p role="status" class={esito?.errore ? 'esito errore' : 'esito'}>{esito?.testo ?? ''}</p>
    </form>
  );
}

const MASSIMO_PER_VOLTA = 150;

/** Scarica dal cassetto fiscale (solo app Android): accesso, elenco, solo le fatture nuove. */
function DalCassetto({ esistenti, disabilitato, onScaricate }: {
  esistenti: readonly DocFattura[]; disabilitato: boolean;
  onScaricate: (file: { nome: string; byte: Uint8Array }[], scartati: { nome: string; motivo: string }[]) => void;
}) {
  const ultima = esistenti.reduce((m, f) => (f.data > m ? f.data : m), '');
  const giorni = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
  const [dal, setDal] = useState(ultima ? giorni(ultima, -10) : giorni(oggi(), -90));
  const [al, setAl] = useState(oggi());
  const [avanzamento, setAvanzamento] = useState('');
  const [errore, setErrore] = useState('');
  const [resoconto, setResoconto] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [ultimi, setUltimi] = useState<string[]>([]);
  const [secondi, setSecondi] = useState(0);
  const [attesa, setAttesa] = useState<{ passo: string; da: number } | null>(null);
  const attesaRef = useRef<{ passo: string; da: number } | null>(null);
  const ferma = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!inCorso) return undefined;
    const inizio = Date.now();
    const id = setInterval(() => setSecondi(Math.round((Date.now() - inizio) / 1000)), 1000);
    return () => clearInterval(id);
  }, [inCorso]);

  function inAttesa(x: { passo: string; da: number } | null) { attesaRef.current = x; setAttesa(x); }

  async function scarica() {
    if (dal > al) { setErrore('La data iniziale è dopo quella finale.'); return; }
    setInCorso(true);
    setErrore('');
    setResoconto('');
    setUltimi([]);
    setSecondi(0);
    const t = nuovaTraccia();
    t.alPasso = (p) => { inAttesa(null); setUltimi((u) => [...u.slice(-2), `${p.passo} → ${p.stato}`]); };
    t.allInizio = (passo) => inAttesa({ passo, da: Date.now() });
    // «Interrompi» chiude subito, senza aspettare la chiamata in corso.
    const interruzione = new Promise<never>((_, rifiuta) => { ferma.current = () => { t.interrotta = true; rifiuta(new Interrotta()); }; });
    try {
      await Promise.race([lavora(t), interruzione]);
    } catch (e) {
      setAvanzamento('');
      setErrore(e instanceof AccessoRifiutato || e instanceof PortaleCambiato || e instanceof AccessoNonPossibile || e instanceof Interrotta || (e as Error).name === 'ErroreCassetto'
        ? (e as Error).message : `Interrotto: ${(e as Error)?.name ?? 'errore'} ${(e as Error)?.message ?? ''}`.trim());
    }
    const sospesa = attesaRef.current;
    if (sospesa) t.annota('Rimasto in attesa', `${sospesa.passo} da ${Math.round((Date.now() - sospesa.da) / 1000)} s`);
    setResoconto(`Scarico fatture · ${new Date().toLocaleString('it-IT')}\n${t.testo()}`);
    inAttesa(null);
    ferma.current = null;
    setInCorso(false);
  }

  async function lavora(t: Traccia) {
    setAvanzamento('Accesso al portale…');
    await apriSessione(t);
    setAvanzamento('Elenco delle fatture ricevute…');
    const elenco = await elencoRicevute(t, dal, al);
    const nuove = elenco.filter((f) => !giaPresente(f, esistenti));
    const daFare = nuove.slice(0, MASSIMO_PER_VOLTA);
    const file: { nome: string; byte: Uint8Array }[] = [];
    const scartati: { nome: string; motivo: string }[] = [];
    for (const [i, f] of daFare.entries()) {
      setAvanzamento(`Scarico ${i + 1} di ${daFare.length} (${elenco.length - nuove.length} già presenti)…`);
      try { file.push(await scaricaFattura(t, f)); } catch (e) {
        if (e instanceof Interrotta) throw e;
        scartati.push({ nome: `${f.fornitore} n. ${f.numero}`, motivo: (e as Error).message });
      }
    }
    if (nuove.length > daFare.length) scartati.push({ nome: 'Altre fatture', motivo: `${nuove.length - daFare.length} non scaricate: ripeti lo scaricamento dopo aver caricato queste.` });
    setAvanzamento(`${elenco.length} fatture nel periodo, ${nuove.length} nuove, ${file.length} scaricate.`);
    onScaricate(file, scartati);
  }

  return (
    <div class="nuova" aria-label="Dal cassetto fiscale">
      <h2>Dal cassetto fiscale</h2>
      <p class="nota">L'app entra nel portale con le tue credenziali Fisconline e scarica solo le fatture ricevute che non sono ancora qui. Solo lettura: sul portale non cambia nulla.</p>
      <div class="due">
        <label class="campo"><span>Dal</span><input type="date" value={dal} max={al} onInput={(e) => setDal(e.currentTarget.value)} /></label>
        <label class="campo"><span>Al</span><input type="date" value={al} max={oggi()} onInput={(e) => setAl(e.currentTarget.value)} /></label>
      </div>
      <button type="button" class="primario" disabled={disabilitato || inCorso || !dal || !al} onClick={() => void scarica()}>
        {inCorso ? 'Scaricamento…' : 'Scarica dal cassetto fiscale'}
      </button>
      {inCorso && <button type="button" class="secondario piccolo" onClick={() => ferma.current?.()}>Interrompi</button>}
      {avanzamento && <p role="status">{avanzamento}{inCorso ? ` · ${secondi} s` : ''}</p>}
      {inCorso && (ultimi.length > 0 || attesa) && <pre class="resoconto">{[...ultimi, ...(attesa ? [`In corso: ${attesa.passo} · ${Math.round((Date.now() - attesa.da) / 1000)} s`] : [])].join('\n')}</pre>}
      {errore && <p class="errore" role="alert">{errore}</p>}
      {resoconto && (
        <details>
          <summary>Resoconto tecnico (per Claude)</summary>
          <pre class="resoconto">{resoconto}</pre>
          <button type="button" class="secondario piccolo" onClick={() => void navigator.clipboard.writeText(resoconto).then(() => alert('Copiato.'))}>Copia resoconto</button>
        </details>
      )}
    </div>
  );
}

export function Fatture({ db, uid }: { db: Firestore; uid: string }) {
  const fat = useRaccolta<DocFattura & { id: string }>(db, 'fatture');
  const art = useRaccolta<Articolo>(db, 'articoli');
  const acq = useRaccolta<Acquisto>(db, 'acquisti');
  const ing = useRaccolta<Ingrediente>(db, 'ingredienti');
  const [lettura, setLettura] = useState<{ piano: PianoFatture; scartati: { nome: string; motivo: string }[] } | null>(null);
  const [stato, setStato] = useState<'pronto' | 'lettura' | 'salvataggio' | 'fatto'>('pronto');
  const [esito, setEsito] = useState<Esito>(null);

  const daControllare = useMemo(() => art.dati.filter((a) => a.categoria === null)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it')), [art.dati]);

  async function leggi(elenco: FileList | null) {
    if (!elenco?.length) return;
    await leggiByte(await Promise.all(Array.from(elenco).map(async (f) => ({ nome: f.name, byte: new Uint8Array(await f.arrayBuffer()) }))));
  }

  async function leggiByte(elenco: { nome: string; byte: Uint8Array }[], scartatiPrima: { nome: string; motivo: string }[] = []) {
    setStato('lettura');
    setEsito(null);
    const lette: { file: string; fattura: Fattura }[] = [];
    const scartati: { nome: string; motivo: string }[] = [...scartatiPrima];
    for (const f of elenco) {
      const r = await leggiFileFatture(f.nome, f.byte);
      scartati.push(...r.scartati);
      for (const x of r.fatture) {
        try { lette.push(...leggiFatturaPA(x.xml).map((fattura) => ({ file: x.nome, fattura }))); }
        catch (e) { scartati.push({ nome: x.nome, motivo: e instanceof Error ? e.message : 'non leggibile' }); }
      }
    }
    const piano = pianoFatture(lette, { fatture: new Set(fat.dati.map((f) => f.id)), acquisti: acq.dati, articoli: art.dati });
    setLettura({ piano, scartati });
    setStato('pronto');
  }

  async function carica() {
    if (!lettura) return;
    setStato('salvataggio');
    try {
      await salvaFatture(db, lettura.piano, uid);
      setStato('fatto');
    } catch (e) { setStato('pronto'); setEsito({ testo: errore(e), errore: true }); }
  }

  const caricamento = !fat.caricato || !art.caricato || !acq.caricato || !ing.caricato;
  const p = lettura?.piano;
  const recenti = [...fat.dati].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 30);

  return (
    <section class="scheda" aria-label="Fatture">
      <h1>Fatture</h1>
      {Capacitor.isNativePlatform() && <DalCassetto esistenti={fat.dati} disabilitato={caricamento || stato === 'lettura'} onScaricate={(f, s) => void leggiByte(f, s)} />}
      <h2>Carica fatture</h2>
      <p class="nota">File scaricati dal cassetto fiscale: XML, firmati .p7m o uno ZIP con più fatture. Le fatture già caricate vengono riconosciute.</p>
      <label class="campo">
        <span>File delle fatture</span>
        <input type="file" multiple accept=".xml,.p7m,.zip" disabled={caricamento} onChange={(e) => void leggi(e.currentTarget.files)} />
      </label>
      {stato === 'lettura' && <p>Lettura dei file…</p>}
      {esito && <p class="errore" role="alert">{esito.testo}</p>}
      {p && lettura && (
        <div class="anteprima" aria-label="Anteprima del caricamento">
          <p><strong>{p.fatture.length === 1 ? '1 fattura nuova' : `${p.fatture.length} fatture nuove`}</strong>
            {p.noteDiCredito > 0 && ` (di cui ${p.noteDiCredito} note di credito, che non cambiano i prezzi)`},
            {' '}{p.acquisti.length} righe: {p.righeCollegate} aggiornano subito un prezzo, {p.articoliNuovi.length} articoli nuovi da controllare.</p>
          {p.fatture.length > 0 && (
            <div class="scorri">
              <table class="tabella" aria-label="Fatture nuove">
                <thead><tr><th>Fornitore</th><th>Numero</th><th>Data</th><th>Totale</th></tr></thead>
                <tbody>{p.fatture.map((f) => (
                  <tr key={f.id}><th scope="row">{f.dati.fornitore}</th><td>{f.dati.numero}</td><td>{dataItaliana(f.dati.data)}</td><td>{euro(f.dati.totale)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {(p.saltate.length > 0 || lettura.scartati.length > 0) && (
            <ul class="avvisi">
              {p.saltate.map((s) => <li key={`${s.fornitore}${s.numero}${s.motivo}`}>{s.fornitore} n. {s.numero}: {s.motivo}</li>)}
              {lettura.scartati.map((s) => <li key={s.nome}>{s.nome}: {s.motivo}</li>)}
            </ul>
          )}
          {stato === 'fatto' ? <p class="ok" role="status">Fatture caricate.</p>
            : p.fatture.length > 0 && (
              <button type="button" class="primario" disabled={stato === 'salvataggio'} onClick={() => void carica()}>
                {stato === 'salvataggio' ? 'Caricamento…' : p.fatture.length === 1 ? 'Carica 1 fattura' : `Carica ${p.fatture.length} fatture`}
              </button>
            )}
        </div>
      )}

      <h2>Da controllare <small>({daControllare.length})</small></h2>
      {daControllare.length === 0 ? <p class="nota">Niente da controllare: tutti gli articoli hanno una categoria.</p> : (
        <>
          <p class="nota">Articoli mai visti prima. Scegli la categoria e, se serve per il food cost, l'ingrediente: dalla prossima fattura si collegano da soli.</p>
          <ul class="persone">
            {daControllare.map((a) => <DaControllare key={a.id} db={db} a={a} ingredienti={ing.dati} acquisti={acq.dati} />)}
          </ul>
        </>
      )}

      <h2>Acquisto senza fattura</h2>
      <AcquistoManuale db={db} ingredienti={ing.dati} />

      <h2>Fatture caricate <small>({fat.dati.length})</small></h2>
      {recenti.length === 0 ? <p class="nota">Nessuna fattura caricata.</p> : (
        <ul class="elenco">
          {recenti.map((f) => (
            <li key={f.id}><a>
              <span class="nome">{f.fornitore}{f.tipo === 'TD04' && <small class="stato vecchio"> nota di credito</small>}</span>
              <span class="valore">{euro(f.totale)}</span>
              <small class="dettaglio">n. {f.numero} · {dataItaliana(f.data)} · {f.righe} righe</small>
            </a></li>
          ))}
        </ul>
      )}
    </section>
  );
}
