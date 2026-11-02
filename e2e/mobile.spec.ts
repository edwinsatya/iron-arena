import { expect, test, type Page } from '@playwright/test';

/**
 * Phones: the on-screen stick and buttons drive the fighter, and a phone held upright gets the match
 * turned sideways. Touches go through the DevTools protocol, so they arrive as real touch pointers.
 */

const FS_DASH = 2;

async function startTraining(page: Page) {
  await page.goto('/training?render=0');
  await page.getByRole('button', { name: 'Benika', exact: true }).tap();
  await page.getByRole('button', { name: 'Choose Benika' }).tap();
  await page.getByRole('button', { name: 'Hyōga', exact: true }).tap();
  await page.getByRole('button', { name: 'Choose Hyōga' }).tap();
  await page.getByRole('button', { name: 'Start training' }).tap();
  await page.waitForFunction(() => window.__ironArena?.state().phase === 1, null, { timeout: 60_000 });
  await expect(page.locator('.tp-pad')).toBeVisible();
}

/** Put a finger down at `from`, slide it to `to`, hold it there, lift it. */
async function drag(page: Page, from: [number, number], to: [number, number], holdMs: number) {
  const cdp = await page.context().newCDPSession(page);
  const point = (x: number, y: number) => ({ touchPoints: [{ x, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', ...point(...from) });
  for (let i = 1; i <= 6; i++) {
    const x = from[0] + ((to[0] - from[0]) * i) / 6;
    const y = from[1] + ((to[1] - from[1]) * i) / 6;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', ...point(x, y) });
  }
  await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

const myX = (page: Page) => page.evaluate(() => window.__ironArena!.state().fighters[0].x);

test.describe('phone on its side', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });

  test('the stick walks, the sword attacks, skills and dash fire', async ({ page }) => {
    await startTraining(page);
    // The desktop skill tray gives way to the touch buttons
    await expect(page.locator('.hud-tray')).toBeHidden();

    const x0 = await myX(page);
    await drag(page, [150, 250], [240, 250], 700);
    expect(await myX(page)).toBeGreaterThan(x0);

    await page.locator('.tp-btn.atk').tap();
    await page.waitForFunction(() => window.__ironArena!.state().fighters[0].action >= 0, null, {
      timeout: 5_000,
    });

    await page.waitForTimeout(800);
    await page.locator('.tp-btn.s1').tap();
    await page.waitForFunction(() => window.__ironArena!.state().fighters[0].cd[0] > 0, null, {
      timeout: 5_000,
    });

    // Dash: the button plays a double tap of the stick toward where the hero faces
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const w = window as unknown as { seen: Set<number> };
      w.seen = new Set();
      const look = () => {
        w.seen.add(window.__ironArena!.state().fighters[0].state);
        requestAnimationFrame(look);
      };
      look();
    });
    await page.locator('.tp-btn.dash').tap();
    await expect
      .poll(() => page.evaluate(() => [...(window as unknown as { seen: Set<number> }).seen]))
      .toContain(FS_DASH);
  });
});

test.describe('phone held upright', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the match turns sideways and the stick still walks', async ({ page }) => {
    await startTraining(page);
    const box = await page.locator('.game-view').evaluate((el) => ({
      w: (el as HTMLElement).offsetWidth,
      h: (el as HTMLElement).offsetHeight,
      turned: getComputedStyle(el).transform !== 'none',
    }));
    expect(box.turned).toBe(true);
    expect(box.w).toBeGreaterThan(box.h);

    // The game's left edge is the screen's top: walking right is a slide down the screen
    const x0 = await myX(page);
    await drag(page, [140, 150], [140, 240], 700);
    expect(await myX(page)).toBeGreaterThan(x0);
  });
});
