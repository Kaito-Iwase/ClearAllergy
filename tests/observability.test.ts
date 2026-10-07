import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { prisma } from "../lib/db";
import { writeAdminAuditLog } from "../lib/audit-log";
import { getRequestLogContext, logOperationalError, sanitizeAuditMetadata, withRequestObservability } from "../lib/observability";
import { onRequestError } from "../instrumentation";
import { GET as getAllergens } from "../app/api/allergens/route";

function capture(t: TestContext) {
    const logs: Record<string, unknown>[] = [];
    const raw: string[] = [];
    for (const method of ["info", "error"] as const) {
        t.mock.method(console, method, (message: string) => {
            raw.push(message);
            logs.push(JSON.parse(message));
        });
    }
    return { logs, raw };
}
function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}
function replace(t: TestContext, target: object, key: string, value: unknown) {
    const delegate = target as Record<string, unknown>;
    const previous = delegate[key];
    delegate[key] = value;
    t.after(() => { delegate[key] = previous; });
}

test("Hono内の未捕捉DB例外も秘密を含めずJSON500と追跡IDへ変換する", async (t) => {
    const { logs, raw } = capture(t);
    replace(t, prisma.allergen, "findMany", async () => {
        throw Object.assign(new Error("private-password postgresql://private-db"), { code: "P1001" });
    });
    const response = await getAllergens(new Request("https://example.test/api/allergens"));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Internal Server Error" });
    assert.equal(logs[0].operation, "api_unhandled");
    assert.equal(logs[0].category, "database");
    assert.equal(logs[1].requestId, response.headers.get("x-request-id"));
    assert.doesNotMatch(raw.join("\n"), /private-|postgresql/);
});

test("要求・例外の秘密情報を出力せず、予期しない例外は一般的な500応答になる", async (t) => {
    const { logs, raw } = capture(t);
    const error = Object.assign(new Error("secret-password postgresql://user:pass@private.db/query"), {
        code: "P1001", cause: "private cause", token: "private-token",
    });
    const handler = withRequestObservability("/api/items/[itemId]", () => { throw error; });
    const response = await handler(new Request("https://example.test/api/items/private-id?secret=query-secret", {
        method: "POST",
        headers: { authorization: "Bearer private-token", cookie: "session=private-cookie", "x-request-id": "attacker-request-id" },
        body: "private-body",
    }));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Internal Server Error" });
    assert.match(response.headers.get("x-request-id")!, /^[a-f\d-]{36}$/);
    assert.equal(logs.length, 2);
    assert.equal(logs[0].category, "database");
    assert.equal(logs[0].code, "P1001");
    assert.equal(logs[0].requestId, response.headers.get("x-request-id"));
    assert.equal(logs[1].requestId, logs[0].requestId);
    assert.equal(logs[1].route, "/api/items/[itemId]");
    assert.doesNotMatch(raw.join("\n"), /secret-password|postgresql|private-|query-secret|attacker-request-id/);
    assert.deepEqual(getRequestLogContext(), {});
});

test("同時要求を交差させてもAsyncLocalStorageの追跡IDと例外分類が混ざらない", async (t) => {
    const { logs } = capture(t);
    const bothStarted = deferred();
    const firstMayFinish = deferred();
    let started = 0;
    const seen = new Map<string, string>();
    const handler = withRequestObservability("/api/concurrent", async (req) => {
        const label = req.headers.get("case")!;
        const before = getRequestLogContext().requestId!;
        seen.set(label, before);
        if (++started === 2) bothStarted.resolve();
        await bothStarted.promise;
        if (label === "first") await firstMayFinish.promise;
        assert.equal(getRequestLogContext().requestId, before);
        logOperationalError(new Error("private"), {
            operation: `test.${label}`,
            category: label === "first" ? "database" : "external_service",
        });
        if (label === "second") firstMayFinish.resolve();
        return Response.json({ completed: true }, { status: label === "first" ? 503 : 502 });
    });
    const [first, second] = await Promise.all([
        handler(new Request("https://example.test/api/concurrent", { headers: { case: "first" } })),
        handler(new Request("https://example.test/api/concurrent", { headers: { case: "second" } })),
    ]);
    assert.notEqual(seen.get("first"), seen.get("second"));
    assert.equal(first.headers.get("x-request-id"), seen.get("first"));
    assert.equal(second.headers.get("x-request-id"), seen.get("second"));
    for (const [label, category] of [["first", "database"], ["second", "external_service"]]) {
        const relevant = logs.filter((event) => event.requestId === seen.get(label));
        assert.equal(relevant.length, 2);
        assert.ok(relevant.every((event) => event.category === category));
    }
    assert.deepEqual(getRequestLogContext(), {});
});

test("ラッパーは204/リダイレクト/本文・Cookie・Cache-Control等のレスポンス契約を維持する", async (t) => {
    capture(t);
    const empty = await withRequestObservability("/api/empty", () => new Response(null, {
        status: 204, headers: { "Cache-Control": "no-store" },
    }))(new Request("https://example.test/api/empty"));
    assert.equal(empty.status, 204);
    assert.equal(await empty.text(), "");
    assert.equal(empty.headers.get("cache-control"), "no-store");

    const redirect = await withRequestObservability("/api/redirect", () => Response.redirect("https://example.test/next", 307))(
        new Request("https://example.test/api/redirect"),
    );
    assert.equal(redirect.status, 307);
    assert.equal(redirect.headers.get("location"), "https://example.test/next");

    const headers = new Headers({ "Content-Type": "application/json", "Retry-After": "5", "Cache-Control": "private, no-store" });
    headers.append("Set-Cookie", "a=one; Path=/; HttpOnly");
    headers.append("Set-Cookie", "b=two; Path=/; Secure");
    const response = await withRequestObservability("/api/json", () => new Response('{"ok":true}', {
        status: 201, statusText: "Created", headers,
    }))(new Request("https://example.test/api/json"));
    assert.equal(response.status, 201);
    assert.equal(response.statusText, "Created");
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(response.headers.get("content-type"), "application/json");
    assert.equal(response.headers.get("retry-after"), "5");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(response.headers.getSetCookie(), ["a=one; Path=/; HttpOnly", "b=two; Path=/; Secure"]);
});

