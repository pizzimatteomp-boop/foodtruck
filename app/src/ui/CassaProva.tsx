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
import { cassaforte, ErroreCredenziali } from '../fiscal/cassaforte';
import { archivioInMemoria, archivioSuDispositivo, InvioInSospeso, NonEmesso, type ArchivioInvii, type InvioSospeso } from '../fiscal/emissione';
import { webNativo, type FunzioneHttp } from '../fiscal/nativo';
import { AccessoRifiutato, entraNelPortale, letturaDiProva, PortaleCambiato, scegliMeStesso, Traccia, type EsitoProva } from '../fiscal/portale';
import { CassaProva as Cassa, totaleRighe, type Pagamento, type RigaCassa } from '../fiscal/prova';
import type { Guasto } from '../fiscal/simulatore';
import { RifiutoAgenzia, SessioneScaduta } from '../fiscal/trasporto';
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

async function deposito() {
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
  await SecureStorage.setKeyPrefix('vegman_');
  return cassaforte({ get: (k) => SecureStorage.get(k), set: (k, v) => SecureStorage.set(k, v), remove: (k) => SecureStorage.remove(k) });
}

function spiega(e: unknown): string {
  if (e instanceof InvioInSospeso) return 'C\'è uno scontrino in sospeso: premi «Verifica» prima di emetterne altri.';
  if (e instanceof NonEmesso) return 'Non emesso (non è arrivato all\'Agenzia): si può riprovare.';
  if (e instanceof SessioneScaduta) return 'Sessione scaduta: niente emesso. Nella cassa vera qui si rifà l\'accesso.';
  if (e instanceof RifiutoAgenzia) return e.message;
  return (e as Error)?.message || 'Errore imprevisto.';
}

const BLOCCO = 'vegman-accesso-bloccato';

/** Prova di accesso al portale vero, in sola lettura: nessuno scontrino, nessun download. */
function ProvaAccesso() {
  const [stato, setStato] = useState<'pronto' | 'in corso' | 'fatto'>('pronto');
  const [bloccato, setBloccato] = useState(false);
  const [esito, setEsito] = useState<{ testo: string; errore: boolean; dati?: EsitoProva } | null>(null);
  const [resoconto, setResoconto] = useState('');
  useEffect(() => { void import('@capacitor/preferences').then(({ Preferences }) => Preferences.get({ key: BLOCCO })).then((v) => setBloccato(v.value === '1')); }, []);

  async function prova() {
    if (!confirm('L\'app entra nel portale dell\'Agenzia con le tue credenziali Fisconline e legge soltanto: dati dell\'esercente, adesione e quante fatture hai ricevuto negli ultimi 30 giorni. Nessuno scontrino, nessun download. Procedo?')) return;
    setStato('in corso');
    setEsito(null);
    const { Preferences } = await import('@capacitor/preferences');
    const t = new Traccia(webNativo(CapacitorHttp.request as unknown as FunzioneHttp, navigator.userAgent));
    try {
      const cred = await (await deposito()).leggi();
      if (!cred) throw new Error('Credenziali non trovate.');
      await entraNelPortale(t, cred);
      // Dopo l'accesso si prova tutto, anche se un passo non riesce: il resoconto dice dove.
      const scelta = await scegliMeStesso(t, cred).then(() => true, () => false);
      const dati = await letturaDiProva(t);
      setEsito({ testo: `Accesso riuscito.${scelta ? '' : ' Scelta «Me stesso» non riuscita.'}`, errore: false, dati });
    } catch (e) {
      if (e instanceof AccessoRifiutato) { await Preferences.set({ key: BLOCCO, value: '1' }); setBloccato(true); }
      setEsito({ testo: e instanceof AccessoRifiutato || e instanceof PortaleCambiato ? e.message : `Interrotto: ${(e as Error)?.name ?? 'errore'}.`, errore: true });
    }
    setResoconto(`Prova accesso portale · ${new Date().toLocaleString('it-IT')}\n${t.testo()}`);
    setStato('fatto');
  }

  async function sblocca() {
    if (!confirm('Hai controllato le credenziali sul portale (anche dal computer) e le hai salvate di nuovo qui? Un altro tentativo sbagliato può bloccare l\'utenza Fisconline.')) return;
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key: BLOCCO });
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

      {titolare && (NATIVA ? <Credenziali /> : (
        <section aria-label="Credenziali Fisconline">
          <h2>Credenziali Fisconline</h2>
          <p class="nota">Si inseriscono solo nell'app Android: nel browser non c'è un posto sicuro dove tenerle.</p>
        </section>
      ))}
    </section>
  );
}
