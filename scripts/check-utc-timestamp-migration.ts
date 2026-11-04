import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
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
async function catalog(db: PrismaClient) {
    return {
        columns: await db.$queryRaw`SELECT to_jsonb(c) - 'column_default' AS definition
            FROM information_schema.columns c WHERE table_schema='public' ORDER BY table_name, ordinal_position`,
        defaults: await db.$queryRaw<Array<{ key: string; value: string | null }>>`SELECT table_name || '.' || column_name AS key, column_default AS value
            FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position`,
        relations: await db.$queryRaw`SELECT c.oid::text, c.relname, c.relfilenode::text, c.relowner::text, c.relacl::text, c.relrowsecurity
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.oid`,
        constraints: await db.$queryRaw`SELECT c.oid::text, pg_get_constraintdef(c.oid) AS definition
            FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY c.oid`,
        indexes: await db.$queryRaw`SELECT * FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`,
        triggers: await db.$queryRaw`SELECT t.oid::text, t.tgenabled::text, pg_get_triggerdef(t.oid) AS definition
            FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' ORDER BY t.oid`,
        functions: await db.$queryRaw<Array<{ name: string; source: string; attributes: unknown }>>`SELECT p.proname AS name, p.prosrc AS source,
            to_jsonb(p) - 'prosrc' AS attributes FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' ORDER BY p.oid`,
    };
}
function withoutUtcConversion(source: string) {
    return source.replace(/\(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'\)/gi, 'CURRENT_TIMESTAMP')
        .replace(/clock_timestamp\(\) AT TIME ZONE 'UTC'/gi, 'clock_timestamp()');
}
async function blockedDeployRollsBack(db: PrismaClient, before: Awaited<ReturnType<typeof catalog>>) {
    // Hold the second ALTER's table: the first ALTER must also roll back.
    await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT 1 FROM "Shop" LIMIT 1`;
        const started = Date.now();
        const child = spawn(process.execPath, [cli, "migrate", "deploy"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        let output = "", finished = false, timedOut = false, observedLock = false;
        child.stdout.on("data", value => { output += String(value); });
        child.stderr.on("data", value => { output += String(value); });
        let spawnError: Error | undefined;
        const completion = new Promise<number | null>(resolve => {
            child.once("error", error => { spawnError = error; finished = true; resolve(null); });
            child.once("close", code => { finished = true; resolve(code); });
        });
        const timer = setTimeout(() => { timedOut = true; child.kill(); }, 25_000);
        let code: number | null;
        try {
            while (!finished && !observedLock) {
                const [row] = await db.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (
                    SELECT 1 FROM pg_locks l JOIN pg_class c ON c.oid=l.relation
                    WHERE c.relname='Shop' AND l.mode='AccessExclusiveLock' AND NOT l.granted
                    AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database())
                ) AS waiting`;
                observedLock = row.waiting;
                if (!observedLock && !finished) await new Promise(resolve => setTimeout(resolve, 100));
            }
            code = await completion;
        } catch (error) {
            child.kill();
            await completion;
            throw error;
        } finally { clearTimeout(timer); }
        assert.equal(spawnError, undefined, "Migration process must start successfully");
        assert.notEqual(code, 0, "Conflicting DDL must fail");
        assert.equal(timedOut, false, "Migration must fail by lock_timeout, not process timeout");
        assert.equal(observedLock, true, "Observe the real ALTER waiting for ACCESS EXCLUSIVE on the held table");
        // Prisma 6 can mask the original 55P03 while attempting to log the
        // failure inside the aborted explicit transaction (25P02).
        assert.match(output, /55P03|lock timeout|current transaction is aborted/i);
        assert.ok(Date.now() - started >= 4500, "Observe the configured lock wait before the failure");
        assert.ok(Date.now() - started < 25_000, "DDL wait must be bounded");
    }, { timeout: 30_000 });
    assert.deepEqual(await catalog(db), before, "Failed migration rolls back defaults, functions and all schema metadata");
    const resolveFailure = spawnSync(process.execPath, [cli, "migrate", "resolve", "--rolled-back", migrationName], {
        stdio: "inherit", windowsHide: true,
    });
    assert.equal(resolveFailure.status, 0, "Resolve only this deliberately failed migration on this disposable DB");
    console.log("PASS: DDL lock timeout rolls back the earlier ALTER; synthetic failure resolved before retry");
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
        if (process.env.CLEARALLERGY_CI_TIMEZONE) {
            const [setting] = await db.$queryRaw<Array<{ zone: string }>>`SELECT current_setting('TimeZone') AS zone`;
            assert.equal(setting.zone, process.env.CLEARALLERGY_CI_TIMEZONE, "Fresh connections must use the matrix server timezone");
        }
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
        // Ambiguous LA fall-back hours, spring-forward boundary, leap day,
        // null expiry and a future value must survive with their original bits.
        for (const instant of ["2026-03-08T09:59:59.999Z", "2026-03-08T10:00:00.000Z",
            "2026-11-01T08:30:00.000Z", "2026-11-01T09:30:00.000Z", "2024-02-29T00:00:00.000Z", "2099-01-01T00:00:00.000Z"]) {
            const date = new Date(instant);
            const user = await db.user.create({ data: { createdAt: date, updatedAt: date } });
            const shop = await db.shop.create({ data: { name: "Synthetic historical timestamp", userId: user.id, createdAt: date, updatedAt: date } });
            await db.adminInvite.create({ data: { shopId: shop.id, email: `historical-${user.id}@example.invalid`, invitedByClerkUserId: "synthetic",
                createdAt: date, updatedAt: date, expiresAt: instant.startsWith("2099") ? null : date } });
            await db.auditLog.create({ data: { actorUserId: user.id, action: "synthetic_history", targetType: "shop", targetId: shop.id,
                success: true, createdAt: date } });
        }
        const historical = await snapshot(db);
        // Exercise preservation of an explicit ACL, not only default NULL ACLs.
        await db.$executeRaw`REVOKE EXECUTE ON FUNCTION ca_food_review_bound() FROM PUBLIC`;
        const schemaBefore = await catalog(db);
        await blockedDeployRollsBack(db, schemaBefore);
        assert.deepEqual(await snapshot(db), historical, "Failed DDL changes no historical row");
        deploy(resolve("prisma/schema.prisma"));
        const schemaAfter = await catalog(db);
        const changedDefaults = schemaBefore.defaults.filter((row, index) => row.value !== schemaAfter.defaults[index].value);
        assert.equal(changedDefaults.length, 10, "Exactly ten defaults change");
        const changedFunctions = schemaBefore.functions.filter((row, index) => row.source !== schemaAfter.functions[index].source);
        assert.equal(changedFunctions.length, 8, "Exactly eight functions change");
        assert.deepEqual({ ...schemaAfter, defaults: undefined, functions: schemaAfter.functions.map(row => ({ ...row, source: withoutUtcConversion(row.source) })) },
            { ...schemaBefore, defaults: undefined, functions: schemaBefore.functions.map(row => ({ ...row, source: withoutUtcConversion(row.source) })) },
            "Types, constraints, indexes, trigger bindings, relation storage, ownership, grants and non-time function logic are unchanged");
        console.log("PASS: exactly 10 defaults/8 function bodies change; schema, privileges and physical tables unchanged");
        const diff = spawnSync(process.execPath, [cli, "migrate", "diff", "--from-url", process.env.DATABASE_URL!,
            "--to-schema-datamodel", resolve("prisma/schema.prisma"), "--script"], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
        assert.equal(diff.status, 0, "Prisma must compare the disposable catalog with the current schema");
        assert.doesNotMatch(diff.stdout, /ALTER COLUMN "(?:createdAt|recordedAt|resolvedAt|confirmedAt)"/i,
            "Prisma must not propose recreating UTC defaults because of catalog cast normalization: " + diff.stdout);
        console.log("PASS: Prisma migration diff proposes no UTC timestamp default changes");
        assert.deepEqual(await snapshot(db), historical, "Migration must preserve every existing application row, including incorrect historical timestamps");
        deploy(resolve("prisma/schema.prisma"));
        assert.deepEqual(await snapshot(db), historical, "Repeated deploy changes no existing values or publication state");
        console.log("PASS: all existing table values/history/publication states unchanged; repeated deployment unchanged");

        const defaults = await db.$queryRaw<Array<{ table_name: string; column_default: string }>>`SELECT table_name, column_default
            FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('createdAt','recordedAt','resolvedAt','confirmedAt')`;
        assert.equal(defaults.length, tables.length);
        assert.ok(defaults.every(row => /^(?:\(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text\)|timezone\('UTC'::text, CURRENT_TIMESTAMP\))$/.test(row.column_default)), "All current DB-generated timestamp defaults use UTC: " + JSON.stringify(defaults));
        for (const zone of zones) await db.$transaction(async tx => {
            await timezone(tx, zone);
            for (const instant of ["2026-03-08T09:59:59.999Z", "2026-03-08T10:00:00.000Z", "2026-11-01T08:30:00.000Z", "2026-11-01T09:30:00.000Z"]) {
                for (const { column_default } of defaults) {
                    // Evaluate the installed catalog expression at fixed instants;
                    // the only substituted input is its transaction clock.
                    const expression = column_default.replace('CURRENT_TIMESTAMP', '$1::timestamptz');
                    const [row] = await tx.$queryRawUnsafe<Array<{ epoch: number }>>(
                        `SELECT (EXTRACT(EPOCH FROM (${expression})) * 1000)::double precision AS epoch`, new Date(instant));
                    assert.equal(row.epoch, new Date(instant).getTime(), "Installed default preserves the instant across DST: " + zone);
                }
            }
        });
        console.log("PASS: installed defaults retain UTC instants through LA spring-forward and both repeated fall-back hours");
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
            `UTC regression failed (${typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'unknown'}); inspect the last completed check on the disposable target.`);
    process.exitCode = 1;
});
