import { isIP } from "node:net";

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
    return first && isIP(first) ? first : null;
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
// Vercel が上書きする x-forwarded-for だけを信頼します。他の配備環境は
// proxyの信頼設定を確認するまでは共通の unknown バケットへ安全側に倒します。
export function getIpFromHeaders(headers: HeaderLike) {
    if (process.env.VERCEL !== "1") return "unknown";
    const safeHeaders = toHeaders(headers);

    return firstForwardedIp(safeHeaders.get("x-forwarded-for")) ?? "unknown";
}
