import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test as base, expect } from './playwright.mjs';
import { assertAdminTarget, parseTestAccounts, parseLocalFixtureState, assertLocalFixtureProbe, fixtureServerIdentity } from './environment.mjs';

async function localActors(browser, baseURL) {
    let state;
    let serverIdentity;
    try {
        state = parseLocalFixtureState(readFileSync(process.env.E2E_LOCAL_STATE_FILE, 'utf8'), baseURL, process.env.E2E_LOCAL_RUN_ID);
        const receipt = JSON.parse(readFileSync(process.env.E2E_LOCAL_STATE_FILE + '.receipt.json', 'utf8'));
        if (receipt.runId !== state.runId) throw Error();
        serverIdentity = fixtureServerIdentity(receipt.serverIdentity, state.database);
    } catch { throw Error('Prepare the explicit disposable local-auth fixture before admin E2E.'); }
    const actors = {};
    try {
        for (const role of ['a', 'b']) {
            const account = state.accounts[role];
            const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: false });
            actors[role] = { context, shopId: account.shopId };
            await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
            // Check the actual server's run and DB before adding any identity.
            const probe = await context.request.get('/e2e-fixture-check', { maxRedirects: 0 });
            expect(probe.status()).toBe(200);
            assertLocalFixtureProbe(state, await probe.json(), serverIdentity);
            await context.addCookies([{ name: '__clearallergy_e2e_actor', value: account.cookie, url: baseURL, httpOnly: true, sameSite: 'Strict' }]);
            const response = await context.request.get('/api/admin/shop', { maxRedirects: 0 });
            expect(response.status()).toBe(200);
            expect((await response.json()).shop.id).toBe(account.shopId);
            actors[role].page = await context.newPage();
        }
        return actors;
    } catch {
        await Promise.allSettled(Object.values(actors).map(actor => actor.context.close()));
        throw Error('Local auth-boundary fixture or real shop ownership check failed.');
    }
}

function dedicatedTestingToken() {
    // Reuse the existing Compose DB guard before any authentication or writes.
    // This runs only when an admin test requests actors; never during --list.
    const script = `import {createClerkClient} from '@clerk/backend';
import {assertTestDatabaseTarget} from './scripts/test-environment.ts';
assertTestDatabaseTarget();
if(!process.env.CLERK_SECRET_KEY?.startsWith('sk_test_')||!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_'))throw Error('Dedicated development Clerk required');
try{const t=await createClerkClient({secretKey:process.env.CLERK_SECRET_KEY}).testingTokens.createTestingToken();process.stdout.write(JSON.stringify({token:t.token}));}catch{process.stderr.write('Dedicated Clerk testing token unavailable');process.exitCode=1;}`;
    try {
        const output = execFileSync('docker', ['compose', '-f', 'compose.test.yaml', 'exec', '-T', 'app',
            'node', '--import', 'tsx', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        const value = JSON.parse(output);
        if (typeof value.token !== 'string' || !value.token) throw Error();
        return value.token;
    } catch { throw Error('Admin E2E requires the already prepared dedicated Compose DB and development Clerk. No initialization is performed by this suite.'); }
}

async function login(browser, account, baseURL, token) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: false });
    try {
        await context.route('**/*.clerk.accounts.dev/**', route => {
            const url = new URL(route.request().url());
            url.searchParams.set('__clerk_testing_token', token);
            return route.continue({ url: url.toString() });
        });
        const page = await context.newPage();
        await page.goto('/admin/login');
        await page.waitForFunction(() => window.Clerk?.loaded);
        await page.getByLabel('メールアドレス', { exact: true }).fill(account.email);
        await page.getByLabel('パスワード', { exact: true }).fill(account.password);
        await page.getByRole('button', { name: 'ログイン', exact: true }).click();
        const code = page.getByPlaceholder('メールで届いたコードを入力');
        await expect.poll(async () => new URL(page.url()).pathname === '/admin/shop' || await code.isVisible(), { timeout: 30_000 }).toBe(true);
        if (await code.isVisible()) {
            await code.fill('424242');
            await page.getByRole('button', { name: 'コードを確認してログイン' }).click();
        }
        await page.waitForURL('**/admin/shop');
        const response = await context.request.get('/api/admin/shop', { maxRedirects: 0 });
        expect(response.status()).toBe(200);
        expect((await response.json()).shop.id).toBe(account.shopId);
        return { context, page, shopId: account.shopId };
    } catch {
        try { await context.close(); }
        catch { throw Error('Dedicated login failed and its browser context could not be closed.'); }
        // Never propagate a raw login error containing a password/testing token.
        throw Error('Dedicated test-account login or shop identity check failed. Authentication traces/screenshots are disabled.');
    }
}

