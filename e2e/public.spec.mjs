import { test, expect } from './playwright.mjs';
import { preferenceItem } from '../scripts/allergen-preference-browser-helpers.mjs';

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

for (const [width, height] of [[390, 844], [1440, 900]]) {
    test(`公開: ${width}pxのアレルゲン検索・一括設定・適用・全解除`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height });
        await openShop(page);
        const panel = visible(page.getByRole('region', { name: 'あなた向けのアレルゲン設定', exact: true }));
        const trigger = panel.getByRole('button', { name: /あなた向けのアレルゲン設定/ });
        const open = async () => { if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click(); };
        const search = panel.getByRole('searchbox', { name: 'アレルゲンを探す', exact: true });
        const action = name => panel.getByRole('button', { name, exact: true });
        const apply = action('変更を適用');
        const summary = panel.getByRole('group', { name: '編集中の表示設定', exact: true });
        const choices = panel.locator('[data-preference-mode]');
        const list = panel.locator('[data-allergen-preference-list]');
        const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('clearallergy:user-allergens')));
        const cards = page.locator('#public-menus').getByRole('link');
        const tabTo = async (target, key = 'Tab') => {
            for (let i = 0; i < 12; i++) {
                if (await target.evaluate(element => element === document.activeElement)) break;
                await page.keyboard.press(key);
            }
            await expect(target).toBeFocused();
            await expect.poll(() => target.evaluate(element => {
                const box = element.getBoundingClientRect();
                return element.matches(':focus-visible') && element.contains(document.elementFromPoint(
                    box.x + box.width / 2, box.y + box.height / 2,
                ));
            })).toBe(true);
        };
        await expect(cards.first()).toBeVisible();
        const cardCount = await cards.count();
        await open();
        await expect(choices).toHaveCount(29);
        for (const [term, name] of [['らっかせい', '落花生（ピーナッツ）'], ['ﾋﾟｰﾅｯﾂ', '落花生（ピーナッツ）']]) {
            await search.fill(term);
            await expect(choices).toHaveCount(1);
            await expect(preferenceItem(panel, name)).toBeVisible();
        }
        await search.fill('こむぎ');
        const wheat = preferenceItem(panel, '小麦');
        await tabTo(wheat);
        await page.keyboard.press('Space');
        await tabTo(search, 'Shift+Tab');
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.insertText('ぎゅうにゅう');
        await tabTo(preferenceItem(panel, '乳'));
        await page.keyboard.press('Space');
        await expect(action('小麦を選択から外す')).toBeVisible();
        await expect(apply).toBeDisabled();
        await tabTo(action('注目にする'), 'Shift+Tab');
        await page.keyboard.press('Enter');
        await search.fill('たまご');
        await preferenceItem(panel, '卵').click();
        await search.fill('エビ');
        await preferenceItem(panel, 'えび').click();
        await search.fill('');
        await action('一覧から除外').click();
        await expect(summary).toContainText('注目：小麦・乳');
        await expect(summary).toContainText('除外：えび・卵');
        expect(await saved()).toBeNull();
        await expect(cards).toHaveCount(cardCount);
        await expect(apply).toBeFocused();
        await expect(apply).toBeInViewport();
        await expect.poll(() => apply.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
        })).toBe(true);
        const [actionsBox, listBox] = await Promise.all([panel.locator('[data-allergen-preference-actions]').boundingBox(), list.boundingBox()]);
        if (width < 500) expect(actionsBox.y).toBeLessThan(listBox.y);
        else expect(actionsBox.x).toBeGreaterThanOrEqual(listBox.x + listBox.width);
        await page.screenshot({ path: testInfo.outputPath('before-apply.png') });
        if (width === 1440) await apply.press('Enter');
        else await apply.click();
        await expect.poll(saved).toMatchObject({ highlightSlugs: ['wheat', 'milk'], excludedSlugs: ['shrimp', 'egg'], includeMayContain: false });
        await expect.poll(() => cards.count()).toBeLessThan(cardCount);

        await page.reload();
        await open();
        await expect(preferenceItem(panel, '乳')).toHaveAttribute('data-preference-mode', 'highlight');
        await expect(preferenceItem(panel, '卵')).toHaveAttribute('data-preference-mode', 'exclude');
        await preferenceItem(panel, '卵').click();
        await preferenceItem(panel, 'えび').click();
        await action('設定を外す').click();
        await expect(summary).toContainText('除外：なし');
        await expect(summary).toContainText('注目：小麦・乳');
        await action('元に戻す').click();
        await expect(summary).toContainText('除外：えび・卵');
        await action('すべて外す').click();
        await expect(summary).toContainText('注目：なし');
        await expect(summary).toContainText('除外：なし');
        expect((await saved()).excludedSlugs).toEqual(['shrimp', 'egg']);
        await action('元に戻す').click();
        await expect(summary).toContainText('除外：えび・卵');
        await action('すべて外す').click();
        await expect(apply).toBeFocused();
        await expect(apply).toBeInViewport();
        await apply.click();
        await expect.poll(saved).toMatchObject({ highlightSlugs: [], excludedSlugs: [], includeMayContain: false });
        await expect(cards).toHaveCount(cardCount);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);

        if (width === 1440) {
            await cards.first().click();
            await expect(page).toHaveURL(/\/menus\//);
            await open();
            const [detailActions, detailList] = await Promise.all([panel.locator('[data-allergen-preference-actions]').boundingBox(), list.boundingBox()]);
            expect(detailActions.x).toBeGreaterThanOrEqual(detailList.x + detailList.width);
            await search.fill('たまご');
            await preferenceItem(panel, '卵').click();
            await page.setViewportSize({ width: 390, height: 844 });
            await expect(search).toHaveValue('たまご');
            await expect(preferenceItem(panel, '卵')).toHaveAttribute('aria-pressed', 'true');
        }
    });
}

