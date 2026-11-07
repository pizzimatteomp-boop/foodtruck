/**
 * Dati di ingredienti, prodotti, articoli e acquisti (vedi CLAUDE.md, «Fatture, ingredienti e food cost»).
 * Le quantità sono sempre nell'unità dell'ingrediente (g, ml, pz…).
 */
export type CategoriaIngrediente = 'alimentare' | 'packaging';
export type CategoriaArticolo = CategoriaIngrediente | 'non_alimentare';

export interface Ingrediente {
  id: string;
  nome: string;
  categoria: CategoriaIngrediente;
  /** Unità in cui si misura nelle ricette: g, ml, pz… */
  unita: string;
  /** Gruppo libero (es. «Salse», «Kebab»), solo per ordinare le liste. */
  gruppo: string;
  /** Quantità di una confezione tipica, nell'unità dell'ingrediente (facoltativa). */
  confezione: number | null;
}

export interface RigaRicetta {
  tipo: 'ingrediente' | 'prodotto';
  id: string;
  quantita: number;
}

export interface Prodotto {
  id: string;
  nome: string;
  /** vendibile = si vende; semilavorato = si usa in altre ricette (salse, basi…). */
  tipo: 'vendibile' | 'semilavorato';
  gruppo: string;
  /** Prezzo di vendita IVA inclusa (0 per i semilavorati). */
  prezzo: number;
  /** Quanto produce la ricetta, nell'unità indicata (es. 5600 g di Mayo, 1 pz di Kebab). */
  resa: { quantita: number; unita: string };
  ricetta: RigaRicetta[];
  /** Quota storica sulle vendite in % (da VegMan Planner), per pianificare gli eventi. */
  quotaVendite: number;
}

/** Un articolo comprato da un fornitore (es. «Ceci secchi 5 kg» da Metro). */
export interface Articolo {
  id: string;
  nome: string;
  /** Unità in cui il fornitore lo vende (CO, KG, PZ…). */
  unita: string;
  categoria: CategoriaArticolo | null;
  /** Ingrediente a cui è collegato; null = non ancora collegato. */
  ingrediente: string | null;
  /** Quante unità di ingrediente ci sono in un'unità di articolo (es. 1 CO = 24 pz → 24). */
  fattore: number;
  /** Fornitore, partita IVA e codice articolo (dalle fatture elettroniche; assenti per gli articoli di Planner). */
  fornitore?: string;
  partitaIva?: string;
  codice?: string;
}

export interface Acquisto {
  id: string;
  /** Data della fattura, aaaa-mm-gg. */
  data: string;
  fornitore: string;
  descrizione: string;
  articolo: string | null;
  /** Quantità nell'unità dell'articolo. */
  quantita: number;
  unita: string;
  /** Prezzo per unità di articolo, IVA esclusa come in fattura. */
  prezzoUnitario: number;
  fattura: { numero: string; id: string } | null;
  origine: 'planner' | 'fattura' | 'manuale';
}
