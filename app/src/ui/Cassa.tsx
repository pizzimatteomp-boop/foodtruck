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
import { registraScontrino, useScontriniDelGiorno } from '../cassa/archivio.db';
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
function leggiNomeCassa(): string {
  try { return nomeCassa(localStorage.getItem(NOME_CASSA)); } catch { return nomeCassa(null); }
}

export function Cassa({ db, uid }: { db: Firestore; uid: string }) {
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

  useEffect(() => { void archivio().then((a) => setCassa(new CassaProva(a, () => new Date()))); }, []);

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
      await archivia(scontrinoVendita({ idtrx: r.idtrx, progressivo: r.progressivo, righe: p.righe, pagamento: 'elettronico', ambiente: 'simulatore', cassa: leggiNomeCassa(), giorno: oggi(), ...(codice ? { sumup: codice } : {}) }));
      await chiudiPagamento();
      setAttesa(null);
      setEsitoSumUp(null);
      setAvviso({ testo: `✅ ${r.progressivo} · ${euro(p.centesimi / 100)} · carta${codice ? ` (SumUp ${codice})` : ''}`, errore: false });
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

  /** Registra lo scontrino nell'archivio; se non riesce lo dice, ma lo scontrino resta emesso. */
  async function archivia(s: ScontrinoArchivio) {
    setUltimo(s);
    try { await registraScontrino(db, uid, s); } catch { setAvviso({ testo: `Scontrino ${s.progressivo} emesso ma non registrato nell'archivio: segnalalo al titolare.`, errore: true }); }
  }

  async function annulla(s: ScontrinoArchivio) {
    if (!cassa || occupato) return;
    if (!confirm(`Annullare lo scontrino ${s.progressivo} di ${euro(s.totale)}?`)) return;
    setOccupato(true);
    try {
      const r = await cassa.annulla(s.idtrx);
      await archivia(scontrinoAnnullo(s, { idtrx: r.idtrx, progressivo: r.progressivo, cassa: leggiNomeCassa(), giorno: oggi() }));
      setAvviso({ testo: `Annullato ${s.progressivo} con ${r.progressivo}.`, errore: false });
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

  async function paga(pagamento: Pagamento) {
    if (!cassa || occupato) return;
    let daEmettere = righe;
    // Come Billy: importo digitato senza righe → si emette direttamente come riga libera.
    if (!daEmettere.length && centesimiDa(t.testo)) {
      try { daEmettere = aggiungiLibera([], t, descrizione, iva); } catch (e) { setAvviso({ testo: messaggio(e), errore: true }); return; }
    }
    if (!daEmettere.length) { setAvviso({ testo: 'Lo scontrino è vuoto.', errore: true }); return; }
    if (attesa) { setAvviso({ testo: 'C\'è un pagamento con carta in corso: chiudilo prima.', errore: true }); return; }
    if (pagamento === 'elettronico' && NATIVA && conSumUp) { await avviaSumUp(daEmettere); return; }
    setOccupato(true);
    const totale = totaleCentesimi(daEmettere);
    try {
      const r = await cassa.vendi(righePerScontrino(daEmettere), pagamento);
      await archivia(scontrinoVendita({ idtrx: r.idtrx, progressivo: r.progressivo, righe: daEmettere, pagamento, ambiente: 'simulatore', cassa: leggiNomeCassa(), giorno: oggi() }));
      setRighe([]);
      setT(TASTIERINO_VUOTO);
      setDescrizione('');
      setAvviso({ testo: `✅ ${r.progressivo} · ${euro(totale / 100)} · ${pagamento === 'contanti' ? 'contanti' : 'elettronico'}${r.stato === 'recuperato' ? ' (recuperato)' : ''}`, errore: false });
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
      </div>

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
      <ScontriniDiOggi db={db} cassa={cassa} occupato={occupato} onAnnulla={(s) => void annulla(s)} onInvia={(s, q) => void invia(s, q)} />
    </section>
  );
}

/** Scontrini di oggi (tutte le casse): totali al netto degli annulli, annullo, nome di questa cassa. */
function ScontriniDiOggi({ db, cassa, occupato, onAnnulla, onInvia }: {
  db: Firestore; cassa: CassaProva | null; occupato: boolean; onAnnulla: (s: ScontrinoArchivio) => void; onInvia: (s: ScontrinoArchivio, quando: Date) => void;
}) {
  const giorno = oggi();
  const sc = useScontriniDelGiorno(db, giorno);
  const [nome, setNome] = useState(leggiNomeCassa());
  const r = riepilogo(sc.dati);
  const data = (x: unknown) => (x as { creatoIl?: { toDate?: () => Date } }).creatoIl?.toDate?.();
  const ora = (x: unknown) => { const t = data(x); return t ? t.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '…'; };
  const elenco = [...sc.dati].sort((a, b) => b.id.localeCompare(a.id));
  return (
    <details class="scontrini-oggi">
      <summary>Scontrini di oggi · {r.vendite} · {euro(r.totale)}</summary>
      <p class="nota">Contanti {euro(r.contanti)} · Carta {euro(r.elettronico)}{r.annullati ? ` · ${r.annullati} annullati` : ''}</p>
      <label class="campo"><span>Nome di questa cassa</span>
        <input value={nome} maxLength={30} onInput={(e) => setNome(e.currentTarget.value)}
          onBlur={() => { const n = nomeCassa(nome); setNome(n); try { localStorage.setItem(NOME_CASSA, n); } catch { /* solo comodità */ } }} />
      </label>
      <ul class="persone" aria-label="Scontrini di oggi">
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
      {sc.caricato && !elenco.length && <p class="nota">Nessuno scontrino oggi.</p>}
    </details>
  );
}

