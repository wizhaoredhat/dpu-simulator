import { defineConfig, devices } from '@playwright/test';

const basePath = process.env.WEBSITE_BASE_PATH || '/dpu-simulator/';
const baseURL = `http://127.0.0.1:4180${basePath}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 4180 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
  },
});
