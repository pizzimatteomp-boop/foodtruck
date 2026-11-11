import { describe, expect, it } from 'vitest';
import { scontrinoAnnullo, scontrinoVendita, type ScontrinoArchivio } from './archivio';
import { apri, atteso, avvisiQuadrature, centesimi, differenze, fondoProposto, msDi, preparaQuadratura, type Apertura } from './quadratura';

const ora = (ms: number) => ({ toMillis: () => ms });
const v = (id: string, euro: number, pagamento: 'contanti' | 'elettronico', ms: number | null, cassa = 'Cassa 1', evento = 'ev1') => ({
  ...scontrinoVendita({ idtrx: id, progressivo: `P${id}`, righe: [{ descrizione: 'x', quantita: 1, centesimi: Math.round(euro * 100), aliquota: '10' }], pagamento, ambiente: 'simulatore', cassa, giorno: '2026-11-10', evento }),
  creatoIl: ms === null ? null : ora(ms),
});
const A: Apertura = { evento: 'ev1', cassa: 'Cassa 1', da: 1000, fondo: 10000 };

describe('quadratura di cassa', () => {
  it('apertura: riaprendo la stessa cassa resta l\'ora ma il fondo si corregge', () => {
    expect(apri(null, 'ev1', 'Cassa 1', 5000, 10)).toEqual({ apertura: { evento: 'ev1', cassa: 'Cassa 1', da: 10, fondo: 5000 }, nuova: true });
    expect(apri(A, 'ev1', 'Cassa 1', 7000, 99)).toEqual({ apertura: { ...A, fondo: 7000 }, nuova: false });
    expect(apri(A, 'ev2', 'Cassa 1', 0, 99).nuova).toBe(true);
    expect(apri(A, 'ev1', 'Furgone', 0, 99).nuova).toBe(true);
    expect(fondoProposto(A, 'ev1', 'Cassa 1')).toBe('100,00');
    expect(fondoProposto(A, 'ev1', 'Furgone')).toBe('');
    expect(fondoProposto({ ...A, fondo: 0 }, 'ev1', 'Cassa 1')).toBe('');
    expect(fondoProposto(null, 'ev1', 'Cassa 1')).toBe('');
  });

  it('importi scritti a mano in centesimi', () => {
    expect(centesimi('120,5', 'x')).toBe(12050);
    expect(centesimi(' 1.234,56 € ', 'x')).toBe(123456);
    expect(centesimi('99.9', 'x')).toBe(9990);
    expect(centesimi('', 'x')).toBe(0);
    expect(() => centesimi('12,345', 'Contanti')).toThrow(/Contanti/);
    expect(() => centesimi('-5', 'x')).toThrow();
    expect(() => centesimi('999999', 'x')).toThrow(/alto/);
  });

  it('atteso: fondo + vendite di questa cassa dall\'apertura, meno gli annulli fatti qui', () => {
    const prima = v('1', 50, 'contanti', 500);
    const c1 = v('2', 16.5, 'contanti', 2000);
    const p1 = v('3', 12, 'elettronico', 2500);
    const altraCassa = v('4', 7, 'contanti', 3000, 'Furgone');
    const altroEvento = v('5', 9, 'contanti', 3000, 'Cassa 1', 'ev2');
    const inAttesa = v('6', 5, 'elettronico', null);
    const annulloCarta = { ...scontrinoAnnullo(p1, { idtrx: '7', progressivo: 'P7', cassa: 'Cassa 1', giorno: '2026-11-10' }), creatoIl: ora(4000) };
    const annulloPrima = { ...scontrinoAnnullo(prima, { idtrx: '8', progressivo: 'P8', cassa: 'Cassa 1', giorno: '2026-11-10' }), creatoIl: ora(4100) };
    const tutti = [prima, c1, p1, altraCassa, altroEvento, inAttesa, annulloCarta, annulloPrima];
    // contanti: 100 + 16,50 − 50 (annullo di una vendita prima dell'apertura) = 66,50; carta: 12 + 5 − 12 = 5
    expect(atteso(tutti, A, 5000)).toEqual({ contanti: 6650, pos: 500, scontrini: 3, annulli: 2 });
    expect(msDi(inAttesa, 77)).toBe(77);
    const q = preparaQuadratura(A, { contanti: '60,50', pos: '5', nota: '  manca un resto ' }, tutti, 5000, '2026-11-10');
    expect(q).toEqual({ evento: 'ev1', cassa: 'Cassa 1', giorno: '2026-11-10', dal: 1000, fondo: 100, contanti: 60.5, pos: 5, attesoContanti: 66.5, attesoPos: 5, scontrini: 3, annulli: 2, nota: 'manca un resto' });
    expect(differenze(q)).toEqual({ contanti: -6, pos: 0, quadra: false });
    expect(preparaQuadratura(A, { contanti: '100', pos: '' }, [], 5000, '2026-11-10')).not.toHaveProperty('nota');
  });

  it('un annullo senza originale non cambia i conti', () => {
    const a = { ...scontrinoAnnullo(v('9', 5, 'contanti', 0) as ScontrinoArchivio, { idtrx: '10', progressivo: 'P10', cassa: 'Cassa 1', giorno: '2026-11-10' }), creatoIl: ora(2000) };
    expect(atteso([a], A, 3000)).toEqual({ contanti: 10000, pos: 0, scontrini: 0, annulli: 1 });
  });

  it('avvisi solo per le chiusure che non quadrano', () => {
    const base = { evento: 'ev1', cassa: 'Furgone', giorno: '2026-11-10', dal: 0, fondo: 0, scontrini: 1, annulli: 0 };
    const ok = { ...base, contanti: 10, pos: 5, attesoContanti: 10, attesoPos: 5 };
    const ko = { ...base, contanti: 12.3, pos: 4, attesoContanti: 10, attesoPos: 5 };
    expect(avvisiQuadrature([ok, ko, { ...ok, pos: 5.01 }], () => 'Sagra')).toEqual([
      'Quadratura Sagra · Furgone · 10/11/2026: contanti +2,30 €, carta −1,00 €',
      'Quadratura Sagra · Furgone · 10/11/2026: carta +0,01 €',
    ]);
  });
});
