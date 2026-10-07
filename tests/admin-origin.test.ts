import assert from "node:assert/strict";
import test from "node:test";
import { enforceSameOriginAdminMutation } from "../lib/auth/admin-api-security";

function check(origin: string | null, headers: Record<string, string> = {}, url = "https://app.example/api/admin/shop") {
    return enforceSameOriginAdminMutation(new Request(url, {
        method: "PUT",
        headers: { ...(origin === null ? {} : { origin }), ...headers },
    }));
}

test("管理更新はscheme・host・portが一致するoriginだけ許可する", () => {
    assert.equal(check("https://app.example"), null);
    assert.equal(check("https://app.example", { host: "app.example:443" }), null);
    assert.equal(check("http://localhost:3000", {}, "http://localhost:3000/api/admin/shop"), null);
    for (const origin of ["http://app.example", "https://other.example", "https://app.example:444"]) {
        assert.equal(check(origin)?.status, 403);
    }
});

test("欠損・不正・複数値・URLの追加要素を持つOriginを拒否する", () => {
    for (const origin of [null, "null", "invalid", "https://app.example/", "https://app.example?x=1", "https://app.example#x", "https://user@app.example", "https://app.example, https://other.example"]) {
        assert.equal(check(origin)?.status, 403, String(origin));
    }
});

test("任意のforwardedヘッダーは許可originを追加しない", () => {
    assert.equal(check("https://other.example", { "x-forwarded-host": "other.example" })?.status, 403);
    assert.equal(check("http://app.example", { "x-forwarded-proto": "http" })?.status, 403);
    assert.equal(check("https://app.example", { host: "app.example", "x-forwarded-host": "app.example", "x-forwarded-proto": "https" }), null);
});

test("Next.jsの内部bind名より保持された公開Hostを使う", () => {
    assert.equal(check("https://app.example", { host: "app.example" }, "https://0.0.0.0:3000/api/admin/shop"), null);
    assert.equal(check("http://127.0.0.1:3000", { host: "127.0.0.1:3000" }, "http://localhost:3000/api/admin/shop"), null);
    assert.equal(check("https://app.example", { host: "other.example" })?.status, 403);
    for (const host of ["app.example, other.example", "user@app.example", "app.example/path", "app.example?x=1"]) {
        assert.equal(check("https://app.example", { host })?.status, 403);
    }
});

test("読み取りメソッドはOriginを要求しない", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
        assert.equal(enforceSameOriginAdminMutation(new Request("https://app.example", { method })), null);
    }
});
