import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { isValidElement, type ReactNode } from "react";
import Module, { createRequire } from "node:module";
import { publicSnapshotSchema, shopViewSnapshotSchema, SHOP_VIEW_MEDIA_TYPE } from "../features/public/shops/freshness/contracts";
import { readSnapshotResponse } from "../features/public/shops/freshness/revalidation";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";

// Next resolves the server-only marker at build time. Plain Node uses its
// throwing default export, so only that marker is replaced during synchronous
// route loading. Snapshot/publication/supplement helpers remain the real ones.
const moduleLoader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const originalLoad = moduleLoader._load;
const requireForTest = createRequire(import.meta.url);
let ShopListPage: typeof import("../app/(public)/shops/page").default;
let ShopDetailPage: typeof import("../app/(public)/shops/[shopId]/page").default;
let MenuDetailPage: typeof import("../app/(public)/shops/[shopId]/menus/[menuId]/page").default;
let GET: typeof import("../app/api/menus/[menuId]/route").GET;
let GETSnapshot: typeof import("../app/api/public-snapshot/route").GET;
try {
    moduleLoader._load = function (id, ...args) {
        if (id === "server-only") return {};
        return originalLoad.call(this, id, ...args);
    };
    ShopListPage = requireForTest("../app/(public)/shops/page.tsx").default;
    ShopDetailPage = requireForTest("../app/(public)/shops/[shopId]/page.tsx").default;
    MenuDetailPage = requireForTest("../app/(public)/shops/[shopId]/menus/[menuId]/page.tsx").default;
    GET = requireForTest("../app/api/menus/[menuId]/route.ts").GET;
    GETSnapshot = requireForTest("../app/api/public-snapshot/route.ts").GET;
} finally { moduleLoader._load = originalLoad; }

const allergens = ALLERGEN_MASTER.map((allergen, index) => ({
    id: `allergen-${index}`, ...allergen,
}));
const shopId = "transaction-shop";
const menuId = "transaction-menu";
const menuName = "Transaction fixture menu";
const handledSlug = allergens[0].slug;

function makeMenu(contains = false) {
    return {
        id: menuId, shopId, name: menuName, description: null,
        priceYen: 1000, category: null, ingredients: null, precaution: null,
        imageUrl: null, imageFrame: null, imageFit: null, imagePosition: null,
        imageZoom: null, imagePositionX: null, imagePositionY: null,
        isPublished: true, foodVersion: 1, reviewedFoodVersion: 1,
        publicationConfirmedFoodVersion: 1,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        shop: { id: shopId, name: "Transaction fixture shop" },
        allergenLinks: allergens.map(({ id, slug }) => ({
            allergenId: id,
            status: contains && slug === handledSlug ? "CONTAINS" : "FREE",
            allergen: { slug },
        })),
    };
}

function makeShop() {
    return {
        id: shopId, name: "Transaction fixture shop", description: null,
        address: null, prefecture: null, city: null, nearestStation: null,
        category: null, latitude: null, longitude: null, googlePlaceId: null,
        hours: null, regularHoliday: null, phoneNumber: null, note: null,
        averageBudgetYen: null, coverImageUrl: null, coverImageFit: null,
        coverImageZoom: null, coverImagePositionX: null, coverImagePositionY: null,
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        menus: [makeMenu()], _count: { menus: 1 },
    };
}

// Invoke actual route exports and inspect the full snapshot passed to the client.
// We do not render client components or replace snapshot/publication/supplement helpers.
function findProps(node: ReactNode, key: string): Record<string, unknown> {
    if (Array.isArray(node)) {
        for (const child of node) {
            const found = findProps(child, key);
            if (key in found) return found;
        }
    } else if (isValidElement<Record<string, unknown>>(node)) {
        if (key in node.props) return node.props;
        return findProps(node.props.children as ReactNode, key);
    }
    return {};
}

type ReadName = "shop.findMany" | "shop.findFirst" | "allergen.findMany" |
    "menuItem.findFirst" | "menuItem.findMany";

