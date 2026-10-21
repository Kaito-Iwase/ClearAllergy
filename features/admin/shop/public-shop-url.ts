function parseBaseUrl(value: string | undefined) {
    try {
        const url = new URL(value?.trim() || "");
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
            url.pathname !== '/' || url.search || url.hash) return null;
        return url;
    } catch {
        return null;
    }
}

function isLocalHost(hostname: string) {
    const host = hostname.toLowerCase().replace(/\.$/, "");
    return host === "localhost" || host.endsWith(".localhost") ||
        host === "0.0.0.0" || /^127\.\d+\.\d+\.\d+$/.test(host) ||
        host === "[::1]" || host === "[::]" || /^\[::ffff:7f[\da-f]{2}:[\da-f]{1,4}\]$/.test(host);
}

// A stale local-development setting must not override the origin of a public site.
// Keep an explicit public canonical origin, and allow local URLs during local development.
export function getPublicShopUrl(shopId: string, currentOrigin: string, configuredBase?: string) {
    if (!shopId.trim()) return null;
    const current = parseBaseUrl(currentOrigin);
    if (!current) return null;
    const configured = parseBaseUrl(configuredBase);
    const base = configured && (!isLocalHost(configured.hostname) || isLocalHost(current.hostname))
        ? configured : current;
    return `${base.origin}/shops/${encodeURIComponent(shopId)}`;
}
