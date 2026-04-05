type HeaderLike =
    | Headers
    | HeadersInit
    | Record<string, string | string[] | undefined>;

function firstForwardedIp(value: string | null) {
    if (!value) {
        return null;
    }

    const first = value.split(",")[0]?.trim();
    return first || null;
}

function toHeaders(headers: HeaderLike) {
    if (headers instanceof Headers) {
        return headers;
    }

    return new Headers(headers as HeadersInit);
}

export function getIpFromHeaders(headers: HeaderLike) {
    const safeHeaders = toHeaders(headers);

    return (
        firstForwardedIp(safeHeaders.get("x-forwarded-for")) ??
        firstForwardedIp(safeHeaders.get("cf-connecting-ip")) ??
        firstForwardedIp(safeHeaders.get("x-real-ip")) ??
        "unknown"
    );
}
