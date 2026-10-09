import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import { runAdminMenuDatabaseRegression } from "./admin-menu-database-regression";
import { publishReviewedFixture } from "./food-review-fixture";
import { runFoodReviewDatabaseRegression } from "./food-review-database-regression";

// Call only after the entry point's dedicated DB guard. No Clerk/Blob or shared
// master changes: all writes and cleanup belong to shops created by this run.
export async function runDatabaseRegression(db: PrismaClient) {
    const master = await db.allergen.findMany({ select: { id: true, slug: true } });
    assert.deepEqual(master.map((a) => a.slug).sort(), ALLERGEN_MASTER.map((a) => a.slug).sort(),
        "Dedicated database must contain the current allergen master");
    const run = randomUUID();
    const shopIds: string[] = [];
    const pass = (message: string) => console.log(`PASS: ${message}`);
    const uniqueError = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    const missingRecordError = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
    try {
        for (const suffix of ["a", "b"]) {
            const shop = await db.shop.create({ data: { name: `【架空・DB検証】${run}-${suffix}`, isActive: true } });
            shopIds.push(shop.id);
        }
        const [shopId, otherShopId] = shopIds;
        const links = (menuItemId: string) => master.map((a, index) => ({
            menuItemId, allergenId: a.id, status: index === 0 ? "MAY_CONTAIN" as const : "FREE" as const,
        }));
        const published = async (id: string) => (await db.menuItem.findUniqueOrThrow({ where: { id } })).isPublished;

        const missing = await db.menuItem.create({ data: { shopId, name: "未入力の公開要求", isPublished: true } });
        assert.equal(await published(missing.id), false);
        assert.equal(await db.auditLog.count({ where: { actorShopId: shopId, targetId: missing.id, action: "menu_unpublish", success: true } }), 1);
        pass("missing allergen records unpublish at commit and create one system audit event");

        const full = await db.$transaction(async (tx) => {
            const menu = await tx.menuItem.create({ data: { shopId, name: "完全な架空登録", isPublished: true } });
            await tx.menuItemAllergen.createMany({ data: links(menu.id) });
            await publishReviewedFixture(tx, menu.id);
            return menu;
        });
        assert.equal(await published(full.id), true);
        pass("deferred checks keep a complete MAY_CONTAIN menu published after commit");

        await db.$transaction(async (tx) => {
            await tx.menuItemAllergen.deleteMany({ where: { menuItemId: full.id } });
            await tx.menuItemAllergen.createMany({ data: links(full.id) });
        });
        assert.equal(await published(full.id), false);
        pass("replacing allergen links invalidates the food review even if input remains complete");

        await db.menuItemAllergen.update({ where: { menuItemId_allergenId: { menuItemId: full.id, allergenId: master[0].id } }, data: { status: "UNKNOWN" } });
        assert.equal(await published(full.id), false);
        pass("UNKNOWN update automatically unpublishes in PostgreSQL");

        await db.$transaction(async (tx) => {
            await tx.menuItemAllergen.update({ where: { menuItemId_allergenId: { menuItemId: full.id, allergenId: master[0].id } }, data: { status: "FREE" } });
            await publishReviewedFixture(tx, full.id);
        });
        assert.equal(await published(full.id), true);
        await db.menuItemAllergen.delete({ where: { menuItemId_allergenId: { menuItemId: full.id, allergenId: master[0].id } } });
        assert.equal(await published(full.id), false);
        pass("deleting an allergen link unpublishes an otherwise complete menu");

        const blank = await db.menuItem.create({ data: { shopId, name: "   ", isPublished: true,
            allergenLinks: { create: master.map((a) => ({ allergenId: a.id, status: "FREE" })) },
        } });
        assert.equal(await published(blank.id), false);
        pass("blank names cannot stay published even with complete allergen links");

        const before = await db.menuItem.count({ where: { shopId } });
        const beforeAudits = await db.auditLog.count({ where: { actorShopId: shopId } });
        await assert.rejects(db.$transaction(async (tx) => {
            await tx.menuItem.create({ data: { shopId, name: "rollback-only", isPublished: true } });
            throw new Error("intentional regression rollback");
        }), /intentional regression rollback/);
        assert.equal(await db.menuItem.count({ where: { shopId } }), before);
        assert.equal(await db.auditLog.count({ where: { actorShopId: shopId } }), beforeAudits);
        pass("failed transaction leaves neither a partial menu nor a trigger audit event");

        for (const operation of ["update", "delete"] as const) {
            const moved = await db.menuItem.create({ data: {
                shopId, name: `移転前${operation}`,
                allergenLinks: { create: master.map((allergen) => ({ allergenId: allergen.id, status: "FREE" })) },
            } });
            const priorRead = await db.menuItem.findFirst({ where: { id: moved.id, shopId } });
            assert.equal(priorRead?.id, moved.id);
            const linksBefore = await db.menuItemAllergen.findMany({
                where: { menuItemId: moved.id },
                select: { allergenId: true, status: true },
                orderBy: { allergenId: "asc" },
            });
            await db.menuItem.update({ where: { id: moved.id }, data: { shopId: otherShopId } });

            await assert.rejects(db.$transaction(async (tx) => {
                if (operation === "update") {
                    await tx.menuItem.update({
                        where: { id: moved.id, shopId },
                        data: { name: "変更してはいけない" },
                    });
                    await tx.menuItemAllergen.deleteMany({ where: { menuItemId: moved.id } });
                } else {
                    await tx.menuItemAllergen.deleteMany({ where: { menuItemId: moved.id } });
                    await tx.menuItem.delete({ where: { id: moved.id, shopId } });
                }
            }), missingRecordError);

            const after = await db.menuItem.findUniqueOrThrow({ where: { id: moved.id } });
            assert.equal(after.shopId, otherShopId);
            assert.equal(after.name, moved.name);
            assert.deepEqual(await db.menuItemAllergen.findMany({
                where: { menuItemId: moved.id },
                select: { allergenId: true, status: true },
                orderBy: { allergenId: "asc" },
            }), linksBefore);
            assert.equal((await db.menuItem.findUniqueOrThrow({ where: { id: full.id } })).shopId, shopId);
            pass(`scoped ${operation} rejects a menu moved after read without changing its links`);
        }

        await runAdminMenuDatabaseRegression(db, shopIds, run, master);
        await runFoodReviewDatabaseRegression(db, shopId, master);

        const inviteData = { email: `db-regression-${run}@example.invalid`, shopId, invitedByClerkUserId: "fixture-operator" };
        const pending = await db.adminInvite.create({ data: inviteData });
        await assert.rejects(db.adminInvite.create({ data: { ...inviteData, shopId: otherShopId } }), uniqueError);
        await assert.rejects(db.adminInvite.create({ data: { ...inviteData, email: `other-${run}@example.invalid` } }), uniqueError);
        assert.equal(await db.adminInvite.count({ where: { shopId: { in: shopIds } } }), 1);
        pass("pending invitation email and shop partial unique indexes both reject duplicates");

        // Hold the same row lock used by acceptance; a competing NOWAIT reader
        // must fail, then a stale pending-only update must not overwrite accepted.
        const stale = await db.adminInvite.findUniqueOrThrow({ where: { id: pending.id } });
        assert.equal(stale.status, "pending");
        await db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "AdminInvite" WHERE "id" = ${pending.id} FOR UPDATE NOWAIT`;
            await assert.rejects(db.$transaction(async (contender) => {
                await contender.$queryRaw`SELECT "id" FROM "AdminInvite" WHERE "id" = ${pending.id} FOR UPDATE NOWAIT`;
            }), (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError
                && error.code === "P2010" && error.meta?.code === "55P03");
            await tx.adminInvite.update({ where: { id: pending.id }, data: { status: "accepted" } });
        }, { timeout: 10000 });
        const cancelled = await db.adminInvite.updateMany({ where: { id: stale.id, status: "pending" }, data: { status: "revoked" } });
        assert.equal(cancelled.count, 0);
        assert.equal((await db.adminInvite.findUniqueOrThrow({ where: { id: pending.id } })).status, "accepted");
        pass("acceptance row locks reject a competitor and pending-only cancellation preserves accepted state");

        const replacement = await db.adminInvite.create({ data: inviteData });
        assert.equal(replacement.status, "pending");
        assert.equal(await db.adminInvite.count({ where: { shopId } }), 2);
        pass("terminal invitation history can coexist with a new pending invitation");

        const competing = await db.adminInvite.create({ data: { ...inviteData, shopId: otherShopId, email: `competing-${run}@example.invalid` } });
        await assert.rejects(db.$transaction(async (tx) => {
            await tx.adminInvite.updateMany({ where: { id: replacement.id, status: "pending" }, data: { status: "revoked" } });
            await tx.adminInvite.create({ data: { ...inviteData, email: competing.email } });
        }), uniqueError);
        assert.equal((await db.adminInvite.findUniqueOrThrow({ where: { id: replacement.id } })).status, "pending");
        assert.equal(await db.adminInvite.count({ where: { shopId: { in: shopIds } } }), 3);
        pass("a failed invitation replacement rolls back its preceding status transition");
    } finally {
        if (shopIds.length) {
            // AuditLog.actorShopId is not a foreign key: remove only this run's
            // trigger events as well as the shops and their cascading fixtures.
            await db.$transaction([
                db.auditLog.deleteMany({ where: { actorShopId: { in: shopIds } } }),
                db.shop.deleteMany({ where: { id: { in: shopIds } } }),
            ]);
        }
    }
}