test('公開: 未認証の管理APIは401', async ({ request }) => {
    expect((await request.get('/api/admin/menus', { maxRedirects: 0 })).status()).toBe(401);
});

test('公開: 一覧の写真と登録を一括で再取得し、遅延応答を採用しない', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openShop(page);
    const card = page.locator('#public-menus').getByRole('link').first();
    const [, shopId, menuId] = (await card.getAttribute('href')).match(/^\/shops\/([^/]+)\/menus\/([^/]+)$/);
    const controls = page.getByRole('complementary', { name: '公開情報の再取得', exact: true });
    const surface = page.locator('[data-public-freshness]');
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
    await expect(surface).toHaveAttribute('data-public-freshness', 'ready');
    await expect(controls).toHaveCount(0);
    await page.evaluate(() => { window.thumbnailFixturePage = true; });
    async function requestRefresh(name, { retry = false } = {}) {
        file = name;
        if (retry) await controls.getByRole('button', { name: '公開情報を再取得', exact: true }).click();
        else await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await expect.poll(() => seen.includes(name)).toBe(true);
    }
    try {
        await requestRefresh('first.jpg');
        await card.scrollIntoViewIfNeeded();
        await expect(image).toHaveAttribute('src', /first\.jpg/);
        await expect(image).toHaveCSS('object-position', '33% 50%');
        await requestRefresh('delayed.jpg');
        await expect(surface).toHaveAttribute('data-public-freshness', 'loading');
        await expect(controls.getByText(/表示する登録内容は以前取得した情報です。/)).toBeVisible();
        await expect(image).toHaveCount(0);
        const aborted = page.waitForEvent('requestfailed', request => new URL(request.url()).pathname === '/api/public-snapshot');
        await controls.getByRole('button', { name: '取得を中止', exact: true }).click();
        await aborted;
        await expect(image).toHaveCount(0);
        await requestRefresh('latest.jpg', { retry: true });
        await card.scrollIntoViewIfNeeded();
        await expect(image).toHaveAttribute('src', /latest\.jpg/);
        release();
        await requestRefresh('removed');
        await expect(surface).toHaveAttribute('data-public-freshness', 'ready');
        await expect(controls).toHaveCount(0);
        await expect(image).toHaveCount(0);
        await expect(card.getByRole('group', { name: '店舗が登録したアレルゲン', exact: true }).first()).toBeVisible();
        expect(menuRequests).toBe(0);
        expect(await page.evaluate(() => window.thumbnailFixturePage)).toBe(true);
    } finally {
        release();
    }
});
