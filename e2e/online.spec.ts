import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Two browsers, one room, a real fight over the network (PLAN Phase 2 "done when"):
 * both simulations must produce identical checksums for every confirmed frame.
 */

async function player(browser: Browser, name: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] page error:`, e.message));
  await page.addInitScript((n) => {
    localStorage.setItem('neonfist.settings.v1', JSON.stringify({ name: n, announcer: false, volume: 0, quality: 'low' }));
  }, name);
  return page;
}

/** Common confirmed frames and how many of them match. */
async function compare(a: Page, b: Page) {
  const read = (p: Page) =>
    p.evaluate(() => {
      const d = window.__neonfist?.driver as unknown as { session?: { confirmedChecksums: Map<number, number> } };
      return d?.session ? [...d.session.confirmedChecksums.entries()] : [];
    });
  const [ma, mb] = [new Map(await read(a)), new Map(await read(b))];
  let common = 0;
  let mismatches = 0;
  for (const [f, sum] of ma) {
    if (!mb.has(f)) continue;
    common++;
    if (mb.get(f) !== sum) mismatches++;
  }
  return { common, mismatches };
}

async function playOnline(browser: Browser, query: string) {
  const host = await player(browser, 'Host');
  const guest = await player(browser, 'Guest');

  await host.goto('/');
  await host.getByRole('button', { name: 'Create a room' }).click();
  await host.waitForURL(/\/room\/[A-Z0-9]{6}/);
  const code = host.url().split('/room/')[1]!.slice(0, 6);
  await host.goto(`/room/${code}${query}`);
  await expect(host.getByText('Invite your friend')).toBeVisible();

  await guest.goto(`/room/${code}${query}`);
  await expect(guest.getByText('Choose your fighter')).toBeVisible();
  await expect(host.getByText('Choose your fighter')).toBeVisible();

  await host.getByRole('button', { name: 'Pick' }).first().click(); // Kaito
  await guest.getByRole('button', { name: 'Pick' }).nth(1).click(); // Magnus
  await host.getByRole('button', { name: 'Ready' }).click();
  await guest.getByRole('button', { name: 'Ready' }).click();

  // Both fight screens are up once the session exists
  for (const p of [host, guest]) await p.waitForFunction(() => !!window.__neonfist, null, { timeout: 60_000 });

  // Fight: both mash and move for a while (keyboard → the real input path)
  const script = async (p: Page, seed: number) => {
    const keys = ['KeyD', 'KeyA', 'KeyU', 'KeyI', 'KeyJ', 'KeyK', 'KeyS'];
    for (let i = 0; i < 60; i++) {
      const k = keys[(i * 7 + seed) % keys.length]!;
      await p.keyboard.down(k);
      await p.waitForTimeout(60 + ((i * 13 + seed) % 5) * 40);
      await p.keyboard.up(k);
    }
  };
  await Promise.all([script(host, 1), script(guest, 4)]);

  const frames = await Promise.all([host, guest].map((p) => p.evaluate(() => window.__neonfist!.state().frame)));
  console.log(`frames reached: host ${frames[0]}, guest ${frames[1]}`);
  const r = await compare(host, guest);
  console.log(`confirmed frames compared: ${r.common}, mismatches: ${r.mismatches}`);
  expect(r.common).toBeGreaterThan(200);
  expect(r.mismatches).toBe(0);

  const path = await host.evaluate(() => (window.__neonfist!.driver.netStats() as { path: string }).path);
  await host.context().close();
  await guest.context().close();
  return path;
}

test('online match over WebRTC (falls back to the relay if P2P is impossible)', async ({ browser }) => {
  const path = await playOnline(browser, '?render=0');
  console.log(`connection path: ${path}`);
  expect(['direct', 'turn', 'relay']).toContain(path);
});

test('online match over the WebSocket relay', async ({ browser }) => {
  const path = await playOnline(browser, '?relay=1&render=0');
  expect(path).toBe('relay');
});
