/**
 * Prova completa nel browser, con gli emulatori e le regole vere (firestore.rules):
 * una persona nuova entra e vede il suo codice → il titolare la abilita come cassa → lei rientra e vede il ruolo.
 */
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

const richiedi = createRequire(import.meta.url);

const PROGETTO = 'demo-vegman';
const AUTH = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROGETTO}`;
const FIRESTORE = `http://127.0.0.1:8080/v1/projects/${PROGETTO}/databases/(default)/documents`;
const PROPRIETARIO = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

const MATTEO = { uid: 'matteoTitolare0001', email: 'matteo@vegman.test', nome: 'Matteo' };
const GIULIA = { uid: 'giuliaNuova0000001', email: 'giulia@vegman.test', nome: 'Giulia' };

async function creaUtenteGoogle(u: typeof MATTEO): Promise<void> {
  const r = await fetch(`${AUTH}/accounts`, {
    method: 'POST',
    headers: PROPRIETARIO,
    body: JSON.stringify({
      localId: u.uid, email: u.email, emailVerified: true, displayName: u.nome,
      providerUserInfo: [{ providerId: 'google.com', rawId: `g-${u.uid}`, email: u.email, displayName: u.nome }],
    }),
  });
  expect(r.ok, await r.text()).toBe(true);
}

// Data di prova fissa (7/11/2026): prezzi, medie e storico non cambiano col passare dei mesi.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('vegman-oggi', '2026-11-07'));
});

test.beforeAll(async () => {
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROGETTO}/accounts`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROGETTO}/databases/(default)/documents`, { method: 'DELETE' });
  await creaUtenteGoogle(MATTEO);
  await creaUtenteGoogle(GIULIA);
  // Il profilo del titolare si crea dalla console (una volta sola): qui lo simula l'emulatore.
  const r = await fetch(`${FIRESTORE}/utenti?documentId=${MATTEO.uid}`, {
    method: 'POST',
    headers: PROPRIETARIO,
    body: JSON.stringify({ fields: {
      ruolo: { stringValue: 'titolare' }, attivo: { booleanValue: true },
      nome: { stringValue: MATTEO.nome }, email: { stringValue: MATTEO.email },
    } }),
  });
  expect(r.ok, await r.text()).toBe(true);
});

/**
 * Entra come utente Google simulato. La finestra di Google vera non si può aprire qui (scarica codice da
 * apis.google.com): si salta solo quella, il resto (accesso, profilo, regole, schermate) è quello vero.
 */
/** Apre una pagina dal pannello della Home (sul telefono non tutte sono nel menu in basso). */
async function apri(page: Page, titolo: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: 'Home' }).click();
  await page.getByRole('navigation', { name: 'Pagine' }).getByRole('link', { name: new RegExp(titolo) }).click();
}

async function accedi(page: Page, u: typeof MATTEO): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Accedi con Google' })).toBeVisible();
  await page.evaluate((x) => (window as unknown as { vegmanProva: { accedi(v: unknown): Promise<unknown> } })
    .vegmanProva.accedi(x), { sub: `g-${u.uid}`, email: u.email, nome: u.nome });
}

test('persona nuova → abilitata dal titolare → entra con il ruolo cassa', async ({ browser }) => {
  // 1. Giulia entra: non è abilitata e vede il suo codice.
  const giulia = await (await browser.newContext()).newPage();
  await accedi(giulia, GIULIA);
  await expect(giulia.getByRole('heading', { name: 'In attesa di abilitazione' })).toBeVisible();
  await expect(giulia.locator('code')).toHaveText(GIULIA.uid);
  await expect(giulia.getByText('Ambiente di PROVA')).toBeVisible();

  // 2. Matteo entra come titolare e la abilita come cassa.
  const matteo = await (await browser.newContext()).newPage();
  await accedi(matteo, MATTEO);
  await expect(matteo.getByRole('heading', { name: 'Ciao Matteo' })).toBeVisible();
  await expect(matteo.getByText('Ruolo: Titolare')).toBeVisible();
  await apri(matteo, 'Persone');
  await expect(matteo).toHaveURL(/#\/persone$/);
  const persone = matteo.getByRole('region', { name: 'Persone' });
  await expect(persone.getByText('Matteo · tu')).toBeVisible();
  await persone.getByLabel('Codice utente').fill(GIULIA.uid);
  await persone.getByLabel('Nome').fill(GIULIA.nome);
  await persone.getByLabel('Ruolo della persona nuova').selectOption('cassa');
  await persone.getByRole('button', { name: 'Abilita' }).click();
  await expect(persone.getByRole('status')).toHaveText('Giulia abilitato.');
  await expect(persone.getByLabel('Ruolo di Giulia')).toHaveValue('cassa');
  await matteo.screenshot({ path: 'test-results/pannello-persone.png', fullPage: true });

  // 3. Giulia ricarica: ora entra con il ruolo Cassa e non vede il pannello Persone.
  await giulia.reload();
  await expect(giulia.getByRole('heading', { name: 'Ciao Giulia' })).toBeVisible();
  await expect(giulia.getByText('Ruolo: Cassa')).toBeVisible();
  await expect(giulia.getByRole('region', { name: 'Persone' })).toHaveCount(0);
  // La cassa vede solo Home e la cassa di prova, niente pagine del titolare.
  await expect(giulia.getByRole('navigation', { name: 'Pagine' }).getByRole('link')).toHaveText([/Vendi:/, /Cassa · prova/]);
  // Anche scrivendo l'indirizzo a mano, la cassa non entra nella pagina Persone.
  await giulia.goto('/#/persone');
  await expect(giulia.getByRole('heading', { name: 'Ciao Giulia' })).toBeVisible();
  await expect(giulia.getByRole('region', { name: 'Persone' })).toHaveCount(0);

  // 4. Il titolare la disattiva: al rientro torna «in attesa».
  await persone.getByRole('button', { name: 'Disattiva' }).click();
  await expect(persone.getByRole('status')).toHaveText('Giulia disattivato.');
  await giulia.reload();
  await expect(giulia.getByRole('heading', { name: 'In attesa di abilitazione' })).toBeVisible();

  // 5. Un codice sbagliato viene rifiutato con un messaggio chiaro.
  await persone.getByLabel('Codice utente').fill('sbagliato!');
  await persone.getByLabel('Nome').fill('X');
  await persone.getByLabel('Ruolo della persona nuova').selectOption('team');
  await persone.getByRole('button', { name: 'Abilita' }).click();
  await expect(persone.getByRole('status')).toContainText('Codice utente non valido');
});

test('esci riporta alla schermata di accesso', async ({ page }) => {
  await accedi(page, MATTEO);
  await expect(page.getByRole('heading', { name: 'Ciao Matteo' })).toBeVisible();
  await page.getByRole('button', { name: 'Esci' }).click();
  await expect(page.getByRole('button', { name: 'Accedi con Google' })).toBeVisible();
});

test('l\'app si apre anche senza rete dopo la prima visita', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Accedi con Google' })).toBeVisible();
  // Aspetta che il service worker abbia preso il controllo e salvato la pagina.
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Benvenuto in VegMan' })).toBeVisible();
  await context.setOffline(false);
});

