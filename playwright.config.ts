import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.ts/,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    // PW_SWIFTSHADER=1 reproduces CI locally: software WebGL instead of the real GPU
    launchOptions: {
      args: process.env.PW_SWIFTSHADER
        ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu']
        : ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu'],
    },
  },
  // locally: the system Chrome (real GPU); in CI: Playwright's Chromium with SwiftShader
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // CI renders with SwiftShader (CPU): keep the ray tracer's pixel count modest there
        viewport: process.env.CI || process.env.PW_SWIFTSHADER ? { width: 960, height: 600 } : { width: 1280, height: 800 },
        ...(process.env.CI ? {} : { channel: 'chrome' }),
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
