import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Module, { createRequire } from "node:module";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";

// Clerk's request context is replaced only in this isolated test process.
// The real application auth, ownership, validation and route code still run.
let clerkUserId: string | null = "clerk-owner";
const revalidatedPaths: string[] = [];
const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
const requireForTest = createRequire(import.meta.url);
let menuRoute: typeof import("../features/admin/menus/server/adminMenuRoute");
let menusRoute: typeof import("../features/admin/menus/server/adminMenusRoute");
try {
    loader._load = function (id, ...args) {
        if (id === "next/cache") return { revalidatePath: (path: string) => { revalidatedPaths.push(path); } };
        if (id === "@clerk/nextjs/server") {
            return {
                auth: async () => ({ userId: clerkUserId }),
                currentUser: async () => ({ publicMetadata: {}, externalId: null }),
            };
        }
        return originalLoad.call(this, id, ...args);
    };
    menuRoute = requireForTest("../features/admin/menus/server/adminMenuRoute.ts");
    menusRoute = requireForTest("../features/admin/menus/server/adminMenusRoute.ts");
} finally {
    loader._load = originalLoad;
}

type Args = { where?: Record<string, unknown>; data?: Record<string, unknown> };
function replace(t: TestContext, target: object, key: string, value: unknown) {
    const delegate = target as Record<string, unknown>;
    const old = delegate[key];
    delegate[key] = target === prisma.menuItem && key === "findFirst" ? async (...args: unknown[]) => {
        const result = await (value as (...args: unknown[]) => Promise<Record<string, unknown> | null>)(...args);
        return result ? { version: 0, foodVersion: 0, reviewedFoodVersion: null, ...result } : result;
    } : value;
    t.after(() => { delegate[key] = old; });
}
function setup(t: TestContext) {
    clerkUserId = "clerk-owner";
    revalidatedPaths.length = 0;
    const previousMode = process.env.PORTFOLIO_MODE;
    process.env.PORTFOLIO_MODE = "false";
    t.after(() => {
        if (previousMode === undefined) delete process.env.PORTFOLIO_MODE;
        else process.env.PORTFOLIO_MODE = previousMode;
    });
    replace(t, prisma.user, "findUnique", async ({ where }: Args) => {
        assert.deepEqual(where, { clerkUserId: "clerk-owner" });
        return { id: "app-owner", clerkUserId: "clerk-owner", shop: null };
    });
    replace(t, prisma.shop, "findFirst", async ({ where }: Args) => {
        assert.deepEqual(where, { ownerClerkUserId: "clerk-owner", isActive: true });
        return { id: "own-shop", ownerClerkUserId: "clerk-owner", isActive: true };
    });
    replace(t, prisma.menuItem, "findFirst", async ({ where }: Args) => {
        assert.equal(where?.shopId, "own-shop");
        return null;
    });
    replace(t, prisma.allergen, "findMany", async () => ALLERGEN_MASTER.map((a) => ({ ...a, id: a.slug })));
    replace(t, prisma.auditLog, "create", async () => ({}));
    replace(t, prisma, "$transaction", async () => { assert.fail("Unexpected database write"); });
}
function request(method: string, path = "/api/admin/menus/foreign-menu", body?: string, origin = "http://localhost") {
    if (method === "DELETE" && body === undefined) body = '{"expectedVersion":0}';
    if (method === "PUT" && body) {
        try { const parsed = JSON.parse(body); if (parsed && !Array.isArray(parsed) && typeof parsed === "object") body = JSON.stringify({ expectedVersion: 0, ...parsed }); } catch { /* Keep invalid JSON. */ }
    }
    return new Request(`http://localhost${path}`, {
        method,
        headers: { Origin: origin, "Content-Type": "application/json" },
        ...(body !== undefined ? { body } : {}),
    });
}

test("未ログインは管理メニューの取得・作成・更新・削除を401で拒否する", async (t) => {
    setup(t);
    clerkUserId = null;
    replace(t, prisma.user, "findUnique", async () => assert.fail("No DB read before authentication"));
    for (const [handler, req] of [
        [menuRoute.GET, request("GET")],
        [menuRoute.PUT, request("PUT", undefined, "{}")],
        [menuRoute.DELETE, request("DELETE")],
        [menusRoute.GET, request("GET", "/api/admin/menus")],
        [menusRoute.POST, request("POST", "/api/admin/menus", "{}")],
    ] as const) assert.equal((await handler(req)).status, 401);
});

test("他店舗のmenuIdは取得・更新・削除で404、本文のshopIdでは所有権を変更できない", async (t) => {
    setup(t);
    assert.equal((await menuRoute.GET(request("GET"))).status, 404);
    assert.equal((await menuRoute.PUT(request("PUT", undefined, '{"shopId":"foreign-shop","userId":"other"}'))).status, 404);
    assert.equal((await menuRoute.DELETE(request("DELETE"))).status, 404);
});

