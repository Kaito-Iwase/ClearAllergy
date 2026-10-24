import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { PrismaClient, type Prisma } from "@prisma/client";
import { assertCiDatabaseTarget } from "./ci-environment";
import { prisma } from "../lib/db";
import { acceptPendingInviteForCurrentUser, InvitationError } from "../lib/auth/invitations";

const migrationName = "20261024000000_utc_timestamp_contract";
const zones = ["UTC", "Asia/Tokyo", "America/Los_Angeles"] as const;
const tables = ["User", "Shop", "AdminInvite", "AuditLog", "MenuItem", "Allergen", "MenuItemAllergen",
    "MenuFoodReview", "MenuPublicationConfirmation", "MenuFoodIssueResolution"] as const;
const cli = createRequire(import.meta.url).resolve("prisma/build/index.js");
function deploy(schema: string) {
    const result = spawnSync(process.execPath, [cli, "migrate", "deploy", "--schema", schema], { stdio: "inherit", windowsHide: true });
    assert.equal(result.status, 0, "Disposable migration failed");
}
async function timezone(tx: Prisma.TransactionClient, zone: string) {
    await tx.$queryRaw`SELECT set_config('TimeZone', ${zone}, true)`;
}
async function clock(tx: Prisma.TransactionClient) {
    const [row] = await tx.$queryRaw<Array<{ epoch: number }>>`SELECT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::double precision AS epoch`;
    return row.epoch;
}
function near(date: Date, before: number, after: number, label: string) {
    assert.ok(date.getTime() >= before - 1 && date.getTime() <= after + 1,
        `${label} must represent the actual instant, independent of session TimeZone`);
    assert.ok(date.toISOString().endsWith("Z"));
}
async function snapshot(db: PrismaClient) {
    const result: Record<string, unknown> = {};
    // Fixed identifiers only; all rows belong to this fresh, guarded disposable DB.
    for (const table of tables) result[table] = await db.$queryRawUnsafe(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`);
    return result;
}
async function fixture(tx: Prisma.TransactionClient, suffix: string) {
    const shop = await tx.shop.create({ data: { name: "【架空】UTC日時回帰 " + suffix } });
    const master = await tx.allergen.findMany({ select: { id: true } });
    const menu = await tx.menuItem.create({ data: { shopId: shop.id, name: "【架空】日時確認", allergenLinks: {
        create: master.map(a => ({ allergenId: a.id, status: "CONTAINS" })),
    } } });
    const saved = await tx.menuItem.findUniqueOrThrow({ where: { id: menu.id } });
    const before = await clock(tx);
    const review = await tx.menuFoodReview.create({ data: { menuItemId: menu.id, foodVersion: saved.foodVersion,
        contentSnapshot: {}, evidenceRefs: "架空資料", scope: "架空範囲", checkedAt: new Date("2026-01-01T00:00:00Z"),
        recordedAt: new Date("2099-01-01T00:00:00Z"), actorUserId: "synthetic-timezone", unresolvedIssues: "架空未解決" } });
    const resolution = await tx.menuFoodIssueResolution.create({ data: { menuItemId: menu.id, foodReviewId: review.id,
        foodVersion: saved.foodVersion, issueSnapshot: "置換される入力", actorUserId: "synthetic-timezone",
        resolvedAt: new Date("2099-01-01T00:00:00Z") } });
    const publication = await tx.menuPublicationConfirmation.create({ data: { menuItemId: menu.id, foodVersion: saved.foodVersion,
        actorUserId: "synthetic-timezone", confirmedAt: new Date("2099-01-01T00:00:00Z") } });
    await tx.menuItem.update({ where: { id: menu.id }, data: { isPublished: true } });
    return { shop, menu, review, resolution, publication, before, after: await clock(tx) };
}

async function main() {
    assertCiDatabaseTarget();
    const db = new PrismaClient();
    try {
        const [{ count }] = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM information_schema.tables WHERE table_schema='public'`;
        assert.equal(Number(count), 0, "Requires an empty disposable CI DB; never resets an existing database");
        const temporary = mkdtempSync(join(tmpdir(), "ca-utc-migration-"));
        const oldSchema = join(temporary, "prisma", "schema.prisma");
        mkdirSync(join(temporary, "prisma", "migrations"), { recursive: true });
        cpSync(resolve("prisma/schema.prisma"), oldSchema);
        for (const name of readdirSync(resolve("prisma/migrations"))) {
            if (name === "migration_lock.toml" || name < migrationName) cpSync(resolve("prisma/migrations", name), join(temporary, "prisma", "migrations", name), { recursive: true });
        }
        deploy(oldSchema);
        // Reproduce the original defect before applying the candidate migration.
        for (const zone of ["UTC", "Asia/Tokyo"] as const) {
            const old = await db.$transaction(async tx => { await timezone(tx, zone); return fixture(tx, "before-" + zone); });
            for (const [name, value] of Object.entries({ recordedAt: old.review.recordedAt, resolvedAt: old.resolution.resolvedAt, confirmedAt: old.publication.confirmedAt })) {
                if (zone === "UTC") near(value, old.before, old.after, name);
                else assert.ok(value.getTime() >= old.before + 9 * 3600_000 - 1 && value.getTime() <= old.after + 9 * 3600_000 + 1,
                    "Baseline JST must reproduce the +9 hour defect: " + name);
            }
            console.log(`PASS: baseline ${zone} event-time evidence captured (${zone === "UTC" ? "correct" : "+9 hours"})`);
        }
        const historical = await snapshot(db);
        deploy(resolve("prisma/schema.prisma"));
        assert.deepEqual(await snapshot(db), historical, "Migration must preserve every existing application row, including incorrect historical timestamps");
        deploy(resolve("prisma/schema.prisma"));
        assert.deepEqual(await snapshot(db), historical, "Repeated deploy changes no existing values or publication state");
        console.log("PASS: all existing table values/history/publication states unchanged; repeated deployment unchanged");

        const defaults = await db.$queryRaw<Array<{ table_name: string; column_default: string }>>`SELECT table_name, column_default
            FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('createdAt','recordedAt','resolvedAt','confirmedAt')`;
        assert.equal(defaults.length, tables.length);
        assert.ok(defaults.every(row => /^(?:\(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text\)|timezone\('UTC'::text, CURRENT_TIMESTAMP\))$/.test(row.column_default)), "All current DB-generated timestamp defaults use UTC: " + JSON.stringify(defaults));
        const types = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
            AND data_type='timestamp without time zone' AND datetime_precision=3`;
        assert.equal(Number(types[0].count), 20, "Existing timestamp types/precision retained");
        console.log("PASS: all ten defaults are explicit UTC; twenty timestamp column types unchanged");

        // Same transaction start instant and identical supplied Date across all zones.
        await db.$transaction(async tx => {
            const created: Date[] = [];
            for (const zone of zones) {
                await timezone(tx, zone);
                const date = new Date("2026-10-01T12:34:56.789Z");
                const shop = await tx.shop.create({ data: { name: "【架空】同一瞬間", updatedAt: date } });
                assert.equal(shop.updatedAt.toISOString(), date.toISOString());
                created.push(shop.createdAt);
            }
            assert.ok(created.every(date => date.getTime() === created[0].getTime()), "The same transaction instant serializes identically in UTC/JST/LA");
            near(created[0], Date.now() - 30_000, Date.now(), "default createdAt");
        });
        console.log("PASS: identical transaction instant and supplied Date return identical ISO Z in UTC/JST/LA");

        for (const zone of zones) {
            const result = await db.$transaction(async tx => { await timezone(tx, zone); return fixture(tx, "after-" + zone); });
            for (const [name, value] of Object.entries({ recordedAt: result.review.recordedAt, resolvedAt: result.resolution.resolvedAt, confirmedAt: result.publication.confirmedAt })) near(value, result.before, result.after, name);
            assert.equal((await db.menuItem.findUniqueOrThrow({ where: { id: result.menu.id } })).isPublished, true);
            assert.equal(result.resolution.issueSnapshot, result.review.unresolvedIssues);
            assert.deepEqual(await db.menuFoodReview.findUniqueOrThrow({ where: { id: result.review.id } }), result.review);
            for (const offset of [299_000, 301_000]) {
                const attempt = () => db.$transaction(async tx => {
                    await timezone(tx, zone);
                    const current = await tx.menuItem.findUniqueOrThrow({ where: { id: result.menu.id } });
                    const now = await clock(tx);
                    return tx.menuFoodReview.create({ data: { menuItemId: current.id, foodVersion: current.foodVersion,
                        contentSnapshot: {}, evidenceRefs: "架空境界", scope: "架空", actorUserId: "synthetic-timezone", checkedAt: new Date(now + offset) } });
                });
                if (offset < 300_000) await attempt();
                else await assert.rejects(attempt(), /check constraint/i);
            }
            console.log(`PASS: ${zone} records actual wall-clock time, overwrites spoofed times, preserves old review, keeps +5 minute CHECK`);

            await db.$transaction(async tx => {
                await timezone(tx, zone);
                const start = await clock(tx);
                const invalid = await tx.menuItem.create({ data: { shopId: result.shop.id, name: "【架空】未入力", isPublished: true } });
                await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
                const menu = await tx.menuItem.findUniqueOrThrow({ where: { id: invalid.id } });
                assert.equal(menu.isPublished, false);
                const audit = await tx.auditLog.findFirstOrThrow({ where: { targetId: invalid.id, action: "menu_unpublish" } });
                // CURRENT_TIMESTAMP remains transaction time, not statement/wall time.
                near(menu.updatedAt, start - 1000, await clock(tx), "trigger updatedAt");
                near(audit.createdAt, start - 1000, await clock(tx), "trigger audit createdAt");
            });
            console.log(`PASS: ${zone} deferred unpublish/update/audit timestamps are UTC`);
            const originalTransaction = prisma.$transaction;
            const runTransaction = prisma.$transaction.bind(prisma);
            try {
                // Keep the real acceptance/ORM/SQL/row locks; set only this test's
                // transaction-local timezone. No real Clerk or provider is called.
                prisma.$transaction = (async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
                    runTransaction(async tx => { await timezone(tx, zone); return work(tx); })) as typeof prisma.$transaction;
                const email = `${zone.replaceAll("/", "-")}@example.invalid`.toLowerCase();
                const expiry = new Date(Date.now() + 60_000);
                const invite = await db.adminInvite.create({ data: { shopId: result.shop.id, email,
                    invitedByClerkUserId: "synthetic-timezone", expiresAt: expiry } });
                const accepted = await acceptPendingInviteForCurrentUser({ email, clerkUserId: "synthetic-" + email });
                assert.equal(accepted.invite.id, invite.id);
                assert.equal(accepted.invite.status, "accepted");
                assert.equal(accepted.invite.expiresAt?.toISOString(), expiry.toISOString());
                const expired = await db.adminInvite.create({ data: { shopId: result.shop.id, email,
                    invitedByClerkUserId: "synthetic-timezone", expiresAt: new Date(Date.now() - 60_000) } });
                await assert.rejects(acceptPendingInviteForCurrentUser({ email, clerkUserId: "synthetic-" + email }),
                    (error: unknown) => error instanceof InvitationError && error.status === 404);
                assert.equal((await db.adminInvite.findUniqueOrThrow({ where: { id: expired.id } })).status, "expired");
            } finally { prisma.$transaction = originalTransaction; }
            console.log(`PASS: ${zone} real invitation acceptance accepts future UTC expiry and rejects/marks expired UTC expiry`);
        }
        const shop = await db.shop.create({ data: { name: "【架空】運用writer日時" } });
        const menu = await db.menuItem.create({ data: { shopId: shop.id, name: "【架空】欠損品目" } });
        const existing = await db.menuItemAllergen.findMany({ orderBy: [{ menuItemId: "asc" }, { allergenId: "asc" }] });
        const start = Date.now();
        // The parent disposable runner supplies no inherited provider/DB secrets
        // and a clean worktree; this is the real operational writer on synthetic data.
        const backfill = spawnSync(process.execPath, ["--import", "tsx", "scripts/backfill-pistachio-allergen.ts"], { stdio: "inherit", windowsHide: true });
        assert.equal(backfill.status, 0, "Disposable operational writer failed");
        const link = await db.menuItemAllergen.findFirstOrThrow({ where: { menuItemId: menu.id, allergen: { slug: "pistachio" } } });
        near(link.createdAt, start, Date.now(), "operational writer createdAt");
        near(link.updatedAt, start, Date.now(), "operational writer updatedAt");
        assert.equal(link.status, "UNKNOWN");
        for (const old of existing) assert.deepEqual(await db.menuItemAllergen.findUniqueOrThrow({
            where: { menuItemId_allergenId: { menuItemId: old.menuItemId, allergenId: old.allergenId } },
        }), old, "Operational writer preserves every existing allergen link");
        assert.equal((await db.menuItem.findUniqueOrThrow({ where: { id: menu.id } })).isPublished, false);
        console.log("PASS: real operational backfill stores UTC createdAt/updatedAt, preserves existing links and inserts UNKNOWN without publishing");
        console.log("PASS: UTC timestamp migration and session-timezone regression complete");
    } finally { await db.$disconnect(); await prisma.$disconnect(); }
}
main().catch(error => {
    // Synthetic-only target; print assertion context, never raw connection/provider errors.
    console.error(error instanceof assert.AssertionError ? error.message :
        error instanceof InvitationError ? `Synthetic invitation regression failed (${error.status}).` :
            "UTC regression failed; inspect the last completed check on the disposable target.");
    process.exitCode = 1;
});
