/**
 * Le chiamate al documento commerciale online (vedi CLAUDE.md, «Documento commerciale online»),
 * con gli errori classificati: rete, sessione scaduta, rifiuto dell'Agenzia, errore del servizio.
 */
import { leggiEsito, type DocumentoLetto } from './dco';
import { ErroreServizio, RifiutoAgenzia, SessioneScaduta, type Richiesta, type Risposta, type Trasporto } from './trasporto';

/** Il portale, se la sessione è scaduta, risponde con la pagina di accesso (HTML) o con 401/403. */
export function eSessioneScaduta(r: Risposta): boolean {
  return r.stato === 401 || r.stato === 403 || /\/sam\/UI\/Login/i.test(r.urlFinale ?? '')
    || (r.stato === 200 && /text\/html/i.test(r.tipo));
}

export class ServizioDCO {
  constructor(private readonly t: Trasporto) {}

  private async chiama(r: Richiesta): Promise<Risposta> {
    const x = await this.t.invia(r);
    if (eSessioneScaduta(x)) throw new SessioneScaduta();
    if (x.stato >= 400 || x.stato === 0) throw new ErroreServizio(x.stato);
    return x;
  }

  async datiFiscali(): Promise<unknown> {
    return (await this.chiama({ metodo: 'GET', percorso: 'doc/documenti/dati/fiscali' })).corpo;
  }

  /** Invia vendita, annullo o reso. Esito negativo → RifiutoAgenzia (niente emesso). */
  async invia(documento: unknown): Promise<{ idtrx: string; progressivo: string }> {
    const e = leggiEsito((await this.chiama({ metodo: 'POST', percorso: 'doc/documenti/', corpo: documento })).corpo);
    if (!e.ok) throw new RifiutoAgenzia(e.errori);
    return { idtrx: e.idtrx, progressivo: e.progressivo };
  }

  async documento(idtrx: string): Promise<DocumentoLetto> {
    return (await this.chiama({ metodo: 'GET', percorso: `doc/documenti/${encodeURIComponent(idtrx)}/` })).corpo as DocumentoLetto;
  }

  /** Ultima vendita confermata (null se non ce n'è nessuna). */
  async ultimaVendita(): Promise<DocumentoLetto | null> {
    const c = (await this.chiama({ metodo: 'GET', percorso: 'doc/documenti/ultimo/' })).corpo as DocumentoLetto | null;
    return c && typeof c === 'object' && 'idtrx' in c ? c : null;
  }

  async pdf(idtrx: string): Promise<Uint8Array> {
    const c = (await this.chiama({ metodo: 'GET', percorso: `doc/documenti/${encodeURIComponent(idtrx)}/stampa/?regalo=false` })).corpo;
    if (!(c instanceof Uint8Array)) throw new ErroreServizio(200);
    return c;
  }
}
