/**
 * Regole del database (firestore.rules) provate sull'emulatore, con le persone dei tre ruoli.
 * Ogni test parte da un database pulito con: Matteo titolare, Anna cassa, Luca team,
 * Ex (cassa disattivata) e Nuovo (collegato ma mai abilitato).
 */
import { readFileSync } from 'node:fs';
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, type Firestore,
} from 'firebase/firestore';
import { leggiProfilo } from '../../src/firebase/profilo';

let env: RulesTestEnvironment;

const PERSONE = {
  matteo: { ruolo: 'titolare', attivo: true, nome: 'Matteo' },
  anna: { ruolo: 'cassa', attivo: true, nome: 'Anna' },
  luca: { ruolo: 'team', attivo: true, nome: 'Luca' },
  ex: { ruolo: 'cassa', attivo: false, nome: 'Ex' },
} as const;
type Chi = keyof typeof PERSONE | 'nuovo';

const db = (chi: Chi): Firestore => env.authenticatedContext(chi).firestore() as unknown as Firestore;
const anonimo = (): Firestore => env.unauthenticatedContext().firestore() as unknown as Firestore;

const firma = (chi: Chi) => ({ creatoDa: chi, creatoIl: serverTimestamp() });
const scontrino = (chi: Chi, extra: Record<string, unknown> = {}) => ({
  tipo: 'V', idtrx: '265328092', progressivo: 'DCW2026/6535-7349', evento: 'ev1', totale: 1.5, ...firma(chi), ...extra,
});
const movimento = (chi: Chi, extra: Record<string, unknown> = {}) => ({
  tipo: 'pasto_staff', prodotto: 'Kebab', quantita: 1, motivo: 'pranzo staff', evento: 'ev1', ...firma(chi), ...extra,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-vegman',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(() => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    for (const [uid, p] of Object.entries(PERSONE)) await setDoc(doc(d, 'utenti', uid), p);
    await setDoc(doc(d, 'eventi', 'ev1'), { nome: 'Festa di Osimo' });
    await setDoc(doc(d, 'eventi', 'ev1', 'checklist', 'v1'), { voce: 'Friggitrice', fatto: false });
    await setDoc(doc(d, 'ricette', 'r1'), { nome: 'Kebab' });
    await setDoc(doc(d, 'acquisti', 'a1'), { fornitore: 'X', totale: 100 });
    await setDoc(doc(d, 'scontrini', 's1'), { tipo: 'V', totale: 1.5 });
    await setDoc(doc(d, 'movimenti', 'm1'), { tipo: 'scarto' });
    await setDoc(doc(d, 'comande', 'c1'), { stato: 'aperta' });
  });
});

describe('chi non è abilitato non entra', () => {
  it('senza accesso: niente', async () => {
    await assertFails(getDoc(doc(anonimo(), 'eventi', 'ev1')));
    await assertFails(getDoc(doc(anonimo(), 'utenti', 'matteo')));
  });

  it('collegato ma mai abilitato: niente, nemmeno il proprio profilo', async () => {
    await assertFails(getDoc(doc(db('nuovo'), 'eventi', 'ev1')));
    await assertFails(getDoc(doc(db('nuovo'), 'utenti', 'nuovo')));
    expect(await leggiProfilo(db('nuovo'), 'nuovo')).toBeNull();
  });

  it('disattivato: niente, anche se il ruolo era cassa', async () => {
    await assertFails(getDoc(doc(db('ex'), 'eventi', 'ev1')));
    await assertFails(addDoc(collection(db('ex'), 'scontrini'), scontrino('ex')));
  });

  it('non si può creare il proprio profilo da soli', async () => {
    await assertFails(setDoc(doc(db('nuovo'), 'utenti', 'nuovo'), { ruolo: 'titolare', attivo: true }));
  });

  it('collezioni non previste: chiuse anche al titolare', async () => {
    await assertFails(setDoc(doc(db('matteo'), 'segreti', 'x'), { a: 1 }));
  });
});

