import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Module, { createRequire } from "node:module";
import { prisma } from "../lib/db";

let clerkUserId: string | null = null;
let clerkSessionId: string | null = null;
let authCalls = 0;
const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
const requireForTest = createRequire(import.meta.url);
let loginRoute: typeof import("../features/admin/auth/server/adminLoginRoute");
let ssoRoute: typeof import("../features/admin/auth/server/adminSsoRoute");
try {
    loader._load = function (id, ...args) {
        if (id === "@clerk/nextjs/server") return {
            auth: async () => { authCalls++; return { userId: clerkUserId, sessionId: clerkSessionId }; },
        };
        return originalLoad.call(this, id, ...args);
    };
    loginRoute = requireForTest("../features/admin/auth/server/adminLoginRoute.ts");
    ssoRoute = requireForTest("../features/admin/auth/server/adminSsoRoute.ts");
} finally {
    loader._load = originalLoad;
}

type AuditRecord = {
    action: string;
    success: boolean;
    actorUserId: string | null;
    actorShopId: string | null;
    metadata: Record<string, unknown>;
};

function replace(t: TestContext, target: object, key: string, value: unknown) {
    const delegate = target as Record<string, unknown>;
    const old = delegate[key];
    delegate[key] = value;
    t.after(() => { delegate[key] = old; });
}

function setup(t: TestContext) {
    clerkUserId = null;
    clerkSessionId = null;
    authCalls = 0;
    (globalThis as typeof globalThis & { __clearAllergyRateLimitStore: Map<string, unknown> }).__clearAllergyRateLimitStore.clear();
    const logs: AuditRecord[] = [];
    let dbReads = 0;
    replace(t, prisma.user, "findUnique", async ({ where }: { where: { clerkUserId: string } }) => {
        dbReads++;
        assert.equal(where.clerkUserId, clerkUserId);
        return { id: "app-owner", clerkUserId, shop: { id: "owned-shop" } };
    });
    replace(t, prisma.auditLog, "create", async ({ data }: { data: AuditRecord }) => { logs.push(data); return {}; });
    return { logs, dbReads: () => dbReads };
}

function request(path: "login" | "sso", body: unknown, origin = "https://app.example") {
    return new Request(`https://app.example/api/admin/auth/${path}`, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

const loginSuccess = { mode: "result", email: "claimed@example.invalid", success: true, reason: "private-client-value" };
const ssoSuccess = { provider: "google", stage: "success", reason: "private-client-value" };

test("未認証の成功申告はlogin・SSOとも401、監査書込とDB読取を行わない", async (t) => {
    const state = setup(t);
    assert.equal((await loginRoute.POST(request("login", loginSuccess))).status, 401);
    assert.equal((await ssoRoute.POST(request("sso", ssoSuccess))).status, 401);
    assert.equal(state.logs.length, 0);
    assert.equal(state.dbReads(), 0);
});

test("サーバー確認済みセッションだけ記録し、同一セッションの反復通知を抑える", async (t) => {
    const { logs } = setup(t);
    clerkUserId = "clerk-owner";
    clerkSessionId = "session-private-value";
    assert.equal((await loginRoute.POST(request("login", loginSuccess))).status, 204);
    assert.equal((await ssoRoute.POST(request("sso", ssoSuccess))).status, 204);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].action, "auth_session_verified");
    assert.equal(logs[0].success, true);
    assert.equal(logs[0].actorUserId, "app-owner");
    assert.equal(logs[0].actorShopId, "owned-shop");
    assert.equal(logs[0].metadata.source, "server_session");
    assert.equal(logs[0].metadata.entrypoint, "password");
    assert.doesNotMatch(JSON.stringify(logs), /claimed@example|private-client-value|session-private-value/);
});

test("Clerkのみの利用者もサーバー取得した識別子で記録できる", async (t) => {
    const { logs } = setup(t);
    clerkUserId = "user_unassigned";
    clerkSessionId = "session-unassigned";
    replace(t, prisma.user, "findUnique", async () => null);
    assert.equal((await ssoRoute.POST(request("sso", ssoSuccess))).status, 204);
    assert.equal(logs[0].actorUserId, null);
    assert.equal(logs[0].metadata.source, "server_session");
    assert.equal(logs[0].metadata.entrypoint, "google");
    assert.equal(logs[0].metadata.actorClerkUserId, "user_unassigned");
});