test("所有する稼働店舗がない場合は管理APIを403で拒否する", async (t) => {
    setup(t);
    replace(t, prisma.shop, "findFirst", async () => null);
    assert.equal((await menusRoute.POST(request("POST", "/api/admin/menus", "{}"))).status, 403);
});

test("閲覧専用のportfolio利用者は直接POSTしても403になる", async (t) => {
    setup(t);
    process.env.PORTFOLIO_MODE = "true";
    assert.equal((await menusRoute.POST(request("POST", "/api/admin/menus", "{}"))).status, 403);
});

test("壊れたJSON・不正な型は下書きを作らず400で拒否する", async (t) => {
    setup(t);
    for (const body of ["{", "null", "[]", '{"isPublished":"false"}', '{"description":42}']) {
        assert.equal((await menusRoute.POST(request("POST", "/api/admin/menus", body))).status, 400);
    }
});

test("未入力アレルゲンの公開要求は保存前に400で拒否する", async (t) => {
    setup(t);
    const response = await menusRoute.POST(request("POST", "/api/admin/menus", JSON.stringify({ name: "未確認", isPublished: true,
        foodReview: { evidenceRefs: "架空資料 v1", scope: "架空の全対象", checkedAt: "2026-10-08T00:00:00Z" },
    })));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /未設定|入力/);
});

test("全状態を入力しても食品確認記録なし・未解決事項ありの新規公開は拒否する", async (t) => {
    setup(t);
    const base = { name: "架空", isPublished: true, allergenStatusBySlug: Object.fromEntries(ALLERGEN_MASTER.map(a => [a.slug, "FREE"])) };
    for (const foodReview of [undefined, { evidenceRefs: "架空資料 v1", scope: "架空の全対象", checkedAt: "2026-10-08T00:00:00Z", unresolvedIssues: "未照合の別添" }]) {
        const response = await menusRoute.POST(request("POST", "/api/admin/menus", JSON.stringify({ ...base, foodReview })));
        assert.equal(response.status, 400);
        assert.match((await response.json()).error, /食品確認記録|未解決/);
    }
});

test("食品確認の不足・不正日時・5分を超える未来は書込前に拒否する", async (t) => {
    setup(t);
    const review = { evidenceRefs: "架空資料 v1", scope: "架空の全対象", checkedAt: "2026-10-08T00:00:00Z" };
    for (const foodReview of [{ ...review, evidenceRefs: " " }, { ...review, scope: "" }, { ...review, checkedAt: "invalid" }, { ...review, checkedAt: new Date(Date.now() + 10 * 60_000).toISOString() }]) {
        assert.equal((await menusRoute.POST(request("POST", "/api/admin/menus", JSON.stringify({ foodReview })))).status, 400);
    }
});

test("別originからの更新要求は認証・DB処理の前に拒否する", async (t) => {
    setup(t);
    replace(t, prisma.user, "findUnique", async () => assert.fail("Unexpected DB read"));
    assert.equal((await menuRoute.PUT(request("PUT", undefined, "{}", "https://other.example"))).status, 403);
});

test("PUTとDELETEは版なしを428、古い版を409で拒否して書き込まない", async (t) => {
    setup(t);
    replace(t, prisma.menuItem, "findFirst", async () => ({ id: "own-menu", name: "newer", version: 7, isPublished: false, allergenLinks: [] }));
    for (const method of ["PUT", "DELETE"] as const) {
        const raw = new Request("http://localhost/api/admin/menus/own-menu", { method, headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: "{}" });
        assert.equal((await menuRoute[method](raw)).status, 428);
        assert.equal((await menuRoute[method](request(method, "/api/admin/menus/own-menu", '{"expectedVersion":6}'))).status, 409);
    }
    assert.equal((await menuRoute.DELETE(new Request("http://localhost/api/admin/menus/own-menu", { method: "DELETE", headers: { Origin: "http://localhost" } }))).status, 428);
});

test("STOPは未認証・他店舗・異なるOriginを拒否する", async (t) => {
    setup(t);
    replace(t, prisma.menuItem, "update", async () => { throw recordNotFound(); });
    assert.equal((await menuRoute.STOP(request("POST", "/api/admin/menus/foreign-menu/stop"))).status, 404);
    assert.equal((await menuRoute.STOP(request("POST", "/api/admin/menus/foreign-menu/stop", undefined, "https://other.example"))).status, 403);
    clerkUserId = null;
    assert.equal((await menuRoute.STOP(request("POST", "/api/admin/menus/foreign-menu/stop"))).status, 401);
});

