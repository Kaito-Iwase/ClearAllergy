import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Module, { createRequire } from "node:module";
import { prisma } from "../lib/db";

// Replace only external Clerk context and Blob transport in this test process.
// The routes, shared validation, origin/portfolio and ownership helpers run.
let clerkUserId: string | null = "fictional-owner";
const blobWrites: string[] = [];
const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
const requireForTest = createRequire(import.meta.url);
let storage: typeof import("../lib/storage/upload-images");
let menu: typeof import("../features/admin/menus/server/uploadMenuImageRoute");
let shop: typeof import("../features/admin/shop/server/uploadShopImageRoute");
try {
    loader._load = function (id, ...args) {
        if (id === "@clerk/nextjs/server") return {
            auth: async () => ({ userId: clerkUserId }),
            currentUser: async () => ({ publicMetadata: {}, externalId: null }),
        };
        if (id === "@vercel/blob") return {
            put: async (pathname: string) => {
                blobWrites.push(pathname);
                return { url: "https://fictional.example.invalid/image.png", pathname };
            },
        };
        return originalLoad.call(this, id, ...args);
    };
    storage = requireForTest("../lib/storage/upload-images.ts");
    menu = requireForTest("../features/admin/menus/server/uploadMenuImageRoute.ts");
    shop = requireForTest("../features/admin/shop/server/uploadShopImageRoute.ts");
} finally {
    loader._load = originalLoad;
}

function replace(t: TestContext, target: object, key: string, value: unknown) {
    const delegate = target as Record<string, unknown>;
    const old = delegate[key];
    delegate[key] = value;
    t.after(() => { delegate[key] = old; });
}

function setup(t: TestContext) {
    clerkUserId = "fictional-owner";
    blobWrites.length = 0;
    const oldMode = process.env.PORTFOLIO_MODE;
    process.env.PORTFOLIO_MODE = "false";
    t.after(() => {
        if (oldMode === undefined) delete process.env.PORTFOLIO_MODE;
        else process.env.PORTFOLIO_MODE = oldMode;
    });
    replace(t, prisma.user, "findUnique", async (args: { where: unknown }) => {
        assert.deepEqual(args.where, { clerkUserId: "fictional-owner" });
        return { id: "fictional-user", clerkUserId: "fictional-owner", shop: null };
    });
    replace(t, prisma.shop, "findFirst", async (args: { where: unknown }) => {
        assert.deepEqual(args.where, { ownerClerkUserId: "fictional-owner", isActive: true });
        return { id: "fictional-shop", isActive: true, ownerClerkUserId: "fictional-owner" };
    });
    replace(t, prisma.auditLog, "create", async () => ({}));
}

function request(path: string, file: File, origin = "http://localhost") {
    const form = new FormData();
    form.set("file", file);
    return new Request(`http://localhost${path}`, { method: "POST", headers: { Origin: origin }, body: form });
}

const routes = [
    [() => menu.POST, "/api/admin/upload-menu-image"],
    [() => shop.POST, "/api/admin/upload-shop-image"],
] as const;

test("許可される全画像MIMEでも0バイトのFileを拒否する", () => {
    for (const type of storage.ALLOWED_IMAGE_MIME_TYPES) {
        const result = storage.validateImageFile(new File([], "empty", { type }));
        assert.equal(result.ok, false, type);
    }
});

test("非空PNGのアップロード判定と拡張子を維持する", () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=", "base64");
    assert.deepEqual(storage.validateImageFile(new File([png], "fixture.png", { type: "image/png" })), { ok: true, extension: "png" });
});

test("未許可MIMEと5MB超過の既存拒否を維持する", () => {
    assert.equal(storage.validateImageFile(new File(["text"], "fixture.txt", { type: "text/plain" })).ok, false);
    assert.equal(storage.validateImageFile(new File([new Uint8Array(storage.MAX_UPLOAD_FILE_SIZE + 1)], "large.png", { type: "image/png" })).ok, false);
});

test("両画像APIは空Fileを400で拒否しBlobを呼ばない", async (t) => {
    setup(t);
    for (const [handler, path] of routes) {
        const response = await handler()(request(path, new File([], "empty.png", { type: "image/png" })));
        assert.equal(response.status, 400, path);
        assert.deepEqual(await response.json(), { error: "画像ファイルが空です。" });
    }
    assert.deepEqual(blobWrites, []);
});

test("空Fileでも未認証・非所有店舗・別originのguardを先に維持する", async (t) => {
    setup(t);
    const empty = () => new File([], "empty.png", { type: "image/png" });
    clerkUserId = null;
    for (const [handler, path] of routes) assert.equal((await handler()(request(path, empty()))).status, 401);
    clerkUserId = "fictional-owner";
    replace(t, prisma.shop, "findFirst", async () => null);
    for (const [handler, path] of routes) assert.equal((await handler()(request(path, empty()))).status, 403);
    for (const [handler, path] of routes) assert.equal((await handler()(request(path, empty(), "https://foreign.example.invalid"))).status, 403);
    assert.deepEqual(blobWrites, []);
});
