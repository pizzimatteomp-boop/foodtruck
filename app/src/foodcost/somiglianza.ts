/** Suggerimenti di collegamento: quanto il nome di un articolo somiglia a quello di un ingrediente (0–100). */
const parole = (s: string) => s.toLowerCase().split(/[^a-z0-9àèéìòù]+/i).filter((w) => w.length > 2);

export function somiglianza(a: string, b: string): number {
  const x = a.toLowerCase().trim(), y = b.toLowerCase().trim();
  if (!x || !y) return 0;
  if (x === y) return 100;
  if (x.includes(y) || y.includes(x)) return 80;
  const wa = parole(x), wb = parole(y);
  if (!wa.length || !wb.length) return 0;
  // parole uguali o con la stessa radice (ceci/cece, pomodori/pomodoro)
  const radice = (w: string) => w.slice(0, Math.max(4, w.length - 2));
  const comuni = wa.filter((w) => wb.some((v) => v === w || radice(v) === radice(w))).length;
  return comuni ? Math.round((comuni / Math.max(wa.length, wb.length)) * 60) : 0;
}

export function suggerimenti<T extends { nome: string }>(nome: string, elenco: readonly T[], limite = 5): T[] {
  return elenco.map((x) => ({ x, s: somiglianza(nome, x.nome) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limite)
    .map((r) => r.x);
}
