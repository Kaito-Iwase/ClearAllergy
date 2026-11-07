import { defineConfig } from './e2e/playwright.mjs';
import { localBaseURL } from './e2e/environment.mjs';

export default defineConfig({
    testDir: './e2e',
    outputDir: './test-results/e2e',
    fullyParallel: false,
    workers: 1, // The existing A/B shop fixtures are shared.
    forbidOnly: Boolean(process.env.CI),
    retries: 0, // Mutation tests must not silently repeat writes.
    timeout: 90_000,
    expect: { timeout: 15_000 },
    // HTML/JSON reporters retain API steps, including password.fill values.
    // Keep authenticated runs on the standard console reporter by default.
    reporter: 'list',
    use: {
        baseURL: localBaseURL(process.env.E2E_BASE_URL || process.env.CLEARALLERGY_BROWSER_BASE_URL),
        browserName: 'chromium',
        viewport: { width: 1440, height: 1000 },
        serviceWorkers: 'block',
        acceptDownloads: false,
        trace: 'off',
        screenshot: 'off',
        video: 'off',
        launchOptions: process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {},
    },
    projects: [
        { name: 'public', testMatch: 'public.spec.mjs', use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' } },
        { name: 'admin', testMatch: 'admin.spec.mjs' },
        { name: 'freshness', testMatch: 'freshness.spec.mjs', use: { launchOptions: {
            ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
            ignoreDefaultArgs: ['--disable-back-forward-cache'],
        } } },
    ],
    // Start the already prepared app separately. No automatic DB reset, Clerk
    // account creation, Prisma download, migration or package install here.
});
