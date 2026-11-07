/** I 14 allergeni da dichiarare (Reg. UE 1169/2011, allegato II), con i nomi in italiano e inglese. */
export const ALLERGENI = [
  { id: 'glutine', it: 'cereali contenenti glutine', en: 'cereals containing gluten', breve: { it: 'glutine', en: 'gluten' } },
  { id: 'crostacei', it: 'crostacei', en: 'crustaceans', breve: { it: 'crostacei', en: 'crustaceans' } },
  { id: 'uova', it: 'uova', en: 'eggs', breve: { it: 'uova', en: 'eggs' } },
  { id: 'pesce', it: 'pesce', en: 'fish', breve: { it: 'pesce', en: 'fish' } },
  { id: 'arachidi', it: 'arachidi', en: 'peanuts', breve: { it: 'arachidi', en: 'peanuts' } },
  { id: 'soia', it: 'soia', en: 'soybeans', breve: { it: 'soia', en: 'soy' } },
  { id: 'latte', it: 'latte', en: 'milk', breve: { it: 'latte', en: 'milk' } },
  { id: 'frutta_a_guscio', it: 'frutta a guscio', en: 'nuts', breve: { it: 'frutta a guscio', en: 'nuts' } },
  { id: 'sedano', it: 'sedano', en: 'celery', breve: { it: 'sedano', en: 'celery' } },
  { id: 'senape', it: 'senape', en: 'mustard', breve: { it: 'senape', en: 'mustard' } },
  { id: 'sesamo', it: 'semi di sesamo', en: 'sesame seeds', breve: { it: 'sesamo', en: 'sesame' } },
  { id: 'solfiti', it: 'anidride solforosa e solfiti', en: 'sulphur dioxide and sulphites', breve: { it: 'solfiti', en: 'sulphites' } },
  { id: 'lupini', it: 'lupini', en: 'lupin', breve: { it: 'lupini', en: 'lupin' } },
  { id: 'molluschi', it: 'molluschi', en: 'molluscs', breve: { it: 'molluschi', en: 'molluscs' } },
] as const;

export type Allergene = (typeof ALLERGENI)[number]['id'];
export type Lingua = 'it' | 'en';

export const eAllergene = (v: unknown): v is Allergene => ALLERGENI.some((a) => a.id === v);

/** Allergeni nell'ordine ufficiale, senza doppioni. */
export function ordinaAllergeni(elenco: Iterable<Allergene>): Allergene[] {
  const s = new Set(elenco);
  return ALLERGENI.filter((a) => s.has(a.id)).map((a) => a.id);
}

export const nomeAllergene = (id: Allergene, lingua: Lingua, breve = false) => {
  const a = ALLERGENI.find((x) => x.id === id)!;
  return breve ? a.breve[lingua] : a[lingua];
};
