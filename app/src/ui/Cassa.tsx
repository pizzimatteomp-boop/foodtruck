/**
 * Cassa (fase «Cassa», C1): impostazione come Billy. Per ora scontrini SOLO sul simulatore dell'Agenzia
 * (l'Agenzia vera arriva al passo C5). In alto le righe, poi totale, descrizione/IVA, pagamenti,
 * schermata fissa: righe, prodotti (o tastierino) e pagamenti sempre in vista; il resto nel menu ☰.
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
import { archivioInMemoria, archivioSuDispositivo, InvioInSospeso, NonEmesso, type ArchivioInvii, type InvioSospeso } from '../fiscal/emissione';
import { CassaProva, type Pagamento } from '../fiscal/prova';
import type { CassaAgenzia } from '../fiscal/cassaAgenzia';
import { collegaCassaVera, MANTIENI_VIVA_MS } from './agenziaTelefono';
import { messaggioSicuro } from '../fiscal/portale';
import { RifiutoAgenzia, SessioneScaduta } from '../fiscal/trasporto';
import type { Prodotto } from '../foodcost/modello';
import { euro } from './formato';
import { nomeCassa, riepilogo, scontrinoAnnullo, scontrinoVendita, type ScontrinoArchivio } from '../cassa/archivio';
import { registraScontrino, useScontriniEvento } from '../cassa/archivio.db';
import { nomeMovimento, preparaMovimenti, riepilogoMovimenti, TIPI_MOVIMENTO, type TipoMovimento } from '../cassa/movimenti';
import { registraMovimenti, useMovimentiEvento } from '../cassa/movimenti.db';
import { apri as apriCassa, centesimi, differenze, fondoProposto, preparaQuadratura, type Apertura } from '../cassa/quadratura';
import { annota, daEmettere, descriviVoce, emettiVoce, leggiRegistro, risoltaAMano, testoRegistro, type Registro, type VoceEmergenza } from '../cassa/emergenza';
import { chiudiEvento, registraQuadratura, useQuadrature } from '../cassa/quadratura.db';
import { descriviEvento, ErroreEvento, eventiPerCassa, fuoriItalia, preparaEvento, type Evento } from '../eventi/eventi';
import { creaEvento } from '../eventi/eventi.db';
import { oggi } from '../dati/oggi';
import { condividiScontrino } from './condividi';
import { comandaTermica, ricevutaTermica } from '../stampa/escpos';
import { contenutoRicevuta } from '../cassa/ricevuta';
import { collegaStampante, dimenticaStampante, ErroreStampa, stampa, stampanteSalvata } from './stampanteBluetooth';
import { ImpostazioniTelefono } from './ImpostazioniTelefono';
import { deposito } from './portaleTelefono';
import type { Ambiente } from '../firebase/config';
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
  if (e instanceof InvioInSospeso) return 'C\'è un invio in sospeso da verificare: ☰ Menu della cassa → «Invio in sospeso».';
  if (e instanceof NonEmesso) return 'Non emesso: riprova.';
  if (e instanceof SessioneScaduta) return `${e.message} Niente emesso: riprova.`;
  if (e instanceof RifiutoAgenzia) return e.message;
  return (e as Error)?.message || 'Errore imprevisto.';
}

const IVA: Aliquota[] = ['10', '22', '4', '5'];
const TASTI = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['.', '0', '⌫']];

const NOME_CASSA = 'vegman-nome-cassa';
const EVENTO_CASSA = 'vegman-evento-cassa';
const STAMPA_COMANDE = 'vegman-stampa-comande';
const APERTURA = 'vegman-apertura-cassa';
const REGISTRO = 'vegman-registro-emergenza';
const NUMERO_COMANDA = 'vegman-numero-comanda';
/** «agenzia» = scontrini fiscali veri (solo titolare, solo app Android, attivato all'apertura scrivendo VERO). */
const MODO = 'vegman-modo-cassa';
type CassaInUso = CassaProva | CassaAgenzia;
function leggiRegistroLocale(): Registro { try { return leggiRegistro(leggi(REGISTRO)); } catch { return []; } }
function leggi(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function scrivi(k: string, v: string | null) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* solo comodità */ } }
function leggiNomeCassa(): string { return nomeCassa(leggi(NOME_CASSA)); }
function leggiApertura(): Apertura | null { try { return JSON.parse(leggi(APERTURA) ?? 'null') as Apertura | null; } catch { return null; } }

/** Cassa: prima si apre su un evento (C3), poi si vende. */
/**
 * Simulatore o Agenzia vera: nell'app definitiva (produzione) sul telefono sempre l'Agenzia, nel browser la cassa
 * non si apre; nell'ambiente di prova sempre il simulatore, salvo la prova col titolare (spunta + VERO) dall'app Android.
 */
function modoCassa(ambiente: Ambiente, titolare: boolean): 'simulatore' | 'agenzia' | null {
  if (ambiente === 'produzione') return NATIVA ? 'agenzia' : null;
  return titolare && NATIVA && leggi(MODO) === 'agenzia' ? 'agenzia' : 'simulatore';
}

export function Cassa({ db, uid, titolare, ambiente }: { db: Firestore; uid: string; titolare: boolean; ambiente: Ambiente }) {
  const ev = useRaccolta<Evento>(db, 'eventi');
  const [scelto, setScelto] = useState<string | null>(leggi(EVENTO_CASSA));
  const [chiusa, setChiusa] = useState('');
  const evento = ev.dati.find((e) => e.id === scelto && e.stato === 'aperto');
  if (!ev.caricato) return <p class="nota">Carico…</p>;
  if (!evento) return <AperturaCassa db={db} eventi={ev.dati} titolare={titolare} ambiente={ambiente} messaggio={chiusa} onApri={(id) => { scrivi(EVENTO_CASSA, id); setScelto(id); setChiusa(''); }} />;
  return <Vendita db={db} uid={uid} titolare={titolare} ambiente={ambiente} evento={evento} onCambia={() => { scrivi(EVENTO_CASSA, null); setScelto(null); }}
    onChiusa={(m) => { scrivi(APERTURA, null); scrivi(EVENTO_CASSA, null); setChiusa(m); setScelto(null); }} />;
}

