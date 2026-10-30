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
let failRevalidation = false;
const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
const requireForTest = createRequire(import.meta.url);
let menuRoute: typeof import("../features/admin/menus/server/adminMenuRoute");
let menusRoute: typeof import("../features/admin/menus/server/adminMenusRoute");
try {
    loader._load = function (id, ...args) {
        if (id === "next/cache") return { revalidatePath: (path: string) => { if (failRevalidation) throw new Error("synthetic cache failure"); revalidatedPaths.push(path); } };
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
    failRevalidation = false;
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
    assert.equal((await menusRoute.GET(request("GET", "/api/admin/menus"))).status, 403);
    assert.equal((await menusRoute.POST(request("POST", "/api/admin/menus", "{}"))).status, 403);
});

test("一覧GETは自店舗の食品確認状態を返し、確認根拠・未解決本文は返さない", async (t) => {
    setup(t);
    replace(t, prisma.menuItem, "findMany", async ({ where }: Args) => {
        assert.deepEqual(where, { shopId: "own-shop" });
        return [{ id: "own-menu", name: "架空料理", category: null, priceYen: null,
            imageUrl: null, isPublished: false, version: 4, updatedAt: new Date("2026-10-15T00:00:00Z"),
            foodVersion: 2, reviewedFoodVersion: null, allergenLinks: [],
            foodReviews: [{ foodVersion: 2, unresolvedIssues: "非公開の仕入れ照合メモ" }],
        }];
    });
    const response = await menusRoute.GET(request("GET", "/api/admin/menus"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.menus[0].foodReviewState, "unresolved");
    assert.equal(body.menus[0].unknownAllergenNames.length, ALLERGEN_MASTER.length);
    assert.ok(!JSON.stringify(body).includes("非公開の仕入れ照合メモ"));
    assert.ok(!("foodReviews" in body.menus[0]));
    assert.ok(!("allergenLinks" in body.menus[0]));
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
    assert.match((await response.json()).error, /非公開で保存/);
});

test("全状態を入力しても食品確認記録なし・未解決事項ありの新規公開は拒否する", async (t) => {
    setup(t);
    const base = { name: "架空", isPublished: true, allergenStatusBySlug: Object.fromEntries(ALLERGEN_MASTER.map(a => [a.slug, "FREE"])) };
    for (const foodReview of [undefined, { evidenceRefs: "架空資料 v1", scope: "架空の全対象", checkedAt: "2026-10-08T00:00:00Z", unresolvedIssues: "未照合の別添" }]) {
        const response = await menusRoute.POST(request("POST", "/api/admin/menus", JSON.stringify({ ...base, foodReview })));
        assert.equal(response.status, 400);
        assert.match((await response.json()).error, /非公開で保存/);
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

test("STOPは古い編集版・UNKNOWN・未解決のフォームを要求せず、所有行だけを停止して確定版を返す", async t => {
    setup(t);
    replace(t, prisma.allergen, "findMany", async () => assert.fail("Stop must not require declarations"));
    replace(t, prisma.menuItem, "update", async ({ where, data }: Args) => {
        assert.deepEqual(where, { id: "own-menu", shopId: "own-shop" });
        assert.deepEqual(data, { isPublished: false });
        return { id: "own-menu", isPublished: false, version: 12 };
    });
    const response = await menuRoute.STOP(request("POST", "/api/admin/menus/own-menu/stop"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, menu: { id: "own-menu", isPublished: false, version: 12 } });
    assert.deepEqual(revalidatedPaths, ["/shops", "/shops/own-shop", "/shops/own-shop/menus/own-menu", "/(public)/shops/[shopId]/menus/[menuId]"]);
});

test("STOPのreadonly拒否と、停止確定後のcache未確認を区別する", async t => {
    setup(t);
    let writes = 0;
    replace(t, prisma.menuItem, "update", async () => { writes++; return { id: "own-menu", isPublished: false, version: 9 }; });
    process.env.PORTFOLIO_MODE = "true";
    assert.equal((await menuRoute.STOP(request("POST", "/api/admin/menus/own-menu/stop"))).status, 403);
    assert.equal(writes, 0);
    process.env.PORTFOLIO_MODE = "false";
    failRevalidation = true;
    const response = await menuRoute.STOP(request("POST", "/api/admin/menus/own-menu/stop"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, menu: { id: "own-menu", isPublished: false, version: 9 }, publicRefreshPending: true });
    assert.equal(writes, 1);
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

test("保存済み最新版の別公開操作だけが新しい公開記録を作り、食品確認根拠は作らない", async (t) => {
    setup(t);
    const links = ALLERGEN_MASTER.map(a => ({ allergen: { slug: a.slug }, status: "FREE" }));
    replace(t, prisma.menuItem, "findFirst", async () => ({ id: "own-menu", name: "架空", isPublished: false,
        foodVersion: 1, publicationConfirmedFoodVersion: null, allergenLinks: links }));
    let version = 0; let published = false; let confirmed: unknown;
    replace(t, prisma, "$transaction", async (work: (tx: object) => Promise<unknown>) => work({
        $executeRaw: async () => 0,
        allergen: { findMany: async () => ALLERGEN_MASTER },
        menuItem: {
            update: async ({ where, data }: Args) => {
                assert.equal(where?.shopId, "own-shop");
                if (where?.version !== undefined) assert.equal(where.version, 0);
                version++; published = Boolean(data?.isPublished); return {};
            },
            findFirstOrThrow: async ({ where }: Args) => {
                assert.deepEqual(where, { id: "own-menu", shopId: "own-shop" });
                return { id: "own-menu", name: "架空", foodVersion: 1, allergenLinks: links, foodReviews: [],
                    publicationConfirmedFoodVersion: confirmed ? 1 : null, reviewedFoodVersion: null, version, isPublished: published };
            },
        },
        menuPublicationConfirmation: { create: async ({ data }: Args) => { confirmed = data; return {}; } },
        menuFoodReview: { create: async () => assert.fail("Must not fabricate food evidence") },
    }));
    const response = await menuRoute.PUT(request("PUT", "/api/admin/menus/own-menu", '{"publicationAction":"publish"}'));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).menu.isPublished, true);
    assert.deepEqual(confirmed, { menuItemId: "own-menu", foodVersion: 1, actorUserId: "app-owner" });
});

for (const change of ["allergen", "reported"] as const) test(`食品変更と別公開が同時に要求されても非公開保存する: ${change}`, async t => {
    setup(t);
    const links = ALLERGEN_MASTER.map(a => ({ allergen: { slug: a.slug }, status: "FREE" }));
    replace(t, prisma.menuItem, "findFirst", async () => ({
        id: "own-menu", name: "架空料理", description: null, category: null, ingredients: "架空原材料",
        precaution: null, priceYen: null, imageUrl: null, isPublished: false, version: 4,
        foodVersion: 3, publicationConfirmedFoodVersion: null, allergenLinks: links,
    }));
    let writes = 0;
    let replacementLinks = 0;
    let savedLinks: Array<{ allergenId: string; status: string }> = [];
    replace(t, prisma, "$transaction", async (work: (tx: object) => Promise<unknown>) => work({
        $executeRaw: async () => 0,
        menuItem: {
            update: async ({ where, data }: Args) => {
                writes++;
                assert.deepEqual(where, { id: "own-menu", shopId: "own-shop", version: 4 });
                assert.equal(data?.isPublished, false);
                assert.deepEqual(data?.foodVersion, change === "reported" ? { increment: 1 } : undefined);
                return {};
            },
            findFirstOrThrow: async () => ({ id: "own-menu", shopId: "own-shop", isPublished: false,
                version: 5, foodVersion: 4, publicationConfirmedFoodVersion: null, reviewedFoodVersion: null }),
        },
        menuItemAllergen: { deleteMany: async () => { replacementLinks++; },
            createMany: async ({ data }: { data: typeof savedLinks }) => { replacementLinks++; savedLinks = data; } },
        menuPublicationConfirmation: { create: async () => assert.fail("Food change must not create a publication confirmation") },
        menuFoodReview: { create: async () => assert.fail("Food change must not fabricate a review") },
    }));
    const body = change === "allergen" ? { allergenStatusBySlug: { milk: "CONTAINS" } } : { foodChangeReported: true };
    const response = await menuRoute.PUT(request("PUT", "/api/admin/menus/own-menu", JSON.stringify({
        expectedVersion: 4, publicationAction: "publish", ...body,
    })));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).menu.isPublished, false);
    assert.equal(writes, 1);
    assert.equal(replacementLinks, change === "allergen" ? 2 : 0);
    if (change === "allergen") {
        assert.equal(savedLinks.length, ALLERGEN_MASTER.length);
        assert.equal(savedLinks.find(link => link.allergenId === "milk")?.status, "CONTAINS");
        assert.ok(savedLinks.filter(link => link.allergenId !== "milk").every(link => link.status === "FREE"));
    }
});

for (const blocked of ["unresolved", "missing-master", "unknown", "missing-link"] as const) test(`別公開操作の${blocked}拒否は理由付き400で根拠を作らない`, async (t) => {
    setup(t);
    const links = ALLERGEN_MASTER.map((a, index) => ({ allergen: { slug: a.slug }, status: blocked === "unknown" && index === 0 ? "UNKNOWN" : "FREE" }))
        .filter((_, index) => blocked !== "missing-link" || index !== 0);
    replace(t, prisma.menuItem, "findFirst", async () => ({ id: "own-menu", name: "架空", isPublished: false,
        foodVersion: 1, publicationConfirmedFoodVersion: null, allergenLinks: links }));
    replace(t, prisma, "$transaction", async (work: (tx: object) => Promise<unknown>) => work({
        $executeRaw: async () => 0,
        allergen: { findMany: async () => blocked === "missing-master" ? [] : ALLERGEN_MASTER },
        menuItem: { update: async () => ({}), findFirstOrThrow: async () => ({ name: "架空", foodVersion: 1,
            allergenLinks: links, foodReviews: blocked === "unresolved" ? [{ unresolvedIssues: "非公開の詳細" }] : [] }) },
        menuPublicationConfirmation: { create: async () => assert.fail("Blocked publication must not create an event") },
    }));
    const response = await menuRoute.PUT(request("PUT", "/api/admin/menus/own-menu", '{"publicationAction":"publish"}'));
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.ok(body.error);
    assert.doesNotMatch(body.error, /非公開の詳細|Internal Server Error/);
});

test("旧方式の食品確認payloadと旧公開フラグ単独は、再公開を暗黙承認せず明示的に拒否する", async (t) => {
    setup(t);
    replace(t, prisma.menuItem, "findFirst", async () => ({ id: "own-menu", name: "架空", isPublished: false,
        foodVersion: 1, reviewedFoodVersion: 1, allergenLinks: ALLERGEN_MASTER.map(a => ({ allergen: { slug: a.slug }, status: "FREE" })) }));
    for (const body of [{ isPublished: true }, { foodReview: { evidenceRefs: "旧方式", scope: "旧対象", checkedAt: "2026-10-01T00:00:00Z" } },
        { publicationAction: "publish", isPublished: false }]) {
        assert.equal((await menuRoute.PUT(request("PUT", "/api/admin/menus/own-menu", JSON.stringify(body)))).status, 400);
    }
});

test("別の公開操作にも認証・所有権・Origin・保存版の拒否を適用する", async (t) => {
    setup(t);
    const payload = '{"publicationAction":"publish"}';
    assert.equal((await menuRoute.PUT(request("PUT", undefined, payload))).status, 404);
    assert.equal((await menuRoute.PUT(request("PUT", undefined, payload, "https://other.example"))).status, 403);
    clerkUserId = null;
    assert.equal((await menuRoute.PUT(request("PUT", undefined, payload))).status, 401);
    clerkUserId = "clerk-owner";
    replace(t, prisma.menuItem, "findFirst", async () => ({ id: "own-menu", version: 5, name: "架空", isPublished: false }));
    assert.equal((await menuRoute.PUT(request("PUT", "/api/admin/menus/own-menu", payload))).status, 409);
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

test("明示解除は表示対象・保存食品版・操作者を履歴へ記録し、公開やFREE変換をしない", async t => {
    setup(t);
    const links = ALLERGEN_MASTER.map(a => ({ allergen: { slug: a.slug }, status: "UNKNOWN" }));
    replace(t, prisma.menuItem, "findFirst", async () => ({ id: "own-menu", name: "架空", foodVersion: 1,
        publicationConfirmedFoodVersion: null, isPublished: false, allergenLinks: links }));
    let resolution: unknown;
    replace(t, prisma, "$transaction", async (work: (tx: object) => Promise<unknown>) => work({
        $executeRaw: async () => 0,
        menuItem: { update: async ({ where, data }: Args) => { assert.equal(where?.shopId, "own-shop"); assert.equal(data?.isPublished, false); return {}; },
            findFirstOrThrow: async () => ({ id: "own-menu", name: "架空", foodVersion: 1, version: 2,
                publicationConfirmedFoodVersion: null, reviewedFoodVersion: null, isPublished: false, imageUrl: null,
                foodReviews: [{ id: "shown-issue", unresolvedIssues: "要対応の旧記録", issueResolutions: [] }] }) },
        menuFoodIssueResolution: { create: async ({ data }: Args) => { resolution = data; return {}; } },
        menuPublicationConfirmation: { create: async () => assert.fail("Resolution must not publish") },
        menuItemAllergen: { createMany: async () => assert.fail("Resolution must not change allergen state") },
    }));
    const res = await menuRoute.PUT(request("PUT", "/api/admin/menus/own-menu", JSON.stringify({ foodIssueResolution: { foodReviewId: "shown-issue", foodVersion: 1 } })));
    assert.equal(res.status, 200); assert.equal((await res.json()).menu.isPublished, false);
    assert.deepEqual(resolution, { menuItemId: "own-menu", foodReviewId: "shown-issue", foodVersion: 1, issueSnapshot: "要対応の旧記録", actorUserId: "app-owner" });
});

test("解除を公開・内容編集と混ぜず、新規作成への解除も明示拒否する", async t => {
    setup(t);
    const foodIssueResolution = { foodReviewId: "shown-issue", foodVersion: 1 };
    for (const extra of [{ publicationAction: "publish" }, { name: "同時編集" }, { isPublished: true }]) {
        assert.equal((await menuRoute.PUT(request("PUT", "/api/admin/menus/own-menu", JSON.stringify({ foodIssueResolution, ...extra })))).status, 400);
    }
    assert.equal((await menusRoute.POST(request("POST", "/api/admin/menus", JSON.stringify({ foodIssueResolution })))).status, 400);
});

test("解除も他店舗・Origin・未認証・保存版409を拒否する", async t => {
    setup(t);
    const payload = JSON.stringify({ foodIssueResolution: { foodReviewId: "shown-issue", foodVersion: 1 } });
    assert.equal((await menuRoute.PUT(request("PUT", undefined, payload))).status, 404);
    assert.equal((await menuRoute.PUT(request("PUT", undefined, payload, "https://invalid.example"))).status, 403);
    clerkUserId = null;
    assert.equal((await menuRoute.PUT(request("PUT", undefined, payload))).status, 401);
    clerkUserId = "clerk-owner";
    replace(t, prisma.menuItem, "findFirst", async () => ({ id: "own-menu", name: "架空", version: 8 }));
    assert.equal((await menuRoute.PUT(request("PUT", "/api/admin/menus/own-menu", payload))).status, 409);
});

for (const target of [{ foodReviewId: "other-review", foodVersion: 1 }, { foodReviewId: "shown-issue", foodVersion: 2 }]) {
    test(`解除対象の差替・古い食品版を拒否する ${JSON.stringify(target)}`, async t => {
        setup(t);
        replace(t, prisma.menuItem, "findFirst", async () => ({ id: "own-menu", name: "架空", foodVersion: 1, isPublished: false, allergenLinks: [] }));
        replace(t, prisma, "$transaction", async (work: (tx: object) => Promise<unknown>) => work({
            menuItem: { update: async () => ({}), findFirstOrThrow: async () => ({ foodVersion: 1,
                foodReviews: [{ id: "shown-issue", unresolvedIssues: "要対応", issueResolutions: [] }] }) },
            menuFoodIssueResolution: { create: async () => assert.fail("Must not resolve another record/version") },
        }));
        assert.equal((await menuRoute.PUT(request("PUT", "/api/admin/menus/own-menu", JSON.stringify({ foodIssueResolution: target })))).status, 400);
    });
}
