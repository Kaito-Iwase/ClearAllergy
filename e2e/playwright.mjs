// Reuse the repository's isolated Playwright installation; no app dependency.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const api = await import(process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(join(process.env.PLAYWRIGHT_MODULE_PATH, 'test.mjs')).href : 'playwright/test');
export const { test, expect, defineConfig, devices } = api;
