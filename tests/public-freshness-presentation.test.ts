import assert from 'node:assert/strict';
import test from 'node:test';
import Module, { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PreviousPublicInformation } from '../features/public/shops/freshness/presentation';
import type { UserAllergenPreferences } from '../lib/public-allergen-preferences';
import type { PublicShopListShop } from '../features/public/shops/components/public-shop-search';

// Exercise the actual presentation components with loaded fictional preferences.
// Only the preference store/editor and Next navigation are boundary doubles;
// filtering, status classification and previous-information context stay real.
let preferences: UserAllergenPreferences = { highlightSlugs: [], excludedSlugs: [], includeMayContain: true, selectedSlugs: [] };
let searchQuery = '';
const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
const requireForTest = createRequire(import.meta.url);
let Cards: typeof import('../features/public/shops/components/SelectedAllergenResultCardsClient').default;
let List: typeof import('../features/public/shops/components/PublicShopListClient').default;
let ShopMenus: typeof import('../features/public/shops/components/ShopMenuListClient').default;
try {
    loader._load = function (id, ...args) {
        if (id.endsWith('/UserAllergenPreferenceClient')) return {
            __esModule: true, default: () => null,
            useUserAllergenPreferences: () => ({ preferences, loaded: true }),
        };
        if (id === 'next/navigation') return {
            useRouter: () => ({ push: () => undefined }),
            useSearchParams: () => new URLSearchParams(searchQuery),
        };
        return originalLoad.call(this, id, ...args);
    };
    Cards = requireForTest('../features/public/shops/components/SelectedAllergenResultCardsClient.tsx').default;
    List = requireForTest('../features/public/shops/components/PublicShopListClient.tsx').default;
    ShopMenus = requireForTest('../features/public/shops/components/ShopMenuListClient.tsx').default;
} finally { loader._load = originalLoad; }

const allergens = [
    { slug: 'egg', nameJa: '卵' }, { slug: 'wheat', nameJa: '小麦' }, { slug: 'milk', nameJa: '乳' },
];
function render(previous: boolean, child: React.ReactNode) {
    return renderToStaticMarkup(React.createElement(PreviousPublicInformation.Provider, { value: previous }, child));
}
function cards(previous: boolean, mixed = true) {
    const selected = mixed ? ['egg', 'wheat', 'milk'] : ['milk'];
    preferences = { highlightSlugs: selected, excludedSlugs: [], includeMayContain: true, selectedSlugs: selected };
    return render(previous, React.createElement(Cards, { allergens,
        statusBySlug: { egg: 'CONTAINS', wheat: 'MAY_CONTAIN', milk: 'FREE' } }));
}
function milkRow(html: string) {
    const rows = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? [];
    const row = rows.find(value => value.includes('乳'));
    assert.ok(row, 'the mixed registration list keeps the milk row');
    return row;
}
function shop(id: string, status: 'FREE' | 'CONTAINS'): PublicShopListShop {
    return { id, name: `架空店舗-${id}`, description: null, address: null, prefecture: null, city: null,
        nearestStation: null, category: null, latitude: null, longitude: null, googlePlaceId: null,
        averageBudgetYen: null, updatedAt: '2026-11-05T00:00:00.000Z',
        menus: [{ priceYen: null, allergenLinks: [{ status, allergen: { slug: 'egg' } }] }], _count: { menus: 1 } };
}
function list(previous: boolean, shops = [shop('free', 'FREE'), shop('contains', 'CONTAINS')], query = '') {
    preferences = { highlightSlugs: [], excludedSlugs: ['egg'], includeMayContain: true, selectedSlugs: [] };
    searchQuery = query;
    return render(previous, React.createElement(List, { initialShops: shops, allergens, isDatabaseAvailable: true }));
}

test('旧snapshotの混在欄はFREEの同じ品目行にも未再確認を付け、含有・混入注意を残す', () => {
    const html = cards(true);
    assert.match(milkRow(html), /原材料に含まない/);
    assert.match(milkRow(html), /以前取得した登録・現在は未再確認/);
    assert.match(html, /含む可能性あり・要確認/);
    assert.match(html, /卵/); assert.match(html, /小麦/);
    assert.doesNotMatch(html, /<h3[^>]*>原材料に含まない<\/h3>/);
});

test('通常の混在欄は原状態を保持し、未再確認の注記を付けない', () => {
    const html = cards(false);
    assert.match(milkRow(html), /原材料に含まない/);
    assert.doesNotMatch(milkRow(html), /現在は未再確認/);
    assert.match(html, /含む可能性あり・要確認/);
});

