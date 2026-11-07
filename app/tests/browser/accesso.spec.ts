/**
 * Prova completa nel browser, con gli emulatori e le regole vere (firestore.rules):
 * una persona nuova entra e vede il suo codice → il titolare la abilita come cassa → lei rientra e vede il ruolo.
 */
import { expect, test, type Page } from '@playwright/test';

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
  await matteo.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: 'Persone' }).click();
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
  await expect(giulia.getByRole('navigation', { name: 'Menu' })).toHaveCount(0);
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
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: 'Importa' }).click();
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
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: 'Ingredienti' }).click();
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
});

test('fatture: caricare uno ZIP, classificare le righe nuove, acquisto a mano', async ({ page }) => {
  await accedi(page, MATTEO);
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: 'Fatture' }).click();
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
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: 'Ingredienti' }).click();
  const elenco = page.getByRole('region', { name: 'Ingredienti' });
  await expect(elenco.getByRole('link', { name: /Tovagliolo/ })).toContainText('0,0136 €/pz');
  // Sale: 2 kg a 0,80 € + 1 kg a 2,00 € = 3,60 € / 3 kg
  await expect(elenco.getByRole('link', { name: /Sale/ })).toContainText('1,20 €/kg');
  await expect(elenco.getByRole('link', { name: /Sale/ })).toContainText('2 fonti');
});
