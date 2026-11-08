/**
 * Passo 8 della fase 0: vendita di prova VERA (e suo annullo) col documento commerciale online.
 * Si usa solo col via libera esplicito di Matteo (vedi CLAUDE.md, «Regole di sicurezza»).
 */
import { documentoVendita, type Cedente, type DocumentoLetto, type Riga } from './dco';
import { corrisponde, improntaDocumento } from './emissione';
import { senzaParametri } from './portale';
import type { Richiesta, Risposta, Trasporto } from './trasporto';

/** La stessa vendita della prova manuale del 6/11/2026. */
export const VENDITA_DI_PROVA: Riga = { descrizione: 'Acqua', quantita: 1, prezzoLordo: 1.5, aliquotaIVA: '22' };

export class DatiEsercenteIncompleti extends Error {
  override name = 'DatiEsercenteIncompleti';
}

const testo = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** Dai dati dell'esercente restituiti dall'Agenzia (GET dati/fiscali) al Cedente dello scontrino; nazione IT se manca. */
export function cedenteDaAgenzia(dati: unknown): Cedente {
  const d = (dati ?? {}) as { identificativiFiscali?: Record<string, unknown>; altriDatiIdentificativi?: Record<string, unknown> };
  const id = d.identificativiFiscali ?? {};
  const a = d.altriDatiIdentificativi ?? {};
  const c: Cedente = {
    partitaIva: testo(id.partitaIva), codiceFiscale: testo(id.codiceFiscale),
    indirizzo: testo(a.indirizzo), cap: testo(a.cap), comune: testo(a.comune), provincia: testo(a.provincia),
    nazione: testo(a.nazione) || 'IT',
  };
  if (testo(a.numeroCivico)) c.numeroCivico = testo(a.numeroCivico);
  if (testo(a.denominazione)) c.denominazione = testo(a.denominazione);
  else { c.nome = testo(a.nome); c.cognome = testo(a.cognome); }
  const mancano: string[] = (['partitaIva', 'codiceFiscale', 'indirizzo', 'cap', 'comune', 'provincia'] as const).filter((k) => !c[k]);
  if (!c.denominazione && !c.cognome) mancano.push('denominazione o cognome');
  if (mancano.length) throw new DatiEsercenteIncompleti(`Dati dell'esercente incompleti: manca ${mancano.join(', ')}. Campi ricevuti: ${strutturaDati(dati)}`);
  return c;
}

/** Nomi dei campi (mai i valori) dei dati dell'esercente, per il resoconto. */
export function strutturaDati(dati: unknown): string {
  const nomi = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.length}${v.length ? ` × ${nomi(v[0])}` : ''}]`;
    if (v && typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => (x && typeof x === 'object' ? `${k}${nomi(x)}` : k)).join(', ')}}`;
    return '';
  };
  return nomi(dati) || typeof dati;
}

/** Riassunto per lo schermo (dati dell'esercente, pubblici sullo scontrino). */
export function descriviCedente(c: Cedente): string {
  const nome = c.denominazione || `${c.nome ?? ''} ${c.cognome ?? ''}`.trim();
  return `${nome} · P.IVA ${c.partitaIva} · ${c.indirizzo}${c.numeroCivico ? ` ${c.numeroCivico}` : ''}, ${c.cap} ${c.comune} (${c.provincia}) ${c.nazione}`;
}

/** Trasporto che annota ogni chiamata (percorso, codice, tipo; mai i contenuti) per il resoconto. */
export function trasportoRegistrato(t: Trasporto, registro: string[]): Trasporto {
  return {
    async invia(r: Richiesta): Promise<Risposta> {
      const dove = `${r.metodo} ${senzaParametri(`https://x/${r.percorso}`).slice(2)}`;
      try {
        const x = await t.invia(r);
        registro.push(`${dove} → ${x.stato} [${x.tipo.split(';')[0]}]${x.urlFinale && /Login/i.test(x.urlFinale) ? ' → pagina di accesso' : ''}`);
        return x;
      } catch (e) {
        registro.push(`${dove} → rete (${(e as Error)?.message?.slice(0, 120) ?? ''})`);
        throw e;
      }
    },
  };
}

/**
 * Passo 9: la regola anti-doppioni riconosce davvero l'ultima vendita registrata dall'Agenzia?
 * Si confronta «ultima vendita» (GET ultimo) con la vendita di prova emessa dall'app.
 */
export function riconosceUltima(ultima: DocumentoLetto | null, salvata: { idtrx: string; quando: string }, cedente: Cedente) {
  if (!ultima) return { stessa: false, riconosciuta: false };
  const doc = documentoVendita({ cedente, righe: [VENDITA_DI_PROVA], pagamenti: { contanti: 1.5 }, quando: new Date(salvata.quando) });
  return { stessa: ultima.idtrx === salvata.idtrx, riconosciuta: corrisponde(ultima, improntaDocumento(doc)) };
}
