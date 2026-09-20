import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseTarget } from "./test-environment";

async function main() {
    assertTestDatabaseTarget();
    const db = new PrismaClient();
    const run = randomUUID();
    let shopId: string | undefined;
    try {
        const master = await db.allergen.findMany({ select: { id: true } });
        assert.ok(master.length > 0);
        const shop = await db.shop.create({ data: { name: `【架空・DB検証】${run}`, isActive: true } });
        shopId = shop.id;
        const missing = await db.menuItem.create({ data: { shopId, name: "未入力の公開要求", isPublished: true } });
        assert.equal((await db.menuItem.findUniqueOrThrow({ where: { id: missing.id } })).isPublished, false);
        console.log("PASS: DB trigger unpublishes missing allergen records");
        const full = await db.menuItem.create({ data: { shopId, name: "完全な架空登録", isPublished: true,
            allergenLinks: { create: master.map((a, index) => ({ allergenId: a.id, status: index === 0 ? "MAY_CONTAIN" : "FREE" })) },
        } });
        assert.equal((await db.menuItem.findUniqueOrThrow({ where: { id: full.id } })).isPublished, true);
        console.log("PASS: DB keeps a complete MAY_CONTAIN menu published");
        await db.menuItemAllergen.update({ where: { menuItemId_allergenId: { menuItemId: full.id, allergenId: master[0].id } }, data: { status: "UNKNOWN" } });
        assert.equal((await db.menuItem.findUniqueOrThrow({ where: { id: full.id } })).isPublished, false);
        console.log("PASS: UNKNOWN update automatically unpublishes in real PostgreSQL");
        const before = await db.menuItem.count({ where: { shopId } });
        await assert.rejects(db.$transaction(async (tx) => {
            await tx.menuItem.create({ data: { shopId: shop.id, name: "rollback-only" } });
            throw new Error("intentional rollback");
        }), /intentional rollback/);
        assert.equal(await db.menuItem.count({ where: { shopId } }), before);
        console.log("PASS: failed transaction leaves no partial menu");
    } finally {
        if (shopId) await db.shop.delete({ where: { id: shopId } });
        await db.$disconnect();
    }
}
main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : "DB test failed"); process.exitCode = 1; });
