import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { assertCiDatabaseTarget } from "./ci-environment";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";

// Requires a fresh, disposable CI database. Does not reset an existing database.
async function main() {
    assertCiDatabaseTarget();
    const db = new PrismaClient();
    try {
        const tables = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'`;
        assert.equal(Number(tables[0].count), 0, "Migration regression requires an empty disposable database");
        const fixture = mkdtempSync(join(tmpdir(), "clearallergy-legacy-migration-"));
        const fixturePrisma = join(fixture, "prisma");
        mkdirSync(join(fixturePrisma, "migrations"), { recursive: true });
        cpSync(resolve("prisma/schema.prisma"), join(fixturePrisma, "schema.prisma"));
        for (const name of readdirSync(resolve("prisma/migrations"))) {
            if (name !== "20261009000000_menu_food_review") cpSync(resolve("prisma/migrations", name), join(fixturePrisma, "migrations", name), { recursive: true });
        }
        const cli = createRequire(import.meta.url).resolve("prisma/build/index.js");
        const deploy = (schema: string) => {
            const result = spawnSync(process.execPath, [cli, "migrate", "deploy", "--schema", schema], { stdio: "inherit", windowsHide: true });
            assert.equal(result.status, 0, "Disposable migration deployment failed");
        };
        deploy(join(fixturePrisma, "schema.prisma"));
        const shop = await db.shop.create({ data: { name: "【架空】移行前の店舗" } });
        await db.allergen.createMany({ data: ALLERGEN_MASTER.map((a, index) => ({ ...a, sortOrder: index + 1 })), skipDuplicates: true });
        const allergens = await db.allergen.findMany();
        const menuId = "fictional-legacy-published-menu";
        await db.$transaction(async tx => {
            // Current generated Client has new columns; old-table fixture uses
            // a fixed parameterised INSERT rather than a production data repair.
            await tx.$executeRaw`INSERT INTO "MenuItem" ("id", "shopId", "name", "isPublished", "updatedAt") VALUES (${menuId}, ${shop.id}, '【架空】旧公開メニュー', TRUE, CURRENT_TIMESTAMP)`;
            await tx.menuItemAllergen.createMany({ data: allergens.map(a => ({ menuItemId: menuId, allergenId: a.id, status: "FREE" as const })) });
        });
        const before = await db.$queryRaw<Array<{ isPublished: boolean }>>`SELECT "isPublished" FROM "MenuItem" WHERE "id" = ${menuId}`;
        assert.equal(before[0].isPublished, true);
        deploy(resolve("prisma/schema.prisma"));
        const after = await db.menuItem.findUniqueOrThrow({ where: { id: menuId }, include: { allergenLinks: true, foodReviews: true } });
        assert.equal(after.isPublished, false);
        assert.equal(after.reviewedFoodVersion, null);
        assert.equal(after.foodReviews.length, 0);
        assert.equal(after.allergenLinks.length, ALLERGEN_MASTER.length);
        assert.ok(after.allergenLinks.every(link => link.status === "FREE"));
        deploy(resolve("prisma/schema.prisma"));
        assert.equal((await db.menuItem.findUniqueOrThrow({ where: { id: menuId } })).isPublished, false);
        console.log("PASS: legacy published menu becomes unpublished without invented evidence; existing statuses remain; repeated deploy is unchanged");
    } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("Food review migration regression failed. Use an empty disposable CI target; raw DB errors are not logged."); process.exitCode = 1; });
