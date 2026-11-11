/**
 * Cassa (fase «Cassa», C1): impostazione come Billy. Per ora scontrini SOLO sul simulatore dell'Agenzia
 * (l'Agenzia vera arriva al passo C5). In alto le righe, poi totale, descrizione/IVA, pagamenti,
 * e due pagine scorrevoli: tastierino con preferiti, griglia dei prodotti per gruppo.
 */
import { Capacitor } from '@capacitor/core';
import type { Firestore } from 'firebase/firestore';
import { Fragment } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  aggiungiLibera, aggiungiProdotto, centesimiDa, coloreGruppo, ErroreCassa, per, pezzi, preferiti, premi, righePerScontrino,
  TASTIERINO_VUOTO, togliUno, totaleCentesimi, type Riga, type Tastierino,
} from '../cassa/carrello';
import { useRaccolta } from '../dati/useRaccolta.db';
import type { Aliquota } from '../fiscal/dco';
import { archivioInMemoria, archivioSuDispositivo, InvioInSospeso, NonEmesso, type ArchivioInvii } from '../fiscal/emissione';
import { CassaProva, type Pagamento } from '../fiscal/prova';
import { RifiutoAgenzia, SessioneScaduta } from '../fiscal/trasporto';
import type { Prodotto } from '../foodcost/modello';
import { euro } from './formato';
import { nomeCassa, riepilogo, scontrinoAnnullo, scontrinoVendita, type ScontrinoArchivio } from '../cassa/archivio';
import { registraScontrino, useScontriniEvento } from '../cassa/archivio.db';
import { nomeMovimento, preparaMovimenti, riepilogoMovimenti, TIPI_MOVIMENTO, type TipoMovimento } from '../cassa/movimenti';
import { registraMovimenti, useMovimentiEvento } from '../cassa/movimenti.db';
import { centesimi, differenze, preparaQuadratura, type Apertura } from '../cassa/quadratura';
import { chiudiEvento, registraQuadratura, useQuadrature } from '../cassa/quadratura.db';
import { descriviEvento, ErroreEvento, eventiPerCassa, fuoriItalia, preparaEvento, type Evento } from '../eventi/eventi';
import { creaEvento } from '../eventi/eventi.db';
import { oggi } from '../dati/oggi';
import { condividiScontrino } from './condividi';
import { spiegaCausa, type EsitoSumUp } from '../cassa/sumup';
import { apriSumUp, chiaveSumUp, chiudiPagamento, esitoSalvato, pagamentoInCorso, quandoTornaSumUp, type PagamentoInCorso } from './sumupTelefono';

const NATIVA = Capacitor.isNativePlatform();

async function archivio(): Promise<ArchivioInvii> {
  if (!Capacitor.isNativePlatform()) return archivioInMemoria();
  const { Preferences } = await import('@capacitor/preferences');
  return archivioSuDispositivo(Preferences, 'vegman-dco-simulatore');
}

function messaggio(e: unknown): string {
  if (e instanceof ErroreCassa) return e.message;
  if (e instanceof InvioInSospeso) return 'C\'è uno scontrino in sospeso: va verificato (Cassa · prova → Verifica).';
  if (e instanceof NonEmesso) return 'Non emesso: riprova.';
  if (e instanceof SessioneScaduta) return 'Sessione scaduta: niente emesso.';
  if (e instanceof RifiutoAgenzia) return e.message;
  return (e as Error)?.message || 'Errore imprevisto.';
}

const IVA: Aliquota[] = ['10', '22', '4', '5'];
const TASTI = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['.', '0', '⌫']];

const NOME_CASSA = 'vegman-nome-cassa';
const EVENTO_CASSA = 'vegman-evento-cassa';
const STAMPA_COMANDE = 'vegman-stampa-comande';
const APERTURA = 'vegman-apertura-cassa';
function leggi(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function scrivi(k: string, v: string | null) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* solo comodità */ } }
function leggiNomeCassa(): string { return nomeCassa(leggi(NOME_CASSA)); }
function leggiApertura(): Apertura | null { try { return JSON.parse(leggi(APERTURA) ?? 'null') as Apertura | null; } catch { return null; } }

/** Cassa: prima si apre su un evento (C3), poi si vende. */
export function Cassa({ db, uid, titolare }: { db: Firestore; uid: string; titolare: boolean }) {
  const ev = useRaccolta<Evento>(db, 'eventi');
  const [scelto, setScelto] = useState<string | null>(leggi(EVENTO_CASSA));
  const [chiusa, setChiusa] = useState('');
  const evento = ev.dati.find((e) => e.id === scelto && e.stato === 'aperto');
  if (!ev.caricato) return <p class="nota">Carico…</p>;
  if (!evento) return <AperturaCassa db={db} eventi={ev.dati} titolare={titolare} messaggio={chiusa} onApri={(id) => { scrivi(EVENTO_CASSA, id); setScelto(id); setChiusa(''); }} />;
  return <Vendita db={db} uid={uid} titolare={titolare} evento={evento} onCambia={() => { scrivi(EVENTO_CASSA, null); setScelto(null); }}
    onChiusa={(m) => { scrivi(APERTURA, null); scrivi(EVENTO_CASSA, null); setChiusa(m); setScelto(null); }} />;
}

