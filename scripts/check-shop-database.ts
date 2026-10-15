import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module, { createRequire } from "node:module";
import { assertCiDatabaseTarget } from "./ci-environment";
import { assertTestDatabaseTarget } from "./test-environment";

// Refuse external/shared targets before importing application or DB modules.
if (process.env.CLEARALLERGY_TEST_ENV === "true") assertTestDatabaseTarget();
else assertCiDatabaseTarget();

const run = randomUUID();
const actor = `fictional-shop-save-${run}`;
const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
const requireForTest = createRequire(import.meta.url);
let cacheFails = false;
let route: typeof import("../features/admin/shop/server/adminShopRoute");
try {
    loader._load = function (id, ...args) {
        if (id === "next/cache") return { revalidatePath: () => { if (cacheFails) throw new Error("intentional fixture cache failure"); } };
        if (id === "@clerk/nextjs/server") return {
            auth: async () => ({ userId: actor }),
            currentUser: async () => ({ publicMetadata: {}, externalId: null }),
        };
        return originalLoad.call(this, id, ...args);
    };
    route = requireForTest("../features/admin/shop/server/adminShopRoute.ts");
} finally { loader._load = originalLoad; }
const { prisma } = requireForTest("../lib/db") as typeof import("../lib/db");
const { PrismaClient } = requireForTest("@prisma/client") as typeof import("@prisma/client");
const observer = new PrismaClient({ log: [] });

