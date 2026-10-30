import assert from "node:assert/strict";
import test from "node:test";
import { parseUploadedImageUrl } from "../lib/validators/upload-response";

test("upload response accepts an HTTPS URL and rejects malformed values", () => {
    const good = "https://fixture.public.blob.vercel-storage.com/menu-images/shop-a/image.png";
    assert.equal(parseUploadedImageUrl({ url: good }), good);
    assert.equal(parseUploadedImageUrl({ url: `  ${good}  ` }), good);
    for (const payload of [null, undefined, 42, [], {}, { url: null }, { url: 42 }, { url: true },
        { url: [] }, { url: {} }, { url: "" }, { url: "   " }, { url: "not-a-url" },
        { url: "http://fixture.invalid/image.png" }, { url: "https://user:pass@fixture.invalid/a" },
        { url: "https://fixture.invalid:8443/a" }, { url: "https://fixture.invalid/a?token=secret" },
        { url: "https://fixture.invalid/a#fragment" }, { url: `https://fixture.invalid/${"a".repeat(2048)}` }]) {
        assert.equal(parseUploadedImageUrl(payload), null);
    }
});
