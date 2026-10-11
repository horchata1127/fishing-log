import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/offline', workers: 1, fullyParallel: false, timeout: 90000,
  use: { baseURL: 'http://127.0.0.1:4188/fishing-log/', serviceWorkers: 'allow', actionTimeout: 10000, navigationTimeout: 15000 },
  projects: [
    { name: 'offline-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'offline-mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: { command: 'node tests/offline/server.mjs', url: 'http://127.0.0.1:4188/fishing-log/', reuseExistingServer: false },
  outputDir: 'offline-test-results', reporter: 'list',
})
