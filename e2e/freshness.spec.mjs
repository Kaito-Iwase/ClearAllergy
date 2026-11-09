import { test, expect, publish, readMenu } from './admin-fixtures.mjs';
import { setPreferenceMode } from '../scripts/allergen-preference-browser-helpers.mjs';

test.beforeEach(async ({ context, baseURL }) => {
    await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
});
const controls = page => page.getByRole('complementary', { name: '公開情報の再取得', exact: true });
const surface = page => page.locator('[data-public-freshness]');
const publicURL = menu => `/shops/${menu.shopId}/menus/${menu.id}`;
async function ready(page) {
    await expect(surface(page)).toHaveAttribute('data-public-freshness', 'ready');
    await expect(surface(page)).toHaveAttribute('data-previous-information', 'false');
    await expect(controls(page)).toHaveCount(0);
}
async function resume(page) { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); }
async function refresh(page, { retry = false } = {}) {
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/public-snapshot');
    if (retry) await controls(page).getByRole('button', { name: '公開情報を再取得', exact: true }).click();
    else await resume(page);
    const result = await response; await ready(page); return result;
}
async function stop(menu) {
    const response = await menu.context.request.post(menu.api + '/stop', { maxRedirects: 0, headers: { Origin: new URL(menu.page.url()).origin } });
    expect(response.status()).toBe(200);
}
async function statuses(menu) {
    await menu.page.goto(menu.editURL);
    for (const [name, status] of [['卵', '含む'], ['小麦', '含む可能性あり・要確認']]) {
        await menu.page.getByRole('group', { name, exact: true }).getByRole('button', { name: status, exact: true }).click();
    }
    const saved = menu.page.waitForResponse(r => new URL(r.url()).pathname === menu.api && r.request().method() === 'PUT');
    await menu.page.getByRole('button', { name: '保存する', exact: true }).click(); expect((await saved).status()).toBe(200);
    await publish(menu);
}
async function shot(page, testInfo, name) {
    // Fictional anonymous public page only; no cookies, login UI, traces or tokens.
    await page.screenshot({ path: testInfo.outputPath(name + '.png'), fullPage: true });
}

async function selectPreferences(page, settings) {
    const panel = page.getByRole('button', { name: /あなた向けのアレルゲン設定/ }).filter({ visible: true });
    if (await panel.getAttribute('aria-expanded') !== 'true') await panel.click();
    for (const [name, value] of settings) await setPreferenceMode(page, name, value);
    await page.getByRole('button', { name: '変更を適用', exact: true }).filter({ visible: true }).click();
}

test('鮮度: 三画面で通常時のパネルを表示せず、復帰時に再取得して検索入力を保持する', async ({ createMenu, page }) => {
    const menu = await createMenu(); await publish(menu);
    for (const [url, kind] of [['/shops', 'list'], [`/shops/${menu.shopId}`, 'shop'], [publicURL(menu), 'menu']]) {
        await page.goto(url); await ready(page);
        await expect(page.getByRole('heading', { name: '公開情報の取得状態', exact: true })).toHaveCount(0);
        await expect(page.getByText('旧情報の表示を比較する', { exact: true })).toHaveCount(0);
        const result = await refresh(page); expect(result.status()).toBe(200);
        const body = await result.json(); expect(body.result.kind).toBe(kind); expect(body.targetKey).toBe(url);
        expect(JSON.stringify(body)).not.toContain('publicationConfirmedFoodVersion');
    }
    await page.goto('/shops'); await ready(page);
    const search = page.getByRole('textbox', { name: /キーワード/ }).filter({ visible: true });
    await expect(search).toHaveCount(1); await search.fill('未適用の検索入力'); await refresh(page); await expect(search).toHaveValue('未適用の検索入力');
});

