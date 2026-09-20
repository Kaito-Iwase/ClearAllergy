import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { prisma } from "../lib/db";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import { GET } from "../features/public/shops/server/publicMenuRoute";

type QueryArgs = { where?: unknown };
type QueryMethod = (args: QueryArgs) => Promise<unknown>;

const allergenRows = ALLERGEN_MASTER.map((allergen, index) => ({
    id: `allergen-${index + 1}`,
    ...allergen,
}));

function makeMenu(overrides: Record<string, unknown> = {}) {
    return {
        id: "menu-1",
        shopId: "shop-1",
        name: "テストメニュー",
        description: null,
        priceYen: 1000,
        category: null,
        ingredients: null,
        precaution: null,
        imageUrl: null,
        imageFrame: null,
        imageFit: null,
        imagePosition: null,
        imageZoom: null,
        imagePositionX: null,
        imagePositionY: null,
        isPublished: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        allergenLinks: allergenRows.map((allergen) => ({
            status: "FREE",
            allergen: { slug: allergen.slug },
        })),
        ...overrides,
    };
}

function asRecord(value: unknown): Record<string, unknown> {
    assert.equal(typeof value, "object");
    assert.notEqual(value, null);
    return value as Record<string, unknown>;
}

function stubPrisma(
    t: TestContext,
    handlers: {
        findMenu: QueryMethod;
        findAllergens?: QueryMethod;
        findStoreMenus?: QueryMethod;
    },
) {
    const menuDelegate = prisma.menuItem as unknown as {
        findFirst: QueryMethod;
    };
    const allergenDelegate = prisma.allergen as unknown as {
        findMany: QueryMethod;
    };
    const linkDelegate = prisma.menuItem as unknown as {
        findMany: QueryMethod;
    };
    const originals = {
        findMenu: menuDelegate.findFirst,
        findAllergens: allergenDelegate.findMany,
        findStoreMenus: linkDelegate.findMany,
    };

    menuDelegate.findFirst = handlers.findMenu;
    allergenDelegate.findMany =
        handlers.findAllergens ?? (async () => allergenRows);
    linkDelegate.findMany = handlers.findStoreMenus ?? (async () => []);

    t.after(() => {
        menuDelegate.findFirst = originals.findMenu;
        allergenDelegate.findMany = originals.findAllergens;
        linkDelegate.findMany = originals.findStoreMenus;
    });
}

async function requestMenu() {
    return GET(new Request("http://localhost/api/menus/menu-1"));
}

test("公開APIは稼働店舗の公開可能メニューだけを返す", async (t) => {
    stubPrisma(t, {
        findMenu: async (args) => {
            const where = asRecord(args.where);
            assert.equal(where.id, "menu-1");
            assert.equal(where.isPublished, true);
            assert.deepEqual(where.shop, { isActive: true });
            return makeMenu();
        },
        findStoreMenus: async (args) => {
            const where = asRecord(args.where);
            assert.equal(where.shopId, "shop-1");
            assert.equal(where.isPublished, true);
            assert.deepEqual(where.shop, { isActive: true });
            return [];
        },
    });

    const response = await requestMenu();
    assert.equal(response.status, 200);
    const body = asRecord(await response.json());
    assert.equal(asRecord(body.menu).id, "menu-1");
});

test("公開APIは非アクティブ店舗のメニューを404にする", async (t) => {
    stubPrisma(t, {
        findMenu: async (args) => {
            const where = asRecord(args.where);
            const shop = where.shop;
            if (typeof shop === "object" && shop !== null) {
                if (asRecord(shop).isActive === true) return null;
            }
            return makeMenu();
        },
    });

    assert.equal((await requestMenu()).status, 404);
});

test("公開APIは非公開メニューを404にする", async (t) => {
    stubPrisma(t, {
        findMenu: async (args) => {
            const where = asRecord(args.where);
            if (where.isPublished === true) return null;
            return makeMenu({ isPublished: false });
        },
    });

    assert.equal((await requestMenu()).status, 404);
});

test("公開APIはUNKNOWNを含む不完全メニューを404にする", async (t) => {
    const allergenLinks = makeMenu().allergenLinks.map((link, index) => ({
        ...link,
        status: index === 0 ? "UNKNOWN" : "FREE",
    }));
    stubPrisma(t, {
        findMenu: async () => makeMenu({ allergenLinks }),
    });

    assert.equal((await requestMenu()).status, 404);
});

test("公開APIはDBマスタが29品目と一致しない場合404にする", async (t) => {
    stubPrisma(t, {
        findMenu: async () => makeMenu(),
        findAllergens: async () => allergenRows.slice(0, -1),
    });

    assert.equal((await requestMenu()).status, 404);
});


test("公開APIは別の公開可能メニューの含む登録を補足し、FREE自体は変更しない", async (t) => {
    const slug = allergenRows[0].slug;
    stubPrisma(t, {
        findMenu: async () => makeMenu(),
        findStoreMenus: async () => [makeMenu({ allergenLinks: makeMenu().allergenLinks.map((link) => ({
            ...link, status: link.allergen.slug === slug ? "CONTAINS" : "FREE",
        })) })],
    });
    const response = await requestMenu();
    assert.equal(response.status, 200);
    const body = await response.json();
    const item = body.menu.allergenDisplayItems.find((item: {slug: string}) => item.slug === slug);
    assert.equal(item.status, "FREE");
    assert.equal(item.effectiveRisk, "STORE_HANDLED");
    assert.equal(item.storeHandlesAllergen, true);
});

test("公開APIは不完全な公開メニューを補足情報の根拠にしない", async (t) => {
    stubPrisma(t, {
        findMenu: async () => makeMenu(),
        findStoreMenus: async () => [makeMenu({ allergenLinks: [
            { status: "CONTAINS", allergen: { slug: allergenRows[0].slug } },
        ] })],
    });
    const body = await (await requestMenu()).json();
    assert.ok(body.menu.allergenDisplayItems.every((item: {storeHandlesAllergen: boolean}) => !item.storeHandlesAllergen));
});
