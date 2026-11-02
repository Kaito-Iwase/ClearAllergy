// The server still validates the allowed Blob store and ownership on save.
export function parseUploadedImageUrl(payload: unknown): string | null {
    if (!payload || typeof payload !== "object" || !("url" in payload) || typeof payload.url !== "string") return null;
    const value = payload.url.trim();
    if (!value || value.length > 2048) return null;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return null;
        return value;
    } catch {
        return null;
    }
}
