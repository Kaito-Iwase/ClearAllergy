import assert from "node:assert/strict";
import test from "node:test";
import { consumeRateLimit } from "../lib/utils/rate-limit";
import { getIpFromHeaders } from "../lib/utils/request-ip";

test("回数上限と期限後の再開を守る", (t) => {
    let now = 1_000_000;
    t.mock.method(Date, "now", () => now);
    const args = { key: "window", limit: 2, windowMs: 1000 };
    assert.equal(consumeRateLimit(args).allowed, true);
    assert.equal(consumeRateLimit(args).allowed, true);
    assert.deepEqual(consumeRateLimit(args), { allowed: false, remaining: 0, retryAfterSeconds: 1 });
    now += 1000;
    assert.equal(consumeRateLimit(args).allowed, true);
});

test("識別子の大量変更でもメモリは有界で既存制限を失わず、期限後に回収する", (t) => {
    let now = 2_000_000;
    t.mock.method(Date, "now", () => now);
    for (let i = 0; i < 10_000; i++) {
        assert.equal(consumeRateLimit({ key: `bounded-${i}`, limit: 1, windowMs: 60_000 }).allowed, true);
    }
    assert.equal(consumeRateLimit({ key: "overflow", limit: 1, windowMs: 60_000 }).allowed, false);
    assert.equal(consumeRateLimit({ key: "bounded-0", limit: 1, windowMs: 60_000 }).allowed, false);
    now += 60_000;
    assert.equal(consumeRateLimit({ key: "after-cleanup", limit: 1, windowMs: 60_000 }).allowed, true);
});

test("IPヘッダーはVercel境界でのみ使用し不正値を採用しない", (t) => {
    const previous = process.env.VERCEL;
    t.after(() => { if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous; });
    delete process.env.VERCEL;
    assert.equal(getIpFromHeaders({ "x-forwarded-for": "192.0.2.1" }), "unknown");
    process.env.VERCEL = "1";
    assert.equal(getIpFromHeaders({ "x-forwarded-for": "192.0.2.1, 192.0.2.2" }), "192.0.2.1");
    assert.equal(getIpFromHeaders({ "x-forwarded-for": "2001:db8::1" }), "2001:db8::1");
    assert.equal(getIpFromHeaders({ "x-forwarded-for": "not-an-ip", "x-real-ip": "192.0.2.2" }), "unknown");
});
