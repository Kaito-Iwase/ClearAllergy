import assert from "node:assert/strict";
import test from "node:test";
import { fixturePayload, prepareBatchStops, type LedgerPort, type PayloadPack, type StopCommand } from "../scripts/issue118-batch-stop";
import { fixtureName, type FixtureBinding, type OwnerBinding } from "../scripts/issue118-fixture-map";
import { menuOwners, type MenuId } from "../scripts/issue118-stop-oracle";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import type { SavedMenu } from "../features/admin/menus/schemas/menu-response";

type Input = Parameters<typeof prepareBatchStops>[0];
type Response = Awaited<ReturnType<Input["adapter"]["dispatchStop"]>>;
const runId = "11111111-1111-4111-8111-111111111111";
function setup(scenario: "T2" | "T3" = "T2") {
    const owners: OwnerBinding[] = [{ owner: "S1", shopId: "cshopa", contextRef: "context-A" }, { owner: "S2", shopId: "cshopb", contextRef: "context-B" }];
    const model = new Map<MenuId, SavedMenu>(), calls: StopCommand[] = [], claimed = new Set<string>();
    const events: Array<Parameters<Input["adapter"]["record"]>[0]> = [];
    let reads = 0, claims = 0;
    const bindings: FixtureBinding[] = (Object.keys(menuOwners) as MenuId[]).map((key, i) => {
        const menu: SavedMenu = { id: `cfixture${i}`, name: fixtureName(runId, key), description: "Synthetic only; not an original recipe",
            category: null, ingredients: "Synthetic fixture ingredient", precaution: null, priceYen: 1000,
            imageUrl: null, imageFrame: "wide", imageFit: "contain", imagePosition: "center", imageZoom: 100, imagePositionX: 50, imagePositionY: 50,
            version: 100 + i, foodVersion: 1, reviewedFoodVersion: null, publicationConfirmedFoodVersion: 1, isPublished: true, foodReviews: [],
            allergens: ALLERGEN_MASTER.map(a => ({ ...a, status: "FREE" })) };
        model.set(key, menu);
        return { key, menuId: menu.id, shopId: owners.find(o => o.owner === menuOwners[key])!.shopId, runId, name: menu.name,
            creation: { operationId: `22222222-2222-4222-8222-${String(i).padStart(12, "0")}`, status: 201, outcome: "CONFIRMED_SUCCESS" },
            before: { version: menu.version, foodVersion: 1, publicationConfirmedFoodVersion: 1, isPublished: true } };
    });
    // Prepared independently before adapter reads. Deliberately synthetic, not CSV data.
    const payloads: PayloadPack = { kind: "SYNTHETIC", expectedByMenu: Object.fromEntries([...model].map(([key, menu]) => [key, fixturePayload(menu)])) as PayloadPack["expectedByMenu"] };
    const apply = (command: StopCommand): Response => {
        const menu = model.get(command.key)!;
        assert.equal(command.method, "POST"); assert.equal(command.path, `/api/admin/menus/${menu.id}/stop`);
        assert.deepEqual(Object.keys(command.body), ["expectedVersion"]); assert.equal(command.body.expectedVersion, menu.version);
        menu.version++; menu.isPublished = false;
        return { status: () => 200, json: async () => ({ ok: true, menu: { id: menu.id, version: menu.version, isPublished: false } }) };
    };
    const adapter: Input["adapter"] = {
        async claimRun(manifest) { claims++; assert.equal(manifest.fixtures.length, 8); if (claimed.has(manifest.runId)) return false; claimed.add(manifest.runId); return true; },
        async assertActor(target) { assert.deepEqual(Object.keys(target).sort(), ["contextRef", "key", "menuId", "shopId"]); },
        async readOwnMenu(target) { reads++; return { shopId: target.shopId, menu: structuredClone(model.get(target.key)!) }; },
        async dispatchStop(command) { calls.push(structuredClone(command)); return apply(command); },
        async record(event) { events.push(structuredClone(event)); },
    };
    const input: Input = { scenario, runId, bindings, owners, payloads, adapter };
    return { input, adapter, model, calls, events, apply, get reads() { return reads; }, get claims() { return claims; } };
}

