/**
 * Simulatore del documento commerciale online, per le prove di tutti i giorni (nessuno scontrino vero).
 * Riproduce quello che sappiamo del servizio (CLAUDE.md): esito/idtrx/progressivo, errori di contenuto
 * con stato 200 ed esito false, ultima vendita, documento, PDF, sessione scaduta. Si possono provocare guasti.
 */
import BigNumber from 'bignumber.js';
import { ErroreRete, type Richiesta, type Risposta, type Trasporto } from './trasporto';

export type Guasto =
  | 'rete-prima'   // la richiesta non arriva: niente eseguito
  | 'rete-dopo'    // l'Agenzia esegue, ma la risposta si perde
  | 'sessione'     // il portale rimanda all'accesso
  | 'errore-500';  // errore del servizio, niente eseguito

interface Registrato {
  idtrx: string;
  progressivo: string;
  tipo: 'V' | 'A' | 'R';
  documento: { documentoCommerciale: Record<string, unknown> & { elementiContabili: Record<string, string>[]; dataOra: string } };
}

const json = (stato: number, corpo: unknown): Risposta => ({ stato, tipo: 'application/json', corpo });

export class SimulatoreAgenzia implements Trasporto {
  readonly documenti: Registrato[] = [];
  private guasti: Guasto[] = [];
  private contatore = 7000;
  /** Sessione valida: se false, ogni chiamata rimanda al login. */
  sessioneValida = true;

  /** Il prossimo invio (o i prossimi) avranno questi guasti, in ordine. */
  guasta(...g: Guasto[]) { this.guasti.push(...g); }

  async invia(r: Richiesta): Promise<Risposta> {
    const g = this.guasti.shift();
    if (g === 'rete-prima') throw new ErroreRete('Rete assente (simulata).');
    if (g === 'sessione' || !this.sessioneValida) {
      return { stato: 200, tipo: 'text/html', corpo: '<html>Accesso</html>', urlFinale: 'https://iampe.agenziaentrate.gov.it/sam/UI/Login?realm=/agenziaentrate' };
    }
    if (g === 'errore-500') return json(500, { messaggio: 'errore simulato' });
    const risposta = this.esegui(r);
    if (g === 'rete-dopo') throw new ErroreRete('Risposta persa (simulata).');
    return risposta;
  }

  private esegui(r: Richiesta): Risposta {
    if (r.metodo === 'GET' && r.percorso === 'doc/documenti/dati/fiscali') return json(200, { partitaIva: '00000000000', denominazione: 'SIMULATORE' });
    if (r.metodo === 'GET' && r.percorso === 'doc/documenti/ultimo/') {
      const u = [...this.documenti].reverse().find((d) => d.tipo === 'V');
      return json(200, u ? this.letto(u) : {});
    }
    const pdf = /^doc\/documenti\/([^/]+)\/stampa\/\?regalo=false$/.exec(r.percorso);
    if (r.metodo === 'GET' && pdf) {
      const d = this.documenti.find((x) => x.idtrx === pdf[1]);
      return d ? { stato: 200, tipo: 'application/pdf', corpo: new TextEncoder().encode(`%PDF-1.4 SIMULATORE ${d.progressivo}`) } : json(404, {});
    }
    const uno = /^doc\/documenti\/([^/]+)\/$/.exec(r.percorso);
    if (r.metodo === 'GET' && uno) {
      const d = this.documenti.find((x) => x.idtrx === uno[1]);
      return d ? json(200, this.letto(d)) : json(404, {});
    }
    if (r.metodo === 'POST' && r.percorso === 'doc/documenti/') return json(200, this.registra(r.corpo as Registrato['documento']));
    return json(404, {});
  }

  private registra(doc: Registrato['documento'] & { cedentePrestatore?: { altriDatiIdentificativi?: { nazione?: string } } }) {
    const errori: { codice: string; descrizione: string }[] = [];
    const dc = doc?.documentoCommerciale;
    if (!dc) return { esito: false, errori: [{ codice: 'F001', descrizione: 'Documento non valido' }] };
    if (!doc.cedentePrestatore?.altriDatiIdentificativi?.nazione) errori.push({ codice: 'E101', descrizione: "'Nazione' non presente" });
    const resoAnnullo = dc.resoAnnullo as { tipologia: 'A' | 'R'; progressivo: string } | undefined;
    if (resoAnnullo) {
      const orig = this.documenti.find((d) => d.progressivo === resoAnnullo.progressivo && d.tipo === 'V');
      if (!orig) errori.push({ codice: 'E201', descrizione: 'Documento da annullare non trovato' });
      else if (resoAnnullo.tipologia === 'A' && this.documenti.some((d) => d.tipo === 'A' && (d.documento.documentoCommerciale.resoAnnullo as { progressivo: string }).progressivo === orig.progressivo)) {
        errori.push({ codice: 'E202', descrizione: 'Documento già annullato' });
      }
    } else {
      const totale = dc.elementiContabili.reduce((t, e) => (e.omaggio === 'Y' ? t : t.plus(e.totale ?? 0)), new BigNumber(0));
      const pagato = (dc.vendita as { importo: string }[] | undefined ?? []).reduce((t, v) => t.plus(v.importo), new BigNumber(0));
      if (!pagato.eq(totale.decimalPlaces(2))) errori.push({ codice: 'E301', descrizione: 'Pagamenti diversi dal totale' });
    }
    if (errori.length) return { esito: false, errori };
    this.contatore++;
    const d: Registrato = { idtrx: String(265000000 + this.contatore), progressivo: `DCW2026/9999-${this.contatore}`, tipo: resoAnnullo?.tipologia ?? 'V', documento: doc };
    this.documenti.push(d);
    return { esito: true, idtrx: d.idtrx, progressivo: d.progressivo, errori: [] };
  }

  /** Come l'Agenzia restituisce un documento: numeri «grezzi» (1.5 invece di 1.50). */
  private letto(d: Registrato) {
    return {
      idtrx: d.idtrx,
      datiTrasmissione: { numeroProgressivo: d.progressivo },
      documentoCommerciale: {
        dataOra: d.documento.documentoCommerciale.dataOra,
        elementiContabili: d.documento.documentoCommerciale.elementiContabili.map((e, i) => ({
          idElementoContabile: String(1000 + i), descrizioneProdotto: e.descrizioneProdotto, quantita: String(Number(e.quantita)),
          prezzoLordo: String(Number(e.prezzoLordo)), aliquotaIVA: e.aliquotaIVA, omaggio: e.omaggio,
        })),
      },
    };
  }
}
