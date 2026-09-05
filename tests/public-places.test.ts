import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../features/public/shops/server/placesSearchRoute";

test("公開Places APIは設定済みでも外部へ通信しない", async (t) => {
    t.mock.method(globalThis, "fetch", () => { throw Error("unexpected external request"); });
    const previousKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "test-configured-key";
    t.after(() => {
        if (previousKey === undefined) delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
        else process.env.GOOGLE_MAPS_SERVER_API_KEY = previousKey;
    });
    const response = await GET(new Request("http://localhost/api/places/search?q=Tokyo"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.available, false);
    assert.deepEqual(body.places, []);
});

test("公開Places APIの検索語バリデーションは維持する", async () => {
    const response = await GET(new Request("http://localhost/api/places/search?q=a"));
    assert.equal(response.status, 400);
});
