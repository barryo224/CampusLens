import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // BASE_URL permet de rejouer les tests contre le site CONSTRUIT et servi avec ses en-têtes de production
  // (voir « npm run test:e2e:prod »).
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:5173', trace: 'on-first-retry' },
  // Navigateurs demandés : Chrome, Firefox et mobile.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'npm run dev -w backend',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env.CI,
      cwd: '..',
    },
    // Site de développement, sauf si on teste le site construit (BASE_URL fourni).
    ...(process.env.BASE_URL
      ? []
      : [
          {
            command: 'npm run dev -w frontend',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            cwd: '..',
          },
        ]),
  ],
});
