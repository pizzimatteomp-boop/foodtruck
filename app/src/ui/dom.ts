/** Piccoli aiuti per costruire la pagina senza librerie (il testo va sempre in textContent: niente HTML iniettato). */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe = '', testo?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo !== undefined) e.textContent = testo;
  return e;
}

export function pulsante(testo: string, classe: string, azione: (b: HTMLButtonElement) => unknown): HTMLButtonElement {
  const b = el('button', classe, testo);
  b.type = 'button';
  b.addEventListener('click', () => void azione(b));
  return b;
}
