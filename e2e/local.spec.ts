import { expect, test } from '@playwright/test';

test('landing page shows the title and the live exhibition fight', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'NEON FIST' })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
});

test('local versus: a fight starts and inputs move the fighters', async ({ page }) => {
  await page.goto('/local?render=0');
  await page.getByRole('button', { name: 'Fight' }).click();
  await page.waitForFunction(() => window.__neonfist?.state().phase === 1, null, { timeout: 60_000 });
  const x0 = await page.evaluate(() => window.__neonfist!.state().fighters[0].x);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyD');
  const x1 = await page.evaluate(() => window.__neonfist!.state().fighters[0].x);
  expect(x1).toBeGreaterThan(x0);
});

test('how to play lists both fighters', async ({ page }) => {
  await page.goto('/how-to-play');
  await expect(page.getByRole('heading', { name: 'Kaito Arashi' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Magnus Thorne' })).toBeVisible();
  await expect(page.getByText('Skyward Uppercut')).toBeVisible();
});