test('scheda dell\'app installabile', async ({ request }) => {
  const m = await (await request.get('/manifest.webmanifest')).json();
  expect(m).toMatchObject({ name: 'VegMan', display: 'standalone', start_url: '/' });
  for (const i of m.icons) expect((await request.get(i.src)).ok()).toBe(true);
});

test('il titolare importa un backup di VegMan Planner e vede il food cost', async ({ page }) => {
  await accedi(page, MATTEO);
  await apri(page, 'Importa');
  const importa = page.getByRole('region', { name: 'Importa' });
  await importa.getByLabel('File di backup (.json)').setInputFiles('tests/browser/dati/backup-inventato.json');
  const conti = importa.getByRole('table', { name: 'Conteggi' });
  await expect(conti.getByRole('row', { name: /Ingredienti/ })).toContainText('3');
  await expect(conti.getByRole('row', { name: /Righe di fattura/ })).toContainText('4');
  // Burger: panino 6/15 = 0,40 € + 40 g di Mayo (800 g olio a 3 €/L = 2,40 € su 1000 g → 0,096 €), sale senza prezzo
  const fc = importa.getByRole('table', { name: 'Food cost' });
  await expect(fc.getByRole('row', { name: /Burger di prova/ })).toContainText('0,50 €');
  await expect(fc.getByRole('row', { name: /Burger di prova/ })).toContainText('incompleto');
  // Pane e olio: 0,40 + 0,03 = 0,43 € su 4 € = 10,8%
  await expect(fc.getByRole('row', { name: /Pane e olio/ })).toContainText('0,43 €');
  await expect(fc.getByRole('row', { name: /Pane e olio/ })).toContainText('10,8%');
  await expect(importa).toContainText('1 ingrediente su 3 non ha ancora un prezzo');
  await expect(fc.getByRole('row', { name: /Burger di prova/ })).toContainText('manca 1 prezzo');
  await importa.getByRole('button', { name: 'Importa in VegMan' }).click();
  await expect(importa.getByRole('status')).toHaveText('Import completato.');
  await importa.screenshot({ path: 'test-results/importa.png' });

  // File sbagliato: messaggio chiaro
  await importa.getByText('Oppure incolla il testo').click();
  await importa.getByLabel('Testo del backup').fill('{"ciao":1}');
  await importa.getByRole('button', { name: 'Leggi il testo' }).click();
  await expect(importa.getByRole('alert')).toContainText('non sembra un backup');
});

