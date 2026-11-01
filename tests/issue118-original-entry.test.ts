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
import { createHash } from "node:crypto";

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
    const now = Date.now(), runIds = { T2: runId, T3: "77777777-7777-4777-8777-777777777777", T4: "55555555-5555-4555-8555-555555555555" };
    const allRunIds = { ...runIds, SERVICE: "66666666-6666-4666-8666-666666666666" };
    const arms = { T2: fakeEntry("T2", runIds.T2), T3: fakeEntry("T3", runIds.T3, 8), T4: fakeEntry("T2", runIds.T4, 16), SERVICE: fakeEntry("T2", allRunIds.SERVICE, 24) };
    const operationIds = { ...Object.fromEntries((["T2", "T3"] as const).map((s, arm) => [s,
        Object.fromEntries(Object.keys(menuOwners).map((key, i) => [key, `99999999-9999-4999-8999-${String(i + arm * 8).padStart(12, "0")}`]))])),
        T4: { M02: "99999999-9999-4999-8999-000000000016" } };
    const calls: Array<{ role: string; url: string; options: Record<string, unknown> }> = [];
    const idToArm = new Map<string, "T2" | "T3" | "T4" | "SERVICE">();
    const pages: ReturnType<typeof createFakePage>[] = [], pageFault = { baseline: false, after: false, close: false, preparation: false };
    function createFakePage() {
        const listeners = new Map<string, (value: never) => void>();
        let url = "about:blank", last = "", visibleName: string | null = null, notFound = false, closed = false, routeHandler: ((route: unknown) => Promise<void>) | undefined;
        const emit = (kind: string, item: unknown) => listeners.get(kind)?.(item as never);
        const navigate = async (next: string, back = false) => {
            const req = { url: () => next, method: () => "GET", resourceType: () => "document" };
            emit("request", req); let aborted = false;
            if (routeHandler) await routeHandler({ request: () => req, abort: async () => { aborted = true; }, fallback: async () => {} });
            if (aborted) { emit("requestfailed", req); throw Error(secret); }
            const previousUrl = url; url = next; if (!back) last = previousUrl;
            const menu = [...arms.T4.menus.values()].find(m => next.endsWith("/menus/" + m.id));
            visibleName = menu?.isPublished ? menu.name : null; notFound = !!menu && !menu.isPublished;
            const status = pageFault.baseline && menu?.isPublished || pageFault.after && notFound ? 500 : 200;
            emit("response", { request: () => req, status: () => status }); emit("requestfinished", req);
            return { status: () => status };
        };
        const page = { url: () => url, isClosed: () => closed,
            on: (event: string, listener: (value: never) => void) => { listeners.set(event, listener); },
            addInitScript: async () => {}, goto: (next: string) => navigate(next), reload: () => navigate(url), goBack: () => navigate(last, true),
            evaluate: async () => ({ foodNameVisible: visibleName !== null, notFoundVisible: notFound, pageshowPersisted: false, navigationType: "navigate" }),
            route: async (_pattern: string, handler: (route: unknown) => Promise<void>) => { routeHandler = handler; },
            unroute: async () => { routeHandler = undefined; }, close: async () => { if (pageFault.close) throw Error(secret); closed = true; } };
        return page;
    }
    const claims = { iss: "https://token.actions.githubusercontent.com", aud: ciIdentity.audience,
        sub: `repo:${ciIdentity.repository}:environment:${ciIdentity.environment}`, repository: ciIdentity.repository,
        repository_id: ciIdentity.repositoryId, ref: ciIdentity.ref, workflow_ref: ciIdentity.workflowRef,
        environment: ciIdentity.environment, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 600 };
    const oidc = "header." + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".SYNTHETIC";
    const bindings = [{ owner: "S1", shopId: target.shop, contextRef: "A" }, { owner: "S2", shopId: "csyntheticshopb", contextRef: "B" }];
    const actors = bindings.map(binding => {
        const expectedUserId: string = binding.owner === "S1" ? ciIdentity.ownerId : "user_3LFyNjtUBNFHoDjyYiieTXEhHd0";
        const context = { request: { fetch: async (url: string, options: Record<string, unknown>) => {
            if (options.method === "GET") return access.read(undefined, url);
            calls.push({ role: binding.owner, url, options });
            const body = options.data as Record<string, unknown>;
            const isCreate = options.method === "POST" && url === target.origin + "/api/admin/menus";
            const arm = isCreate ? (Object.entries(allRunIds).find(([, id]) => String(body.name).includes(id))![0] as keyof typeof arms) : idToArm.get(url.split("/").filter(Boolean).at(-1) === "stop"
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
        } }, pages: () => [page, ...pages.filter(p => !p.isClosed())], newPage: async () => {
            if (pageFault.preparation) throw Error(secret); const result = createFakePage(); pages.push(result); return result;
        } };
        const page = { context: () => context, url: () => target.origin + "/admin/shop", isClosed: () => false, evaluate: async () => ({ id: expectedUserId,
            pk: "pk_test_" + Buffer.from(ciIdentity.clerkDomain + "$").toString("base64") }) };
        const access = { token: () => oidc, read: async (_request: unknown, url: string) => {
            assert.ok(url.startsWith(target.origin + "/api/admin/") || url.startsWith(target.origin + "/api/menus/"));
            if (url.endsWith("/shop")) return { status: () => 200, json: async () => ({ shop: { id: binding.shopId } }) };
            const id = url.split("/").at(-1)!, arm = idToArm.get(id)!;
            const menu = [...arms[arm].menus.values()].find(m => m.id === id)!;
            return { status: () => url.includes("/api/menus/") && !menu.isPublished ? 404 : 200, json: async () => ({ menu: structuredClone(menu) }) };
        } };
        return { binding, expectedUserId, context, page, access };
    });
    const ownerEvidence = actors.map(a => ({ owner: a.binding.owner, clerkUserId: a.expectedUserId,
        shopId: a.binding.shopId, contextRef: a.binding.contextRef, deployment: target.deployment, source: target.source, origin: target.origin,
        observedUtc: new Date(now).toISOString(), verifiedBy: "human", evidenceReference: "SYNTHETIC_NOT_REAL_OWNER_PROOF" }));
    const input = { runId: "66666666-6666-4666-8666-666666666666", managed: { mode: "PREPARATION_ONLY", actors, ownerEvidence,
        identityReceipt: { ...target, environment: "Preview", status: "Ready", observedUtc: new Date(now).toISOString(),
            verifiedBy: "human", evidenceReference: "SYNTHETIC_NOT_REAL_DEPLOYMENT_PROOF" },
        claimDirectory: directory, runIds, operationIds, now: () => now, t4EvidenceLevel: "SYNTHETIC_HTTP_BROWSER" } };
    return { input, actors, calls, arms, pages, pageFault };
}
async function withClaims(action: (directory: string) => Promise<void>) {
    const directory = mkdtempSync(join(tmpdir(), "issue118-managed-synthetic-"));
    try { await action(directory); } finally {
        assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert.ok(basename(directory).startsWith("issue118-managed-synthetic-"));
        rmSync(directory, { recursive: true });
    }
}
test("未有効化の単一managed runは原本T2→独立T3→独立T4を49送信で接続し、claimと観測終了を確認する", async () => withClaims(async directory => {
    const f = managedFixture(directory), result = await prepareOriginalBatchRun(f.input).execute();
    assert.equal(result.status, "MANAGED_ADAPTER_SEQUENCE_CONFIRMED_NOT_LIVE_PASS", JSON.stringify(result.results.at(-1)));
    assert.equal(f.calls.length, 49); assert.equal(result.results.length, 3);
    assert.equal(result.t4.status, "T4_STOP_API_AND_OBSERVATIONS_CONFIRMED_NOT_LIVE_PASS");
    assert.equal(result.t4.ownedPagesClosed, true); assert.equal(result.t4.preexistingPagesPreserved, true);
    assert.equal(result.t4.observation.held.foodNameVisible, true);
    assert.equal(result.t4.observation.fresh.foodNameVisible, false);
    assert.equal(result.t4.observation.freshApi.status, 404);
    assert.equal(result.t4.observation.failedRefetch.injection, "ONE_DOCUMENT_GET_ABORTED_BEFORE_FORWARD");
    assert.equal(result.t4.observation.externalStopAndDatabase, "NOT_ATTESTED");
    assert.equal(f.arms.T4.menus.size, 1); assert.equal(f.arms.T4.menus.get("M02")!.isPublished, false);
    assert.equal(f.pages.length, 4); assert.ok(f.pages.every(p => p.isClosed()));
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
        if (mode === "clerk") f.actors[1].page.evaluate = async () => ({ id: "user_3LFyNjtUBNFHoDjyYiieTXEhHd0", pk: "pk_test_" + Buffer.from("other.clerk.accounts.dev$").toString("base64") });
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

test("T4準備/再GET/closeの失敗を総合成功にせず、STOP前後の残存公開状態と所有ページを分ける", async () => {
    for (const mode of ["baseline", "preparation", "after", "close"] as const) await withClaims(async directory => {
        const f = managedFixture(directory); f.pageFault[mode] = true;
        const result = await prepareOriginalBatchRun(f.input).execute(), t4 = result.results.at(-1);
        assert.equal(result.status, "MANAGED_HOLD_NO_FURTHER_WRITES");
        assert.equal(t4.status, "T4_HOLD_NO_FURTHER_WRITES");
        assert.equal(f.calls.length, ["baseline", "preparation"].includes(mode) ? 48 : 49);
        assert.equal(f.arms.T4.menus.get("M02")!.isPublished, ["baseline", "preparation"].includes(mode));
        assert.equal(t4.ownedPagesClosed, mode !== "close"); assert.equal(t4.preexistingPagesPreserved, true);
        assert.equal(result.automaticCleanup, false); assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE|Bearer/);
        const count = f.calls.length; const again = managedFixture(directory);
        assert.equal((await prepareOriginalBatchRun(again.input).execute()).status, "MANAGED_HOLD_NO_FURTHER_WRITES");
        assert.equal(again.calls.length, 0); assert.equal(f.calls.length, count);
    });
});

test("T4のSTOP応答喪失/不整合/中止/既存claimで観測へ進まず、再送や追加非公開cleanupをしない", async () => {
    for (const mode of ["unknown", "mismatch", "abort", "claim"] as const) await withClaims(async directory => {
        const f = managedFixture(directory), controller = new AbortController();
        if (mode === "claim") writeFileSync(join(directory, "T4-M02-STOP.json"), "KEEP");
        const original = f.actors[0].context.request.fetch;
        f.actors[0].context.request.fetch = async (url, options) => {
            const response = await original(url, options);
            const menu = f.arms.T4.menus.get("M02");
            if (menu && url.endsWith(`/menus/${menu.id}/stop`)) {
                if (mode === "unknown") return { status: () => 200, json: async () => { throw Error(secret); } };
                if (mode === "mismatch") menu.priceYen = 801;
                if (mode === "abort") controller.abort();
            }
            return response;
        };
        const result = await prepareOriginalBatchRun({ ...f.input, signal: controller.signal }).execute();
        const t4 = result.results.at(-1);
        assert.equal(result.status, "MANAGED_HOLD_NO_FURTHER_WRITES"); assert.equal(t4.status, "T4_HOLD_NO_FURTHER_WRITES");
        assert.equal(t4.observation, null); assert.equal(t4.writes.held, true);
        assert.equal(f.calls.length, mode === "claim" ? 48 : 49); assert.equal(t4.ownedPagesClosed, true);
        assert.equal(t4.preexistingPagesPreserved, true); assert.equal(t4.automaticCleanup, false);
        assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE/);
        if (mode === "claim") assert.equal(readFileSync(join(directory, "T4-M02-STOP.json"), "utf8"), "KEEP");
    });
});

function serviceCase(f: ReturnType<typeof managedFixture>, mode: "DELIVER" | "BLOCK_BEFORE_FORWARD" | "WITHHOLD_AFTER_RESPONSE", kind: "STOP" | "MENU_CREATE" | "MENU_UPLOAD" = "STOP") {
    const fixture = kind === "STOP" ? f.arms.T2.menus.get("M01")! : f.arms.T4.menus.get("M02")!;
    const create = { ...projectOriginalPayloads(f.input.runId).expectedByMenu.M02,
        operationId: "44444444-4444-4444-8444-444444444444", isPublished: false };
    const data = kind === "MENU_CREATE" ? create : { expectedVersion: fixture.version };
    const body = Buffer.from(JSON.stringify(data));
    const path = kind === "MENU_CREATE" ? "/api/admin/menus" : kind === "MENU_UPLOAD" ? "/api/admin/upload-menu-image" : `/api/admin/menus/${fixture.id}/stop`;
    const calls = { forward: 0, abort: 0, deliver: 0, readBlob: 0 }, fault = { invalidCreate: false, invalidCorrelation: false };
    const page = { context: () => f.actors[0].context, url: () => target.origin + (kind === "MENU_CREATE" ? "/admin/menus/new" : `/admin/menus/${fixture.id}/edit`) };
    const request = { url: () => target.origin + path, method: () => "POST", postDataBuffer: () => body, frame: () => ({ page: () => page }),
        allHeaders: async () => ({ cookie: secret }) };
    const pathname = `menu-images/${target.shop}/synthetic.png`, origin = "https://wtqdbklmg3bbqk4s.public.blob.vercel-storage.com";
    const route = { request: () => request, fetch: async (options: Record<string, unknown>) => {
        calls.forward++;
        assert.equal(options.maxRedirects, 0); assert.equal(options.maxRetries, 0); assert.equal(options.timeout, 20000);
        assert.ok((options.headers as Record<string, string>)["x-vercel-trusted-oidc-idp-token"]);
        const response = kind === "MENU_UPLOAD" ? { status: () => 200, json: async () => ({ url: origin + "/" + pathname, pathname }) }
            : await f.actors[0].context.request.fetch(target.origin + path, { ...options, method: "POST", data });
        return { status: response.status, headers: () => ({ "x-request-id": fault.invalidCorrelation ? secret : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }),
            json: async () => {
                const raw = await response.json();
                return fault.invalidCreate ? { ...(raw as object), publicRefreshPending: secret } : raw;
            } };
    }, abort: async () => { calls.abort++; }, fulfill: async () => { calls.deliver++; } };
    const input = { owner: "S1", mode, fileExpected: kind === "MENU_UPLOAD", route, page,
        target: { kind, method: "POST", path, bodySha256: createHash("sha256").update(body).digest("hex"),
            ...(kind === "MENU_CREATE" ? { creationOperationId: create.operationId } : { menuId: fixture.id, beforeVersion: fixture.version }) },
        observeUi: async () => ({ inputRetained: true, fileRetained: kind === "MENU_UPLOAD", successDisplayed: calls.deliver > 0, followupWrites: 0 }),
        ...(kind === "MENU_UPLOAD" ? { upload: { origin, fixtureSha256: "f6d6acb2dcf66d4e1b6419962726cf72cb16371556bc7dbdfd4e66e2caee2b8c", fixtureBytes: 68 } } : {}) };
    return { input, calls, fault, request, fixture };
}
test("サービス観測器は同じmanaged201台帳/保護送信/永続claimで3配達条件を区別する（メモリのみ）", async () => {
    for (const mode of ["DELIVER", "BLOCK_BEFORE_FORWARD", "WITHHOLD_AFTER_RESPONSE"] as const) await withClaims(async directory => {
        const f = managedFixture(directory), run = prepareOriginalBatchRun(f.input);
        assert.equal((await run.execute()).status, "MANAGED_ADAPTER_SEQUENCE_CONFIRMED_NOT_LIVE_PASS");
        const c = serviceCase(f, mode), probe = run.prepareServiceObservation(c.input), result = await probe.execute();
        assert.equal(result.status, mode === "DELIVER" ? "SERVICE_DELIVERED_AND_OWN_API_CONFIRMED_NOT_LIVE_PASS" : "SERVICE_HOLD_NO_FURTHER_WRITES");
        assert.equal(c.calls.forward, mode === "BLOCK_BEFORE_FORWARD" ? 0 : 1);
        assert.equal(c.calls.deliver, mode === "DELIVER" ? 1 : 0); assert.equal(c.calls.abort, mode === "DELIVER" ? 0 : 1);
        assert.equal(result.transportForwardCalls, c.calls.forward);
        assert.equal(result.result.clientUnknown, mode !== "DELIVER");
        assert.equal(result.result.externalAuthDatabaseBlob, "NOT_ATTESTED"); assert.equal(result.cleanup, "RETAIN_NO_DELETE_METHOD");
        assert.equal("cleanupKnownBlob" in probe, false); assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE/);
        await assert.rejects(probe.execute());
        if (mode !== "DELIVER") assert.throws(() => run.prepareServiceObservation({ ...c.input, mode: "DELIVER" }));
        assert.ok(readdirSync(directory).some(name => name.startsWith("service-")));
        assert.doesNotMatch(readFileSync(join(directory, "events.jsonl"), "utf8"), /SYNTHETIC_PRIVATE|cookie|header\./);
    });
});
test("サービスcreate201の実IDは残りの応答検証失敗前に保持し、相関不明と同じく後続を止める", async () => {
    for (const mode of ["invalidCreate", "invalidCorrelation"] as const) await withClaims(async directory => {
        const f = managedFixture(directory), run = prepareOriginalBatchRun(f.input); await run.execute();
        const c = serviceCase(f, "DELIVER", "MENU_CREATE"); c.fault[mode] = true;
        const result = await run.prepareServiceObservation(c.input).execute();
        assert.equal(result.status, "SERVICE_HOLD_NO_FURTHER_WRITES"); assert.equal(c.calls.forward, 1);
        assert.equal(c.calls.deliver, 0); assert.equal(c.calls.abort, 1); assert.equal(result.writes.held, true);
        assert.equal(result.createdMenuId, f.arms.SERVICE.menus.get("M02")!.id);
        assert.equal(result.writes.operations[0].createdId, result.createdMenuId);
        assert.ok("creationOperationId" in c.input.target);
        assert.equal(JSON.parse(readFileSync(join(directory, "service-created-" + c.input.target.creationOperationId + ".json"), "utf8")).menuId, result.createdMenuId);
        assert.throws(() => run.prepareServiceObservation(c.input)); assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE/);
    });
});
test("uploadは今回fixture/専用originの1objectを私有記録し、既知URL読取はunknownを解除も削除もしない", async () => {
    for (const mode of ["DELIVER", "WITHHOLD_AFTER_RESPONSE"] as const) await withClaims(async directory => {
        const f = managedFixture(directory), run = prepareOriginalBatchRun(f.input); await run.execute();
        const c = serviceCase(f, mode, "MENU_UPLOAD"), probe = run.prepareServiceObservation(c.input), result = await probe.execute();
        assert.equal(c.calls.forward, 1); assert.equal("cleanupKnownBlob" in probe, false);
        assert.equal(result.cleanup, "RETAIN_NO_DELETE_METHOD");
        assert.equal(readdirSync(directory).filter(x => x.startsWith("object-")).length, 1);
        const read = await probe.observeKnownBlob(async (ref: { url: string }) => {
            c.calls.readBlob++; assert.ok(ref.url.startsWith(c.input.upload!.origin + "/menu-images/" + target.shop + "/"));
            return { status: 200, sha256: c.input.upload!.fixtureSha256, bytes: 68, contentType: "image/png" };
        });
        assert.equal(read.stage, "EXACT_KNOWN_OBJECT_BYTES_MATCH"); assert.equal(read.clientUnknown, mode !== "DELIVER");
        assert.equal(c.calls.readBlob, 1); await assert.rejects(probe.observeKnownBlob(async () => { throw Error("MUST_NOT_READ_TWICE"); }));
        if (mode !== "DELIVER") assert.throws(() => run.prepareServiceObservation(c.input));
    });
});
test("サービス接続は旧fixture/別owner/未対応shopを拒否し、method不一致は送らずabortする", async () => withClaims(async directory => {
    const f = managedFixture(directory), run = prepareOriginalBatchRun(f.input); await run.execute();
    const c = serviceCase(f, "DELIVER");
    assert.throws(() => run.prepareServiceObservation({ ...c.input, target: { ...c.input.target, menuId: target.anchor } }));
    assert.throws(() => run.prepareServiceObservation({ ...c.input, owner: "S2" }));
    assert.throws(() => run.prepareServiceObservation({ ...c.input, target: { ...c.input.target, kind: "SHOP_SAVE" } }));
    c.request.method = () => "PUT";
    const result = await run.prepareServiceObservation(c.input).execute();
    assert.equal(result.status, "SERVICE_HOLD_NO_FURTHER_WRITES"); assert.equal(c.calls.forward, 0); assert.equal(c.calls.abort, 1);
    assert.equal(result.result.stage, "REQUEST_MISMATCH_NO_ACTION"); assert.equal(f.calls.length, 49);
}));

