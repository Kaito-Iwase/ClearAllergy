import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import { createTestShopMenuFixtures } from "./test-shop-fixtures";

export const TEST_PREVIEW_TARGET = {
    projectId: "patient-heart-55595249", branchId: "br-flat-wildflower-aoeragrs",
    directHost: "ep-silent-bonus-aofdajar.c-2.ap-southeast-1.aws.neon.tech",
    poolerHost: "ep-silent-bonus-aofdajar-pooler.c-2.ap-southeast-1.aws.neon.tech",
    database: "neondb", role: "neondb_owner",
    clerkAppId: "app_3LDk2uLf3DRxrxfMhuSUMFQ71A9", clerkInstanceId: "ins_3LDk2su6C7R2NXWTzjgi8ttubj2",
} as const;
export type TestPreviewOwners = readonly [string, string];
type Environment = Record<string, string | undefined>;
type Migration = { name: string; checksum: string };
type MasterRow = { id: string; slug: string; nameJa: string; nameEn: string; sortOrder: number };

// The existing browser task independently read back these two fictional users
// in the exact Development app/instance above at 2026-10-27 01:22:55 UTC.
// Parent handoff supplied that trusted metadata; CLI ID syntax alone is not proof.
const APPROVED_TEST_PREVIEW_OWNER_IDS: readonly string[] = [
    "user_3LFy4E2hco0VpC63CbjjMjOznIx",
    "user_3LFyNjtUBNFHoDjyYiieTXEhHd0",
];

export function parseTestPreviewInitializationArgs(args: string[]): TestPreviewOwners {
    if (args.length !== 5 || args[0] !== "--owner-a" || args[2] !== "--owner-b" || args[4] !== "--apply"
        || !/^user_[a-zA-Z0-9]{1,128}$/.test(args[1]) || !/^user_[a-zA-Z0-9]{1,128}$/.test(args[3]) || args[1] === args[3]) {
        throw new Error("Two distinct Clerk user IDs and --apply are required.");
    }
    return [args[1], args[3]];
}

export function assertApprovedTestPreviewOwners(owners: TestPreviewOwners) {
    parseTestPreviewInitializationArgs(["--owner-a", owners[0], "--owner-b", owners[1], "--apply"]);
    if (APPROVED_TEST_PREVIEW_OWNER_IDS.length !== 2 || !owners.every(id => APPROVED_TEST_PREVIEW_OWNER_IDS.includes(id))) {
        throw new Error("HOLD: trusted metadata for both test Clerk owners has not been approved.");
    }
}

export function assertTestPreviewDatabaseTarget(env: Environment = process.env) {
    if (env.CLEARALLERGY_TEST_PREVIEW !== "true") throw new Error("Explicit test Preview mode is required.");
    const urls: URL[] = [];
    for (const [key, host] of [["DATABASE_URL", TEST_PREVIEW_TARGET.poolerHost], ["DIRECT_URL", TEST_PREVIEW_TARGET.directHost]]) {
        let url: URL;
        try { url = new URL(env[key] ?? ""); } catch { throw new Error("Dedicated test database configuration is invalid."); }
        const allowedParameters: Record<string, string> = { sslmode: "require", channel_binding: "require", schema: "public" };
        if (key === "DATABASE_URL") allowedParameters.pgbouncer = "true";
        if (url.protocol !== "postgresql:" || url.hostname !== host || (url.port !== "" && url.port !== "5432")
            || url.pathname !== `/${TEST_PREVIEW_TARGET.database}` || url.username !== TEST_PREVIEW_TARGET.role
            || !url.password || url.hash || url.searchParams.get("sslmode") !== "require"
            || [...url.searchParams].some(([name, value]) => !Object.hasOwn(allowedParameters, name) || allowedParameters[name] !== value)
            || new Set(url.searchParams.keys()).size !== [...url.searchParams].length) {
            throw new Error("Dedicated test database configuration is invalid.");
        }
        urls.push(url);
    }
    if (urls[0].password !== urls[1].password) throw new Error("Dedicated test database credentials do not match.");
}

export function readTestPreviewMigrations(): Migration[] {
    const directory = new URL("../prisma/migrations/", import.meta.url);
    const migrations = readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory())
        .map(entry => ({ name: entry.name, checksum: createHash("sha256").update(readFileSync(new URL(`${entry.name}/migration.sql`, directory))).digest("hex") }))
        .sort((a, b) => a.name.localeCompare(b.name));
    if (migrations.length !== 20) throw new Error("The reviewed set of 20 migrations is required.");
    return migrations;
}

export function validatePartialTestPreviewMaster(rows: MasterRow[]) {
    if (new Set(rows.map(row => row.id)).size !== rows.length || new Set(rows.map(row => row.slug)).size !== rows.length
        || rows.some(row => !row.id || !ALLERGEN_MASTER.some(expected => expected.slug === row.slug
            && expected.nameJa === row.nameJa && expected.nameEn === row.nameEn && expected.sortOrder === row.sortOrder))) {
        throw new Error("Existing allergen master differs from the reviewed definitions.");
    }
}

