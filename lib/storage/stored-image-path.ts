export function parseHttpsBlobUrl(value: string): URL | null {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password && !url.port
            && /^[a-z0-9-]+\.(?:public\.)?blob\.vercel-storage\.com$/.test(url.hostname)
            && !url.search && !url.hash ? url : null;
    } catch {
        return null;
    }
}

export function parseStoredImagePath(
    rawUrl: string | null | undefined,
    { kind, shopId }: { kind: "menu" | "shop"; shopId: string },
): URL | null {
    if (!rawUrl || !/^[a-zA-Z0-9_-]+$/.test(shopId)) return null;
    const url = parseHttpsBlobUrl(rawUrl.trim());
    const pathPrefix = kind === "menu" ? `/menu-images/${shopId}/` : `/shops/${shopId}/`;
    if (!url?.pathname.startsWith(pathPrefix)) return null;
    const filename = url.pathname.slice(pathPrefix.length);
    const filenamePattern = kind === "menu"
        ? /^[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp|gif|avif)$/i
        : /^cover-[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp|gif|avif)$/i;
    return filenamePattern.test(filename) ? url : null;
}