function AperturaCassa({ db, eventi, titolare, ambiente, messaggio, onApri }: { db: Firestore; eventi: Evento[]; titolare: boolean; ambiente: Ambiente; messaggio: string; onApri: (id: string) => void }) {
  const prova = ambiente === 'prova';
  const lista = eventiPerCassa(eventi, oggi());
  const [id, setId] = useState(lista[0]?.id ?? '');
  const [nome, setNome] = useState(leggiNomeCassa());
  const [comande, setComande] = useState(leggi(STAMPA_COMANDE) === '1');
  // Scontrini veri: spunta + «VERO» scritto in un campo della pagina (la finestra prompt() sul telefono non compare).
  const giaVero = prova && leggi(MODO) === 'agenzia' && titolare && NATIVA;
  const [spuntaVero, setSpuntaVero] = useState(giaVero);
  const [confermaVero, setConfermaVero] = useState(giaVero ? 'VERO' : '');
  const vero = spuntaVero && confermaVero.trim().toUpperCase() === 'VERO';
  const [fondo, setFondo] = useState(() => fondoProposto(leggiApertura(), lista[0]?.id ?? '', leggiNomeCassa()));
  // Cassa già aperta su questo evento con questo nome: si propone il fondo scritto allora (si può correggere).
  const giaAperta = (() => { const a = leggiApertura(); return a && a.evento === id && a.cassa === nomeCassa(nome) ? a : null; })();
  const fondoScritto = useRef(false);
  useEffect(() => { if (!fondoScritto.current) setFondo(fondoProposto(leggiApertura(), id, nomeCassa(nome))); }, [id, nome]);
  const [nuovo, setNuovo] = useState({ nome: '', dal: oggi(), al: '', luogo: '', paese: 'IT' });
  const [errore, setErrore] = useState('');
  const apri = async (x: string) => {
    let f: number;
    try { f = centesimi(fondo, 'Fondo cassa'); } catch (e) { setErrore((e as Error).message); return; }
    if (spuntaVero && !vero) { setErrore('Per gli scontrini veri scrivi VERO nel campo di conferma (oppure togli la spunta).'); return; }
    if (modoCassa(ambiente, titolare) === null) { setErrore('La cassa si usa dall\'app VegMan sul telefono Android.'); return; }
    if (!prova) {
      const ci = await deposito().then((c) => c.presenti()).catch(() => false);
      if (!ci) { setErrore(`Su questo telefono mancano le credenziali Fisconline: ${titolare ? 'inseriscile in «⚙ Impostazioni di questo telefono».' : 'le inserisce il titolare, dal suo accesso, in «⚙ Impostazioni di questo telefono».'}`); return; }
    }
    const n = nomeCassa(nome);
    scrivi(NOME_CASSA, n);
    scrivi(STAMPA_COMANDE, comande ? '1' : '0');
    if (prova) scrivi(MODO, vero ? 'agenzia' : 'simulatore');
    // Riaprendo la stessa cassa sullo stesso evento (es. dopo «Cambia») resta l'ora di apertura; il fondo si aggiorna.
    const r = apriCassa(leggiApertura(), x, n, f, Date.now());
    scrivi(APERTURA, JSON.stringify(r.apertura));
    if (r.nuova) scrivi(NUMERO_COMANDA, '0');
    onApri(x);
  };
  async function crea(e: Event) {
    e.preventDefault();
    try { const x = await creaEvento(db, preparaEvento(nuovo)); await apri(x); } catch (err) {
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
          <label class="campo"><span>Fondo cassa (contanti all'inizio)</span><input inputMode="decimal" placeholder="0,00" value={fondo} onInput={(e) => { fondoScritto.current = true; setFondo(e.currentTarget.value); }} /></label>
          {giaAperta && <p class="nota">Questa cassa è già aperta su questo evento dal {new Date(giaAperta.da).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}: riaprendola si continua, col fondo scritto qui.</p>}
          <label class="spunta"><input type="checkbox" checked={comande} onChange={(e) => setComande(e.currentTarget.checked)} /> Stampa le comande per la cucina</label>
          <ImpostazioniTelefono titolare={titolare} aperta={spuntaVero}>
            <Stampante />
            {prova && titolare && NATIVA && (
              <>
                <label class={spuntaVero ? 'spunta vero' : 'spunta'}><input type="checkbox" checked={spuntaVero} onChange={(e) => { const si = e.currentTarget.checked; setSpuntaVero(si); if (!si) setConfermaVero(''); }} /> Scontrini VERI (Agenzia delle Entrate)</label>
                {spuntaVero && (
                  <label class="campo"><span>{vero ? '✅ Scontrini veri: trasmessi all\'Agenzia delle Entrate' : 'Scrivi VERO per confermare: gli scontrini saranno trasmessi all\'Agenzia'}</span>
                    <input aria-label="Conferma scontrini veri" autoCapitalize="characters" placeholder="VERO" value={confermaVero} onInput={(e) => setConfermaVero(e.currentTarget.value)} />
                  </label>
                )}
              </>
            )}
          </ImpostazioniTelefono>
          {modoCassa(ambiente, titolare) === null
            ? <p class="nota" role="alert">La cassa si usa dall'app VegMan sul telefono Android: qui nel browser non si emettono scontrini.</p>
            : <button type="button" class="primario" disabled={!id} onClick={() => void apri(id)}>Apri cassa</button>}
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


function Vendita({ db, uid, titolare, ambiente, evento, onCambia, onChiusa }: { db: Firestore; uid: string; titolare: boolean; ambiente: Ambiente; evento: Evento; onCambia: () => void; onChiusa: (messaggio: string) => void }) {
  const pro = useRaccolta<Prodotto>(db, 'prodotti');
  const [cassa, setCassa] = useState<CassaInUso | null>(null);
  const modoVero = modoCassa(ambiente, titolare) === 'agenzia';
  const [collegamento, setCollegamento] = useState<{ stato: 'collego' | 'ok' | 'errore'; testo?: string }>({ stato: modoVero ? 'collego' : 'ok' });
  const [tentativo, setTentativo] = useState(0);
  const [righe, setRighe] = useState<Riga[]>([]);
  const [t, setT] = useState<Tastierino>(TASTIERINO_VUOTO);
  const [descrizione, setDescrizione] = useState('');
  /** Nome per chiamare il cliente, solo sulla comanda (non si salva da nessuna parte). */
  const [cliente, setCliente] = useState('');
  const conComande = leggi(STAMPA_COMANDE) === '1';
  const [iva, setIva] = useState<Aliquota>('10');
  const [gruppo, setGruppo] = useState('');
  const [cerca, setCerca] = useState('');
  const [avviso, setAvviso] = useState<{ testo: string; errore: boolean } | null>(null);
  const [occupato, setOccupato] = useState(false);
  // Telefono: prodotti (1) o tastierino (0), senza scorrere; sul tablet si vedono insieme.
  const [pagina, setPagina] = useState(1);
  const [menu, setMenu] = useState(false);
  const [pannello, setPannello] = useState(false);
  const [senza, setSenza] = useState<TipoMovimento>('omaggio');
  const [motivo, setMotivo] = useState('');
  const [persona, setPersona] = useState('');
  const [chiusura, setChiusura] = useState(false);
  // Registro di emergenza (C7): sul telefono, resta anche chiudendo l'app.
  const [registro, setRegistroStato] = useState<Registro>(leggiRegistroLocale);
  const registroRef = useRef(registro);
  function setRegistro(r: Registro) { registroRef.current = r; scrivi(REGISTRO, JSON.stringify(r)); setRegistroStato(r); }
  const [senzaRete, setSenzaRete] = useState(false);
  const [voceAMano, setVoceAMano] = useState<number | null>(null);
  useEffect(() => { if (cassa?.ambiente === 'simulatore') cassa.simulatore.fuoriRete = senzaRete; }, [cassa, senzaRete]);
  // Con l'Agenzia vera non collegata (rete assente, accesso non riuscito) le vendite vanno nel registro di emergenza.
  const fuoriRete = () => senzaRete || (typeof navigator !== 'undefined' && navigator.onLine === false) || (modoVero && collegamento.stato !== 'ok');
  useEffect(() => {
    const torna = () => { if (daEmettere(registroRef.current, evento.id).length) setAvviso({ testo: '📶 La rete è tornata: premi «Emetti ora» nel registro di emergenza.', errore: false }); };
    window.addEventListener('online', torna);
    return () => window.removeEventListener('online', torna);
  }, [evento.id]);

  /**
   * Agenzia non raggiungibile: la vendita va nel registro di emergenza. «daVerificare» se l'invio è partito
   * e la risposta si è persa senza poterla verificare (forse è emessa: si verifica prima di riemetterla).
   */
  function inEmergenza(righeVoce: Riga[], pagamento: 'contanti' | 'elettronico', motivo: string, daVerificare: boolean, sumup?: string) {
    const r = annota(registroRef.current, { quando: Date.now(), evento: evento.id, cassa: leggiNomeCassa(), righe: righeVoce, pagamento, motivo, ...(sumup ? { sumup } : {}) });
    const n = r[r.length - 1]!.numero;
    setRegistro(daVerificare ? r.map((v) => (v.numero === n ? { ...v, daVerificare: true as const } : v)) : r);
    setUltimo(null);
    const nc = comanda(righeVoce);
    setAvviso({ testo: `📒 Agenzia non raggiungibile: vendita di ${euro(totaleCentesimi(righeVoce) / 100)} annotata nel registro di emergenza (n. ${n}). ${daVerificare ? 'Si verifica' : 'Lo scontrino si emette'} appena torna la rete.${nc}`, errore: false });
  }

  /** Dopo un errore d'invio: va nel registro? (mai se lo scontrino potrebbe essere già partito senza saperlo, salvo «da verificare»). */
  function perEmergenza(e: unknown, cera: boolean): { motivo: string; daVerificare: boolean } | null {
    if (e instanceof NonEmesso) return { motivo: 'Agenzia non raggiungibile', daVerificare: false };
    if (e instanceof InvioInSospeso) return cera ? { motivo: 'Scontrino precedente da verificare', daVerificare: false } : { motivo: 'Risposta persa durante l\'invio', daVerificare: true };
    return null;
  }

  useEffect(() => {
    if (!modoVero) {
      // Numerazione del simulatore dall'ora (decimi di secondo): riaprendo la cassa o con più telefoni non si ripete.
      void archivio().then((a) => setCassa(new CassaProva(a, () => new Date(), Math.floor(Date.now() / 100) % 1e9)));
      return undefined;
    }
    let vivo = true;
    setCollegamento({ stato: 'collego' });
    collegaCassaVera().then((c) => { if (vivo) { setCassa(c); setCollegamento({ stato: 'ok' }); } })
      .catch((e: unknown) => { if (vivo) setCollegamento({ stato: 'errore', testo: messaggioSicuro(e) }); });
    return () => { vivo = false; };
  }, [tentativo]);
  // Sessione tenuta sveglia con una lettura leggera; se è scaduta il nuovo accesso parte da solo.
  useEffect(() => {
    if (!cassa || cassa.ambiente !== 'agenzia') return undefined;
    const t = setInterval(() => { cassa.mantieniViva().catch(() => undefined); }, MANTIENI_VIVA_MS);
    return () => clearInterval(t);
  }, [cassa]);

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
    const cera = !!(await cassa.sospeso());
    const chiudiCarta = async () => { await chiudiPagamento(); setAttesa(null); setEsitoSumUp(null); };
    if (fuoriRete()) {
      inEmergenza(p.righe, 'elettronico', 'Rete assente', false, codice || undefined);
      await chiudiCarta();
      setOccupato(false);
      return;
    }
    try {
      const r = await cassa.vendi(righePerScontrino(p.righe), 'elettronico');
      const ok = await archivia(scontrinoVendita({ idtrx: r.idtrx, progressivo: r.progressivo, righe: p.righe, pagamento: 'elettronico', ambiente: cassa.ambiente, cassa: leggiNomeCassa(), giorno: oggi(), evento: evento.id, ...(codice ? { sumup: codice } : {}) }));
      await chiudiPagamento();
      setAttesa(null);
      setEsitoSumUp(null);
      const nc = comanda(p.righe);
      if (ok) setAvviso({ testo: `✅ ${r.progressivo} · ${euro(p.centesimi / 100)} · carta${codice ? ` (SumUp ${codice})` : ''}${nc}`, errore: false });
    } catch (e) {
      const em = perEmergenza(e, cera);
      if (em) { inEmergenza(p.righe, 'elettronico', em.motivo, em.daVerificare, codice || undefined); await chiudiCarta(); setOccupato(false); return; }
      // Pagamento incassato ma scontrino non emesso: il pagamento resta in sospeso finché non si emette.
      setAvviso({ testo: `Carta pagata ma scontrino NON emesso (${messaggio(e)}): premi «Emetti scontrino».`, errore: true });
    }
    setOccupato(false);
  }

  const [ultimo, setUltimo] = useState<ScontrinoArchivio | null>(null);
  const [avvisoStampa, setAvvisoStampa] = useState('');

  /** Comanda per la cucina (se attiva all'apertura e c'è una stampante): numero progressivo di questa apertura. Mai bloccante. */
  function comanda(righeC: readonly { quantita: number; descrizione: string }[], nota?: string): string {
    if (leggi(STAMPA_COMANDE) !== '1' || !stampanteSalvata()) return '';
    const numero = Number(leggi(NUMERO_COMANDA) ?? '0') + 1;
    scrivi(NUMERO_COMANDA, String(numero));
    const ora = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const nome = cliente.trim();
    setCliente('');
    stampa(comandaTermica({ numero, cassa: leggiNomeCassa(), ora, righe: righeC.map((r) => ({ quantita: r.quantita, descrizione: r.descrizione })), ...(nome ? { cliente: nome } : {}), ...(nota ? { nota } : {}) }))
      .then(() => setAvvisoStampa(''))
      .catch((e: unknown) => setAvvisoStampa(`🖨 Comanda ${numero} non stampata: ${e instanceof ErroreStampa ? e.message : 'errore della stampante'}`));
    return ` · comanda ${numero}${nome ? ` (${nome})` : ''}`;
  }

  async function stampaRicevuta(s: ScontrinoArchivio, quando: Date) {
    try { await stampa(ricevutaTermica(contenutoRicevuta(s, quando))); setAvvisoStampa(''); } catch (e) {
      setAvvisoStampa(`🖨 Ricevuta non stampata: ${e instanceof ErroreStampa ? e.message : 'errore della stampante'}`);
    }
  }

  /** Invio al cliente: ricevuta VegMan e, per gli scontrini veri, il PDF dell'Agenzia (il documento fiscale). */
  async function invia(s: ScontrinoArchivio, quando: Date) {
    let pdf: Uint8Array | undefined;
    if (s.ambiente === 'agenzia' && cassa?.ambiente === 'agenzia') {
      try { pdf = await cassa.pdf(s.idtrx); } catch (e) { setAvviso({ testo: `PDF dell'Agenzia non scaricato (${messaggio(e)}): mando la ricevuta in testo; riprova dopo per il PDF.`, errore: true }); }
    }
    try { await condividiScontrino(s, quando, pdf); } catch (e) {
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
    setPagina(1);
    setCliente('');
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
      const nc = comanda(m, nomeMovimento(tipo));
      setAvviso({ testo: `✅ ${nomeMovimento(tipo)}: ${m.reduce((x, r) => x + r.quantita, 0)} pz registrati (nessuno scontrino).${nc}`, errore: false });
      setUltimo(null);
      svuota();
    } catch (e) {
      // il foglio si chiude, così il messaggio (sotto) si vede
      setPannello(false);
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
    if (fuoriRete()) { inEmergenza(daEmettere, pagamento, 'Rete assente', false); svuota(); return; }
    setOccupato(true);
    const cera = !!(await cassa.sospeso());
    try {
      const r = await cassa.vendi(righePerScontrino(daEmettere), pagamento);
      const s = scontrinoVendita({ idtrx: r.idtrx, progressivo: r.progressivo, righe: daEmettere, pagamento, ambiente: cassa.ambiente, cassa: leggiNomeCassa(), giorno: oggi(), evento: evento.id });
      const ok = await archivia(s);
      svuota();
      const nc = comanda(daEmettere);
      if (ok) setAvviso({ testo: `✅ ${r.progressivo} · ${euro(s.totale)} · ${pagamento === 'contanti' ? 'contanti' : 'carta'}${r.stato === 'recuperato' ? ' (recuperato)' : ''}${nc}`, errore: false });
    } catch (e) {
      const em = perEmergenza(e, cera);
      if (em) { inEmergenza(daEmettere, pagamento, em.motivo, em.daVerificare); svuota(); } else setAvviso({ testo: messaggio(e), errore: true });
    }
    setOccupato(false);
  }

  /** Regolarizzazione: emette (o verifica) le voci del registro di questo evento, in ordine, e si ferma al primo intoppo. */
  async function emettiRegistro() {
    if (!cassa || occupato) return;
    if (fuoriRete()) { setAvviso({ testo: modoVero && collegamento.stato !== 'ok' ? 'Agenzia non collegata: premi «Riprova» in cima, poi «Emetti ora».' : 'Ancora senza rete: riprova quando torna.', errore: true }); return; }
    setOccupato(true);
    let emesse = 0;
    try {
      for (const v of daEmettere(registroRef.current, evento.id).sort((a, b) => a.numero - b.numero)) {
        const e = await emettiVoce(registroRef.current, v.numero, cassa, Date.now());
        setRegistro(e.registro);
        if (e.tipo === 'ferma') { setVoceAMano(e.aMano ? v.numero : null); setAvviso({ testo: e.messaggio, errore: true }); setOccupato(false); return; }
        emesse++;
        await archivia(scontrinoVendita({ idtrx: e.idtrx, progressivo: e.progressivo, righe: v.righe, pagamento: v.pagamento, ambiente: cassa.ambiente, cassa: v.cassa, giorno: oggi(), evento: v.evento, emergenza: v.quando, ...(v.sumup ? { sumup: v.sumup } : {}) }));
      }
      setAvviso({ testo: `✅ Registro di emergenza: ${emesse} ${emesse === 1 ? 'scontrino emesso' : 'scontrini emessi'}.`, errore: false });
    } catch (e) { setAvviso({ testo: `${emesse ? `${emesse} emessi, poi: ` : ''}${messaggio(e)}`, errore: true }); }
    setOccupato(false);
  }

  function risolvi(numero: number, trovata: boolean) {
    try { setRegistro(risoltaAMano(registroRef.current, numero, trovata, Date.now())); setVoceAMano(null); setAvviso({ testo: trovata ? `Vendita n. ${numero}: segnata come già emessa.` : `Vendita n. ${numero}: da emettere (premi «Emetti ora»).`, errore: false }); } catch (e) { setAvviso({ testo: messaggio(e), errore: true }); }
  }

  function vaiA(n: number) {
    setPagina(n);
  }

  const totale = totaleCentesimi(righe);
  const digitato = centesimiDa(t.testo);

  const aperteEmergenza = daEmettere(registro, evento.id);
  const infoEvento = `📍 ${descriviEvento(evento)} · `;
  const esito = (
    <>
      {avviso && <p role={avviso.errore ? 'alert' : 'status'} class={avviso.errore ? 'esito errore' : 'esito'}>{avviso.testo}</p>}
      {ultimo && !avviso?.errore && (
        <div class="cassa-ultimo">
          <button type="button" class="primario" aria-label={`Invia ${ultimo.tipo === 'A' ? 'annullo' : 'scontrino'} ${ultimo.progressivo}`} onClick={() => void invia(ultimo, new Date())}>📤 Invia</button>
          {stampanteSalvata() && <button type="button" class="primario" aria-label="🖨 Stampa" onClick={() => void stampaRicevuta(ultimo, new Date())}>🖨 Stampa</button>}
        </div>
      )}
      {avvisoStampa && <p class="esito errore" role="alert">{avvisoStampa}</p>}
    </>
  );
  return (
    <section class="cassa" aria-label="Cassa">
      <div class="cassa-testa">
        {modoVero
          ? <span class="cassa-modo vero" role="note">AGENZIA {collegamento.stato === 'ok' ? '✅' : collegamento.stato === 'collego' ? '…' : '❌'}</span>
          : <span class="cassa-modo simulatore" role="note">SIMULATORE</span>}
        <span class="cassa-info">{infoEvento}<strong>{leggiNomeCassa()}</strong> · fondo {euro((leggiApertura()?.fondo ?? 0) / 100)}{leggi(STAMPA_COMANDE) === '1' ? ' · 🖨 comande' : ''}</span>
        <button type="button" class="secondario piccolo cassa-apri-menu" aria-label="Menu della cassa" aria-expanded={menu} onClick={() => setMenu(true)}>☰{aperteEmergenza.length ? <span class="pallino-avviso">{aperteEmergenza.length}</span> : null}</button>
      </div>
      {modoVero && collegamento.stato === 'errore' && (
        <p class="esito errore" role="alert">Agenzia non collegata: le vendite vanno nel registro di emergenza ({collegamento.testo}) <button type="button" class="secondario piccolo" onClick={() => setTentativo((x) => x + 1)}>Riprova</button></p>
      )}
      {aperteEmergenza.length > 0 && !menu && (
        <p class="esito errore cassa-emergenza-breve">📒 {aperteEmergenza.length} {aperteEmergenza.length === 1 ? 'vendita' : 'vendite'} senza scontrino (registro di emergenza)
          <button type="button" class="primario piccolo" disabled={occupato} onClick={() => void emettiRegistro()}>Emetti ora</button></p>
      )}
      {fuoriItalia(evento) && <p class="errore" role="alert">Evento fuori Italia ({evento.paese}): la cassa fiscale italiana non si usa qui.</p>}

      <div class="cassa-corpo" data-vista={pagina === 0 ? 'tastierino' : 'prodotti'}>
        <div class="cassa-scontrino">
          <ol class="cassa-righe" aria-label="Righe dello scontrino">
            {righe.length === 0 && <li class="vuota">Tocca i prodotti o scrivi un importo.</li>}
            {righe.map((r, i) => (
              <li key={`${r.descrizione}-${i}`}>
                <span class="nome">{r.descrizione}<small class="qta">{r.quantita} pz × {euro(r.centesimi / 100)}</small></span>
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
          {!menu && esito}
          {conComande && (
            <input class="cassa-cliente" aria-label="Nome per la comanda" placeholder="Nome (per chiamare il cliente)" maxLength={30} value={cliente} onInput={(e) => setCliente(e.currentTarget.value)} />
          )}
        </div>

        <div class="cassa-pagina pagina-prodotti" role="group" aria-label="Prodotti">
          <div class="cassa-filtri">
            <button type="button" class="solo-telefono verso" onClick={() => vaiA(0)}>⌨ {t.quantita ? `${t.quantita} ×` : 'Importo'}</button>
            <input aria-label="Cerca prodotto" placeholder="🔍" value={cerca} onInput={(e) => setCerca(e.currentTarget.value)} />
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

        <div class="cassa-pagina pagina-tastierino" role="group" aria-label="Tastierino">
          <div class="cassa-descrizione">
            <button type="button" class="solo-telefono verso" onClick={() => vaiA(1)}>◀ Prodotti</button>
            <input aria-label="Descrizione" placeholder="Descrizione" maxLength={60} value={descrizione} onInput={(e) => setDescrizione(e.currentTarget.value)} />
            <select aria-label="IVA" value={iva} onChange={(e) => setIva(e.currentTarget.value as Aliquota)}>
              {IVA.map((a) => <option key={a} value={a}>IVA {a}%</option>)}
            </select>
          </div>
          <div class="cassa-display" aria-live="polite">
            {t.quantita ? <span class="per">{t.quantita} ×</span> : null}
            <span>{digitato !== null ? euro(digitato / 100) : t.testo || ' '}</span>
          </div>
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

        <div class="cassa-pagamenti">
          <button type="button" class="cont" disabled={occupato} onClick={() => void paga('contanti')}>CONT</button>
          <button type="button" class="elet" disabled={occupato} onClick={() => void paga('elettronico')}>{conSumUp ? 'ELET · SumUp' : 'ELET'}</button>
          <button type="button" class="senza" aria-label="Senza incasso" aria-expanded={pannello} disabled={occupato} onClick={() => setPannello(!pannello)}>🎁</button>
        </div>
      </div>

      {pannello && (
        <div class="cassa-foglio" role="group" aria-label="Senza incasso">
          <div class="foglio-testa"><strong>🎁 Senza incasso · {pezzi(righe)} pz</strong>
            <button type="button" class="secondario piccolo" onClick={() => setPannello(false)}>Annulla</button></div>
          <div class="scelte">
            {TIPI_MOVIMENTO.map((x) => <label key={x.tipo} class="spunta"><input type="radio" name="senza" checked={senza === x.tipo} onChange={() => setSenza(x.tipo)} /> {x.nome}</label>)}
          </div>
          <p class="nota">Nessuno scontrino e nessun importo: solo prodotti, scaricati dal magazzino. Se qualcuno paga (anche l'organizzatore) è una vendita: CONT, ELET o fattura.</p>
          <input aria-label="Motivo" placeholder={`Motivo, facoltativo (${TIPI_MOVIMENTO.find((x) => x.tipo === senza)!.aiuto})`} maxLength={200} value={motivo} onInput={(e) => setMotivo(e.currentTarget.value)} />
          {senza === 'pasto_staff' && <input aria-label="Persona" placeholder="Chi ha mangiato (facoltativo)" maxLength={60} value={persona} onInput={(e) => setPersona(e.currentTarget.value)} />}
          <button type="button" class="primario" disabled={occupato} onClick={() => void registraSenzaIncasso(senza)}>Registra</button>
        </div>
      )}

      {menu && (
        <div class="cassa-menu" role="dialog" aria-label="Menu della cassa">
          <div class="foglio-testa"><strong>☰ Cassa</strong>
            <button type="button" class="primario piccolo" aria-label="Torna alla cassa" onClick={() => { setMenu(false); setChiusura(false); }}>✕ Torna alla cassa</button></div>
          <p class="nota">{infoEvento}{leggiNomeCassa()} · fondo {euro((leggiApertura()?.fondo ?? 0) / 100)}</p>
          {esito}
          <div class="comandi">
            <button type="button" class="secondario" onClick={onCambia}>Cambia evento o cassa</button>
            <button type="button" class="secondario" aria-expanded={chiusura} onClick={() => setChiusura(!chiusura)}>Chiudi cassa</button>
          </div>
          {chiusura && <ChiusuraCassa db={db} uid={uid} titolare={titolare} evento={evento} occupata={!!attesa || righe.length > 0}
            inEmergenza={aperteEmergenza.length} onChiusa={onChiusa} />}
          {!modoVero && <label class="spunta"><input type="checkbox" checked={senzaRete} onChange={(e) => setSenzaRete(e.currentTarget.checked)} /> Prova senza rete (simulatore)</label>}
          {cassa && <InvioSospesoCassa cassa={cassa} occupato={occupato} onEsito={(testo, errore) => setAvviso({ testo, errore })} />}
          <RegistroEmergenza registro={registro} evento={evento.id} occupato={occupato} voceAMano={voceAMano} onEmetti={() => void emettiRegistro()} onRisolvi={risolvi} />
          <ScontriniEvento db={db} evento={evento.id} puoAnnullare={(s) => !!cassa && (cassa.ambiente === 'agenzia' ? s.ambiente === 'agenzia' : cassa.scontrini.some((x) => x.idtrx === s.idtrx && !x.annullato))} occupato={occupato} onAnnulla={(s) => void annulla(s)} onInvia={(s, q) => void invia(s, q)} onStampa={(s, q) => void stampaRicevuta(s, q)} />
          {titolare && <MovimentiEvento db={db} evento={evento.id} />}
          {titolare && <QuadratureEvento db={db} evento={evento} />}
        </div>
      )}
    </section>
  );
}

/** Scontrini dell'evento (tutte le casse): totali al netto degli annulli, annullo, invio. */
function ScontriniEvento({ db, evento, puoAnnullare, occupato, onAnnulla, onInvia, onStampa }: {
  db: Firestore; evento: string; puoAnnullare: (s: ScontrinoArchivio) => boolean; occupato: boolean; onAnnulla: (s: ScontrinoArchivio) => void; onInvia: (s: ScontrinoArchivio, quando: Date) => void;
  onStampa: (s: ScontrinoArchivio, quando: Date) => void;
}) {
  const conStampante = !!stampanteSalvata();
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
          const annullabile = s.tipo === 'V' && !annullato && puoAnnullare(s);
          return (
            <li key={s.id} class={annullato || s.tipo !== 'V' ? 'disattivo' : ''}>
              <div class="nome"><strong>{s.progressivo}</strong> <small>{ora(s)} · {s.cassa}{s.ambiente === 'simulatore' ? ' · simulatore' : ''}</small></div>
              <small class="dettaglio">
                {s.tipo === 'A' ? `Annullo di ${s.progressivoOriginale}` : `${euro(s.totale)} · ${s.pagamento === 'contanti' ? 'contanti' : 'carta'}${s.sumup ? ` (SumUp ${s.sumup})` : ''}${annullato ? ' · annullato' : ''}`}
                {' · '}{s.righe.map((x) => `${x.quantita}× ${x.descrizione}`).join(', ')}
              </small>
              <div class="comandi">
                <button type="button" class="secondario piccolo" onClick={() => onInvia(s, data(s) ?? new Date())}>📤 Invia</button>
                {conStampante && <button type="button" class="secondario piccolo" aria-label={`Stampa ${s.progressivo}`} onClick={() => onStampa(s, data(s) ?? new Date())}>🖨</button>}
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
            <small class="dettaglio">{x.quantita}× {x.descrizione}{x.motivo ? ` · ${x.motivo}` : ''}{x.persona ? ` · ${x.persona}` : ''}</small>
          </li>
        ))}
      </ul>
      {m.caricato && !elenco.length && <p class="nota">Nessun movimento per questo evento.</p>}
    </details>
  );
}

const euroSegno = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${euro(Math.abs(n))}`;

/** Chiusura: conta alla cieca dei contanti e del totale carta; poi la cassa torna all'apertura. */
function ChiusuraCassa({ db, uid, titolare, evento, occupata, inEmergenza, onChiusa }: {
  db: Firestore; uid: string; titolare: boolean; evento: Evento; occupata: boolean; inEmergenza: number; onChiusa: (messaggio: string) => void;
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
    if (inEmergenza) { setErrore(`Prima emetti ${inEmergenza === 1 ? 'la vendita' : `le ${inEmergenza} vendite`} del registro di emergenza (serve la rete).`); return; }
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

/** Registro di emergenza di questo telefono per l'evento: vendite da emettere appena torna la rete. */
function RegistroEmergenza({ registro, evento, occupato, voceAMano, onEmetti, onRisolvi }: {
  registro: Registro; evento: string; occupato: boolean; voceAMano: number | null; onEmetti: () => void; onRisolvi: (numero: number, trovata: boolean) => void;
}) {
  const voci = registro.filter((v) => v.evento === evento);
  const aperte = daEmettere(registro, evento);
  const [copiato, setCopiato] = useState('');
  if (!voci.length) return null;
  async function copia() {
    try { await navigator.clipboard.writeText(testoRegistro(voci)); setCopiato('Copiato.'); } catch { setCopiato('Copia non riuscita.'); }
  }
  const totale = aperte.reduce((t, v) => t + totaleCentesimi(v.righe), 0);
  return (
    <details class={aperte.length ? 'emergenza' : 'scontrini-oggi'} open={aperte.length > 0} aria-label="Registro di emergenza">
      <summary>📒 Registro di emergenza{aperte.length ? ` · ${aperte.length} da emettere · ${euro(totale / 100)}` : ' · tutto emesso'}</summary>
      {aperte.length > 0 && <p class="nota">Vendite fatte senza rete: lo scontrino va emesso appena torna. Non si chiude la cassa finché restano qui.</p>}
      <ul class="persone" aria-label="Voci del registro">
        {[...voci].sort((a, b) => b.numero - a.numero).map((v: VoceEmergenza) => (
          <li key={v.numero} class={v.emesso ? 'disattivo' : ''}>
            <small class="dettaglio">{descriviVoce(v)}</small>
            {voceAMano === v.numero && v.daVerificare && (
              <div class="comandi">
                <button type="button" class="secondario piccolo" onClick={() => onRisolvi(v.numero, true)}>C'è sul portale</button>
                <button type="button" class="secondario piccolo" onClick={() => onRisolvi(v.numero, false)}>Non c'è: emettila</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div class="comandi">
        {aperte.length > 0 && <button type="button" class="primario piccolo" disabled={occupato} onClick={onEmetti}>Emetti ora</button>}
        <button type="button" class="secondario piccolo" onClick={() => void copia()}>Copia registro</button>
        {copiato && <small>{copiato}</small>}
      </div>
    </details>
  );
}

/** Stampante Bluetooth di questo telefono: facoltativa (comande per la cucina e ricevute di cortesia). */
function Stampante() {
  const [nome, setNome] = useState(stampanteSalvata());
  const [stato, setStato] = useState('');
  async function collega() {
    setStato('Cerco le stampanti…');
    try { setNome(await collegaStampante()); setStato(''); } catch (e) { setStato(e instanceof ErroreStampa ? e.message : (e as Error)?.message || 'Collegamento non riuscito.'); }
  }
  async function prova() {
    setStato('Stampo una prova…');
    try {
      await stampa(comandaTermica({ numero: 0, cassa: 'PROVA', ora: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }), righe: [{ quantita: 1, descrizione: 'Stampante pronta' }] }));
      setStato('Prova stampata.');
    } catch (e) { setStato(e instanceof ErroreStampa ? e.message : 'Stampa non riuscita.'); }
  }
  return (
    <div class="campo" role="group" aria-label="Stampante">
      <span>🖨 Stampante Bluetooth (facoltativa): <strong>{nome ?? 'nessuna'}</strong></span>
      <div class="comandi">
        <button type="button" class="secondario piccolo" onClick={() => void collega()}>{nome ? 'Cambia stampante' : 'Collega stampante'}</button>
        {nome && <button type="button" class="secondario piccolo" onClick={() => void prova()}>Prova</button>}
        {nome && <button type="button" class="secondario piccolo" onClick={() => { void dimenticaStampante(); setNome(null); setStato(''); }}>Dimentica</button>}
      </div>
      {stato && <small role="status">{stato}</small>}
    </div>
  );
}

/**
 * Invio rimasto in sospeso (risposta persa durante una vendita, un annullo o un reso) senza una voce nel registro
 * di emergenza: si vede solo quando c'è. «Verifica» chiede all'Agenzia (vendite); annulli e resi si controllano
 * a mano sul portale e poi si chiude il sospeso. Finché resta, nessuno scontrino nuovo parte (anti-doppioni).
 */
function InvioSospesoCassa({ cassa, occupato, onEsito }: { cassa: CassaProva | CassaAgenzia; occupato: boolean; onEsito: (testo: string, errore: boolean) => void }) {
  const [sospeso, setSospeso] = useState<InvioSospeso | null>(null);
  const [conferma, setConferma] = useState(false);
  const [lavoro, setLavoro] = useState(false);
  const rileggi = () => cassa.sospeso().then(setSospeso, () => setSospeso(null));
  useEffect(() => { void rileggi(); }, [cassa, occupato]);
  if (!sospeso) return null;
  const tipo = sospeso.tipo === 'V' ? 'vendita' : sospeso.tipo === 'A' ? 'annullo' : 'reso';
  const quando = new Date(sospeso.creatoIl).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  async function verifica() {
    setLavoro(true);
    try {
      const r = await cassa.verifica();
      if (r) onEsito(`✅ ${tipo} del ${quando} risulta emessa dall'Agenzia (${r.progressivo}). Controlla l'archivio: se manca, è sul portale.`, false);
      else onEsito(`${tipo} del ${quando}: l'Agenzia non l'ha ricevuta. Il sospeso è chiuso: si può riemettere.`, false);
    } catch (e) {
      onEsito(e instanceof InvioInSospeso
        ? `Non verificabile in automatico: cerca ${tipo === 'vendita' ? 'la vendita' : `l'${tipo}${sospeso!.progressivoOriginale ? ` di ${sospeso!.progressivoOriginale}` : ''}`} del ${quando} sul portale Fatture e Corrispettivi, poi usa «Chiudi il sospeso» qui sotto.`
        : messaggio(e), true);
    }
    setLavoro(false);
    await rileggi();
  }
  async function chiudi() {
    setLavoro(true);
    try { await cassa.chiudiAMano(); onEsito(`Sospeso del ${quando} chiuso a mano: se la ${tipo} non c'è sul portale, va rifatta.`, false); } catch (e) { onEsito(messaggio(e), true); }
    setConferma(false);
    setLavoro(false);
    await rileggi();
  }
  return (
    <div class="emergenza sospeso-cassa" role="region" aria-label="Invio in sospeso">
      <strong>⚠ Invio in sospeso</strong>
      <p class="nota">{tipo} del {quando}{sospeso.progressivoOriginale ? ` (originale ${sospeso.progressivoOriginale})` : ''}: la risposta dell'Agenzia si è persa. Finché non si chiarisce, non partono scontrini nuovi.</p>
      <div class="comandi">
        <button type="button" class="secondario" disabled={lavoro || occupato} onClick={() => void verifica()}>Verifica con l'Agenzia</button>
        {!conferma && <button type="button" class="secondario pericolo" disabled={lavoro || occupato} onClick={() => setConferma(true)}>Chiudi il sospeso</button>}
      </div>
      {conferma && (
        <p class="esito errore" role="alert">Hai controllato sul portale? Chiudere senza controllare può far emettere due volte o mai.{' '}
          <button type="button" class="secondario pericolo piccolo" disabled={lavoro} onClick={() => void chiudi()}>Sì, chiudi</button>{' '}
          <button type="button" class="secondario piccolo" onClick={() => setConferma(false)}>No</button></p>
      )}
    </div>
  );
}