test('鮮度: 取得中・失敗の旧FREE要約を抑え、注意情報を保持して再試行で回復する', async ({ createMenu, page }, testInfo) => {
    const menu = await createMenu(); await statuses(menu); await page.goto(publicURL(menu)); await ready(page);
    const allergenCount = (await readMenu(menu)).allergens.length;
    const panel = page.getByRole('button', { name: /あなた向けのアレルゲン設定/ }).filter({ visible: true });
    if (await panel.getAttribute('aria-expanded') !== 'true') await panel.click();
    await setPreferenceMode(page, '乳', 'highlight');
    await page.getByRole('button', { name: '変更を適用', exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole('heading', { name: '原材料に含まない', exact: true })).toBeVisible();
    await shot(page, testInfo, 'normal');
    let release; const held = new Promise(resolve => { release = resolve; });
    let requests = 0;
    const handler = async route => {
        requests++;
        await held;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'explicit fictional failure' }) });
    };
    await page.route('**/api/public-snapshot?**', handler);
    try {
        await resume(page);
        await expect(surface(page)).toHaveAttribute('data-public-freshness', 'loading');
        await expect(page.getByRole('heading', { name: '原材料に含まない', exact: true })).toHaveCount(0);
        await expect(page.getByText('未再確認のため、条件に合うかの要約は表示していません。詳細の登録状態も以前取得した情報です。', { exact: true })).toBeVisible();
        const old = page.getByRole('region', { name: '以前取得した公開情報', exact: true });
        await expect(old.getByText('含む', { exact: true })).toBeVisible();
        await expect(old.getByText('含む可能性あり・要確認', { exact: true })).toBeVisible();
        await expect(old.getByText('以前取得した登録・現在は未再確認', { exact: true })).toHaveCount(allergenCount);
        await shot(page, testInfo, 'loading');
        // A failure between pointer-down and pointer-up must not turn cancel into retry.
        const cancel = controls(page).getByRole('button', { name: '取得を中止', exact: true });
        await cancel.scrollIntoViewIfNeeded();
        const button = await cancel.boundingBox();
        expect(button).not.toBeNull();
        await page.mouse.move(button.x + 4, button.y + button.height / 2);
        await page.mouse.down();
        release();
        await expect(controls(page).getByRole('button', { name: '公開情報を再取得', exact: true })).toBeVisible();
        await page.mouse.up();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        expect(requests).toBe(1);
        await expect(surface(page)).toHaveAttribute('data-public-freshness', 'error');
        await expect(controls(page).getByRole('alert')).toHaveText('再取得できませんでした。');
        await expect(page.getByText(menu.ingredients, { exact: true })).toBeVisible();
        await page.setViewportSize({ width: 390, height: 844 }); await shot(page, testInfo, 'failure-mobile');
    } finally { release(); await page.unroute('**/api/public-snapshot?**', handler); }
    await refresh(page, { retry: true });
    await expect(page.getByRole('heading', { name: '原材料に含まない', exact: true })).toBeVisible();
    const focused = page.getByRole('link', { name: '店舗ページで他のメニューを見る', exact: true });
    await focused.focus();
    let releaseFocus; let cancelled = false; const focusHold = new Promise(resolve => { releaseFocus = resolve; });
    const focusHandler = async route => {
        await focusHold;
        try { await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); }
        catch (error) { if (!cancelled) throw error; } // This request was explicitly aborted by the test.
    };
    await page.route('**/api/public-snapshot?**', focusHandler);
    try {
        await resume(page);
        await expect(surface(page)).toHaveAttribute('data-public-freshness', 'loading');
        await expect(focused).toBeFocused();
        await expect(page.getByText(menu.ingredients, { exact: true })).toBeVisible();
        cancelled = true; await controls(page).getByRole('button', { name: '取得を中止', exact: true }).press('Enter');
        await expect(surface(page)).toHaveAttribute('data-public-freshness', 'error');
        await expect(controls(page).getByText('再取得を中止しました。', { exact: true })).toBeVisible();
    } finally { releaseFocus(); await page.unroute('**/api/public-snapshot?**', focusHandler); }
    await refresh(page, { retry: true });
});

