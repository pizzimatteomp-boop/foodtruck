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
import { leggiProfilo } from '../../src/firebase/profilo.db';
import { preparaPersona } from '../../src/persone/persone';
import { elencaPersone, salvaPersona } from '../../src/persone/persone.db';
import { leggiPlanner } from '../../src/importazione/planner';
import { salvaImportPlanner } from '../../src/importazione/salva.db';
import { collegaArticolo, salvaIngrediente, unisciIngredienti } from '../../src/ingredienti/operazioni.db';
import type { Articolo, Prodotto } from '../../src/foodcost/modello';
import { readFileSync as leggiFile } from 'node:fs';
import { leggiFatturaPA } from '../../src/fatture/fatturapa';
import { pianoFatture } from '../../src/fatture/piano';
import { salvaAcquistoManuale, salvaFatture } from '../../src/fatture/salva.db';
import { preparaAcquistoManuale } from '../../src/fatture/manuale';

let env: RulesTestEnvironment;

const PERSONE = {
  matteo: { ruolo: 'titolare', attivo: true, nome: 'Matteo' },
  anna: { ruolo: 'cassa', attivo: true, nome: 'Anna' },
  luca: { ruolo: 'team', attivo: true, nome: 'Luca' },
  ex: { ruolo: 'cassa', attivo: false, nome: 'Ex' },
} as const;
type Chi = keyof typeof PERSONE | 'nuovo' | (string & {});

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
    await setDoc(doc(d, 'prodotti', 'r1'), { nome: 'Kebab' });
    await setDoc(doc(d, 'ingredienti', 'i1'), { nome: 'Ceci', categoria: 'alimentare', unita: 'g', gruppo: '', confezione: null });
    await setDoc(doc(d, 'articoli', 'art1'), { nome: 'CECI 5 KG', unita: 'PZ', categoria: null, ingrediente: null, fattore: 1 });
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
    await assertSucceeds(getDoc(doc(db('luca'), 'prodotti', 'r1')));
    await assertSucceeds(getDoc(doc(db('luca'), 'ingredienti', 'i1')));
    await assertFails(updateDoc(doc(db('luca'), 'eventi', 'ev1', 'checklist', 'v1'), { fatto: true }));
    await assertFails(updateDoc(doc(db('anna'), 'prodotti', 'r1'), { nome: 'Altro' }));
    await assertFails(setDoc(doc(db('luca'), 'ingredienti', 'i2'), { nome: 'X' }));
    await assertSucceeds(updateDoc(doc(db('matteo'), 'eventi', 'ev1'), { nome: 'Festa' }));
  });

  it('fatture, articoli e prezzi d\'acquisto: solo il titolare', async () => {
    for (const c of ['acquisti', 'articoli']) {
      const id = c === 'acquisti' ? 'a1' : 'art1';
      await assertSucceeds(getDoc(doc(db('matteo'), c, id)));
      await assertFails(getDoc(doc(db('anna'), c, id)));
      await assertFails(getDoc(doc(db('luca'), c, id)));
      await assertFails(setDoc(doc(db('anna'), c, 'nuovo'), { x: 1 }));
    }
  });

  it('registro degli import: lo scrive solo il titolare, firmato, e non si cambia', async () => {
    const ref = await assertSucceeds(addDoc(collection(db('matteo'), 'importazioni'), { origine: 'planner', ...firma('matteo') }));
    await assertFails(addDoc(collection(db('matteo'), 'importazioni'), { origine: 'altro', ...firma('matteo') }));
    await assertFails(addDoc(collection(db('anna'), 'importazioni'), { origine: 'planner', ...firma('anna') }));
    await assertFails(updateDoc(doc(db('matteo'), 'importazioni', ref.id), { origine: 'fatture' }));
    await assertFails(getDoc(doc(db('luca'), 'importazioni', ref.id)));
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

describe('gestione persone dall\'app (modulo persone.ts)', () => {
  const UID_NUOVO = 'NuovoUtente0123456789abcdef';

  it('il titolare vede tutti in ordine e abilita una persona nuova', async () => {
    const prima = await elencaPersone(db('matteo'));
    expect(prima.map((p) => p.nome)).toEqual(['Matteo', 'Anna', 'Luca', 'Ex']);
    const { uid, dati } = preparaPersona({ codice: UID_NUOVO, nome: 'Giulia', ruolo: 'cassa' }, 'matteo');
    await salvaPersona(db('matteo'), uid, dati);
    expect(await leggiProfilo(db(UID_NUOVO as Chi), UID_NUOVO)).toMatchObject({ ruolo: 'cassa', attivo: true, nome: 'Giulia' });
  });

  it('la cassa non può elencare né abilitare persone', async () => {
    await assertFails(elencaPersone(db('anna')));
    await assertFails(salvaPersona(db('anna'), UID_NUOVO, { ruolo: 'team', attivo: true, nome: 'X', email: '' }));
  });
});

describe('import da VegMan Planner nel database', () => {
  const backup = {
    ingredients: [{ id: 'i-pan', name: 'Panino', unit: 'pz', priceArticleId: 'a-pan', priceFactor: 15 }],
    products: [{ id: 'p-cas', name: 'Casciù', kind: 'sellable', price: 10, yieldQty: 1, recipe: [{ refType: 'ingredient', refId: 'i-pan', qty: 1 }] }],
    purchases: [{ id: 'r1', date: '2026-05-14', supplier: 'METRO', description: 'PANINI', qty: 3, unit: 'CO', unitPrice: 13.8, articleId: 'a-pan' }],
    priceArticles: [{ id: 'a-pan', name: 'PANINI', unit: 'CO' }],
  };

  it('il titolare importa; rifarlo non crea doppioni; il team vede ingredienti e prodotti ma non i prezzi', async () => {
    const r = leggiPlanner(backup);
    await salvaImportPlanner(db('matteo'), r, 'matteo');
    await salvaImportPlanner(db('matteo'), r, 'matteo');
    expect((await getDocs(collection(db('matteo'), 'acquisti'))).docs.filter((d) => d.id === 'r1')).toHaveLength(1);
    expect((await getDoc(doc(db('matteo'), 'articoli', 'a-pan'))).data()).toMatchObject({ ingrediente: 'i-pan', fattore: 15 });
    expect((await getDocs(collection(db('matteo'), 'importazioni'))).size).toBe(2);
    await assertSucceeds(getDoc(doc(db('luca'), 'prodotti', 'p-cas')));
    await assertSucceeds(getDoc(doc(db('luca'), 'ingredienti', 'i-pan')));
    await assertFails(getDoc(doc(db('luca'), 'acquisti', 'r1')));
    await assertFails(getDoc(doc(db('luca'), 'articoli', 'a-pan')));
  });

  it('la cassa non può importare', async () => {
    await assertFails(salvaImportPlanner(db('anna'), leggiPlanner(backup), 'anna'));
  });
});

describe('ingredienti e articoli: solo dati in forma corretta', () => {
  const ing = { nome: 'Tovagliolo', categoria: 'packaging', unita: 'pz', gruppo: '', confezione: 500 };
  const art = { nome: 'CECI 5 KG', unita: 'PZ', categoria: 'alimentare', ingrediente: 'i1', fattore: 5000 };

  it('il titolare crea e modifica; categoria, unità e confezione controllate', async () => {
    await assertSucceeds(setDoc(doc(db('matteo'), 'ingredienti', 'tov'), ing));
    await assertFails(setDoc(doc(db('matteo'), 'ingredienti', 'x'), { ...ing, categoria: 'non_alimentare' }));
    await assertFails(setDoc(doc(db('matteo'), 'ingredienti', 'x'), { ...ing, nome: '' }));
    await assertFails(setDoc(doc(db('matteo'), 'ingredienti', 'x'), { ...ing, confezione: 0 }));
    await assertFails(setDoc(doc(db('matteo'), 'ingredienti', 'x'), { ...ing, prezzo: 3 }));
    await assertSucceeds(deleteDoc(doc(db('matteo'), 'ingredienti', 'tov')));
  });

  it('collegamento articolo → ingrediente con conversione positiva', async () => {
    await assertSucceeds(setDoc(doc(db('matteo'), 'articoli', 'art1'), art));
    await assertSucceeds(setDoc(doc(db('matteo'), 'articoli', 'art1'), { ...art, ingrediente: null, categoria: 'non_alimentare' }));
    await assertFails(setDoc(doc(db('matteo'), 'articoli', 'art1'), { ...art, fattore: 0 }));
    await assertFails(setDoc(doc(db('matteo'), 'articoli', 'art1'), { ...art, categoria: 'altro' }));
    await assertFails(setDoc(doc(db('anna'), 'articoli', 'art1'), art));
  });
});

describe('operazioni sugli ingredienti nel database', () => {
  it('crea, collega un articolo, unisce un doppione aggiornando le ricette', async () => {
    const m = db('matteo');
    const ceci = await salvaIngrediente(m, null, { nome: 'Ceci', categoria: 'alimentare', unita: 'g', gruppo: '', confezione: null });
    const doppio = await salvaIngrediente(m, 'ceci-doppio', { nome: 'Ceci secchi', categoria: 'alimentare', unita: 'g', gruppo: '', confezione: null });
    const art: Articolo = { id: 'art-ceci', nome: 'CECI 5 KG', unita: 'PZ', categoria: null, ingrediente: null, fattore: 1 };
    await collegaArticolo(m, art, doppio, 5000, 'alimentare');
    const collegato = (await getDoc(doc(m, 'articoli', 'art-ceci'))).data() as Omit<Articolo, 'id'>;
    expect(collegato).toMatchObject({ ingrediente: 'ceci-doppio', fattore: 5000, categoria: 'alimentare' });
    const hummus: Prodotto = { id: 'hummus', nome: 'Hummus', tipo: 'vendibile', gruppo: '', prezzo: 5, resa: { quantita: 1, unita: 'pz' }, quotaVendite: 0,
      ricetta: [{ tipo: 'ingrediente', id: 'ceci-doppio', quantita: 100 }] };
    const { id: _h, ...datiHummus } = hummus;
    await setDoc(doc(m, 'prodotti', 'hummus'), datiHummus);
    await unisciIngredienti(m, 'ceci-doppio', ceci, [hummus], [{ ...art, ...collegato, id: 'art-ceci' }]);
    expect((await getDoc(doc(m, 'ingredienti', 'ceci-doppio'))).exists()).toBe(false);
    expect((await getDoc(doc(m, 'articoli', 'art-ceci'))).data()).toMatchObject({ ingrediente: ceci });
    expect((await getDoc(doc(m, 'prodotti', 'hummus'))).data()!.ricetta).toEqual([{ tipo: 'ingrediente', id: ceci, quantita: 100 }]);
  });
});

describe('fatture nel database', () => {
  const fattura = leggiFatturaPA(leggiFile('tests/fatture/fattura-inventata.xml', 'utf8'))[0]!;
  const vuoto = { fatture: new Set<string>(), acquisti: [], articoli: [] };

  it('il titolare carica: fattura, righe e articoli nuovi; la fattura non si modifica', async () => {
    const m = db('matteo');
    const p = pianoFatture([{ file: 'f.xml', fattura }], vuoto);
    await salvaFatture(m, p, 'matteo');
    expect((await getDocs(collection(m, 'acquisti'))).docs.filter((d) => d.data().origine === 'fattura')).toHaveLength(3);
    expect((await getDoc(doc(m, 'articoli', p.articoliNuovi[0]!.id))).data()).toMatchObject({ categoria: null, fornitore: fattura.fornitore.nome, codice: 'CEC5' });
    await assertFails(updateDoc(doc(m, 'fatture', p.fatture[0]!.id), { totale: 0 }));
    await assertFails(getDoc(doc(db('anna'), 'fatture', p.fatture[0]!.id)));
    await assertFails(salvaFatture(db('anna'), pianoFatture([{ file: 'f.xml', fattura: { ...fattura, numero: 'altra' } }], vuoto), 'anna'));
  });

  it('acquisto manuale: articolo collegato e riga di acquisto', async () => {
    const ing = { id: 'i1', nome: 'Ceci', categoria: 'alimentare' as const, unita: 'g', gruppo: '', confezione: null };
    const r = preparaAcquistoManuale({ data: '2026-11-01', fornitore: 'Contadino', quantita: 1000, totale: 3 }, ing, '2026-11-07');
    await salvaAcquistoManuale(db('matteo'), r.articolo, r.acquisto);
    expect((await getDoc(doc(db('matteo'), 'acquisti', r.acquisto.id))).data()).toMatchObject({ origine: 'manuale', quantita: 1000 });
    await assertFails(salvaAcquistoManuale(db('luca'), r.articolo, r.acquisto));
  });
});
