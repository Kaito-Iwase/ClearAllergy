import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import { DEMO_MENUS } from "../prisma/demo-menus";
import { assertTestShopFixtureTarget, createTestShopMenuFixtures, initializeTestShopFixtures, parseTestShopTarget } from "../scripts/test-shop-fixtures";

const master = ALLERGEN_MASTER.map((a, i) => ({ ...a, id: `allergen-${i}` }));
const target = { shopId: "fictional-shop-a", ownerClerkUserId: "user_testA" };
const args = ["--shop-id", target.shopId, "--owner-clerk-user-id", target.ownerClerkUserId, "--apply"];
const ciUrl = "postgresql://clearallergy_ci:local_ci_only@127.0.0.1:5432/clearallergy_ci";
const ciEnv = { CLEARALLERGY_CI_FIXTURES: "true", DATABASE_URL: ciUrl, DIRECT_URL: ciUrl };

test("初期化は対象店舗・所有者とapplyの明示を要求し、曖昧な引数を拒否する", () => {
    assert.deepEqual(parseTestShopTarget(args), target);
    for (const invalid of [[], args.slice(0, 4), [...args, "--reset"], [...args, "--publish"],
        ["--shop-id", "", ...args.slice(2)], ["--shop-id", "a b", ...args.slice(2)],
        [...args.slice(0, 3), "someone@example.com", "--apply"]]) {
        assert.throws(() => parseTestShopTarget(invalid));
    }
});

test("既存CI・Composeガードだけを再利用し、remote Preview・片側の差替えを拒否する", () => {
    assert.doesNotThrow(() => assertTestShopFixtureTarget(ciEnv));
    const url = "postgresql://clearallergy_test:local_test_only@test-db:5432/clearallergy_test";
    assert.doesNotThrow(() => assertTestShopFixtureTarget({ CLEARALLERGY_TEST_ENV: "true", DATABASE_URL: url, DIRECT_URL: url }));
    for (const env of [{}, { ...ciEnv, CLEARALLERGY_CI_FIXTURES: undefined },
        { ...ciEnv, DIRECT_URL: ciUrl.replace("127.0.0.1", "shared.example") },
        { ...ciEnv, DATABASE_URL: ciUrl.replace("127.0.0.1", "preview.example"), DIRECT_URL: ciUrl.replace("127.0.0.1", "preview.example") }]) {
        assert.throws(() => assertTestShopFixtureTarget(env));
    }
});

test("既存の架空シナリオの全品目を保ち、公開・食品確認・版を合成しない", () => {
    const fixtures = createTestShopMenuFixtures([...master].reverse());
    assert.equal(fixtures.length, DEMO_MENUS.length);
    for (const [i, fixture] of fixtures.entries()) {
        assert.equal(fixture.isPublished, false);
        assert.equal(fixture.name, DEMO_MENUS[i].name);
        assert.equal(fixture.ingredients, DEMO_MENUS[i].ingredients);
        assert.equal(fixture.precaution, DEMO_MENUS[i].precaution);
        assert.deepEqual(Object.keys(fixture).sort(), [...Object.keys(DEMO_MENUS[i]).filter(k => k !== "allergenStatusBySlug"), "isPublished", "allergenLinks"].sort());
        assert.equal(fixture.allergenLinks.create.length, ALLERGEN_MASTER.length);
        for (const link of fixture.allergenLinks.create) {
            const allergen = master.find(a => a.id === link.allergenId)!;
            assert.equal(link.status, DEMO_MENUS[i].allergenStatusBySlug[allergen.slug]);
        }
    }
    fixtures[0].allergenLinks.create[0].status = "UNKNOWN";
    assert.deepEqual(createTestShopMenuFixtures(master)[0].allergenLinks.create.map(a => a.status), master.map(a => DEMO_MENUS[0].allergenStatusBySlug[a.slug]));
});

test("マスタの不足・増加・重複・名前変更はFREE補完やマスタ書換えをせず拒否する", () => {
    for (const invalid of [master.slice(1), [...master, { ...master[0], id: "extra", slug: "new-allergen" }],
        master.map((a, i) => i === 0 ? { ...a, id: master[1].id } : a),
        master.map((a, i) => i === 0 ? { ...master[1], id: a.id } : a),
        master.map((a, i) => i === 0 ? { ...a, nameJa: "別品目" } : a)]) {
        assert.throws(() => createTestShopMenuFixtures(invalid));
    }
});

test("DBアクセス前に接続ガードが拒否する", async () => {
    const original = process.env.CLEARALLERGY_CI_FIXTURES;
    const originalTest = process.env.CLEARALLERGY_TEST_ENV;
    delete process.env.CLEARALLERGY_CI_FIXTURES;
    delete process.env.CLEARALLERGY_TEST_ENV;
    try {
        await assert.rejects(initializeTestShopFixtures({} as PrismaClient, target), /専用Compose/);
    } finally {
        if (original === undefined) delete process.env.CLEARALLERGY_CI_FIXTURES; else process.env.CLEARALLERGY_CI_FIXTURES = original;
        if (originalTest === undefined) delete process.env.CLEARALLERGY_TEST_ENV; else process.env.CLEARALLERGY_TEST_ENV = originalTest;
    }
});

test("明示された空店舗だけへtransaction内で下書きを追加し、再実行・所有者不一致を拒否する", async () => {
    const original = Object.fromEntries(Object.keys(ciEnv).map(k => [k, process.env[k]]));
    Object.assign(process.env, ciEnv);
    try {
        const created: unknown[] = [];
        let eligible = true;
        const prisma = { $transaction: async (run: (tx: unknown) => Promise<number>, options: unknown) => {
            assert.deepEqual(options, { isolationLevel: "Serializable" });
            return run({
                shop: { findFirst: async (query: unknown) => {
                    assert.deepEqual(query, { where: { id: target.shopId, ownerClerkUserId: target.ownerClerkUserId,
                        user: { clerkUserId: target.ownerClerkUserId }, name: { startsWith: "【架空・テスト専用】" }, menus: { none: {} } }, select: { id: true } });
                    return eligible ? { id: target.shopId } : null;
                } },
                allergen: { findMany: async () => master },
                menuItem: { create: async ({ data }: { data: { shopId: string; isPublished: boolean } }) => {
                    assert.equal(data.shopId, target.shopId);
                    assert.equal(data.isPublished, false);
                    created.push(data);
                } },
            });
        } } as unknown as PrismaClient;
        assert.equal(await initializeTestShopFixtures(prisma, target), DEMO_MENUS.length);
        eligible = false;
        await assert.rejects(initializeTestShopFixtures(prisma, target), /空の架空テスト店舗/);
        assert.equal(created.length, DEMO_MENUS.length);
    } finally {
        for (const [key, value] of Object.entries(original)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    }
});

test("CLIはapplyなし・remote指定をPrisma読込前に拒否し、接続値を出力しない", () => {
    for (const argv of [args.slice(0, 4), args]) {
        const secretUrl = "postgresql://private:secret@shared.example/shared";
        const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/initialize-test-shop.ts", ...argv], {
            encoding: "utf8", env: { PATH: process.env.PATH, NODE_ENV: "test", DATABASE_URL: secretUrl, DIRECT_URL: secretUrl, CLEARALLERGY_TEST_ENV: "true" },
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /初期化を中止/);
        assert.doesNotMatch(result.stderr + result.stdout, /private|secret|shared\.example|Prisma|fictional-shop-a|user_testA/);
    }
});
