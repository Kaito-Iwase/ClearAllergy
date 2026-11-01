import assert from "node:assert/strict";
import test from "node:test";
import { prepareOriginalBatchRun } from "../scripts/check-issue118-live-t1-browser.mjs";
import { projectOriginalPayloads, type OriginalScenarioAdapter } from "../scripts/issue118-batch-stop";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import { menuOwners, type MenuId } from "../scripts/issue118-stop-oracle";
import type { SavedMenu } from "../features/admin/menus/schemas/menu-response";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { ciIdentity } from "../scripts/issue118-ci-auth.mjs";
import { target } from "../scripts/check-issue118-live-t1-browser.mjs";

const runId = "88888888-8888-4888-8888-888888888888";
function fakeEntry(scenario: "T2" | "T3", fixtureRunId = runId, idOffset = 0) {
    const owners = [{ owner: "S1" as const, shopId: "cshopa", contextRef: "A" }, { owner: "S2" as const, shopId: "cshopb", contextRef: "B" }];
    const keys = Object.keys(menuOwners) as MenuId[], menus = new Map<MenuId, SavedMenu>(), sends: string[] = [];
    const operationIds = Object.fromEntries(keys.map((key, i) => [key, `99999999-9999-4999-8999-${String(i).padStart(12, "0")}`])) as Record<MenuId, string>;
    const payloads = projectOriginalPayloads(fixtureRunId);
    const adapter: OriginalScenarioAdapter = {
        async claimScenario() { return true; }, async claimRun() { return true; }, async record() {},
        async assertOwner(owner) { assert.equal(owners.find(o => o.owner === owner.owner)?.contextRef, owner.contextRef); },
        async assertActor(target) { assert.equal(owners.find(o => o.owner === menuOwners[target.key])?.shopId, target.shopId); },
        async readOwnMenu(target) { return { shopId: target.shopId, menu: structuredClone(menus.get(target.key)!) }; },
        async dispatch(command) {
            sends.push(command.phase + ":" + command.key);
            if (command.phase === "CREATE") {
                const menu: SavedMenu = { ...payloads.expectedByMenu[command.key], id: `c${String(keys.indexOf(command.key) + 1 + idOffset).padStart(24, "0")}`,
                    allergens: ALLERGEN_MASTER.map(a => ({ ...a, status: command.body.allergenStatusBySlug![a.slug] })), version: 43,
                    foodVersion: 19, reviewedFoodVersion: null, publicationConfirmedFoodVersion: null, foodReviews: [], isPublished: false };
                menus.set(command.key, menu);
                return { status: () => 201, json: async () => ({ id: menu.id }) };
            }
            const menu = menus.get(command.key)!;
            assert.equal(command.body.expectedVersion, menu.version); menu.version++;
            if (command.phase === "CORRECT_PRIVATE") {
                menu.ingredients = command.body.ingredients!; menu.foodVersion++; menu.publicationConfirmedFoodVersion = null;
                menu.allergens = menu.allergens.map(a => ({ ...a, status: command.body.allergenStatusBySlug![a.slug] }));
            } else { menu.isPublished = true; menu.publicationConfirmedFoodVersion = menu.foodVersion; }
            return { status: () => 200, json: async () => ({ menu: structuredClone(menu) }) };
        },
        async dispatchStop(command) {
            sends.push("STOP:" + command.key); const menu = menus.get(command.key)!;
            assert.equal(command.body.expectedVersion, menu.version); menu.version++; menu.isPublished = false;
            return { status: () => 200, json: async () => ({ ok: true, menu: { id: menu.id, version: menu.version, isPublished: false } }) };
        },
    };
    return { input: { scenario, runId: fixtureRunId, owners, operationIds, adapter }, sends, menus };
}

test("既存runnerの呼出し入口が実ledger4関数で原本T2/T3の合成runへ接続する（外部サービスなし）", async () => {
    for (const scenario of ["T2", "T3"] as const) {
        const f = fakeEntry(scenario), run = prepareOriginalBatchRun(f.input), result = await run.execute();
        assert.equal(result.status, scenario === "T2" ? "SCENARIO_APP_RESPONSES_CONFIRMED_NOT_LIVE_PASS" : "SCENARIO_STOP_CONFIRMED_LOT_HOLD_NOT_LIVE_PASS");
        assert.equal(f.sends.length, scenario === "T2" ? 28 : 18);
        assert.equal(result.externalAuthAndDatabase, "NOT_ATTESTED");
        await assert.rejects(run.execute());
    }
});

