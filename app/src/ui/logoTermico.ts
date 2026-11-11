/**
 * «V» di VegMan per la stampa termica: solo il contorno, sottile, su bianco (niente blocchi neri),
 * come deciso da Matteo il 10/11/2026. Disegnata su un canvas e ridotta a punti bianchi/neri.
 */
import type { Bitmap } from '../stampa/escpos';
import { MATRICE_V, PERCORSO_V, RIQUADRO_V } from './LogoV';

export function logoTermico(altezza = 96): Bitmap | null {
  if (typeof document === 'undefined' || typeof Path2D === 'undefined') return null;
  const [x0, y0, w, h] = RIQUADRO_V;
  const s = altezza / h;
  const larghezza = Math.ceil((w * s) / 8) * 8;
  const c = document.createElement('canvas');
  c.width = larghezza;
  c.height = altezza;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, larghezza, altezza);
  g.setTransform(s, 0, 0, s, -x0 * s + (larghezza - w * s) / 2, -y0 * s);
  g.transform(...MATRICE_V);
  g.strokeStyle = '#000';
  // circa 2 punti di spessore sulla carta
  g.lineWidth = 2.2 / (s * Math.abs(MATRICE_V[0]));
  g.lineJoin = 'round';
  g.stroke(new Path2D(PERCORSO_V));
  const dati = g.getImageData(0, 0, larghezza, altezza).data;
  const punti = new Uint8Array(larghezza * altezza);
  for (let i = 0; i < punti.length; i++) punti[i] = dati[i * 4]! + dati[i * 4 + 1]! + dati[i * 4 + 2]! < 384 ? 1 : 0;
  return { larghezza, altezza, punti };
}