function AperturaCassa({ db, eventi, titolare, messaggio, onApri }: { db: Firestore; eventi: Evento[]; titolare: boolean; messaggio: string; onApri: (id: string) => void }) {
  const lista = eventiPerCassa(eventi, oggi());
  const [id, setId] = useState(lista[0]?.id ?? '');
  const [nome, setNome] = useState(leggiNomeCassa());
  const [comande, setComande] = useState(leggi(STAMPA_COMANDE) === '1');
  const [fondo, setFondo] = useState('');
  const [nuovo, setNuovo] = useState({ nome: '', dal: oggi(), al: '', luogo: '', paese: 'IT' });
  const [errore, setErrore] = useState('');
  const apri = (x: string) => {
    let f: number;
    try { f = centesimi(fondo, 'Fondo cassa'); } catch (e) { setErrore((e as Error).message); return; }
    const n = nomeCassa(nome);
    scrivi(NOME_CASSA, n);
    scrivi(STAMPA_COMANDE, comande ? '1' : '0');
    // Riaprendo la stessa cassa sullo stesso evento (es. dopo «Cambia») resta l'apertura di prima.
    const a = leggiApertura();
    if (!a || a.evento !== x || a.cassa !== n) scrivi(APERTURA, JSON.stringify({ evento: x, cassa: n, da: Date.now(), fondo: f } satisfies Apertura));
    onApri(x);
  };
  async function crea(e: Event) {
    e.preventDefault();
    try { const x = await creaEvento(db, preparaEvento(nuovo)); apri(x); } catch (err) {
      setErrore(err instanceof ErroreEvento ? err.message : (err as { code?: string }).code === 'permission-denied' ? 'Solo il titolare crea gli eventi.' : 'Evento non salvato: riprova.');
    }
  }
  return (
    <section class="scheda" aria-label="Apri la cassa">
      <h1>Apri la cassa</h1>
      {messaggio && <p class="esito" role="status">{messaggio}</p>}
      {lista.length ? (
        <div class="nuova">
          <label class="campo"><span>Evento</span>
            <select aria-label="Evento" value={id} onChange={(e) => setId(e.currentTarget.value)}>
              {lista.map((x) => <option key={x.id} value={x.id}>{descriviEvento(x)}</option>)}
            </select>
          </label>
          <label class="campo"><span>Nome di questa cassa</span><input value={nome} maxLength={30} onInput={(e) => setNome(e.currentTarget.value)} /></label>
          <label class="campo"><span>Fondo cassa (contanti all'inizio)</span><input inputMode="decimal" placeholder="0,00" value={fondo} onInput={(e) => setFondo(e.currentTarget.value)} /></label>
          <label class="spunta"><input type="checkbox" checked={comande} onChange={(e) => setComande(e.currentTarget.checked)} /> Stampa le comande per la cucina</label>
          <button type="button" class="primario" disabled={!id} onClick={() => apri(id)}>Apri cassa</button>
        </div>
      ) : <p class="nota">Nessun evento aperto.{titolare ? ' Creane uno qui sotto.' : ' Chiedi al titolare di crearlo.'}</p>}
      {titolare && (
        <details open={!lista.length}>
          <summary>＋ Nuovo evento</summary>
          <form class="nuova" onSubmit={(e) => void crea(e)}>
            <input aria-label="Nome dell'evento" placeholder="Nome (es. Sagra di Osimo)" value={nuovo.nome} onInput={(e) => setNuovo({ ...nuovo, nome: e.currentTarget.value })} />
            <div class="due">
              <label class="campo"><span>Dal</span><input type="date" value={nuovo.dal} onInput={(e) => setNuovo({ ...nuovo, dal: e.currentTarget.value })} /></label>
              <label class="campo"><span>Al</span><input type="date" value={nuovo.al} min={nuovo.dal} onInput={(e) => setNuovo({ ...nuovo, al: e.currentTarget.value })} /></label>
            </div>
            <div class="due">
              <input aria-label="Luogo" placeholder="Luogo" value={nuovo.luogo} onInput={(e) => setNuovo({ ...nuovo, luogo: e.currentTarget.value })} />
              <input aria-label="Paese" placeholder="Paese (IT)" maxLength={2} value={nuovo.paese} onInput={(e) => setNuovo({ ...nuovo, paese: e.currentTarget.value })} />
            </div>
            <button type="submit" class="primario">Crea e apri la cassa</button>
          </form>
        </details>
      )}
      {errore && <p class="errore" role="alert">{errore}</p>}
    </section>
  );
}


function Vendita({ db, uid, titolare, evento, onCambia, onChiusa }: { db: Firestore; uid: string; titolare: boolean; evento: Evento; onCambia: () => void; onChiusa: (messaggio: string) => void }) {
  const pro = useRaccolta<Prodotto>(db, 'prodotti');
  const [cassa, setCassa] = useState<CassaProva | null>(null);
  const [righe, setRighe] = useState<Riga[]>([]);
  const [t, setT] = useState<Tastierino>(TASTIERINO_VUOTO);
  const [descrizione, setDescrizione] = useState('');
  const [iva, setIva] = useState<Aliquota>('10');
  const [gruppo, setGruppo] = useState('');
  const [cerca, setCerca] = useState('');
  const [avviso, setAvviso] = useState<{ testo: string; errore: boolean } | null>(null);
  const [occupato, setOccupato] = useState(false);
  const [pagina, setPagina] = useState(0);
  const pagine = useRef<HTMLDivElement>(null);
  const [pannello, setPannello] = useState(false);
  const [senza, setSenza] = useState<TipoMovimento>('omaggio');
  const [motivo, setMotivo] = useState('');
  const [persona, setPersona] = useState('');
  const [chiusura, setChiusura] = useState(false);

  // Numerazione del simulatore dall'ora (decimi di secondo): riaprendo la cassa o con più telefoni non si ripete.
  useEffect(() => { void archivio().then((a) => setCassa(new CassaProva(a, () => new Date(), Math.floor(Date.now() / 100) % 1e9))); }, []);

  // SumUp (solo app Android, se la chiave è impostata): ELET apre SumUp, al ritorno si emette lo scontrino.
  const [conSumUp, setConSumUp] = useState(false);
  const [attesa, setAttesa] = useState<PagamentoInCorso | null>(null);
  const attesaRef = useRef<PagamentoInCorso | null>(null);
  attesaRef.current = attesa;
  useEffect(() => {
    if (!NATIVA) return undefined;
    void chiaveSumUp().then((k) => setConSumUp(!!k));
    void pagamentoInCorso().then(async (p) => { if (p) { setAttesa(p); const e = await esitoSalvato(); if (e) setEsitoSumUp(e); } });
    return quandoTornaSumUp((e) => setEsitoSumUp(e));
  }, []);
  const [esitoSumUp, setEsitoSumUp] = useState<EsitoSumUp | null>(null);
  useEffect(() => {
    const p = attesaRef.current;
    if (!esitoSumUp || !p || !cassa || (esitoSumUp.idTransazione && esitoSumUp.idTransazione !== p.id)) return;
    if (esitoSumUp.esito === 'pagato') void emettiDopoCarta(p, esitoSumUp.codice);
    else {
      setAvviso({ testo: `Carta: ${spiegaCausa(esitoSumUp.causa)}. Nessuno scontrino emesso.`, errore: true });
      if (!righe.length) setRighe(p.righe);
      void chiudiPagamento();
      setAttesa(null);
      setEsitoSumUp(null);
    }
  }, [esitoSumUp, cassa]);

  async function emettiDopoCarta(p: PagamentoInCorso, codice: string) {
    if (!cassa) return;
    setOccupato(true);
    try {
      const r = await cassa.vendi(righePerScontrino(p.righe), 'elettronico');
      const ok = await archivia(scontrinoVendita({ idtrx: r.idtrx, progressivo: r.progressivo, righe: p.righe, pagamento: 'elettronico', ambiente: 'simulatore', cassa: leggiNomeCassa(), giorno: oggi(), evento: evento.id, ...(codice ? { sumup: codice } : {}) }));
      await chiudiPagamento();
      setAttesa(null);
      setEsitoSumUp(null);
      if (ok) setAvviso({ testo: `✅ ${r.progressivo} · ${euro(p.centesimi / 100)} · carta${codice ? ` (SumUp ${codice})` : ''}`, errore: false });
    } catch (e) {
      // Pagamento incassato ma scontrino non emesso: il pagamento resta in sospeso finché non si emette.
      setAvviso({ testo: `Carta pagata ma scontrino NON emesso (${messaggio(e)}): premi «Emetti scontrino».`, errore: true });
    }
    setOccupato(false);
  }

  const [ultimo, setUltimo] = useState<ScontrinoArchivio | null>(null);

  async function invia(s: ScontrinoArchivio, quando: Date) {
    try { await condividiScontrino(s, quando); } catch (e) {
      if (!/cancel/i.test((e as Error)?.message ?? '')) setAvviso({ testo: `Invio non riuscito: ${messaggio(e)}`, errore: true });
    }
  }

  /** Registra lo scontrino nell'archivio; se non riesce lo dice (e lo dice per ultimo), ma lo scontrino resta emesso. */
  async function archivia(s: ScontrinoArchivio): Promise<boolean> {
    setUltimo(s);
    try { await registraScontrino(db, uid, s); return true; } catch {
      setAvviso({ testo: `Scontrino ${s.progressivo} emesso ma non registrato nell'archivio: segnalalo al titolare.`, errore: true });
      return false;
    }
  }

  async function annulla(s: ScontrinoArchivio) {
    if (!cassa || occupato) return;
    if (!confirm(`Annullare lo scontrino ${s.progressivo} di ${euro(s.totale)}?`)) return;
    setOccupato(true);
    try {
      const r = await cassa.annulla(s.idtrx);
      if (await archivia(scontrinoAnnullo(s, { idtrx: r.idtrx, progressivo: r.progressivo, cassa: leggiNomeCassa(), giorno: oggi() }))) setAvviso({ testo: `Annullato ${s.progressivo} con ${r.progressivo}.`, errore: false });
    } catch (e) { setAvviso({ testo: messaggio(e), errore: true }); }
    setOccupato(false);
  }

  async function avviaSumUp(daEmettere: Riga[]) {
    try {
      const p = await apriSumUp(daEmettere, totaleCentesimi(daEmettere), 'VegMan');
      setAttesa(p);
      setRighe([]);
      setT(TASTIERINO_VUOTO);
      setDescrizione('');
      setAvviso(null);
    } catch (e) { setAvviso({ testo: messaggio(e), errore: true }); }
  }

  const vendibili = useMemo(() => pro.dati.filter((p) => p.tipo === 'vendibile' && p.prezzo > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it')), [pro.dati]);
  const gruppi = useMemo(() => [...new Set(vendibili.map((p) => p.gruppo || 'Altro'))].sort((a, b) => a.localeCompare(b, 'it')), [vendibili]);
  const pref = useMemo(() => preferiti(vendibili), [vendibili]);
  const griglia = vendibili.filter((p) => (!gruppo || (p.gruppo || 'Altro') === gruppo) && (!cerca.trim() || p.nome.toLowerCase().includes(cerca.trim().toLowerCase())));

  function prova(f: () => void) {
    try { f(); setAvviso(null); } catch (e) { setAvviso({ testo: messaggio(e), errore: true }); }
  }
  function prodotto(p: Prodotto) {
    prova(() => { setRighe(aggiungiProdotto(righe, p, t.quantita ?? 1)); setT(TASTIERINO_VUOTO); });
  }
  function libera() {
    prova(() => { setRighe(aggiungiLibera(righe, t, descrizione, iva)); setT(TASTIERINO_VUOTO); setDescrizione(''); });
  }

  /** Righe da emettere: quelle in cassa o, come Billy, l'importo digitato come riga libera. */
  function righeDaEmettere(): Riga[] | null {
    let daEmettere = righe;
    if (!daEmettere.length && centesimiDa(t.testo)) {
      try { daEmettere = aggiungiLibera([], t, descrizione, iva); } catch (e) { setAvviso({ testo: messaggio(e), errore: true }); return null; }
    }
    if (!daEmettere.length) { setAvviso({ testo: 'Lo scontrino è vuoto.', errore: true }); return null; }
    return daEmettere;
  }

  function svuota() {
    setRighe([]);
    setT(TASTIERINO_VUOTO);
    setDescrizione('');
    setPannello(false);
    setMotivo('');
    setPersona('');
  }

  /** Omaggio, pasto staff, organizzatore, prova, scarto: nessuno scontrino, nessun importo, niente Agenzia. */
  async function registraSenzaIncasso(tipo: TipoMovimento) {
    if (occupato) return;
    setOccupato(true);
    try {
      const m = preparaMovimenti(righe, { tipo, motivo, persona, evento: evento.id, cassa: leggiNomeCassa(), giorno: oggi(), gruppo: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` });
      await registraMovimenti(db, uid, m);
      setAvviso({ testo: `✅ ${nomeMovimento(tipo)}: ${m.reduce((x, r) => x + r.quantita, 0)} pz registrati (nessuno scontrino).`, errore: false });
      setUltimo(null);
      svuota();
    } catch (e) {
      setAvviso({ testo: e instanceof ErroreCassa ? e.message : 'Movimento non registrato: riprova.', errore: true });
    }
    setOccupato(false);
  }

  async function paga(pagamento: Pagamento) {
    if (!cassa || occupato) return;
    const daEmettere = righeDaEmettere();
    if (!daEmettere) return;
    if (fuoriItalia(evento)) { setAvviso({ testo: `Evento fuori Italia (${evento.paese}): niente scontrino fiscale italiano. La ricevuta del luogo va definita col commercialista.`, errore: true }); return; }
    if (attesa) { setAvviso({ testo: 'C\'è un pagamento con carta in corso: chiudilo prima.', errore: true }); return; }
    if (pagamento === 'elettronico' && NATIVA && conSumUp) { await avviaSumUp(daEmettere); return; }
    setOccupato(true);
    try {
      const r = await cassa.vendi(righePerScontrino(daEmettere), pagamento);
      const s = scontrinoVendita({ idtrx: r.idtrx, progressivo: r.progressivo, righe: daEmettere, pagamento, ambiente: 'simulatore', cassa: leggiNomeCassa(), giorno: oggi(), evento: evento.id });
      const ok = await archivia(s);
      svuota();
      if (ok) setAvviso({ testo: `✅ ${r.progressivo} · ${euro(s.totale)} · ${pagamento === 'contanti' ? 'contanti' : 'carta'}${r.stato === 'recuperato' ? ' (recuperato)' : ''}`, errore: false });
    } catch (e) { setAvviso({ testo: messaggio(e), errore: true }); }
    setOccupato(false);
  }

  function vaiA(n: number) {
    setPagina(n);
    pagine.current?.scrollTo({ left: n * pagine.current.clientWidth, behavior: 'smooth' });
  }

  const totale = totaleCentesimi(righe);
  const digitato = centesimiDa(t.testo);

  return (
    <section class="cassa" aria-label="Cassa">
      <p class="simulatore cassa-banda" role="note"><strong>SIMULATORE</strong> · scontrini di prova, l'Agenzia non viene contattata</p>
      <div class="cassa-evento">
        <span>📍 {descriviEvento(evento)} · <strong>{leggiNomeCassa()}</strong>{leggi(STAMPA_COMANDE) === '1' ? ' · 🖨 comande' : ''}</span>
        <div class="comandi">
          <button type="button" class="secondario piccolo" onClick={onCambia}>Cambia</button>
          <button type="button" class="secondario piccolo" aria-expanded={chiusura} onClick={() => setChiusura(!chiusura)}>Chiudi cassa</button>
        </div>
      </div>
      {chiusura && <ChiusuraCassa db={db} uid={uid} titolare={titolare} evento={evento} occupata={!!attesa || righe.length > 0} onChiusa={onChiusa} />}
      {fuoriItalia(evento) && <p class="errore" role="alert">Evento fuori Italia ({evento.paese}): la cassa fiscale italiana non si usa qui.</p>}

      <ol class="cassa-righe" aria-label="Righe dello scontrino">
        {righe.length === 0 && <li class="vuota">Tocca i prodotti o scrivi un importo.</li>}
        {righe.map((r, i) => (
          <li key={`${r.descrizione}-${i}`}>
            <span class="nome">{r.descrizione}</span>
            <span class="qta">{r.quantita} pz × {euro(r.centesimi / 100)}</span>
            <span class="tot">{euro((r.quantita * r.centesimi) / 100)}</span>
            <button type="button" class="meno" aria-label={`Togli uno: ${r.descrizione}`} onClick={() => setRighe(togliUno(righe, i))}>−</button>
          </li>
        ))}
      </ol>

      <div class="cassa-totale" aria-label="Totale">
        <span>Totale ({pezzi(righe)} pz)</span>
        <strong>{euro(totale / 100)}</strong>
      </div>
      {attesa && (
        <div class="simulatore" role="alert" aria-label="Pagamento con carta">
          <p><strong>Pagamento con carta in corso · {euro(attesa.centesimi / 100)}</strong><br />
            In attesa del ritorno da SumUp. Se SumUp si è chiuso senza tornare qui, controlla lì l'esito:</p>
          <div class="comandi">
            <button type="button" class="primario piccolo" disabled={occupato} onClick={() => {
              if (confirm(`SumUp dice che il pagamento di ${euro(attesa.centesimi / 100)} è RIUSCITO? Verrà emesso lo scontrino.`)) void emettiDopoCarta(attesa, '');
            }}>Pagato: emetti scontrino</button>
            <button type="button" class="secondario piccolo" disabled={occupato} onClick={() => {
              if (!confirm('Il pagamento NON è andato a buon fine? Le righe tornano in cassa, nessuno scontrino.')) return;
              if (!righe.length) setRighe(attesa.righe);
              void chiudiPagamento(); setAttesa(null); setEsitoSumUp(null);
            }}>Non pagato</button>
          </div>
        </div>
      )}
      {avviso && <p role={avviso.errore ? 'alert' : 'status'} class={avviso.errore ? 'esito errore' : 'esito'}>{avviso.testo}</p>}
      {ultimo && !avviso?.errore && (
        <button type="button" class="secondario invia" onClick={() => void invia(ultimo, new Date())}>📤 Invia {ultimo.tipo === 'A' ? 'annullo' : 'scontrino'} {ultimo.progressivo} (WhatsApp, email…)</button>
      )}

      <div class="cassa-descrizione">
        <input aria-label="Descrizione" placeholder="Descrizione" maxLength={60} value={descrizione} onInput={(e) => setDescrizione(e.currentTarget.value)} />
        <select aria-label="IVA" value={iva} onChange={(e) => setIva(e.currentTarget.value as Aliquota)}>
          {IVA.map((a) => <option key={a} value={a}>IVA {a}%</option>)}
        </select>
      </div>
      <div class="cassa-display" aria-live="polite">
        {t.quantita ? <span class="per">{t.quantita} ×</span> : null}
        <span>{digitato !== null ? euro(digitato / 100) : t.testo || ' '}</span>
      </div>

      <div class="cassa-pagamenti">
        <button type="button" class="cont" disabled={occupato} onClick={() => void paga('contanti')}>CONT</button>
        <button type="button" class="elet" disabled={occupato} onClick={() => void paga('elettronico')}>{conSumUp ? 'ELET · SumUp' : 'ELET'}</button>
        <button type="button" class="senza" aria-label="Senza incasso" aria-expanded={pannello} disabled={occupato} onClick={() => setPannello(!pannello)}>🎁</button>
      </div>
      {pannello && (
        <div class="cassa-pannello" role="group" aria-label="Senza incasso">
          <div class="scelte">
            {TIPI_MOVIMENTO.map((x) => <label key={x.tipo} class="spunta"><input type="radio" name="senza" checked={senza === x.tipo} onChange={() => setSenza(x.tipo)} /> {x.nome}</label>)}
          </div>
          <p class="nota">Nessuno scontrino e nessun importo: solo prodotti, scaricati dal magazzino. Se qualcuno paga (anche l'organizzatore) è una vendita: CONT, ELET o fattura.</p>
          <input aria-label="Motivo" placeholder={`Motivo (${TIPI_MOVIMENTO.find((x) => x.tipo === senza)!.aiuto})`} maxLength={200} value={motivo} onInput={(e) => setMotivo(e.currentTarget.value)} />
          {senza === 'pasto_staff' && <input aria-label="Persona" placeholder="Chi ha mangiato (facoltativo)" maxLength={60} value={persona} onInput={(e) => setPersona(e.currentTarget.value)} />}
          <button type="button" class="primario" disabled={occupato} onClick={() => void registraSenzaIncasso(senza)}>Registra</button>
        </div>
      )}

      <div class="cassa-pagine" ref={pagine} onScroll={(e) => setPagina(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}>
        <div class="cassa-pagina" role="group" aria-label="Tastierino">
          <div class="tastierino">
            {TASTI.map((fila, i) => (
              <Fragment key={i}>
                {fila.map((k) => <button key={k} type="button" class="tasto" onClick={() => setT(premi(t, k))}>{k}</button>)}
                {pref[i]
                  ? <button key={`p${i}`} type="button" class="preferito" style={{ background: coloreGruppo(pref[i]!.gruppo || 'Altro', gruppi) }} onClick={() => prodotto(pref[i]!)}>{pref[i]!.nome}</button>
                  : <span key={`p${i}`} />}
              </Fragment>
            ))}
            <button type="button" class="tasto" onClick={() => setT(premi(t, 'C'))}>C</button>
            <button type="button" class="tasto" aria-label="Per (quantità)" onClick={() => prova(() => setT(per(t)))}>×</button>
            <button type="button" class="tasto aggiungi" onClick={libera}>+ importo</button>
          </div>
        </div>
        <div class="cassa-pagina" role="group" aria-label="Prodotti">
          <div class="cassa-filtri">
            <input aria-label="Cerca prodotto" placeholder="🔍 Cerca" value={cerca} onInput={(e) => setCerca(e.currentTarget.value)} />
            <div class="schede" role="tablist">
              <button type="button" role="tab" aria-selected={!gruppo} onClick={() => setGruppo('')}>Tutte</button>
              {gruppi.map((g) => <button key={g} type="button" role="tab" aria-selected={gruppo === g} onClick={() => setGruppo(g)}>{g}</button>)}
            </div>
          </div>
          <div class="griglia-prodotti">
            {!pro.caricato ? <p class="nota">Carico…</p> : griglia.map((p) => (
              <button key={p.id} type="button" style={{ background: coloreGruppo(p.gruppo || 'Altro', gruppi) }} onClick={() => prodotto(p)}>
                <span>{p.nome}</span><small>{euro(p.prezzo)}</small>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div class="pallini" role="tablist" aria-label="Pagine">
        <button type="button" role="tab" aria-selected={pagina === 0} aria-label="Tastierino" onClick={() => vaiA(0)} />
        <button type="button" role="tab" aria-selected={pagina === 1} aria-label="Prodotti" onClick={() => vaiA(1)} />
      </div>
      <ScontriniEvento db={db} evento={evento.id} cassa={cassa} occupato={occupato} onAnnulla={(s) => void annulla(s)} onInvia={(s, q) => void invia(s, q)} />
      {titolare && <MovimentiEvento db={db} evento={evento.id} />}
      {titolare && <QuadratureEvento db={db} evento={evento} />}
    </section>
  );
}

/** Scontrini dell'evento (tutte le casse): totali al netto degli annulli, annullo, invio. */
function ScontriniEvento({ db, evento, cassa, occupato, onAnnulla, onInvia }: {
  db: Firestore; evento: string; cassa: CassaProva | null; occupato: boolean; onAnnulla: (s: ScontrinoArchivio) => void; onInvia: (s: ScontrinoArchivio, quando: Date) => void;
}) {
  const sc = useScontriniEvento(db, evento);
  const r = riepilogo(sc.dati);
  const data = (x: unknown) => (x as { creatoIl?: { toDate?: () => Date } }).creatoIl?.toDate?.();
  const ora = (x: unknown) => { const t = data(x); return t ? t.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '…'; };
  const elenco = [...sc.dati].sort((a, b) => b.id.localeCompare(a.id));
  return (
    <details class="scontrini-oggi">
      <summary>Scontrini dell'evento · {r.vendite} · {euro(r.totale)}</summary>
      <p class="nota">Contanti {euro(r.contanti)} · Carta {euro(r.elettronico)}{r.annullati ? ` · ${r.annullati} annullati` : ''}</p>
      <ul class="persone" aria-label="Scontrini dell'evento">
        {elenco.map((s) => {
          const annullato = s.tipo === 'V' && r.annullatiIdtrx.has(s.idtrx);
          const annullabile = s.tipo === 'V' && !annullato && !!cassa?.scontrini.some((x) => x.idtrx === s.idtrx && !x.annullato);
          return (
            <li key={s.id} class={annullato || s.tipo !== 'V' ? 'disattivo' : ''}>
              <div class="nome"><strong>{s.progressivo}</strong> <small>{ora(s)} · {s.cassa}{s.ambiente === 'simulatore' ? ' · simulatore' : ''}</small></div>
              <small class="dettaglio">
                {s.tipo === 'A' ? `Annullo di ${s.progressivoOriginale}` : `${euro(s.totale)} · ${s.pagamento === 'contanti' ? 'contanti' : 'carta'}${s.sumup ? ` (SumUp ${s.sumup})` : ''}${annullato ? ' · annullato' : ''}`}
                {' · '}{s.righe.map((x) => `${x.quantita}× ${x.descrizione}`).join(', ')}
              </small>
              <div class="comandi">
                <button type="button" class="secondario piccolo" onClick={() => onInvia(s, data(s) ?? new Date())}>📤 Invia</button>
                {annullabile && <button type="button" class="secondario pericolo piccolo" disabled={occupato} onClick={() => onAnnulla(s)}>Annulla</button>}
              </div>
            </li>
          );
        })}
      </ul>
      {sc.caricato && !elenco.length && <p class="nota">Ancora nessuno scontrino per questo evento.</p>}
    </details>
  );
}


/** Movimenti senza incasso dell'evento (solo il titolare li vede). */
function MovimentiEvento({ db, evento }: { db: Firestore; evento: string }) {
  const m = useMovimentiEvento(db, evento, true);
  const r = riepilogoMovimenti(m.dati);
  const ora = (x: unknown) => (x as { creatoIl?: { toDate?: () => Date } }).creatoIl?.toDate?.()?.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) ?? '…';
  const elenco = [...m.dati].sort((a, b) => ((b as { creatoIl?: { seconds?: number } }).creatoIl?.seconds ?? Infinity) - ((a as { creatoIl?: { seconds?: number } }).creatoIl?.seconds ?? Infinity));
  return (
    <details class="scontrini-oggi">
      <summary>Senza incasso dell'evento · {r.reduce((t, x) => t + x.pezzi, 0)} pz</summary>
      {r.map((x) => <p key={x.tipo} class="nota"><strong>{x.nome}</strong>: {x.prodotti}</p>)}
      <ul class="persone" aria-label="Movimenti senza incasso">
        {elenco.map((x) => (
          <li key={x.id}>
            <div class="nome"><strong>{nomeMovimento(x.tipo)}</strong> <small>{ora(x)} · {x.cassa}</small></div>
            <small class="dettaglio">{x.quantita}× {x.descrizione} · {x.motivo}{x.persona ? ` · ${x.persona}` : ''}</small>
          </li>
        ))}
      </ul>
      {m.caricato && !elenco.length && <p class="nota">Nessun movimento per questo evento.</p>}
    </details>
  );
}

const euroSegno = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${euro(Math.abs(n))}`;

/** Chiusura: conta alla cieca dei contanti e del totale carta; poi la cassa torna all'apertura. */
function ChiusuraCassa({ db, uid, titolare, evento, occupata, onChiusa }: {
  db: Firestore; uid: string; titolare: boolean; evento: Evento; occupata: boolean; onChiusa: (messaggio: string) => void;
}) {
  const sc = useScontriniEvento(db, evento.id);
  const [conta, setConta] = useState({ contanti: '', pos: '', nota: '' });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const salvata = leggiApertura();
  const cassa = leggiNomeCassa();
  const apertura: Apertura = salvata && salvata.evento === evento.id && salvata.cassa === cassa ? salvata : { evento: evento.id, cassa, da: 0, fondo: 0 };
  async function chiudi(e: Event) {
    e.preventDefault();
    if (occupata) { setErrore('Prima svuota lo scontrino in corso e chiudi eventuali pagamenti con carta.'); return; }
    if (!sc.caricato) { setErrore('Sto ancora leggendo gli scontrini: riprova tra un attimo.'); return; }
    try {
      const q = preparaQuadratura(apertura, conta, sc.dati, Date.now(), oggi());
      if (!confirm(`Chiudere «${cassa}» con contanti ${euro(q.contanti)} e carta ${euro(q.pos)}? La conta non si potrà cambiare.`)) return;
      setInvio(true);
      await registraQuadratura(db, uid, q);
      const d = differenze(q);
      onChiusa(titolare
        ? `Cassa chiusa. ${d.quadra ? 'Tutto quadra ✅' : `Differenze: contanti ${euroSegno(d.contanti)}, carta ${euroSegno(d.pos)}.`}`
        : 'Cassa chiusa: conta registrata. Il confronto lo vede il titolare.');
    } catch (err) {
      setErrore(err instanceof ErroreCassa ? err.message : 'Chiusura non registrata: riprova.');
      setInvio(false);
    }
  }
  const aperta = apertura.da ? new Date(apertura.da).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <form class="cassa-pannello" aria-label="Chiusura cassa" onSubmit={(e) => void chiudi(e)}>
      <strong>Chiusura di «{cassa}»</strong>
      <p class="nota">{aperta ? `Aperta il ${aperta} con fondo ${euro(apertura.fondo / 100)}.` : 'Apertura non registrata su questo telefono: si contano tutte le vendite di questa cassa nell\'evento, fondo 0.'} Conta e scrivi quanto c'è: il confronto con gli scontrini lo vede il titolare.</p>
      <label class="campo"><span>Contanti contati (fondo compreso)</span><input inputMode="decimal" placeholder="0,00" value={conta.contanti} onInput={(e) => setConta({ ...conta, contanti: e.currentTarget.value })} /></label>
      <label class="campo"><span>Carta (POS): totale del lettore</span><input inputMode="decimal" placeholder="0,00" value={conta.pos} onInput={(e) => setConta({ ...conta, pos: e.currentTarget.value })} /></label>
      <input aria-label="Nota" placeholder="Nota (facoltativa)" maxLength={300} value={conta.nota} onInput={(e) => setConta({ ...conta, nota: e.currentTarget.value })} />
      <button type="submit" class="primario" disabled={invio}>Registra chiusura</button>
      {errore && <p class="errore" role="alert">{errore}</p>}
    </form>
  );
}

/** Chiusure dell'evento con il confronto (solo titolare) e chiusura dell'evento. */
function QuadratureEvento({ db, evento }: { db: Firestore; evento: Evento }) {
  const q = useQuadrature(db, evento.id);
  const elenco = [...q.dati].sort((a, b) => b.dal - a.dal);
  const storte = elenco.filter((x) => !differenze(x).quadra).length;
  async function chiudi() {
    if (!confirm(`Chiudere l'evento «${evento.nome}»? Nessuna cassa potrà più aprirlo.`)) return;
    try { await chiudiEvento(db, evento.id); } catch { alert('Evento non chiuso: riprova.'); }
  }
  return (
    <details class="scontrini-oggi">
      <summary>Chiusure dell'evento · {elenco.length}{storte ? ` · ⚠ ${storte} non quadrano` : ''}</summary>
      <ul class="persone" aria-label="Chiusure dell'evento">
        {elenco.map((x) => {
          const d = differenze(x);
          const quando = (x as { creatoIl?: { toDate?: () => Date } }).creatoIl?.toDate?.()?.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) ?? '…';
          return (
            <li key={x.id}>
              <div class="nome"><strong>{x.cassa}</strong> <small>{quando} · {x.scontrini} scontrini{x.annulli ? ` · ${x.annulli} annulli` : ''}</small></div>
              <small class="dettaglio">
                Contanti: contati {euro(x.contanti)} · attesi {euro(x.attesoContanti)} (fondo {euro(x.fondo)}){d.contanti ? ` · ⚠ ${euroSegno(d.contanti)}` : ' ✅'}<br />
                Carta: {euro(x.pos)} · attesa {euro(x.attesoPos)}{d.pos ? ` · ⚠ ${euroSegno(d.pos)}` : ' ✅'}
                {x.nota ? <><br />Nota: {x.nota}</> : null}
              </small>
            </li>
          );
        })}
      </ul>
      {q.caricato && !elenco.length && <p class="nota">Nessuna cassa chiusa per questo evento.</p>}
      <button type="button" class="secondario pericolo piccolo" onClick={() => void chiudi()}>Chiudi l'evento</button>
    </details>
  );
}
