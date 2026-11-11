/**
 * Cassa di prova: scontrini SOLO sul simulatore dell'Agenzia (nessuno scontrino vero).
 * Usa lo stesso motore dell'emissione vera (emissione.ts), così sul telefono si prova davvero
 * la regola anti-doppioni, con guasti a comando.
 */
import { documentoAnnullo, documentoVendita, type Aliquota, type Cedente } from './dco';
import { emettiVendita, inviaAnnulloReso, verificaSospeso, chiudiSospesoAMano, type ArchivioInvii, type EsitoEmissione } from './emissione';
import { ServizioDCO } from './servizio';
import { SimulatoreAgenzia, type Guasto } from './simulatore';

/** Esercente inventato: il simulatore non deve mai vedere dati veri. */
export const CEDENTE_SIMULATO: Cedente = {
  partitaIva: '00000000000', codiceFiscale: '00000000000', denominazione: 'SIMULATORE VEGMAN',
  indirizzo: 'VIA DELLE PROVE', numeroCivico: '1', cap: '00000', comune: 'PROVA', provincia: 'XX', nazione: 'IT',
};

export interface RigaCassa { descrizione: string; quantita: number; prezzo: number; aliquota: Aliquota }
export type Pagamento = 'contanti' | 'elettronico';

export interface ScontrinoProva {
  idtrx: string;
  progressivo: string;
  totale: number;
  recuperato: boolean;
  annullato: boolean;
}

export function totaleRighe(righe: RigaCassa[]): number {
  return Math.round(righe.reduce((t, r) => t + r.quantita * r.prezzo * 100, 0)) / 100;
}

export class CassaProva {
  readonly simulatore = new SimulatoreAgenzia();
  private readonly servizio = new ServizioDCO(this.simulatore);
  readonly scontrini: ScontrinoProva[] = [];

  constructor(private readonly archivio: ArchivioInvii, private readonly adesso: () => Date) {}

  async vendi(righe: RigaCassa[], pagamento: Pagamento, guasto?: Guasto): Promise<EsitoEmissione> {
    const totale = totaleRighe(righe);
    const doc = documentoVendita({
      cedente: CEDENTE_SIMULATO,
      righe: righe.map((r) => ({ descrizione: r.descrizione, quantita: r.quantita, prezzoLordo: r.prezzo, aliquotaIVA: r.aliquota })),
      pagamenti: pagamento === 'contanti' ? { contanti: totale } : { elettronico: totale },
      quando: this.adesso(),
    });
    if (guasto) this.simulatore.guasta(guasto);
    const r = await emettiVendita(this.servizio, this.archivio, doc, this.adesso());
    this.scontrini.unshift({ idtrx: r.idtrx, progressivo: r.progressivo, totale, recuperato: r.stato === 'recuperato', annullato: false });
    return r;
  }

  async annulla(idtrx: string, guasto?: Guasto): Promise<EsitoEmissione> {
    const s = this.scontrini.find((x) => x.idtrx === idtrx);
    if (!s || s.annullato) throw new Error('Scontrino non trovato o già annullato.');
    const originale = await this.servizio.documento(idtrx);
    if (guasto) this.simulatore.guasta(guasto);
    const r = await inviaAnnulloReso(this.servizio, this.archivio, documentoAnnullo({ cedente: CEDENTE_SIMULATO, originale, quando: this.adesso() }), this.adesso());
    s.annullato = true;
    return r;
  }

  /** Chiarisce un invio rimasto in sospeso (vendita: con l'ultima vendita; annullo: a mano). */
  async verifica(): Promise<EsitoEmissione | null> {
    const r = await verificaSospeso(this.servizio, this.archivio);
    if (r && !this.scontrini.some((x) => x.idtrx === r.idtrx)) {
      const d = this.simulatore.documenti.find((x) => x.idtrx === r.idtrx)!;
      const totale = Number(d.documento.documentoCommerciale.ammontareComplessivo ?? 0);
      this.scontrini.unshift({ idtrx: r.idtrx, progressivo: r.progressivo, totale, recuperato: true, annullato: false });
    }
    return r;
  }

  sospeso() { return this.archivio.sospeso(); }
  chiudiAMano() { return chiudiSospesoAMano(this.archivio); }
}