test('ingredienti: collegare un articolo dà il prezzo; nuovo packaging', async ({ page }) => {
  await accedi(page, MATTEO);
  await apri(page, 'Ingredienti');
  const elenco = page.getByRole('region', { name: 'Ingredienti' });
  await expect(elenco.getByRole('link', { name: /Panino/ })).toContainText('0,40 €/pz');
  await expect(elenco.getByRole('link', { name: /Olio di semi/ })).toContainText('3,00 €/kg');
  await expect(elenco.getByRole('link', { name: /Sale/ })).toContainText('senza prezzo');

  await elenco.getByRole('link', { name: /Sale/ }).click();
  const scheda = page.getByRole('region', { name: 'Scheda ingrediente' });
  await expect(scheda.getByRole('heading', { name: 'Sale' })).toBeVisible();
  await expect(scheda).toContainText('Mayo di prova');
  await scheda.getByLabel('Articolo da collegare').selectOption({ label: 'SALE FINO 1 KG' });
  await expect(scheda.getByLabel('Conversione', { exact: true })).toHaveValue('1000');
  await scheda.getByRole('button', { name: 'Collega' }).click();
  await expect(scheda.getByRole('status')).toHaveText('«SALE FINO 1 KG» collegato.');
  await expect(scheda.locator('.prezzo-grande')).toHaveText('0,80 €/kg');
  await scheda.screenshot({ path: 'test-results/scheda-ingrediente.png' });

  // Nuovo ingrediente di packaging
  await page.goto('/#/ingredienti/nuovo');
  const nuova = page.getByRole('region', { name: 'Scheda ingrediente' });
  await nuova.getByLabel('Nome').fill('Tovagliolo');
  await nuova.getByLabel('Categoria').selectOption('packaging');
  await nuova.getByLabel('Unità').fill('pz');
  await nuova.getByRole('button', { name: 'Crea ingrediente' }).click();
  await expect(nuova.getByRole('heading', { name: 'Tovagliolo' })).toBeVisible();
  await nuova.getByRole('link', { name: '← Ingredienti' }).click();
  await expect(page.getByRole('region', { name: 'Ingredienti' }).getByRole('heading', { name: /Packaging/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ingredienti' }).getByRole('link', { name: /Tovagliolo/ })).toContainText('senza prezzo');
  await page.getByRole('region', { name: 'Ingredienti' }).screenshot({ path: 'test-results/ingredienti.png' });

  // Eliminare: bloccato con spiegazione se usato in una ricetta
  await page.getByRole('region', { name: 'Ingredienti' }).getByRole('link', { name: /Olio di semi/ }).click();
  const olio = page.getByRole('region', { name: 'Scheda ingrediente' });
  await olio.getByText('È un doppione? Unisci o elimina').click();
  await expect(olio.getByRole('note')).toContainText('Non si può eliminare perché è usato in: Mayo di prova');
  await expect(olio.getByRole('button', { name: 'Elimina ingrediente' })).toHaveCount(0);
});

test('fatture: caricare uno ZIP, classificare le righe nuove, acquisto a mano', async ({ page }) => {
  await accedi(page, MATTEO);
  await apri(page, 'Fatture');
  const fatture = page.getByRole('region', { name: 'Fatture' });
  await fatture.getByLabel('File delle fatture').setInputFiles('tests/fatture/fatture-inventate.zip');
  const anteprima = fatture.getByLabel('Anteprima del caricamento');
  await expect(anteprima).toContainText('1 fattura nuova');
  await expect(anteprima).toContainText('3 righe: 0 aggiornano subito un prezzo, 3 articoli nuovi da controllare');
  await expect(anteprima).toContainText('presente due volte nei file caricati');
  await expect(anteprima).toContainText('file di servizio del portale');
  await expect(anteprima.getByRole('table', { name: 'Fatture nuove' })).toContainText('INGROSSO INVENTATO S.R.L. & C.');
  await anteprima.getByRole('button', { name: 'Carica 1 fattura' }).click();
  await expect(anteprima.getByRole('status')).toHaveText('Fatture caricate.');

  // Righe nuove: tovaglioli → packaging collegati a «Tovagliolo» (500 pz a confezione), trasporto → non alimentare
  const tovaglioli = fatture.getByRole('listitem', { name: /Da controllare: TOVAGLIOLI/ });
  await tovaglioli.getByRole('button', { name: 'Packaging' }).click();
  await expect(tovaglioli.getByLabel('Ingrediente')).toHaveValue(/.+/);
  await expect(tovaglioli.getByLabel('Conversione')).toHaveValue('500');
  await tovaglioli.getByRole('button', { name: 'Conferma' }).click();
  await expect(tovaglioli).toHaveCount(0);
  const trasporto = fatture.getByRole('listitem', { name: /Da controllare: TRASPORTO/ });
  await trasporto.getByRole('button', { name: 'Non alimentare' }).click();
  await trasporto.getByRole('button', { name: 'Conferma' }).click();
  await expect(trasporto).toHaveCount(0);
  await expect(fatture.getByRole('listitem', { name: /Da controllare: CECI/ })).toBeVisible();

  // Acquisto senza fattura: 1 kg di sale dal contadino per 2 €
  const manuale = fatture.getByRole('form', { name: 'Acquisto senza fattura' });
  await manuale.getByLabel('Ingrediente comprato').selectOption({ label: 'Sale' });
  await manuale.getByLabel('Da chi').fill('Contadino inventato');
  await manuale.getByLabel('Quantità').fill('1000');
  await manuale.getByLabel('Totale pagato').fill('2,00');
  await manuale.getByRole('button', { name: 'Registra acquisto' }).click();
  await expect(manuale.getByRole('status')).toHaveText('Registrato: Sale da Contadino inventato.');
  await fatture.screenshot({ path: 'test-results/fatture.png' });

  // Ricaricare lo stesso file: nessun doppione
  await fatture.getByLabel('File delle fatture').setInputFiles('tests/fatture/fattura-inventata.xml.p7m');
  await expect(fatture.getByLabel('Anteprima del caricamento')).toContainText('0 fatture nuove');
  await expect(fatture.getByLabel('Anteprima del caricamento')).toContainText('già caricata');

  // Prezzi aggiornati negli ingredienti
  await apri(page, 'Ingredienti');
  const elenco = page.getByRole('region', { name: 'Ingredienti' });
  await expect(elenco.getByRole('link', { name: /Tovagliolo/ })).toContainText('0,0136 €/pz');
  // Sale: 2 kg a 0,80 € + 1 kg a 2,00 € = 3,60 € / 3 kg
  await expect(elenco.getByRole('link', { name: /Sale/ })).toContainText('1,20 €/kg');
  await expect(elenco.getByRole('link', { name: /Sale/ })).toContainText('2 fonti');
});

test('allergeni: etichette compilate a mano → lista ingredienti e tabella allergeni dei prodotti', async ({ page }) => {
  await accedi(page, MATTEO);
  const compila = async (nome: RegExp, dati: { en: string; it?: string; enComp?: string; allergeni?: string[]; peso?: string }) => {
    await page.goto('/#/ingredienti');
    await page.getByRole('region', { name: 'Ingredienti' }).getByRole('link', { name: nome }).click();
    const f = page.getByRole('form', { name: 'Etichetta e allergeni' });
    await f.getByLabel('Nome in inglese').fill(dati.en);
    if (dati.it) await f.getByLabel('Composizione in italiano').fill(dati.it);
    if (dati.enComp) await f.getByLabel('Composizione in inglese').fill(dati.enComp);
    for (const a of dati.allergeni ?? []) await f.getByRole('group', { name: 'Allergeni contenuti' }).getByLabel(a).check();
    if (dati.peso) await f.getByLabel('Peso per pezzo').fill(dati.peso);
    await f.getByLabel("Ho controllato l'etichetta").check();
    await f.getByRole('button', { name: 'Salva etichetta' }).click();
    await expect(f.getByRole('status')).toHaveText('Etichetta salvata.');
    return f;
  };
  // Panino a pezzi: senza peso per pezzo non si salva
  await page.goto('/#/ingredienti');
  await page.getByRole('region', { name: 'Ingredienti' }).getByRole('link', { name: /Panino/ }).click();
  const fp = page.getByRole('form', { name: 'Etichetta e allergeni' });
  await fp.getByLabel("Ho controllato l'etichetta").check();
  await fp.getByRole('button', { name: 'Salva etichetta' }).click();
  await expect(fp.getByRole('status')).toContainText('grammi pesa 1 pz');

  const panino = await compila(/Panino/, { en: 'Bun', it: 'farina di *frumento*, acqua, sale', enComp: '*wheat* flour, water, salt', allergeni: ['cereali contenenti glutine'], peso: '80' });
  await expect(panino).toContainText('Anteprima: farina di frumento, acqua, sale');
  await expect(panino.locator('strong', { hasText: 'frumento' })).toBeVisible();
  await panino.screenshot({ path: 'test-results/etichetta.png' });
  await compila(/Olio di semi/, { en: 'Seed oil' });
  await compila(/^Sale/, { en: 'Salt' });

  await apri(page, 'Allergeni');
  const pagina = page.getByRole('region', { name: 'Allergeni' });
  const burger = pagina.getByRole('article', { name: 'Etichetta Burger di prova' });
  // Panino 80 g, poi 40 g di Mayo (32 g di olio, 0,4 g di sale)
  await expect(burger.locator('[lang=it]')).toContainText('Ingredienti: Panino (farina di frumento, acqua, sale), Mayo di prova (Olio di semi, Sale).');
  await expect(burger.locator('[lang=it]')).toContainText('Contiene: cereali contenenti glutine.');
  await expect(burger.locator('[lang=en]')).toContainText('Ingredients: Bun (wheat flour, water, salt), Mayo di prova (Seed oil, Salt).');
  await expect(burger.locator('[lang=en] strong', { hasText: 'wheat' })).toBeVisible();
  await expect(burger).toContainText('Inglese: «Mayo di prova»: manca il nome in inglese');
  const riga = pagina.getByRole('table', { name: 'Tabella allergeni' }).getByRole('row', { name: /Burger di prova/ });
  await expect(riga.getByRole('cell', { name: 'cereali contenenti glutine' })).toHaveText('●');
  await expect(riga.getByRole('cell', { name: 'soia' })).toHaveText('');
  await pagina.screenshot({ path: 'test-results/allergeni.png' });
});

test('prodotti: nuova ricetta con costi e lista ingredienti mentre scrivi; nome inglese al semilavorato', async ({ page }) => {
  await accedi(page, MATTEO);
  await apri(page, 'Prodotti');
  const elenco = page.getByRole('region', { name: 'Prodotti' });
  await expect(elenco.getByRole('heading', { name: /In vendita/ })).toBeVisible();
  await elenco.getByRole('link', { name: '+ Nuovo' }).click();

  const scheda = page.getByRole('region', { name: 'Scheda prodotto' });
  await scheda.getByLabel('Nome', { exact: true }).fill('Wrap di prova');
  await scheda.getByLabel('Nome in inglese').fill('Test wrap');
  await scheda.getByLabel('Prezzo di vendita').fill('6');
  await scheda.getByRole('button', { name: '+ Aggiungi riga' }).click();
  await scheda.getByRole('listitem', { name: 'Riga 1' }).getByLabel('Ingrediente o semilavorato').selectOption({ label: 'Panino' });
  await scheda.getByRole('listitem', { name: 'Riga 1' }).getByLabel('Quantità').fill('1');
  await expect(scheda.getByRole('listitem', { name: 'Riga 1' })).toContainText('0,40 €');
  await scheda.getByRole('button', { name: '+ Aggiungi riga' }).click();
  await scheda.getByRole('listitem', { name: 'Riga 2' }).getByLabel('Ingrediente o semilavorato').selectOption({ label: 'Mayo di prova' });
  await scheda.getByRole('listitem', { name: 'Riga 2' }).getByLabel('Quantità').fill('30');
  await expect(scheda.getByRole('listitem', { name: 'Riga 2' })).toContainText('g');
  // Mayo: 800 g olio a 3 €/kg + 10 g sale a 1,20 €/kg = 2,412 € per 1000 g → 30 g = 0,0724 €; totale 0,4724 € su 6 € = 7,9%
  const fc = scheda.getByLabel('Food cost', { exact: true });
  await expect(fc).toContainText('0,47 €');
  await expect(fc).toContainText('7,9%');
  await expect(fc).toContainText('5,53 €');
  const lista = scheda.getByLabel('Lista ingredienti');
  await expect(lista.locator('[lang=it]')).toContainText('Ingredienti: Panino (farina di frumento, acqua, sale), Mayo di prova (Olio di semi, Sale).');
  await expect(lista).toContainText('«Mayo di prova»: manca il nome in inglese');
  await scheda.getByLabel('Soglia food cost').fill('5');
  await expect(fc.locator('.oltre')).toHaveText('7,9%');
  await scheda.getByLabel('In menu').check();
  await expect(scheda.getByText('Compare nel menu pubblico')).toBeVisible();
  await scheda.getByRole('button', { name: 'Crea prodotto' }).click();
  await expect(scheda.getByRole('heading', { name: 'Wrap di prova' })).toBeVisible();
  await scheda.screenshot({ path: 'test-results/scheda-prodotto.png' });

  // Errori chiari: riga senza quantità
  await scheda.getByRole('button', { name: '+ Aggiungi riga' }).click();
  await scheda.getByRole('button', { name: 'Salva' }).click();
  await expect(scheda.getByRole('status')).toHaveText('Riga 3: scegli l\'ingrediente.');
  await scheda.getByRole('button', { name: 'Togli la riga 3' }).click();

  // Nome inglese alla Mayo → la lista inglese del Wrap lo usa
  await page.goto('/#/prodotti');
  await page.getByRole('region', { name: 'Prodotti' }).getByRole('link', { name: /Mayo di prova/ }).click();
  const mayo = page.getByRole('region', { name: 'Scheda prodotto' });
  await expect(mayo.getByRole('button', { name: 'Semilavorato' })).toHaveAttribute('aria-pressed', 'true');
  await mayo.getByLabel('Nome in inglese').fill('Vegan mayo');
  await mayo.getByRole('button', { name: 'Salva' }).click();
  await expect(mayo.getByRole('status')).toHaveText('Salvato.');
  await expect(mayo).toContainText('Non si può eliminare: è usato in');
  await expect(mayo.getByLabel('In menu')).toHaveCount(0); // i semilavorati non vanno in menu
  await page.goto('/#/prodotti');
  const riga = page.getByRole('region', { name: 'Prodotti' }).getByRole('link', { name: /Wrap di prova/ });
  await expect(riga).toContainText('in menu');
  await expect(riga).toContainText('sopra soglia (5%)');
  await riga.click();
  await expect(page.getByRole('region', { name: 'Scheda prodotto' }).getByLabel('Lista ingredienti').locator('[lang=en]'))
    .toContainText('Ingredients: Bun (wheat flour, water, salt), Vegan mayo (Seed oil, Salt).');
  await page.goto('/#/prodotti');
  await page.getByRole('region', { name: 'Prodotti' }).screenshot({ path: 'test-results/prodotti.png' });
});

test('menu pubblico: pubblicazione, QR code leggibile, pagina aperta a tutti IT/EN, stampa', async ({ page, browser }) => {
  await accedi(page, MATTEO);
  await apri(page, 'Menu e QR');
  const gestione = page.getByRole('region', { name: 'Menu e QR' });
  await expect(gestione.getByLabel('Stato del menu')).toHaveText('Il menu non è ancora pubblicato.');
  await expect(gestione.getByRole('link', { name: /Wrap di prova/ })).toContainText('6,00 €');
  await gestione.getByRole('button', { name: 'Pubblica menu' }).click();
  await expect(gestione.getByRole('status')).toHaveText('Menu pubblicato.');
  await expect(gestione.getByRole('button', { name: 'Menu già aggiornato' })).toBeDisabled();
  await expect(gestione.getByLabel('Stato del menu')).toContainText('È aggiornato.');

  // Il QR code sullo schermo si legge e porta al menu pubblico
  await page.addScriptTag({ path: richiedi.resolve('jsqr/dist/jsQR.js') });
  const letto = await page.evaluate(async () => {
    const svg = document.querySelector('.qr svg')!.outerHTML;
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: 400, height: 400 });
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0, 400, 400);
    const d = x.getImageData(0, 0, 400, 400);
    return (window as unknown as { jsQR: (a: Uint8ClampedArray, w: number, h: number) => { data: string } | null }).jsQR(d.data, 400, 400)?.data;
  });
  expect(letto).toBe('http://127.0.0.1:5174/#/menu');

  // Un cliente qualsiasi, senza accesso
  const cliente = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  await cliente.goto('/#/menu');
  const wrap = cliente.getByRole('article', { name: 'Wrap di prova' });
  await expect(wrap).toContainText('6,00 €');
  await expect(wrap).toContainText('Ingredienti: Panino (farina di frumento, acqua, sale), Mayo di prova (Olio di semi, Sale).');
  await expect(wrap).toContainText('Contiene: cereali contenenti glutine.');
  await expect(wrap.locator('strong', { hasText: 'frumento' })).toBeVisible();
  await expect(cliente.getByText('costo')).toHaveCount(0);
  await cliente.screenshot({ path: 'test-results/menu-pubblico.png', fullPage: true });
  await cliente.getByRole('link', { name: 'EN' }).click();
  const en = cliente.getByRole('article', { name: 'Test wrap' });
  await expect(en).toContainText('Ingredients: Bun (wheat flour, water, salt), Vegan mayo (Seed oil, Salt).');
  await expect(en).toContainText('Contains: cereals containing gluten.');

  // Versione da stampare
  await gestione.getByRole('link', { name: 'Versione da stampare' }).click();
  const cartello = page.getByRole('table', { name: 'Cartello allergeni' });
  await expect(cartello.getByRole('row', { name: /Wrap di prova/ }).getByRole('cell', { name: 'cereali contenenti glutine' })).toHaveText('●');
  await page.emulateMedia({ media: 'print' });
  await page.screenshot({ path: 'test-results/stampa.png', fullPage: true });
  await page.emulateMedia({ media: 'screen' });

  // Una modifica al prodotto: il menu pubblicato resta com'era finché non si ripubblica
  await page.goto('/#/prodotti');
  await page.getByRole('region', { name: 'Prodotti' }).getByRole('link', { name: /Wrap di prova/ }).click();
  const scheda = page.getByRole('region', { name: 'Scheda prodotto' });
  await scheda.getByLabel('Prezzo di vendita').fill('6,50');
  await scheda.getByRole('button', { name: 'Salva' }).click();
  await expect(scheda.getByRole('status')).toHaveText('Salvato.');
  await page.goto('/#/pubblica');
  await expect(page.getByRole('region', { name: 'Menu e QR' }).getByLabel('Stato del menu')).toContainText('Ci sono modifiche non ancora pubblicate.');
  await cliente.reload();
  await expect(cliente.getByRole('article', { name: 'Test wrap' })).toContainText('6,00 €');
});

