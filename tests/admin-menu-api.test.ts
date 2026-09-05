import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Module, { createRequire } from "node:module";
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
    delegate[key] = value;
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
    assert.equal((await menusRoute.POST(request("POST", "/api/admin/menus", '{"name":"未確認","isPublished":true}'))).status, 400);
});

test("別originからの更新要求は認証・DB処理の前に拒否する", async (t) => {
    setup(t);
    replace(t, prisma.user, "findUnique", async () => assert.fail("Unexpected DB read"));
    assert.equal((await menuRoute.PUT(request("PUT", undefined, "{}", "https://other.example"))).status, 403);
});

test("空objectの下書きは所有店舗に作成し、欠損状態をすべてUNKNOWNで保存する", async (t) => {
    setup(t);
    let savedLinks: { status: string }[] = [];
    replace(t, prisma, "$transaction", async (work: (tx: object) => Promise<unknown>) => work({
        menuItem: { create: async ({ data }: Args) => {
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
        menuItem: { update: async ({ data }: Args) => {
            storedPublication = data?.isPublished;
            return { id: "own-menu", isPublished: storedPublication };
        } },
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
