import { test, expect, publish, readMenu } from './admin-fixtures.mjs';

test.beforeEach(async ({ context, baseURL }) => {
    // This context is anonymous; signed-in actors use their own contexts.
    await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
});

test('店舗: 情報を保存して再読み込みできる', async ({ actors }, testInfo) => {
    const { page } = actors.a;
    await page.goto('/admin/shop');
    const description = page.getByLabel('お店の説明', { exact: true });
    const original = await description.inputValue();
    const marker = `架空E2E店舗説明 ${testInfo.testId}`;
    try {
        await description.fill(marker);
        const saved = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/shop' && r.request().method() === 'PUT');
        await page.getByRole('button', { name: '保存する', exact: true }).click();
        expect((await saved).status()).toBe(200);
        await page.reload();
        await expect(description).toHaveValue(marker);
    } finally {
        await page.reload();
        // Do not overwrite an intervening change by another operator.
        expect(await description.inputValue(), 'shop fixture changed outside this test; restore manually').toBe(marker);
        await description.fill(original);
        const restored = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/shop' && r.request().method() === 'PUT');
        await page.getByRole('button', { name: '保存する', exact: true }).click();
        expect((await restored).status()).toBe(200);
    }
});

test('メニュー: 非公開保存と別操作の公開、他店舗の権限拒否', async ({ actors, createMenu, request, page }) => {
    const menu = await createMenu('a');
    expect((await request.get(menu.publicAPI, { maxRedirects: 0 })).status()).toBe(404);
    await publish(menu);
    await menu.page.goto(menu.editURL);
    await expect(menu.page.getByLabel('メニュー名', { exact: true })).toHaveValue(menu.name);
    expect((await request.get(menu.publicAPI, { maxRedirects: 0 })).status()).toBe(200);
    await page.goto(`/shops/${menu.shopId}/menus/${menu.id}`);
    await expect(page.getByRole('heading', { name: menu.name, exact: true })).toBeVisible();
    const current = await readMenu(menu);
    for (const method of ['get', 'put', 'delete']) {
        const response = await actors.b.context.request[method](menu.api, {
            maxRedirects: 0,
            headers: { Origin: new URL(menu.page.url()).origin },
            ...(method === 'get' ? {} : { data: { expectedVersion: current.version, name: 'unauthorized' } }),
        });
        expect(response.status(), `other shop ${method}`).toBe(404);
    }
    const stop = await actors.b.context.request.post(menu.api + '/stop', { maxRedirects: 0, headers: { Origin: new URL(menu.page.url()).origin } });
    expect(stop.status()).toBe(404);
    const other = await actors.b.context.newPage();
    try {
        await other.goto(menu.editURL);
        await expect(other.getByRole('heading', { name: 'ページが見つかりません', exact: true })).toBeVisible();
    } finally { await other.close(); }
    expect(await readMenu(menu)).toEqual(current);
});

test('メニュー: 模擬500の保存失敗でも入力を保持する', async ({ createMenu }) => {
    const menu = await createMenu();
    await menu.page.goto(menu.editURL);
    const before = await readMenu(menu);
    const description = menu.page.getByLabel('説明', { exact: true });
    await description.fill('失敗後も保持する架空E2E入力');
    const handler = route => route.request().method() === 'PUT'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'E2E simulated save failure' }) }) : route.continue();
    const routeURL = new URL(menu.api, menu.page.url()).href;
    await menu.page.route(routeURL, handler);
    try {
        await menu.page.getByRole('button', { name: '保存する', exact: true }).click();
        await expect(menu.page.getByRole('alert').filter({ hasText: 'E2E simulated save failure' })).toBeVisible();
        await expect(description).toHaveValue('失敗後も保持する架空E2E入力');
    } finally { await menu.page.unroute(routeURL, handler); }
    expect(await readMenu(menu)).toEqual(before);
});

const representativeAllergens = [
    { slug: 'egg', name: '卵', status: 'CONTAINS', input: '含む', label: '含む' },
    { slug: 'wheat', name: '小麦', status: 'MAY_CONTAIN', input: '含む可能性あり・要確認', label: '含む可能性あり・要確認' },
    { slug: 'milk', name: '乳', status: 'FREE', input: '原材料に含まない登録', label: '原材料に含まない' },
];

