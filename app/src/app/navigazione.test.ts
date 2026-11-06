import { indirizzo, paginaDa, pagineVisibili } from './navigazione';

describe('pagine per ruolo', () => {
  it('il titolare vede Home, Persone e Importa; cassa e team solo la Home', () => {
    expect(pagineVisibili('titolare').map((p) => p.id)).toEqual(['home', 'persone', 'importa']);
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

  it('indirizzi', () => {
    expect(pagineVisibili('titolare').map(indirizzo)).toEqual(['#/', '#/persone', '#/importa']);
  });
});
