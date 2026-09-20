import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeStoredImageUrl } from "../lib/storage/image-url-policy";

test("自店舗・許可済みストア・HTTPSの画像だけを許可する", (t) => {
    const originalToken = process.env.BLOB_READ_WRITE_TOKEN;
    const originalPrefixes = process.env.ALLOWED_IMAGE_URL_PREFIXES;
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_ownstore_testtoken";
    process.env.ALLOWED_IMAGE_URL_PREFIXES = "";
    t.after(() => {
        if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
        else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
        if (originalPrefixes === undefined) delete process.env.ALLOWED_IMAGE_URL_PREFIXES;
        else process.env.ALLOWED_IMAGE_URL_PREFIXES = originalPrefixes;
    });
    const args = { kind: "menu" as const, shopId: "shop-a" };
    const origin = "https://ownstore.public.blob.vercel-storage.com";
    const valid = `${origin}/menu-images/shop-a/123-random.jpg`;
    assert.equal(sanitizeStoredImageUrl(valid, args), valid);
    for (const invalid of [valid.replace("https:", "http:"), valid.replace("ownstore", "anotherstore"),
        valid.replace("shop-a", "shop-b"), `${origin}/extra/menu-images/shop-a/image.jpg`,
        `${origin}/menu-images/shop-a/sub/image.jpg`, valid + "?download=1", valid + "#fragment",
        valid.replace("https://", "https://user:password@"), valid.replace(".jpg", ".svg"),
        `${origin}.evil.example/menu-images/shop-a/image.jpg`]) {
        assert.equal(sanitizeStoredImageUrl(invalid, args), null, invalid);
    }
    const cover = `${origin}/shops/shop-a/cover-123-random.png`;
    assert.equal(sanitizeStoredImageUrl(cover, { kind: "shop", shopId: "shop-a" }), cover);
    assert.equal(sanitizeStoredImageUrl(cover, args), null);
    delete process.env.BLOB_READ_WRITE_TOKEN;
    assert.equal(sanitizeStoredImageUrl(valid, args), null);
    process.env.ALLOWED_IMAGE_URL_PREFIXES = origin;
    assert.equal(sanitizeStoredImageUrl(valid, args), valid);
    process.env.ALLOWED_IMAGE_URL_PREFIXES = `${origin}/menu-images/shop-a`;
    assert.equal(sanitizeStoredImageUrl(valid, args), valid);
    assert.equal(sanitizeStoredImageUrl(cover, { kind: "shop", shopId: "shop-a" }), null);
    process.env.ALLOWED_IMAGE_URL_PREFIXES = `${origin}/menu-images/shop`;
    assert.equal(sanitizeStoredImageUrl(valid, args), null);
    process.env.ALLOWED_IMAGE_URL_PREFIXES = origin + ".evil.example";
    assert.equal(sanitizeStoredImageUrl(valid, args), null);
});
