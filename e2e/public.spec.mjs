import { test, expect } from './playwright.mjs';

const visible = locator => locator.filter({ visible: true });
test.beforeEach(async ({ context, baseURL }) => {
    // The existing public regression also excludes unrelated Clerk/analytics requests.
    await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
});
async function openShop(page) {
    await page.goto('/shops');
    await expect(page.getByRole('heading', { name: '条件に一致するClearAllergy登録済み店舗', exact: true })).toBeVisible();
    const shopId = process.env.E2E_PUBLIC_SHOP_ID;
    if (shopId && !/^c[a-z0-9]{24}$/.test(shopId)) throw Error('Invalid fictional public shop fixture.');
    await (shopId ? page.locator(`#shop-${shopId}`) : page.locator('a[id^="shop-"]').first()).click();
    await expect(visible(page.getByRole('searchbox', { name: 'この店舗のメニューを検索', exact: true }))).toBeVisible();
}

test('公開: 店舗からメニュー詳細へキーボードで移動できる', async ({ page }) => {
    await openShop(page);
    const menu = page.locator('#public-menus').getByRole('link').first();
    const href = await menu.getAttribute('href');
    expect(href).toMatch(/^\/shops\/[^/]+\/menus\/[^/]+$/);
    await menu.focus();
    await menu.press('Enter');
    await expect(page).toHaveURL(new RegExp(href + '$'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: /^アレルゲン（[1-9][0-9]*品目）$/ })).toBeVisible();
    await expect(page.getByText('店舗が登録した内容', { exact: true })).toBeVisible();
});

test('公開: モバイルの検索0件から解除して一覧へ戻れる', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openShop(page);
    const search = visible(page.getByRole('searchbox', { name: 'この店舗のメニューを検索', exact: true }));
    await search.fill('E2E_NO_MATCH_7f846f67');
    await search.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: '検索条件に一致する公開メニューがありません。' })).toBeVisible();
    await page.getByRole('button', { name: 'メニュー検索を解除', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(page.locator('#public-menus').getByRole('link').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('公開: アレルゲン設定を適用して再読み込みしても保持する', async ({ page }) => {
    await openShop(page);
    const panel = visible(page.getByRole('button', { name: /あなた向けのアレルゲン設定/ }));
    if (await panel.getAttribute('aria-expanded') !== 'true') await panel.click();
    await visible(page.getByRole('combobox', { name: '卵の表示設定', exact: true })).selectOption('highlight');
    await visible(page.getByRole('button', { name: '変更を適用', exact: true })).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('clearallergy:user-allergens')).highlightSlugs)).toEqual(['egg']);
    await page.reload();
    if (await panel.getAttribute('aria-expanded') !== 'true') await panel.click();
    await expect(visible(page.getByRole('combobox', { name: '卵の表示設定', exact: true }))).toHaveValue('highlight');
});

test('公開: 未認証の管理APIは401', async ({ request }) => {
    expect((await request.get('/api/admin/menus', { maxRedirects: 0 })).status()).toBe(401);
});

test('公開: 一覧の写真と登録を一括で再取得し、遅延応答を採用しない', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openShop(page);
    const card = page.locator('#public-menus').getByRole('link').first();
    const [, shopId, menuId] = (await card.getAttribute('href')).match(/^\/shops\/([^/]+)\/menus\/([^/]+)$/);
    const controls = page.getByRole('complementary', { name: '公開情報の再取得', exact: true });
    const image = card.locator('img');
    const snapshotRoute = '**/api/public-snapshot?**';
    let file = 'first.jpg';
    let release;
    const hold = new Promise(resolve => { release = resolve; });
    const seen = [];
    let menuRequests = 0;
    page.on('request', request => {
        if (new URL(request.url()).pathname.startsWith('/api/menus/')) menuRequests++;
    });
    await page.route('**/_next/image?**', route => route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12"><rect width="16" height="12" fill="orange"/></svg>',
    }));
    await page.route(snapshotRoute, async route => {
        const requested = file;
        const response = await route.fetch();
        expect(response.headers()['content-type']).toMatch(/^application\/vnd\.clearallergy\.shop-view\+json/);
        const data = await response.json();
        const menu = data.result.data.menusForClient.find(item => item.id === menuId);
        seen.push(requested);
        if (requested === 'delayed.jpg') await hold;
        const safeImageUrl = `https://fixture.public.blob.vercel-storage.com/menu-images/${shopId}/${requested}`;
        data.menuImages = requested === 'removed' ? {} : { [menuId]: {
            updatedAt: menu.updatedAt, safeImageUrl, imageFrame: 'wide', imageFit: 'contain',
            imageZoom: 100, imagePositionX: 33, imagePositionY: 50,
        } };
        try {
            await route.fulfill({ status: response.status(), contentType: response.headers()['content-type'], json: data });
        } catch (error) {
            if (requested !== 'delayed.jpg') throw error;
        }
    });
    await expect(controls).toHaveAttribute('data-public-freshness', 'ready');
    await page.evaluate(() => { window.thumbnailFixturePage = true; });
    async function requestRefresh(name) {
        file = name;
        await controls.getByRole('button', { name: '公開情報を再取得', exact: true }).click();
        await expect.poll(() => seen.includes(name)).toBe(true);
    }
    try {
        await requestRefresh('first.jpg');
        await card.scrollIntoViewIfNeeded();
        await expect(image).toHaveAttribute('src', /first\.jpg/);
        await expect(image).toHaveCSS('object-position', '33% 50%');
        await requestRefresh('delayed.jpg');
        await expect(controls).toHaveAttribute('data-public-freshness', 'loading');
        await expect(image).toHaveCount(0);
        const aborted = page.waitForEvent('requestfailed', request => new URL(request.url()).pathname === '/api/public-snapshot');
        await controls.getByRole('button', { name: '取得を中止', exact: true }).click();
        await aborted;
        await expect(image).toHaveCount(0);
        await requestRefresh('latest.jpg');
        await card.scrollIntoViewIfNeeded();
        await expect(image).toHaveAttribute('src', /latest\.jpg/);
        release();
        await requestRefresh('removed');
        await expect(controls).toHaveAttribute('data-public-freshness', 'ready');
        await expect(image).toHaveCount(0);
        await expect(card.getByRole('group', { name: '店舗が登録したアレルゲン', exact: true }).first()).toBeVisible();
        expect(menuRequests).toBe(0);
        expect(await page.evaluate(() => window.thumbnailFixturePage)).toBe(true);
    } finally {
        release();
    }
});