test('鮮度: 混在する含有・混入・FREEも取得中/失敗時は同じFREE行を以前の登録と示す', async ({ createMenu, page }, testInfo) => {
    const menu = await createMenu(); await statuses(menu); await page.goto(publicURL(menu)); await ready(page);
    await selectPreferences(page, [['卵', 'highlight'], ['小麦', 'highlight'], ['乳', 'highlight']]);
    const mixed = page.getByRole('region', { name: '選択中アレルゲンの登録状態', exact: true });
    const milk = mixed.getByRole('listitem').filter({ hasText: '乳' });
    await expect(milk).toHaveCount(1); await expect(milk).toContainText('原材料に含まない');
    await expect(milk).not.toContainText('現在は未再確認');
    let release; const held = new Promise(resolve => { release = resolve; });
    const handler = async route => { await held; await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); };
    await page.route('**/api/public-snapshot?**', handler);
    try {
        await resume(page);
        await expect(surface(page)).toHaveAttribute('data-public-freshness', 'loading');
        await expect(milk).toContainText('以前の登録は「原材料に含まない」');
        await expect(milk).toContainText('以前取得した登録・現在は未再確認');
        await expect(page.getByRole('heading', { name: '含む', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: '含む可能性あり・要確認', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: '原材料に含まない', exact: true })).toHaveCount(0);
        release(); await expect(surface(page)).toHaveAttribute('data-public-freshness', 'error');
        await expect(milk).toContainText('以前取得した登録・現在は未再確認');
        await page.setViewportSize({ width: 390, height: 844 }); await shot(page, testInfo, 'mixed-failure-mobile');
    } finally { release(); await page.unroute('**/api/public-snapshot?**', handler); }
    await refresh(page, { retry: true });
    await expect(milk).toContainText('原材料に含まない'); await expect(milk).not.toContainText('現在は未再確認');
    const saved = await readMenu(menu);
    for (const [slug, status] of [['egg', 'CONTAINS'], ['wheat', 'MAY_CONTAIN'], ['milk', 'FREE']]) expect(saved.allergens.find(row => row.slug === slug)?.status).toBe(status);
});

test('鮮度: 旧除外結果を再確認済みの条件一致と呼ばず、実訂正後の再取得で一覧から除く', async ({ createMenu, page }, testInfo) => {
    const menu = await createMenu(); await publish(menu); await page.goto('/shops'); await ready(page);
    await selectPreferences(page, [['卵', 'exclude']]);
    const card = page.locator(`#shop-${menu.shopId}`);
    await expect(card).toBeVisible();
    await expect(page.getByRole('heading', { name: '条件に一致するClearAllergy登録済み店舗', exact: true })).toBeVisible();
    let release; const held = new Promise(resolve => { release = resolve; });
    const handler = async route => { await held; await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); };
    await page.route('**/api/public-snapshot?**', handler);
    try {
        await resume(page);
        await expect(surface(page)).toHaveAttribute('data-public-freshness', 'loading');
        await statuses(menu); // Actual save and separate publish: old FREE becomes CONTAINS.
        const changed = await readMenu(menu); expect(changed.isPublished).toBe(true);
        expect(changed.allergens.find(row => row.slug === 'egg')?.status).toBe('CONTAINS');
        await expect(card).toBeVisible(); // A keeps the previous snapshot; this is not a current match.
        await expect(page.getByRole('heading', { name: '条件に一致するClearAllergy登録済み店舗', exact: true })).toHaveCount(0);
        await expect(page.getByRole('heading', { name: '以前取得した登録情報による店舗一覧', exact: true })).toBeVisible();
        await expect(page.getByText('表示・非表示の判定は以前取得した登録情報によるものです。現在のアレルゲン登録を再確認できていません。', { exact: true })).toBeVisible();
        release(); await expect(surface(page)).toHaveAttribute('data-public-freshness', 'error');
        await expect(card).toBeVisible();
        await expect(page.getByRole('heading', { name: '以前取得した登録情報による店舗一覧', exact: true })).toBeVisible();
        await page.setViewportSize({ width: 390, height: 844 }); await shot(page, testInfo, 'list-failure-mobile');
    } finally { release(); await page.unroute('**/api/public-snapshot?**', handler); }
    await refresh(page, { retry: true });
    await expect(card).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '条件に一致するClearAllergy登録済み店舗', exact: true })).toBeVisible();
    await expect(page.getByText('表示・非表示の判定は以前取得した登録情報によるものです。現在のアレルゲン登録を再確認できていません。', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('clearallergy:user-allergens')).excludedSlugs)).toContain('egg');
});

