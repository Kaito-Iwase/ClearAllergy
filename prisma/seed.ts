import bcrypt from "bcrypt";
import { PrismaClient, type AllergenStatus } from "@prisma/client";

const prisma = new PrismaClient();

type AllergenSeed = {
    slug: string;
    nameJa: string;
    nameEn: string;
    sortOrder: number;
};

const ALLERGENS: AllergenSeed[] = [
    { slug: "shrimp", nameJa: "えび", nameEn: "Shrimp", sortOrder: 1 },
    { slug: "crab", nameJa: "かに", nameEn: "Crab", sortOrder: 2 },
    { slug: "walnut", nameJa: "くるみ", nameEn: "Walnut", sortOrder: 3 },
    { slug: "wheat", nameJa: "小麦", nameEn: "Wheat", sortOrder: 4 },
    { slug: "buckwheat", nameJa: "そば", nameEn: "Buckwheat", sortOrder: 5 },
    { slug: "egg", nameJa: "卵", nameEn: "Egg", sortOrder: 6 },
    { slug: "milk", nameJa: "乳", nameEn: "Milk", sortOrder: 7 },
    {
        slug: "peanut",
        nameJa: "落花生（ピーナッツ）",
        nameEn: "Peanut",
        sortOrder: 8,
    },
    { slug: "almond", nameJa: "アーモンド", nameEn: "Almond", sortOrder: 9 },
    { slug: "abalone", nameJa: "あわび", nameEn: "Abalone", sortOrder: 10 },
    { slug: "squid", nameJa: "いか", nameEn: "Squid", sortOrder: 11 },
    {
        slug: "salmon_roe",
        nameJa: "いくら",
        nameEn: "Salmon roe",
        sortOrder: 12,
    },
    { slug: "orange", nameJa: "オレンジ", nameEn: "Orange", sortOrder: 13 },
    {
        slug: "cashew",
        nameJa: "カシューナッツ",
        nameEn: "Cashew",
        sortOrder: 14,
    },
    {
        slug: "kiwifruit",
        nameJa: "キウイフルーツ",
        nameEn: "Kiwifruit",
        sortOrder: 15,
    },
    { slug: "beef", nameJa: "牛肉", nameEn: "Beef", sortOrder: 16 },
    { slug: "sesame", nameJa: "ごま", nameEn: "Sesame", sortOrder: 17 },
    { slug: "salmon", nameJa: "さけ", nameEn: "Salmon", sortOrder: 18 },
    { slug: "mackerel", nameJa: "さば", nameEn: "Mackerel", sortOrder: 19 },
    { slug: "soybean", nameJa: "大豆", nameEn: "Soybean", sortOrder: 20 },
    { slug: "chicken", nameJa: "鶏肉", nameEn: "Chicken", sortOrder: 21 },
    { slug: "banana", nameJa: "バナナ", nameEn: "Banana", sortOrder: 22 },
    { slug: "pork", nameJa: "豚肉", nameEn: "Pork", sortOrder: 23 },
    {
        slug: "macadamia_nut",
        nameJa: "マカダミアナッツ",
        nameEn: "Macadamia nut",
        sortOrder: 24,
    },
    { slug: "peach", nameJa: "もも", nameEn: "Peach", sortOrder: 25 },
    { slug: "apple", nameJa: "りんご", nameEn: "Apple", sortOrder: 26 },
    { slug: "yam", nameJa: "やまいも", nameEn: "Yam", sortOrder: 27 },
    { slug: "gelatin", nameJa: "ゼラチン", nameEn: "Gelatin", sortOrder: 28 },
];

const DEMO_USER_EMAIL = "demo@clearallergy.local";
const DEMO_USER_PASSWORD = "demo1234";

type DemoMenuSeed = {
    name: string;
    description: string;
    category: string;
    priceYen: number;
    ingredients: string;
    precaution: string | null;
    allergenStatusBySlug: Record<string, AllergenStatus>;
};

function buildPublishedSeedStatusMap(
    allergens: AllergenSeed[],
    partialStatusBySlug: Record<string, AllergenStatus>,
) {
    const completeStatusBySlug: Record<string, AllergenStatus> = {};

    for (const allergen of allergens) {
        completeStatusBySlug[allergen.slug] =
            partialStatusBySlug[allergen.slug] ?? "FREE";
    }

    return completeStatusBySlug;
}

