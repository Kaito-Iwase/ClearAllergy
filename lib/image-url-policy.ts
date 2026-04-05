const DEFAULT_ALLOWED_HOST_SUFFIXES = [
    ".public.blob.vercel-storage.com",
    ".blob.vercel-storage.com",
    "blob.vercel-storage.com",
];

function getAllowedPrefixes() {
    return (process.env.ALLOWED_IMAGE_URL_PREFIXES ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

function hasAllowedHost(url: URL) {
    return DEFAULT_ALLOWED_HOST_SUFFIXES.some((suffix) =>
        url.hostname === suffix || url.hostname.endsWith(suffix),
    );
}

function hasAllowedPrefix(rawUrl: string) {
    return getAllowedPrefixes().some((prefix) => rawUrl.startsWith(prefix));
}

export function sanitizeStoredImageUrl(
    rawUrl: string | null | undefined,
    args: {
        kind: "menu" | "shop";
        shopId: string;
    },
) {
    if (!rawUrl) {
        return null;
    }

    const trimmed = rawUrl.trim();
    if (trimmed === "") {
        return null;
    }

    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        return null;
    }

    const expectedPathSegment =
        args.kind === "menu"
            ? `/menu-images/${args.shopId}/`
            : `/shops/${args.shopId}/cover-`;

    const isAllowedOrigin = hasAllowedPrefix(trimmed) || hasAllowedHost(parsed);
    const isAllowedPath = parsed.pathname.includes(expectedPathSegment);

    if (!isAllowedOrigin || !isAllowedPath) {
        return null;
    }

    return trimmed;
}

export function validateStoredImageUrl(
    rawUrl: string | null | undefined,
    args: {
        kind: "menu" | "shop";
        shopId: string;
    },
) {
    if (rawUrl == null || rawUrl.trim() === "") {
        return {
            ok: true as const,
            value: null,
        };
    }

    const sanitized = sanitizeStoredImageUrl(rawUrl, args);

    if (!sanitized) {
        return {
            ok: false as const,
            message:
                "画像URLはこのサービスのアップロード機能で保存したURLのみ指定できます。",
        };
    }

    return {
        ok: true as const,
        value: sanitized,
    };
}
