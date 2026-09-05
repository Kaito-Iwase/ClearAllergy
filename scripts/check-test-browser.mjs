// 専用Composeで初期化した店舗・アカウントだけを使う実操作テスト。
// PlaywrightとChromiumは呼出し側の既存ランナーを使用する（アプリの依存には追加しない）。
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = 'http://localhost:3101';
const accounts = JSON.parse(readFileSync('.clerk/clearallergy-test-accounts.json', 'utf8')).accounts;
const createdImages = [];
const cleanupMenus = [];
let testingToken = '';
const redact = (value) => {
    let text = String(value);
    for (const a of accounts) text = text.replaceAll(a.password, '[redacted]');
    if (testingToken) text = text.replaceAll(testingToken, '[redacted]');
    return text;
};
const tokenScript = `const {createClerkClient}=require('@clerk/backend');
if(process.env.CLEARALLERGY_TEST_ENV!=='true'||!process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'))throw Error('Not a test environment');
createClerkClient({secretKey:process.env.CLERK_SECRET_KEY}).testingTokens.createTestingToken().then(t=>process.stdout.write(JSON.stringify({token:t.token})));`;
const token = JSON.parse(execFileSync('docker', ['compose', '-f', 'compose.test.yaml', 'exec', '-T', 'app', 'node', '-e', tokenScript], { encoding: 'utf8' }));
testingToken = token.token;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const errors = [];
let ownerContext;
async function login(account) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/*.clerk.accounts.dev/**', (route) => {
        const url = new URL(route.request().url());
        url.searchParams.set('__clerk_testing_token', testingToken);
        return route.continue({ url: url.toString() });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', (e) => errors.push(redact(e.message)));
    await page.goto(base + '/admin/login');
    await page.waitForFunction(() => window.Clerk?.loaded);
    await page.getByLabel('メールアドレス', { exact: true }).fill(account.email);
    await page.getByLabel('パスワード', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    const code = page.getByPlaceholder('メールで届いたコードを入力');
    await Promise.race([page.waitForURL('**/admin/shop'), code.waitFor()]);
    if (await code.isVisible()) {
        await code.fill('424242');
        await page.getByRole('button', { name: 'コードを確認してログイン' }).click();
    }
    await page.waitForURL('**/admin/shop');
    return { context, page };
}
try {
    const anonymous = await browser.newContext();
    assert.equal((await anonymous.request.get(base + '/api/admin/menus')).status(), 401);
    const anonPage = await anonymous.newPage();
    await anonPage.goto(base + '/admin/demo/menus');
    await anonPage.locator('a[href^="/admin/demo/menus/"][href$="/edit"]').first().waitFor();
    console.log('PASS: anonymous admin API is denied; dedicated read-only demo has editable-preview links');
    await anonymous.close();
    const a = await login(accounts[0]); ownerContext = a.context;
    const b = await login(accounts[1]);
    console.log('PASS: two dedicated users sign in through the real Clerk password UI');
    await a.page.getByLabel('お店の説明', { exact: true }).fill('架空店舗A。保存・再読込を確認するUI検証データです。');
    const shopSaved = a.page.waitForResponse(r => r.url() === base + '/api/admin/shop' && r.request().method() === 'PUT');
    await a.page.getByRole('button', { name: '変更を保存', exact: true }).click();
    assert.equal((await shopSaved).status(), 200);
    await a.page.reload();
    assert.match(await a.page.getByLabel('お店の説明', { exact: true }).inputValue(), /保存・再読込/);
    console.log('PASS: shop changes persist after reloading');
    const publicPage = await browser.newPage();
    publicPage.on('pageerror', (e) => errors.push(redact(e.message)));
    await publicPage.goto(base + '/shops/' + accounts[0].shopId);
    await publicPage.evaluate(() => localStorage.setItem('clearallergy:user-allergens', JSON.stringify({ highlightSlugs: ['egg'], excludedSlugs: [], includeMayContain: false })));
    await publicPage.reload();
    const pancake = publicPage.locator('article[role="button"]').filter({ has: publicPage.getByRole('heading', { name: '米粉パンケーキ', exact: true }) });
    await pancake.getByText(/同店舗の別の公開登録/).waitFor();
    await pancake.press('Enter');
    await publicPage.waitForURL(/\/menus\//);
    await publicPage.getByText(/実際の厨房での取扱いや交差接触を確認した結果ではありません/).first().waitFor();
    const publicMenuId = new URL(publicPage.url()).pathname.split('/').pop();
    const supplementResponse = await publicPage.request.get(base + '/api/menus/' + publicMenuId);
    const supplementData = await supplementResponse.json();
    const egg = supplementData.menu.allergenDisplayItems.find(item => item.slug === 'egg');
    assert.equal(egg.status, 'FREE'); assert.equal(egg.effectiveRisk, 'STORE_HANDLED');
    await publicPage.close();
    console.log('PASS: real fixture FREE plus another public CONTAINS keeps its supplement in list, detail, and API');
    await a.page.goto(base + '/admin/menus/new');
    await a.page.getByLabel('メニュー名', { exact: true }).fill('【架空検証】公開から編集まで ' + Date.now());
    await a.page.getByLabel('原材料名', { exact: false }).fill('架空データ（実際の食品ではありません）');
    const free = a.page.getByRole('button', { name: '原材料に含まない登録', exact: true });
    for (let i = 0; i < await free.count(); i++) await free.nth(i).click();
    await a.page.getByRole('group', { name: '卵', exact: true }).getByRole('button', { name: '含む可能性あり・要確認', exact: true }).click();
    // 小さなPNGを今回の店舗IDのパスへだけアップロードする。
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');
    await a.page.locator('input[type=file]').setInputFiles({ name: 'test-fixture.png', mimeType: 'image/png', buffer: png });
    a.page.on('response', async response => {
        if (response.url() === base + '/api/admin/upload-menu-image' && response.status() === 200) {
            const data = await response.json();
            assert.ok(new URL(data.url).pathname.startsWith('/menu-images/' + accounts[0].shopId + '/'));
            createdImages.push(data.url);
            writeFileSync('.clerk/clearallergy-test-created-images.json', JSON.stringify(createdImages), { mode: 0o600 });
        }
    });
    await a.page.getByRole('button', { name: '非公開の下書きとして登録する', exact: true }).click();
    let posts = 0;
    a.page.on('request', r => { if (r.url() === base + '/api/admin/menus' && r.method() === 'POST') posts++; });
    a.page.once('dialog', d => d.dismiss());
    await a.page.getByRole('button', { name: 'この内容で登録する', exact: true }).click();
    assert.equal(posts, 0); assert.equal(createdImages.length, 0);
    a.page.once('dialog', d => d.accept());
    await a.page.getByRole('button', { name: 'この内容で登録する', exact: true }).click();
    await a.page.waitForURL(/\/admin\/menus\/[^/]+\/edit$/);
    const id = new URL(a.page.url()).pathname.split('/').at(-2); cleanupMenus.push(id);
    const pub = await a.context.request.get(base + '/api/menus/' + id);
    assert.equal(pub.status(), 200); assert.equal(createdImages.length, 1);
    const publicData = await pub.json();
    assert.ok(publicData.menu.imageUrl);
    console.log('PASS: confirmation cancellation sends nothing; reviewed MAY_CONTAIN menu and real Blob image publish successfully');
    for (const method of ['get', 'put', 'delete']) {
        const response = await b.context.request[method](base + '/api/admin/menus/' + id, { headers: { Origin: base }, ...(method === 'put' ? { data: { name: 'unauthorized', shopId: accounts[1].shopId } } : {}) });
        assert.equal(response.status(), 404);
    }
    await b.page.goto(base + '/admin/menus/' + id + '/edit');
    await b.page.getByRole('heading', { name: 'ページが見つかりません', exact: true }).waitFor();
    const csrf = await a.context.request.put(base + '/api/admin/menus/' + id, { headers: { Origin: 'https://invalid.example' }, data: { name: 'csrf' } });
    assert.equal(csrf.status(), 403);
    console.log('PASS: another authenticated shop cannot read, update, or delete; cross-origin update is rejected');
    await a.page.getByLabel('説明', { exact: true }).fill('失敗時にも保持する架空入力');
    await a.page.route('**/api/admin/menus/' + id, r => r.request().method() === 'PUT' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"simulated failure"}' }) : r.continue(), { times: 1 });
    a.page.once('dialog', d => d.accept());
    await a.page.getByRole('button', { name: '保存する', exact: true }).click();
    await a.page.getByRole('alert').filter({ hasText: /simulated failure|保存|失敗|エラー/ }).waitFor();
    assert.equal(await a.page.getByLabel('説明', { exact: true }).inputValue(), '失敗時にも保持する架空入力');
    console.log('PASS: simulated failed save retains input');
    await a.page.getByLabel('原材料名', { exact: false }).fill('原材料変更後の架空データ');
    await a.page.getByRole('group', { name: '卵', exact: true }).getByRole('button', { name: '未設定', exact: true }).click();
    let review = '';
    a.page.once('dialog', d => { review = d.message(); return d.accept(); });
    await a.page.getByRole('button', { name: '保存する', exact: true }).click();
    await a.page.getByRole('status').filter({ hasText: '保存しました' }).waitFor();
    assert.match(review, /原材料を変更/);
    assert.equal((await a.context.request.get(base + '/api/menus/' + id)).status(), 404);
    await a.page.reload();
    assert.match(await a.page.getByRole('status').filter({ hasText: '保存済みの公開設定' }).innerText(), /非公開/);
    console.log('PASS: ingredient review, UNKNOWN auto-unpublication, public 404, and saved state survive reload');
    for (const width of [390, 1440]) {
        await a.page.setViewportSize({ width, height: 1000 });
        assert.equal(await a.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: admin edit mobile/desktop width and no client exceptions');
    await b.context.close();
} catch (error) {
    console.error(redact(error instanceof Error ? error.message : error));
    process.exitCode = 1;
} finally {
    if (ownerContext) for (const id of cleanupMenus) {
        const response = await ownerContext.request.delete(base + '/api/admin/menus/' + id, { headers: { Origin: base } });
        if (response.status() !== 200) { console.error('Test menu cleanup did not succeed'); process.exitCode = 1; }
    }
    await browser.close();
}