const DEMO_MENUS: DemoMenuSeed[] = [
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
            soybean: "CONTAINS",
            apple: "MAY_CONTAIN",
        },
    },
    {
        name: "豆乳ベジカレー",
        description:
            "野菜を中心にしたやさしい辛さのカレー。メニュー詳細で28品目を確認できます。",
        category: "メイン",
        priceYen: 1280,
        ingredients:
            "米、豆乳、玉ねぎ、にんじん、じゃがいも、トマト、カレースパイス、ごま",
        precaution: "同一フライヤーでえび・かにを使用する場合があります。",
        allergenStatusBySlug: {
            soybean: "CONTAINS",
            sesame: "CONTAINS",
            shrimp: "MAY_CONTAIN",
            crab: "MAY_CONTAIN",
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
            chicken: "CONTAINS",
            soybean: "CONTAINS",
            egg: "CONTAINS",
            wheat: "MAY_CONTAIN",
            milk: "MAY_CONTAIN",
            sesame: "MAY_CONTAIN",
        },
    },
];

async function seedAllergenMaster() {
    const oldMatsutake = await prisma.allergen.findUnique({
        where: { slug: "matsutake" },
        select: { id: true },
    });

    if (oldMatsutake) {
        await prisma.menuItemAllergen.deleteMany({
            where: { allergenId: oldMatsutake.id },
        });

        await prisma.allergen.delete({
            where: { slug: "matsutake" },
        });
    }

    for (const allergen of ALLERGENS) {
        await prisma.allergen.upsert({
            where: { slug: allergen.slug },
            update: {
                nameJa: allergen.nameJa,
                nameEn: allergen.nameEn,
                sortOrder: allergen.sortOrder,
            },
            create: allergen,
        });
    }
}

async function seedDemoShop() {
    const passwordHash = await bcrypt.hash(DEMO_USER_PASSWORD, 10);

    const user = await prisma.user.upsert({
        where: { email: DEMO_USER_EMAIL },
        update: { passwordHash },
        create: {
            email: DEMO_USER_EMAIL,
            passwordHash,
        },
        select: { id: true },
    });

    const shop = await prisma.shop.upsert({
        where: { userId: user.id },
        update: {
            name: "Clear Cafe Demo",
            description:
                "公開ページの見え方を確認できるデモ店舗です。メニューごとの価格とアレルゲン情報を事前に確認できます。",
            address: "東京都渋谷区デモ1-2-3",
            hours: "平日 11:00-18:00 / 土日祝 10:00-19:00",
            coverImageUrl: null,
        },
        create: {
            userId: user.id,
            name: "Clear Cafe Demo",
            description:
                "公開ページの見え方を確認できるデモ店舗です。メニューごとの価格とアレルゲン情報を事前に確認できます。",
            address: "東京都渋谷区デモ1-2-3",
            hours: "平日 11:00-18:00 / 土日祝 10:00-19:00",
            coverImageUrl: null,
        },
        select: { id: true },
    });

    const allergenBySlug = new Map(
        (
            await prisma.allergen.findMany({
                select: { id: true, slug: true },
            })
        ).map((allergen) => [allergen.slug, allergen.id]),
    );

    for (const menu of DEMO_MENUS) {
        const existing = await prisma.menuItem.findFirst({
            where: {
                shopId: shop.id,
                name: menu.name,
            },
            select: { id: true },
        });

        const savedMenu = existing
            ? await prisma.menuItem.update({
                  where: { id: existing.id },
                  data: {
                      name: menu.name,
                      description: menu.description,
                      category: menu.category,
                      priceYen: menu.priceYen,
                      ingredients: menu.ingredients,
                      precaution: menu.precaution,
                      imageUrl: null,
                      isPublished: true,
                  },
                  select: { id: true },
              })
            : await prisma.menuItem.create({
                  data: {
                      shopId: shop.id,
                      name: menu.name,
                      description: menu.description,
                      category: menu.category,
                      priceYen: menu.priceYen,
                      ingredients: menu.ingredients,
                      precaution: menu.precaution,
                      imageUrl: null,
                      isPublished: true,
                  },
                  select: { id: true },
              });

        await prisma.menuItemAllergen.deleteMany({
            where: { menuItemId: savedMenu.id },
        });

        const statuses = Object.entries(
            buildPublishedSeedStatusMap(ALLERGENS, menu.allergenStatusBySlug),
        );

        await prisma.menuItemAllergen.createMany({
            data: statuses.map(([slug, status]) => {
                const allergenId = allergenBySlug.get(slug);
                if (!allergenId) {
                    throw new Error(`Unknown allergen slug in seed: ${slug}`);
                }

                return {
                    menuItemId: savedMenu.id,
                    allergenId,
                    status,
                };
            }),
        });
    }
}

async function main() {
    await seedAllergenMaster();
    await seedDemoShop();
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