async function assertEmptyBusinessData(db: Prisma.TransactionClient) {
    const counts = await Promise.all([db.user.count(), db.shop.count(), db.menuItem.count(), db.menuItemAllergen.count(),
        db.adminInvite.count(), db.auditLog.count(), db.menuFoodReview.count(), db.menuPublicationConfirmation.count(), db.menuFoodIssueResolution.count()]);
    if (counts.some(count => count !== 0)) throw new Error("Existing business data found. No reset or overwrite is permitted.");
}

async function assertMigrationLedger(db: PrismaClient, migrations: Migration[]) {
    const rows = await db.$queryRaw<Array<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>>`
        SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"`;
    if (rows.length !== migrations.length || new Set(rows.map(row => row.migration_name)).size !== rows.length
        || rows.some(row => !row.finished_at || row.rolled_back_at || !migrations.some(expected => expected.name === row.migration_name && expected.checksum === row.checksum))) {
        throw new Error("Migration history is incomplete or differs from the reviewed files. Inspect read-only before retrying.");
    }
}

async function assertDatabaseBeforeMigration(db: PrismaClient, migrations: Migration[]) {
    const identity = await db.$queryRaw<Array<{ database: string; role: string }>>`SELECT current_database() AS database, current_user AS role`;
    if (identity.length !== 1 || identity[0].database !== TEST_PREVIEW_TARGET.database || identity[0].role !== TEST_PREVIEW_TARGET.role) {
        throw new Error("Connected database identity differs from the approved target.");
    }
    const tables = await db.$queryRaw<Array<{ table_name: string }>>`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    if (!tables.length) return;
    const expected = ["_prisma_migrations", "Allergen", "User", "Shop", "MenuItem", "MenuItemAllergen", "AdminInvite", "AuditLog", "MenuFoodReview", "MenuPublicationConfirmation", "MenuFoodIssueResolution"];
    if (tables.length !== expected.length || tables.some(table => !expected.includes(table.table_name))) {
        throw new Error("Database schema is not empty or a completed initialization schema. Inspect read-only before retrying.");
    }
    // Only a fully migrated but still empty database may resume after fixture rollback.
    await assertMigrationLedger(db, migrations);
    await assertEmptyBusinessData(db);
    validatePartialTestPreviewMaster(await db.allergen.findMany());
}

export type TestPreviewInitializationDependencies = {
    verifyOwners: (owners: TestPreviewOwners) => void | Promise<void>;
    connect: () => PrismaClient;
    migrate: () => void;
    migrations: Migration[];
};

// Injected transports allow pure mock tests. The manual CLI always supplies the
// fail-closed approved-owner verifier; no CLI flag can bypass that verifier.
export async function initializeTestPreviewDatabase(owners: TestPreviewOwners, dependencies: TestPreviewInitializationDependencies) {
    assertTestPreviewDatabaseTarget();
    parseTestPreviewInitializationArgs(["--owner-a", owners[0], "--owner-b", owners[1], "--apply"]);
    if (dependencies.migrations.length !== 20 || new Set(dependencies.migrations.map(m => m.name)).size !== 20) {
        throw new Error("The reviewed set of 20 migrations is required.");
    }
    await dependencies.verifyOwners(owners);
    const db = dependencies.connect();
    try {
        await assertDatabaseBeforeMigration(db, dependencies.migrations);
        dependencies.migrate(); // usual Prisma migrate deploy; never reconstructed SQL
        await assertMigrationLedger(db, dependencies.migrations);
        return await db.$transaction(async tx => {
            await assertEmptyBusinessData(tx);
            const master = await tx.allergen.findMany();
            validatePartialTestPreviewMaster(master);
            for (const definition of ALLERGEN_MASTER) {
                if (!master.some(row => row.slug === definition.slug)) master.push(await tx.allergen.create({ data: definition }));
            }
            const menus = createTestShopMenuFixtures(master);
            const shops = [];
            for (const [index, ownerClerkUserId] of owners.entries()) {
                const user = await tx.user.create({ data: { clerkUserId: ownerClerkUserId } });
                const shop = await tx.shop.create({ data: { userId: user.id, ownerClerkUserId, isActive: true,
                    name: `【架空・テスト専用】店舗${index === 0 ? "A" : "B"}`,
                    description: "架空店舗・架空メニューの操作検証用です。実際の飲食判断には使用しないでください。" } });
                for (const menu of menus) await tx.menuItem.create({ data: { ...menu, shopId: shop.id } });
                shops.push({ userId: user.id, shopId: shop.id });
            }
            // Defaults/triggers own all versions. No food-review, publication or resolution history is synthesized.
            return shops;
        }, { isolationLevel: "Serializable", timeout: 30_000 });
    } finally { await db.$disconnect(); }
}