test("T2は4fixture別ledgerでSTOPだけを1回ずつ送り、M06と非対象4件のAPI状態を照合する", async () => {
    const f = setup(), ledgerObjects: Array<{ held: boolean; operations: Array<{ phase: string; state: string; bodyValidated?: boolean }> }> = [];
    let confirmed = 0;
    const port: LedgerPort = {
        newWriteLedger() { const ledger = { held: false, operations: [] as Array<{ phase: string; state: string; bodyValidated?: boolean }> }; ledgerObjects.push(ledger); return ledger; },
        beginWrite(ledger, phase) { assert.equal(ledger.operations.length, 0); const op = { phase, state: "ARMED" }; ledger.operations.push(op); return op; },
        holdWrite(ledger, op) { ledger.held = true; op.state = "INDETERMINATE"; },
        confirmWrite(ledger, op) { assert.equal(ledger.held, false); assert.equal(op.bodyValidated, true); op.state = "CONFIRMED_SUCCESS"; confirmed++; },
    };
    const result = await prepareBatchStops({ ...f.input, ledgerPort: port }).execute();
    assert.deepEqual(f.calls.map(c => c.key), ["M01", "M02", "M05", "M06"]);
    assert.deepEqual(result.confirmedIds, ["M01", "M02", "M05", "M06"]);
    assert.equal(confirmed, 4); assert.equal(new Set(ledgerObjects).size, 8);
    assert.equal(result.status, "ALL_STOP_RESPONSES_AND_API_READBACKS_CONFIRMED_NOT_LIVE_PASS");
    assert.equal(result.externalAuthAndDatabase, "NOT_ATTESTED"); assert.equal(result.evidenceLevel, "SYNTHETIC_ADAPTER_TEST");
    assert.equal(result.publicPropagation, "NOT_ATTESTED"); assert.ok(result.journal.every(r => r.publicRefreshPending === null));
    assert.ok(result.journal.every(r => r.dispatchCalls === 1)); assert.equal(f.reads, 24);
    assert.deepEqual(f.calls.map(c => c.contextRef), ["context-A", "context-A", "context-B", "context-B"]);
    assert.equal(result.automaticCleanup, false); assert.equal(result.automaticRetry, false); assert.equal(result.republication, false);
    assert.equal("overall" in result, false); assert.equal("requestSent" in result.journal[0], false);
});

test("T3は2件STOP後ロット割当HOLDを固定し、再公開/cleanup操作を公開しない", async () => {
    const f = setup("T3"), send = f.adapter.dispatchStop;
    f.adapter.dispatchStop = async command => { const response = await send(command); return { status: response.status,
        json: async () => ({ ...await response.json() as object, publicRefreshPending: true }) }; };
    const operator = prepareBatchStops(f.input), result = await operator.execute();
    assert.deepEqual(f.calls.map(c => c.key), ["M01", "M05"]);
    assert.equal(result.next, "HOLD_LOT_ALLOCATION_NO_REPUBLICATION");
    assert.ok(result.journal.every(r => r.publicRefreshPending === true));
    assert.deepEqual(Object.keys(operator), ["execute"]);
    await assert.rejects(operator.execute(), /BATCH_INPUT_REFUSED/);
});

test("guardの送信前拒否はdispatcher未呼出とし、原例外を記録しない", async () => {
    const f = setup(); f.adapter.assertActor = async () => { throw Error("provider secret"); };
    const result = await prepareBatchStops(f.input).execute();
    assert.equal(result.status, "PREFLIGHT_REFUSED_NO_DISPATCH"); assert.equal(f.calls.length, 0);
    assert.ok(result.journal.every(r => r.state === "NOT_DISPATCHED")); assert.equal(JSON.stringify(result).includes("provider secret"), false);
});

