import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import { getMenuPublishValidationErrors, type AllergenStatus } from "../lib/allergens";

type DemoMenuSeed = {
    name: string;
    description: string;
    category: string;
    priceYen: number;
    ingredients: string;
    precaution: string | null;
    allergenStatusBySlug: Record<string, AllergenStatus>;
};

// 以下は架空メニューのUI検証用シナリオ。原材料から状態を推論しない。
// 各シナリオの全品目を明記し、将来マスタが増えても省略をFREEに補完しない。
export const DEMO_MENUS: DemoMenuSeed[] = [
    {
        name: "米粉パンケーキ",
        description:
            "米粉を使ったふんわり食感のパンケーキ。朝食や軽食向けの定番メニューです。",
        category: "デザート",
        priceYen: 980,
        ingredients:
            "米粉、豆乳、砂糖、菜種油、ベーキングパウダー、いちごソース",
        precaution: "同一厨房で小麦・卵・乳を含むメニューを調理しています。",
        allergenStatusBySlug: {
            shrimp: "FREE",
            crab: "FREE",
            walnut: "FREE",
            wheat: "FREE",
            buckwheat: "FREE",
            egg: "FREE",
            milk: "FREE",
            peanut: "FREE",
            almond: "FREE",
            abalone: "FREE",
            squid: "FREE",
            salmon_roe: "FREE",
            orange: "FREE",
            cashew: "FREE",
            kiwifruit: "FREE",
            beef: "FREE",
            sesame: "FREE",
            salmon: "FREE",
            mackerel: "FREE",
            soybean: "CONTAINS",
            chicken: "FREE",
            banana: "FREE",
            pork: "FREE",
            macadamia_nut: "FREE",
            peach: "FREE",
            apple: "MAY_CONTAIN",
            yam: "FREE",
            gelatin: "FREE",
            pistachio: "FREE",
        },
    },
    {
        name: "豆乳ベジカレー",
        description:
            `野菜を中心にしたやさしい辛さのカレー。メニュー詳細で${ALLERGEN_MASTER.length}品目を確認できます。`,
        category: "メイン",
        priceYen: 1280,
        ingredients:
            "米、豆乳、玉ねぎ、にんじん、じゃがいも、トマト、カレースパイス、ごま",
        precaution: "同一フライヤーでえび・かにを使用する場合があります。",
        allergenStatusBySlug: {
            shrimp: "MAY_CONTAIN",
            crab: "MAY_CONTAIN",
            walnut: "FREE",
            wheat: "FREE",
            buckwheat: "FREE",
            egg: "FREE",
            milk: "FREE",
            peanut: "FREE",
            almond: "FREE",
            abalone: "FREE",
            squid: "FREE",
            salmon_roe: "FREE",
            orange: "FREE",
            cashew: "FREE",
            kiwifruit: "FREE",
            beef: "FREE",
            sesame: "CONTAINS",
            salmon: "FREE",
            mackerel: "FREE",
            soybean: "CONTAINS",
            chicken: "FREE",
            banana: "FREE",
            pork: "FREE",
            macadamia_nut: "FREE",
            peach: "FREE",
            apple: "FREE",
            yam: "FREE",
            gelatin: "FREE",
            pistachio: "FREE",
        },
    },
    {
        name: "照り焼きチキンプレート",
        description:
            "人気の定食メニュー。価格・原材料・アレルゲンの見え方を確認するデモ用サンプルです。",
        category: "メイン",
        priceYen: 1420,
        ingredients: "鶏肉、しょうゆ、みりん、砂糖、ごはん、温野菜、卵黄ソース",
        precaution: "同一厨房で乳・小麦・ごまを使用しています。",
        allergenStatusBySlug: {
            shrimp: "FREE",
            crab: "FREE",
            walnut: "FREE",
            wheat: "MAY_CONTAIN",
            buckwheat: "FREE",
            egg: "CONTAINS",
            milk: "MAY_CONTAIN",
            peanut: "FREE",
            almond: "FREE",
            abalone: "FREE",
            squid: "FREE",
            salmon_roe: "FREE",
            orange: "FREE",
            cashew: "FREE",
            kiwifruit: "FREE",
            beef: "FREE",
            sesame: "MAY_CONTAIN",
            salmon: "FREE",
            mackerel: "FREE",
            soybean: "CONTAINS",
            chicken: "CONTAINS",
            banana: "FREE",
            pork: "FREE",
            macadamia_nut: "FREE",
            peach: "FREE",
            apple: "FREE",
            yam: "FREE",
            gelatin: "FREE",
            pistachio: "FREE",
        },
    },
];

export function validateDemoMenuFixtures(menus: DemoMenuSeed[] = DEMO_MENUS) {
    for (const menu of menus) {
        const errors = getMenuPublishValidationErrors({
            name: menu.name, allergens: ALLERGEN_MASTER, statusBySlug: menu.allergenStatusBySlug,
        });
        const knownSlugs = new Set(ALLERGEN_MASTER.map((allergen) => allergen.slug));
        if (Object.keys(menu.allergenStatusBySlug).some((slug) => !knownSlugs.has(slug))) {
            errors.push("架空データに未対応の品目が含まれています。");
        }
        if (errors.length > 0) throw new Error(`${menu.name}: ${errors.join(" ")}`);
    }
}