describe('persone e ruoli', () => {
  it('ognuno legge il proprio profilo, il titolare tutti', async () => {
    expect(await leggiProfilo(db('anna'), 'anna')).toMatchObject({ ruolo: 'cassa', attivo: true });
    await assertFails(getDoc(doc(db('anna'), 'utenti', 'luca')));
    await assertSucceeds(getDocs(collection(db('matteo'), 'utenti')));
  });

  it('solo il titolare assegna i ruoli', async () => {
    await assertSucceeds(setDoc(doc(db('matteo'), 'utenti', 'nuovo'), { ruolo: 'team', attivo: true, nome: 'Nuovo' }));
    await assertFails(updateDoc(doc(db('anna'), 'utenti', 'anna'), { ruolo: 'titolare' }));
  });

  it('ruoli inventati o campi in più: rifiutati', async () => {
    await assertFails(setDoc(doc(db('matteo'), 'utenti', 'nuovo'), { ruolo: 'admin', attivo: true }));
    await assertFails(setDoc(doc(db('matteo'), 'utenti', 'nuovo'), { ruolo: 'team', attivo: true, paga: 10 }));
  });

  it('il titolare non può chiudersi fuori da solo', async () => {
    await assertFails(updateDoc(doc(db('matteo'), 'utenti', 'matteo'), { attivo: false }));
    await assertFails(updateDoc(doc(db('matteo'), 'utenti', 'matteo'), { ruolo: 'team' }));
    await assertFails(deleteDoc(doc(db('matteo'), 'utenti', 'matteo')));
    await assertSucceeds(updateDoc(doc(db('matteo'), 'utenti', 'luca'), { attivo: false }));
  });
});

describe('anagrafiche, acquisti, eventi', () => {
  it('il team legge eventi, checklist e ricette ma non li modifica', async () => {
    await assertSucceeds(getDoc(doc(db('luca'), 'eventi', 'ev1')));
    await assertSucceeds(getDoc(doc(db('luca'), 'eventi', 'ev1', 'checklist', 'v1')));
    await assertSucceeds(getDoc(doc(db('luca'), 'ricette', 'r1')));
    await assertFails(updateDoc(doc(db('luca'), 'eventi', 'ev1', 'checklist', 'v1'), { fatto: true }));
    await assertFails(updateDoc(doc(db('anna'), 'ricette', 'r1'), { nome: 'Altro' }));
    await assertSucceeds(updateDoc(doc(db('matteo'), 'eventi', 'ev1'), { nome: 'Festa' }));
  });

  it('fatture e prezzi d\'acquisto: solo il titolare', async () => {
    await assertSucceeds(getDoc(doc(db('matteo'), 'acquisti', 'a1')));
    await assertFails(getDoc(doc(db('anna'), 'acquisti', 'a1')));
    await assertFails(getDoc(doc(db('luca'), 'acquisti', 'a1')));
  });
});

describe('comande', () => {
  it('la cassa apre e aggiorna, il team no, cancella solo il titolare', async () => {
    await assertSucceeds(addDoc(collection(db('anna'), 'comande'), { stato: 'aperta' }));
    await assertSucceeds(updateDoc(doc(db('anna'), 'comande', 'c1'), { stato: 'pagata' }));
    await assertFails(addDoc(collection(db('luca'), 'comande'), { stato: 'aperta' }));
    await assertFails(deleteDoc(doc(db('anna'), 'comande', 'c1')));
    await assertSucceeds(deleteDoc(doc(db('matteo'), 'comande', 'c1')));
  });
});

describe('scontrini: si registrano e basta', () => {
  it('la cassa registra una vendita firmata', async () => {
    await assertSucceeds(addDoc(collection(db('anna'), 'scontrini'), scontrino('anna')));
  });

  it('nessuno modifica o cancella uno scontrino, nemmeno il titolare', async () => {
    await assertFails(updateDoc(doc(db('matteo'), 'scontrini', 's1'), { totale: 0 }));
    await assertFails(deleteDoc(doc(db('matteo'), 'scontrini', 's1')));
    await assertFails(deleteDoc(doc(db('anna'), 'scontrini', 's1')));
  });

  it('firma obbligatoria: non a nome di altri né con l\'ora del telefono', async () => {
    await assertFails(addDoc(collection(db('anna'), 'scontrini'), scontrino('anna', { creatoDa: 'matteo' })));
    await assertFails(addDoc(collection(db('anna'), 'scontrini'), scontrino('anna', { creatoIl: new Date() })));
  });

  it('annullo e reso devono citare lo scontrino originale', async () => {
    await assertFails(addDoc(collection(db('anna'), 'scontrini'), scontrino('anna', { tipo: 'A' })));
    await assertSucceeds(addDoc(collection(db('anna'), 'scontrini'),
      scontrino('anna', { tipo: 'A', progressivoOriginale: 'DCW2026/6535-7349' })));
  });

  it('dati mancanti o tipo sconosciuto: rifiutato', async () => {
    await assertFails(addDoc(collection(db('anna'), 'scontrini'), scontrino('anna', { tipo: 'X' })));
    await assertFails(addDoc(collection(db('anna'), 'scontrini'), scontrino('anna', { idtrx: '' })));
    await assertFails(addDoc(collection(db('anna'), 'scontrini'), scontrino('anna', { totale: -1 })));
  });

  it('il team non registra né legge scontrini', async () => {
    await assertFails(addDoc(collection(db('luca'), 'scontrini'), scontrino('luca')));
    await assertFails(getDoc(doc(db('luca'), 'scontrini', 's1')));
  });
});

