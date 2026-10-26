import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import { assertApprovedTestPreviewOwners, assertTestPreviewDatabaseTarget, initializeTestPreviewDatabase,
    parseTestPreviewInitializationArgs, readTestPreviewMigrations, TEST_PREVIEW_TARGET, validatePartialTestPreviewMaster } from "../scripts/test-preview-initialization";

const owners = ["user_FictionalA", "user_FictionalB"] as const;
const args = ["--owner-a", owners[0], "--owner-b", owners[1], "--apply"];
const url = (host: string) => `postgresql://neondb_owner:mock-password@${host}/neondb?sslmode=require&channel_binding=require`;
const env = { CLEARALLERGY_TEST_PREVIEW: "true", DATABASE_URL: url(TEST_PREVIEW_TARGET.poolerHost), DIRECT_URL: url(TEST_PREVIEW_TARGET.directHost) };
const migrations = readTestPreviewMigrations();
const tables = ["_prisma_migrations", "Allergen", "User", "Shop", "MenuItem", "MenuItemAllergen", "AdminInvite", "AuditLog", "MenuFoodReview", "MenuPublicationConfirmation", "MenuFoodIssueResolution"];
type MasterRow = (typeof ALLERGEN_MASTER)[number] & { id: string };
type Data = Record<string, unknown>;

function setup(t: TestContext) {
    for (const [key, value] of Object.entries(env)) {
        const original = process.env[key]; process.env[key] = value;
        t.after(() => { if (original === undefined) delete process.env[key]; else process.env[key] = original; });
    }
}

function mockDatabase(options: { migrated?: boolean; nonempty?: boolean; mismatchedMaster?: boolean; failMigration?: boolean; failMenu?: boolean; invalidLedger?: boolean } = {}) {
    const state = { migrated: options.migrated ?? false, master: [] as MasterRow[], users: [] as Data[], shops: [] as Data[], menus: [] as Data[] };
    if (state.migrated) state.master = [{ ...ALLERGEN_MASTER.at(-1)!, id: "existing-pistachio" }];
    if (options.mismatchedMaster) state.master.push({ ...ALLERGEN_MASTER[0], id: "wrong-master", nameJa: "別の品目" });
    if (options.nonempty) state.users.push({ id: "existing-user" });
    const calls = { verify: 0, connect: 0, migrate: 0, transaction: 0, rollback: 0, commit: 0, disconnect: 0, menuAttempts: 0, masterCreates: 0 };
    const delegates = (data: typeof state) => ({
        user: { count: async () => data.users.length, create: async ({ data: row }: { data: Data }) => {
            const user = { ...row, id: `app-user-${data.users.length}` }; data.users.push(user); return user;
        } },
        shop: { count: async () => data.shops.length, create: async ({ data: row }: { data: Data }) => {
            const shop = { ...row, id: `shop-${data.shops.length}` }; data.shops.push(shop); return shop;
        } },
        menuItem: { count: async () => data.menus.length, create: async ({ data: row }: { data: Data }) => {
            calls.menuAttempts++;
            if (options.failMenu && calls.menuAttempts === 2) throw new Error("mock menu insert failure");
            data.menus.push(row); return row;
        } },
        allergen: { findMany: async () => structuredClone(data.master), create: async ({ data: row }: { data: (typeof ALLERGEN_MASTER)[number] }) => {
            calls.masterCreates++;
            const created = { ...row, id: `new-${row.slug}` }; data.master.push(created); return created;
        } },
        menuItemAllergen: { count: async () => 0 }, adminInvite: { count: async () => 0 }, auditLog: { count: async () => 0 },
        menuFoodReview: { count: async () => 0 }, menuPublicationConfirmation: { count: async () => 0 }, menuFoodIssueResolution: { count: async () => 0 },
    });
    const db = {
        ...delegates(state),
        $queryRaw: async (query: TemplateStringsArray) => {
            const sql = query.join("");
            if (sql.includes("current_database")) return [{ database: "neondb", role: "neondb_owner" }];
            if (sql.includes("information_schema.tables")) return state.migrated ? tables.map(table_name => ({ table_name })) : [];
            if (sql.includes("_prisma_migrations")) return migrations.map((m, i) => ({ migration_name: m.name,
                checksum: options.invalidLedger && i === 0 ? "wrong-checksum" : m.checksum, finished_at: new Date("2026-10-26T00:00:00Z"), rolled_back_at: null }));
            assert.fail("Unexpected DB query");
        },
        $transaction: async (run: (tx: unknown) => Promise<unknown>, settings: unknown) => {
            calls.transaction++;
            assert.deepEqual(settings, { isolationLevel: "Serializable", timeout: 30_000 });
            const pending = structuredClone(state);
            try {
                const result = await run(delegates(pending));
                Object.assign(state, pending); calls.commit++; return result;
            } catch (error) { calls.rollback++; throw error; }
        },
        $disconnect: async () => { calls.disconnect++; },
    } as unknown as PrismaClient;
    const dependencies = {
        // Explicit mock of trusted owner preflight, never used by the real CLI.
        verifyOwners: () => { calls.verify++; },
        connect: () => { calls.connect++; return db; }, migrations,
        migrate: () => {
            calls.migrate++;
            if (options.failMigration) throw new Error("mock migration failure");
            if (!state.migrated) {
                state.migrated = true;
                state.master = [{ ...ALLERGEN_MASTER.at(-1)!, id: "existing-pistachio" }];
            }
        },
    };
    return { state, calls, dependencies };
}