test("実行前のpayload差異/異店舗/不足品目は送信前で拒否する", async () => {
    for (const condition of ["payload", "owner", "master"] as const) {
        const f = setup();
        if (condition === "payload") f.input.payloads.expectedByMenu.M06.ingredients = "Wrong expected payload";
        if (condition === "owner") f.adapter.readOwnMenu = async target => ({ shopId: "cwrong", menu: f.model.get(target.key)! });
        if (condition === "master") f.model.get("M06")!.allergens.pop();
        assert.equal((await prepareBatchStops(f.input).execute()).status, "PREFLIGHT_REFUSED_NO_DISPATCH");
        assert.equal(f.calls.length, 0);
    }
});

test("応答statusは既知400でもDB非変更を断定せず、後続送信/cleanupを止める", async () => {
    const f = setup(); f.adapter.dispatchStop = async command => { f.calls.push(command); return { status: () => 400, json: async () => { throw Error("must not consume rejection body"); } }; };
    const result = await prepareBatchStops(f.input).execute();
    assert.equal(f.calls.length, 1); assert.equal(result.status, "HOLD_NO_FURTHER_DISPATCH");
    assert.equal(result.journal[0].state, "KNOWN_HTTP_NON_SUCCESS"); assert.equal(result.journal[0].httpStatus, 400);
    assert.deepEqual(result.unknownOrUnverifiedIds, ["M01"]);
});

test("合成commit後に200本文を失うとunknownで停止し、GETや別instanceで再送しない", async () => {
    const f = setup(); f.adapter.dispatchStop = async command => { f.calls.push(command); f.apply(command); return { status: () => 200, json: async () => { throw Error("synthetic response loss"); } }; };
    const operator = prepareBatchStops(f.input), result = await operator.execute();
    assert.equal(f.model.get("M01")!.isPublished, false); assert.equal(f.calls.length, 1); assert.equal(f.reads, 9);
    assert.equal(result.journal[0].state, "INDETERMINATE"); assert.deepEqual(result.confirmedIds, []);
    assert.deepEqual(result.unknownOrUnverifiedIds, ["M01"]);
    await assert.rejects(operator.execute(), /BATCH_INPUT_REFUSED/);
    assert.equal((await prepareBatchStops(f.input).execute()).status, "RUN_ALREADY_CLAIMED_NO_DISPATCH");
    assert.equal(f.calls.length, 1);
});

test("開始前中止はclaim/read/sendせず、1件確定後の中止は次のfixtureへ進まない", async () => {
    const before = setup(), firstAbort = new AbortController(); firstAbort.abort();
    assert.equal((await prepareBatchStops({ ...before.input, signal: firstAbort.signal }).execute()).status, "ABORTED_BEFORE_DISPATCH");
    assert.equal(before.claims, 0); assert.equal(before.reads, 0); assert.equal(before.calls.length, 0);
    const between = setup(), controller = new AbortController();
    between.adapter.record = async event => { between.events.push(event); if (event.stage === "RESPONSE_AND_READBACK_CONFIRMED") controller.abort(); };
    const result = await prepareBatchStops({ ...between.input, signal: controller.signal }).execute();
    assert.equal(result.status, "ABORTED_BETWEEN_OPERATIONS"); assert.deepEqual(result.confirmedIds, ["M01"]); assert.equal(between.calls.length, 1);
});

test("送信callback待ち中の中止はunknownを固定し、遅延成功しても後続/cleanupへ復帰しない", async () => {
    const f = setup(), controller = new AbortController();
    let started!: () => void, finish!: () => void;
    const sent = new Promise<void>(resolve => { started = resolve; });
    f.adapter.dispatchStop = command => { f.calls.push(command); started(); return new Promise(resolve => { finish = () => resolve(f.apply(command)); }); };
    const pending = prepareBatchStops({ ...f.input, signal: controller.signal }).execute();
    await sent; controller.abort(); const result = await pending;
    assert.equal(result.status, "HOLD_NO_FURTHER_DISPATCH"); assert.equal(result.journal[0].state, "INDETERMINATE");
    finish(); await Promise.resolve(); await Promise.resolve();
    assert.equal(f.model.get("M01")!.isPublished, false); assert.equal(f.calls.length, 1); assert.equal(f.reads, 9);
    assert.deepEqual(result.confirmedIds, []); assert.equal(result.automaticCleanup, false);
});