describe('movimenti senza incasso', () => {
  it('pasto staff, prova e scarto registrati dalla cassa', async () => {
    for (const tipo of ['pasto_staff', 'prova', 'scarto']) {
      await assertSucceeds(addDoc(collection(db('anna'), 'movimenti'), movimento('anna', { tipo })));
    }
  });

  it('omaggio, anche con lo scontrino della riga a 0 €', async () => {
    await assertSucceeds(addDoc(collection(db('anna'), 'movimenti'), movimento('anna', { tipo: 'omaggio', scontrino: 's1' })));
  });

  it('nessun campo di incasso: se c\'è un pagamento è una vendita', async () => {
    for (const campo of ['importo', 'incasso', 'pagato', 'prezzo']) {
      await assertFails(addDoc(collection(db('anna'), 'movimenti'), movimento('anna', { [campo]: 5 })));
    }
  });

  it('solo i tipi previsti, con motivo e quantità', async () => {
    await assertFails(addDoc(collection(db('anna'), 'movimenti'), movimento('anna', { tipo: 'vendita' })));
    await assertFails(addDoc(collection(db('anna'), 'movimenti'), movimento('anna', { motivo: '' })));
    await assertFails(addDoc(collection(db('anna'), 'movimenti'), movimento('anna', { quantita: 0 })));
    await assertFails(addDoc(collection(db('anna'), 'movimenti'), movimento('anna', { tipo: 'scarto', scontrino: 's1' })));
  });

  it('non si modificano né cancellano; li vede solo il titolare', async () => {
    await assertFails(updateDoc(doc(db('matteo'), 'movimenti', 'm1'), { tipo: 'prova' }));
    await assertFails(deleteDoc(doc(db('matteo'), 'movimenti', 'm1')));
    await assertSucceeds(getDoc(doc(db('matteo'), 'movimenti', 'm1')));
    await assertFails(getDoc(doc(db('anna'), 'movimenti', 'm1')));
    await assertFails(addDoc(collection(db('luca'), 'movimenti'), movimento('luca')));
  });
});

describe('quadratura di cassa e registro', () => {
  it('la cassa registra la conta, la vede il titolare, non si cambia', async () => {
    const ref = await assertSucceeds(addDoc(collection(db('anna'), 'quadrature'), { evento: 'ev1', contanti: 320, pos: 540.5, ...firma('anna') }));
    await assertFails(getDoc(doc(db('anna'), 'quadrature', ref.id)));
    await assertSucceeds(getDoc(doc(db('matteo'), 'quadrature', ref.id)));
    await assertFails(updateDoc(doc(db('matteo'), 'quadrature', ref.id), { contanti: 300 }));
    await assertFails(addDoc(collection(db('anna'), 'quadrature'), { evento: 'ev1', contanti: -5, pos: 0, ...firma('anna') }));
  });

  it('registro: tutti aggiungono, solo il titolare legge, nessuno cancella', async () => {
    const ref = await assertSucceeds(addDoc(collection(db('luca'), 'registro'), { azione: 'checklist vista', ...firma('luca') }));
    await assertFails(getDoc(doc(db('luca'), 'registro', ref.id)));
    await assertSucceeds(getDoc(doc(db('matteo'), 'registro', ref.id)));
    await assertFails(deleteDoc(doc(db('matteo'), 'registro', ref.id)));
  });
});