test("INITは明示された別々のowner IDとapplyを要求し、ID形式を認証根拠にしない", () => {
    assert.deepEqual(parseTestPreviewInitializationArgs(args), owners);
    for (const invalid of [[], args.slice(0, 4), [...args, "--reset"], [...args.slice(0, 3), owners[0], "--apply"],
        ["--owner-a", "", ...args.slice(2)], ["--owner-a", "user_a b", ...args.slice(2)]]) {
        assert.throws(() => parseTestPreviewInitializationArgs(invalid));
    }
    assert.throws(() => assertApprovedTestPreviewOwners(owners), /HOLD/);
});

test("DBガードは確認済みNeonのpooler/direct一組だけを許可し、URLの迂回設定も拒否する", () => {
    assert.doesNotThrow(() => assertTestPreviewDatabaseTarget(env));
    for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
        for (const invalid of ["", env[key].replace("ep-silent-bonus-aofdajar", "ep-production"),
            env[key].replace("/neondb?", "/production?"), env[key].replace("neondb_owner:", "production_owner:"),
            env[key].replace(":mock-password@", ":@"), env[key].replace("sslmode=require", "sslmode=disable"),
            env[key] + "&host=production.example", env[key] + "&schema=other", env[key] + "&sslmode=require", env[key] + "#ignored",
            env[key].replace("postgresql:", "http:"), env[key].replace("/neondb?", ":5433/neondb?")]) {
            assert.throws(() => assertTestPreviewDatabaseTarget({ ...env, [key]: invalid }));
        }
    }
    assert.throws(() => assertTestPreviewDatabaseTarget({ ...env, DIRECT_URL: env.DATABASE_URL }));
    assert.throws(() => assertTestPreviewDatabaseTarget({ ...env, DATABASE_URL: env.DIRECT_URL }));
    assert.throws(() => assertTestPreviewDatabaseTarget({ ...env, DIRECT_URL: env.DIRECT_URL.replace("mock-password", "another-password") }));
    assert.throws(() => assertTestPreviewDatabaseTarget({ ...env, CLEARALLERGY_TEST_PREVIEW: undefined }));
});

test("承認済みClerk owner未確定ではconnect・migration・fixtureの前に停止する", async t => {
    setup(t);
    const { dependencies, calls } = mockDatabase();
    await assert.rejects(initializeTestPreviewDatabase(owners, { ...dependencies, verifyOwners: assertApprovedTestPreviewOwners }), /HOLD/);
    assert.equal(calls.connect, 0); assert.equal(calls.migrate, 0); assert.equal(calls.transaction, 0);
});

test("既存業務データがあればmigration前に拒否し、再実行も上書きしない", async t => {
    setup(t);
    const { state, calls, dependencies } = mockDatabase({ migrated: true, nonempty: true });
    await assert.rejects(initializeTestPreviewDatabase(owners, dependencies), /Existing business data/);
    assert.equal(calls.migrate, 0); assert.equal(calls.transaction, 0); assert.equal(state.users.length, 1);
});

test("migration失敗・ledger不一致ではfixture transactionに進まず自動retryしない", async t => {
    setup(t);
    for (const options of [{ failMigration: true }, { invalidLedger: true }]) {
        const { state, calls, dependencies } = mockDatabase(options);
        await assert.rejects(initializeTestPreviewDatabase(owners, dependencies));
        assert.equal(calls.migrate, 1); assert.equal(calls.transaction, 0); assert.equal(calls.disconnect, 1);
        assert.deepEqual(state.users, []); assert.deepEqual(state.shops, []); assert.deepEqual(state.menus, []);
    }
});

