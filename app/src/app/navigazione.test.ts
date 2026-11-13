import { GRUPPI, indirizzo, pagineMenu, paginaDa, pagineVisibili, parametroDa } from './navigazione';

describe('pagine per ruolo', () => {
  it('il titolare vede tutte le pagine; gli altri solo le proprie, senza Home', () => {
    expect(pagineVisibili('titolare').map((p) => p.id)).toEqual(['home', 'vendi', 'prodotti', 'ingredienti', 'fatture', 'avvisi', 'produzione', 'carico', 'inventario', 'magazzino', 'stazione', 'eventi', 'resoconto', 'pubblica', 'allergeni', 'persone']);
    expect(pagineVisibili('titolare').filter((p) => p.principale).map((p) => p.id)).toEqual(['home', 'vendi', 'prodotti', 'ingredienti', 'fatture', 'avvisi']);
    expect(pagineVisibili('cassa').map((p) => p.id)).toEqual(['vendi']);
    expect(pagineVisibili('team').map((p) => p.id)).toEqual(['produzione', 'carico']);
    expect(pagineVisibili('magazziniere').map((p) => p.id)).toEqual(['produzione', 'carico', 'inventario', 'stazione']);
  });

  it('ogni pagina del titolare sta in una sezione della Home', () => {
    for (const p of pagineVisibili('titolare')) expect(GRUPPI).toContain(p.gruppo);
  });

  it('dall\'indirizzo alla pagina', () => {
    expect(paginaDa('#/persone', 'titolare').id).toBe('persone');
    expect(paginaDa('#persone', 'titolare').id).toBe('persone');
    expect(paginaDa('#/persone?x=1', 'titolare').id).toBe('persone');
    expect(paginaDa('', 'titolare').id).toBe('home');
    expect(paginaDa('#/', 'titolare').id).toBe('home');
  });

  it('pagina sconosciuta o non permessa → la prima del ruolo (Home per il titolare)', () => {
    expect(paginaDa('#/inesistente', 'titolare').id).toBe('home');
    expect(paginaDa('#/persone', 'cassa').id).toBe('vendi');
    expect(paginaDa('#/', 'cassa').id).toBe('vendi');
    expect(paginaDa('', 'team').id).toBe('produzione');
    expect(paginaDa('#/', 'magazziniere').id).toBe('produzione');
  });

  it('parametro della pagina (scheda di un ingrediente)', () => {
    expect(paginaDa('#/ingredienti/ceci', 'titolare').id).toBe('ingredienti');
    expect(parametroDa('#/ingredienti/ceci')).toBe('ceci');
    expect(parametroDa('#/ingredienti/olio%20extra?x=1')).toBe('olio extra');
    expect(parametroDa('#/ingredienti')).toBeNull();
    expect(parametroDa('')).toBeNull();
  });

  it('indirizzi', () => {
    expect(pagineVisibili('titolare').map(indirizzo)).toEqual(['#/', '#/vendi', '#/prodotti', '#/ingredienti', '#/fatture', '#/avvisi', '#/produzione', '#/carico', '#/inventario', '#/magazzino', '#/stazione', '#/eventi', '#/resoconto', '#/pubblica', '#/allergeni', '#/persone']);
  });

  it('«Importa» (VegMan Planner) non c\'è più nell\'app: né menu, né Home, né indirizzo', () => {
    expect(pagineMenu('titolare').map((p) => p.id)).not.toContain('importa');
    expect(paginaDa('#/importa', 'titolare').id).toBe('home');
  });
});
