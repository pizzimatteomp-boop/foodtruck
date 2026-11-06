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
