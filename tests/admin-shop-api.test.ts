import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Module, { createRequire } from "node:module";
import { prisma } from "../lib/db";

// Keep the real route, ownership resolution, input validation and image policy.
// Only request-scoped Clerk calls, Prisma I/O and Next's cache are replaced.
let clerkUserId: string | null = "clerk-shop-a";
let authCalls = 0;
const revalidatedPaths: string[] = [];
let refreshFails = false;
const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
const requireForTest = createRequire(import.meta.url);
let route: typeof import("../features/admin/shop/server/adminShopRoute");
try {
    loader._load = function (id, ...args) {
        if (id === "next/cache") return { revalidatePath: (path: string) => { if (refreshFails) throw new Error("fixture refresh failure"); revalidatedPaths.push(path); } };
        if (id === "@clerk/nextjs/server") return {
            auth: async () => { authCalls++; return { userId: clerkUserId }; },
            currentUser: async () => ({ publicMetadata: {}, externalId: null }),
        };
        return originalLoad.call(this, id, ...args);
    };
    route = requireForTest("../features/admin/shop/server/adminShopRoute.ts");
} finally { loader._load = originalLoad; }

type Query = { where?: Record<string, unknown>; data?: Record<string, unknown> };
const origin = "https://fixture.public.blob.vercel-storage.com";
const existing = {
    id: "shop-a", name: "架空店舗A", description: "以前の説明", address: null,
    prefecture: null, city: null, nearestStation: null, category: null,
    latitude: null, longitude: null, googlePlaceId: null, hours: null,
    regularHoliday: null, phoneNumber: null, note: null, averageBudgetYen: null,
    coverImageUrl: null, coverImageFrame: "wide", coverImageFit: "contain",
    coverImagePosition: "top", coverImageZoom: 125, coverImagePositionX: 25, coverImagePositionY: 75,
    updatedAt: new Date("2026-10-15T00:00:00.000Z"), ownerClerkUserId: "clerk-shop-a", isActive: true,
};

function replace(t: TestContext, target: object, key: string, replacement: unknown) {
    const object = target as Record<string, unknown>;
    const previous = object[key];
    object[key] = replacement;
    t.after(() => { object[key] = previous; });
}

function setup(t: TestContext) {
    clerkUserId = "clerk-shop-a";
    authCalls = 0;
    revalidatedPaths.length = 0;
    refreshFails = false;
    for (const [key, value] of Object.entries({ PORTFOLIO_MODE: "false", PORTFOLIO_EDITOR_APP_USER_IDS: "", ALLOWED_IMAGE_URL_PREFIXES: origin })) {
        const previous = process.env[key]; process.env[key] = value;
        t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
    }
    const writes: Query[] = [];
    const audits: Query[] = [];
    const state = { ...existing };
    replace(t, prisma.user, "findUnique", async ({ where }: Query) => {
        assert.deepEqual(where, { clerkUserId: "clerk-shop-a" });
        return { id: "app-shop-a", clerkUserId: "clerk-shop-a", shop: null };
    });
    replace(t, prisma.shop, "findFirst", async ({ where }: Query) => {
        assert.deepEqual(where, { ownerClerkUserId: "clerk-shop-a", isActive: true });
        return { id: "shop-a", ownerClerkUserId: "clerk-shop-a", isActive: true };
    });
    replace(t, prisma.shop, "findUnique", async ({ where }: Query) => {
        assert.deepEqual(where, { id: "shop-a" });
        return { ...state };
    });
    replace(t, prisma.shop, "update", async (args: Query) => {
        assert.equal(args.where?.id, "shop-a", "No read or write may target shop B");
        if ((args.where?.updatedAt instanceof Date && args.where.updatedAt.getTime() !== state.updatedAt.getTime())
            || (args.where?.ownerClerkUserId !== undefined && args.where.ownerClerkUserId !== state.ownerClerkUserId)
            || (args.where?.isActive !== undefined && args.where.isActive !== state.isActive)) {
            throw Object.assign(new Error("fixture conditional write did not match"), { code: "P2025" });
        }
        writes.push(args);
        Object.assign(state, args.data, { updatedAt: args.data?.updatedAt ?? new Date(state.updatedAt.getTime() + 1) });
        return { ...state, menus: [{ id: "own-public-menu" }] };
    });
    replace(t, prisma.auditLog, "create", async (args: Query) => { audits.push(args); return {}; });
    return { writes, audits, state };
}