test("不足masterだけ追加し、対応するowner2名・架空2店舗・6下書きを作り確認履歴を合成しない", async t => {
    setup(t);
    const { state, calls, dependencies } = mockDatabase();
    const shops = await initializeTestPreviewDatabase(owners, dependencies);
    assert.equal(calls.commit, 1); assert.equal(state.master.length, ALLERGEN_MASTER.length);
    assert.equal(calls.masterCreates, ALLERGEN_MASTER.length - 1);
    assert.equal(state.master.find(a => a.slug === "pistachio")?.id, "existing-pistachio");
    assert.equal(state.users.length, 2); assert.equal(state.shops.length, 2); assert.equal(state.menus.length, 6);
    for (const [i, shop] of state.shops.entries()) {
        assert.equal(shop.ownerClerkUserId, owners[i]); assert.equal(shop.userId, state.users[i].id);
        assert.equal(state.users[i].clerkUserId, owners[i]); assert.equal(shop.isActive, true);
        assert.match(shop.name as string, /^【架空・テスト専用】/);
        assert.equal(state.menus.filter(menu => menu.shopId === shop.id).length, 3);
    }
    assert.equal(shops.length, 2);
    for (const menu of state.menus) {
        assert.equal(menu.isPublished, false);
        const links = menu.allergenLinks as { create: Array<{ status: string }> };
        assert.equal(links.create.length, ALLERGEN_MASTER.length);
        for (const key of ["version", "foodVersion", "reviewedFoodVersion", "publicationConfirmedFoodVersion", "foodReviews", "publicationConfirmations", "foodIssueResolutions"]) {
            assert.equal(Object.hasOwn(menu, key), false);
        }
    }
    const saved = structuredClone(state);
    await assert.rejects(initializeTestPreviewDatabase(owners, dependencies), /Existing business data/);
    assert.deepEqual(state, saved); assert.equal(calls.migrate, 1);
});

test("master不一致を補正せず拒否し、fixture失敗は同一transactionへ伝えてrollbackする", async t => {
    setup(t);
    const mismatched = mockDatabase({ migrated: true, mismatchedMaster: true });
    await assert.rejects(initializeTestPreviewDatabase(owners, mismatched.dependencies), /master differs/);
    assert.equal(mismatched.calls.migrate, 0); assert.equal(mismatched.calls.masterCreates, 0);
    const changedAfterMigration = mockDatabase();
    const migrate = changedAfterMigration.dependencies.migrate;
    changedAfterMigration.dependencies.migrate = () => {
        migrate(); changedAfterMigration.state.master[0].nameJa = "別の品目";
    };
    await assert.rejects(initializeTestPreviewDatabase(owners, changedAfterMigration.dependencies), /master differs/);
    assert.equal(changedAfterMigration.calls.masterCreates, 0); assert.equal(changedAfterMigration.calls.rollback, 1);
    const { state, calls, dependencies } = mockDatabase({ failMenu: true });
    await assert.rejects(initializeTestPreviewDatabase(owners, dependencies), /mock menu insert failure/);
    assert.equal(calls.rollback, 1); assert.equal(calls.commit, 0); assert.equal(calls.menuAttempts, 2);
    assert.deepEqual(state.users, []); assert.deepEqual(state.shops, []); assert.deepEqual(state.menus, []);
    assert.equal(state.master.length, 1); // migration remains applied; fixture additions rolled back by mock transaction
    assert.equal(calls.migrate, 1); assert.equal(calls.disconnect, 1);
});

test("部分masterの未知品目・重複・定義変更を拒否し、現行20 migrationをchecksum付きで読む", () => {
    const row = { ...ALLERGEN_MASTER[0], id: "existing" };
    assert.doesNotThrow(() => validatePartialTestPreviewMaster([row]));
    for (const invalid of [[row, row], [{ ...row, slug: "unknown" }], [{ ...row, sortOrder: 99 }]]) {
        assert.throws(() => validatePartialTestPreviewMaster(invalid));
    }
    assert.equal(migrations.length, 20);
    for (const migration of migrations) assert.match(migration.checksum, /^[a-f0-9]{64}$/);
});
