/**
 * Unità di misura: come mostrare un prezzo e quale conversione proporre tra articolo e ingrediente.
 */
import BigNumber from 'bignumber.js';

const norm = (u: string) => u.trim().toLowerCase().replace(/\.$/, '');
const GRAMMI = new Set(['g', 'gr', 'grammi']);
const CHILI = new Set(['kg', 'kgm', 'chili']);
const ML = new Set(['ml']);
const LITRI = new Set(['l', 'lt', 'litri', 'ltr']);

/** Prezzo per unità di ingrediente → prezzo «leggibile»: €/kg per i grammi, €/L per i ml, altrimenti €/unità. */
export function prezzoMostrato(prezzoPerUnita: BigNumber, unita: string): { valore: BigNumber; per: string } {
  const u = norm(unita);
  if (GRAMMI.has(u)) return { valore: prezzoPerUnita.times(1000), per: 'kg' };
  if (ML.has(u)) return { valore: prezzoPerUnita.times(1000), per: 'L' };
  return { valore: prezzoPerUnita, per: unita.trim() || 'unità' };
}

/** Quantità scritta nel nome dell'articolo, es. «CECI SECCHI 5 KG» → 5000 g, «PANINI X15» → 15 pz. */
function quantitaNelNome(nome: string): { quantita: number; tipo: 'peso' | 'volume' | 'pezzi' } | null {
  const n = nome.toUpperCase().replace(',', '.');
  const peso = n.match(/(\d+(?:\.\d+)?)\s*(KG|GR|G)\b/);
  if (peso) return { quantita: Number(peso[1]) * (peso[2] === 'KG' ? 1000 : 1), tipo: 'peso' };
  const vol = n.match(/(\d+(?:\.\d+)?)\s*(LT|L|CL|ML)\b/);
  if (vol) return { quantita: Number(vol[1]) * ({ LT: 1000, L: 1000, CL: 10, ML: 1 } as Record<string, number>)[vol[2]!]!, tipo: 'volume' };
  const pezzi = n.match(/(?:\bX\s*(\d+)\b|\b(\d+)\s*(?:PZ|PEZZI)\b)/);
  if (pezzi) return { quantita: Number(pezzi[1] ?? pezzi[2]), tipo: 'pezzi' };
  return null;
}

/**
 * Quante unità di ingrediente ci sono in un'unità di articolo: una proposta, che Matteo conferma.
 * Es. articolo in KG, ingrediente in g → 1000; «CECI 5 KG» venduto a pezzo/cartone, ingrediente in g → 5000.
 */
export function fattoreSuggerito(articolo: { unita: string; nome: string }, unitaIngrediente: string): number {
  const ua = norm(articolo.unita), ui = norm(unitaIngrediente);
  if (CHILI.has(ua) && GRAMMI.has(ui)) return 1000;
  if (LITRI.has(ua) && ML.has(ui)) return 1000;
  if ((CHILI.has(ua) && CHILI.has(ui)) || (LITRI.has(ua) && LITRI.has(ui)) || ua === ui) return 1;
  const q = quantitaNelNome(articolo.nome);
  if (q) {
    if (q.tipo === 'peso' && GRAMMI.has(ui)) return q.quantita;
    if (q.tipo === 'peso' && CHILI.has(ui)) return q.quantita / 1000;
    if (q.tipo === 'volume' && ML.has(ui)) return q.quantita;
    if (q.tipo === 'volume' && LITRI.has(ui)) return q.quantita / 1000;
    if (q.tipo === 'pezzi' && !GRAMMI.has(ui) && !ML.has(ui)) return q.quantita;
  }
  return 1;
}
