import assert from "node:assert/strict";
import { type PrismaClient } from "@prisma/client";
import { publishReviewedFixture } from "./food-review-fixture";

export async function runFoodReviewDatabaseRegression(db: PrismaClient, shopId: string, master: Array<{ id: string; slug: string }>) {
    const read = (id: string) => db.menuItem.findUniqueOrThrow({ where: { id } });
    const menu = await db.$transaction(async tx => {
        const created = await tx.menuItem.create({ data: { shopId, name: "【架空】食品確認の回帰", ingredients: "旧仕様", allergenLinks: {
            create: master.map(a => ({ allergenId: a.id, status: a.slug === "egg" ? "CONTAINS" : "FREE" })),
        } } });
        return publishReviewedFixture(tx, created.id);
    });
    assert.equal((await read(menu.id)).isPublished, true);
    assert.equal(await db.menuFoodReview.count({ where: { menuItemId: menu.id } }), 1);
    console.log("PASS: review bound to current food content can publish CONTAINS; confirmed does not mean FREE");

    const beforePrice = await read(menu.id);
    const writers = await Promise.allSettled([101, 202].map(priceYen => db.menuItem.update({ where: { id: menu.id, shopId, version: beforePrice.version }, data: { priceYen } })));
    assert.equal(writers.filter(r => r.status === "fulfilled").length, 1);
    const rejected = writers.find(r => r.status === "rejected") as PromiseRejectedResult;
    assert.equal(rejected.reason.code, "P2025");
    const afterPrice = await read(menu.id);
    assert.equal(afterPrice.foodVersion, beforePrice.foodVersion);
    assert.equal(afterPrice.reviewedFoodVersion, beforePrice.reviewedFoodVersion);
    assert.equal(afterPrice.isPublished, true);
    console.log("PASS: one of two stale writers succeeds; price edit preserves food review");

    await db.menuItem.update({ where: { id: menu.id }, data: { ingredients: "新仕様" } });
    const changed = await read(menu.id);
    assert.ok(changed.foodVersion > afterPrice.foodVersion);
    assert.equal(changed.reviewedFoodVersion, null);
    assert.equal(changed.isPublished, false);
    await db.menuItem.update({ where: { id: menu.id }, data: { isPublished: true } });
    assert.equal((await read(menu.id)).isPublished, false);
    await db.menuItem.update({ where: { id: menu.id }, data: { ingredients: "旧仕様" } });
    assert.equal((await read(menu.id)).isPublished, false);
    assert.equal(await db.menuFoodReview.count({ where: { menuItemId: menu.id } }), 1);
    console.log("PASS: food changes, reversion and unreviewed direct publication cannot reuse old confirmation");

    await db.$transaction(tx => publishReviewedFixture(tx, menu.id));
    await db.menuItemAllergen.update({ where: { menuItemId_allergenId: { menuItemId: menu.id, allergenId: master[0].id } }, data: { status: "MAY_CONTAIN" } });
    assert.equal((await read(menu.id)).isPublished, false);
    assert.equal((await read(menu.id)).reviewedFoodVersion, null);
    console.log("PASS: direct child write invalidates parent revision and food confirmation");

    await db.$transaction(tx => publishReviewedFixture(tx, menu.id));
    const beforeReported = await read(menu.id);
    await db.menuItem.update({ where: { id: menu.id }, data: { foodVersion: { increment: 1 } } });
    const reported = await read(menu.id);
    assert.equal(reported.ingredients, beforeReported.ingredients);
    assert.equal(reported.isPublished, false);
    console.log("PASS: a reported supply/process change invalidates review even when text is unchanged");

    const beforeRollback = await read(menu.id);
    const reviews = await db.menuFoodReview.count({ where: { menuItemId: menu.id } });
    await assert.rejects(db.$transaction(async tx => { await publishReviewedFixture(tx, menu.id); throw new Error("intentional review rollback"); }), /intentional review rollback/);
    assert.deepEqual(await read(menu.id), beforeRollback);
    assert.equal(await db.menuFoodReview.count({ where: { menuItemId: menu.id } }), reviews);
    const recorded = await db.menuFoodReview.findFirstOrThrow({ where: { menuItemId: menu.id } });
    await assert.rejects(db.menuFoodReview.update({ where: { id: recorded.id }, data: { evidenceRefs: "overwrite" } }), /append-only/);
    assert.equal((await db.menuFoodReview.findUniqueOrThrow({ where: { id: recorded.id } })).evidenceRefs, recorded.evidenceRefs);
    console.log("PASS: failed review transaction rolls back record/publication; previous evidence is append-only");

    await db.$transaction(tx => publishReviewedFixture(tx, menu.id));
    const beforeMaster = await read(menu.id);
    await assert.rejects(db.$transaction(async tx => {
        await tx.allergen.update({ where: { id: master[0].id }, data: { nameJa: "検査用の別名称" } });
        assert.equal((await tx.menuItem.findUniqueOrThrow({ where: { id: menu.id } })).isPublished, false);
        throw new Error("intentional master rollback");
    }), /intentional master rollback/);
    assert.deepEqual(await read(menu.id), beforeMaster);
    console.log("PASS: master name changes invalidate confirmation; test changes are rolled back");

    const current = await db.menuFoodReview.findFirstOrThrow({ where: { menuItemId: menu.id, foodVersion: beforeMaster.foodVersion } });
    await db.menuFoodReview.delete({ where: { id: current.id } });
    assert.equal((await read(menu.id)).isPublished, false);
    console.log("PASS: deleting the current evidence cannot leave a confirmed publication");

    await db.$transaction(tx => publishReviewedFixture(tx, menu.id));
    const reviewed = await read(menu.id);
    const reviewData = {
        menuItemId: menu.id, foodVersion: reviewed.foodVersion, contentSnapshot: { name: "fabricated old food" },
        evidenceRefs: "架空の敵対的回帰", scope: "架空の全品目", checkedAt: new Date(), actorUserId: "synthetic-fixture",
    };
    const unresolved = await db.menuFoodReview.create({ data: { ...reviewData, unresolvedIssues: "仕入れ仕様を再確認" } });
    assert.equal((await read(menu.id)).isPublished, false);
    assert.equal((await read(menu.id)).reviewedFoodVersion, null);
    await db.menuItem.update({ where: { id: menu.id }, data: { reviewedFoodVersion: reviewed.foodVersion, isPublished: true } });
    assert.equal((await read(menu.id)).isPublished, false, "An older clean record must not override the latest unresolved record");
    assert.equal((unresolved.contentSnapshot as { name: string }).name, reviewed.name, "DB binds the snapshot to persisted content");
    console.log("PASS: direct unresolved review stops publication and older clean evidence cannot republish");

    await db.menuFoodReview.delete({ where: { id: unresolved.id } });
    const afterEvidenceDelete = await read(menu.id);
    assert.ok(afterEvidenceDelete.foodVersion > reviewed.foodVersion);
    await db.menuItem.update({ where: { id: menu.id }, data: { reviewedFoodVersion: afterEvidenceDelete.foodVersion, isPublished: true } });
    assert.equal((await read(menu.id)).isPublished, false, "Deleting unresolved evidence must not reveal an older clean confirmation");
    reviewData.foodVersion = afterEvidenceDelete.foodVersion;
    console.log("PASS: deleting current-version evidence advances its confirmation epoch; older clean evidence cannot be resurrected");

    const beforeInvalid = await db.menuFoodReview.count({ where: { menuItemId: menu.id } });
    for (const foodVersion of [afterEvidenceDelete.foodVersion + 1, afterEvidenceDelete.foodVersion - 1]) {
        await assert.rejects(db.menuFoodReview.create({ data: { ...reviewData, foodVersion } }), /current food version/);
    }
    assert.equal(await db.menuFoodReview.count({ where: { menuItemId: menu.id } }), beforeInvalid);
    const bound = await db.menuFoodReview.create({ data: { ...reviewData, recordedAt: new Date("2000-01-01T00:00:00Z") } });
    assert.ok(bound.recordedAt.getTime() > Date.now() - 60_000, "Recorded time is generated by the DB");
    const snapshot = bound.contentSnapshot as { ingredients: string; allergens: Array<{ slug: string; status: string }> };
    assert.equal(snapshot.ingredients, reviewed.ingredients);
    assert.equal(snapshot.allergens.length, master.length);
    assert.equal(snapshot.allergens.find(a => a.slug === master[0].slug)?.status, "MAY_CONTAIN");
    await db.menuItem.update({ where: { id: menu.id }, data: { isPublished: true } });
    assert.equal((await read(menu.id)).isPublished, true, "A new resolved review can explicitly restore publication");
    console.log("PASS: past/future review versions are rejected; snapshot and record time come from locked persisted content");

    const raceBefore = await read(menu.id);
    let correctionLocked!: () => void;
    let releaseCorrection!: () => void;
    const locked = new Promise<void>(resolve => { correctionLocked = resolve; });
    const released = new Promise<void>(resolve => { releaseCorrection = resolve; });
    const correction = db.$transaction(async tx => {
        await tx.menuItem.update({ where: { id: menu.id }, data: { ingredients: "架空の確定済み訂正" } });
        correctionLocked(); await released;
    }, { timeout: 10_000 });
    await locked;
    const staleReview = db.menuFoodReview.create({ data: { ...reviewData, foodVersion: raceBefore.foodVersion } }).then(
        () => ({ rejected: false, message: "" }), error => ({ rejected: true, message: String(error) }),
    );
    try {
        let blocked = false;
        for (let attempt = 0; attempt < 100; attempt++) {
            const rows = await db.$queryRaw<Array<{ blocked: boolean }>>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%INSERT INTO%MenuFoodReview%') AS blocked`;
            if (rows[0]?.blocked) { blocked = true; break; }
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.equal(blocked, true, "Review must wait for the concurrent food correction's parent lock");
    } finally { releaseCorrection(); }
    await correction;
    const result = await staleReview;
    assert.equal(result.rejected, true);
    assert.match(result.message, /current food version/);
    assert.equal((await read(menu.id)).ingredients, "架空の確定済み訂正");
    assert.equal((await read(menu.id)).isPublished, false);
    console.log("PASS: a stale direct review waits for a real food correction and cannot confirm or republish it");

    await db.$transaction(tx => publishReviewedFixture(tx, menu.id));
    const beforeTruncate = await read(menu.id);
    const beforeTruncateCount = await db.menuFoodReview.count();
    await assert.rejects(db.$transaction(async tx => {
        await tx.$executeRaw`TRUNCATE "MenuFoodReview"`;
        assert.equal(await tx.menuFoodReview.count(), 0);
        const stopped = await tx.menuItem.findUniqueOrThrow({ where: { id: menu.id } });
        assert.equal(stopped.isPublished, false);
        assert.equal(stopped.reviewedFoodVersion, null);
        assert.ok(stopped.foodVersion > beforeTruncate.foodVersion);
        throw new Error("intentional truncate rollback");
    }), /intentional truncate rollback/);
    assert.deepEqual(await read(menu.id), beforeTruncate);
    assert.equal(await db.menuFoodReview.count(), beforeTruncateCount);
    console.log("PASS: evidence TRUNCATE invalidates all derived confirmations; transaction rollback restores records and publication");
}
