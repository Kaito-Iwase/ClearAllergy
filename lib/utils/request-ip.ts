type HeaderLike =
    | Headers
    | HeadersInit
    | Record<string, string | string[] | undefined>;

// この関数は、プロキシや CDN が付けた IP ヘッダーから
// いちばん手前の利用者 IP を取り出すための補助です。
// x-forwarded-for は "IP1, IP2, ..." の形になるので先頭だけ使います。
function firstForwardedIp(value: string | null) {
    if (!value) {
        return null;
    }

    const first = value.split(",")[0]?.trim();
    return first || null;
}

// 呼び出し元によって headers の型が違うので、
// ここで一度 Headers に寄せて扱いやすくします。
function toHeaders(headers: HeaderLike) {
    if (headers instanceof Headers) {
        return headers;
    }

    return new Headers(headers as HeadersInit);
}

// この関数は、レート制限や監査ログで使う送信元 IP を取得します。
// 本番では CDN / リバースプロキシ配下になることが多いため、
// 代表的なヘッダーを順番に見て、最後まで取れなければ "unknown" にします。
export function getIpFromHeaders(headers: HeaderLike) {
    const safeHeaders = toHeaders(headers);

    return (
        firstForwardedIp(safeHeaders.get("x-forwarded-for")) ??
        firstForwardedIp(safeHeaders.get("cf-connecting-ip")) ??
        firstForwardedIp(safeHeaders.get("x-real-ip")) ??
        "unknown"
    );
}
