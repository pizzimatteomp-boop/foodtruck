/**
 * Documento commerciale online (DCO) dell'Agenzia delle Entrate.
 *
 * Costruisce i documenti nel formato DCW10 accettato dal servizio
 * https://ivaservizi.agenziaentrate.gov.it/ser/api/documenti/v1/doc/documenti/
 * replicando i calcoli della pagina web dell'Agenzia (stesse regole di arrotondamento).
 *
 * Regole verificate con la prova reale del 6/11/2026 (vendita DCW2026/6535-7349 e
 * annullo DCW2026/6535-7686): vedi «Note tecniche documento commerciale online.md».
 *
 * Questo modulo è puro: non fa chiamate di rete, così è interamente testabile.
 */
import BigNumber from 'bignumber.js';

// Stessa aritmetica decimale della pagina dell'Agenzia (bignumber.js, arrotondamento half-up).
const D = BigNumber.clone({ DECIMAL_PLACES: 20, ROUNDING_MODE: BigNumber.ROUND_HALF_UP });
const FMT = { decimalSeparator: '.', groupSeparator: '' } as const;
const f8 = (n: BigNumber) => n.toFormat(8, BigNumber.ROUND_HALF_UP, FMT);
const f2 = (n: BigNumber) => n.toFormat(2, BigNumber.ROUND_HALF_UP, FMT);

