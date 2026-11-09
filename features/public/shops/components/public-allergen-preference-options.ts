type PreferenceItem = { slug: string; nameJa: string };

const groups = [
    { name: "卵・乳・穀類", slugs: ["egg", "milk", "wheat", "buckwheat"] },
    { name: "魚介類", slugs: ["shrimp", "crab", "abalone", "squid", "salmon_roe", "salmon", "mackerel"] },
    { name: "豆・ナッツ・ごま", slugs: ["peanut", "soybean", "walnut", "almond", "cashew", "macadamia_nut", "pistachio", "sesame"] },
    { name: "肉・ゼラチン", slugs: ["beef", "chicken", "pork", "gelatin"] },
    { name: "果物・いも", slugs: ["orange", "kiwifruit", "banana", "peach", "apple", "yam"] },
];
const groupedSlugs = new Set(groups.flatMap(({ slugs }) => slugs));

const aliases = new Map(Object.entries({
    egg: ["たまご", "玉子"],
    milk: ["にゅう", "ちち", "牛乳", "ぎゅうにゅう", "ミルク"],
    wheat: ["こむぎ"],
    peanut: ["らっかせい"],
    soybean: ["だいず"],
    beef: ["ぎゅうにく"],
    chicken: ["とりにく", "けいにく"],
    pork: ["ぶたにく"],
    salmon: ["鮭", "しゃけ", "サーモン"],
    crab: ["蟹"],
    shrimp: ["海老", "蝦"],
}));

function normalizeSearch(value: string) {
    return value.normalize("NFKC").trim()
        .replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

export function filterAndGroupPreferenceItems(allergens: PreferenceItem[], search: string) {
    const query = normalizeSearch(search);
    const visible = query ? allergens.filter(({ slug, nameJa }) =>
        [nameJa, ...(aliases.get(slug) ?? [])].some((name) => normalizeSearch(name).includes(query))
    ) : allergens;
    const bySlug = new Map(visible.map((allergen) => [allergen.slug, allergen]));
    return [
        ...groups.map(({ name, slugs }) => ({
            name,
            items: slugs.flatMap((slug) => {
                const allergen = bySlug.get(slug);
                return allergen ? [allergen] : [];
            }),
        })),
        { name: "その他", items: visible.filter(({ slug }) => !groupedSlugs.has(slug)) },
    ].filter(({ items }) => items.length > 0);
}
