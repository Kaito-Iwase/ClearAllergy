export type AllergenMasterSeed = {
    slug: string;
    nameJa: string;
    nameEn: string;
    sortOrder: number;
};

export const ALLERGEN_MASTER: AllergenMasterSeed[] = [
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
    {
        slug: "pistachio",
        nameJa: "ピスタチオ",
        nameEn: "Pistachio",
        sortOrder: 29,
    },
];

export const PISTACHIO_ALLERGEN = ALLERGEN_MASTER.find(
    (allergen) => allergen.slug === "pistachio",
);
