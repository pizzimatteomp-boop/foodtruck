import { linguaDa } from './MenuPubblico';

describe('lingua del menu pubblico', () => {
  it('scelta dall\'indirizzo, altrimenti dalla lingua del telefono (italiano → it, il resto → en)', () => {
    expect(linguaDa('#/menu?lang=en', 'it-IT')).toBe('en');
    expect(linguaDa('#/menu?lang=it', 'de-DE')).toBe('it');
    expect(linguaDa('#/menu', 'it-IT')).toBe('it');
    expect(linguaDa('#/menu', 'fr-FR')).toBe('en');
    expect(linguaDa('#/menu?lang=xx', 'IT')).toBe('it');
  });
});