test("sessionIdがない状態を認証成功として記録しない", async (t) => {
    const { logs } = setup(t);
    clerkUserId = "clerk-pending";
    assert.equal((await loginRoute.POST(request("login", loginSuccess))).status, 401);
    assert.equal(logs.length, 0);
});

test("失敗・開始通知はクライアント申告と区別しメールや自由入力理由を保存しない", async (t) => {
    const { logs } = setup(t);
    assert.equal((await loginRoute.POST(request("login", { ...loginSuccess, success: false }))).status, 204);
    assert.equal((await ssoRoute.POST(request("sso", { ...ssoSuccess, stage: "start" }))).status, 204);
    assert.equal((await ssoRoute.POST(request("sso", { ...ssoSuccess, stage: "failure" }))).status, 204);
    assert.equal(logs.length, 3);
    assert.ok(logs.every((entry) => !entry.success && entry.metadata.source === "client_report"));
    assert.doesNotMatch(JSON.stringify(logs), /claimed@example|private-client-value/);
});

test("result通知も上限を適用し429以降は監査DBに書き込まない", async (t) => {
    const { logs } = setup(t);
    for (let i = 0; i < 30; i++) {
        assert.equal((await loginRoute.POST(request("login", { ...loginSuccess, success: false }))).status, 204);
    }
    const rejected = await loginRoute.POST(request("login", { ...loginSuccess, success: false }));
    assert.equal(rejected.status, 429);
    assert.ok(Number(rejected.headers.get("Retry-After")) > 0);
    assert.equal(logs.length, 30);
});

test("不正JSONも両認証通知経路の共通上限を消費する", async (t) => {
    const state = setup(t);
    for (let i = 0; i < 30; i++) {
        const route = i % 2 ? loginRoute : ssoRoute;
        const path = i % 2 ? "login" : "sso";
        assert.equal((await route.POST(request(path, "{"))).status, 400);
    }
    assert.equal((await ssoRoute.POST(request("sso", ssoSuccess))).status, 429);
    assert.equal(state.logs.length, 0);
    assert.equal(authCalls, 0);
});

test("既存ログイン事前チェックの識別子上限を維持しパスワードを記録しない", async (t) => {
    const { logs } = setup(t);
    const body = { mode: "precheck", email: "fixture@example.invalid", password: "fixture-only-password" };
    for (let i = 0; i < 5; i++) assert.equal((await loginRoute.POST(request("login", body))).status, 204);
    assert.equal((await loginRoute.POST(request("login", body))).status, 429);
    assert.equal(logs.length, 0);
});

test("不正Originは認証・監査処理より先に拒否する", async (t) => {
    const { logs } = setup(t);
    assert.equal((await loginRoute.POST(request("login", loginSuccess, "https://other.example"))).status, 403);
    assert.equal((await ssoRoute.POST(request("sso", ssoSuccess, "https://other.example"))).status, 403);
    assert.equal(authCalls, 0);
    assert.equal(logs.length, 0);
});

test("セッション確認後の障害は内容を露出せずJSONエラーと安全な運用ログにする", async (t) => {
    const { logs } = setup(t);
    clerkUserId = "user_fixture";
    clerkSessionId = "session-fixture";
    replace(t, prisma.user, "findUnique", async () => { throw new Error("private-error-payload"); });
    const errors: unknown[] = [];
    t.mock.method(console, "error", (value: unknown) => { errors.push(value); });
    const response = await loginRoute.POST(request("login", loginSuccess));
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /private-error-payload/);
    assert.equal(logs.length, 0);
    assert.equal(errors.length, 1);
    assert.match(String(errors[0]), /auth\.login\.audit/);
    assert.doesNotMatch(String(errors[0]), /private-error-payload|session-fixture|user_fixture/);
});
