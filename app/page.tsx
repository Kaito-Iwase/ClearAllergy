import HomePageView from "@/components/public/HomePageView";

export const dynamic = "force-static";

const featuredShop = {
    id: "demo-cafe-hibi",
    name: "[デモ店舗]Cafe Hibi（カフェ ヒビ）",
    description:
        "日々の食事を安心して選べるように、メニューごとの価格とアレルゲン情報を公開しているデモ店舗です。",
    menus: [
        {
            id: "demo-rice-flour-pancake",
            name: "米粉パンケーキ",
            priceYen: 980,
            allergenLinks: [{ status: "CONTAINS" }, { status: "MAY_CONTAIN" }],
        },
        {
            id: "demo-soy-veggie-curry",
            name: "豆乳ベジカレー",
            priceYen: 1280,
            allergenLinks: [{ status: "CONTAINS" }, { status: "MAY_CONTAIN" }],
        },
        {
            id: "demo-teriyaki-chicken-plate",
            name: "照り焼きチキンプレート",
            priceYen: 1420,
            allergenLinks: [{ status: "CONTAINS" }, { status: "MAY_CONTAIN" }],
        },
    ],
    _count: {
        menus: 3,
    },
};

export default function HomePage() {
    return (
        <HomePageView
            featuredShop={featuredShop}
            isDatabaseAvailable={true}
        />
    );
}
