import assert from "node:assert/strict";
import test from "node:test";
import { getMenuFoodReviewState } from "../features/admin/menus/menu-list";
import { adminMenuListSelect, toAdminMenuListRow } from "../features/admin/menus/server/menu-list-data";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MenuListPageClient from "../features/admin/menus/components/MenuListPageClient";

test("一覧projectionの記録が空なら、確認対応版一致から記録ありを推測しない", () => {
    assert.equal(getMenuFoodReviewState({ foodVersion: 2, reviewedFoodVersion: 2, foodReviews: [] }), "missing");
});

test("一覧projectionの最新食品版が異なるなら、確認対応版一致でも現行記録にしない", () => {
    for (const foodVersion of [1, 3]) {
        assert.equal(getMenuFoodReviewState({ foodVersion: 2, reviewedFoodVersion: 2,
            foodReviews: [{ foodVersion, unresolvedIssues: null }],
        }), "outdated");
    }
});

test("食品確認の現行・旧版・最新未解決・記録なしを区別する", () => {
    assert.equal(getMenuFoodReviewState({ foodVersion: 2, reviewedFoodVersion: 2, foodReviews: [{ foodVersion: 2, unresolvedIssues: null }] }), "current");
    assert.equal(getMenuFoodReviewState({ foodVersion: 2, reviewedFoodVersion: null, foodReviews: [] }), "missing");
    assert.equal(getMenuFoodReviewState({ foodVersion: 2, reviewedFoodVersion: 1, foodReviews: [{ foodVersion: 1, unresolvedIssues: null }] }), "outdated");
    assert.equal(getMenuFoodReviewState({ foodVersion: 2, reviewedFoodVersion: null, foodReviews: [{ foodVersion: 2, unresolvedIssues: "仕入れ仕様未照合" }, { foodVersion: 2, unresolvedIssues: null }] }), "unresolved");
    assert.equal(getMenuFoodReviewState({ foodVersion: 2, reviewedFoodVersion: null, foodReviews: [{ foodVersion: 1, unresolvedIssues: "旧版の未解決" }] }), "outdated");
});

test("確認対応版が現行でも、同じ版の最新未解決記録を現行確認ありで隠さない", () => {
    assert.equal(getMenuFoodReviewState({ foodVersion: 2, reviewedFoodVersion: 2,
        foodReviews: [{ foodVersion: 2, unresolvedIssues: "新しい未解決事項" }, { foodVersion: 2, unresolvedIssues: null }],
    }), "unresolved");
    assert.equal(getMenuFoodReviewState({ foodVersion: 2, reviewedFoodVersion: 2,
        foodReviews: [{ foodVersion: 2, unresolvedIssues: null }, { foodVersion: 1, unresolvedIssues: "以前の版の未解決事項" }],
    }), "current");
});

test("一覧は全品目設定済みでも再確認理由と編集入口を表示し、通常STOPを数えない", () => {
    const base = { id: "fictional", name: "架空料理", category: null, priceYen: null, imageUrl: null,
        isPublished: false, version: 3, updatedAt: "2026-10-15T00:00:00Z", unknownAllergenNames: [] };
    const html = renderToStaticMarkup(createElement(MenuListPageClient, { totalAllergenCount: 2, initialMenus: [
        { ...base, id: "old", foodReviewState: "outdated" },
        { ...base, id: "unresolved", foodReviewState: "unresolved" },
        { ...base, id: "missing", foodReviewState: "missing" },
        { ...base, id: "stopped", foodReviewState: "current" },
    ] }));
    assert.match(html, /再確認待ち/);
    assert.match(html, /食品確認の再確認待ちが 3 件/);
    assert.match(html, /現在の食品内容に対応する確認記録がありません/);
    assert.match(html, /最新の食品確認記録に未解決事項があります/);
    assert.match(html, /食品確認記録がありません/);
    assert.match(html, /現行の食品確認記録あり/);
    assert.match(html, /href="\/admin\/menus\/old\/edit"/);
    assert.doesNotMatch(html, /設定すると公開準備が完了/);
});

test("通常STOPと品目未設定は食品確認対応から独立し、根拠本文は一覧へ出さない", () => {
    const allergens = [{ slug: "egg", nameJa: "卵" }, { slug: "milk", nameJa: "乳" }];
    const base = { id: "fictional", name: "架空料理", category: null, priceYen: null, imageUrl: null,
        isPublished: false, version: 3, updatedAt: new Date("2026-10-15T00:00:00Z"), foodVersion: 2, reviewedFoodVersion: 2,
        allergenLinks: [{ status: "FREE" as const, allergen: { slug: "egg" } }],
        foodReviews: [{ foodVersion: 2, unresolvedIssues: null }],
    };
    const stopped = toAdminMenuListRow(base, allergens);
    assert.equal(stopped.foodReviewState, "current");
    assert.equal(stopped.isPublished, false);
    assert.deepEqual(stopped.unknownAllergenNames, ["乳"]);
    assert.equal(toAdminMenuListRow({ ...base, isPublished: true }, allergens).foodReviewState, "current");
    const pending = toAdminMenuListRow({ ...base, reviewedFoodVersion: null, foodReviews: [{ foodVersion: 2, unresolvedIssues: "非公開メモ" }] }, allergens);
    assert.equal(pending.foodReviewState, "unresolved");
    assert.ok(!JSON.stringify(pending).includes("非公開メモ"));
    assert.ok(!("foodReviews" in pending));
    assert.deepEqual(adminMenuListSelect.foodReviews, { orderBy: { reviewSequence: "desc" }, take: 1, select: { foodVersion: true, unresolvedIssues: true } });
});
