/** QR code come immagine SVG (libreria qrcode-generator, MIT), con correzione d'errore media. */
import qrcode from 'qrcode-generator';

export function matriceQr(testo: string): boolean[][] {
  const q = qrcode(0, 'M');
  q.addData(testo, 'Byte');
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
}

/** SVG con un solo tracciato (leggero), margine di 4 moduli come da norma, nero su bianco. */
export function svgQr(testo: string, titolo = 'QR code'): string {
  const m = matriceQr(testo);
  const n = m.length, margine = 4, lato = n + margine * 2;
  let d = '';
  m.forEach((riga, r) => riga.forEach((nero, c) => { if (nero) d += `M${c + margine} ${r + margine}h1v1h-1z`; }));
  const t = titolo.replace(/[<&"]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lato} ${lato}" shape-rendering="crispEdges" role="img" aria-label="${t}"><rect width="${lato}" height="${lato}" fill="#fff"/><path fill="#000" d="${d}"/></svg>`;
}
