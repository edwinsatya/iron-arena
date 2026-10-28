import { defineConfig, devices } from '@playwright/test';

/**
 * E2E (PLAN §10.4): starts the Node lobby and the production web build, then drives real browsers.
 * Run `pnpm build` first. Chromium-only by default; CI adds Firefox and WebKit.
 */
const chromiumPath = process.env.PW_CHROMIUM_PATH; // e.g. a preinstalled Chromium in sandboxes

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: chromiumPath,
          args: [
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--autoplay-policy=no-user-gesture-required',
            // Allow host ICE candidates between two pages on the same machine
            '--disable-features=WebRtcHideLocalIpsWithMdns',
          ],
        },
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @neonfist/lobby start',
      url: 'http://localhost:8787/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @neonfist/web start',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