test('鮮度: 実STOP後は三画面の新規結果から旧食品と店舗を除去する', async ({ createMenu, context }) => {
    const menu = await createMenu(); await publish(menu);
    const pages = await Promise.all([context.newPage(), context.newPage(), context.newPage()]);
    try {
        const urls = ['/shops', `/shops/${menu.shopId}`, publicURL(menu)];
        for (let i = 0; i < pages.length; i++) { await pages[i].goto(urls[i]); await ready(pages[i]); }
        await stop(menu);
        for (let i = 0; i < pages.length; i++) {
            const response = await refresh(pages[i]); expect(response.status()).toBe(i === 0 ? 200 : 404);
            if (i === 0) await expect(pages[i].locator(`a[href="/shops/${menu.shopId}"]`)).toHaveCount(0);
            else {
                await expect(pages[i].getByRole('heading', { name: 'この公開情報は現在表示できません', exact: true })).toBeVisible();
                await expect(pages[i].getByRole('heading', { name: 'この公開情報は現在表示できません', exact: true })).toBeFocused();
                await expect(pages[i].getByRole('heading', { name: menu.name, exact: true })).toHaveCount(0);
                await expect(pages[i].getByText(menu.ingredients, { exact: true })).toHaveCount(0);
            }
        }
    } finally { await Promise.all(pages.map(page => page.close())); }
});

test('鮮度: 本体更新日時が同じでも他メニュー停止による店舗内補足を再取得する', async ({ createMenu, page, request }) => {
    const target = await createMenu(); await publish(target);
    const source = await createMenu(); await statuses(source);
    const before = await (await request.get(target.publicAPI)).json();
    await page.goto(publicURL(target)); await ready(page);
    const egg = page.locator('div').filter({ has: page.locator(':scope > span').filter({ hasText: /^卵$/ }) });
    await expect(egg.getByText('別メニューに含む', { exact: true })).toBeVisible();
    const owner = await readMenu(target); await stop(source);
    expect(await readMenu(target)).toEqual(owner);
    const response = await refresh(page); const next = (await response.json()).result.data;
    expect(next.storeHandledAllergenSlugs).not.toContain('egg');
    expect(next.rows.find(row => row.slug === 'egg')).toMatchObject({ status: 'FREE', effectiveRisk: 'FREE' });
    await expect(egg.getByText('別メニューに含む', { exact: true })).toHaveCount(0);
    const after = await (await request.get(target.publicAPI)).json(); expect(after.menu.updatedAt).toBe(before.menu.updatedAt);
});

