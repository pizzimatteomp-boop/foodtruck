/**
 * «Cassa · prova»: scontrini SOLO sul simulatore dell'Agenzia, per provare sul telefono emissione,
 * annullo e la regola anti-doppioni con guasti a comando. Più la cassaforte delle credenziali Fisconline
 * (solo nell'app Android, solo per il titolare): qui si salvano e si cancellano, non si mostrano mai.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { Firestore } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useRaccolta } from '../dati/useRaccolta.db';
import type { Prodotto } from '../foodcost/modello';
import { ErroreCredenziali } from '../fiscal/cassaforte';
import { archivioInMemoria, archivioSuDispositivo, InvioInSospeso, NonEmesso, type ArchivioInvii, type InvioSospeso } from '../fiscal/emissione';
import { AccessoRifiutato, letturaDiProva, PortaleCambiato, type EsitoProva } from '../fiscal/portale';
import { chiaveSumUp, salvaChiaveSumUp } from './sumupTelefono';
import { accessoBloccato, AccessoNonPossibile, apriSessione, deposito, nuovaTraccia, sbloccaAccesso } from './portaleTelefono';
import { CassaProva as Cassa, totaleRighe, type Pagamento, type RigaCassa } from '../fiscal/prova';
import type { Guasto } from '../fiscal/simulatore';
import { RifiutoAgenzia, SessioneScaduta } from '../fiscal/trasporto';
import { documentoAnnullo, documentoVendita, type Cedente } from '../fiscal/dco';
import { emettiVendita, inviaAnnulloReso, verificaSospeso } from '../fiscal/emissione';
import { BASE_DCO, trasportoNativo, type FunzioneHttp } from '../fiscal/nativo';
import { ServizioDCO } from '../fiscal/servizio';
import { cedenteDaAgenzia, descriviCedente, riconosceUltima, strutturaDati, trasportoRegistrato, VENDITA_DI_PROVA } from '../fiscal/vero';
import { euro } from './formato';

const NATIVA = Capacitor.isNativePlatform();
type Esito = { testo: string; errore: boolean } | null;

const GUASTI: { valore: Guasto | ''; testo: string }[] = [
  { valore: '', testo: 'Nessun guasto' },
  { valore: 'rete-dopo', testo: 'Risposta persa (l\'Agenzia emette, il telefono non lo sa)' },
  { valore: 'rete-prima', testo: 'Rete assente (niente arriva)' },
  { valore: 'sessione', testo: 'Sessione del portale scaduta' },
  { valore: 'errore-500', testo: 'Errore del servizio' },
];

async function archivio(): Promise<ArchivioInvii> {
  if (!NATIVA) return archivioInMemoria();
  const { Preferences } = await import('@capacitor/preferences');
  // Prefisso separato da quello della cassa vera: le prove non toccano mai i suoi invii in sospeso.
  return archivioSuDispositivo(Preferences, 'vegman-dco-simulatore');
}

function spiega(e: unknown): string {
  if (e instanceof InvioInSospeso) return 'C\'è uno scontrino in sospeso: premi «Verifica» prima di emetterne altri.';
  if (e instanceof NonEmesso) return 'Non emesso (non è arrivato all\'Agenzia): si può riprovare.';
  if (e instanceof SessioneScaduta) return 'Sessione scaduta: niente emesso. Nella cassa vera qui si rifà l\'accesso.';
  if (e instanceof RifiutoAgenzia) return e.message;
  return (e as Error)?.message || 'Errore imprevisto.';
}

/** Prova di accesso al portale vero, in sola lettura: nessuno scontrino, nessun download. */
function ProvaAccesso() {
  const [stato, setStato] = useState<'pronto' | 'in corso' | 'fatto'>('pronto');
  const [bloccato, setBloccato] = useState(false);
  const [esito, setEsito] = useState<{ testo: string; errore: boolean; dati?: EsitoProva } | null>(null);
  const [resoconto, setResoconto] = useState('');
  useEffect(() => { void accessoBloccato().then(setBloccato); }, []);

  async function prova() {
    if (!confirm('L\'app entra nel portale dell\'Agenzia con le tue credenziali Fisconline e legge soltanto: dati dell\'esercente, adesione e quante fatture hai ricevuto negli ultimi 30 giorni. Nessuno scontrino, nessun download. Procedo?')) return;
    setStato('in corso');
    setEsito(null);
    const t = nuovaTraccia();
    try {
      // Dopo l'accesso si prova tutto, anche se un passo non riesce: il resoconto dice dove.
      const scelta = await apriSessione(t);
      const dati = await letturaDiProva(t);
      setEsito({ testo: `Accesso riuscito.${scelta ? '' : ' Scelta «Me stesso» non riuscita.'}`, errore: false, dati });
    } catch (e) {
      if (e instanceof AccessoRifiutato) setBloccato(true);
      setEsito({ testo: e instanceof AccessoRifiutato || e instanceof PortaleCambiato || e instanceof AccessoNonPossibile ? e.message : `Interrotto: ${(e as Error)?.name ?? 'errore'}.`, errore: true });
    }
    setResoconto(`Prova accesso portale · ${new Date().toLocaleString('it-IT')}\n${t.testo()}`);
    setStato('fatto');
  }

  async function sblocca() {
    if (!confirm('Hai controllato le credenziali sul portale (anche dal computer) e le hai salvate di nuovo qui? Un altro tentativo sbagliato può bloccare l\'utenza Fisconline.')) return;
    await sbloccaAccesso();
    setBloccato(false);
  }

  return (
    <div class="nuova">
      <h3>Prova accesso al portale</h3>
      {bloccato ? (
        <>
          <p class="nota" role="alert">L'ultimo accesso è stato rifiutato: l'app non riprova da sola. Controlla le credenziali (accedendo dal computer), salvale di nuovo, poi sblocca.</p>
          <button type="button" class="secondario" onClick={() => void sblocca()}>Sblocca</button>
        </>
      ) : (
        <button type="button" class="primario" disabled={stato === 'in corso'} onClick={() => void prova()}>
          {stato === 'in corso' ? 'Accesso in corso…' : 'Prova accesso (solo lettura)'}
        </button>
      )}
      {esito && (
        <p role="status" class={esito.errore ? 'esito errore' : 'esito'}>
          {esito.testo}
          {esito.dati && <> Dati esercente {esito.dati.datiEsercente ? '✅' : '❌'} · adesione {esito.dati.adesione ? '✅' : '❌'} · fatture ultimi 30 giorni: {esito.dati.fattureUltimi30Giorni ?? '❌'}</>}
        </p>
      )}
      {resoconto && (
        <>
          <p class="nota">Resoconto per Claude: contiene solo passi, indirizzi e codici, nessuna credenziale né valore.</p>
          <pre class="resoconto">{resoconto}</pre>
          <button type="button" class="secondario piccolo" onClick={() => void navigator.clipboard.writeText(resoconto).then(() => alert('Copiato.'))}>Copia resoconto</button>
        </>
      )}
    </div>
  );
}