async function main() {
    const originalFind = prisma.shop.findUnique;
    const previousMode = process.env.PORTFOLIO_MODE;
    process.env.PORTFOLIO_MODE = "false";
    let userId: string | undefined;
    const createdShops: string[] = [];
    try {
        const user = await observer.user.create({ data: { clerkUserId: actor } });
        userId = user.id;
        const own = await observer.shop.create({ data: { userId, ownerClerkUserId: actor, isActive: true, name: `【架空】店舗保存 ${run}` } });
        createdShops.push(own.id);
        const sentinel = await observer.shop.create({ data: { name: `【架空】非対象 ${run}`, googlePlaceId: `fictional-place-${run}`, latitude: 35, longitude: 139 } });
        createdShops.push(sentinel.id);
        const sentinelBefore = await observer.shop.findUniqueOrThrow({ where: { id: sentinel.id } });
        const snapshot = () => observer.shop.findUniqueOrThrow({ where: { id: own.id } });
        const reset = () => observer.shop.update({ where: { id: own.id }, data: { ownerClerkUserId: actor, isActive: true, note: null, phoneNumber: null } });
        const put = (expectedUpdatedAt: Date, fields: Record<string, unknown>) => route.PUT(new Request("http://localhost/api/admin/shop", {
            method: "PUT", headers: { Origin: "http://localhost", "Content-Type": "application/json" },
            body: JSON.stringify({ name: own.name, expectedUpdatedAt: expectedUpdatedAt.toISOString(), ...fields }),
        }));

        for (const correctionFirst of [true, false]) {
            const initial = await reset();
            const correction = { note: "新しい備考訂正", phoneNumber: null };
            const phone = { note: null, phoneNumber: "000-1111-2222" };
            const winner = correctionFirst ? correction : phone;
            const loser = correctionFirst ? phone : correction;
            assert.equal((await put(initial.updatedAt, winner)).status, 200);
            assert.equal((await put(initial.updatedAt, loser)).status, 409);
            const saved = await snapshot();
            assert.equal(saved.note, winner.note);
            assert.equal(saved.phoneNumber, winner.phoneNumber);
            assert.ok(saved.updatedAt > initial.updatedAt);
            console.log(`PASS: real PostgreSQL stale full-form rejected (${correctionFirst ? "correction first" : "phone first"})`);
        }

        const concurrent = await reset();
        let reads = 0;
        let release!: () => void;
        const bothRead = new Promise<void>((resolve) => { release = resolve; });
        prisma.shop.findUnique = (async (...args: Parameters<typeof originalFind>) => {
            const row = await originalFind.apply(prisma.shop, args);
            if (args[0].where.id === own.id && ++reads <= 2) {
                if (reads === 2) release();
                await bothRead;
            }
            return row;
        }) as unknown as typeof originalFind;
        const responses = await Promise.all([
            put(concurrent.updatedAt, { note: "同時A" }),
            put(concurrent.updatedAt, { note: "同時B" }),
        ]);
        prisma.shop.findUnique = originalFind;
        assert.equal(reads, 2);
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
        const winningBody = await responses.find((r) => r.status === 200)!.json();
        assert.equal((await snapshot()).note, winningBody.shop.note);
        console.log("PASS: two real PUT handlers reading one timestamp produce one 200 and one 409");

        for (const interference of ["owner", "inactive"] as const) {
            const initial = await reset();
            let injected = false;
            prisma.shop.findUnique = (async (...args: Parameters<typeof originalFind>) => {
                const row = await originalFind.apply(prisma.shop, args);
                if (args[0].where.id === own.id && !injected) {
                    injected = true;
                    // Preserve the timestamp deliberately to isolate final ownership/active predicates.
                    await observer.shop.update({ where: { id: own.id }, data: {
                        ...(interference === "owner" ? { ownerClerkUserId: `${actor}-other` } : { isActive: false }),
                        updatedAt: initial.updatedAt,
                    } });
                }
                return row;
            }) as unknown as typeof originalFind;
            assert.equal((await put(initial.updatedAt, { name: "書き換えてはいけない" })).status, 409);
            prisma.shop.findUnique = originalFind;
            assert.ok(injected);
            assert.equal((await snapshot()).name, own.name);
            console.log(`PASS: real PostgreSQL final ${interference} predicate rejects after-read change`);
        }

        const beforeRefresh = await reset();
        const failuresBefore = await observer.auditLog.count({ where: { actorShopId: own.id, success: false } });
        cacheFails = true;
        const pending = await put(beforeRefresh.updatedAt, { note: "DBに確定した架空訂正" });
        cacheFails = false;
        assert.equal(pending.status, 200);
        const pendingBody = await pending.json();
        assert.equal(pendingBody.publicRefreshPending, true);
        assert.equal(pendingBody.shop.note, "DBに確定した架空訂正");
        assert.equal((await snapshot()).note, pendingBody.shop.note);
        assert.equal(await observer.auditLog.count({ where: { actorShopId: own.id, success: false } }), failuresBefore);
        console.log("PASS: known DB commit survives cache failure with saved DTO/pending and no failure audit");

        const beforeRejectedWrite = await snapshot();
        const rejectedWrite = await put(beforeRejectedWrite.updatedAt, {
            googlePlaceId: sentinel.googlePlaceId, latitude: 35, longitude: 139,
        });
        assert.equal(rejectedWrite.status, 500);
        assert.deepEqual(await snapshot(), beforeRejectedWrite);
        console.log("PASS: real unique-constraint write failure preserves all shop fields and timestamp");

        const beforeDelete = await snapshot();
        let deleted = false;
        prisma.shop.findUnique = (async (...args: Parameters<typeof originalFind>) => {
            const row = await originalFind.apply(prisma.shop, args);
            if (args[0].where.id === own.id && !deleted) {
                deleted = true;
                await observer.shop.delete({ where: { id: own.id } });
            }
            return row;
        }) as unknown as typeof originalFind;
        assert.equal((await put(beforeDelete.updatedAt, { name: "消失後の更新" })).status, 409);
        prisma.shop.findUnique = originalFind;
        assert.ok(deleted);
        assert.equal(await observer.shop.findUnique({ where: { id: own.id } }), null);
        assert.deepEqual(await observer.shop.findUniqueOrThrow({ where: { id: sentinel.id } }), sentinelBefore);
        console.log("PASS: real deletion after read refuses the final write and other-shop sentinel stays unchanged");
    } finally {
        prisma.shop.findUnique = originalFind;
        cacheFails = false;
        await observer.auditLog.deleteMany({ where: { actorUserId: userId ?? "not-created", actorShopId: { in: createdShops } } });
        await observer.shop.deleteMany({ where: { id: { in: createdShops } } });
        if (userId) await observer.user.delete({ where: { id: userId } });
        if (previousMode === undefined) delete process.env.PORTFOLIO_MODE;
        else process.env.PORTFOLIO_MODE = previousMode;
        await prisma.$disconnect();
        await observer.$disconnect();
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof assert.AssertionError
        ? `FAIL: ${error.message.split("\n")[0]} (expected ${String(error.expected)}, actual ${String(error.actual)})`
        : "FAIL: shop-save DB regression; guarded fictional target only");
    process.exitCode = 1;
});