test("既存入口への結線も作成応答喪失後は後続書込を送らず、原例外を返さない", async () => {
    const f = fakeEntry("T2");
    f.input.adapter.dispatch = async () => { f.sends.push("UNKNOWN"); throw Error("secret connection data"); };
    const result = await prepareOriginalBatchRun(f.input).execute();
    assert.equal(result.status, "HOLD_NO_FURTHER_WRITES"); assert.equal(f.sends.length, 1);
    assert.equal(result.automaticCleanup, false); assert.equal(JSON.stringify(result).includes("secret connection"), false);
});

const secret = "SYNTHETIC_PRIVATE_NOT_A_CREDENTIAL";
function managedFixture(directory: string) {
    const now = Date.now(), runIds = { T2: runId, T3: "77777777-7777-4777-8777-777777777777" };
    const arms = { T2: fakeEntry("T2", runIds.T2), T3: fakeEntry("T3", runIds.T3, 8) };
    const operationIds = Object.fromEntries((["T2", "T3"] as const).map((s, arm) => [s,
        Object.fromEntries(Object.keys(menuOwners).map((key, i) => [key, `99999999-9999-4999-8999-${String(i + arm * 8).padStart(12, "0")}`]))]));
    const calls: Array<{ role: string; url: string; options: Record<string, unknown> }> = [];
    const idToArm = new Map<string, "T2" | "T3">();
    const claims = { iss: "https://token.actions.githubusercontent.com", aud: ciIdentity.audience,
        sub: `repo:${ciIdentity.repository}:environment:${ciIdentity.environment}`, repository: ciIdentity.repository,
        repository_id: ciIdentity.repositoryId, ref: ciIdentity.ref, workflow_ref: ciIdentity.workflowRef,
        environment: ciIdentity.environment, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 600 };
    const oidc = "header." + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".SYNTHETIC";
    const bindings = [{ owner: "S1", shopId: target.shop, contextRef: "A" }, { owner: "S2", shopId: "csyntheticshopb", contextRef: "B" }];
    const actors = bindings.map(binding => {
        const expectedUserId: string = binding.owner === "S1" ? ciIdentity.ownerId : "user_SYNTHETICB";
        const context = { request: { fetch: async (url: string, options: Record<string, unknown>) => {
            if (options.method === "GET") return access.read(undefined, url);
            calls.push({ role: binding.owner, url, options });
            const body = options.data as Record<string, unknown>;
            const isCreate = options.method === "POST" && url === target.origin + "/api/admin/menus";
            const arm = isCreate ? (String(body.name).includes(runIds.T2) ? "T2" : "T3") : idToArm.get(url.split("/").filter(Boolean).at(-1) === "stop"
                ? url.split("/").at(-2)! : url.split("/").at(-1)!)!;
            assert.ok(arm); const f = arms[arm];
            const id = isCreate ? undefined : url.split("/").filter(Boolean).filter(x => x !== "stop").at(-1)!;
            const key = isCreate ? / (M0[1-8]) /.exec(String(body.name))![1] as MenuId
                : [...f.menus].find(([, menu]) => menu.id === id)![0];
            assert.equal(menuOwners[key], binding.owner, "fixture must reject wrong-owner dispatch independently");
            const owner = f.input.owners.find(o => o.owner === binding.owner)!;
            if (url.endsWith("/stop")) return f.input.adapter.dispatchStop({ key, menuId: id!, shopId: owner.shopId,
                contextRef: owner.contextRef, method: "POST", path: `/api/admin/menus/${id}/stop`, body: body as { expectedVersion: number } });
            const phase = isCreate ? "CREATE" : body.publicationAction === "publish" ? "INITIAL_PUBLISH" : "CORRECT_PRIVATE";
            const response = await f.input.adapter.dispatch({ key, owner, phase, menuId: id,
                method: options.method as "POST" | "PUT", path: new URL(url).pathname, body: body as never });
            const raw = await response.json() as { id?: string };
            if (isCreate) idToArm.set(raw.id!, arm);
            return { status: response.status, json: async () => raw };
        } } };
        const page = { context: () => context, url: () => target.origin + "/admin/shop", evaluate: async () => ({ id: expectedUserId,
            pk: "pk_test_" + Buffer.from(ciIdentity.clerkDomain + "$").toString("base64") }) };
        const access = { token: () => oidc, read: async (_request: unknown, url: string) => {
            assert.ok(url.startsWith(target.origin + "/api/admin/"));
            if (url.endsWith("/shop")) return { status: () => 200, json: async () => ({ shop: { id: binding.shopId } }) };
            const id = url.split("/").at(-1)!, arm = idToArm.get(id)!;
            const menu = [...arms[arm].menus.values()].find(m => m.id === id)!;
            return { status: () => 200, json: async () => ({ menu: structuredClone(menu) }) };
        } };
        return { binding, expectedUserId, context, page, access };
    });
    const ownerEvidence = actors.map(a => ({ owner: a.binding.owner, clerkUserId: a.expectedUserId,
        shopId: a.binding.shopId, contextRef: a.binding.contextRef, deployment: target.deployment, source: target.source, origin: target.origin,
        observedUtc: new Date(now).toISOString(), verifiedBy: "human", evidenceReference: "SYNTHETIC_NOT_REAL_OWNER_PROOF" }));
    const input = { runId: "66666666-6666-4666-8666-666666666666", managed: { mode: "PREPARATION_ONLY", actors, ownerEvidence,
        identityReceipt: { ...target, environment: "Preview", status: "Ready", observedUtc: new Date(now).toISOString(),
            verifiedBy: "human", evidenceReference: "SYNTHETIC_NOT_REAL_DEPLOYMENT_PROOF" },
        claimDirectory: directory, runIds, operationIds, now: () => now } };
    return { input, actors, calls, arms };
}
async function withClaims(action: (directory: string) => Promise<void>) {
    const directory = mkdtempSync(join(tmpdir(), "issue118-managed-synthetic-"));
    try { await action(directory); } finally {
        assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert.ok(basename(directory).startsWith("issue118-managed-synthetic-"));
        rmSync(directory, { recursive: true });
    }
}
test("未有効化の単一managed runは別A/B contextと原本T2→独立T3を46送信で接続し、claimを永続化する", async () => withClaims(async directory => {
    const f = managedFixture(directory), result = await prepareOriginalBatchRun(f.input).execute();
    assert.equal(result.status, "MANAGED_ADAPTER_SEQUENCE_CONFIRMED_NOT_LIVE_PASS");
    assert.equal(f.calls.length, 46); assert.equal(result.results.length, 2);
    assert.equal(result.t4, "NOT_PREPARED_REUSE_PORT_DOCUMENTED");
    assert.ok(readdirSync(directory).includes("managed-run.json"));
    const journal = readFileSync(join(directory, "events.jsonl"), "utf8");
    assert.doesNotMatch(journal, /SYNTHETIC_PRIVATE|Authorization|Bearer|https:|__clerk|header\./);
    for (const call of f.calls) {
        assert.equal(call.options.maxRedirects, 0); assert.equal(call.options.maxRetries, 0);
        assert.equal(call.options.timeout, 20000); assert.equal(new URL(call.url).origin, target.origin);
        assert.equal((call.options.headers as Record<string, string>).Origin, target.origin);
        assert.ok((call.options.headers as Record<string, string>)["x-vercel-trusted-oidc-idp-token"]);
    }
    const again = managedFixture(directory), held = await prepareOriginalBatchRun(again.input).execute();
    assert.equal(held.status, "MANAGED_HOLD_NO_FURTHER_WRITES"); assert.equal(again.calls.length, 0);
}));
test("B根拠欠落/owner不一致/期限/共用contextを未有効化managed入口で拒否しIDを推測しない", async () => withClaims(async directory => {
    for (const mutate of [
        (f: ReturnType<typeof managedFixture>) => { f.input.managed.ownerEvidence.pop(); },
        (f: ReturnType<typeof managedFixture>) => { f.actors[1].expectedUserId = ""; },
        (f: ReturnType<typeof managedFixture>) => { f.input.managed.ownerEvidence[1].clerkUserId = "user_OTHER"; },
        (f: ReturnType<typeof managedFixture>) => { f.input.managed.ownerEvidence[1].observedUtc = "2000-01-01T00:00:00Z"; },
        (f: ReturnType<typeof managedFixture>) => { f.actors[1].context = f.actors[0].context; },
    ]) {
        const f = managedFixture(directory); mutate(f);
        assert.throws(() => prepareOriginalBatchRun(f.input), { message: "ORIGINAL_MANAGED_PREPARATION_HELD" });
        assert.equal(f.calls.length, 0); assert.equal(readdirSync(directory).length, 0);
    }
}));
test("managed送信のredirect/未知例外/部分作成不明で全体HOLDし、永続claimが新instanceの再送を阻止する", async () => {
    for (const mode of ["redirect", "unknown", "parse"] as const) await withClaims(async directory => {
        const f = managedFixture(directory); let calls = 0;
        const originalFetch = f.actors[0].context.request.fetch;
        f.actors[0].context.request.fetch = async (url, options) => {
            if (options.method === "GET") return originalFetch(url, options);
            calls++;
            if (mode === "unknown") throw Error(secret);
            return { status: () => mode === "redirect" ? 307 : 201, json: async () => { throw Error(secret); } };
        };
        const result = await prepareOriginalBatchRun(f.input).execute();
        assert.equal(result.status, "MANAGED_HOLD_NO_FURTHER_WRITES"); assert.equal(calls, 1);
        assert.equal(result.automaticCleanup, false); assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE/);
        const next = managedFixture(directory), held = await prepareOriginalBatchRun(next.input).execute();
        assert.equal(held.status, "MANAGED_HOLD_NO_FURTHER_WRITES"); assert.equal(next.calls.length, 0);
    });
});
test("contextの現在owner違い・証跡ファイル既存は送信前に止まり、既存ファイルを上書きしない", async () => withClaims(async directory => {
    const f = managedFixture(directory); f.actors[1].page.evaluate = async () => ({ id: "user_OTHER", pk: "" });
    assert.equal((await prepareOriginalBatchRun(f.input).execute()).status, "MANAGED_HOLD_NO_FURTHER_WRITES");
    assert.equal(f.calls.length, 0); assert.equal(readdirSync(directory).length, 0);
    writeFileSync(join(directory, "events.jsonl"), "KEEP"); const next = managedFixture(directory);
    assert.equal((await prepareOriginalBatchRun(next.input).execute()).status, "MANAGED_HOLD_NO_FURTHER_WRITES");
    assert.equal(next.calls.length, 0); assert.equal(readFileSync(join(directory, "events.jsonl"), "utf8"), "KEEP");
}));

