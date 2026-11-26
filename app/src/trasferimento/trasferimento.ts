/**
 * Passaggio alla versione definitiva (vegman-prova → vegman-app, deciso con Matteo il 26/11/2026): un file con le
 * cose utili, scaricato dalla prova e caricato nella definitiva. Si copiano anagrafiche, prezzi, fatture, storico,
 * impostazioni, menu pubblico ed eventi futuri con le loro previsioni. NON si copiano scontrini, movimenti, chiusure,
 * carichi, produzioni, etichette, inventari (gli scontrini veri di novembre restano nella prova come archivio;
 * il magazzino riparte da un inventario nuovo). Modulo puro e testato.
 */

/** Raccolte copiate per intero. */
export const RACCOLTE = ['ingredienti', 'prodotti', 'articoli', 'acquisti', 'fatture', 'storico', 'unitaConta'] as const;
/** Documenti singoli copiati (raccolta/id). */
export const DOCUMENTI = ['impostazioni/foodcost', 'impostazioni/inventario', 'impostazioni/scorte', 'impostazioni/previsione', 'impostazioni/calendario', 'menu/pubblico'] as const;
/** Raccolte che le regole non lasciano riscrivere: se il documento c'è già nella definitiva, si salta. */
const SOLO_NUOVI = new Set(['fatture', 'storico']);

export const VERSIONE = 1;
export type Doc = Record<string, unknown> & { id: string };
export interface Pacchetto {
  vegman: typeof VERSIONE;
  creato: string;
  raccolte: Record<string, Doc[]>;
}

/** Valori di Firestore → JSON: le date (Timestamp) diventano {__ts: millisecondi}. */
export function serializza(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  const t = v as { toMillis?: () => number };
  if (typeof t.toMillis === 'function') return { __ts: t.toMillis() };
  if (Array.isArray(v)) return v.map(serializza);
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, serializza(x)]));
}

/** JSON → valori da scrivere: {__ts} torna data con la funzione data dal chiamante (Timestamp di Firestore). */
export function deserializza(v: unknown, data: (ms: number) => unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => deserializza(x, data));
  const o = v as Record<string, unknown>;
  if (Object.keys(o).length === 1 && typeof o.__ts === 'number') return data(o.__ts);
  return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, deserializza(x, data)]));
}

/** Prepara il file: tutte le raccolte utili, più gli eventi aperti non ancora finiti e le loro previsioni. */
export function preparaPacchetto(dati: { raccolte: Record<string, Doc[]>; eventi: Doc[]; previsioni: Doc[] }, oggi: string, creato: string): Pacchetto {
  const eventi = dati.eventi.filter((e) => e.stato === 'aperto' && typeof e.al === 'string' && e.al >= oggi);
  const ids = new Set(eventi.map((e) => e.id));
  const raccolte: Record<string, Doc[]> = {};
  for (const [nome, docs] of Object.entries(dati.raccolte)) raccolte[nome] = docs.map((d) => serializza(d) as Doc);
  raccolte.eventi = eventi.map((d) => serializza(d) as Doc);
  raccolte.previsioni = dati.previsioni.filter((p) => ids.has(p.id)).map((d) => serializza(d) as Doc);
  return { vegman: VERSIONE, creato, raccolte };
}

/** Controlla il file caricato: deve essere un pacchetto VegMan di questa versione. */
export function leggiPacchetto(testo: string): Pacchetto {
  let p: unknown;
  try { p = JSON.parse(testo); } catch { throw new Error('Il file non è un file di dati VegMan.'); }
  const x = p as Partial<Pacchetto>;
  if (!x || x.vegman !== VERSIONE || typeof x.raccolte !== 'object' || x.raccolte === null) throw new Error('Il file non è un file di dati VegMan (o è di un\'altra versione).');
  return x as Pacchetto;
}

/** Segnaposto per «ora del server» e «chi è collegato»: il modulo .db li sostituisce. */
export const ORA_SERVER = '__ora_server__';

export interface Scrittura { percorso: string; dati: Record<string, unknown> }

/**
 * Dal file alle scritture nella definitiva. Firma e ora si rifanno col titolare collegato (le regole lo chiedono
 * per storico e menu); fatture e storico già presenti si saltano (non si possono riscrivere).
 */
export function scritture(p: Pacchetto, uid: string, esistenti: ReadonlySet<string>, data: (ms: number) => unknown): { scritture: Scrittura[]; saltati: number; conti: Record<string, number> } {
  const out: Scrittura[] = [];
  const conti: Record<string, number> = {};
  let saltati = 0;
  for (const [raccolta, docs] of Object.entries(p.raccolte)) {
    for (const d of docs) {
      const { id, ...resto } = d;
      const percorso = `${raccolta}/${id}`;
      if (SOLO_NUOVI.has(raccolta) && esistenti.has(percorso)) { saltati++; continue; }
      const dati = deserializza(resto, data) as Record<string, unknown>;
      if ('creatoDa' in dati) { dati.creatoDa = uid; dati.creatoIl = ORA_SERVER; }
      if ('aggiornatoDa' in dati) { dati.aggiornatoDa = uid; dati.aggiornatoIl = ORA_SERVER; }
      out.push({ percorso, dati });
      conti[raccolta] = (conti[raccolta] ?? 0) + 1;
    }
  }
  return { scritture: out, saltati, conti };
}

/** Nomi leggibili delle raccolte per il riepilogo. */
export const NOMI: Record<string, string> = {
  ingredienti: 'ingredienti', prodotti: 'prodotti e ricette', articoli: 'articoli dei fornitori', acquisti: 'acquisti', fatture: 'fatture',
  storico: 'fotografie mensili', unitaConta: 'confezioni di conta', impostazioni: 'impostazioni', menu: 'menu pubblico',
  eventi: 'eventi futuri', previsioni: 'previsioni degli eventi',
};
