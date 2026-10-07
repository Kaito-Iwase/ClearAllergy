import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../lib/db";

// Only called after the dedicated DB guard. Clerk and Next cache are replaced
// in this script process; auth/ownership queries, route transactions and audits
// use real PostgreSQL. The observer client commits a change after the route read.
export async function runAdminMenuDatabaseRegression(
    db: PrismaClient, shopIds: string[], run: string,
    master: Array<{ id: string; slug: string }>,
) {
    const [shopId, otherShopId] = shopIds;
    const clerkId = `db-regression-${run}`;
    const user = await db.user.create({ data: { clerkUserId: clerkId } });
    const previousMode = process.env.PORTFOLIO_MODE;
    const revalidated: string[] = [];
    const originalFindFirst = prisma.menuItem.findFirst;
    const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
    const originalLoad = loader._load;
    try {
        await db.shop.update({ where: { id: shopId }, data: { ownerClerkUserId: clerkId, userId: user.id } });
        process.env.PORTFOLIO_MODE = "false";
        let route: typeof import("../features/admin/menus/server/adminMenuRoute");
        try {
            loader._load = function (id, ...args) {
                if (id === "next/cache") return { revalidatePath: (path: string) => { revalidated.push(path); } };
                if (id === "@clerk/nextjs/server") return {
                    auth: async () => ({ userId: clerkId }),
                    currentUser: async () => ({ publicMetadata: {}, externalId: null }),
                };
                return originalLoad.call(this, id, ...args);
            };
            route = createRequire(import.meta.url)("../features/admin/menus/server/adminMenuRoute.ts");
        } finally { loader._load = originalLoad; }

        const snapshot = () => db.menuItem.findMany({
            where: { shopId: { in: shopIds } }, orderBy: { id: "asc" },
            include: { allergenLinks: { orderBy: { allergenId: "asc" } } },
        });
        const createMenu = (name: string) => db.menuItem.create({ data: {
            shopId, name, description: "架空の原文", priceYen: 1000,
            ingredients: "架空の原材料", precaution: "架空の注意", isPublished: true,
            allergenLinks: { create: master.map((a) => ({ allergenId: a.id, status: "FREE" })) },
        } });
        const request = (method: "PUT" | "DELETE", id: string) => new Request(
            `http://localhost/api/admin/menus/${id}`, {
                method, headers: { Origin: "http://localhost", "Content-Type": "application/json" },
                ...(method === "PUT" ? { body: JSON.stringify({
                    name: "変更してはいけない", description: "書換要求", priceYen: 2000,
                    allergenStatusBySlug: { [master[0].slug]: "CONTAINS" },
                }) } : {}),
            },
        );

        // Deterministic read -> committed move/delete -> final write schedule.
        // No sleep-based races and no fake Prisma errors or transaction results.
        for (const mutation of ["move", "disappear"] as const) {
            for (const method of ["PUT", "DELETE"] as const) {
                const target = await createMenu(`【架空】${mutation}-${method}`);
                let afterConcurrentChange: Awaited<ReturnType<typeof snapshot>> | undefined;
                let observedRead = false;
                let linkDeleteAttempted = false;
                let sawP2025 = false;
                const originalTransaction = prisma.$transaction;
                prisma.menuItem.findFirst = (async (args: Prisma.MenuItemFindFirstArgs) => {
                    const existing = await originalFindFirst.call(prisma.menuItem, args);
                    if (args.where?.id === target.id) {
                        assert.equal(args.where.shopId, shopId);
                        assert.ok(existing);
                        assert.equal(observedRead, false);
                        observedRead = true;
                        if (mutation === "move") await db.menuItem.update({ where: { id: target.id }, data: { shopId: otherShopId } });
                        else await db.menuItem.delete({ where: { id: target.id } });
                        afterConcurrentChange = await snapshot();
                    }
                    return existing;
                }) as unknown as typeof originalFindFirst;
                prisma.$transaction = (async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
                    try {
                        return await originalTransaction.call(prisma, async (tx: Prisma.TransactionClient) => {
                            const originalDeleteMany = tx.menuItemAllergen.deleteMany;
                            tx.menuItemAllergen.deleteMany = (async (args: Prisma.MenuItemAllergenDeleteManyArgs) => {
                                linkDeleteAttempted = true;
                                return originalDeleteMany.call(tx.menuItemAllergen, args);
                            }) as typeof originalDeleteMany;
                            return work(tx);
                        });
                    } catch (error) {
                        sawP2025 = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
                        throw error;
                    }
                }) as typeof originalTransaction;
                try {
                    revalidated.length = 0;
                    const response = await route[method](request(method, target.id));
                    assert.equal(observedRead, true);
                    assert.equal(response.status, 404);
                    assert.equal(sawP2025, true);
                    assert.deepEqual(await response.json(), { error: "menu not found" });
                    assert.deepEqual(await snapshot(), afterConcurrentChange);
                    assert.equal(linkDeleteAttempted, method === "DELETE");
                    assert.deepEqual(revalidated, []);
                    const audits = await db.auditLog.findMany({ where: { actorShopId: shopId, targetId: target.id } });
                    assert.equal(audits.length, 1);
                    assert.equal(audits[0].success, false);
                    assert.equal((audits[0].metadata as Record<string, unknown>).reason, "menu_not_found");
                    console.log(`PASS: real route ${method} after ${mutation} returns 404; all A/B fields and links unchanged; failure audit only`);
                } finally {
                    prisma.menuItem.findFirst = originalFindFirst;
                    prisma.$transaction = originalTransaction;
                }
            }
        }

        const normal = await createMenu("【架空】正常操作");
        revalidated.length = 0;
        const updated = await route.PUT(request("PUT", normal.id));
        assert.equal(updated.status, 200);
        const body = await updated.json() as { menu: { id: string; shopId: string; name: string; isPublished: boolean } };
        assert.deepEqual(Object.keys(body), ["menu"]);
        assert.equal(body.menu.id, normal.id);
        assert.equal(body.menu.shopId, shopId);
        assert.equal(body.menu.name, "変更してはいけない");
        assert.equal(body.menu.isPublished, true);
        const saved = await db.menuItem.findUniqueOrThrow({ where: { id: normal.id }, include: { allergenLinks: true } });
        assert.equal(saved.priceYen, 2000);
        assert.equal(saved.allergenLinks.length, master.length);
        assert.equal(saved.allergenLinks.find((link) => link.allergenId === master[0].id)?.status, "CONTAINS");
        assert.ok(revalidated.length > 0);
        const deleted = await route.DELETE(request("DELETE", normal.id));
        assert.equal(deleted.status, 200);
        assert.deepEqual(await deleted.json(), { ok: true });
        assert.equal(await db.menuItem.count({ where: { id: normal.id } }), 0);
        assert.equal(await db.menuItemAllergen.count({ where: { menuItemId: normal.id } }), 0);
        assert.equal(await db.auditLog.count({ where: { actorShopId: shopId, targetId: normal.id, success: true } }), 2);
        console.log("PASS: real route own-shop PUT/DELETE retain success DTO, saved fields/links, audits and cache invalidation");
    } finally {
        loader._load = originalLoad;
        prisma.menuItem.findFirst = originalFindFirst;
        if (previousMode === undefined) delete process.env.PORTFOLIO_MODE;
        else process.env.PORTFOLIO_MODE = previousMode;
        await prisma.$disconnect();
        await db.user.delete({ where: { id: user.id } });
    }
}