test("managedの別Clerk/送信途中期限切れ/中止は後続送信を禁止し、CREATE前のclaim失敗も安全に保持する", async () => {
    for (const mode of ["clerk", "expiry", "abort", "claim"] as const) await withClaims(async directory => {
        const f = managedFixture(directory), controller = new AbortController();
        const input = { ...f.input, signal: controller.signal };
        if (mode === "clerk") f.actors[1].page.evaluate = async () => ({ id: "user_SYNTHETICB", pk: "pk_test_" + Buffer.from("other.clerk.accounts.dev$").toString("base64") });
        if (mode === "claim") writeFileSync(join(directory, "T2-M01-CREATE.json"), "KEEP");
        let clock = f.input.managed.now(); input.managed.now = () => clock;
        const original = f.actors[0].context.request.fetch;
        if (["expiry", "abort"].includes(mode)) f.actors[0].context.request.fetch = async (url, options) => {
            const response = await original(url, options);
            if (options.method !== "GET") {
                if (mode === "expiry") clock += 600001; else controller.abort();
            }
            return response;
        };
        const result = await prepareOriginalBatchRun(input).execute();
        assert.equal(result.status, "MANAGED_HOLD_NO_FURTHER_WRITES");
        assert.equal(f.calls.length, ["expiry", "abort"].includes(mode) ? 1 : 0);
        assert.equal(result.automaticCleanup, false); assert.equal(result.automaticRetry, false);
        if (mode === "claim") assert.equal(readFileSync(join(directory, "T2-M01-CREATE.json"), "utf8"), "KEEP");
    });
});
