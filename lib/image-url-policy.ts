const DEFAULT_ALLOWED_HOST_SUFFIXES = [
    ".public.blob.vercel-storage.com",
    ".blob.vercel-storage.com",
    "blob.vercel-storage.com",
];

// 環境変数で追加許可したい prefix を読み取ります。
// 本番では Vercel Blob 以外の CDN を使う時の逃げ道として残しています。
function getAllowedPrefixes() {
    return (process.env.ALLOWED_IMAGE_URL_PREFIXES ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

// Blob 由来の URL かどうかをホスト名で確認します。
// 外部 URL を自由入力できると、追跡用画像や不適切画像を混ぜられるため制限します。
function hasAllowedHost(url: URL) {
    return DEFAULT_ALLOWED_HOST_SUFFIXES.some((suffix) =>
        url.hostname === suffix || url.hostname.endsWith(suffix),
    );
}

function hasAllowedPrefix(rawUrl: string) {
    return getAllowedPrefixes().some((prefix) => rawUrl.startsWith(prefix));
}

// この関数は、DB に保存されている画像 URL を「表示してよいものだけ」に絞ります。
// 保存時だけでなく表示時にも再確認することで、過去データに危険な URL が残っていても画面に出さないようにします。
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

    // origin だけでなく path も見ているのは、
    // 他店舗のアップロード URL を勝手に使い回されるのを防ぐためです。
    const isAllowedOrigin = hasAllowedPrefix(trimmed) || hasAllowedHost(parsed);
    const isAllowedPath = parsed.pathname.includes(expectedPathSegment);

    if (!isAllowedOrigin || !isAllowedPath) {
        return null;
    }

    return trimmed;
}

// 保存 API 用のバリデーションです。
// 入力が空なら null 扱いにし、URL がある場合だけポリシーに通るか確認します。
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
