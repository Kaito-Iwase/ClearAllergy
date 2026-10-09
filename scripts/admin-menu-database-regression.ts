import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../lib/db";
import { publishReviewedFixture } from "./food-review-fixture";
import { randomUUID } from "node:crypto";

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
    let failCache = false;
    const originalFindFirst = prisma.menuItem.findFirst;
    const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
    const originalLoad = loader._load;
    try {
        await db.shop.update({ where: { id: shopId }, data: { ownerClerkUserId: clerkId, userId: user.id } });
        process.env.PORTFOLIO_MODE = "false";
        let route: typeof import("../features/admin/menus/server/adminMenuRoute");
        let collectionRoute: typeof import("../features/admin/menus/server/adminMenusRoute");
        try {
            loader._load = function (id, ...args) {
                if (id === "next/cache") return { revalidatePath: (path: string) => { if (failCache) throw new Error("intentional cache failure"); revalidated.push(path); } };
                if (id === "@clerk/nextjs/server") return {
                    auth: async () => ({ userId: clerkId }),
                    currentUser: async () => ({ publicMetadata: {}, externalId: null }),
                };
                return originalLoad.call(this, id, ...args);
            };
            route = createRequire(import.meta.url)("../features/admin/menus/server/adminMenuRoute.ts");
            collectionRoute = createRequire(import.meta.url)("../features/admin/menus/server/adminMenusRoute.ts");
        } finally { loader._load = originalLoad; }

        const snapshot = () => db.menuItem.findMany({
            where: { shopId: { in: shopIds } }, orderBy: { id: "asc" },
            include: { allergenLinks: { orderBy: { allergenId: "asc" } } },
        });
        const createMenu = (name: string) => db.$transaction(async tx => {
        const menu = await tx.menuItem.create({ data: {
            shopId, name, description: "架空の原文", priceYen: 1000,
            ingredients: "架空の原材料", precaution: "架空の注意", isPublished: true,
            allergenLinks: { create: master.map((a) => ({ allergenId: a.id, status: "FREE" })) },
        } });
        return publishReviewedFixture(tx, menu.id);
        });
        const request = (method: "PUT" | "DELETE", id: string, version = 0) => new Request(
            `http://localhost/api/admin/menus/${id}`, {
                method, headers: { Origin: "http://localhost", "Content-Type": "application/json" },
                ...(method === "PUT" ? { body: JSON.stringify({
                    name: "変更してはいけない", description: "書換要求", priceYen: 2000,
                    expectedVersion: version,
                    allergenStatusBySlug: { [master[0].slug]: "CONTAINS" },
                }) } : { body: JSON.stringify({ expectedVersion: version }) }),
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
                    if (args.where?.id === target.id && !observedRead) {
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
                    const response = await route[method](request(method, target.id, target.version));
                    assert.equal(observedRead, true);
                    assert.equal(response.status, 404);
                    assert.equal(sawP2025, true);
                    assert.deepEqual(await response.json(), { error: "menu not found" });
                    assert.deepEqual(await snapshot(), afterConcurrentChange);
                    assert.equal(linkDeleteAttempted, false);
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
        const updated = await route.PUT(request("PUT", normal.id, normal.version));
        assert.equal(updated.status, 200);
        const body = await updated.json() as { menu: { id: string; shopId: string; name: string; isPublished: boolean } };
        assert.deepEqual(Object.keys(body), ["menu"]);
        assert.equal(body.menu.id, normal.id);
        assert.equal(body.menu.shopId, shopId);
        assert.equal(body.menu.name, "変更してはいけない");
        assert.equal(body.menu.isPublished, false);
        const saved = await db.menuItem.findUniqueOrThrow({ where: { id: normal.id }, include: { allergenLinks: true } });
        assert.equal(saved.priceYen, 2000);
        assert.equal(saved.allergenLinks.length, master.length);
        assert.equal(saved.allergenLinks.find((link) => link.allergenId === master[0].id)?.status, "CONTAINS");
        assert.ok(revalidated.length > 0);
        const deleted = await route.DELETE(request("DELETE", normal.id, saved.version));
        assert.equal(deleted.status, 200);
        assert.deepEqual(await deleted.json(), { ok: true });
        assert.equal(await db.menuItem.count({ where: { id: normal.id } }), 0);
        assert.equal(await db.menuItemAllergen.count({ where: { menuItemId: normal.id } }), 0);
        assert.equal(await db.auditLog.count({ where: { actorShopId: shopId, targetId: normal.id, success: true } }), 2);
        console.log("PASS: real route own-shop PUT/DELETE retain success DTO, saved fields/links, audits and cache invalidation");

        const put = (id: string, data: Record<string, unknown>) => new Request(`http://localhost/api/admin/menus/${id}`, {
            method: "PUT", headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify(data),
        });
        const stale = await createMenu("【架空】古い全体フォーム");
        assert.equal((await route.PUT(put(stale.id, { expectedVersion: stale.version, allergenStatusBySlug: { [master[0].slug]: "CONTAINS" } }))).status, 200);
        const corrected = await db.menuItem.findUniqueOrThrow({ where: { id: stale.id }, include: { allergenLinks: true, foodReviews: true } });
        const staleResponse = await route.PUT(put(stale.id, { expectedVersion: stale.version, name: stale.name, allergenStatusBySlug: Object.fromEntries(master.map(a => [a.slug, "FREE"])) }));
        assert.equal(staleResponse.status, 409);
        assert.equal((await route.DELETE(request("DELETE", stale.id, stale.version))).status, 409);
        assert.deepEqual(await db.menuItem.findUniqueOrThrow({ where: { id: stale.id }, include: { allergenLinks: true, foodReviews: true } }), corrected);
        console.log("PASS: stale full-form PUT and DELETE return 409 and preserve the newer CONTAINS correction");

        const concurrent = await createMenu("【架空】同時保存");
        let release!: () => void;
        const barrier = new Promise<void>(resolve => { release = resolve; });
        let reads = 0;
        prisma.menuItem.findFirst = (async (args: Prisma.MenuItemFindFirstArgs) => {
            const found = await originalFindFirst.call(prisma.menuItem, args);
            if (args.where?.id === concurrent.id && reads < 2) { reads++; if (reads === 2) release(); await barrier; }
            return found;
        }) as unknown as typeof originalFindFirst;
        try {
            const responses = await Promise.all([301, 302].map(priceYen => route.PUT(put(concurrent.id, { expectedVersion: concurrent.version, priceYen }))));
            assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
            const savedConcurrent = await db.menuItem.findUniqueOrThrow({ where: { id: concurrent.id } });
            assert.ok([301, 302].includes(savedConcurrent.priceYen!));
            assert.equal(savedConcurrent.isPublished, true);
        } finally { prisma.menuItem.findFirst = originalFindFirst; }
        console.log("PASS: two real PUT handlers reading the same version produce one 200 and one 409");

        const review = { evidenceRefs: "架空製品仕様 test-v1（実食品の証拠ではない）", scope: "架空の構成品と全対象品目", checkedAt: new Date().toISOString(), unresolvedIssues: "" };
        const beforeReviewFailure = await db.menuItem.findUniqueOrThrow({ where: { id: concurrent.id }, include: { allergenLinks: true, foodReviews: true } });
        const originalTransaction = prisma.$transaction;
        prisma.$transaction = (async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => originalTransaction.call(prisma, async (tx: Prisma.TransactionClient) => {
            tx.menuFoodReview.create = (async () => { throw new Error("intentional review insert failure"); }) as unknown as typeof tx.menuFoodReview.create;
            return work(tx);
        })) as typeof originalTransaction;
        try {
            const failed = await route.PUT(put(concurrent.id, { expectedVersion: beforeReviewFailure.version, ingredients: "変更要求", foodReview: review, isPublished: true }));
            assert.equal(failed.status, 500);
            assert.deepEqual(await db.menuItem.findUniqueOrThrow({ where: { id: concurrent.id }, include: { allergenLinks: true, foodReviews: true } }), beforeReviewFailure);
        } finally { prisma.$transaction = originalTransaction; }
        console.log("PASS: a real route review insertion failure rolls back menu, links, publication and evidence");

        failCache = true;
        const pending = await route.PUT(put(concurrent.id, { expectedVersion: beforeReviewFailure.version, priceYen: 303 }));
        assert.equal(pending.status, 200);
        assert.equal((await pending.json()).publicRefreshPending, true);
        assert.equal((await db.menuItem.findUniqueOrThrow({ where: { id: concurrent.id } })).priceYen, 303);
        const operationId = randomUUID();
        const postData = { operationId, name: "【架空】再送", isPublished: true, allergenStatusBySlug: Object.fromEntries(master.map(a => [a.slug, "FREE"])), foodReview: review };
        const post = (data: object) => collectionRoute.POST(new Request("http://localhost/api/admin/menus", { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify(data) }));
        const created = await post(postData);
        assert.equal(created.status, 201);
        const createdBody = await created.json();
        assert.equal(createdBody.publicRefreshPending, true);
        const replay = await post(postData);
        assert.equal(replay.status, 201);
        assert.deepEqual(await replay.json(), createdBody);
        assert.equal(await db.menuItem.count({ where: { shopId, creationOperationId: operationId } }), 1);
        assert.equal((await post({ ...postData, name: "別の内容" })).status, 409);
        failCache = false;
        assert.deepEqual(await (await post(postData)).json(), { id: createdBody.id });
        console.log("PASS: cache failure returns saved success/pending; identical POST replay reuses one menu, changed payload is 409");

        const stopBefore = await db.menuItem.findUniqueOrThrow({ where: { id: createdBody.id }, include: { allergenLinks: true, foodReviews: true } });
        const stopped = await route.STOP(new Request(`http://localhost/api/admin/menus/${createdBody.id}/stop`, { method: "POST", headers: { Origin: "http://localhost" } }));
        assert.equal(stopped.status, 200);
        const stopAfter = await db.menuItem.findUniqueOrThrow({ where: { id: createdBody.id }, include: { allergenLinks: true, foodReviews: true } });
        assert.equal(stopAfter.isPublished, false);
        assert.equal(stopAfter.ingredients, stopBefore.ingredients);
        assert.equal(stopAfter.foodVersion, stopBefore.foodVersion);
        assert.deepEqual(stopAfter.allergenLinks, stopBefore.allergenLinks);
        assert.deepEqual(stopAfter.foodReviews, stopBefore.foodReviews);
        console.log("PASS: dedicated STOP works without form/review input and preserves saved food content and evidence");
    } finally {
        loader._load = originalLoad;
        prisma.menuItem.findFirst = originalFindFirst;
        if (previousMode === undefined) delete process.env.PORTFOLIO_MODE;
        else process.env.PORTFOLIO_MODE = previousMode;
        await prisma.$disconnect();
        await db.user.delete({ where: { id: user.id } });
    }
}