test("空objectの下書きは所有店舗に作成し、欠損状態をすべてUNKNOWNで保存する", async (t) => {
    setup(t);
    let savedLinks: { status: string }[] = [];
    replace(t, prisma, "$transaction", async (work: (tx: object) => Promise<unknown>) => work({
        $executeRaw: async () => 0,
        menuItem: { findFirstOrThrow: async () => ({ id: "new-menu", isPublished: false }), create: async ({ data }: Args) => {
            assert.equal(data?.shopId, "own-shop");
            assert.equal(data?.isPublished, false);
            return { id: "new-menu" };
        } },
        menuItemAllergen: { createMany: async ({ data }: { data: typeof savedLinks }) => { savedLinks = data; } },
    }));
    const response = await menusRoute.POST(request("POST", "/api/admin/menus", '{"shopId":"foreign-shop"}'));
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { id: "new-menu" });
    assert.equal(savedLinks.length, ALLERGEN_MASTER.length);
    assert.ok(savedLinks.every((link) => link.status === "UNKNOWN"));
});

test("公開メニューを部分更新してUNKNOWNにすると、保存結果は非公開となる", async (t) => {
    setup(t);
    replace(t, prisma.menuItem, "findFirst", async ({ where }: Args) => {
        assert.equal(where?.shopId, "own-shop");
        return {
            id: "own-menu", name: "テスト", isPublished: true, priceYen: null, imageUrl: null,
            allergenLinks: ALLERGEN_MASTER.map((a) => ({ allergen: { slug: a.slug }, status: "FREE" })),
        };
    });
    let storedPublication: unknown;
    replace(t, prisma, "$transaction", async (work: (tx: object) => Promise<unknown>) => work({
        $executeRaw: async () => 0,
        menuItem: { update: async ({ where, data }: Args) => {
            assert.deepEqual(where, { id: "own-menu", shopId: "own-shop", ...(where?.version !== undefined ? { version: 0 } : {}) });
            storedPublication = data?.isPublished;
            return { id: "own-menu", isPublished: storedPublication, version: 1, foodVersion: 1, reviewedFoodVersion: null };
        }, findFirstOrThrow: async () => ({ id: "own-menu", isPublished: false, version: 2, foodVersion: 1, reviewedFoodVersion: null }) },
        menuItemAllergen: { deleteMany: async () => ({}), createMany: async () => ({}) },
    }));
    const response = await menuRoute.PUT(request("PUT", "/api/admin/menus/own-menu", JSON.stringify({
        allergenStatusBySlug: { [ALLERGEN_MASTER[0].slug]: "UNKNOWN" },
    })));
    assert.equal(response.status, 200);
    assert.equal(storedPublication, false);
    assert.ok(revalidatedPaths.includes("/(public)/shops/[shopId]/menus/[menuId]"), "公開解除で他メニューの補足表示も再検証する");
    assert.equal((await response.json()).menu.isPublished, false);
});

test("DB保存に失敗した場合は成功IDを返さず500になる", async (t) => {
    setup(t);
    replace(t, prisma, "$transaction", async () => { throw new Error("simulated write failure"); });
    t.mock.method(console, "error", () => {});
    const response = await menusRoute.POST(request("POST", "/api/admin/menus", "{}"));
    assert.equal(response.status, 500);
    assert.equal((await response.json()).id, undefined);
});

