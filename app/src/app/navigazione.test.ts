import { indirizzo, paginaDa, pagineVisibili, parametroDa } from './navigazione';

describe('pagine per ruolo', () => {
  it('il titolare vede tutte le pagine; la cassa anche la cassa di prova, il team la produzione, il magazziniere anche la stazione', () => {
    expect(pagineVisibili('titolare').map((p) => p.id)).toEqual(['home', 'vendi', 'prodotti', 'ingredienti', 'fatture', 'avvisi', 'produzione', 'inventario', 'stazione', 'resoconto', 'pubblica', 'allergeni', 'cassa', 'persone', 'importa']);
    expect(pagineVisibili('titolare').filter((p) => p.principale).map((p) => p.id)).toEqual(['home', 'vendi', 'prodotti', 'ingredienti', 'fatture', 'avvisi']);
    expect(pagineVisibili('cassa').map((p) => p.id)).toEqual(['home', 'vendi', 'cassa']);
    expect(pagineVisibili('team').map((p) => p.id)).toEqual(['home', 'produzione']);
    expect(pagineVisibili('magazziniere').map((p) => p.id)).toEqual(['home', 'produzione', 'inventario', 'stazione']);
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
    expect(pagineVisibili('titolare').map(indirizzo)).toEqual(['#/', '#/vendi', '#/prodotti', '#/ingredienti', '#/fatture', '#/avvisi', '#/produzione', '#/inventario', '#/stazione', '#/resoconto', '#/pubblica', '#/allergeni', '#/cassa', '#/persone', '#/importa']);
  });
});
