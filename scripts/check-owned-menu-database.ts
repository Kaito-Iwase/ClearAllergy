import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module, { createRequire } from "node:module";
import { assertCiDatabaseTarget } from "./ci-environment";
import { assertTestDatabaseTarget } from "./test-environment";

// Refuse a target before loading the DB or application modules. No migration/seed here.
if (process.env.CLEARALLERGY_TEST_ENV === "true") assertTestDatabaseTarget();
else assertCiDatabaseTarget();

const run = randomUUID();
const actor = `fictional-owned-menu-${run}`;
const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
const requireForTest = createRequire(import.meta.url);
let route: typeof import("../features/admin/menus/server/adminMenuRoute");
try {
    loader._load = function (id, ...args) {
        if (id === "next/cache") return { revalidatePath: () => {} };
        if (id === "@clerk/nextjs/server") return {
            auth: async () => ({ userId: actor }),
            currentUser: async () => ({ publicMetadata: {}, externalId: null }),
        };
        return originalLoad.call(this, id, ...args);
    };
    route = requireForTest("../features/admin/menus/server/adminMenuRoute.ts");
} finally { loader._load = originalLoad; }
const { prisma } = requireForTest("../lib/db") as typeof import("../lib/db");

function request(method: "PUT" | "DELETE", id: string) {
    return new Request(`http://localhost/api/admin/menus/${id}`, {
        method, headers: { Origin: "http://localhost", "Content-Type": "application/json" },
        ...(method === "PUT" ? { body: JSON.stringify({ name: "changed by fixture owner", allergenStatusBySlug: {} }) } : {}),
    });
}

async function main() {
    const previousMode = process.env.PORTFOLIO_MODE;
    process.env.PORTFOLIO_MODE = "false";
    let userId: string | undefined;
    const shops: string[] = [];
    try {
        const master = await prisma.allergen.findMany({ select: { id: true } });
        assert.ok(master.length > 0, "Prepare the guarded fictional master first");
        const user = await prisma.user.create({ data: { clerkUserId: actor } });
        userId = user.id;
        const own = await prisma.shop.create({ data: { userId, ownerClerkUserId: actor, isActive: true, name: `fictional A ${run}` } });
        shops.push(own.id);
        const other = await prisma.shop.create({ data: { isActive: true, name: `fictional B ${run}` } });
        shops.push(other.id);
        const create = () => prisma.menuItem.create({ data: {
            shopId: own.id, name: "original fixture", isPublished: true,
            allergenLinks: { create: master.map((a) => ({ allergenId: a.id, status: "FREE" })) },
        } });
        const snapshot = (id: string) => prisma.menuItem.findUnique({ where: { id }, include: { allergenLinks: { orderBy: { allergenId: "asc" } } } });
        const sentinel = await create();
        const sentinelBefore = await snapshot(sentinel.id);

        for (const method of ["PUT", "DELETE"] as const) {
            for (const interference of ["move", "delete"] as const) {
                const menu = await create();
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
                    const response = await route[method](request(method, menu.id));
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
        const updated = await route.PUT(request("PUT", normalUpdate.id));
        assert.equal(updated.status, 200);
        assert.equal((await updated.json()).menu.shopId, own.id);
        assert.equal((await snapshot(normalUpdate.id))?.name, "changed by fixture owner");
        const deleted = await route.DELETE(request("DELETE", normalUpdate.id));
        assert.equal(deleted.status, 200);
        assert.deepEqual(await deleted.json(), { ok: true });
        assert.equal(await snapshot(normalUpdate.id), null);
        assert.equal(await prisma.menuItemAllergen.count({ where: { menuItemId: normalUpdate.id } }), 0);
        assert.deepEqual(await snapshot(sentinel.id), sentinelBefore);
        console.log("PASS: real PostgreSQL normal owner PUT/DELETE and successful link deletion");
    } finally {
        await prisma.auditLog.deleteMany({ where: { actorUserId: userId ?? "not-created", actorShopId: { in: shops } } });
        await prisma.shop.deleteMany({ where: { id: { in: shops } } });
        if (userId) await prisma.user.delete({ where: { id: userId } });
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