/** Aliquote ammesse: percentuali o codici di natura per le operazioni senza IVA. */
export type Aliquota = '4' | '5' | '10' | '22' | 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6';
const ALIQUOTE: readonly Aliquota[] = ['4', '5', '10', '22', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6'];

export interface Cedente {
  partitaIva: string;
  codiceFiscale: string;
  nome?: string;
  cognome?: string;
  denominazione?: string;
  indirizzo: string;
  numeroCivico?: string;
  cap: string;
  comune: string;
  provincia: string;
  /** Obbligatoria: senza, l'Agenzia rifiuta con «'Nazione' non presente». */
  nazione: string;
}

export interface Riga {
  descrizione: string;
  quantita: number | string;
  /** Prezzo unitario IVA inclusa, in euro. */
  prezzoLordo: number | string;
  aliquotaIVA: Aliquota;
  omaggio?: boolean;
}

export interface Pagamenti {
  contanti?: number | string;
  elettronico?: number | string;
  ticket?: { importo: number | string; numero: number };
}

export class ErroreDocumento extends Error {
  override name = 'ErroreDocumento';
}

/** Data nel formato dell'Agenzia (gg/mm/aaaa), sempre sul fuso di Roma. */
export function dataAgenzia(quando: Date): string {
  const p = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(quando);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${v('day')}/${v('month')}/${v('year')}`;
}

function aliquotaNumerica(a: Aliquota): BigNumber {
  return a.startsWith('N') ? new D(0) : new D(a).dividedBy(100);
}

function importo(v: number | string | undefined, campo: string): BigNumber {
  const n = new D(v ?? 0);
  if (!n.isFinite() || n.isNegative()) throw new ErroreDocumento(`${campo}: importo non valido`);
  if (n.decimalPlaces()! > 2) throw new ErroreDocumento(`${campo}: al massimo 2 decimali`);
  return n;
}

/** Calcolo di una riga, identico a calcoloTotaleElemento della pagina dell'Agenzia (operazione V). */
export function calcolaRiga(r: Riga) {
  if (!r.descrizione.trim()) throw new ErroreDocumento('Riga senza descrizione');
  if (!ALIQUOTE.includes(r.aliquotaIVA)) throw new ErroreDocumento(`Aliquota non ammessa: ${r.aliquotaIVA}`);
  const q = new D(r.quantita);
  if (!q.isFinite() || q.lte(0)) throw new ErroreDocumento(`${r.descrizione}: quantità non valida`);
  const lordo = importo(r.prezzoLordo, r.descrizione);
  const aliq = aliquotaNumerica(r.aliquotaIVA).plus(1);
  const sconto = new D(0);
  const totale = lordo.times(q).minus(sconto);
  const prezzoUnitario = lordo.div(aliq);
  const scontoUnitario = sconto.div(aliq);
  const imponibile = lordo.times(q).div(aliq);
  const imponibileNetto = BigNumber.max(0, imponibile.minus(scontoUnitario));
  const importoIVA = totale.minus(imponibileNetto);
  return {
    idElementoContabile: '',
    resiPregressi: '0.00',
    reso: '0.00',
    quantita: f2(q),
    descrizioneProdotto: r.descrizione.trim(),
    prezzoLordo: f2(lordo),
    prezzoUnitario: f8(prezzoUnitario),
    scontoUnitario: f8(scontoUnitario),
    scontoLordo: f8(sconto),
    aliquotaIVA: r.aliquotaIVA,
    importoIVA: f8(importoIVA),
    imponibile: f8(imponibile),
    imponibileNetto: f8(imponibileNetto),
    totale: f8(totale),
    omaggio: r.omaggio ? 'Y' : 'N',
  };
}

export type ElementoContabile = ReturnType<typeof calcolaRiga>;

function totali(righe: ElementoContabile[]) {
  let imp = new D(0), iva = new D(0), sc = new D(0), scl = new D(0), tot = new D(0);
  for (const e of righe) {
    imp = imp.plus(e.imponibile);
    iva = iva.plus(e.importoIVA);
    sc = sc.plus(e.scontoUnitario);
    scl = scl.plus(e.scontoLordo);
    if (e.omaggio !== 'Y') tot = tot.plus(e.totale);
  }
  return {
    importoTotaleIva: f8(iva),
    scontoTotale: f8(sc),
    scontoTotaleLordo: f8(scl),
    totaleImponibile: f8(imp),
    ammontareComplessivo: f8(tot),
    totaleNonRiscosso: f8(new D(0)),
    _ammontare: tot,
  };
}

function cedentePrestatore(c: Cedente) {
  if (!c.nazione) throw new ErroreDocumento('Nazione dell\'esercente mancante');
  const altri: Record<string, unknown> = {
    indirizzo: c.indirizzo, numeroCivico: c.numeroCivico ?? '', cap: c.cap,
    comune: c.comune, provincia: c.provincia, nazione: c.nazione, modificati: false, defAliquotaIVA: '',
  };
  if (c.denominazione) altri.denominazione = c.denominazione;
  else { altri.denominazione = ''; altri.nome = c.nome ?? ''; altri.cognome = c.cognome ?? ''; }
  return {
    identificativiFiscali: { codicePaese: 'IT', partitaIva: c.partitaIva, codiceFiscale: c.codiceFiscale },
    altriDatiIdentificativi: altri,
    multiAttivita: [],
    multiSede: [],
  };
}

/** Documento di vendita (operazione V). I pagamenti devono coprire esattamente il totale. */
export function documentoVendita(args: { cedente: Cedente; righe: Riga[]; pagamenti: Pagamenti; quando: Date }) {
  if (args.righe.length === 0) throw new ErroreDocumento('Il documento non ha righe');
  const elementi = args.righe.map(calcolaRiga);
  const { _ammontare, ...tot } = totali(elementi);
  const pc = importo(args.pagamenti.contanti, 'Contanti');
  const pe = importo(args.pagamenti.elettronico, 'Pagamento elettronico');
  const tr = importo(args.pagamenti.ticket?.importo, 'Ticket');
  if (!pc.plus(pe).plus(tr).eq(_ammontare)) {
    throw new ErroreDocumento(`I pagamenti (${f2(pc.plus(pe).plus(tr))} €) non coincidono con il totale (${f2(_ammontare)} €)`);
  }
  return {
    datiTrasmissione: { formato: 'DCW10' },
    cedentePrestatore: cedentePrestatore(args.cedente),
    documentoCommerciale: {
      cfCessionarioCommittente: '',
      flagDocCommPerRegalo: false,
      progressivoCollegato: '',
      dataOra: dataAgenzia(args.quando),
      multiAttivita: { codiceAttivita: '', descAttivita: '' },
      ...tot,
      elementiContabili: elementi,
      vendita: [
        { tipo: 'PC', importo: f2(pc) },
        { tipo: 'PE', importo: f2(pe) },
        { tipo: 'TR', importo: f2(tr), numero: String(args.pagamenti.ticket?.numero ?? 0) },
        { tipo: 'NR_EF', importo: '0.00' },
        { tipo: 'NR_PS', importo: '0.00' },
        { tipo: 'NR_CS', importo: '0.00' },
      ],
      scontoAbbuono: '0.00',
      importoDetraibileDeducibile: '0.00000000',
    },
    flagIdentificativiModificati: false,
  };
}

/** Documento come lo restituisce l'Agenzia (GET doc/documenti/{idtrx}/): valori non formattati. */
export interface DocumentoLetto {
  idtrx: string;
  datiTrasmissione: { numeroProgressivo: string };
  documentoCommerciale: {
    elementiContabili: Array<{
      idElementoContabile: string; descrizioneProdotto: string; quantita: string; prezzoLordo: string;
      aliquotaIVA: Aliquota; omaggio?: string;
    }>;
  };
}

/**
 * Annullo totale (operazione A) di un documento emesso con il DCO.
 * I valori letti dall'Agenzia («1.5», «0») vanno riformattati: così come sono vengono rifiutati.
 */
export function documentoAnnullo(args: { cedente: Cedente; originale: DocumentoLetto; quando: Date }) {
  const o = args.originale;
  const elementi = o.documentoCommerciale.elementiContabili.map((e) => ({
    ...calcolaRiga({
      descrizione: e.descrizioneProdotto, quantita: e.quantita, prezzoLordo: e.prezzoLordo,
      aliquotaIVA: e.aliquotaIVA, omaggio: e.omaggio === 'Y',
    }),
    idElementoContabile: e.idElementoContabile,
  }));
  const { _ammontare, ...tot } = totali(elementi);
  const data = dataAgenzia(args.quando);
  return {
    datiTrasmissione: { formato: 'DCW10' },
    cedentePrestatore: cedentePrestatore(args.cedente),
    documentoCommerciale: {
      cfCessionarioCommittente: '',
      flagDocCommPerRegalo: false,
      progressivoCollegato: '',
      dataOra: data,
      multiAttivita: { codiceAttivita: '', descAttivita: '' },
      ...tot,
      elementiContabili: elementi,
      scontoAbbuono: '0.00',
      importoDetraibileDeducibile: '0.00000000',
      resoAnnullo: { tipologia: 'A', dataOra: data, progressivo: o.datiTrasmissione.numeroProgressivo },
    },
    flagIdentificativiModificati: false,
  };
}

export type Esito =
  | { ok: true; idtrx: string; progressivo: string }
  | { ok: false; errori: Array<{ codice: string; descrizione: string }> };

/** Interpreta la risposta dell'Agenzia: gli errori di contenuto arrivano con stato 200 ed esito false. */
export function leggiEsito(risposta: unknown): Esito {
  const r = risposta as { esito?: unknown; idtrx?: unknown; progressivo?: unknown; errori?: unknown };
  if ((r?.esito === true || r?.esito === 'true') && typeof r.idtrx === 'string') {
    return { ok: true, idtrx: r.idtrx, progressivo: String(r.progressivo ?? '') };
  }
  const errori = Array.isArray(r?.errori) ? (r.errori as Array<{ codice: string; descrizione: string }>) : [];
  return { ok: false, errori: errori.length ? errori : [{ codice: 'SCONOSCIUTO', descrizione: 'Risposta non riconosciuta' }] };
}
