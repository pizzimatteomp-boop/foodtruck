/**
 * Fatture elettroniche ricevute (formato FatturaPA dell'Agenzia delle Entrate, versioni FPR12 e FPA12).
 * Un file può contenere più fatture (più «FatturaElettronicaBody»).
 */
import { figli, figlio, leggiXml, testoDi, trova } from './xml';

export class ErroreFattura extends Error {
  override name = 'ErroreFattura';
}

export interface RigaFattura {
  linea: number;
  codice: string;
  descrizione: string;
  /** Quantità; 1 se la fattura non la indica (es. servizi a corpo). */
  quantita: number;
  unita: string;
  /** Prezzo effettivo per unità, sconti compresi: prezzo totale della riga / quantità. IVA esclusa. */
  prezzoUnitario: number;
  prezzoTotale: number;
  aliquotaIva: number;
}

export interface Fattura {
  fornitore: { nome: string; partitaIva: string; codiceFiscale: string };
  /** TD01 fattura, TD04 nota di credito, TD24 differita… */
  tipo: string;
  numero: string;
  /** aaaa-mm-gg */
  data: string;
  totale: number;
  righe: RigaFattura[];
}

const NOTE_DI_CREDITO = new Set(['TD04', 'TD08']);
export const eNotaDiCredito = (f: Pick<Fattura, 'tipo'>) => NOTE_DI_CREDITO.has(f.tipo);

const num = (s: string): number => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export function leggiFatturaPA(xml: string): Fattura[] {
  let radice;
  try { radice = leggiXml(xml); } catch { throw new ErroreFattura('Il file non è un XML leggibile.'); }
  const fe = trova(radice, 'FatturaElettronica');
  if (!fe) throw new ErroreFattura('Il file non è una fattura elettronica.');
  const header = figlio(fe, 'FatturaElettronicaHeader');
  const anagrafici = figlio(header, 'CedentePrestatore', 'DatiAnagrafici');
  const anagrafica = figlio(anagrafici, 'Anagrafica');
  const denominazione = testoDi(anagrafica, 'Denominazione')
    || [testoDi(anagrafica, 'Nome'), testoDi(anagrafica, 'Cognome')].filter(Boolean).join(' ');
  const fornitore = {
    nome: denominazione || '(fornitore senza nome)',
    partitaIva: testoDi(anagrafici, 'IdFiscaleIVA', 'IdCodice'),
    codiceFiscale: testoDi(anagrafici, 'CodiceFiscale'),
  };
  const corpi = figli(fe, 'FatturaElettronicaBody');
  if (corpi.length === 0) throw new ErroreFattura('La fattura non ha contenuto.');

  return corpi.map((corpo) => {
    const doc = figlio(corpo, 'DatiGenerali', 'DatiGeneraliDocumento');
    const data = testoDi(doc, 'Data').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new ErroreFattura('Data della fattura mancante o non valida.');
    const righe = figli(figlio(corpo, 'DatiBeniServizi'), 'DettaglioLinee').map((l, i): RigaFattura => {
      const q = num(testoDi(l, 'Quantita'));
      const quantita = q !== 0 ? q : 1;
      const prezzoTotale = num(testoDi(l, 'PrezzoTotale'));
      // Codice articolo: preferisce quello del fornitore se ce ne sono più d'uno.
      const codici = figli(l, 'CodiceArticolo').map((c) => ({ tipo: testoDi(c, 'CodiceTipo').toUpperCase(), valore: testoDi(c, 'CodiceValore') }));
      const codice = (codici.find((c) => /INT|FORN|ART|COD/.test(c.tipo)) ?? codici[0])?.valore ?? '';
      return {
        linea: num(testoDi(l, 'NumeroLinea')) || i + 1,
        codice,
        descrizione: testoDi(l, 'Descrizione').replace(/\s+/g, ' '),
        quantita,
        unita: testoDi(l, 'UnitaMisura').toUpperCase(),
        prezzoUnitario: prezzoTotale / quantita,
        prezzoTotale,
        aliquotaIva: num(testoDi(l, 'AliquotaIVA')),
      };
    });
    return {
      fornitore,
      tipo: testoDi(doc, 'TipoDocumento') || 'TD01',
      numero: testoDi(doc, 'Numero'),
      data,
      totale: num(testoDi(doc, 'ImportoTotaleDocumento')),
      righe,
    };
  });
}