const ULTIMA_VERA = 'vegman-dco-prova-vera';
interface ScontrinoVero { idtrx: string; progressivo: string; quando: string; annullo?: string }

/**
 * Passo 8: vendita di prova VERA col documento commerciale online, e suo annullo.
 * Parte solo se Matteo scrive EMETTI / ANNULLA: è il suo via libera esplicito in quel momento.
 */
function AgenziaVera() {
  const [collegato, setCollegato] = useState<{ servizio: ServizioDCO; cedente: Cedente } | null>(null);
  const [ultimo, setUltimo] = useState<ScontrinoVero | null>(null);
  const [esito, setEsito] = useState<Esito>(null);
  const [occupato, setOccupato] = useState(false);
  const [resoconto, setResoconto] = useState('');
  const registro = useMemo<string[]>(() => [], []);

  useEffect(() => {
    void import('@capacitor/preferences').then(async ({ Preferences }) => {
      const v = (await Preferences.get({ key: ULTIMA_VERA })).value;
      if (v) setUltimo(JSON.parse(v) as ScontrinoVero);
    });
  }, []);

  async function salvaUltimo(x: ScontrinoVero) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: ULTIMA_VERA, value: JSON.stringify(x) });
    setUltimo(x);
  }
  async function archivioVero() {
    const { Preferences } = await import('@capacitor/preferences');
    return archivioSuDispositivo(Preferences, 'vegman-dco');
  }

  async function passo(f: () => Promise<string>) {
    setOccupato(true);
    setEsito(null);
    try { setEsito({ testo: await f(), errore: false }); } catch (e) {
      setEsito({ testo: e instanceof SessioneScaduta ? 'Sessione scaduta: premi di nuovo «Collegati».' : spiega(e), errore: true });
      if (e instanceof SessioneScaduta) setCollegato(null);
    }
    setResoconto(`Agenzia vera · ${new Date().toLocaleString('it-IT')}\n${registro.join('\n')}`);
    setOccupato(false);
  }

  const collega = () => passo(async () => {
    const t = nuovaTraccia();
    await apriSessione(t);
    registro.push(...t.testo().split('\n'));
    const servizio = new ServizioDCO(trasportoRegistrato(trasportoNativo(CapacitorHttp.request as unknown as FunzioneHttp, BASE_DCO, 20000), registro));
    const dati = await servizio.datiFiscali();
    registro.push(`Campi esercente: ${strutturaDati(dati)}`);
    const cedente = cedenteDaAgenzia(dati);
    // Un invio rimasto in sospeso (es. app chiusa a metà) si chiarisce prima di tutto.
    const recuperato = await verificaSospeso(servizio, await archivioVero());
    if (recuperato) await salvaUltimo({ idtrx: recuperato.idtrx, progressivo: recuperato.progressivo, quando: new Date().toISOString() });
    setCollegato({ servizio, cedente });
    return `Collegato. Esercente: ${descriviCedente(cedente)}.${recuperato ? ` Recuperato uno scontrino rimasto in sospeso: ${recuperato.progressivo}.` : ''}`;
  });

  const emetti = () => {
    if (!collegato) return;
    if (prompt('Stai per emettere uno scontrino VERO all\'Agenzia delle Entrate:\nAcqua 1,50 €, IVA 22%, contanti.\n\nScrivi EMETTI per confermare.')?.trim().toUpperCase() !== 'EMETTI') return;
    void passo(async () => {
      const quando = new Date();
      const doc = documentoVendita({ cedente: collegato.cedente, righe: [VENDITA_DI_PROVA], pagamenti: { contanti: 1.5 }, quando });
      const r = await emettiVendita(collegato.servizio, await archivioVero(), doc, quando);
      await salvaUltimo({ idtrx: r.idtrx, progressivo: r.progressivo, quando: quando.toISOString() });
      return `${r.stato === 'recuperato' ? 'Risposta persa ma scontrino trovato' : 'Scontrino emesso'}: ${r.progressivo} (idtrx ${r.idtrx}).`;
    });
  };

  const pdf = () => collegato && ultimo && void passo(async () => `PDF ricevuto: ${(await collegato.servizio.pdf(ultimo.idtrx)).length} byte.`);

  // Passo 9 (solo lettura): la regola anti-doppioni riconosce l'ultima vendita registrata dall'Agenzia?
  const controllaUltima = () => collegato && ultimo && void passo(async () => {
    const grezzo = await collegato.servizio.ultimoGrezzo();
    registro.push(`Forma di «ultimo»: ${strutturaDati(grezzo)}`);
    const u = await collegato.servizio.ultimaVendita();
    const r = riconosceUltima(u, ultimo, collegato.cedente);
    if (!u) return `L'Agenzia non indica un'ultima vendita riconoscibile (risposta: ${strutturaDati(grezzo)}).`;
    return `Ultima vendita per l'Agenzia: ${u.datiTrasmissione?.numeroProgressivo ?? '?'}. ${r.stessa ? 'È la vendita di prova dell\'app' : 'Non è la vendita di prova dell\'app'}; controllo anti-doppioni: ${r.riconosciuta ? 'la riconosce ✅' : 'NON la riconosce ❌'}. Dettaglio: ${r.dettaglio}.`;
  });

  // Passo 9: durata della sessione col portale, controllata ogni 5 minuti in sola lettura.
  const [misura, setMisura] = useState<{ inizio: number; righe: string[]; finita: boolean } | null>(null);
  useEffect(() => {
    if (!misura || misura.finita || !collegato) return undefined;
    let blocco: { release(): Promise<void> } | null = null;
    void (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen').then((b) => { blocco = b; }).catch(() => undefined);
    const id = setInterval(() => {
      const min = Math.round((Date.now() - misura.inizio) / 60000);
      void collegato.servizio.datiFiscali().then(
        () => setMisura((m) => m && { ...m, righe: [...m.righe, `${min} min: sessione valida`] }),
        (e: unknown) => {
          const scaduta = e instanceof SessioneScaduta;
          setMisura((m) => m && { ...m, finita: scaduta, righe: [...m.righe, `${min} min: ${scaduta ? 'SESSIONE SCADUTA' : `errore (${(e as Error)?.name ?? '?'}), riprovo`}`] });
          if (scaduta) setResoconto(`Agenzia vera · ${new Date().toLocaleString('it-IT')}\n${registro.join('\n')}`);
        },
      );
    }, 5 * 60000);
    return () => { clearInterval(id); void blocco?.release().catch(() => undefined); };
  }, [misura?.finita, collegato, misura?.inizio]);

  const annulla = () => {
    if (!collegato || !ultimo || ultimo.annullo) return;
    if (prompt(`Stai per ANNULLARE davvero lo scontrino ${ultimo.progressivo}.\n\nScrivi ANNULLA per confermare.`)?.trim().toUpperCase() !== 'ANNULLA') return;
    void passo(async () => {
      const originale = await collegato.servizio.documento(ultimo.idtrx);
      const quando = new Date();
      const r = await inviaAnnulloReso(collegato.servizio, await archivioVero(), documentoAnnullo({ cedente: collegato.cedente, originale, quando }), quando);
      await salvaUltimo({ ...ultimo, annullo: r.progressivo });
      return `Annullato con ${r.progressivo}.`;
    });
  };

  const testoResoconto = misura ? `${resoconto}\nDurata sessione (inizio ${new Date(misura.inizio).toLocaleTimeString('it-IT')}):\n${misura.righe.join('\n')}` : resoconto;

  return (
    <section aria-label="Agenzia vera">
      <h2>Agenzia vera (passo 8)</h2>
      <p class="simulatore" role="note" style="background: var(--lampone); color: #fff"><strong>ATTENZIONE · SCONTRINI VERI</strong>: qui l'app parla con l'Agenzia delle Entrate. Ogni scontrino è fiscale e definitivo (si può solo annullare).</p>
      {!collegato ? (
        <button type="button" class="primario" disabled={occupato} onClick={() => void collega()}>{occupato ? 'Collegamento…' : 'Collegati (solo lettura)'}</button>
      ) : (
        <div class="nuova">
          <p>Vendita di prova: <strong>Acqua · 1,50 € · IVA 22% · contanti</strong></p>
          <button type="button" class="primario" style="background: var(--lampone)" disabled={occupato} onClick={emetti}>Emetti scontrino VERO (1,50 €)</button>
        </div>
      )}
      {ultimo && (
        <div class="nuova">
          <p>Ultimo scontrino vero: <strong>{ultimo.progressivo}</strong> · {new Date(ultimo.quando).toLocaleString('it-IT')}{ultimo.annullo ? ` · annullato con ${ultimo.annullo}` : ''}</p>
          {collegato && (
            <div class="comandi">
              <button type="button" class="secondario piccolo" disabled={occupato} onClick={pdf}>Verifica PDF</button>
              <button type="button" class="secondario piccolo" disabled={occupato} onClick={controllaUltima}>Ultima vendita (anti-doppioni)</button>
              {!ultimo.annullo && <button type="button" class="secondario pericolo piccolo" disabled={occupato} onClick={annulla}>Annulla questo scontrino (VERO)</button>}
            </div>
          )}
        </div>
      )}
      <p role="status" class={esito?.errore ? 'esito errore' : 'esito'}>{esito?.testo ?? ''}</p>
      {collegato && (
        <div class="nuova">
          <h3>Durata della sessione (passo 9)</h3>
          <p class="nota">Solo lettura: ogni 5 minuti l'app controlla se il portale la riconosce ancora. Tieni l'app aperta in primo piano (lo schermo resta acceso).</p>
          {!misura ? <button type="button" class="secondario" onClick={() => setMisura({ inizio: Date.now(), righe: [], finita: false })}>Misura durata sessione</button>
            : <>
              <pre class="resoconto">{[`Inizio: ${new Date(misura.inizio).toLocaleTimeString('it-IT')}`, ...misura.righe, misura.finita ? 'Misura finita.' : 'In corso…'].join('\n')}</pre>
              {!misura.finita && <button type="button" class="secondario piccolo" onClick={() => setMisura({ ...misura, finita: true, righe: [...misura.righe, 'Fermata a mano.'] })}>Ferma</button>}
            </>}
        </div>
      )}
      {resoconto && (
        <details>
          <summary>Resoconto tecnico (per Claude)</summary>
          <pre class="resoconto">{testoResoconto}</pre>
          <button type="button" class="secondario piccolo" onClick={() => void navigator.clipboard.writeText(testoResoconto).then(() => alert('Copiato.'))}>Copia resoconto</button>
        </details>
      )}
    </section>
  );
}

