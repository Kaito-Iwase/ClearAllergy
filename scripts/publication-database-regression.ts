import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";

// The guarded caller owns this shop; no master changes or external services.
export async function runPublicationDatabaseRegression(db: PrismaClient, shopId: string, master: Array<{ id: string }>) {
    const menu = await db.menuItem.create({ data: { shopId, name: "【架空】二段階公開のDB回帰",
        allergenLinks: { create: master.map(a => ({ allergenId: a.id, status: "FREE" })) },
    } });
    const read = () => db.menuItem.findUniqueOrThrow({ where: { id: menu.id } });
    const initial = await read();
    const evidence = await db.menuFoodReview.create({ data: { menuItemId: menu.id, foodVersion: initial.foodVersion,
        contentSnapshot: {}, evidenceRefs: "架空の過去記録", scope: "架空全品目", checkedAt: new Date(), actorUserId: "fictional-db-test" } });
    await assert.rejects(db.menuItem.update({ where: { id: menu.id }, data: {
        publicationConfirmedFoodVersion: initial.foodVersion, legacyPublicationFoodReviewId: evidence.id, isPublished: true,
    } }), /Migration-only/);
    assert.equal((await read()).isPublished, false);
    console.log("PASS: a draft cannot forge the migration-only legacy publication reference");
    const publish = async () => db.$transaction(async tx => {
        const current = await tx.menuItem.findUniqueOrThrow({ where: { id: menu.id } });
        const event = await tx.menuPublicationConfirmation.create({ data: { menuItemId: menu.id,
            foodVersion: current.foodVersion, actorUserId: "fictional-db-test" } });
        await tx.menuItem.update({ where: { id: menu.id }, data: { isPublished: true } });
        return event;
    });
    const first = await publish();
    const second = await publish();
    const beforeDelete = await read();
    await assert.rejects(db.menuPublicationConfirmation.update({ where: { id: first.id }, data: { actorUserId: "changed" } }), /append-only/);
    for (const foodVersion of [beforeDelete.foodVersion - 1, beforeDelete.foodVersion + 1]) {
        await assert.rejects(db.menuPublicationConfirmation.create({ data: { menuItemId: menu.id,
            foodVersion, actorUserId: "fictional-db-test" } }), /saved food version/);
    }
    console.log("PASS: publication events are append-only and reject old/future food versions");
    await db.menuPublicationConfirmation.delete({ where: { id: second.id } });
    const deleted = await read();
    assert.ok(deleted.foodVersion > beforeDelete.foodVersion);
    await assert.rejects(db.menuItem.update({ where: { id: menu.id }, data: {
        publicationConfirmedFoodVersion: deleted.foodVersion, isPublished: true,
    } }), /derived from an explicit event/);
    assert.equal((await read()).isPublished, false);
    assert.equal(await db.menuPublicationConfirmation.count({ where: { id: first.id } }), 1);
    console.log("PASS: deleting a current publication invalidates its epoch; an older event cannot resurrect it");
    await publish();
    const beforeLaterReview = await read();
    await db.menuFoodReview.create({ data: { menuItemId: menu.id, foodVersion: beforeLaterReview.foodVersion,
        contentSnapshot: {}, evidenceRefs: "架空の後続履歴", scope: "架空全品目", checkedAt: new Date(), actorUserId: "fictional-db-test" } });
    await assert.rejects(db.menuItem.update({ where: { id: menu.id }, data: {
        publicationConfirmedFoodVersion: beforeLaterReview.foodVersion, isPublished: true,
    } }), /derived from an explicit event/);
    assert.equal((await read()).isPublished, false);
    await publish();
    console.log("PASS: a later legacy review cannot restore an old publication marker; a new explicit event is required");
    const beforeTruncate = await read();
    await assert.rejects(db.$transaction(async tx => {
        await tx.$executeRaw`TRUNCATE "MenuPublicationConfirmation"`;
        const stopped = await tx.menuItem.findUniqueOrThrow({ where: { id: menu.id } });
        assert.equal(stopped.isPublished, false);
        assert.ok(stopped.foodVersion > beforeTruncate.foodVersion);
        throw new Error("intentional publication truncate rollback");
    }), /intentional publication truncate rollback/);
    assert.deepEqual(await read(), beforeTruncate);
    console.log("PASS: publication TRUNCATE invalidates the epoch and transaction rollback preserves all events");
    let locked!: () => void, release!: () => void;
    const lock = new Promise<void>(done => { locked = done; });
    const released = new Promise<void>(done => { release = done; });
    const correction = db.$transaction(async tx => {
        await tx.menuItem.update({ where: { id: menu.id }, data: { ingredients: "訂正した架空材料" } });
        locked(); await released;
    }, { timeout: 10_000 });
    await lock;
    const stalePublish = db.menuPublicationConfirmation.create({ data: { menuItemId: menu.id,
        foodVersion: beforeTruncate.foodVersion, actorUserId: "fictional-db-test" } }).then(() => false, () => true);
    try {
        let waiting = false;
        for (let attempt = 0; attempt < 100; attempt++) {
            const rows = await db.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
                WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%INSERT INTO%MenuPublicationConfirmation%') AS waiting`;
            if (rows[0]?.waiting) { waiting = true; break; }
            await new Promise(done => setTimeout(done, 20));
        }
        assert.equal(waiting, true);
    } finally { release(); }
    await correction;
    assert.equal(await stalePublish, true);
    assert.equal((await read()).isPublished, false);
    console.log("PASS: a stale publication waits for a food correction then fails against the new saved version");
    assert.deepEqual(await db.menuFoodReview.findUniqueOrThrow({ where: { id: evidence.id } }), evidence);
}