test("Aを確認してもB由来request frame/contextのCookieを使った送信は0で拒否する", async () => {
    for (const fault of ["frame", "context"] as const) await withClaims(async directory => {
        const f = managedFixture(directory), run = prepareOriginalBatchRun(f.input); await run.execute();
        const c = serviceCase(f, "DELIVER", "MENU_CREATE");
        if (fault === "frame") c.request.frame = () => ({ page: () => ({ ...c.input.page, context: () => f.actors[1].context }) });
        else c.input.page.context = () => f.actors[1].context;
        const result = await run.prepareServiceObservation(c.input).execute();
        assert.equal(result.status, "SERVICE_HOLD_NO_FURTHER_WRITES"); assert.equal(result.transportForwardCalls, 0);
        assert.equal(c.calls.forward, 0); assert.equal(c.calls.abort, 1); assert.equal(f.arms.SERVICE.menus.size, 0);
    });
});

test("通常uploadの応答が既知でもBlob bytes読取不一致はmanaged全体をHOLDし、次の保存を許さない", async () => withClaims(async directory => {
    const f = managedFixture(directory), run = prepareOriginalBatchRun(f.input); await run.execute();
    const c = serviceCase(f, "DELIVER", "MENU_UPLOAD"), probe = run.prepareServiceObservation(c.input);
    assert.equal((await probe.execute()).status, "SERVICE_DELIVERED_AND_OWN_API_CONFIRMED_NOT_LIVE_PASS");
    const got = await probe.observeKnownBlob(async () => ({ status: 200, sha256: "0".repeat(64), bytes: 68, contentType: "image/png" }));
    assert.equal(got.stage, "OBJECT_READ_UNVERIFIED"); assert.equal(got.managedHeld, true);
    assert.throws(() => run.prepareServiceObservation(serviceCase(f, "DELIVER").input));
    assert.equal(c.calls.forward, 1); assert.equal(c.calls.abort, 0);
}));
