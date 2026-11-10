/** Disegno della ricevuta di cortesia col marchio VegMan (colori e font del manuale). PNG da condividere. */
import { FRASE, FRASE_EN, type ContenutoRicevuta } from '../cassa/ricevuta';

const GLAUCOUS = '#6B77B7';
const CREMA = '#F3E9D0';
const MENTA = '#B9DED3';
const NERO = '#1C1B22';
const L = 720;

function carica(src: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
}

export async function immagineRicevuta(c: ContenutoRicevuta): Promise<Blob> {
  await document.fonts?.load('64px "Luckiest Guy"').catch(() => undefined);
  const logo = await carica(`${import.meta.env.BASE_URL}icone/icona.svg`);
  const ALTO = 210, RIGA = 52, BASSO = 300;
  const h = ALTO + 120 + c.righe.length * RIGA + BASSO;
  const tela = document.createElement('canvas');
  tela.width = L; tela.height = h;
  const g = tela.getContext('2d')!;
  // intestazione: V crema su glaucous e scritta VEGMAN
  g.fillStyle = GLAUCOUS; g.fillRect(0, 0, L, ALTO);
  if (logo) g.drawImage(logo, 40, 35, 140, 140);
  g.fillStyle = CREMA; g.font = '72px "Luckiest Guy", sans-serif'; g.textBaseline = 'middle';
  g.fillText('VEGMAN', 200, 115);
  // corpo
  g.fillStyle = '#FFFFFF'; g.fillRect(0, ALTO, L, h - ALTO);
  g.fillStyle = NERO; g.textBaseline = 'alphabetic';
  g.font = '600 34px system-ui, sans-serif'; g.fillText(c.titolo, 40, ALTO + 60);
  g.font = '26px system-ui, sans-serif'; g.fillStyle = '#5E5A66';
  g.textAlign = 'right'; g.fillText(c.quando, L - 40, ALTO + 60); g.textAlign = 'left';
  let y = ALTO + 120;
  g.font = '30px system-ui, sans-serif';
  for (const r of c.righe) {
    g.fillStyle = NERO;
    const testo = r.testo.length > 34 ? `${r.testo.slice(0, 33)}…` : r.testo;
    g.fillText(testo, 40, y);
    g.textAlign = 'right'; g.fillText(r.importo, L - 40, y); g.textAlign = 'left';
    y += RIGA;
  }
  g.strokeStyle = '#D9D4C8'; g.lineWidth = 2; g.beginPath(); g.moveTo(40, y - 24); g.lineTo(L - 40, y - 24); g.stroke();
  g.font = '700 40px system-ui, sans-serif'; g.fillStyle = NERO;
  g.fillText('Totale', 40, y + 30); g.textAlign = 'right'; g.fillText(c.totale, L - 40, y + 30); g.textAlign = 'left';
  g.font = '26px system-ui, sans-serif'; g.fillStyle = '#5E5A66';
  g.fillText(c.pagamento, 40, y + 76);
  g.fillText(c.documento, 40, y + 116);
  g.fillText(c.nota, 40, y + 152);
  // fascia finale menta con la frase
  g.fillStyle = MENTA; g.fillRect(0, h - 110, L, 110);
  g.fillStyle = NERO; g.textAlign = 'center';
  g.font = '34px "Luckiest Guy", sans-serif'; g.fillText(FRASE.replace(' 🌱', '').toUpperCase(), L / 2, h - 60);
  g.font = '22px system-ui, sans-serif'; g.fillText(FRASE_EN, L / 2, h - 26);
  return new Promise((ok, ko) => tela.toBlob((b) => (b ? ok(b) : ko(new Error('Immagine non creata.'))), 'image/png'));
}