function request(method: "GET" | "PUT", body?: unknown, requestOrigin = "http://localhost", query = "") {
    return new Request(`http://localhost/api/admin/shop${query}`, { method,
        headers: { Origin: requestOrigin, "Content-Type": "application/json" },
        ...(method === "PUT" ? { body: typeof body === "string" ? body : JSON.stringify(body && typeof body === "object" && !Array.isArray(body) ? { expectedUpdatedAt: existing.updatedAt.toISOString(), ...body } : body) } : {}),
    });
}

test("店舗APIは未認証をDB参照前に拒否し、稼働する所有店舗なしでは更新しない", async (t) => {
    const { writes } = setup(t);
    clerkUserId = null;
    replace(t, prisma.user, "findUnique", async () => assert.fail("Unauthenticated request must not read DB"));
    assert.equal((await route.GET(request("GET"))).status, 401);
    assert.equal((await route.PUT(request("PUT", { name: "変更" }))).status, 401);
    assert.deepEqual(writes, []);
});

test("店舗保存は旧clientの版なしを428、不正な版を400で拒否する", async (t) => {
    const { writes } = setup(t);
    assert.equal((await route.PUT(request("PUT", { name: "店", expectedUpdatedAt: undefined }))).status, 428);
    for (const expectedUpdatedAt of [null, 3, "not-a-date", "2026-99-01T00:00:00.000Z"]) {
        assert.equal((await route.PUT(request("PUT", { name: "店", expectedUpdatedAt }))).status, 400);
    }
    assert.deepEqual(writes, []);
});

test("同じ初期版の備考訂正と電話変更は両順序とも後着全量保存を拒否する", async (t) => {
    for (const correctionFirst of [true, false]) {
        await t.test(correctionFirst ? "備考訂正が先" : "電話変更が先", async (child) => {
            const { writes, state } = setup(child);
            const correction = { name: existing.name, note: "訂正した備考", phoneNumber: null };
            const phone = { name: existing.name, note: null, phoneNumber: "000-1111-2222" };
            const first = correctionFirst ? correction : phone;
            const second = correctionFirst ? phone : correction;
            assert.equal((await route.PUT(request("PUT", first))).status, 200);
            assert.equal((await route.PUT(request("PUT", second))).status, 409);
            assert.equal(state.note, first.note);
            assert.equal(state.phoneNumber, first.phoneNumber);
            assert.equal(writes.length, 1);
        });
    }
});

test("事前読取後に店舗所有者が変わっても最終書込条件で拒否する", async (t) => {
    const { state, writes } = setup(t);
    replace(t, prisma.shop, "findUnique", async () => {
        const read = { ...state };
        state.ownerClerkUserId = "clerk-shop-b";
        return read;
    });
    assert.equal((await route.PUT(request("PUT", { name: "無効な更新" }))).status, 409);
    assert.equal(state.name, existing.name);
    assert.deepEqual(writes, []);
});