test("200と本文が既知でもreadbackの内容差異は成功にせず保持する", async () => {
    const f = setup(); f.adapter.dispatchStop = async command => { f.calls.push(command); const response = f.apply(command); f.model.get(command.key)!.ingredients = "Unexpected content change"; return response; };
    const result = await prepareBatchStops(f.input).execute();
    assert.equal(result.journal[0].state, "KNOWN_RESPONSE_VERIFICATION_HELD"); assert.equal(f.calls.length, 1);
    assert.deepEqual(result.confirmedIds, []);
});

test("全STOP応答が確定しても非対象メニューの終端変化を隠さない", async () => {
    const f = setup(), send = f.adapter.dispatchStop;
    f.adapter.dispatchStop = async command => { const response = await send(command); if (command.key === "M06") f.model.get("M08")!.description = "Unexpected unrelated change"; return response; };
    const result = await prepareBatchStops(f.input).execute();
    assert.equal(result.status, "HOLD_FINAL_API_RECONCILIATION_UNVERIFIED"); assert.equal(result.confirmedIds.length, 4); assert.equal(f.calls.length, 4);
});

test("証跡保存の失敗は送信前/確定応答後を区別し、原例外と成功を出さない", async () => {
    for (const stage of ["DISPATCH_INTENT_NOT_NETWORK_RECEIPT", "RESPONSE_AND_READBACK_CONFIRMED"]) {
        const f = setup(); f.adapter.record = async event => { if (event.stage === stage) throw Error("secret persistence failure"); };
        const result = await prepareBatchStops(f.input).execute();
        assert.equal(result.evidenceAcknowledged, false); assert.equal(f.calls.length, stage.startsWith("DISPATCH") ? 0 : 1);
        assert.equal(result.confirmedIds.length, 0); assert.equal(JSON.stringify(result).includes("secret persistence"), false);
    }
});

test("STOP直前の版変更は再取得版で無断再送せず、その場で停止する", async () => {
    const f = setup(), read = f.adapter.readOwnMenu;
    f.adapter.readOwnMenu = async target => { if (f.reads === 8) f.model.get(target.key)!.version++; return read(target); };
    const result = await prepareBatchStops(f.input).execute();
    assert.equal(result.status, "PREFLIGHT_REFUSED_NO_FURTHER_DISPATCH"); assert.equal(f.calls.length, 0);
});

test("複数fixtureで同じledgerを共有するportと原本hash不一致を開始前に拒否する", () => {
    const f = setup(), shared = { held: false, operations: [] };
    assert.throws(() => prepareBatchStops({ ...f.input, ledgerPort: { newWriteLedger: () => shared,
        beginWrite: () => { throw Error("unused"); }, holdWrite: () => {}, confirmWrite: () => {} } }), /BATCH_INPUT_REFUSED/);
    assert.throws(() => prepareBatchStops({ ...f.input, payloads: { ...f.input.payloads, kind: "CALLER_PROJECTED_ORIGINAL", archiveSha256: "wrong" } }), /BATCH_INPUT_REFUSED/);
    assert.equal(f.calls.length, 0); assert.equal(f.claims, 0);
});

test("不正なstatus値を生ログへ混入させずunknownとする", async () => {
    const f = setup(); f.adapter.dispatchStop = async command => { f.calls.push(command); return { status: () => "secret invalid status", json: async () => ({}) } as unknown as Response; };
    const result = await prepareBatchStops(f.input).execute();
    assert.equal(result.journal[0].httpStatus, null); assert.equal(result.journal[0].state, "INDETERMINATE");
    assert.equal(JSON.stringify(result).includes("secret invalid status"), false);
});
