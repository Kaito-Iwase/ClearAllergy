// サーバー専用の設定から、このアプリが利用するBlobストアのoriginだけを許可します。
// トークン自体は返却・ログ出力・Client Componentへの引き渡しを行いません。
function parseHttpsBlobUrl(value: string): URL | null {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password && !url.port
            && /^[a-z0-9-]+\.(?:public\.)?blob\.vercel-storage\.com$/.test(url.hostname)
            && !url.search && !url.hash ? url : null;
    } catch {
        return null;
    }
}

function getAllowedPrefixes() {
    return (process.env.ALLOWED_IMAGE_URL_PREFIXES ?? "").split(",")
        .map((value) => parseHttpsBlobUrl(value.trim()))
        .filter((url): url is URL => url !== null);
}

function getTrustedImagePrefixes(): URL[] {
    // 明示設定があればそのパス境界も尊重し、不正な設定は許可へ倒さない。
    if (process.env.ALLOWED_IMAGE_URL_PREFIXES?.trim()) return getAllowedPrefixes();
    // Vercel SDKのread-write tokenは vercel_blob_rw_<storeId>_<secret> 形式。
    // https://github.com/vercel/storage/blob/main/packages/blob/src/helpers.ts
    const storeId = /^vercel_blob_rw_([a-zA-Z0-9]+)_[^\s]+$/.exec(
        process.env.BLOB_READ_WRITE_TOKEN?.trim() ?? "",
    )?.[1]?.toLowerCase();
    return storeId ? [new URL(`https://${storeId}.public.blob.vercel-storage.com`)] : [];
}

export function getAllowedImageOrigins(): string[] {
    return [...new Set(getTrustedImagePrefixes().map((url) => url.origin))];
}

export function sanitizeStoredImageUrl(
    rawUrl: string | null | undefined,
    args: { kind: "menu" | "shop"; shopId: string },
) {
    if (!rawUrl || !/^[a-zA-Z0-9_-]+$/.test(args.shopId)) return null;
    const parsed = parseHttpsBlobUrl(rawUrl.trim());
    if (!parsed || !getTrustedImagePrefixes().some((prefix) => {
        const path = prefix.pathname.endsWith("/") ? prefix.pathname : `${prefix.pathname}/`;
        return prefix.origin === parsed.origin && parsed.pathname.startsWith(path);
    })) return null;

    const pathPrefix = args.kind === "menu"
        ? `/menu-images/${args.shopId}/` : `/shops/${args.shopId}/`;
    if (!parsed.pathname.startsWith(pathPrefix)) return null;
    const filename = parsed.pathname.slice(pathPrefix.length);
    const filenamePattern = args.kind === "menu"
        ? /^[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp|gif|avif)$/i
        : /^cover-[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp|gif|avif)$/i;
    if (!filenamePattern.test(filename)) return null;
    return parsed.href;
}

export function validateStoredImageUrl(
    rawUrl: string | null | undefined,
    args: { kind: "menu" | "shop"; shopId: string },
) {
    if (rawUrl == null || rawUrl.trim() === "") {
        return { ok: true as const, value: null };
    }
    const sanitized = sanitizeStoredImageUrl(rawUrl, args);
    if (!sanitized) {
        return { ok: false as const, message: "この店舗のアップロード機能で保存した画像URLを指定してください。" };
    }
    return { ok: true as const, value: sanitized };
}
