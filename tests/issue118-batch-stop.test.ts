import assert from "node:assert/strict";
import test from "node:test";
import { fixturePayload, originalCreateRequests, originalEvidence, prepareBatchStops, prepareOriginalScenario, projectOriginalPayloads, t2PrivateCorrections, type LedgerPort, type OriginalScenarioAdapter, type PayloadPack, type StopCommand } from "../scripts/issue118-batch-stop";
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
    assert.equal(result.next, "HOLD_RECONCILE_ORIGINAL_OPERATION_NO_WRITES");
    assert.deepEqual(result.unknownOrUnverifiedIds, ["M01"]);
});

test("合成commit後に200本文を失うとunknownで停止し、GETや別instanceで再送しない", async () => {
    const f = setup(); f.adapter.dispatchStop = async command => { f.calls.push(command); f.apply(command); return { status: () => 200, json: async () => { throw Error("synthetic response loss"); } }; };
    const operator = prepareBatchStops(f.input), result = await operator.execute();
    assert.equal(f.model.get("M01")!.isPublished, false); assert.equal(f.calls.length, 1); assert.equal(f.reads, 9);
    assert.equal(result.journal[0].state, "INDETERMINATE"); assert.deepEqual(result.confirmedIds, []);
    assert.equal(result.next, "HOLD_RECONCILE_ORIGINAL_OPERATION_NO_WRITES");
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
    assert.equal(result.next, "HOLD_RECONCILE_ORIGINAL_OPERATION_NO_WRITES");
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

test("原本転記8件を800円/正確な原材料/29明示状態へ投影し、モック版やPUB履歴を作成bodyへ入れない", () => {
    const pack = projectOriginalPayloads(runId);
    assert.equal(pack.kind, "CALLER_PROJECTED_ORIGINAL");
    const operations = Object.fromEntries((Object.keys(menuOwners) as MenuId[]).map((key, i) => [key, `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`])) as Record<MenuId, string>;
    const requests = originalCreateRequests(runId, operations);
    assert.equal(requests.length, 8);
    assert.equal(requests[5].originalName, "日替り温サラダ"); assert.equal(requests[5].recipeIngredientId, "P-SAUCE");
    assert.equal(requests[5].body.ingredients, "かぼちゃ、にんじん、共通ソース（トマト、ひまわり油、塩）");
    for (const request of requests) {
        assert.equal(request.body.priceYen, 800); assert.equal(request.body.isPublished, false);
        assert.equal(Object.keys(request.body.allergenStatusBySlug!).length, 29); assert.equal(request.body.allergenStatusBySlug!.milk, "FREE");
        assert.equal(request.body.name?.includes(request.originalName), true);
        assert.equal(Object.keys(request.body).some(key => /version|review|publication|checkedAt/i.test(key)), false);
        assert.equal(request.source.provenance, "PARENT_ORIGINAL_TRANSCRIPTION_NOT_BYTE_COPY");
    }
    assert.equal(requests[0].body.allergenStatusBySlug!.chicken, "CONTAINS");
    assert.ok(requests.slice(1).every(request => Object.values(request.body.allergenStatusBySlug!).every(state => state === "FREE")));
    assert.equal(requests.filter(request => request.recipeIngredientId === "P-SAUCE").length, 4);
    assert.throws(() => originalCreateRequests(runId, { ...operations, M06: operations.M05 }), /BATCH_INPUT_REFUSED/);
});

test("条件ごとに原本初期値を独立投影し、マスタ欠落/追加と照会カードの先渡しを拒む", () => {
    const first = projectOriginalPayloads(runId); first.expectedByMenu.M03.allergenStatusBySlug.milk = "CONTAINS";
    assert.equal(projectOriginalPayloads(runId).expectedByMenu.M03.allergenStatusBySlug.milk, "FREE");
    assert.throws(() => projectOriginalPayloads(runId, ALLERGEN_MASTER.slice(1).map(a => a.slug)), /BATCH_INPUT_REFUSED/);
    assert.throws(() => projectOriginalPayloads(runId, [...ALLERGEN_MASTER.map(a => a.slug), "unknown"]), /BATCH_INPUT_REFUSED/);
    assert.deepEqual(originalEvidence("T2", "START").map(card => card.id), ["E21"]);
    assert.deepEqual(originalEvidence("T3", "START").map(card => card.id), ["E31"]);
    assert.deepEqual(originalEvidence("T2", "PHYSICAL_SOURCE_LOOKUP").map(card => card.id), ["E23"]);
    assert.deepEqual(originalEvidence("T3", "LOT_ALLOCATION_LOOKUP").map(card => card.id), ["E32"]);
    assert.deepEqual(originalEvidence("T3", "PHYSICAL_SOURCE_LOOKUP"), []);
});

test("T2のE21/E23訂正はM06を含む4件の乳CONTAINSを非公開で作り、T3や一律MAYへ流用しない", () => {
    assert.throws(() => t2PrivateCorrections(runId, ["E21"]), /BATCH_INPUT_REFUSED/);
    const corrections = t2PrivateCorrections(runId, ["E21", "E23"]);
    assert.deepEqual(corrections.map(c => c.key), ["M01", "M02", "M05", "M06"]);
    assert.ok(corrections.every(c => c.body.isPublished === false && c.body.allergenStatusBySlug.milk === "CONTAINS" && c.body.ingredients.includes("乳成分")));
    assert.equal(corrections[0].body.allergenStatusBySlug.chicken, "CONTAINS");
    assert.ok(corrections.every(c => !("publicationAction" in c.body) && !("foodReview" in c.body) && !("foodChangeReported" in c.body)));
});

function originalRun(scenario: "T2" | "T3" = "T2") {
    const f = setup(scenario), writes: Array<{ key: MenuId; phase: string }> = [], claims = new Set<string>();
    f.model.clear();
    const operationIds = Object.fromEntries((Object.keys(menuOwners) as MenuId[]).map((key, i) => [key,
        `44444444-4444-4444-8444-${String(i).padStart(12, "0")}`])) as Record<MenuId, string>;
    const adapter: OriginalScenarioAdapter = { ...f.adapter,
        async claimScenario(manifest) { if (claims.has(manifest.runId)) return false; claims.add(manifest.runId); return true; },
        async assertOwner(owner) { assert.ok(f.input.owners.some(o => o.contextRef === owner.contextRef && o.shopId === owner.shopId)); },
        async dispatch(command) {
            writes.push({ key: command.key, phase: command.phase });
            assert.equal(command.owner.owner, menuOwners[command.key]);
            const body = command.body;
            if (command.phase === "CREATE") {
                assert.equal(command.method, "POST"); assert.equal(command.path, "/api/admin/menus"); assert.equal(body.isPublished, false);
                const i = Object.keys(menuOwners).indexOf(command.key);
                const menu: SavedMenu = { ...projectOriginalPayloads(runId).expectedByMenu[command.key],
                    id: `c${String(i + 1).padStart(24, "0")}`, allergens: ALLERGEN_MASTER.map(a => ({ ...a, status: body.allergenStatusBySlug![a.slug] })),
                    version: 24 + i, foodVersion: 12 + i, reviewedFoodVersion: null, publicationConfirmedFoodVersion: null, isPublished: false, foodReviews: [] };
                f.model.set(command.key, menu);
                return { status: () => 201, json: async () => ({ id: menu.id }) };
            }
            const menu = f.model.get(command.key)!;
            assert.equal(command.method, "PUT"); assert.equal(command.path, `/api/admin/menus/${menu.id}`); assert.equal(body.expectedVersion, menu.version);
            menu.version++;
            if (command.phase === "CORRECT_PRIVATE") {
                assert.equal(menu.isPublished, false); assert.equal(body.isPublished, false);
                menu.ingredients = body.ingredients!; menu.foodVersion++; menu.publicationConfirmedFoodVersion = null;
                menu.allergens = menu.allergens.map(a => ({ ...a, status: body.allergenStatusBySlug![a.slug] }));
            } else {
                assert.equal(body.publicationAction, "publish"); menu.isPublished = true; menu.publicationConfirmedFoodVersion = menu.foodVersion;
            }
            return { status: () => 200, json: async () => ({ menu: structuredClone(menu) }) };
        },
    };
    return { ...f, adapter, writes, input: { scenario, runId, owners: f.input.owners, operationIds, adapter } };
}

test("一連のT2入口が原本8件を独立作成し、4件STOP/非公開訂正/保存版からの別再公開を各1回だけ行う", async () => {
    const f = originalRun(), run = prepareOriginalScenario(f.input), result = await run.execute();
    assert.equal(result.status, "SCENARIO_APP_RESPONSES_CONFIRMED_NOT_LIVE_PASS");
    assert.equal(result.created.length, 8); assert.equal(f.writes.length, 24);
    assert.deepEqual(f.calls.map(c => c.key), ["M01", "M02", "M05", "M06"]);
    assert.equal(new Set(result.created.map(c => c.menuId)).size, 8);
    assert.ok(f.writes.filter(w => w.phase === "CORRECT_PRIVATE").every(w => ["M01", "M02", "M05", "M06"].includes(w.key)));
    assert.equal(f.model.get("M06")!.allergens.find(a => a.slug === "milk")!.status, "CONTAINS");
    assert.ok(Object.values(result.finalVersions).every(m => m.foodVersion > 1 && m.isPublished && m.foodVersion === m.publicationConfirmedFoodVersion));
    assert.equal(result.externalAuthAndDatabase, "NOT_ATTESTED"); assert.equal(result.automaticCleanup, false);
    await assert.rejects(run.execute(), /BATCH_INPUT_REFUSED/);
    assert.equal(f.writes.length, 24);
});

test("一連のT3入口は初期FREEから2件STOP後HOLDし、訂正や再公開へ進まずT2初期値を引き継がない", async () => {
    const f = originalRun("T3"), result = await prepareOriginalScenario(f.input).execute();
    assert.equal(result.status, "SCENARIO_STOP_CONFIRMED_LOT_HOLD_NOT_LIVE_PASS");
    assert.equal(result.next, "HOLD_LOT_ALLOCATION_NO_REPUBLICATION");
    assert.equal(f.writes.length, 16); assert.deepEqual(f.calls.map(c => c.key), ["M01", "M05"]);
    assert.ok([...f.model.values()].every(m => m.allergens.find(a => a.slug === "milk")!.status === "FREE"));
    assert.equal(result.finalVersions.M01.isPublished, false); assert.equal(result.finalVersions.M05.isPublished, false);
    assert.equal("overall" in result, false);
});

test("作成201のIDは読取失敗前に保持し、create body喪失/読取不一致/応答後喪失は後続書込とcleanupを止める", async () => {
    for (const fault of ["BODY_LOST", "READBACK_LOST", "RESPONSE_LOST"] as const) {
        const f = originalRun(), send = f.adapter.dispatch;
        f.adapter.dispatch = async command => {
            const response = await send(command);
            if (fault === "RESPONSE_LOST") throw Error("secret network failure");
            if (fault === "BODY_LOST") return { status: response.status, json: async () => { throw Error("secret body"); } };
            f.model.get(command.key)!.priceYen = 999; return response;
        };
        const result = await prepareOriginalScenario(f.input).execute();
        assert.equal(result.status, "HOLD_NO_FURTHER_WRITES"); assert.equal(f.writes.length, 1); assert.equal(f.calls.length, 0);
        assert.equal(result.created.length, fault === "READBACK_LOST" ? 1 : 0);
        assert.equal(result.phases[0].state, fault === "READBACK_LOST" ? "KNOWN_RESPONSE_VERIFICATION_HELD" : "INDETERMINATE");
        assert.equal(result.next, "HOLD_RECONCILE_ORIGINAL_OPERATION_NO_WRITES"); assert.equal(JSON.stringify(result).includes("secret"), false);
    }
});

test("シナリオ排他/owner送信前拒否と途中中止では、未送信の操作をunknown成功とせずその後を送らない", async () => {
    for (const fault of ["CLAIM", "OWNER", "ABORT"] as const) {
        const f = originalRun(), controller = new AbortController();
        if (fault === "CLAIM") f.adapter.claimScenario = async () => false;
        if (fault === "OWNER") f.adapter.assertOwner = async () => { throw Error("private owner"); };
        if (fault === "ABORT") {
            const send = f.adapter.dispatch;
            f.adapter.dispatch = async command => { const response = await send(command); controller.abort(); return response; };
        }
        const result = await prepareOriginalScenario({ ...f.input, signal: controller.signal }).execute();
        assert.equal(f.writes.length, fault === "ABORT" ? 1 : 0); assert.equal(f.calls.length, 0);
        assert.notEqual(result.status, "SCENARIO_APP_RESPONSES_CONFIRMED_NOT_LIVE_PASS"); assert.equal(result.automaticRetry, false);
    }
});

test("バッチSTOPの応答不明では初期作成後の訂正/再公開を一切送らない", async () => {
    const f = originalRun(), stop = f.adapter.dispatchStop;
    f.adapter.dispatchStop = async command => { await stop(command); throw Error("unknown STOP response"); };
    const result = await prepareOriginalScenario(f.input).execute();
    assert.equal(result.status, "HOLD_NO_FURTHER_WRITES"); assert.equal(result.next, "HOLD_RECONCILE_ORIGINAL_OPERATION_NO_WRITES");
    assert.equal(f.calls.length, 1); assert.equal(f.writes.length, 16);
    assert.equal(result.stops!.unknownOrUnverifiedIds.length, 1);
});
