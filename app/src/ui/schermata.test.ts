import { messaggioErrore, vista } from './schermata';

describe('schermata di accesso', () => {
  it('all\'avvio non offre azioni', () => {
    expect(vista({ stato: 'avvio' }).azioni).toEqual([]);
  });

  it('fuori: solo il pulsante di accesso, con l\'eventuale errore', () => {
    expect(vista({ stato: 'fuori' })).toMatchObject({ azioni: ['accedi'] });
    expect(vista({ stato: 'fuori' }).errore).toBeUndefined();
    expect(vista({ stato: 'fuori', errore: 'Accesso annullato.' }).errore).toBe('Accesso annullato.');
  });

  it('non abilitato: mostra il codice da mandare al titolare', () => {
    const v = vista({ stato: 'non-abilitato', uid: 'abc123', email: 'anna@x.it' });
    expect(v.codice).toBe('abc123');
    expect(v.righe[0]).toContain('anna@x.it');
    expect(v.azioni).toEqual(['copia-codice', 'esci']);
    expect(vista({ stato: 'non-abilitato', uid: 'x', email: '' }).righe[0]).toContain('utente Google');
  });

  it('dentro: saluta per nome (o email) e mostra il ruolo', () => {
    const v = vista({ stato: 'dentro', nome: 'Matteo', email: 'm@x.it', ruolo: 'titolare' });
    expect(v.titolo).toBe('Ciao Matteo');
    expect(v.righe[0]).toBe('Ruolo: Titolare');
    expect(vista({ stato: 'dentro', nome: '', email: 'm@x.it', ruolo: 'cassa' }).titolo).toBe('Ciao m@x.it');
  });

  it('errori di accesso in italiano', () => {
    expect(messaggioErrore('auth/popup-closed-by-user')).toBe('Accesso annullato.');
    expect(messaggioErrore('auth/cancelled-popup-request')).toBe('Accesso annullato.');
    expect(messaggioErrore('auth/network-request-failed')).toContain('connessione');
    expect(messaggioErrore('auth/unauthorized-domain')).toContain('non è autorizzato');
    expect(messaggioErrore('auth/operation-not-allowed')).toContain('non è attivo');
    expect(messaggioErrore('auth/altro')).toContain('auth/altro');
    expect(messaggioErrore('')).toContain('errore sconosciuto');
  });
});