export const test = base.extend({
    actors: [async ({ browser }, provide, workerInfo) => {
        const baseURL = workerInfo.project.use.baseURL;
        if (process.env.E2E_AUTH_MODE === 'local-mock') {
            const actors = await localActors(browser, baseURL);
            try { await provide(actors); }
            finally {
                const closed = await Promise.allSettled(Object.values(actors).map(actor => actor.context.close()));
                if (closed.some(result => result.status === 'rejected')) throw Error('An owned local E2E browser context could not be closed.');
            }
            return;
        }
        if (process.env.E2E_AUTH_MODE) throw Error('Unsupported E2E authentication mode.');
        assertAdminTarget(baseURL);
        let accounts;
        try { accounts = parseTestAccounts(readFileSync('.clerk/clearallergy-test-accounts.json', 'utf8')); }
        catch { throw Error('Prepare the existing fictional A/B test-account manifest before admin E2E.'); }
        const token = dedicatedTestingToken();
        const actors = {};
        try {
            actors.a = await login(browser, accounts.a, baseURL, token);
            actors.b = await login(browser, accounts.b, baseURL, token);
            await provide(actors);
        } finally {
            const closed = await Promise.allSettled(Object.values(actors).map(actor => actor.context.close()));
            if (closed.some(result => result.status === 'rejected')) throw Error('An owned admin E2E browser context could not be closed.');
        }
    }, { scope: 'worker', timeout: 120_000 }],
    createMenu: async ({ actors }, provide, testInfo) => {
        const created = [];
        const pages = [];
        try { await provide(async (role = 'a') => {
            const actor = actors[role];
            const page = await actor.context.newPage();
            pages.push(page);
            const tag = randomUUID();
            const name = `【架空E2E】${testInfo.title} ${tag}`;
            const ingredients = `架空E2E原材料 ${tag}`;
            await page.goto('/admin/menus/new');
            await page.getByLabel('メニュー名', { exact: true }).fill(name);
            await page.getByLabel(/原材料名/).fill(ingredients);
            const free = page.getByRole('button', { name: '原材料に含まない登録', exact: true });
            // Fictional fixtures only. This does not represent real food review.
            await expect(free.first()).toBeVisible();
            const count = await free.count();
            expect(count).toBeGreaterThan(0);
            for (let i = 0; i < count; i++) await free.nth(i).click();
            const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/menus' && r.request().method() === 'POST');
            await page.getByRole('button', { name: 'メニューを登録する', exact: true }).click();
            const response = await responsePromise;
            expect(response.status()).toBe(201);
            const { id } = await response.json();
            expect(id).toMatch(/^c[a-z0-9]+$/);
            created.push({ actor, id }); // register immediately, before later assertions
            await expect(page.getByRole('region', { name: '保存しました', exact: true })).toBeVisible();
            return { ...actor, page, id, name, ingredients, editURL: `/admin/menus/${id}/edit`, api: `/api/admin/menus/${id}`, publicAPI: `/api/menus/${id}` };
        }); } finally {
        const cleanup = await Promise.allSettled(created.reverse().map(async ({ actor, id }) => {
            const response = await actor.context.request.get(`/api/admin/menus/${id}`, { maxRedirects: 0 });
            if (response.status() === 404) return;
            expect(response.status(), 'read owned E2E menu for cleanup').toBe(200);
            const { menu } = await response.json();
            expect(menu.shopId).toBe(actor.shopId);
            const result = await actor.context.request.delete(`/api/admin/menus/${id}`, {
                maxRedirects: 0,
                headers: { Origin: new URL(testInfo.project.use.baseURL).origin }, data: { expectedVersion: menu.version },
            });
            expect(result.status(), 'delete only the menu created by this test').toBe(200);
        }));
        const closed = await Promise.allSettled(pages.map(page => page.close()));
        if (cleanup.some(result => result.status === 'rejected') || closed.some(result => result.status === 'rejected')) {
            throw Error('Owned E2E menu/page cleanup failed. Check only these created menu IDs: ' + created.map(item => item.id).join(', '));
        }
        }
    },
});
export { expect };

export async function publish(menu, expectedVersion) {
    const panel = menu.page.getByRole('region', { name: '保存しました', exact: true });
    const responsePromise = menu.page.waitForResponse(r => new URL(r.url()).pathname === menu.api && r.request().method() === 'PUT');
    await panel.getByRole('button', { name: 'この内容で公開', exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON().publicationAction).toBe('publish');
    if (expectedVersion !== undefined) {
        expect(response.request().postDataJSON()).toEqual({ expectedVersion, publicationAction: 'publish' });
    }
    const result = (await response.json()).menu;
    expect(result.isPublished).toBe(true);
    return result;
}

export async function readMenu(menu) {
    const response = await menu.context.request.get(menu.api, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    return (await response.json()).menu;
}