test("自店舗メニューの削除は店舗条件付きで実行し既存の成功形を返す", async (t) => {
    setup(t);
    replace(t, prisma.menuItem, "findFirst", async ({ where }: Args) => {
        assert.deepEqual(where, { id: "own-menu", shopId: "own-shop" });
        return { id: "own-menu", isPublished: false };
    });
    replace(t, prisma, "$transaction", async (work: (tx: object) => Promise<unknown>) => work({
        menuItem: { delete: async ({ where }: Args) => {
            assert.deepEqual(where, { id: "own-menu", shopId: "own-shop", version: 0 });
            return { id: "own-menu" };
        } },
    }));
    const response = await menuRoute.DELETE(request("DELETE", "/api/admin/menus/own-menu"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
});

function setupMenuMovedAfterRead(t: TestContext) {
    setup(t);
    const initialLinks = ALLERGEN_MASTER.map((allergen) => ({
        allergen: { slug: allergen.slug },
        status: "FREE",
    }));
    const state = {
        shopId: "own-shop",
        name: "元のメニュー",
        links: initialLinks,
        deleted: false,
    };
    replace(t, prisma.menuItem, "findFirst", async ({ where }: Args) => {
        assert.deepEqual(where, { id: "own-menu", shopId: "own-shop" });
        if (state.shopId !== "own-shop") return null;
        state.shopId = "other-shop";
        return {
            id: "own-menu", name: state.name, isPublished: false,
            priceYen: null, imageUrl: null, allergenLinks: initialLinks,
        };
    });
    replace(t, prisma, "$transaction", async (work: (tx: object) => Promise<unknown>) => {
        const draft = { ...state, links: [...state.links] };
        const notFound = () => new Prisma.PrismaClientKnownRequestError(
            "record not found", { code: "P2025", clientVersion: Prisma.prismaVersion.client },
        );
        const result = await work({
            menuItem: {
                update: async ({ where, data }: Args) => {
                    if (where?.id !== "own-menu" || (where.shopId && where.shopId !== draft.shopId)) throw notFound();
                    draft.name = data?.name as string;
                    return { id: "own-menu", shopId: draft.shopId, name: draft.name, isPublished: false };
                },
                delete: async ({ where }: Args) => {
                    if (where?.id !== "own-menu" || (where.shopId && where.shopId !== draft.shopId)) throw notFound();
                    draft.deleted = true;
                    return { id: "own-menu" };
                },
            },
            menuItemAllergen: {
                deleteMany: async () => { draft.links = []; return { count: initialLinks.length }; },
                createMany: async ({ data }: { data: typeof initialLinks }) => { draft.links = data; return { count: data.length }; },
            },
        });
        Object.assign(state, draft);
        return result;
    });
    return { state, initialLinks };
}

test("PUTの事前取得後にメニューが別店舗へ移ったら404で変更しない", async (t) => {
    const { state, initialLinks } = setupMenuMovedAfterRead(t);
    const response = await menuRoute.PUT(request("PUT", "/api/admin/menus/own-menu", '{"name":"変更後"}'));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "menu not found" });
    assert.equal(state.shopId, "other-shop");
    assert.equal(state.name, "元のメニュー");
    assert.deepEqual(state.links, initialLinks);
    assert.equal(state.deleted, false);
});

test("DELETEの事前取得後にメニューが別店舗へ移ったら404でリンクも戻す", async (t) => {
    const { state, initialLinks } = setupMenuMovedAfterRead(t);
    const response = await menuRoute.DELETE(request("DELETE", "/api/admin/menus/own-menu"));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "menu not found" });
    assert.equal(state.shopId, "other-shop");
    assert.equal(state.name, "元のメニュー");
    assert.deepEqual(state.links, initialLinks);
    assert.equal(state.deleted, false);
});

function recordNotFound() {
    return new Prisma.PrismaClientKnownRequestError("fixture target no longer owned", {
        code: "P2025", clientVersion: Prisma.prismaVersion.client,
    });
}

for (const method of ["PUT", "DELETE"] as const) {
    test(`${method}: 事前取得後の店舗移転は404になり、成功監査・cache更新を行わない`, async (t) => {
        setup(t);
        t.mock.method(console, "error", () => {});
        let reads = 0;
        replace(t, prisma.menuItem, "findFirst", async () => ++reads > 1 ? null : ({
            id: "moved-menu", name: "original", priceYen: null, imageUrl: null, isPublished: true,
            allergenLinks: ALLERGEN_MASTER.map((a) => ({ allergen: { slug: a.slug }, status: "FREE" })),
        }));
        const auditResults: unknown[] = [];
        replace(t, prisma.auditLog, "create", async ({ data }: Args) => { auditResults.push(data?.success); return {}; });
        const finalWrite = async ({ where }: Args) => {
            assert.equal(where?.id, "moved-menu");
            if (where?.shopId === "own-shop") throw recordNotFound();
            return { id: "moved-menu", shopId: "other-shop", isPublished: false };
        };
        replace(t, prisma, "$transaction", async (work: (tx: object) => Promise<unknown>) => work({
            menuItem: { update: finalWrite, delete: finalWrite },
            menuItemAllergen: { deleteMany: async () => ({}), createMany: async () => ({}) },
        }));
        const response = await menuRoute[method](request(method, "/api/admin/menus/moved-menu", method === "PUT" ? '{"name":"changed"}' : undefined));
        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { error: "menu not found" });
        assert.ok(!auditResults.includes(true));
        assert.deepEqual(revalidatedPaths, []);
    });

    test(`${method}: 事前取得後に消失した対象のP2025は既存404になる`, async (t) => {
        setup(t);
        t.mock.method(console, "error", () => {});
        replace(t, prisma.menuItem, "findFirst", async () => ({
            id: "gone-menu", name: "original", priceYen: null, imageUrl: null, isPublished: false,
            allergenLinks: [],
        }));
        replace(t, prisma, "$transaction", async () => { replace(t, prisma.menuItem, "findFirst", async () => null); throw recordNotFound(); });
        const response = await menuRoute[method](request(method, "/api/admin/menus/gone-menu", method === "PUT" ? '{}' : undefined));
        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { error: "menu not found" });
    });
}