test('storico, grafici e avvisi: fotografia di ottobre, rincari, soglie', async ({ page }) => {
  await accedi(page, MATTEO);
  await apri(page, 'Avvisi');
  const avvisi = page.getByRole('region', { name: 'Avvisi' });
  // La fotografia di ottobre si salva da sola al primo accesso di novembre
  await expect(avvisi.getByLabel('Fotografie salvate')).toHaveText('Salvate: ottobre 2026.');
  const fc = avvisi.getByRole('list', { name: 'Avvisi food cost' });
  await expect(fc).toContainText('Wrap di prova: food cost 7,3% (soglia 5%)');
  // Sale: 0,80 €/kg a fine ottobre → (2 kg a 0,80 + 1 kg a 2,00) / 3 kg = 1,20 €/kg oggi
  await expect(fc).toContainText('Sale: +50% rispetto alla fine del mese scorso');
  const daFare = avvisi.getByRole('list', { name: 'Da fare' });
  await expect(daFare).toContainText('1 articolo delle fatture da controllare');
  await expect(daFare).toContainText('Menu: ci sono modifiche non ancora pubblicate');
  await avvisi.screenshot({ path: 'test-results/avvisi.png' });

  // Soglia dei rincari al 60%: l'avviso del sale sparisce
  await avvisi.getByLabel('Soglia rincaro').fill('60');
  await avvisi.getByRole('button', { name: 'Salva' }).click();
  await expect(avvisi.getByRole('status')).toHaveText('Soglia salvata.');
  await expect(fc).not.toContainText('Sale');

  // Grafico del prezzo del sale: ottobre 0,80 €/kg, novembre 2,00 €/kg (+150% su 1 mese)
  await fc.getByRole('link', { name: /Wrap di prova/ }).click();
  const andamentoFc = page.getByLabel('Andamento del food cost');
  await expect(andamentoFc.getByRole('img', { name: 'Food cost di Wrap di prova mese per mese' })).toBeVisible();
  await andamentoFc.getByText('Vedi i numeri').click();
  await expect(andamentoFc.getByRole('table')).toContainText('ott 26');
  await expect(andamentoFc.getByRole('table')).toContainText('7,3%');
  await page.goto('/#/ingredienti');
  await page.getByRole('region', { name: 'Ingredienti' }).getByRole('link', { name: /^Sale/ }).click();
  const andamento = page.getByLabel('Andamento del prezzo');
  await expect(andamento.getByRole('img', { name: 'Prezzo di Sale mese per mese' })).toBeVisible();
  await expect(andamento).toContainText('su 1 mese+150%');
  await andamento.getByText('Vedi i numeri').click();
  const numeri = andamento.getByRole('table');
  await expect(numeri.getByRole('row', { name: /ott 26/ })).toContainText('0,80 €');
  await expect(numeri.getByRole('row', { name: /nov 26/ })).toContainText('2,00 €');
  await andamento.screenshot({ path: 'test-results/andamento-prezzo.png' });
});