/** Chiave SumUp (affiliate key) di questo telefono: con la chiave, ELET in cassa apre l'app SumUp. */
function ChiaveSumUp() {
  const [chiave, setChiave] = useState<string | null | undefined>(undefined);
  const [nuova, setNuova] = useState('');
  useEffect(() => { void chiaveSumUp().then(setChiave); }, []);
  if (chiave === undefined) return null;
  return (
    <section aria-label="SumUp">
      <h2>Pagamento con carta (SumUp)</h2>
      <p class="nota">Con la chiave SumUp («affiliate key» legata a it.vegman.app), in Cassa il tasto ELET apre l'app SumUp con l'importo e al ritorno emette lo scontrino.</p>
      {chiave ? (
        <div class="comandi">
          <p>✅ Chiave impostata (…{chiave.slice(-4)})</p>
          <button type="button" class="secondario pericolo piccolo" onClick={() => void salvaChiaveSumUp(null).then(() => setChiave(null))}>Togli</button>
        </div>
      ) : (
        <div class="nuova">
          <input aria-label="Chiave SumUp" placeholder="Affiliate key SumUp" autocomplete="off" spellcheck={false} value={nuova} onInput={(e) => setNuova(e.currentTarget.value)} />
          <button type="button" class="primario" disabled={!nuova.trim()} onClick={() => void salvaChiaveSumUp(nuova).then(() => { setChiave(nuova.trim()); setNuova(''); })}>Salva chiave</button>
        </div>
      )}
    </section>
  );
}

