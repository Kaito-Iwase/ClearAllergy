import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module, { createRequire } from "node:module";
import { assertCiDatabaseTarget } from "./ci-environment";
import { assertTestDatabaseTarget } from "./test-environment";
import { publishReviewedFixture } from "./food-review-fixture";

// Refuse a target before loading the DB or application modules. No migration/seed here.
if (process.env.CLEARALLERGY_TEST_ENV === "true") assertTestDatabaseTarget();
else assertCiDatabaseTarget();

const run = randomUUID();
const actor = `fictional-owned-menu-${run}`;
const otherActor = `fictional-other-owner-${run}`;
let authenticatedActor = actor;
const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
const requireForTest = createRequire(import.meta.url);
let route: typeof import("../features/admin/menus/server/adminMenuRoute");
try {
    loader._load = function (id, ...args) {
        if (id === "next/cache") return { revalidatePath: () => {} };
        if (id === "@clerk/nextjs/server") return {
            auth: async () => ({ userId: authenticatedActor }),
            currentUser: async () => ({ publicMetadata: {}, externalId: null }),
        };
        return originalLoad.call(this, id, ...args);
    };
    route = requireForTest("../features/admin/menus/server/adminMenuRoute.ts");
} finally { loader._load = originalLoad; }
const { prisma } = requireForTest("../lib/db") as typeof import("../lib/db");

function request(method: "PUT" | "DELETE", id: string, expectedVersion: number) {
    return new Request(`http://localhost/api/admin/menus/${id}`, {
        method, headers: { Origin: "http://localhost", "Content-Type": "application/json" },
        body: JSON.stringify(method === "PUT" ? { expectedVersion, name: "changed by fixture owner", allergenStatusBySlug: {} } : { expectedVersion }),
    });
}

