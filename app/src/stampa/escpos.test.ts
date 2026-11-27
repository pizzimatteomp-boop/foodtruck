import { describe, expect, it } from 'vitest';
import { scontrinoVendita } from '../cassa/archivio';
import { documentoCliente, ESERCENTE_PROVA, impagina } from '../cassa/documento';
import { aCapo, aPezzi, ascii, caratteristicaScrivibile, colonne, comandaTermica, COLONNE, documentoTermico, raster, SERVIZI_STAMPANTE } from './escpos';

const testo = (b: Uint8Array) => new TextDecoder().decode(b.filter((x) => x === 0x0a || (x >= 0x20 && x < 0x7f)));

describe('stampa termica ESC/POS', () => {
  it('solo ASCII leggibile da tutte le stampanti', () => {
    expect(ascii('Caffè «perché» 2× 10,00 € – ok')).toBe('Caffe "perche" 2x 10,00 EUR - ok');
    expect(ascii('🌱 Grazie')).toBe(' Grazie');
  });

  it('colonne a 32 caratteri: testo a sinistra, importo a destra', () => {
    expect(colonne('2 × Kebab', '24,00 €')).toEqual(['2 x Kebab              24,00 EUR']);
    const lunga = colonne('1 × Panino con ceci speziati e salsa allo yogurt vegetale', '12,00 €');
    expect(lunga.every((r) => r.length <= 32)).toBe(true);
    expect(lunga[lunga.length - 1]).toMatch(/12,00 EUR$/);
    expect(colonne('x'.repeat(30), '1,00 €')).toEqual(['x'.repeat(30), '                        1,00 EUR']);
    expect(aCapo('Documento commerciale n. DCW2026/9999-123456789')).toEqual(['Documento commerciale n.', 'DCW2026/9999-123456789']);
    expect(aCapo('a'.repeat(40))).toEqual(['a'.repeat(32), 'a'.repeat(8)]);
  });

  it('documento sulla carta: stesse righe del PDF a 32 colonne, solo ASCII, titolo e totale grandi', () => {
    const s = scontrinoVendita({ idtrx: '1', progressivo: 'DCW2026/9999-7001', pagamento: 'contanti', ambiente: 'simulatore', cassa: 'C', giorno: '2026-11-11',
      righe: [{ descrizione: 'Kebab', quantita: 2, centesimi: 1200, aliquota: '10' }] });
    const righe = impagina(documentoCliente(s, new Date('2026-11-11T19:30:00Z'), ESERCENTE_PROVA), COLONNE, ascii);
    expect(righe.every((r) => r.testo.length <= (r.grande ? COLONNE / 2 : COLONNE))).toBe(true);
    const b = documentoTermico(righe);
    const t = testo(b);
    expect([...b.slice(0, 2)]).toEqual([0x1b, 0x40]);
    expect(t).toContain('VEGMAN');
    expect(t).toContain('N. 2 x 12.00EUR');
    expect(t).toContain('Kebab            10.00     24.00');
    expect(t).toContain('TOTALE COMPLESSIVO');
    expect(t).toContain('Pagamento contante         24.00');
    expect(t).toContain('PROVA - NON E UN DOCUMENTO');
    expect(t).not.toContain('€');
    // righe grandi in doppia larghezza e altezza (GS ! 0x11)
    expect([...b]).toEqual(expect.arrayContaining([0x1d, 0x21, 0x11]));
  });

  it('raster: 8 punti per byte, righe allineate', () => {
    const r = raster({ larghezza: 10, altezza: 2, punti: new Uint8Array([1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0]) });
    expect(r).toEqual([0x1d, 0x76, 0x30, 0, 2, 0, 2, 0, 0xc0, 0x40, 0x00, 0x80]);
  });

  it('comanda: numero grande, prodotti, niente prezzi', () => {
    const t = testo(comandaTermica({ numero: 12, cassa: 'Furgone', ora: '20:31', righe: [{ quantita: 2, descrizione: 'Kebab' }, { quantita: 1, descrizione: 'Patate' }], nota: 'senza cipolla' }));
    expect(t).toContain('COMANDA 12');
    expect(t).toContain('Furgone - 20:31');
    expect(t).toContain('2 x Kebab');
    expect(t).toContain('senza cipolla');
    expect(t).not.toMatch(/EUR|€/);
    expect(testo(comandaTermica({ numero: 1, cassa: 'C', ora: '1', righe: [] }))).not.toContain('senza');
    // nome per chiamare il cliente, grande (doppia larghezza: 16 caratteri per riga)
    const n = testo(comandaTermica({ numero: 3, cliente: ' Giulia Bianchi Rossi ', cassa: 'C', ora: '1', righe: [] }));
    expect(n).toContain('COMANDA 3\nGIULIA BIANCHI\nROSSI\n');
    expect(testo(comandaTermica({ numero: 3, cliente: '  ', cassa: 'C', ora: '1', righe: [] }))).toContain('COMANDA 3\n');
  });

  it('a pezzi per il Bluetooth e scelta della caratteristica', () => {
    expect(aPezzi(new Uint8Array(400)).map((x) => x.length)).toEqual([180, 180, 40]);
    expect(caratteristicaScrivibile([
      { uuid: 'aaaa', caratteristiche: [{ uuid: 'c0', scrive: true }] },
      { uuid: SERVIZI_STAMPANTE[0]!.toUpperCase(), caratteristiche: [{ uuid: 'c1', scrive: false }, { uuid: 'c2', scrive: true }] },
    ])).toEqual({ servizio: SERVIZI_STAMPANTE[0]!.toUpperCase(), caratteristica: 'c2' });
    expect(caratteristicaScrivibile([{ uuid: 'aaaa', caratteristiche: [{ uuid: 'c0', scrive: true }] }])).toEqual({ servizio: 'aaaa', caratteristica: 'c0' });
    expect(caratteristicaScrivibile([{ uuid: 'aaaa', caratteristiche: [] }])).toBeNull();
  });
});
