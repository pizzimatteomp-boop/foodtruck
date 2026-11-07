import { dataRoma } from './oggi';

describe('data di oggi sul fuso di Roma', () => {
  it('a mezzanotte e mezza italiana è già il giorno dopo (in UTC sarebbe ancora ieri)', () => {
    expect(dataRoma(new Date('2026-11-06T23:30:00Z'))).toBe('2026-11-07');
    expect(dataRoma(new Date('2026-07-31T22:30:00Z'))).toBe('2026-08-01'); // ora legale
    expect(dataRoma(new Date('2026-11-07T10:00:00Z'))).toBe('2026-11-07');
  });
});

import { oggi } from './oggi';
it('fuori dalle prove, oggi è la data vera di Roma', () => {
  expect(oggi()).toBe(dataRoma());
});
