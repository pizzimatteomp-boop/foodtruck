import jsQR from 'jsqr';
import type { Etichetta, Ingrediente, Prodotto } from '../foodcost/modello';
import { costruisciMenu, perGruppo, stessoMenu } from './menu';
import { matriceQr, svgQr } from './qr';

const et = (x: Partial<Etichetta> = {}): Etichetta => ({ nomeEn: 'X', composizione: { it: '', en: '' }, allergeni: [], tracce: [], pesoUnitario: null, controllata: true, ...x });
const ingredienti: Ingrediente[] = [
  { id: 'seitan', nome: 'Seitan', categoria: 'alimentare', unita: 'g', gruppo: '', confezione: null, etichetta: et({ nomeEn: 'Seitan', allergeni: ['glutine'] }) },
  { id: 'patate', nome: 'Patate', categoria: 'alimentare', unita: 'g', gruppo: '', confezione: null, etichetta: et({ nomeEn: 'Potatoes' }) },
  { id: 'cavolo', nome: 'Cavolo', categoria: 'alimentare', unita: 'g', gruppo: '', confezione: null, etichetta: et({ nomeEn: '', controllata: false }) },
];
const prod = (id: string, o: Partial<Prodotto>): Prodotto =>
  ({ id, nome: id, tipo: 'vendibile', gruppo: '', prezzo: 10, resa: { quantita: 1, unita: 'pz' }, ricetta: [], quotaVendite: 0, inMenu: true, ...o });
const prodotti = [
  prod('Kebab', { gruppo: 'Panini', nomeEn: 'Kebab', prezzo: 12, ricetta: [{ tipo: 'ingrediente', id: 'seitan', quantita: 120 }] }),
  prod('Spicchi', { gruppo: 'Fritti', nomeEn: 'Potato wedges', prezzo: 5, ricetta: [{ tipo: 'ingrediente', id: 'patate', quantita: 250 }] }),
  prod('Nascosto', { inMenu: false, ricetta: [{ tipo: 'ingrediente', id: 'patate', quantita: 1 }] }),
  prod('Mayo', { tipo: 'semilavorato', inMenu: true }),
];

describe('menu pubblico', () => {
  it('solo i prodotti in vendita e in menu, per gruppo e nome, con lista e allergeni; niente costi', () => {
    const m = costruisciMenu(prodotti, ingredienti);
    expect(m.voci.map((v) => v.id)).toEqual(['Spicchi', 'Kebab']);
    expect(m.voci[1]).toEqual({
      id: 'Kebab', nome: { it: 'Kebab', en: 'Kebab' }, gruppo: 'Panini', prezzo: 12,
      lista: { it: [{ testo: 'Seitan', grassetto: true }], en: [{ testo: 'Seitan', grassetto: true }] }, allergeni: ['glutine'], tracce: [],
    });
    expect(Object.keys(m.voci[0]!)).not.toContain('ricetta');
    expect(m.bloccanti).toEqual([]);
    expect(perGruppo(m.voci).map((g) => [g.gruppo, g.voci.length])).toEqual([['Fritti', 1], ['Panini', 1]]);
  });

  it('dati mancanti: bloccano (italiano) o avvisano (inglese)', () => {
    const m = costruisciMenu([...prodotti, prod('Insalata', { ricetta: [{ tipo: 'ingrediente', id: 'cavolo', quantita: 50 }] }), prod('Vuoto', {})], ingredienti);
    expect(m.bloccanti).toEqual(['Insalata: «Cavolo»: etichetta da controllare', 'Vuoto: ricetta vuota']);
    expect(m.avvisi).toEqual(['Insalata: «Insalata»: manca il nome in inglese', 'Insalata: «Cavolo»: manca il nome in inglese', 'Vuoto: «Vuoto»: manca il nome in inglese']);
    expect(m.voci.find((v) => v.id === 'Insalata')!.nome.en).toBe('Insalata');
  });

  it('confronto tra menu pubblicato e attuale', () => {
    const v = costruisciMenu(prodotti, ingredienti).voci;
    expect(stessoMenu(v, v)).toBe(true);
    expect(stessoMenu(undefined, v)).toBe(false);
    expect(stessoMenu(v, [{ ...v[0]!, prezzo: 6 }, v[1]!])).toBe(false);
  });
});

describe('QR code', () => {
  const indirizzo = 'https://vegman-prova.firebaseapp.com/#/menu';

  it('si legge davvero: decodificato riporta l\'indirizzo del menu', () => {
    const m = matriceQr(indirizzo);
    const px = 4, bordo = 4, lato = (m.length + bordo * 2) * px;
    const dati = new Uint8ClampedArray(lato * lato * 4).fill(255);
    m.forEach((riga, r) => riga.forEach((nero, c) => {
      if (!nero) return;
      for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
        const i = (((r + bordo) * px + y) * lato + (c + bordo) * px + x) * 4;
        dati[i] = dati[i + 1] = dati[i + 2] = 0;
      }
    }));
    expect(jsQR(dati, lato, lato)?.data).toBe(indirizzo);
  });

  it('SVG leggero con margine e titolo ripulito', () => {
    const s = svgQr(indirizzo, 'Menu <VegMan>');
    expect(s).toMatch(/^<svg [^>]*viewBox="0 0 (\d+) \1"/);
    expect(s).toContain('aria-label="Menu VegMan>"');
    expect(s.length).toBeLessThan(20000);
  });
});
