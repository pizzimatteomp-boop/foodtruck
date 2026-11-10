import { describe, expect, it } from 'vitest';
import { descriviEvento, ErroreEvento, eventiPerCassa, fuoriItalia, inCorso, preparaEvento, type Evento } from './eventi';

describe('eventi', () => {
  it('prepara: nome, giorni, luogo, Paese in maiuscolo, un solo giorno se manca la fine', () => {
    expect(preparaEvento({ nome: ' Sagra ', dal: '2026-11-10', luogo: ' Osimo ', paese: 'it' }))
      .toEqual({ nome: 'Sagra', dal: '2026-11-10', al: '2026-11-10', luogo: 'Osimo', paese: 'IT', stato: 'aperto' });
    expect(preparaEvento({ nome: 'X', dal: '2026-11-10', al: '2026-11-12' })).toEqual({ nome: 'X', dal: '2026-11-10', al: '2026-11-12', paese: 'IT', stato: 'aperto' });
    for (const [m, e] of [
      [{ nome: '', dal: '2026-11-10' }, /nome/], [{ nome: 'x'.repeat(81), dal: '2026-11-10' }, /lungo/],
      [{ nome: 'x', dal: '' }, /primo giorno/], [{ nome: 'x', dal: '2026-11-10', al: '2026-11-09' }, /ultimo giorno/],
      [{ nome: 'x', dal: '2026-11-10', paese: 'ITA' }, /Paese/], [{ nome: 'x', dal: '2026-11-10', luogo: 'y'.repeat(121) }, /Luogo/],
    ] as const) expect(() => preparaEvento(m)).toThrow(e as RegExp);
    expect(() => preparaEvento({ nome: '', dal: '' })).toThrow(ErroreEvento);
  });

  it('ordine per la cassa: in corso, prossimi, passati; i chiusi non si vedono', () => {
    const e = (id: string, dal: string, al: string, stato: Evento['stato'] = 'aperto'): Evento => ({ id, nome: id, dal, al, paese: 'IT', stato });
    const l = [e('passato', '2026-10-01', '2026-10-02'), e('vecchio', '2026-09-01', '2026-09-01'), e('poi', '2026-12-01', '2026-12-01'), e('presto', '2026-11-20', '2026-11-20'),
      e('oggi', '2026-11-09', '2026-11-11'), e('chiuso', '2026-11-10', '2026-11-10', 'chiuso'), e('oggi2', '2026-11-10', '2026-11-10')];
    expect(eventiPerCassa(l, '2026-11-10').map((x) => x.id)).toEqual(['oggi', 'oggi2', 'presto', 'poi', 'passato', 'vecchio']);
    expect(inCorso(l[4]!, '2026-11-11')).toBe(true);
    expect(inCorso(l[4]!, '2026-11-12')).toBe(false);
  });

  it('descrizione e Paese', () => {
    expect(descriviEvento({ id: 'a', nome: 'Sagra', dal: '2026-11-10', al: '2026-11-10', luogo: 'Osimo', paese: 'IT', stato: 'aperto' })).toBe('Sagra · 10/11 · Osimo');
    expect(descriviEvento({ id: 'b', nome: 'SMIAF', dal: '2026-05-01', al: '2026-05-03', paese: 'SM', stato: 'aperto' })).toBe('SMIAF · 01/05–03/05 · SM');
    expect(fuoriItalia({ paese: 'SM' })).toBe(true);
    expect(fuoriItalia({ paese: 'IT' })).toBe(false);
  });
});