test('cassa di prova: scontrini sul simulatore, risposta persa recuperata, annullo; credenziali solo su Android', async ({ page }) => {
  await accedi(page, MATTEO);
  await apri(page, 'Cassa · prova');
  const cassa = page.getByRole('region', { name: 'Cassa di prova' });
  await expect(cassa.getByRole('note').first()).toContainText('SIMULATORE');
  await cassa.getByRole('button', { name: /^Pane e olio/ }).click();
  await cassa.getByRole('button', { name: /^Pane e olio/ }).click();
  await expect(cassa).toContainText('2 × Pane e olio');
  await expect(cassa).toContainText('Totale 8,00 €');
  await cassa.getByRole('button', { name: 'Emetti scontrino di prova' }).click();
  await expect(cassa.getByRole('status').first()).toHaveText(/^Emesso DCW2026\/9999-\d+\.$/);

  // Risposta persa: lo scontrino c'è, si recupera senza doppioni.
  await cassa.getByRole('button', { name: /^Pane e olio/ }).click();
  await cassa.getByLabel('Guasto da simulare').selectOption('rete-dopo');
  await cassa.getByRole('button', { name: 'Emetti scontrino di prova' }).click();
  await expect(cassa.getByRole('status').first()).toContainText('recuperato');
  await expect(cassa.getByRole('heading', { name: /Emessi in questa prova/ })).toContainText('(2)');

  // Rete assente: non emesso.
  await cassa.getByRole('button', { name: /^Pane e olio/ }).click();
  await cassa.getByLabel('Guasto da simulare').selectOption('rete-prima');
  await cassa.getByRole('button', { name: 'Emetti scontrino di prova' }).click();
  await expect(cassa.getByRole('status').first()).toContainText('Non emesso');

  await cassa.getByRole('button', { name: 'Annulla' }).last().click();
  await expect(cassa.getByRole('status').first()).toContainText('Annullato con');
  await expect(cassa).toContainText('Si inseriscono solo nell\'app Android');
  await expect(cassa.getByLabel('Password Fisconline')).toHaveCount(0);
  await cassa.screenshot({ path: 'test-results/cassa-prova.png' });
});

