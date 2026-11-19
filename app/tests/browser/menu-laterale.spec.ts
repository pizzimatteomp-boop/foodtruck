import { expect, test } from '@playwright/test';
test('menu laterale fermo e diviso per argomento', async ({ browser }) => {
  for (const [w, h] of [[1280, 800], [360, 740]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 700 });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.evaluate((x) => (window as any).vegmanProva.accedi(x), { sub: 'g-matteoTitolare0001', email: 'matteo@vegman.test', nome: 'Matteo' });
    await expect(page.getByRole('heading', { name: 'Ciao Matteo' })).toBeVisible();
    const menu = page.getByRole('navigation', { name: 'Menu', exact: true });
    if (w > 900) {
      await expect(menu.locator('.menu-gruppo')).toHaveText(['Vendite', 'Menu e costi', 'Laboratorio e magazzino', 'Altro']);
      const prima = (await menu.boundingBox())!.y;
      await page.evaluate(() => window.scrollTo(0, 700)); await page.waitForTimeout(400);
      expect(Math.abs((await menu.boundingBox())!.y - prima)).toBeLessThanOrEqual(1);
    } else {
      await expect(menu.locator('.menu-gruppo').first()).toBeHidden();
    }
    await page.screenshot({ path: 'test-results/menu-' + w + '.png' });
    await ctx.close();
  }
});
