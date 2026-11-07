import { indirizzo, paginaDa, pagineVisibili, parametroDa } from './navigazione';

describe('pagine per ruolo', () => {
  it('il titolare vede tutte le pagine; cassa e team solo la Home', () => {
    expect(pagineVisibili('titolare').map((p) => p.id)).toEqual(['home', 'prodotti', 'ingredienti', 'fatture', 'pubblica', 'allergeni', 'persone', 'importa']);
    expect(pagineVisibili('titolare').filter((p) => p.principale).map((p) => p.id)).toEqual(['home', 'prodotti', 'ingredienti', 'fatture']);
    expect(pagineVisibili('cassa').map((p) => p.id)).toEqual(['home']);
    expect(pagineVisibili('team').map((p) => p.id)).toEqual(['home']);
  });

  it('dall\'indirizzo alla pagina', () => {
    expect(paginaDa('#/persone', 'titolare').id).toBe('persone');
    expect(paginaDa('#persone', 'titolare').id).toBe('persone');
    expect(paginaDa('#/persone?x=1', 'titolare').id).toBe('persone');
    expect(paginaDa('', 'titolare').id).toBe('home');
    expect(paginaDa('#/', 'titolare').id).toBe('home');
  });

  it('pagina sconosciuta o non permessa → Home', () => {
    expect(paginaDa('#/inesistente', 'titolare').id).toBe('home');
    expect(paginaDa('#/persone', 'cassa').id).toBe('home');
  });

  it('parametro della pagina (scheda di un ingrediente)', () => {
    expect(paginaDa('#/ingredienti/ceci', 'titolare').id).toBe('ingredienti');
    expect(parametroDa('#/ingredienti/ceci')).toBe('ceci');
    expect(parametroDa('#/ingredienti/olio%20extra?x=1')).toBe('olio extra');
    expect(parametroDa('#/ingredienti')).toBeNull();
    expect(parametroDa('')).toBeNull();
  });

  it('indirizzi', () => {
    expect(pagineVisibili('titolare').map(indirizzo)).toEqual(['#/', '#/prodotti', '#/ingredienti', '#/fatture', '#/pubblica', '#/allergeni', '#/persone', '#/importa']);
  });
});