function stubDistinctTransaction(t: TestContext, shop: unknown = makeShop()) {
    const rootReads: string[] = [];
    const transactions: ReadName[][] = [];
    const forbidden = (name: ReadName) => async () => {
        rootReads.push(name);
        t.diagnostic(`ROOT_CLIENT_READ:${name}`);
        throw new Error(`ROOT_CLIENT_READ:${name}`);
    };
    // Prisma delegates are proxies; restore assignments like the existing API tests.
    for (const [delegate, method, name] of [
        [prisma.shop, "findMany", "shop.findMany"],
        [prisma.shop, "findFirst", "shop.findFirst"],
        [prisma.allergen, "findMany", "allergen.findMany"],
        [prisma.menuItem, "findFirst", "menuItem.findFirst"],
        [prisma.menuItem, "findMany", "menuItem.findMany"],
    ] as const) {
        const target = delegate as unknown as Record<string, unknown>;
        const original = target[method];
        target[method] = forbidden(name);
        t.after(() => { target[method] = original; });
    }
    t.after(() => assert.deepEqual(rootReads, [], "ROOT_CLIENT_READ must never occur"));

    const originalTransaction = prisma.$transaction;
    t.after(() => { prisma.$transaction = originalTransaction; });
    prisma.$transaction = (async (
        read: (tx: Prisma.TransactionClient) => Promise<unknown>,
        options: { isolationLevel: string },
    ) => {
        assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.RepeatableRead);
        const calls: ReadName[] = [];
        transactions.push(calls);
        let active = true;
        const query = (name: ReadName, value: unknown) => async () => {
            assert.equal(active, true, `${name} must run before the transaction completes`);
            calls.push(name);
            return value;
        };
        // Never pass prisma itself: the old API fixture did so and masked escapes.
        const tx = {
            shop: {
                findMany: query("shop.findMany", [makeShop()]),
                findFirst: query("shop.findFirst", shop),
            },
            allergen: { findMany: query("allergen.findMany", allergens) },
            menuItem: {
                findFirst: query("menuItem.findFirst", makeMenu()),
                findMany: query("menuItem.findMany", [makeMenu(true)]),
            },
        } as unknown as Prisma.TransactionClient;
        assert.notEqual(tx, prisma);
        try {
            return await read(tx);
        } finally {
            active = false;
        }
    }) as typeof prisma.$transaction;
    return transactions;
}

