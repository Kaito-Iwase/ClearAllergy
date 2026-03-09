import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type AllergenSeed = {
    slug: string;
    nameJa: string;
    nameEn: string;
    sortOrder: number;
};

// 日本（消費者庁の「特定原材料等」）の現行28品目に合わせた固定マスタ
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

async function main() {
    // 1) 旧マスタ「まつたけ」が残っていたら削除
    //    MenuItemAllergen が matsutake を参照している場合も先に消す
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

    // 2) 現行28品目を upsert
    for (const a of ALLERGENS) {
        await prisma.allergen.upsert({
            where: { slug: a.slug },
            update: {
                nameJa: a.nameJa,
                nameEn: a.nameEn,
                sortOrder: a.sortOrder,
            },
            create: a,
        });
    }

    console.log(`Seeded allergens: ${ALLERGENS.length}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