async function saveEditedMenu(menu) {
    const saved = menu.page.waitForResponse(r => new URL(r.url()).pathname === menu.api && r.request().method() === 'PUT');
    await menu.page.getByRole('button', { name: '保存する', exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON().publicationAction).toBeUndefined();
    await expect(menu.page.getByRole('region', { name: '保存しました', exact: true })).toBeVisible();
    return readMenu(menu);
}

async function expectWithdrawn(menu, request, page) {
    expect((await request.get(menu.publicAPI, { maxRedirects: 0 })).status()).toBe(404);
    await page.goto(`/shops/${menu.shopId}/menus/${menu.id}`);
    // A fresh navigation can be streamed HTML200; inspect the semantic result.
    await expect(page.getByRole('heading', { name: 'ページが見つかりません', exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(menu.name);
    await expect(page.locator('body')).not.toContainText(menu.ingredients);
}

test('食品訂正: 非公開保存→保存済み内容の確認→別操作の再公開が公開表示につながる', async ({ createMenu, request, page }, testInfo) => {
    const menu = await createMenu();
    await publish(menu);
    const before = await readMenu(menu);
    expect(before.isPublished).toBe(true);
    expect(before.publicationConfirmedFoodVersion).toBe(before.foodVersion);
    const publicURL = `/shops/${menu.shopId}/menus/${menu.id}`;
    await page.goto(publicURL);
    await expect(page.getByText(menu.ingredients, { exact: true })).toBeVisible();

    await menu.page.goto(menu.editURL);
    const correctedIngredients = `${menu.ingredients} 訂正後の架空原材料`;
    await menu.page.getByLabel(/原材料名/).fill(correctedIngredients);
    for (const item of representativeAllergens) {
        const button = menu.page.getByRole('group', { name: item.name, exact: true }).getByRole('button', { name: item.input, exact: true });
        await button.click();
        await expect(button).toHaveAttribute('aria-pressed', 'true');
    }
    const saved = await saveEditedMenu(menu);
    expect(saved.ingredients).toBe(correctedIngredients);
    expect(saved.version).toBeGreaterThan(before.version);
    expect(saved.foodVersion).toBeGreaterThan(before.foodVersion);
    expect(saved.publicationConfirmedFoodVersion).toBeNull();
    expect(saved.isPublished).toBe(false);
    expect(saved.foodReviews).toEqual(before.foodReviews);
    for (const item of representativeAllergens) {
        expect(saved.allergens.find(row => row.slug === item.slug)?.status, `owner DB read ${item.slug}`).toBe(item.status);
    }
    // Observation only: a held page is not a fresh read. Do not make stale DOM
    // retention an acceptance condition or claim background/resume coverage.
    const heldPageObservation = { trigger: 'food-save-committed', navigationSinceSave: false,
        previousIngredientsVisible: await page.getByText(menu.ingredients, { exact: true }).isVisible(),
        automaticRefreshGuaranteed: false };
    // The default list reporter does not persist in-memory attachments. Keep
    // this non-sensitive boolean observation in the retained console log too.
    console.info('[held-page-observation]', JSON.stringify(heldPageObservation));
    await testInfo.attach('held-page-observation.json', {
        contentType: 'application/json', body: JSON.stringify(heldPageObservation),
    });
    await expectWithdrawn(menu, request, page);
    await expect(page.locator('body')).not.toContainText(correctedIngredients);

    const panel = menu.page.getByRole('region', { name: '保存しました', exact: true });
    await expect(panel.getByText('現在は非公開です。', { exact: true })).toBeVisible();
    await panel.locator('summary').click();
    await expect(panel.getByText(correctedIngredients, { exact: true })).toBeVisible();
    for (const item of representativeAllergens) {
        await expect(panel.getByRole('listitem').filter({ hasText: `${item.name}：` })).toHaveText(`${item.name}：${item.status === 'FREE' ? item.input : item.label}`);
    }
    await publish(menu, saved.version);
    const published = await readMenu(menu);
    expect(published.isPublished).toBe(true);
    expect(published.foodVersion).toBe(saved.foodVersion);
    expect(published.publicationConfirmedFoodVersion).toBe(saved.foodVersion);
    expect(published.ingredients).toBe(correctedIngredients);
    expect(published.allergens).toEqual(saved.allergens);
    expect(published.foodReviews).toEqual(before.foodReviews);

    const response = await request.get(menu.publicAPI, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const publicMenu = (await response.json()).menu;
    expect(publicMenu.ingredients).toBe(correctedIngredients);
    for (const item of representativeAllergens) {
        expect(publicMenu.allergens.find(row => row.slug === item.slug)?.status, `public API ${item.slug}`).toBe(item.status);
        expect(publicMenu.allergenDisplayItems.find(row => row.slug === item.slug)?.status).toBe(item.status);
    }
    await page.goto(publicURL);
    await expect(page.getByText(correctedIngredients, { exact: true })).toBeVisible();
    await expect(page.getByText(menu.ingredients, { exact: true })).toHaveCount(0);
    for (const item of representativeAllergens) {
        // Check the label in the very same item row, not anywhere on the page.
        const row = page.locator('div').filter({ has: page.locator(':scope > span').filter({ hasText: new RegExp(`^${item.name}$`) }) });
        await expect(row).toHaveCount(1);
        await expect(row.getByText(item.label, { exact: true })).toBeVisible();
        await expect(row.getByText('未入力・未確認', { exact: true })).toHaveCount(0);
    }
});

test('UNKNOWN: 公開中から未設定を保存すると非公開となり最新版の公開要求も拒否する', async ({ createMenu, request, page }) => {
    const menu = await createMenu();
    await publish(menu);
    const before = await readMenu(menu);
    expect(before.isPublished).toBe(true);
    expect((await request.get(menu.publicAPI, { maxRedirects: 0 })).status()).toBe(200);
    await menu.page.goto(menu.editURL);
    await menu.page.getByRole('group', { name: '卵', exact: true }).getByRole('button', { name: '未設定', exact: true }).click();
    const saved = await saveEditedMenu(menu);
    expect(saved.allergens.find(row => row.slug === 'egg')?.status).toBe('UNKNOWN');
    expect(saved.foodVersion).toBeGreaterThan(before.foodVersion);
    expect(saved.publicationConfirmedFoodVersion).toBeNull();
    expect(saved.isPublished).toBe(false);
    const panel = menu.page.getByRole('region', { name: '保存しました', exact: true });
    const blocked = panel.getByRole('status').filter({ hasText: '未設定が1品目あるため公開できません。' });
    await expect(blocked).toBeVisible();
    await expect(blocked.getByText('卵', { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'この内容で公開', exact: true })).toHaveCount(0);
    const refused = await menu.context.request.put(menu.api, { maxRedirects: 0,
        headers: { Origin: new URL(menu.page.url()).origin },
        data: { expectedVersion: saved.version, publicationAction: 'publish' },
    });
    expect(refused.status()).toBe(400);
    expect(await readMenu(menu)).toEqual(saved);
    await expectWithdrawn(menu, request, page);
});

for (const role of ['a', 'b']) {
    test(`店舗${role.toUpperCase()}: 古い編集PUTは409、同じ古い画面の公開停止は200`, async ({ createMenu, request, page }) => {
        const menu = await createMenu(role);
        await publish(menu);
        await menu.page.goto(menu.editURL); // keep this editor stale
        await expect(menu.page.getByLabel('メニュー名', { exact: true })).toHaveValue(menu.name);
        const original = await readMenu(menu);
        const publicURL = `/shops/${menu.shopId}/menus/${menu.id}`;
        await page.goto(publicURL);
        await expect(page.getByRole('heading', { name: menu.name, exact: true })).toBeVisible();
        await expect(page.getByText(menu.ingredients, { exact: true })).toBeVisible();
        const winner = await menu.context.newPage();
        try {
            await winner.goto(menu.editURL);
            // A price change advances version without changing food or unpublishing.
            await winner.getByLabel('価格（税込・円）', { exact: true }).fill('1234');
            const saved = winner.waitForResponse(r => new URL(r.url()).pathname === menu.api && r.request().method() === 'PUT');
            await winner.getByRole('button', { name: '保存する', exact: true }).click();
            expect((await saved).status()).toBe(200);
            const fresh = await readMenu(menu);
            expect(fresh.isPublished).toBe(true);
            expect(fresh.version).toBeGreaterThan(original.version);
            expect(fresh.priceYen).toBe(1234);
            await menu.page.getByLabel('メニュー名', { exact: true }).fill('保存されない古い入力');
            const stale = menu.page.waitForResponse(r => new URL(r.url()).pathname === menu.api && r.request().method() === 'PUT');
            await menu.page.getByRole('button', { name: '保存する', exact: true }).click();
            const rejected = await stale;
            expect(rejected.status()).toBe(409);
            expect(rejected.request().postDataJSON().expectedVersion).toBe(original.version);
            await expect(menu.page.getByLabel('メニュー名', { exact: true })).toHaveValue('保存されない古い入力');
            expect(await readMenu(menu)).toEqual(fresh);
            menu.page.once('dialog', dialog => dialog.accept());
            const stopped = menu.page.waitForResponse(r => new URL(r.url()).pathname === menu.api + '/stop' && r.request().method() === 'POST');
            await menu.page.getByRole('button', { name: '公開を停止する', exact: true }).click();
            const response = await stopped;
            expect(response.status()).toBe(200);
            expect(response.request().postData()).toBeNull();
            expect((await response.json()).menu.isPublished).toBe(false);
            const after = await readMenu(menu);
            expect(fresh.allergens).toBeDefined();
            expect(fresh.allergens.length).toBeGreaterThan(0);
            expect(fresh.foodReviews).toEqual(expect.any(Array));
            expect(fresh.foodVersion).toEqual(expect.any(Number));
            expect(fresh.publicationConfirmedFoodVersion).toBe(fresh.foodVersion);
            expect(Object.hasOwn(fresh, 'reviewedFoodVersion')).toBe(true);
            for (const key of ['name', 'description', 'ingredients', 'precaution', 'priceYen', 'foodVersion', 'reviewedFoodVersion', 'publicationConfirmedFoodVersion', 'allergens', 'foodReviews']) {
                expect(after[key], `STOP preserves ${key}`).toEqual(fresh[key]);
            }
            expect(after.isPublished).toBe(false);
            expect((await request.get(menu.publicAPI, { maxRedirects: 0 })).status()).toBe(404);
            await page.goto(publicURL);
            // rules.md permits streamed HTML200 with not-found. The public API
            // must still be404, and the published food must disappear from the DOM.
            await expect(page.getByRole('heading', { name: 'ページが見つかりません', exact: true })).toBeVisible();
            await expect(page.locator('body')).not.toContainText(menu.name);
            await expect(page.locator('body')).not.toContainText(menu.ingredients);
        } finally { await winner.close(); }
    });
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`編集画面: hydration前の入力を防ぎ訂正を保存する ${viewport.width}`, async ({ createMenu }) => {
        const menu = await createMenu();
        await menu.page.setViewportSize(viewport);
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        let blockedScripts = 0;
        const holdScripts = async route => {
            if (route.request().resourceType() === 'script') {
                blockedScripts++;
                await gate;
            }
            await route.continue();
        };
        await menu.page.route('**/_next/static/**', holdScripts);
        const ingredients = menu.page.getByLabel(/原材料名/);
        try {
            await menu.page.goto(menu.editURL, { waitUntil: 'commit' });
            await expect(ingredients).toBeVisible();
            await expect.poll(() => blockedScripts).toBeGreaterThan(0);
            await expect(ingredients).toBeDisabled();
            await expect(menu.page.getByRole('button', { name: '保存する', exact: true })).toBeDisabled();
        } finally {
            release();
            await menu.page.unrouteAll({ behavior: 'wait' });
        }
        await expect(ingredients).toBeEnabled();
        const wanted = `訂正後の架空原材料 ${viewport.width}`;
        await ingredients.fill(wanted);
        await expect(ingredients).toHaveValue(wanted);
        const saved = menu.page.waitForResponse(r => new URL(r.url()).pathname === menu.api && r.request().method() === 'PUT');
        await menu.page.getByRole('button', { name: '保存する', exact: true }).click();
        const response = await saved;
        expect(response.status()).toBe(200);
        expect(response.request().postDataJSON().ingredients).toBe(wanted);
        await expect(menu.page.getByRole('region', { name: '保存しました', exact: true })).toBeVisible();
        expect((await readMenu(menu)).ingredients).toBe(wanted);
    });
}

test('管理: 自店舗のカテゴリだけを候補に出し、選択・空欄保存と食品版を検証する', async ({ createMenu }) => {
    const category = page => page.getByRole('combobox', { name: 'カテゴリ', exact: true });
    const fillCategory = value => page => category(page).fill(value);
    const draft = await createMenu('a', fillCategory('ドリンク'));
    await draft.page.getByRole('button', { name: '公開の確認を閉じる', exact: true }).click();
    await expect(draft.page.getByRole('button', { name: '保存する', exact: true })).toBeFocused();
    await category(draft.page).focus();
    await expect(draft.page.getByRole('option', { name: 'ドリンク', exact: true })).toBeVisible();
    const published = await createMenu('a', fillCategory('ランチ'));
    await publish(published);
    await createMenu('b', fillCategory('他店舗限定'));

    const selected = await createMenu('a', async page => {
        const combo = category(page);
        const option = label => page.getByRole('option', { name: label, exact: true });
        await combo.focus();
        await expect(option('ランチ')).toBeVisible();
        await expect(option('ドリンク')).toBeVisible();
        await expect(option('他店舗限定')).toHaveCount(0);
        await combo.fill('ど');
        await expect(option('ドリンク')).toBeVisible();
        await combo.press('ArrowDown');
        await combo.dispatchEvent('compositionstart');
        await combo.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
        await combo.dispatchEvent('compositionend');
        await expect(combo).toHaveValue('ど');
        await combo.press('Escape');
        await expect(combo).toHaveAttribute('aria-expanded', 'false');
        await expect(combo).toHaveValue('ど');
        await expect(combo).toBeFocused();
        await combo.click();
        await expect(option('ドリンク')).toBeVisible();
        await expect(combo).toHaveValue('ど');
        await combo.fill('ﾄﾞ');
        await expect(option('ドリンク')).toBeVisible();
        await combo.press('ArrowDown');
        await expect(option('ドリンク')).toHaveAttribute('aria-selected', 'true');
        await combo.press('Enter');
        await expect(combo).toHaveValue('ドリンク');
        await expect(combo).toHaveAttribute('aria-expanded', 'false');
    });
    expect((await readMenu(selected)).category).toBe('ドリンク');
    expect((await readMenu(published)).category).toBe('ランチ');
    await published.page.goto(published.editURL);
    const combo = category(published.page);
    const before = await readMenu(published);
    await combo.focus();
    await expect(published.page.getByRole('option', { name: 'ランチ', exact: true })).toBeVisible();
    await published.page.getByRole('option', { name: 'ランチ', exact: true }).click();
    await published.page.getByLabel(/価格/).fill('500');
    async function save() {
        const response = published.page.waitForResponse(r => new URL(r.url()).pathname === published.api && r.request().method() === 'PUT');
        await published.page.getByRole('button', { name: '保存する', exact: true }).click();
        expect((await response).status()).toBe(200);
        return readMenu(published);
    }
    const unchanged = await save();
    expect(unchanged).toMatchObject({ category: 'ランチ', isPublished: true, foodVersion: before.foodVersion });
    await combo.fill('');
    await expect(published.page.getByText(/カテゴリを変更して保存すると公開が停止します/)).toBeVisible();
    const cleared = await save();
    expect(cleared).toMatchObject({ category: null, isPublished: false, foodVersion: before.foodVersion + 1 });
});
