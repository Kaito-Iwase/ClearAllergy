import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assertCiDatabaseTarget } from "./ci-environment";
import { assertTestDatabaseTarget } from "./test-environment";

async function main() {
    // Nothing that loads Prisma, the application DB or fixture writers precedes
    // these existing target guards. This script never migrates, seeds or resets.
    try {
        if (process.env.CLEARALLERGY_TEST_ENV === "true") assertTestDatabaseTarget();
        else assertCiDatabaseTarget();
    } catch {
        console.error("REFUSED: admin menu list DB target check failed before loading Prisma.");
        process.exitCode = 1;
        return;
    }

    const [{ PrismaClient }, { adminMenuListSelect, toAdminMenuListRow }, { publishReviewedFixture }] = await Promise.all([
        import("@prisma/client"),
        import("../features/admin/menus/server/menu-list-data"),
        import("./food-review-fixture"),
    ]);
    const db = new PrismaClient();
    const run = randomUUID();
    let createdShopId: string | undefined;
    try {
        const master = await db.allergen.findMany({
            orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, nameJa: true },
        });
        assert.ok(master.length > 0, "Prepare the existing guarded fictional master first");
        const unknownAllergen = master[0];
        const shop = await db.shop.create({ data: { name: `fictional menu-list ${run}`, isActive: true } });
        createdShopId = shop.id;
        const createMenu = async (label: string, reviewed = false, unknown = false) => db.$transaction(async tx => {
            const menu = await tx.menuItem.create({ data: {
                shopId: shop.id, name: `fictional ${label}`, ingredients: "fictional original ingredient",
                isPublished: false,
                allergenLinks: { create: master.map(allergen => ({
                    allergenId: allergen.id,
                    status: unknown && allergen.id === unknownAllergen.id ? "UNKNOWN" : "FREE",
                })) },
            } });
            if (reviewed) await publishReviewedFixture(tx, menu.id);
            return menu.id;
        });
        const read = (id: string) => db.menuItem.findFirstOrThrow({
            where: { id, shopId: shop.id }, select: adminMenuListSelect,
        });

        const missingId = await createMenu("missing");
        const currentId = await createMenu("current", true);
        const stoppedId = await createMenu("normal stop", true);
        const beforeStop = await read(stoppedId);
        await db.menuItem.update({ where: { id: stoppedId, shopId: shop.id }, data: { isPublished: false } });
        const outdatedId = await createMenu("food change", true);
        const beforeChange = await read(outdatedId);
        await db.menuItem.update({ where: { id: outdatedId, shopId: shop.id }, data: { ingredients: "fictional revised ingredient" } });
        const unresolvedId = await createMenu("latest unresolved", true);
        const beforeUnresolved = await read(unresolvedId);
        const privateEvidence = `fictional-private-evidence-${run}`;
        const privateActor = `fictional-private-actor-${run}`;
        const privateUnresolved = `fictional-private-unresolved-${run}`;
        await db.menuFoodReview.create({ data: {
            menuItemId: unresolvedId, foodVersion: beforeUnresolved.foodVersion,
            contentSnapshot: {}, evidenceRefs: privateEvidence, scope: "fictional only; not a real food review",
            checkedAt: new Date(), actorUserId: privateActor, unresolvedIssues: privateUnresolved,
        } });
        // A synthetic current record must not erase UNKNOWN or bypass the
        // existing publication trigger's separate all-allergen requirement.
        const unknownId = await createMenu("unknown allergen", true, true);

        const selected = await db.menuItem.findMany({
            where: { shopId: shop.id }, orderBy: { updatedAt: "desc" }, select: adminMenuListSelect,
        });
        const ids = [missingId, currentId, stoppedId, outdatedId, unresolvedId, unknownId];
        assert.deepEqual(selected.map(menu => menu.id).sort(), [...ids].sort(), "The list query stays inside its newly created shop");
        const rows = new Map(selected.map(menu => [menu.id, toAdminMenuListRow(menu, master)]));
        const raw = new Map(selected.map(menu => [menu.id, menu]));
        const row = (id: string) => { const value = rows.get(id); assert.ok(value); return value; };
        const source = (id: string) => { const value = raw.get(id); assert.ok(value); return value; };

        assert.equal(row(missingId).foodReviewState, "missing");
        assert.equal(source(missingId).foodReviews.length, 0);
        assert.equal(row(missingId).isPublished, false);
        console.log("PASS: real PostgreSQL list projection: missing food review");

        assert.equal(row(currentId).foodReviewState, "current");
        assert.equal(row(currentId).isPublished, true);
        assert.equal(source(currentId).foodReviews[0].foodVersion, source(currentId).foodVersion);
        console.log("PASS: real PostgreSQL list projection: current synthetic review and published");

        assert.equal(row(stoppedId).foodReviewState, "current");
        assert.equal(row(stoppedId).isPublished, false);
        assert.equal(source(stoppedId).foodVersion, beforeStop.foodVersion);
        assert.equal(source(stoppedId).reviewedFoodVersion, beforeStop.reviewedFoodVersion);
        console.log("PASS: real PostgreSQL list projection: normal STOP preserves current review");

        assert.equal(row(outdatedId).foodReviewState, "outdated");
        assert.equal(row(outdatedId).isPublished, false);
        assert.ok(source(outdatedId).foodVersion > beforeChange.foodVersion);
        assert.equal(source(outdatedId).reviewedFoodVersion, null);
        console.log("PASS: real PostgreSQL list projection: food change invalidates the old review");

        assert.equal(row(unresolvedId).foodReviewState, "unresolved");
        assert.equal(row(unresolvedId).isPublished, false);
        assert.equal(source(unresolvedId).reviewedFoodVersion, null);
        assert.equal(source(unresolvedId).foodReviews.length, 1);
        assert.equal(source(unresolvedId).foodReviews[0].unresolvedIssues, privateUnresolved);
        const history = await db.menuFoodReview.findMany({
            where: { menuItemId: unresolvedId, menuItem: { shopId: shop.id } },
            orderBy: { reviewSequence: "desc" }, select: { foodVersion: true, unresolvedIssues: true },
        });
        assert.equal(history.length, 2);
        assert.equal(history[0].unresolvedIssues, privateUnresolved);
        assert.equal(history[1].unresolvedIssues, null);
        console.log("PASS: real PostgreSQL list projection: latest unresolved outranks an earlier clean record");

        assert.deepEqual(row(unknownId).unknownAllergenNames, [unknownAllergen.nameJa]);
        assert.equal(row(unknownId).foodReviewState, "current");
        assert.equal(row(unknownId).isPublished, false);
        assert.equal(source(unknownId).allergenLinks.find(link => link.allergen.slug === unknownAllergen.slug)?.status, "UNKNOWN");
        console.log("PASS: real PostgreSQL list projection: UNKNOWN stays separate and cannot publish");

        for (const value of rows.values()) {
            for (const key of ["foodReviews", "foodVersion", "reviewedFoodVersion", "evidenceRefs", "scope", "actorUserId", "contentSnapshot", "unresolvedIssues"]) {
                assert.ok(!(key in value), "Private review fields must not enter the shared listing DTO");
            }
        }
        const serialized = JSON.stringify([...rows.values()]);
        for (const value of [privateEvidence, privateActor, privateUnresolved, "synthetic-fixture", "架空テストデータの定義"]) {
            assert.ok(!serialized.includes(value), "Private review values must not enter the shared listing DTO");
        }
        console.log("PASS: real PostgreSQL shared listing DTO excludes evidence, actor, snapshot and unresolved text");
    } finally {
        try {
            if (createdShopId) {
                await db.auditLog.deleteMany({ where: { actorShopId: createdShopId } });
                await db.shop.deleteMany({ where: { id: createdShopId } });
            }
        } finally { await db.$disconnect(); }
    }
}

main().catch(() => {
    console.error("FAIL: guarded fictional admin menu list DB regression; inspect the last completed check. Raw database errors are not logged.");
    process.exitCode = 1;
});
