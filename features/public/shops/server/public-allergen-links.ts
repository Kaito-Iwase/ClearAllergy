// Resolve links from the master already read in the same public snapshot.
// Do not retain this map between requests: corrections must stay visible.
export function createPublicAllergenLinkResolver(
    allergenMaster: ReadonlyArray<{ id: string; slug: string }>,
) {
    const slugById = new Map(allergenMaster.map(({ id, slug }) => [id, slug]));

    return <Status extends string>(
        links: ReadonlyArray<{ allergenId: string; status: Status }>,
    ) => links.map(({ allergenId, status }) => {
        const slug = slugById.get(allergenId);
        // A link outside this snapshot's master is a data error, never FREE.
        if (slug === undefined) throw new Error("Public allergen link is missing from the snapshot master");
        return { status, allergen: { slug } };
    });
}
