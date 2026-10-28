import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { isValidElement, type ReactNode } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import ShopListPage from "../app/(public)/shops/page";
import ShopDetailPage from "../app/(public)/shops/[shopId]/page";
import MenuDetailPage from "../app/(public)/shops/[shopId]/menus/[menuId]/page";
import { GET } from "../app/api/menus/[menuId]/route";

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
        allergenLinks: allergens.map(({ slug }) => ({
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

// Invoke actual route exports and inspect their returned client props. We do not
// render client components or replace the snapshot/publication/supplement helpers.
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

function stubDistinctTransaction(t: TestContext) {
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
                findFirst: query("shop.findFirst", makeShop()),
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

const callers: Array<{ name: string; reads: ReadName[]; invoke: () => Promise<void> }> = [
    {
        name: "shop list", reads: ["shop.findMany", "allergen.findMany"],
        invoke: async () => {
            const props = findProps(await ShopListPage(), "initialShops");
            const shops = props.initialShops as Array<{ id: string; menus: Array<{ name: string }> }>;
            assert.equal(props.isDatabaseAvailable, true);
            assert.equal(shops.length, 1);
            assert.equal(shops[0].id, shopId);
            assert.equal(shops[0].menus[0].name, menuName);
            assert.equal((props.allergens as unknown[]).length, allergens.length);
        },
    },
    {
        name: "shop detail", reads: ["shop.findFirst", "allergen.findMany"],
        invoke: async () => {
            const props = findProps(await ShopDetailPage({ params: Promise.resolve({ shopId }) }), "menus");
            const menus = props.menus as Array<{ id: string; name: string }>;
            assert.equal(menus.length, 1);
            assert.equal(menus[0].id, menuId);
            assert.equal(menus[0].name, menuName);
        },
    },
    {
        name: "menu detail", reads: ["menuItem.findFirst", "allergen.findMany", "menuItem.findMany"],
        invoke: async () => {
            const props = findProps(await MenuDetailPage({ params: Promise.resolve({ shopId, menuId }) }), "menuName");
            assert.equal(props.menuName, menuName);
            assert.deepEqual(props.storeHandledAllergenSlugs, [handledSlug]);
            const row = (props.rows as Array<{ slug: string; status: string; effectiveRisk: string }>).find(row => row.slug === handledSlug);
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