function Credenziali() {
  const [presenti, setPresenti] = useState<boolean | null>(null);
  const [modulo, setModulo] = useState({ codiceFiscale: '', password: '', pin: '' });
  const [esito, setEsito] = useState<Esito>(null);
  useEffect(() => { void deposito().then((c) => c.presenti()).then(setPresenti).catch(() => setPresenti(false)); }, []);

  async function salva(ev: Event) {
    ev.preventDefault();
    try {
      await (await deposito()).salva(modulo);
      setModulo({ codiceFiscale: '', password: '', pin: '' });
      setPresenti(true);
      setEsito({ testo: 'Salvate e cifrate nel telefono.', errore: false });
    } catch (e) {
      setEsito({ testo: e instanceof ErroreCredenziali ? e.message : 'Salvataggio non riuscito.', errore: true });
    }
  }
  async function cancella() {
    if (!confirm('Cancellare le credenziali Fisconline da questo telefono?')) return;
    await (await deposito()).cancella();
    setPresenti(false);
    setEsito({ testo: 'Cancellate.', errore: false });
  }

  return (
    <section aria-label="Credenziali Fisconline">
      <h2>Credenziali Fisconline</h2>
      <p class="nota">Restano solo su questo telefono, cifrate (Keystore di Android). Non vanno nel database né su internet; servono all'app per entrare nel portale dell'Agenzia. Le usa solo la «Prova accesso», quando la premi tu.</p>
      {presenti === null ? <p class="nota">Controllo…</p> : presenti ? (
        <>
          <div class="comandi">
            <p>✅ Salvate su questo telefono.</p>
            <button type="button" class="secondario pericolo piccolo" onClick={() => void cancella()}>Cancella</button>
          </div>
          <ProvaAccesso />
          <AgenziaVera />
        </>
      ) : (
        <form class="nuova" onSubmit={salva} autocomplete="off">
          <input aria-label="Codice fiscale" placeholder="Codice fiscale" autocomplete="off" autocapitalize="characters" spellcheck={false}
            value={modulo.codiceFiscale} onInput={(e) => setModulo({ ...modulo, codiceFiscale: e.currentTarget.value })} />
          <input aria-label="Password Fisconline" placeholder="Password" type="password" autocomplete="off"
            value={modulo.password} onInput={(e) => setModulo({ ...modulo, password: e.currentTarget.value })} />
          <input aria-label="PIN Fisconline" placeholder="PIN completo (10 cifre)" type="password" inputMode="numeric" autocomplete="off"
            value={modulo.pin} onInput={(e) => setModulo({ ...modulo, pin: e.currentTarget.value })} />
          <button type="submit" class="primario">Salva nel telefono</button>
        </form>
      )}
      <p role="status" class={esito?.errore ? 'esito errore' : 'esito'}>{esito?.testo ?? ''}</p>
    </section>
  );
}

