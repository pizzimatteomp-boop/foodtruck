/**
 * Acquisti senza fattura (contadino, mercato): si registrano direttamente sull'ingrediente.
 * Ogni coppia fornitore + ingrediente ha il suo articolo «a mano», già collegato (conversione 1:1).
 */
import type { Acquisto, Articolo, Ingrediente } from '../foodcost/modello';
import { impronta } from './piano';

export class ErroreAcquisto extends Error {
  override name = 'ErroreAcquisto';
}

const numero = (v: string | number) => Number(String(v).replace(',', '.'));

export function preparaAcquistoManuale(
  x: { data: string; fornitore: string; quantita: string | number; totale: string | number; nota?: string },
  ingrediente: Ingrediente,
  oggi: string,
): { articolo: Articolo; acquisto: Acquisto } {
  const fornitore = x.fornitore.trim();
  if (!fornitore) throw new ErroreAcquisto('Scrivi da chi hai comprato (es. «Contadino Rossi»).');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.data)) throw new ErroreAcquisto('Data non valida.');
  if (x.data > oggi) throw new ErroreAcquisto('La data non può essere nel futuro.');
  const q = numero(x.quantita), tot = numero(x.totale);
  if (!(q > 0)) throw new ErroreAcquisto(`Scrivi la quantità in ${ingrediente.unita}.`);
  if (!(tot > 0)) throw new ErroreAcquisto('Scrivi quanto hai pagato in totale.');
  const idArt = `man-${impronta(`${fornitore.toUpperCase()}|${ingrediente.id}`)}`;
  return {
    articolo: { id: idArt, nome: `${ingrediente.nome} (${fornitore})`, unita: ingrediente.unita, categoria: ingrediente.categoria, ingrediente: ingrediente.id, fattore: 1, fornitore },
    acquisto: {
      id: `${idArt}-${x.data}-${impronta(`${q}|${tot}|${Date.now()}`)}`, data: x.data, fornitore, descrizione: (x.nota ?? '').trim() || `Acquisto a mano: ${ingrediente.nome}`,
      articolo: idArt, quantita: q, unita: ingrediente.unita, prezzoUnitario: tot / q, fattura: null, origine: 'manuale',
    },
  };
}
