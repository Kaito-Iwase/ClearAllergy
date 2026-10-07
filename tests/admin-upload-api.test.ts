import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Module, { createRequire } from "node:module";
import { prisma } from "../lib/db";

let clerkUserId: string | null = "clerk-shop-a";
let authCalls = 0;
type BlobCall = { pathname: string; file: File; options: Record<string, unknown> };
let blobCalls: BlobCall[] = [];
let blobError: Error | undefined;
const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
const requireForTest = createRequire(import.meta.url);
let menuRoute: typeof import("../features/admin/menus/server/uploadMenuImageRoute");
let shopRoute: typeof import("../features/admin/shop/server/uploadShopImageRoute");
let upload: typeof import("../lib/storage/upload-images");
try {
    loader._load = function (id, ...args) {
        if (id === "@clerk/nextjs/server") return {
            auth: async () => { authCalls++; return { userId: clerkUserId }; },
            currentUser: async () => ({ publicMetadata: {}, externalId: null }),
        };
        if (id === "@vercel/blob") return { put: async (pathname: string, file: File, options: Record<string, unknown>) => {
            blobCalls.push({ pathname, file, options });
            if (blobError) throw blobError;
            return { pathname, url: `https://fixture.public.blob.vercel-storage.com/${pathname}` };
        } };
        return originalLoad.call(this, id, ...args);
    };
    upload = requireForTest("../lib/storage/upload-images.ts");
    menuRoute = requireForTest("../features/admin/menus/server/uploadMenuImageRoute.ts");
    shopRoute = requireForTest("../features/admin/shop/server/uploadShopImageRoute.ts");
} finally { loader._load = originalLoad; }

const routes = [
    { kind: "menu", path: "/api/admin/upload-menu-image", post: menuRoute.POST, prefix: "menu-images/shop-a/" },
    { kind: "shop", path: "/api/admin/upload-shop-image", post: shopRoute.POST, prefix: "shops/shop-a/cover-" },
] as const;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64");
type Query = { where?: Record<string, unknown>; data?: Record<string, unknown> };

function replace(t: TestContext, target: object, key: string, replacement: unknown) {
    const object = target as Record<string, unknown>;
    const previous = object[key]; object[key] = replacement;
    t.after(() => { object[key] = previous; });
}

function setup(t: TestContext) {
    clerkUserId = "clerk-shop-a";
    authCalls = 0;
    blobCalls = [];
    blobError = undefined;
    for (const [key, value] of Object.entries({ PORTFOLIO_MODE: "false", PORTFOLIO_EDITOR_APP_USER_IDS: "" })) {
        const previous = process.env[key]; process.env[key] = value;
        t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
    }
    const audits: Query[] = [];
    replace(t, prisma.user, "findUnique", async ({ where }: Query) => {
        assert.deepEqual(where, { clerkUserId: "clerk-shop-a" });
        return { id: "app-shop-a", clerkUserId: "clerk-shop-a", shop: null };
    });
    replace(t, prisma.shop, "findFirst", async ({ where }: Query) => {
        assert.deepEqual(where, { ownerClerkUserId: "clerk-shop-a", isActive: true });
        return { id: "shop-a", ownerClerkUserId: "clerk-shop-a", isActive: true };
    });
    replace(t, prisma.auditLog, "create", async (args: Query) => { audits.push(args); return {}; });
    replace(t, prisma.shop, "update", async () => assert.fail("Upload must not update shop data"));
    replace(t, prisma.menuItem, "update", async () => assert.fail("Upload must not assign a menu image"));
    return { audits };
}

function request(path: string, file: File | string | undefined = new File([png], "fixture.png", { type: "image/png" }), origin = "http://localhost") {
    const data = new FormData();
    if (file !== undefined) data.set("file", file);
    data.set("shopId", "shop-b"); data.set("userId", "app-shop-b"); data.set("menuId", "foreign-menu");
    return new Request(`http://localhost${path}`, { method: "POST", headers: { Origin: origin }, body: data });
}

test("店舗・メニュー画像APIは未認証と別Originを保存前に拒否する", async (t) => {
    setup(t);
    for (const route of routes) {
        assert.equal((await route.post(request(route.path, undefined, "https://foreign.invalid"))).status, 403);
    }
    assert.equal(authCalls, 0);
    clerkUserId = null;
    replace(t, prisma.user, "findUnique", async () => assert.fail("Unauthenticated upload must not read DB"));
    for (const route of routes) assert.equal((await route.post(request(route.path))).status, 401);
    assert.deepEqual(blobCalls, []);
});

