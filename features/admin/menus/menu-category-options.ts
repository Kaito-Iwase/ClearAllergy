function searchKey(text: string) {
    return text.trim().normalize("NFKC").toLocaleLowerCase("ja-JP")
        .replace(/[ァ-ヶヽヾ]/g, (kana) => String.fromCharCode(kana.charCodeAt(0) - 0x60));
}

// Options arrive in frequency order. Stable sorting keeps that order within each match tier.
export function suggestMenuCategories(options: string[], input: string) {
    const query = searchKey(input);
    if (!query) return options.slice(0, 5);
    return options.flatMap((category) => {
        const key = searchKey(category);
        const rank = key === query ? 0 : key.startsWith(query) ? 1 : key.includes(query) ? 2 : -1;
        return rank === -1 ? [] : [{ category, rank }];
    }).sort((a, b) => a.rank - b.rank).slice(0, 5).map(({ category }) => category);
}

export function rankMenuCategories(rows: { category: string | null; _count: { _all: number } }[]) {
    const counts = new Map<string, number>();
    for (const row of rows) {
        const category = row.category?.trim();
        if (category) counts.set(category, (counts.get(category) ?? 0) + row._count._all);
    }
    return Array.from(counts)
        .sort(([a, aCount], [b, bCount]) => bCount - aCount || a.localeCompare(b, "ja"))
        .map(([category]) => category);
}