test('鮮度: 合成focus/visible/pageshowの重複を集約して停止を再検証する', async ({ createMenu, page }) => {
    const menu = await createMenu(); await publish(menu); await page.goto(publicURL(menu)); await ready(page); await stop(menu);
    let requests = 0; page.on('request', request => { if (new URL(request.url()).pathname === '/api/public-snapshot') requests++; });
    await page.evaluate(() => {
        window.dispatchEvent(new Event('focus'));
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await expect(page.getByRole('heading', { name: 'この公開情報は現在表示できません', exact: true })).toBeVisible();
    await ready(page); expect(requests).toBe(1);
});

test('鮮度: 実SPA履歴で戻った画面から停止した食品を再表示し続けない', async ({ createMenu, page }, testInfo) => {
    const menu = await createMenu(); await publish(menu); await page.goto(publicURL(menu)); await ready(page);
    await page.evaluate(() => { window.__freshnessPopstates = 0; window.addEventListener('popstate', () => { window.__freshnessPopstates++; }); });
    await page.getByRole('link', { name: '店舗ページで他のメニューを見る', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/shops/${menu.shopId}$`)); await ready(page); await stop(menu);
    await page.goBack(); await expect(page).toHaveURL(new RegExp(publicURL(menu) + '$'));
    await expect(page.getByRole('heading', { name: /^(この公開情報は現在表示できません|ページが見つかりません)$/ })).toBeVisible();
    await expect(page.getByText(menu.ingredients, { exact: true })).toHaveCount(0);
    const popstates = await page.evaluate(() => window.__freshnessPopstates); expect(popstates).toBeGreaterThan(0);
    console.info('[spa-history-observation]', JSON.stringify({ popstates, sameDocument: true }));
    await shot(page, testInfo, 'spa-withdrawn');
});

test('鮮度: 公開layout外から複数履歴を戻り、訂正された食品を再取得する', async ({ actors, createMenu, baseURL }) => {
    const menu = await createMenu(); await publish(menu);
    // The existing signed-in actor follows the real login redirect without
    // rendering the unsupported Clerk login form in the local boundary double.
    const page = actors.a.page;
    await page.goto(publicURL(menu)); await ready(page);
    await page.evaluate(token => {
        window.__freshnessOutsideLayout = { token, popstates: 0 };
        window.addEventListener('popstate', () => { window.__freshnessOutsideLayout.popstates++; });
    }, menu.id);
    await page.locator('header a[href="/"]').click();
    await expect(page).toHaveURL(new URL('/', baseURL).href);
    await page.locator('a[href="/admin/login"]').first().click();
    await expect(page).toHaveURL(new URL('/admin/shop', baseURL).href);
    await expect(page.getByLabel('お店の説明', { exact: true })).toBeVisible();
    await expect(surface(page)).toHaveCount(0);

    // Keep the target published so either a cached or a new RSC result mounts
    // its Surface. A fresh server 404 would correctly have no Surface to wake.
    const correctedName = `${menu.name} 訂正後`;
    await menu.page.goto(menu.editURL);
    await menu.page.getByLabel('メニュー名', { exact: true }).fill(correctedName);
    const saved = menu.page.waitForResponse(r => new URL(r.url()).pathname === menu.api && r.request().method() === 'PUT');
    await menu.page.getByRole('button', { name: '保存する', exact: true }).click();
    expect((await saved).status()).toBe(200); await publish(menu);
    await page.bringToFront();
    const snapshot = page.waitForResponse(r => {
        const url = new URL(r.url());
        return url.pathname === '/api/public-snapshot' && url.searchParams.get('menuId') === menu.id;
    });
    // Returning one entry at a time could remount the public listener before
    // reaching the menu and conceal the missing cross-layout popstate handler.
    await page.evaluate(() => history.go(-2));
    await expect(page).toHaveURL(new URL(publicURL(menu), baseURL).href);
    const response = await snapshot; expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.targetKey).toBe(publicURL(menu));
    expect(result.result.kind).toBe('menu'); expect(result.result.data.menuName).toBe(correctedName);
    await ready(page);
    await expect(page.getByRole('heading', { name: correctedName, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: menu.name, exact: true })).toHaveCount(0);
    const observation = await page.evaluate(token => ({ sameDocument: window.__freshnessOutsideLayout?.token === token,
        popstates: window.__freshnessOutsideLayout?.popstates ?? 0 }), menu.id);
    expect(observation.sameDocument).toBe(true); expect(observation.popstates).toBe(1);
    console.info('[cross-layout-spa-history-observation]', JSON.stringify(observation));
});

test('鮮度: native BFCache復元を試み、persisted=trueの場合だけ復帰動作を実証する', async ({ createMenu, page }, testInfo) => {
    const menu = await createMenu(); await publish(menu);
    await page.addInitScript(() => window.addEventListener('pageshow', event => {
        sessionStorage.setItem('freshness-pageshow', JSON.stringify({ persisted: event.persisted, path: location.pathname }));
    }));
    await page.goto(publicURL(menu)); await ready(page); await page.goto('/terms'); await stop(menu); await page.goBack();
    await expect(page).toHaveURL(new RegExp(publicURL(menu) + '$'));
    const observation = await page.evaluate(() => ({ pageshow: JSON.parse(sessionStorage.getItem('freshness-pageshow') || 'null'),
        notRestoredReasons: performance.getEntriesByType('navigation').at(-1)?.notRestoredReasons?.toJSON?.() ?? null }));
    console.info('[native-bfcache-observation]', JSON.stringify(observation));
    test.skip(observation.pageshow?.persisted !== true, 'Native BFCache was not used; synthetic pageshow test is separate and is not native proof. See observation log.');
    await expect(page.getByRole('heading', { name: 'この公開情報は現在表示できません', exact: true })).toBeVisible();
    await expect(page.getByText(menu.ingredients, { exact: true })).toHaveCount(0); await ready(page);
    await shot(page, testInfo, 'native-bfcache-withdrawn');
});
