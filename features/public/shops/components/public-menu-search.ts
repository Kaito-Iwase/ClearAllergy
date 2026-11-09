type SearchableMenu = { name: string; description: string | null; category: string | null };

export function searchPublicMenus<T extends SearchableMenu>(menus: T[], query: string) {
    if (!query) return menus;
    const needle = query.toLocaleLowerCase("ja-JP");
    return menus.filter(({ name, description, category }) =>
        [name, description, category].some((value) => value?.toLocaleLowerCase("ja-JP").includes(needle)),
    );
}

export function groupPublicMenus<T extends { menu: { category: string | null } }>(items: T[]) {
    const groups = new Map<string | null, T[]>();
    const uncategorized: T[] = [];
    for (const item of items) {
        const category = item.menu.category?.trim();
        if (!category) {
            uncategorized.push(item);
            continue;
        }
        const group = groups.get(category);
        if (group) group.push(item);
        else groups.set(category, [item]);
    }
    if (uncategorized.length > 0) groups.set(null, uncategorized);
    return groups;
}