test('旧snapshotの単独FREEは肯定要約を出さない', () => {
    const html = cards(true, false);
    assert.doesNotMatch(html, /<h3[^>]*>原材料に含まない<\/h3>/);
    assert.match(html, /未再確認のため、条件に合うかの要約は表示していません/);
});

test('旧店舗一覧は除外の計算を保ちながら、条件一致を現在の結果として示さない', () => {
    const html = list(true);
    assert.doesNotMatch(html, /条件に一致するClearAllergy登録済み店舗/);
    assert.match(html, /以前取得した登録情報による店舗一覧/);
    assert.match(html, /表示・非表示の判定は以前取得した登録情報によるものです/);
    assert.match(html, /以前取得した登録情報による表示/);
    assert.doesNotMatch(html, /現在の検索結果/);
    assert.match(html, /架空店舗-free/); assert.doesNotMatch(html, /架空店舗-contains/);
});

test('旧店舗一覧の0件も、現在の条件を再確認した結果と言わない', () => {
    const html = list(true, [shop('contains', 'CONTAINS')]);
    assert.doesNotMatch(html, /完全一致する登録済み店舗はありません/);
    assert.match(html, /以前取得した登録情報では、すべての検索条件に一致する店舗は0件です/);
    assert.match(html, /現在のアレルゲン登録を再確認できていません/);
});

test('完全一致0件でも、旧情報による関連店舗を検索結果全体の0件と言わない', () => {
    const partial = { ...shop('partial', 'FREE'), name: '架空カフェ' };
    const html = list(true, [partial], 'keyword=' + encodeURIComponent('栄 カフェ'));
    assert.match(html, /架空カフェ/);
    assert.match(html, /以前取得した登録情報による関連店舗/);
    assert.match(html, /すべての検索条件に一致する店舗は0件/);
    assert.doesNotMatch(html, /検索結果は0件です/);
});

test('通常の店舗一覧は既存の条件一致・除外結果を維持する', () => {
    const html = list(false);
    assert.match(html, /条件に一致するClearAllergy登録済み店舗/);
    assert.match(html, /架空店舗-free/); assert.doesNotMatch(html, /架空店舗-contains/);
    assert.doesNotMatch(html, /現在のアレルゲン登録を再確認できていません/);
});

function shopMenus(previous: boolean, menus: boolean, excluded = false, query = '') {
    preferences = { highlightSlugs: ['milk'], excludedSlugs: excluded ? ['egg'] : [], includeMayContain: true, selectedSlugs: ['milk'] };
    searchQuery = query;
    return render(previous, React.createElement(ShopMenus, {
        shopId: 'fictional-shop', storeHandledAllergenSlugs: ['egg'],
        allergenMaster: allergens.map((allergen, sortOrder) => ({ ...allergen, sortOrder })),
        menus: menus ? [{ id: 'fictional-menu', name: '架空メニュー', description: null,
            priceYen: 100, category: null, precaution: '架空の既知注意', updatedAt: '2026-11-05T00:00:00.000Z',
            allergenLinks: [{ status: 'CONTAINS', allergen: { slug: 'egg' } }, { status: 'FREE', allergen: { slug: 'milk' } }] }] : [],
    }));
}

test('旧店舗詳細の店舗全体集計にも未再確認を付け、該当なしを以前の登録に限定する', () => {
    const html = shopMenus(true, true);
    const section = html.match(/<section aria-label="店舗全体の登録情報"[\s\S]*?<\/section>/)?.[0];
    assert.ok(section);
    assert.match(section, /以前取得した登録・現在は未再確認/);
    assert.match(section, /以前取得した登録での、あなたの確認対象/);
    assert.match(section, /該当なし/);
    assert.match(section, /卵/);
    assert.doesNotMatch(section, /このうち、あなたの確認対象/);
    assert.match(html, /架空の既知注意/);
});

test('旧店舗詳細の件数・検索0件・除外0件も以前の登録による判定と示す', () => {
    assert.match(shopMenus(true, true), /以前取得した登録情報による表示/);
    assert.match(shopMenus(true, false, false, 'q=fictional'), /以前取得した登録情報では、検索条件に一致する公開メニューがありません/);
    assert.match(shopMenus(true, false), /以前取得した登録情報では、公開メニューがありません/);
    assert.match(shopMenus(true, true, true), /以前取得した登録情報と除外設定による表示は0件です/);
});

test('通常の店舗詳細の集計・0件案内を変更しない', () => {
    const html = shopMenus(false, true);
    assert.match(html, /このうち、あなたの確認対象/);
    assert.doesNotMatch(html, /現在は未再確認|以前取得した登録情報による表示/);
    assert.match(shopMenus(false, false), /現在公開中のメニューはありません/);
    assert.match(shopMenus(false, true, true), /除外設定により表示できるメニューがありません/);
});