async function main() {
    const previousMode = process.env.PORTFOLIO_MODE;
    process.env.PORTFOLIO_MODE = "false";
    const users: string[] = [];
    const shops: string[] = [];
    try {
        const master = await prisma.allergen.findMany({ select: { id: true } });
        assert.ok(master.length > 0, "Prepare the guarded fictional master first");
        const user = await prisma.user.create({ data: { clerkUserId: actor } });
        users.push(user.id);
        const own = await prisma.shop.create({ data: { userId: user.id, ownerClerkUserId: actor, isActive: true, name: `fictional A ${run}` } });
        shops.push(own.id);
        const otherUser = await prisma.user.create({ data: { clerkUserId: otherActor } });
        users.push(otherUser.id);
        const other = await prisma.shop.create({ data: { userId: otherUser.id, ownerClerkUserId: otherActor, isActive: true, name: `fictional B ${run}` } });
        shops.push(other.id);
        const create = (shopId = own.id) => prisma.menuItem.create({ data: {
            shopId, name: "original fixture", isPublished: false,
            allergenLinks: { create: master.map((a) => ({ allergenId: a.id, status: "FREE" })) },
        } });
        const snapshot = (id: string) => prisma.menuItem.findUnique({ where: { id }, include: { allergenLinks: { orderBy: { allergenId: "asc" } } } });
        const sentinel = await create();
        const sentinelBefore = await snapshot(sentinel.id);

        // Two real DB owners, not merely an unowned foreign shop. Only Clerk's
        // identity source is doubled; ownership queries and every mutation use PG.
        const ownedByA = await create();
        const ownedByB = await create(other.id);
        for (const menu of [ownedByA, ownedByB]) await publishReviewedFixture(prisma, menu.id);
        const pairIds = [ownedByA.id, ownedByB.id];
        const pairSnapshot = async () => ({
            menus: await Promise.all(pairIds.map(snapshot)),
            reviews: await prisma.menuFoodReview.findMany({ where: { menuItemId: { in: pairIds } }, orderBy: { id: "asc" } }),
            publications: await prisma.menuPublicationConfirmation.findMany({ where: { menuItemId: { in: pairIds } }, orderBy: { id: "asc" } }),
            successfulAudits: await prisma.auditLog.count({ where: { targetId: { in: pairIds }, success: true } }),
        });
        const pairBefore = await pairSnapshot();
        assert.ok(pairBefore.menus.every(menu => menu?.isPublished === true));
        try {
            for (const [identity, ownMenu, foreignMenu, ownShopId, foreignShopId] of [
                [actor, ownedByA, ownedByB, own.id, other.id],
                [otherActor, ownedByB, ownedByA, other.id, own.id],
            ] as const) {
                authenticatedActor = identity;
                const ownResponse = await route.GET(new Request(`http://localhost/api/admin/menus/${ownMenu.id}?shopId=${foreignShopId}`));
                assert.equal(ownResponse.status, 200, "Each actor must resolve a genuine owned shop, not be rejected globally");
                assert.equal((await ownResponse.json()).menu.shopId, ownShopId);
                const foreignVersion = (await snapshot(foreignMenu.id))!.version;
                for (const operation of ["GET", "PUT", "DELETE", "STOP", "PUBLISH"] as const) {
                    const method = operation === "STOP" ? "POST" : operation === "PUBLISH" ? "PUT" : operation;
                    const payload = operation === "PUBLISH" ? { expectedVersion: foreignVersion, publicationAction: "publish", shopId: foreignShopId }
                        : { expectedVersion: foreignVersion, name: "must never be saved by the other owner", shopId: foreignShopId, userId: foreignShopId };
                    const req = new Request(`http://localhost/api/admin/menus/${foreignMenu.id}${operation === "STOP" ? "/stop" : ""}`, {
                        method, headers: { Origin: "http://localhost", "Content-Type": "application/json" },
                        ...(operation === "GET" || operation === "STOP" ? {} : { body: JSON.stringify(payload) }),
                    });
                    const response = operation === "STOP" ? await route.STOP(req) : await route[method as "GET" | "PUT" | "DELETE"](req);
                    assert.equal(response.status, 404, `${operation}: authenticated foreign owner must not access the target`);
                    assert.deepEqual(await response.json(), { error: "menu not found" });
                    assert.deepEqual(await pairSnapshot(), pairBefore, `${operation}: both menus, links, food/publication records and success audits must be unchanged`);
                    assert.deepEqual(await snapshot(sentinel.id), sentinelBefore);
                }
            }
        } finally { authenticatedActor = actor; }
        console.log("PASS: real PostgreSQL A/B identity switching; own GET 200, cross-owner GET/PUT/DELETE/STOP/PUBLISH 404, both published fixtures/history/sentinel unchanged (Clerk identity doubled)");

        for (const method of ["PUT", "DELETE"] as const) {
            for (const interference of ["move", "delete"] as const) {
                const menu = await create();
                const expectedVersion = (await snapshot(menu.id))!.version;
                const originalFind = prisma.menuItem.findFirst;
                let expected: Awaited<ReturnType<typeof snapshot>> = null;
                let injected = false;
                prisma.menuItem.findFirst = (async (...args: Parameters<typeof originalFind>) => {
                    const row = await originalFind.apply(prisma.menuItem, args);
                    if (row && args[0]?.where?.id === menu.id && !injected) {
                        injected = true;
                        if (interference === "move") await prisma.menuItem.update({ where: { id: menu.id }, data: { shopId: other.id } });
                        else await prisma.menuItem.delete({ where: { id: menu.id } });
                        expected = await snapshot(menu.id);
                    }
                    return row;
                }) as typeof originalFind;
                try {
                    const response = await route[method](request(method, menu.id, expectedVersion));
                    assert.ok(injected, "Interference must occur after the real ownership read");
                    assert.equal(response.status, 404, `${method} ${interference}: expected ownership/missing rejection`);
                    assert.deepEqual(await response.json(), { error: "menu not found" });
                    assert.deepEqual(await snapshot(menu.id), expected, `${method} ${interference}: no fields/links may be changed after interference`);
                    assert.deepEqual(await snapshot(sentinel.id), sentinelBefore, "Unrelated own menu must remain unchanged");
                    console.log(`PASS: real PostgreSQL ${method} ${interference}; 404, unchanged fields/links/sentinel`);
                } finally { prisma.menuItem.findFirst = originalFind; }
            }
        }
        const normalUpdate = await create();
        const updated = await route.PUT(request("PUT", normalUpdate.id, (await snapshot(normalUpdate.id))!.version));
        assert.equal(updated.status, 200);
        assert.equal((await updated.json()).menu.shopId, own.id);
        assert.equal((await snapshot(normalUpdate.id))?.name, "changed by fixture owner");
        const deleted = await route.DELETE(request("DELETE", normalUpdate.id, (await snapshot(normalUpdate.id))!.version));
        assert.equal(deleted.status, 200);
        assert.deepEqual(await deleted.json(), { ok: true });
        assert.equal(await snapshot(normalUpdate.id), null);
        assert.equal(await prisma.menuItemAllergen.count({ where: { menuItemId: normalUpdate.id } }), 0);
        assert.deepEqual(await snapshot(sentinel.id), sentinelBefore);
        console.log("PASS: real PostgreSQL normal owner PUT/DELETE and successful link deletion");
    } finally {
        await prisma.auditLog.deleteMany({ where: { actorUserId: { in: users }, actorShopId: { in: shops } } });
        await prisma.shop.deleteMany({ where: { id: { in: shops } } });
        await prisma.user.deleteMany({ where: { id: { in: users } } });
        if (previousMode === undefined) delete process.env.PORTFOLIO_MODE;
        else process.env.PORTFOLIO_MODE = previousMode;
        await prisma.$disconnect();
    }
}
main().catch((error: unknown) => {
    console.error(error instanceof assert.AssertionError
        ? `FAIL: ${error.message.split("\n")[0]} (expected ${String(error.expected)}, actual ${String(error.actual)})`
        : "FAIL: owned-menu DB regression; guarded fictional target only");
    process.exitCode = 1;
});