test("所有店舗なしと閲覧専用では両画像APIのBlob書込が発生しない", async (t) => {
    setup(t);
    const original = prisma.shop.findFirst;
    replace(t, prisma.shop, "findFirst", async () => null);
    for (const route of routes) assert.equal((await route.post(request(route.path))).status, 403);
    replace(t, prisma.shop, "findFirst", original);
    process.env.PORTFOLIO_MODE = "true";
    for (const route of routes) assert.equal((await route.post(request(route.path))).status, 403);
    assert.deepEqual(blobCalls, []);
});

test("画像APIは欠損・非ファイル・SVG・上限超過をBlob保存前に拒否する", async (t) => {
    setup(t);
    const oversized = new Uint8Array(upload.MAX_UPLOAD_FILE_SIZE + 1); oversized.set(png);
    for (const route of routes) {
        const missing = new Request(`http://localhost${route.path}`, { method: "POST", headers: { Origin: "http://localhost" }, body: new FormData() });
        assert.equal((await route.post(missing)).status, 400);
        for (const file of [
            "not a file", new File(["<svg/>"], "disguised.png", { type: "image/svg+xml" }),
            new File([oversized], "too-large.png", { type: "image/png" }),
        ]) assert.equal((await route.post(request(route.path, file))).status, 400);
    }
    assert.deepEqual(blobCalls, []);
});

test("両画像APIは空ファイルとMIME偽装をBlob保存前に拒否する", async (t) => {
    const { audits } = setup(t);
    for (const route of routes) {
        for (const file of [
            new File([], "empty.png", { type: "image/png" }),
            new File(["<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>"], "fake.png", { type: "image/png" }),
            new File([png], "fake.jpg", { type: "image/jpeg" }),
        ]) {
            const response = await route.post(request(route.path, file));
            assert.equal(response.status, 400);
            assert.equal((await response.json()).url, undefined);
            assert.equal(audits.at(-1)?.data?.success, false);
        }
    }
    assert.deepEqual(blobCalls, []);
});

test("画像APIは他店舗IDとファイル名を信用せず本人店舗のパスへだけ保存する", async (t) => {
    const { audits } = setup(t);
    for (const route of routes) {
        const response = await route.post(request(route.path, new File([png], "../shop-b/foreign.svg", { type: "image/png" })));
        assert.equal(response.status, 200);
        const call = blobCalls.at(-1)!;
        assert.ok(call.pathname.startsWith(route.prefix));
        assert.ok(call.pathname.endsWith(".png"));
        assert.ok(!call.pathname.includes("shop-b"));
        assert.ok(!call.pathname.includes(".."));
        assert.deepEqual(call.options, { access: "public", addRandomSuffix: true });
        assert.deepEqual(Buffer.from(await call.file.arrayBuffer()), png);
        assert.equal((await response.json()).pathname, call.pathname);
        assert.equal(audits.at(-1)?.data?.actorShopId, "shop-a");
        assert.equal(audits.at(-1)?.data?.success, true);
    }
    assert.equal(blobCalls.length, 2);
});

test("画像APIはサイズ上限ちょうどのPNGを受け付ける", async (t) => {
    setup(t);
    const bytes = new Uint8Array(upload.MAX_UPLOAD_FILE_SIZE); bytes.set(png);
    for (const route of routes) assert.equal((await route.post(request(route.path, new File([bytes], "boundary.png", { type: "image/png" })))).status, 200);
    assert.equal(blobCalls.length, 2);
});

test("Blobの失敗は一般的な500となりURLや秘密情報を成功として返さない", async (t) => {
    const { audits } = setup(t);
    blobError = new Error("Storage failed: token=fixture-secret-value https://private.invalid/internal");
    const logs: unknown[] = [];
    t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
    for (const route of routes) {
        const response = await route.post(request(route.path));
        assert.equal(response.status, 500);
        const body = await response.json();
        assert.equal(body.url, undefined);
        assert.ok(!JSON.stringify(body).includes("fixture-secret-value"));
        assert.ok(!JSON.stringify(body).includes("private.invalid"));
        assert.equal(audits.at(-1)?.data?.success, false);
    }
    assert.ok(!JSON.stringify(logs).includes("fixture-secret-value"));
});
