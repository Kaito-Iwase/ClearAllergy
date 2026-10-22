import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { assertCiDatabaseTarget } from "./ci-environment";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";

async function main() {
    assertCiDatabaseTarget();
    const db = new PrismaClient();
    let fixtureShopId: string | undefined;
    try {
        const tables = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'`;
        assert.equal(Number(tables[0].count), 0, "Requires an empty disposable CI DB; never resets an existing database");
        const fixture = mkdtempSync(join(tmpdir(), "ca-publication-migration-"));
        const schema = join(fixture, "prisma", "schema.prisma");
        mkdirSync(join(fixture, "prisma", "migrations"), { recursive: true });
        cpSync(resolve("prisma/schema.prisma"), schema);
        for (const name of readdirSync(resolve("prisma/migrations"))) {
            if (name === "migration_lock.toml" || name < "20261021000000_two_step_publication") cpSync(resolve("prisma/migrations", name), join(fixture, "prisma", "migrations", name), { recursive: true });
        }
        const cli = createRequire(import.meta.url).resolve("prisma/build/index.js");
        const deploy = (target: string) => {
            const result = spawnSync(process.execPath, [cli, "migrate", "deploy", "--schema", target], { stdio: "inherit", windowsHide: true });
            assert.equal(result.status, 0, "Isolated migration failed");
        };
        deploy(schema);
        const shop = await db.shop.create({ data: { name: "【架空】二段階公開の移行" } });
        fixtureShopId = shop.id;
        await db.allergen.createMany({ data: ALLERGEN_MASTER.map((a, i) => ({ ...a, sortOrder: i + 1 })), skipDuplicates: true });
        const master = await db.allergen.findMany();
        const ids = ["legacy-public", "legacy-draft", "legacy-unresolved"];
        for (const id of ids) {
            await db.$transaction(async tx => {
                await tx.$executeRaw`INSERT INTO "MenuItem" ("id", "shopId", "name", "updatedAt") VALUES (${id}, ${shop.id}, '【架空】移行試験', CURRENT_TIMESTAMP)`;
                await tx.menuItemAllergen.createMany({ data: master.map(a => ({ menuItemId: id, allergenId: a.id, status: "FREE" as const })) });
                const unresolved = id === "legacy-unresolved" ? "架空の未解決事項" : null;
                await tx.$executeRaw`INSERT INTO "MenuFoodReview" ("id", "menuItemId", "foodVersion", "contentSnapshot", "evidenceRefs", "scope", "checkedAt", "actorUserId", "unresolvedIssues")
                    SELECT ${"review-" + id}, "id", "foodVersion", '{}'::jsonb, '架空の移行前資料', '架空の対象', TIMESTAMP '2026-10-01', 'synthetic-migration-fixture', ${unresolved}
                    FROM "MenuItem" WHERE "id" = ${id}`;
                if (id === "legacy-public") await tx.$executeRaw`UPDATE "MenuItem" SET "isPublished" = TRUE WHERE "id" = ${id}`;
            });
        }
        const before = await db.menuFoodReview.findMany({ orderBy: { id: "asc" } });
        deploy(resolve("prisma/schema.prisma"));
        const after = await db.menuFoodReview.findMany({ orderBy: { id: "asc" } });
        assert.deepEqual(after, before, "No old evidence, timestamps, issues or snapshots rewritten");
        assert.equal(await db.menuPublicationConfirmation.count(), 0, "Migration invents no user publication event");
        assert.equal(await db.menuFoodIssueResolution.count(), 0, "Migration invents no issue resolution");
        const published = await db.menuItem.findUniqueOrThrow({ where: { id: ids[0] } });
        assert.equal(published.isPublished, true);
        assert.equal(published.publicationConfirmedFoodVersion, published.foodVersion);
        assert.equal(published.legacyPublicationFoodReviewId, "review-legacy-public");
        for (const id of ids.slice(1)) {
            const menu = await db.menuItem.findUniqueOrThrow({ where: { id } });
            assert.equal(menu.isPublished, false); assert.equal(menu.publicationConfirmedFoodVersion, null);
        }
        deploy(resolve("prisma/schema.prisma"));
        assert.equal(await db.menuPublicationConfirmation.count(), 0);
        assert.equal(await db.menuFoodIssueResolution.count(), 0);
        console.log("PASS: legacy public maintained, drafts/issues not published, all food evidence unchanged, no invented publication event, repeated deploy unchanged");
    } finally {
        if (fixtureShopId) {
            await db.auditLog.deleteMany({ where: { actorShopId: fixtureShopId } });
            await db.shop.delete({ where: { id: fixtureShopId } });
        }
        await db.$disconnect();
    }
}
main().catch(() => { console.error("Publication migration regression failed on the disposable CI target."); process.exitCode = 1; });
