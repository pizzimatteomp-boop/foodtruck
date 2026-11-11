/**
 * Cassa collegata all'Agenzia vera (fase «Cassa», C5): stesso motore anti-doppioni del simulatore
 * (emissione.ts), esercente letto dall'Agenzia, nuovo accesso automatico quando la sessione scade.
 * Gli scontrini veri partono solo dopo che il titolare ha attivato «Agenzia vera» all'apertura della cassa.
 */
import { documentoAnnullo, documentoVendita, type Cedente } from './dco';
import { chiudiSospesoAMano, emettiVendita, inviaAnnulloReso, verificaSospeso, type ArchivioInvii, type EsitoEmissione } from './emissione';
import type { RigaCassa } from './prova';
import { eSessioneScaduta, ServizioDCO } from './servizio';
import { SessioneScaduta, type Richiesta, type Risposta, type Trasporto } from './trasporto';
import { cedenteDaAgenzia } from './vero';

/**
 * Se il portale dice «sessione scaduta», la richiesta NON è stata eseguita: si rifà l'accesso e la si
 * ripete una volta sola. Più richieste insieme aspettano lo stesso accesso. Se scade di nuovo, l'errore
 * arriva a chi chiama (SessioneScaduta: niente emesso).
 */
/** Il nuovo accesso non è riuscito: è comunque una sessione scaduta (la richiesta non è partita, niente emesso). */
export class RiaccessoNonRiuscito extends SessioneScaduta {
  override name = 'RiaccessoNonRiuscito';
  constructor(readonly causa: unknown) {
    super();
    this.message = `Sessione scaduta e nuovo accesso non riuscito: ${(causa as Error)?.message ?? 'errore'}. Niente emesso.`;
  }
}

export function conRiaccesso(t: Trasporto, riaccedi: () => Promise<void>): Trasporto & { riaccessi: () => number } {
  let inCorso: Promise<void> | null = null;
  let quanti = 0;
  return {
    riaccessi: () => quanti,
    async invia(r: Richiesta): Promise<Risposta> {
      const x = await t.invia(r);
      if (!eSessioneScaduta(x)) return x;
      if (!inCorso) {
        quanti++;
        inCorso = riaccedi().finally(() => { inCorso = null; });
      }
      try { await inCorso; } catch (e) { throw new RiaccessoNonRiuscito(e); }
      return t.invia(r);
    },
  };
}

export class CassaAgenzia {
  readonly ambiente = 'agenzia' as const;

  constructor(
    private readonly servizio: ServizioDCO,
    private readonly archivio: ArchivioInvii,
    readonly cedente: Cedente,
    private readonly adesso: () => Date = () => new Date(),
  ) {}

  vendi(righe: RigaCassa[], pagamento: 'contanti' | 'elettronico'): Promise<EsitoEmissione> {
    const totale = Math.round(righe.reduce((t, r) => t + r.quantita * r.prezzo * 100, 0)) / 100;
    const doc = documentoVendita({
      cedente: this.cedente,
      righe: righe.map((r) => ({ descrizione: r.descrizione, quantita: r.quantita, prezzoLordo: r.prezzo, aliquotaIVA: r.aliquota })),
      pagamenti: pagamento === 'contanti' ? { contanti: totale } : { elettronico: totale },
      quando: this.adesso(),
    });
    return emettiVendita(this.servizio, this.archivio, doc, this.adesso());
  }

  /** Annullo totale: il documento originale si rilegge dall'Agenzia (vale per ogni scontrino vero, anche di altri giorni). */
  async annulla(idtrx: string): Promise<EsitoEmissione> {
    const originale = await this.servizio.documento(idtrx);
    return inviaAnnulloReso(this.servizio, this.archivio, documentoAnnullo({ cedente: this.cedente, originale, quando: this.adesso() }), this.adesso());
  }

  verifica(): Promise<EsitoEmissione | null> { return verificaSospeso(this.servizio, this.archivio); }
  sospeso() { return this.archivio.sospeso(); }
  chiudiAMano() { return chiudiSospesoAMano(this.archivio); }
  /** PDF del documento commerciale (da allegare a WhatsApp/email). */
  pdf(idtrx: string): Promise<Uint8Array> { return this.servizio.pdf(idtrx); }
  /** Una lettura leggera per tenere viva la sessione (e rifare l'accesso se è scaduta). */
  async mantieniViva(): Promise<void> { await this.servizio.datiFiscali(); }
}

/** Collegamento: legge i dati dell'esercente (con nazione IT) e prepara la cassa. */
export async function collegaAgenzia(t: Trasporto, archivio: ArchivioInvii, adesso?: () => Date): Promise<CassaAgenzia> {
  const servizio = new ServizioDCO(t);
  const cedente = cedenteDaAgenzia(await servizio.datiFiscali());
  return new CassaAgenzia(servizio, archivio, cedente, adesso);
}