test("返されたエラー応答は認証・認可・入力・404・競合・回数制限を分類する", async (t) => {
    const { logs } = capture(t);
    for (const [status, category] of [[400, "validation"], [401, "authentication"], [403, "authorization"], [404, "not_found"], [409, "conflict"], [429, "rate_limit"], [500, "unexpected"]] as const) {
        const response = await withRequestObservability("/api/error", () => Response.json({ error: "test" }, { status }))(
            new Request("https://example.test/api/error"),
        );
        assert.equal(response.status, status);
        assert.equal(logs.at(-1)?.category, category);
        assert.equal(logs.at(-1)?.result, "failure");
    }
});

test("監査metadataは許可された状態とサーバー操作者IDだけを残し、任意の秘密情報を除く", () => {
    assert.deepEqual(sanitizeAuditMetadata({
        password: "secret", token: "secret", headers: { cookie: "secret" }, email: "private@example.test",
        requestId: "forged-id", reason: "secret", provider: "arbitrary-provider",
        isPublished: false, hasImage: true, changedFields: ["name", "password", "phoneNumber", 1],
        source: "server_session", actorClerkUserId: "user_valid123",
    }), {
        isPublished: false, hasImage: true, changedFields: ["name", "phoneNumber"],
        source: "server_session", actorClerkUserId: "user_valid123",
    });
    assert.deepEqual(sanitizeAuditMetadata({ actorClerkUserId: "user_private@example.test", source: "attacker" }), {});
    assert.deepEqual(sanitizeAuditMetadata({ reason: "menu_not_found", token: "secret" }), { reason: "menu_not_found" });
    for (const value of [null, [], "secret", 42]) assert.deepEqual(sanitizeAuditMetadata(value), {});
});

test("監査DBには同じサーバー追跡IDを保存し、リクエスト由来のIPや機密metadataは保存しない", async (t) => {
    capture(t);
    let stored: Record<string, unknown> | undefined;
    replace(t, prisma.auditLog, "create", async ({ data }: { data: Record<string, unknown> }) => { stored = data; return {}; });
    const handler = withRequestObservability("/api/audit", async (req) => {
        await writeAdminAuditLog({
            req, actorUserId: "app-user", actorShopId: "shop", action: "shop_update", targetType: "shop", targetId: "shop", success: true,
            metadata: { token: "private-token", email: "private@example.test", requestId: "forged", changedFields: ["name"] },
        });
        return new Response(null, { status: 204 });
    });
    const response = await handler(new Request("https://example.test/api/audit", { headers: { "X-Forwarded-For": "192.0.2.1", Cookie: "secret" } }));
    assert.equal(stored?.actorUserId, "app-user");
    assert.equal(stored?.targetId, "shop");
    assert.equal(stored?.ipAddress, undefined);
    assert.deepEqual(stored?.metadata, { changedFields: ["name"], requestId: response.headers.get("x-request-id"), route: "/api/audit" });
    assert.doesNotMatch(JSON.stringify(stored), /private|secret|192\.0\.2\.1|forged/);
});

test("補助監査のDB障害は本来の応答を失敗にせず、機密除去済みの障害ログを残す", async (t) => {
    const { logs, raw } = capture(t);
    replace(t, prisma.auditLog, "create", async () => { throw new Error("Can't reach database server password=private-secret"); });
    const response = await withRequestObservability("/api/write", async (req) => {
        await writeAdminAuditLog({ req, actorUserId: "app-user", actorShopId: "shop", action: "shop_update", targetType: "shop", targetId: "shop", success: true });
        return Response.json({ updated: true });
    })(new Request("https://example.test/api/write"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { updated: true });
    assert.equal(logs[0].event, "operation_failed");
    assert.equal(logs[0].category, "database");
    assert.equal(logs.at(-1)?.result, "success");
    assert.doesNotMatch(raw.join("\n"), /private-secret|password|Can't reach/);
});

test("Next instrumentationは要求URL/headers/例外本文を除きルート定義だけを記録する", async (t) => {
    const { logs, raw } = capture(t);
    const previous = process.env.NEXT_RUNTIME;
    process.env.NEXT_RUNTIME = "nodejs";
    t.after(() => {
        if (previous === undefined) delete process.env.NEXT_RUNTIME;
        else process.env.NEXT_RUNTIME = previous;
    });
    await onRequestError(new Error("private secret"), {
        path: "/shops/private-id?token=private-token", method: "GET", headers: { cookie: "private-cookie" },
    }, {
        routeType: "render", routePath: "/shops/[shopId]", routerKind: "App Router", revalidateReason: undefined,
    });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].operation, "next:render:/shops/[shopId]");
    assert.doesNotMatch(raw.join("\n"), /private|token|cookie/);
});
