import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";

export async function runFoodIssueResolutionDatabaseRegression(db: PrismaClient, shopId: string, master: Array<{ id: string }>) {
    const menu = await db.menuItem.create({ data: { shopId, name: "【架空】明示解除のDB回帰", allergenLinks: {
        create: master.map((a, i) => ({ allergenId: a.id, status: i === 0 ? "UNKNOWN" : "CONTAINS" })),
    } } });
    const read = () => db.menuItem.findUniqueOrThrow({ where: { id: menu.id } });
    const issue = await db.menuFoodReview.create({ data: { menuItemId: menu.id, foodVersion: (await read()).foodVersion,
        contentSnapshot: {}, evidenceRefs: "保持する架空の旧資料", scope: "架空全品目", checkedAt: new Date("2026-10-01"),
        actorUserId: "fictional-original-author", unresolvedIssues: "架空の未解決事項" } });
    const resolve = async () => db.menuFoodIssueResolution.create({ data: { menuItemId: menu.id, foodReviewId: issue.id,
        foodVersion: (await read()).foodVersion, issueSnapshot: "client supplied text must be replaced", actorUserId: "fictional-resolving-actor",
        resolvedAt: new Date("2099-01-01") } });
    const publish = async () => db.$transaction(async tx => {
        const saved = await tx.menuItem.findUniqueOrThrow({ where: { id: menu.id } });
        await tx.menuPublicationConfirmation.create({ data: { menuItemId: menu.id, foodVersion: saved.foodVersion, actorUserId: "fictional-publisher" } });
        await tx.menuItem.update({ where: { id: menu.id }, data: { isPublished: true } });
    });
    const initial = await read();
    for (const target of [{ foodReviewId: issue.id, foodVersion: initial.foodVersion + 1 }, { foodReviewId: "not-the-shown-issue", foodVersion: initial.foodVersion }]) {
        await assert.rejects(db.menuFoodIssueResolution.create({ data: { menuItemId: menu.id, ...target, issueSnapshot: "fake", actorUserId: "fictional-actor" } }), /latest issue and saved food version/);
    }
    await assert.rejects(publish(), /Unresolved food issues/);
    const before = Date.now();
    const resolution = await resolve();
    assert.equal(resolution.issueSnapshot, issue.unresolvedIssues);
    assert.equal(resolution.foodReviewId, issue.id);
    assert.equal(resolution.actorUserId, "fictional-resolving-actor");
    assert.ok(resolution.resolvedAt.getTime() >= before - 1_000 && resolution.resolvedAt.getTime() <= Date.now() + 1_000);
    assert.equal((await read()).isPublished, false);
    assert.equal(await db.menuPublicationConfirmation.count({ where: { menuItemId: menu.id } }), 0);
    assert.deepEqual(await db.menuFoodReview.findUniqueOrThrow({ where: { id: issue.id } }), issue);
    console.log("PASS: explicit resolution preserves the exact old review, binds its issue/current food version/actor, records actual time, and never publishes");
    await assert.rejects(db.menuFoodIssueResolution.update({ where: { id: resolution.id }, data: { issueSnapshot: "overwrite" } }), /append-only/);
    await publish();
    assert.equal((await read()).isPublished, false);
    assert.equal((await db.menuItemAllergen.findUniqueOrThrow({ where: { menuItemId_allergenId: { menuItemId: menu.id, allergenId: master[0].id } } })).status, "UNKNOWN");
    console.log("PASS: resolution cannot convert UNKNOWN or bypass the all-allergen publication constraint");
    await db.menuItemAllergen.update({ where: { menuItemId_allergenId: { menuItemId: menu.id, allergenId: master[0].id } }, data: { status: "CONTAINS" } });
    await assert.rejects(publish(), /Unresolved food issues/);
    await resolve();
    assert.equal((await read()).isPublished, false);
    await publish();
    assert.equal((await read()).isPublished, true);
    const published = await read();
    await db.menuItem.update({ where: { id: menu.id }, data: { priceYen: 1234 } });
    assert.equal((await read()).foodVersion, published.foodVersion);
    assert.equal((await read()).isPublished, true);
    await db.menuItem.update({ where: { id: menu.id }, data: { ingredients: "訂正した架空原材料" } });
    assert.equal((await read()).isPublished, false);
    await assert.rejects(publish(), /Unresolved food issues/);
    console.log("PASS: separate publication is required after resolution; price preserves it and food changes invalidate the old resolution");
    const currentResolution = await resolve(); await publish();
    const beforeDelete = await read();
    await db.menuFoodIssueResolution.delete({ where: { id: currentResolution.id } });
    assert.equal((await read()).isPublished, false);
    assert.ok((await read()).foodVersion > beforeDelete.foodVersion);
    await assert.rejects(publish(), /Unresolved food issues/);
    await resolve(); await publish();
    const beforeTruncate = await read();
    await assert.rejects(db.$transaction(async tx => {
        await tx.$executeRaw`TRUNCATE "MenuFoodIssueResolution"`;
        const stopped = await tx.menuItem.findUniqueOrThrow({ where: { id: menu.id } });
        assert.equal(stopped.isPublished, false); assert.ok(stopped.foodVersion > beforeTruncate.foodVersion);
        throw new Error("intentional resolution truncate rollback");
    }), /intentional resolution truncate rollback/);
    assert.deepEqual(await read(), beforeTruncate);
    console.log("PASS: resolution UPDATE is denied, DELETE/TRUNCATE invalidate publication, and rollback preserves history");
    let locked!: () => void, release!: () => void;
    const lock = new Promise<void>(done => { locked = done; });
    const released = new Promise<void>(done => { release = done; });
    const correction = db.$transaction(async tx => {
        await tx.menuItem.update({ where: { id: menu.id }, data: { ingredients: "並行訂正した架空原材料" } });
        locked(); await released;
    }, { timeout: 10_000 });
    await lock;
    const stale = db.menuFoodIssueResolution.create({ data: { menuItemId: menu.id, foodReviewId: issue.id,
        foodVersion: beforeTruncate.foodVersion, issueSnapshot: "stale", actorUserId: "fictional-stale-actor" } }).then(() => false, () => true);
    try {
        let waiting = false;
        for (let i = 0; i < 100; i++) {
            const rows = await db.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
              AND wait_event_type='Lock' AND query LIKE '%INSERT INTO%MenuFoodIssueResolution%') AS waiting`;
            if (rows[0]?.waiting) { waiting = true; break; }
            await new Promise(done => setTimeout(done, 20));
        }
        assert.equal(waiting, true);
    } finally { release(); }
    await correction;
    assert.equal(await stale, true);
    assert.equal((await read()).isPublished, false);
    const newerIssue = await db.menuFoodReview.create({ data: { menuItemId: menu.id, foodVersion: (await read()).foodVersion,
        contentSnapshot: {}, evidenceRefs: "新しい架空資料", scope: "架空", checkedAt: new Date(), actorUserId: "fictional-author", unresolvedIssues: "別の未解決" } });
    await assert.rejects(resolve(), /latest issue and saved food version/);
    assert.deepEqual(await db.menuFoodReview.findUniqueOrThrow({ where: { id: issue.id } }), issue);
    assert.equal((await db.menuFoodReview.findUniqueOrThrow({ where: { id: newerIssue.id } })).unresolvedIssues, "別の未解決");
    console.log("PASS: resolution waits for concurrent food correction; stale food versions and superseded issue IDs cannot be resolved");
}
