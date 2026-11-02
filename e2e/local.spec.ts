import { expect, test } from '@playwright/test';

test('landing page shows the title, the online box and the live exhibition fight', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Iron Arena' })).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a room' })).toBeVisible();
});

test('local versus: a fight starts and inputs move the fighters', async ({ page }) => {
  await page.goto('/local?render=0');
  // Clicking a portrait only shows the hero; the confirm button picks them
  await page.getByRole('button', { name: 'Benika', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose Benika' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose Benika' }).click();
  await page.getByRole('button', { name: 'Hyōga', exact: true }).click();
  await page.getByRole('button', { name: 'Choose Hyōga' }).click();
  await page.getByRole('button', { name: 'Fight' }).click();
  await page.waitForFunction(() => window.__ironArena?.state().phase === 1, null, { timeout: 60_000 });
  const x0 = await page.evaluate(() => window.__ironArena!.state().fighters[0].x);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyD');
  const x1 = await page.evaluate(() => window.__ironArena!.state().fighters[0].x);
  expect(x1).toBeGreaterThan(x0);
});

test('heroes page lists every hero with their skills', async ({ page }) => {
  await page.goto('/how-to-play?render=0');
  for (const name of ['Benika', 'Hyōga', 'Lysa', 'Reo']) {
    await expect(page.getByRole('heading', { name })).toBeVisible();
  }
  await expect(page.getByText('Chiwari Shatter')).toBeVisible();
  await expect(page.getByText('Akatsuki Daybreak')).toBeVisible();
});

test('versus CPU: pick heroes and an arena, the CPU fights back', async ({ page }) => {
  await page.goto('/versus?render=0');
  // A second click on the same portrait picks it too
  await page.getByRole('button', { name: 'Lysa', exact: true }).click();
  await page.getByRole('button', { name: 'Lysa', exact: true }).click();
  await page.getByRole('button', { name: 'Reo', exact: true }).dblclick();
  await page.getByRole('button', { name: 'Midnight' }).click();
  await page.getByRole('button', { name: 'Fight' }).click();
  await page.waitForFunction(() => window.__ironArena?.state().phase === 1, null, { timeout: 60_000 });
  await page.waitForFunction(
    () =>
      window.__ironArena!.state().projectiles.length > 0 || window.__ironArena!.state().fighters[1].state !== 0,
    null,
    {
      timeout: 30_000,
    },
  );
  await page.keyboard.press('KeyU');
  await page.waitForFunction(() => window.__ironArena!.state().fighters[0].cd[0] > 0, null, {
    timeout: 10_000,
  });
});
