import assert from "node:assert/strict";
import { test } from "node:test";
import { rankMenuCategories, suggestMenuCategories } from "../features/admin/menus/menu-category-options";
import { groupPublicMenus, searchPublicMenus } from "../features/public/shops/components/public-menu-search";

test("管理候補は空欄を除外し、同じ表記を集計して利用数順で最大5件表示する", () => {
    const rows = [
        ["フード", 8], ["ドリンク", 4], [" ドリンク ", 2], ["その他", 5],
        ["セット", 3], ["季節限定", 2], ["デザート", 1], [null, 10], ["　", 10],
    ] as const;
    const options = rankMenuCategories(rows.map(([category, count]) => ({ category, _count: { _all: count } })));
    assert.deepEqual(suggestMenuCategories(options, ""),
        ["フード", "ドリンク", "その他", "セット", "季節限定"]);
});

test("候補検索は幅・かなを吸収して一致順に並べ、候補の保存表記を保持する", () => {
    const options = [
        "季節のドリンク", "ドリンクセット", "ドリンク", "飲み物", "Ｃａｆｅ",
    ];
    const find = (query: string) => suggestMenuCategories(options, query);
    assert.deepEqual(find("ど"), ["ドリンクセット", "ドリンク", "季節のドリンク"]);
    assert.deepEqual(find("ﾄﾞﾘﾝｸ"), ["ドリンク", "ドリンクセット", "季節のドリンク"]);
    assert.deepEqual(find("cafe"), ["Ｃａｆｅ"]);
    assert.deepEqual(find("新しいカテゴリ"), []);
});

test("公開グループは初出順、グループ内は入力順で、未分類を最後にまとめる", () => {
    const menus = [
        { id: 1, name: "無分類A", description: "検索語", category: null },
        { id: 2, name: "紅茶", description: "検索語", category: "ドリンク" },
        { id: 3, name: "その他", description: null, category: "その他のメニュー" },
        { id: 4, name: "コーヒー", description: null, category: "ドリンク" },
        { id: 5, name: "無分類B", description: null, category: "　" },
        { id: 6, name: "水", description: null, category: "ﾄﾞﾘﾝｸ" },
    ];
    const groups = groupPublicMenus(menus.map((menu) => ({ menu })));
    assert.deepEqual(Array.from(groups, ([name, items]) => [name, items.map(({ menu }) => menu.id)]),
        [["ドリンク", [2, 4]], ["その他のメニュー", [3]], ["ﾄﾞﾘﾝｸ", [6]], [null, [1, 5]]]);
    assert.deepEqual(searchPublicMenus(menus, "検索語").map(({ id }) => id), [1, 2]);
    assert.deepEqual(searchPublicMenus(menus, "ドリンク").map(({ id }) => id), [2, 4]);
});