test("shop thumbnails use validated publishable rows while default public JSON stays strict", async (t) => {
    const origin = "https://fixture.public.blob.vercel-storage.com";
    const url = `${origin}/menu-images/${shopId}/sample.jpg`;
    const oldPrefixes = process.env.ALLOWED_IMAGE_URL_PREFIXES;
    process.env.ALLOWED_IMAGE_URL_PREFIXES = origin;
    t.after(() => {
        if (oldPrefixes === undefined) delete process.env.ALLOWED_IMAGE_URL_PREFIXES;
        else process.env.ALLOWED_IMAGE_URL_PREFIXES = oldPrefixes;
    });

    const valid = { ...makeMenu(), imageUrl: url, imageFrame: "wide", imageFit: "contain", imageZoom: 130, imagePositionX: 25, imagePositionY: 75 };
    const unknown = { ...makeMenu(true), id: "unknown", imageUrl: url,
        allergenLinks: makeMenu(true).allergenLinks.map((link, index) => index === 1 ? { ...link, status: "UNKNOWN" } : link) };
    const missing = { ...makeMenu(true), id: "missing", imageUrl: url, allergenLinks: makeMenu(true).allergenLinks.slice(0, -1) };
    const obsolete = { ...makeMenu(true), id: "obsolete", imageUrl: url, publicationConfirmedFoodVersion: 0 };
    const invalid = { ...makeMenu(), id: "invalid-url", imageUrl: `${origin}/menu-images/another-shop/sample.jpg` };
    const shop = { ...makeShop(), menus: [valid, unknown, missing, obsolete, invalid] };
    const transactions = stubDistinctTransaction(t, shop);
    const props = findProps(await ShopDetailPage({ params: Promise.resolve({ shopId }) }), "initialSnapshot");
    assert.deepEqual(props.menuImages, {
        [menuId]: { updatedAt: valid.updatedAt.toISOString(), safeImageUrl: url, imageFrame: "wide", imageFit: "contain",
            imageZoom: 130, imagePositionX: 25, imagePositionY: 75 },
    });
    const snapshot = publicSnapshotSchema.parse(props.initialSnapshot);
    assert.equal(snapshot.result.kind, "shop");
    if (snapshot.result.kind !== "shop") assert.fail("Expected shop snapshot");
    assert.deepEqual(snapshot.result.data.menusForClient.map(menu => menu.id), [menuId, "invalid-url"]);
    assert.deepEqual(snapshot.result.data.storeHandledAllergenSlugs, [], "Unpublishable rows cannot supply store supplements");
    const requestId = "8e20dad4-9de7-4e89-bd51-6917e79aef47";
    const requestUrl = `http://localhost/api/public-snapshot?kind=shop&shopId=${shopId}&requestId=${requestId}`;
    const response = await GETSnapshot(new Request(requestUrl, { headers: { Accept: "application/json" } }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(publicSnapshotSchema.parse(body).result, snapshot.result);
    assert.doesNotMatch(JSON.stringify(body), /sample\.jpg|menuImages/);
    assert.equal(transactions.length, 2);

    const shopView = await GETSnapshot(new Request(requestUrl, { headers: { Accept: SHOP_VIEW_MEDIA_TYPE } }));
    assert.equal(shopView.status, 200);
    assert.equal(shopView.headers.get("content-type"), SHOP_VIEW_MEDIA_TYPE);
    assert.equal(shopView.headers.get("cache-control"), "no-store");
    assert.equal(shopView.headers.get("vary"), "Accept");
    assert.deepEqual(transactions[2].sort(), ["allergen.findMany", "shop.findFirst"]);
    assert.equal(transactions.length, 3, "One transaction per app refresh");
    const { menuImages, ...viewSnapshot } = shopViewSnapshotSchema.parse(await shopView.clone().json());
    assert.deepEqual(viewSnapshot.result, snapshot.result);
    assert.deepEqual(menuImages, props.menuImages);
    const target = { kind: "shop", shopId } as const;
    assert.deepEqual((await readSnapshotResponse(target, requestId, shopView)).menuImages, props.menuImages);

    const image = (props.menuImages as Record<string, { updatedAt: string; safeImageUrl: string }>)[menuId];
    const badViews = [
        { [menuId]: { ...image, updatedAt: "2026-11-09T00:00:00.000Z" } },
        { [menuId]: { ...image, safeImageUrl: url.replace(shopId, "other-shop") } },
        { unknown: image, missing: image, obsolete: image },
    ];
    for (const invalidImages of badViews) {
        const bad = Response.json({ ...viewSnapshot, menuImages: invalidImages }, { headers: { "Content-Type": SHOP_VIEW_MEDIA_TYPE } });
        const result = await readSnapshotResponse(target, requestId, bad);
        assert.deepEqual(result.menuImages, {});
        assert.deepEqual(result.result, snapshot.result);
    }
    const withoutImages = Response.json(viewSnapshot, { headers: { "Content-Type": SHOP_VIEW_MEDIA_TYPE } });
    assert.deepEqual(await readSnapshotResponse(target, requestId, withoutImages), viewSnapshot);
});

const callers: Array<{ name: string; reads: ReadName[]; invoke: () => Promise<void> }> = [
    {
        name: "shop list", reads: ["shop.findMany", "allergen.findMany"],
        invoke: async () => {
            const props = findProps(await ShopListPage(), "initialSnapshot");
            const snapshot = publicSnapshotSchema.parse(props.initialSnapshot);
            assert.equal(snapshot.targetKey, "/shops");
            assert.ok(snapshot.result.kind === "list");
            const { initialShops: shops, allergens: publicAllergens, isDatabaseAvailable } = snapshot.result.data;
            assert.equal(isDatabaseAvailable, true);
            assert.equal(shops.length, 1);
            assert.equal(shops[0].id, shopId);
            assert.equal(shops[0].menus[0].name, menuName);
            assert.equal(publicAllergens.length, allergens.length);
        },
    },
    {
        name: "shop detail", reads: ["shop.findFirst", "allergen.findMany"],
        invoke: async () => {
            const props = findProps(await ShopDetailPage({ params: Promise.resolve({ shopId }) }), "initialSnapshot");
            const snapshot = publicSnapshotSchema.parse(props.initialSnapshot);
            assert.equal(snapshot.targetKey, `/shops/${shopId}`);
            assert.ok(snapshot.result.kind === "shop");
            const { menusForClient: menus } = snapshot.result.data;
            assert.equal(menus.length, 1);
            assert.equal(menus[0].id, menuId);
            assert.equal(menus[0].name, menuName);
        },
    },
    {
        name: "menu detail", reads: ["menuItem.findFirst", "allergen.findMany", "menuItem.findMany"],
        invoke: async () => {
            const props = findProps(await MenuDetailPage({ params: Promise.resolve({ shopId, menuId }) }), "initialSnapshot");
            const snapshot = publicSnapshotSchema.parse(props.initialSnapshot);
            assert.equal(snapshot.targetKey, `/shops/${shopId}/menus/${menuId}`);
            assert.ok(snapshot.result.kind === "menu");
            const data = snapshot.result.data;
            assert.equal(data.menuName, menuName);
            assert.deepEqual(data.storeHandledAllergenSlugs, [handledSlug]);
            const row = data.rows.find(row => row.slug === handledSlug);
            assert.equal(row?.status, "FREE");
            assert.equal(row?.effectiveRisk, "STORE_HANDLED");
        },
    },
    {
        name: "menu API", reads: ["menuItem.findFirst", "allergen.findMany", "menuItem.findMany"],
        invoke: async () => {
            const response = await GET(new Request(`http://localhost/api/menus/${menuId}`));
            assert.equal(response.status, 200);
            const { menu } = await response.json();
            assert.equal(menu.id, menuId);
            assert.equal(menu.name, menuName);
            const row = menu.allergenDisplayItems.find((item: { slug: string }) => item.slug === handledSlug);
            assert.equal(row.status, "FREE");
            assert.equal(row.effectiveRisk, "STORE_HANDLED");
        },
    },
];

for (const caller of callers) {
    test(`public caller transaction: ${caller.name}`, async (t) => {
        const transactions = stubDistinctTransaction(t);
        // A second request must obtain a fresh transaction, including supplements.
        for (let request = 0; request < 2; request++) {
            await caller.invoke();
            assert.equal(transactions.length, request + 1);
            assert.deepEqual([...transactions[request]].sort(), [...caller.reads].sort());
        }
    });
}
