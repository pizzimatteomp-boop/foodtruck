import { eRuolo, puo } from './ruoli';
import { profiloDa } from './profilo';

describe('permessi per ruolo', () => {
  it('il titolare può tutto, anche gestire le persone e vedere i report', () => {
    expect(puo('titolare', 'utenti')).toBe(true);
    expect(puo('titolare', 'report')).toBe(true);
    expect(puo('titolare', 'acquisti')).toBe(true);
  });

  it('la cassa fa comande, scontrini, movimenti e quadratura, ma non vede acquisti e report', () => {
    expect(puo('cassa', 'scontrini')).toBe(true);
    expect(puo('cassa', 'movimenti:registra')).toBe(true);
    expect(puo('cassa', 'quadratura:registra')).toBe(true);
    expect(puo('cassa', 'acquisti')).toBe(false);
    expect(puo('cassa', 'report')).toBe(false);
  });

  it('il team legge eventi e ricette e registra la produzione', () => {
    expect(puo('team', 'eventi:leggi')).toBe(true);
    expect(puo('team', 'produzione')).toBe(true);
    expect(puo('team', 'eventi:modifica')).toBe(false);
    expect(puo('team', 'comande')).toBe(false);
    expect(puo('team', 'magazzino')).toBe(false);
  });

  it('il magazziniere: produzione, etichette e magazzino; niente cassa né acquisti', () => {
    expect(puo('magazziniere', 'produzione')).toBe(true);
    expect(puo('magazziniere', 'magazzino')).toBe(true);
    expect(puo('magazziniere', 'scontrini')).toBe(false);
    expect(puo('magazziniere', 'acquisti')).toBe(false);
    expect(eRuolo('magazziniere')).toBe(true);
  });

  it('senza ruolo non si può nulla', () => {
    expect(puo(null, 'eventi:leggi')).toBe(false);
    expect(puo(undefined, 'comande')).toBe(false);
  });

  it('riconosce solo i ruoli previsti', () => {
    expect(eRuolo('cassa')).toBe(true);
    expect(eRuolo('admin')).toBe(false);
    expect(eRuolo(3)).toBe(false);
  });
});

describe('profilo letto dal database', () => {
  it('profilo completo', () => {
    expect(profiloDa('u1', { ruolo: 'cassa', attivo: true, nome: 'Anna', email: 'a@x.it' }))
      .toEqual({ uid: 'u1', ruolo: 'cassa', attivo: true, nome: 'Anna', email: 'a@x.it' });
  });

  it('nome ed email mancanti diventano vuoti', () => {
    expect(profiloDa('u1', { ruolo: 'team', attivo: false })).toEqual({ uid: 'u1', ruolo: 'team', attivo: false, nome: '', email: '' });
  });

  it('dati non validi → nessun profilo', () => {
    expect(profiloDa('u1', null)).toBeNull();
    expect(profiloDa('u1', 'x')).toBeNull();
    expect(profiloDa('u1', { ruolo: 'admin', attivo: true })).toBeNull();
    expect(profiloDa('u1', { ruolo: 'team', attivo: 'si' })).toBeNull();
  });
});
