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
