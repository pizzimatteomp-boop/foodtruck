import type { Profilo } from '../firebase/profilo';
import { codiceValido, ErrorePersona, ordinaPersone, preparaPersona } from './persone';

const UID = 'aB3dE5gH7jK9mN1pQ3sT5vW7yZ12';

describe('codice utente', () => {
  it('accetta i codici di Firebase e rifiuta il resto', () => {
    expect(codiceValido(UID)).toBe(true);
    expect(codiceValido('corto')).toBe(false);
    expect(codiceValido('con spazi dentro 1234')).toBe(false);
    expect(codiceValido('utenti/altro123456')).toBe(false);
  });
});

describe('preparazione dei dati di una persona', () => {
  it('ripulisce spazi e mette attivo per default', () => {
    expect(preparaPersona({ codice: ` ${UID} `, nome: ' Anna ', email: ' anna@x.it ', ruolo: 'cassa' }, 'tit')).toEqual({
      uid: UID, dati: { ruolo: 'cassa', attivo: true, nome: 'Anna', email: 'anna@x.it' },
    });
  });

  it('email facoltativa', () => {
    expect(preparaPersona({ codice: UID, nome: 'Luca', ruolo: 'team', attivo: false }, 'tit').dati)
      .toEqual({ ruolo: 'team', attivo: false, nome: 'Luca', email: '' });
  });

  it('errori comprensibili', () => {
    const p = (x: Partial<Parameters<typeof preparaPersona>[0]>) =>
      () => preparaPersona({ codice: UID, nome: 'Anna', ruolo: 'cassa', ...x }, 'tit');
    expect(p({ codice: 'x' })).toThrow('Codice utente non valido');
    expect(p({ nome: '  ' })).toThrow('Scrivi il nome');
    expect(p({ nome: 'x'.repeat(81) })).toThrow('troppo lungo');
    expect(p({ ruolo: 'admin' })).toThrow('Scegli un ruolo');
    expect(p({ email: 'non-una-email' })).toThrow('Email non valida');
    expect(p({ ruolo: '' })).toThrow(ErrorePersona);
  });

  it('il titolare non può togliersi il ruolo né disattivarsi', () => {
    expect(() => preparaPersona({ codice: UID, nome: 'Matteo', ruolo: 'cassa' }, UID)).toThrow('titolare');
    expect(() => preparaPersona({ codice: UID, nome: 'Matteo', ruolo: 'titolare', attivo: false }, UID)).toThrow('titolare');
    expect(preparaPersona({ codice: UID, nome: 'Matteo', ruolo: 'titolare' }, UID).dati.ruolo).toBe('titolare');
  });
});

describe('ordine dell\'elenco', () => {
  const p = (nome: string, ruolo: Profilo['ruolo'], attivo = true): Profilo => ({ uid: nome, nome, ruolo, attivo, email: '' });
  it('attivi prima, poi titolare, cassa, team, poi alfabetico', () => {
    const r = ordinaPersone([p('Zoe', 'team'), p('Ex', 'cassa', false), p('Bea', 'cassa'), p('Matteo', 'titolare'), p('Anna', 'cassa')]);
    expect(r.map((x) => x.nome)).toEqual(['Matteo', 'Anna', 'Bea', 'Zoe', 'Ex']);
  });
});