test('cassa come Billy: quantità con ×, importo libero, contanti; importo digitato e carta (simulatore)', async ({ page }) => {
  await accedi(page, MATTEO);
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: /Cassa$/ }).click();
  // apertura: nessun evento → il titolare lo crea e apre la cassa
  const apri = page.getByRole('region', { name: 'Apri la cassa' });
  await expect(apri).toContainText('Nessun evento aperto');
  await apri.getByLabel('Nome dell\'evento').fill('Sagra di prova');
  await apri.getByLabel('Luogo').fill('Osimo');
  await apri.getByRole('button', { name: 'Crea e apri la cassa' }).click();
  const cassa = page.getByRole('region', { name: 'Cassa', exact: true });
  await expect(cassa).toContainText('📍 Sagra di prova · 07/11 · Osimo · Cassa 1');
  await expect(cassa.getByRole('note')).toContainText('SIMULATORE');
  const tastierino = cassa.getByRole('group', { name: 'Tastierino' });
  const prodotti = cassa.getByRole('group', { name: 'Prodotti' });
  // 3 × Pane e olio
  await tastierino.getByRole('button', { name: '3', exact: true }).click();
  await tastierino.getByRole('button', { name: 'Per (quantità)' }).click();
  await cassa.getByRole('tab', { name: 'Prodotti' }).click();
  await prodotti.getByRole('button', { name: /^Pane e olio/ }).click();
  const righe = cassa.getByRole('list', { name: 'Righe dello scontrino' });
  await expect(righe).toContainText('3 pz × 4,00 €');
  // riga a importo libero: 4,50 € «Speciale» IVA 10%
  await cassa.getByRole('tab', { name: 'Tastierino' }).click();
  for (const k of ['4', '.', '5']) await tastierino.getByRole('button', { name: k, exact: true }).click();
  await cassa.getByLabel('Descrizione').fill('Speciale');
  await tastierino.getByRole('button', { name: '+ importo' }).click();
  await expect(righe).toContainText('Speciale');
  await expect(cassa.getByLabel('Totale')).toContainText('Totale (4 pz)');
  await expect(cassa.getByLabel('Totale')).toContainText('16,50 €');
  await cassa.screenshot({ path: 'test-results/cassa.png' });
  await cassa.getByRole('button', { name: 'CONT', exact: true }).click();
  await expect(cassa.getByRole('status')).toContainText(/DCW2026\/9999-\d+ · 16,50 € · contanti/);
  await expect(righe).toContainText('Tocca i prodotti');
  // invio: nel browser senza condivisione si scarica la ricevuta VegMan
  const scarico = page.waitForEvent('download');
  await cassa.getByRole('button', { name: /Invia scontrino DCW2026\/9999-/ }).click();
  const file = await scarico;
  expect(file.suggestedFilename()).toMatch(/^VegMan-DCW2026-9999-\d+\.png$/);
  await file.saveAs('test-results/ricevuta.png');
  // importo digitato e subito carta, senza righe (come Billy)
  await tastierino.getByRole('button', { name: '5', exact: true }).click();
  await cassa.getByRole('button', { name: 'ELET', exact: true }).click();
  await expect(cassa.getByRole('status')).toContainText('5,00 € · carta');
  // vuoto: messaggio
  await cassa.getByRole('button', { name: 'CONT', exact: true }).click();
  await expect(cassa.getByRole('alert')).toContainText('vuoto');
  // archivio: scontrini di oggi con totali; annullo del primo
  await cassa.getByText(/^Scontrini dell'evento · 2 · 21,50 €/).click();
  const oggi = cassa.getByRole('list', { name: 'Scontrini dell\'evento' });
  await expect(oggi.getByRole('listitem')).toHaveCount(2);
  await expect(cassa.getByText('Contanti 16,50 € · Carta 5,00 €')).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await oggi.getByRole('listitem').filter({ hasText: '16,50 €' }).getByRole('button', { name: 'Annulla' }).click();
  await expect(cassa.getByRole('status')).toContainText('Annullato');
  await expect(cassa.getByText(/^Scontrini dell'evento · 1 · 5,00 €/)).toBeVisible();
  await expect(oggi.getByRole('listitem')).toHaveCount(3);
  await expect(oggi).toContainText('Annullo di DCW2026/9999-');
  await expect(oggi.getByRole('button', { name: '📤 Invia' })).toHaveCount(3);
  // C4 · omaggio: movimento interno, niente scontrino né Agenzia
  await cassa.getByRole('tab', { name: 'Prodotti' }).click();
  await prodotti.getByRole('button', { name: /^Pane e olio/ }).click();
  await cassa.getByRole('button', { name: 'Senza incasso' }).click();
  const senza = cassa.getByRole('group', { name: 'Senza incasso' });
  await expect(senza.getByLabel('Omaggio')).toBeChecked();
  await senza.getByRole('button', { name: 'Registra' }).click();
  await expect(cassa.getByRole('alert')).toContainText('Scrivi il motivo');
  await senza.getByLabel('Motivo').fill('Artista');
  await senza.getByRole('button', { name: 'Registra' }).click();
  await expect(cassa.getByRole('status')).toContainText('Omaggio: 1 pz registrati (nessuno scontrino)');
  await expect(cassa.getByRole('button', { name: 'Non riscosso' })).toHaveCount(0);
  // pasto staff: niente scontrino, niente importo
  await prodotti.getByRole('button', { name: /^Pane e olio/ }).click();
  await cassa.getByRole('button', { name: 'Senza incasso' }).click();
  await senza.getByLabel('Pasto staff').check();
  await senza.getByLabel('Motivo').fill('pranzo');
  await senza.getByLabel('Persona').fill('Luca');
  await senza.getByRole('button', { name: 'Registra' }).click();
  await expect(cassa.getByRole('status')).toContainText('Pasto staff: 1 pz registrati (nessuno scontrino)');
  // una riga a importo libero non è un prodotto: rifiutata
  await cassa.getByRole('tab', { name: 'Tastierino' }).click();
  await tastierino.getByRole('button', { name: '2', exact: true }).click();
  await tastierino.getByRole('button', { name: '+ importo' }).click();
  await cassa.getByRole('button', { name: 'Senza incasso' }).click();
  await senza.getByLabel('Scarto').check();
  await senza.getByLabel('Motivo').fill('caduto');
  await senza.getByRole('button', { name: 'Registra' }).click();
  await expect(cassa.getByRole('alert')).toContainText('solo prodotti');
  await righe.getByRole('button', { name: /^Togli uno/ }).click();
  await expect(cassa.getByText(/^Scontrini dell'evento · 1 · 5,00 €/)).toBeVisible();
  await cassa.getByText(/^Senza incasso dell'evento · 2 pz/).click();
  await expect(cassa.getByText('Omaggio: 1× Pane e olio')).toBeVisible();
  await expect(cassa.getByText('Pasto staff: 1× Pane e olio')).toBeVisible();
  await expect(cassa.getByRole('list', { name: 'Movimenti senza incasso' })).toContainText('pranzo · Luca');
  await cassa.screenshot({ path: 'test-results/cassa-senza-incasso.png' });
  // C7 · senza rete: la vendita va nel registro di emergenza, la cassa non si chiude, poi si emette
  await cassa.getByLabel('Prova senza rete').check();
  await cassa.getByRole('tab', { name: 'Prodotti' }).click();
  await prodotti.getByRole('button', { name: /^Pane e olio/ }).click();
  await cassa.getByRole('button', { name: 'CONT', exact: true }).click();
  await expect(cassa.getByRole('status')).toContainText('vendita di 4,00 € annotata nel registro di emergenza (n. 1)');
  await expect(righe).toContainText('Tocca i prodotti');
  const registro = cassa.getByRole('group', { name: 'Registro di emergenza' });
  await expect(registro).toContainText('1 da emettere · 4,00 €');
  await expect(registro).toContainText('1× Pane e olio · Rete assente · DA EMETTERE');
  await cassa.getByRole('button', { name: 'Chiudi cassa' }).click();
  await cassa.getByRole('form', { name: 'Chiusura cassa' }).getByRole('button', { name: 'Registra chiusura' }).click();
  await expect(cassa.getByRole('form', { name: 'Chiusura cassa' }).getByRole('alert')).toContainText('Prima emetti la vendita del registro di emergenza');
  await cassa.getByRole('button', { name: 'Chiudi cassa' }).click();
  await registro.getByRole('button', { name: 'Emetti ora' }).click();
  await expect(cassa.getByRole('alert')).toContainText('Ancora senza rete');
  await cassa.screenshot({ path: 'test-results/cassa-emergenza.png' });
  await cassa.getByLabel('Prova senza rete').uncheck();
  await registro.getByRole('button', { name: 'Emetti ora' }).click();
  await expect(cassa.getByRole('status')).toContainText('Registro di emergenza: 1 scontrino emesso');
  await expect(registro).toContainText('tutto emesso');
  await expect(registro).toContainText(/emesso DCW2026\/9999-\d+/);
  // cambia: si torna all'apertura, l'evento creato è proposto
  await cassa.getByRole('button', { name: 'Cambia' }).click();
  await expect(apri.getByLabel('Evento', { exact: true })).toContainText('Sagra di prova');
  await apri.getByLabel('Nome di questa cassa').fill('Furgone');
  await apri.getByLabel('Fondo cassa (contanti all\'inizio)').fill('50');
  await apri.getByRole('button', { name: 'Apri cassa' }).click();
  await expect(cassa).toContainText('· Furgone');
  // C6 · chiusura: vendita 4 € in contanti, nel cassetto se ne contano 50 (fondo) → mancano 4 €
  await cassa.getByRole('tab', { name: 'Prodotti' }).click();
  await prodotti.getByRole('button', { name: /^Pane e olio/ }).click();
  await cassa.getByRole('button', { name: 'CONT', exact: true }).click();
  await expect(cassa.getByRole('status')).toContainText('4,00 € · contanti');
  await prodotti.getByRole('button', { name: /^Pane e olio/ }).click();
  await cassa.getByRole('button', { name: 'Chiudi cassa' }).click();
  const chiusura = cassa.getByRole('form', { name: 'Chiusura cassa' });
  await expect(chiusura).toContainText('fondo 50,00 €');
  await chiusura.getByLabel('Contanti contati (fondo compreso)').fill('50');
  await chiusura.getByRole('button', { name: 'Registra chiusura' }).click();
  await expect(chiusura.getByRole('alert')).toContainText('svuota lo scontrino');
  await righe.getByRole('button', { name: /^Togli uno/ }).click();
  await chiusura.getByLabel('Carta (POS): totale del lettore').fill('abc');
  await chiusura.getByRole('button', { name: 'Registra chiusura' }).click();
  await expect(chiusura.getByRole('alert')).toContainText('Carta (POS): scrivi un importo');
  await chiusura.getByLabel('Carta (POS): totale del lettore').fill('');
  await chiusura.getByLabel('Nota').fill('resto sbagliato?');
  page.once('dialog', (d) => void d.accept());
  await chiusura.getByRole('button', { name: 'Registra chiusura' }).click();
  await expect(apri.getByRole('status')).toContainText('Cassa chiusa. Differenze: contanti −4,00 €, carta 0,00 €.');
  // il titolare vede il confronto nella cassa e tra gli avvisi
  await apri.getByLabel('Nome di questa cassa').fill('Furgone');
  await apri.getByRole('button', { name: 'Apri cassa' }).click();
  await cassa.getByText(/^Chiusure dell'evento · 1 · ⚠ 1 non quadrano/).click();
  const chiusure = cassa.getByRole('list', { name: 'Chiusure dell\'evento' });
  await expect(chiusure).toContainText('Contanti: contati 50,00 € · attesi 54,00 € (fondo 50,00 €) · ⚠ −4,00 €');
  await expect(chiusure).toContainText('Carta: 0,00 € · attesa 0,00 € ✅');
  await expect(chiusure).toContainText('Nota: resto sbagliato?');
  await cassa.screenshot({ path: 'test-results/cassa-chiusura.png' });
  await page.goto('/#/avvisi');
  await expect(page.getByRole('list', { name: 'Da fare' })).toContainText(/Quadratura Sagra di prova · Furgone · \d\d\/\d\d\/2026: contanti −4,00 €/);
  // chiusura dell'evento: non si può più aprire
  await page.goto('/#/vendi');
  page.once('dialog', (d) => void d.accept());
  await cassa.getByText(/^Chiusure dell'evento/).click();
  await cassa.getByRole('button', { name: 'Chiudi l\'evento' }).click();
  await expect(apri).toContainText('Nessun evento aperto');
});

test('nessuna pagina è più larga di un telefono (360 px)', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 360, height: 760 } })).newPage();
  await page.addInitScript(() => localStorage.setItem('vegman-oggi', '2026-11-07'));
  await accedi(page, MATTEO);
  await expect(page.getByRole('heading', { name: 'Ciao Matteo' })).toBeVisible();
  for (const p of ['vendi', 'prodotti', 'ingredienti', 'fatture', 'avvisi', 'pubblica', 'allergeni', 'cassa', 'persone', 'importa']) {
    await page.goto(`/#/${p}`);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `pagina ${p}`).toBeLessThanOrEqual(360);
  }
});
