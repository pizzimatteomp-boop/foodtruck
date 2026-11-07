/**
 * Lettore XML minimo per le fatture elettroniche (FatturaPA): elementi, testo, CDATA, entità.
 * Ignora attributi, commenti e prefissi degli spazi dei nomi (p:FatturaElettronica → FatturaElettronica).
 * Niente librerie: funziona uguale nel browser, sul telefono e nei test.
 */
export interface Nodo {
  nome: string;
  testo: string;
  figli: Nodo[];
}

const ENTITA: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodifica(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITA[e.toLowerCase()] ?? m;
  });
}

export function leggiXml(testo: string): Nodo {
  const radice: Nodo = { nome: '#documento', testo: '', figli: [] };
  const pila: Nodo[] = [radice];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(testo))) {
    const cima = pila.at(-1)!;
    if (m[1] !== undefined) cima.testo += m[1];
    else if (m[2] !== undefined) {
      const nome = m[2].replace(/^.*:/, '');
      if (pila.length > 1 && cima.nome === nome) pila.pop();
      else throw new Error(`XML non valido: chiusura inattesa </${m[2]}>`);
    } else if (m[3] !== undefined) {
      const nodo: Nodo = { nome: m[3].replace(/^.*:/, ''), testo: '', figli: [] };
      cima.figli.push(nodo);
      if (m[5] !== '/') pila.push(nodo);
    } else if (m[6] !== undefined) cima.testo += decodifica(m[6]);
  }
  if (pila.length !== 1) throw new Error('XML non valido: elementi non chiusi');
  return radice;
}

/** Primo discendente con il percorso dato, es. figlio(n, 'DatiGenerali', 'DatiGeneraliDocumento', 'Numero'). */
export function figlio(n: Nodo | undefined, ...percorso: string[]): Nodo | undefined {
  let c = n;
  for (const p of percorso) c = c?.figli.find((f) => f.nome === p);
  return c;
}

export function figli(n: Nodo | undefined, nome: string): Nodo[] {
  return n ? n.figli.filter((f) => f.nome === nome) : [];
}

export function testoDi(n: Nodo | undefined, ...percorso: string[]): string {
  return (figlio(n, ...percorso)?.testo ?? '').trim();
}

/** Cerca in profondità il primo elemento con quel nome. */
export function trova(n: Nodo, nome: string): Nodo | undefined {
  if (n.nome === nome) return n;
  for (const f of n.figli) {
    const r = trova(f, nome);
    if (r) return r;
  }
  return undefined;
}