export function CassaProva({ db, titolare }: { db: Firestore; titolare: boolean }) {
  const pro = useRaccolta<Prodotto>(db, 'prodotti');
  const [cassa, setCassa] = useState<Cassa | null>(null);
  const [carrello, setCarrello] = useState<RigaCassa[]>([]);
  const [pagamento, setPagamento] = useState<Pagamento>('contanti');
  const [guasto, setGuasto] = useState<Guasto | ''>('');
  const [esito, setEsito] = useState<Esito>(null);
  const [sospeso, setSospeso] = useState<InvioSospeso | null>(null);
  const [, aggiorna] = useState(0);
  const [occupato, setOccupato] = useState(false);

  useEffect(() => { void archivio().then((a) => { const c = new Cassa(a, () => new Date()); setCassa(c); return c.sospeso(); }).then(setSospeso); }, []);

  const vendibili = useMemo(() => pro.dati.filter((p) => p.tipo === 'vendibile' && p.prezzo > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it')), [pro.dati]);

  function aggiungi(p: Prodotto) {
    const i = carrello.findIndex((r) => r.descrizione === p.nome);
    if (i >= 0) setCarrello(carrello.map((r, k) => (k === i ? { ...r, quantita: r.quantita + 1 } : r)));
    else setCarrello([...carrello, { descrizione: p.nome, quantita: 1, prezzo: p.prezzo, aliquota: p.iva ?? '10' }]);
  }

  async function esegui(f: (c: Cassa) => Promise<string>) {
    if (!cassa || occupato) return;
    setOccupato(true);
    try { setEsito({ testo: await f(cassa), errore: false }); } catch (e) { setEsito({ testo: spiega(e), errore: true }); }
    setSospeso(await cassa.sospeso());
    setGuasto('');
    setOccupato(false);
    aggiorna((n) => n + 1);
  }

  const totale = totaleRighe(carrello);

  return (
    <section class="scheda" aria-label="Cassa di prova">
      <h1>Cassa · prova</h1>
      <p class="simulatore" role="note"><strong>SIMULATORE</strong> · nessuno scontrino vero: l'Agenzia delle Entrate non viene contattata.</p>

      {sospeso && (
        <div class="simulatore" role="alert">
          <p>⏳ Invio in sospeso ({sospeso.tipo === 'V' ? 'vendita' : 'annullo'}): non si sa se è stato emesso. Finché non si chiarisce, nessuno scontrino nuovo parte.</p>
          <div class="comandi">
            <button type="button" class="primario piccolo" disabled={occupato} onClick={() => void esegui(async (c) => {
              const r = await c.verifica();
              return r ? `Era stato emesso: recuperato ${r.progressivo}.` : 'Non era stato emesso: si può riprovare.';
            })}>Verifica</button>
            {sospeso.tipo !== 'V' && (
              <button type="button" class="secondario piccolo" disabled={occupato} onClick={() => void esegui(async (c) => {
                await c.chiudiAMano();
                return 'Chiuso a mano (nella cassa vera: dopo aver controllato sul portale).';
              })}>Controllato sul portale</button>
            )}
          </div>
        </div>
      )}

      <h2>Prodotti</h2>
      {!pro.caricato ? <p class="nota">Carico…</p> : vendibili.length === 0 ? <p class="nota">Nessun prodotto con prezzo.</p> : (
        <div class="comandi">
          {vendibili.map((p) => (
            <button key={p.id} type="button" class="secondario piccolo" onClick={() => aggiungi(p)}>{p.nome} · {euro(p.prezzo)}</button>
          ))}
        </div>
      )}

      <h2>Scontrino</h2>
      {carrello.length === 0 ? <p class="nota">Tocca i prodotti per aggiungerli.</p> : (
        <ul class="persone">
          {carrello.map((r, k) => (
            <li key={r.descrizione}>
              <div class="nome"><strong>{r.quantita} × {r.descrizione}</strong> <small>{euro(r.quantita * r.prezzo)} · IVA {r.aliquota}%</small></div>
              <div class="comandi">
                <button type="button" class="secondario piccolo" aria-label={`Togli un ${r.descrizione}`}
                  onClick={() => setCarrello(carrello.flatMap((x, i) => (i !== k ? [x] : x.quantita > 1 ? [{ ...x, quantita: x.quantita - 1 }] : [])))}>−1</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p class="prezzo-grande">Totale {euro(totale)}</p>
      <div class="due">
        <select aria-label="Pagamento" value={pagamento} onChange={(e) => setPagamento(e.currentTarget.value as Pagamento)}>
          <option value="contanti">Contanti</option>
          <option value="elettronico">Carta / POS</option>
        </select>
        <select aria-label="Guasto da simulare" value={guasto} onChange={(e) => setGuasto(e.currentTarget.value as Guasto | '')}>
          {GUASTI.map((g) => <option key={g.valore} value={g.valore}>{g.testo}</option>)}
        </select>
      </div>
      <button type="button" class="primario" disabled={!carrello.length || occupato || !cassa} onClick={() => void esegui(async (c) => {
        const r = await c.vendi(carrello, pagamento, guasto || undefined);
        setCarrello([]);
        return r.stato === 'recuperato' ? `Risposta persa, ma lo scontrino c'è: recuperato ${r.progressivo} (nessun doppione).` : `Emesso ${r.progressivo}.`;
      })}>Emetti scontrino di prova</button>
      <p role="status" class={esito?.errore ? 'esito errore' : 'esito'}>{esito?.testo ?? ''}</p>

      <h2>Emessi in questa prova <small>({cassa?.scontrini.length ?? 0})</small></h2>
      <ul class="persone">
        {cassa?.scontrini.map((s) => (
          <li key={s.idtrx} class={s.annullato ? 'disattivo' : ''}>
            <div class="nome"><strong>{s.progressivo}</strong> <small>{euro(s.totale)}{s.recuperato ? ' · recuperato' : ''}{s.annullato ? ' · annullato' : ''}</small></div>
            {!s.annullato && (
              <div class="comandi">
                <button type="button" class="secondario piccolo" disabled={occupato} onClick={() => void esegui(async (c) => {
                  const r = await c.annulla(s.idtrx, guasto || undefined);
                  return `Annullato con ${r.progressivo}.`;
                })}>Annulla</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p class="nota">Il simulatore riparte da zero ogni volta che apri la pagina; l'eventuale invio in sospeso invece resta salvato nel telefono, come nella cassa vera.</p>

      {titolare && NATIVA && <ChiaveSumUp />}
      {titolare && (NATIVA ? <Credenziali /> : (
        <section aria-label="Credenziali Fisconline">
          <h2>Credenziali Fisconline</h2>
          <p class="nota">Si inseriscono solo nell'app Android: nel browser non c'è un posto sicuro dove tenerle.</p>
        </section>
      ))}
    </section>
  );
}
