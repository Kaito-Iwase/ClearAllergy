import { test, expect, publish, readMenu } from './admin-fixtures.mjs';

test.beforeEach(async ({ context, baseURL }) => {
    await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
});
const controls = page => page.getByRole('complementary', { name: '公開情報の再取得', exact: true });
const publicURL = menu => `/shops/${menu.shopId}/menus/${menu.id}`;
async function ready(page) { await expect(controls(page)).toHaveAttribute('data-public-freshness', 'ready'); await expect(controls(page)).toHaveAttribute('data-previous-information', 'false'); }
async function refresh(page) {
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/public-snapshot');
    await controls(page).getByRole('button', { name: '公開情報を再取得', exact: true }).click();
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

test('鮮度: 三画面を手動で完全再取得し検索入力を保持する', async ({ createMenu, page }) => {
    const menu = await createMenu(); await publish(menu);
    for (const [url, kind] of [['/shops', 'list'], [`/shops/${menu.shopId}`, 'shop'], [publicURL(menu), 'menu']]) {
        await page.goto(url); await ready(page);
        const result = await refresh(page); expect(result.status()).toBe(200);
        const body = await result.json(); expect(body.result.kind).toBe(kind); expect(body.targetKey).toBe(url);
        expect(JSON.stringify(body)).not.toContain('publicationConfirmedFoodVersion');
    }
    await page.goto('/shops'); await ready(page);
    const search = page.getByRole('textbox', { name: /キーワード/ }).filter({ visible: true });
    await expect(search).toHaveCount(1); await search.fill('未適用の検索入力'); await refresh(page); await expect(search).toHaveValue('未適用の検索入力');
});

test('鮮度: 取得中/失敗の旧FREE要約を抑え、注意保持と遮蔽を比較して回復する', async ({ createMenu, page }, testInfo) => {
    const menu = await createMenu(); await statuses(menu); await page.goto(publicURL(menu)); await ready(page);
    const allergenCount = (await readMenu(menu)).allergens.length;
    const panel = page.getByRole('button', { name: /あなた向けのアレルゲン設定/ }).filter({ visible: true });
    if (await panel.getAttribute('aria-expanded') !== 'true') await panel.click();
    await page.getByRole('combobox', { name: '乳の表示設定', exact: true }).filter({ visible: true }).selectOption('highlight');
    await page.getByRole('button', { name: '変更を適用', exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole('heading', { name: '原材料に含まない', exact: true })).toBeVisible();
    await shot(page, testInfo, 'normal');
    let release; const held = new Promise(resolve => { release = resolve; });
    const handler = async route => { await held; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'explicit fictional failure' }) }); };
    await page.route('**/api/public-snapshot?**', handler);
    try {
        await controls(page).getByRole('button', { name: '公開情報を再取得', exact: true }).click();
        await expect(controls(page)).toHaveAttribute('data-public-freshness', 'loading');
        await expect(page.getByRole('heading', { name: '原材料に含まない', exact: true })).toHaveCount(0);
        await expect(page.getByText('未再確認のため、条件に合うかの要約は表示していません。詳細の登録状態も以前取得した情報です。', { exact: true })).toBeVisible();
        const old = page.getByRole('region', { name: '以前取得した公開情報', exact: true });
        await expect(old.getByText('含む', { exact: true })).toBeVisible();
        await expect(old.getByText('含む可能性あり・要確認', { exact: true })).toBeVisible();
        await expect(old.getByText('以前取得した登録・現在は未再確認', { exact: true })).toHaveCount(allergenCount);
        await shot(page, testInfo, 'loading'); release();
        await expect(controls(page)).toHaveAttribute('data-public-freshness', 'error');
        await expect(page.getByText(menu.ingredients, { exact: true })).toBeVisible();
        await page.setViewportSize({ width: 390, height: 844 }); await shot(page, testInfo, 'failure-mobile');
        await controls(page).locator('summary').click();
        await controls(page).getByRole('radio', { name: /旧情報を隠す/ }).check();
        await expect(page.getByText(menu.ingredients, { exact: true })).not.toBeVisible();
        await expect(page.getByText('未再確認の旧情報を隠しています。既知の含有・混入注意も表示されていません。', { exact: true })).toBeVisible();
        await shot(page, testInfo, 'hide-mobile');
        await controls(page).getByRole('radio', { name: /注意情報を残し/ }).check();
        await expect(page.getByText(menu.ingredients, { exact: true })).toBeVisible();
    } finally { release(); await page.unroute('**/api/public-snapshot?**', handler); }
    await refresh(page);
    await expect(page.getByRole('heading', { name: '原材料に含まない', exact: true })).toBeVisible();
    await controls(page).getByRole('radio', { name: /旧情報を隠す/ }).check();
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
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await expect(controls(page).getByRole('heading', { name: '公開情報の取得状態', exact: true })).toBeFocused();
        await expect(page.getByText(menu.ingredients, { exact: true })).not.toBeVisible();
        cancelled = true; await controls(page).getByRole('button', { name: '取得を中止', exact: true }).click();
        await expect(controls(page)).toHaveAttribute('data-public-freshness', 'error');
        await expect(controls(page).getByText('再取得を中止しました。', { exact: true })).toBeVisible();
    } finally { releaseFocus(); await page.unroute('**/api/public-snapshot?**', focusHandler); }
    await refresh(page);
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