test("読取後の競合は最終条件で拒否し、同一時刻でも保存tokenが単調に進む", async (t) => {
    const { state, writes } = setup(t);
    const concurrentRead = { ...state };
    replace(t, prisma.shop, "findUnique", async () => ({ ...concurrentRead }));
    const results = await Promise.all([
        route.PUT(request("PUT", { name: "同時A" })),
        route.PUT(request("PUT", { name: "同時B" })),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(writes.length, 1);
    assert.ok(state.updatedAt.getTime() > existing.updatedAt.getTime());
});

test("DB確定後の公開反映例外は保存済み200とpendingを返し失敗監査にしない", async (t) => {
    const { state, audits } = setup(t);
    t.mock.method(console, "error", () => {});
    refreshFails = true;
    const result = await route.PUT(request("PUT", { name: "確定した店舗名" }));
    assert.equal(state.name, "確定した店舗名");
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.equal(body.shop.name, "確定した店舗名");
    assert.equal(body.publicRefreshPending, true);
    assert.equal(audits.filter((a) => a.data?.success === true).length, 1);
    assert.equal(audits.filter((a) => a.data?.success === false).length, 0);
});

test("時計が進まない/後退しても連続保存で同じtokenを再利用しない", async (t) => {
    const { state } = setup(t);
    t.mock.method(Date, "now", () => existing.updatedAt.getTime() - 1000);
    const first = await route.PUT(request("PUT", { name: "一回目" }));
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(state.updatedAt.getTime(), existing.updatedAt.getTime() + 1);
    const second = await route.PUT(request("PUT", { name: "二回目", expectedUpdatedAt: firstBody.shop.updatedAt }));
    assert.equal(second.status, 200);
    assert.equal(state.updatedAt.getTime(), existing.updatedAt.getTime() + 2);
    assert.equal((await route.PUT(request("PUT", { name: "古い再送" }))).status, 409);
});

test("所有店舗なしと閲覧専用利用者は店舗更新を403で拒否する", async (t) => {
    const { writes } = setup(t);
    const original = prisma.shop.findFirst;
    replace(t, prisma.shop, "findFirst", async () => null);
    assert.equal((await route.PUT(request("PUT", { name: "変更" }))).status, 403);
    replace(t, prisma.shop, "findFirst", original);
    process.env.PORTFOLIO_MODE = "true";
    assert.equal((await route.PUT(request("PUT", { name: "変更" }))).status, 403);
    assert.deepEqual(writes, []);
});

test("店舗APIは別Originを認証前に拒否する", async (t) => {
    const { writes } = setup(t);
    assert.equal((await route.PUT(request("PUT", { name: "変更" }, "https://foreign.invalid"))).status, 403);
    assert.equal(authCalls, 0);
    assert.deepEqual(writes, []);
});

test("店舗取得・更新は本文やqueryの他店舗IDを採用せず本人店舗だけを操作する", async (t) => {
    const { writes, audits } = setup(t);
    const read = await route.GET(request("GET", undefined, undefined, "?shopId=shop-b"));
    assert.equal(read.status, 200);
    assert.equal((await read.json()).shop.id, "shop-a");
    const response = await route.PUT(request("PUT", {
        name: "  更新した架空店舗A  ", shopId: "shop-b", userId: "app-shop-b", ownerClerkUserId: "clerk-shop-b", isActive: false,
    }));
    assert.equal(response.status, 200);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].data?.name, "更新した架空店舗A");
    for (const key of ["shopId", "userId", "ownerClerkUserId", "isActive"]) assert.equal(writes[0].data?.[key], undefined);
    assert.equal(writes[0].data?.description, null, "This is full-form saving; omitted optional text becomes null");
    assert.equal(writes[0].data?.coverImageFit, "contain");
    assert.equal(writes[0].data?.coverImageZoom, 125);
    const body = await response.json();
    assert.equal(body.shop.id, "shop-a");
    assert.equal(body.shop.menus, undefined);
    assert.ok(revalidatedPaths.includes("/shops/shop-a"));
    assert.ok(revalidatedPaths.includes("/shops/shop-a/menus/own-public-menu"));
    assert.equal(audits.at(-1)?.data?.success, true);
});

test("店舗APIはJSON形状・必須名・文字数・予算・位置情報の不正を保存前に拒否する", async (t) => {
    const { writes } = setup(t);
    for (const input of [
        "{", "null", "[]", { name: 42 }, { name: "   " }, { name: "a".repeat(121) },
        { name: "店", averageBudgetYen: -1 }, { name: "店", averageBudgetYen: 1.5 },
        { name: "店", latitude: 91, longitude: 139, googlePlaceId: "place" },
        { name: "店", latitude: 35 }, { name: "店", latitude: 35, longitude: 139 },
        { name: "店", prefecture: "unknown" }, { name: "店", coverImageZoom: 251 },
    ]) assert.equal((await route.PUT(request("PUT", input))).status, 400);
    assert.deepEqual(writes, []);
    assert.deepEqual(revalidatedPaths, []);
});

test("店舗APIは他店舗の画像URLを拒否し本人店舗の画像URLを保存する", async (t) => {
    const { writes } = setup(t);
    assert.equal((await route.PUT(request("PUT", { name: "店", coverImageUrl: `${origin}/shops/shop-b/cover-fixture.png` }))).status, 400);
    assert.equal(writes.length, 0);
    const coverImageUrl = `${origin}/shops/shop-a/cover-fixture.png`;
    assert.equal((await route.PUT(request("PUT", { name: "店", coverImageUrl }))).status, 200);
    assert.equal(writes[0].data?.coverImageUrl, coverImageUrl);
});

test("店舗更新のDB失敗は500となり秘密情報・成功レスポンス・再検証を出さない", async (t) => {
    const { audits } = setup(t);
    replace(t, prisma.shop, "update", async () => { throw new Error("postgresql://private:fixture-password@private.invalid/database"); });
    const logs: unknown[] = [];
    t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
    const response = await route.PUT(request("PUT", { name: "店" }));
    assert.equal(response.status, 500);
    const payload = await response.text();
    assert.ok(!payload.includes("fixture-password"));
    assert.ok(!payload.includes("stack"));
    assert.ok(!JSON.stringify(logs).includes("fixture-password"));
    assert.equal(audits.at(-1)?.data?.success, false);
    assert.deepEqual(revalidatedPaths, []);
});
