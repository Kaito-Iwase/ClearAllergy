import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { prepareWriteObservation, type ProbeTarget } from "../scripts/issue118-service-observer";

type Input = Parameters<typeof prepareWriteObservation>[0];
const scope = { runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", applicationSha: "a".repeat(40), shopId: "cshopa", isolationReceiptSha256: "b".repeat(64) };
const requestId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const target: ProbeTarget = { kind: "STOP", method: "POST", path: "/api/admin/menus/cfixture/stop", menuId: "cfixture", beforeVersion: 42, bodySha256: "c".repeat(64) };
function fixture(mode: Input["mode"] = "WITHHOLD_AFTER_RESPONSE") {
    const calls = { forward: 0, abort: 0, deliver: 0, ui: 0 }, events: unknown[] = [];
    const adapter: Input["adapter"] = { async assertScope() {}, async claim() { return true; },
        async forwardOnce() { calls.forward++; return { status: () => 200, requestId: async () => requestId,
            json: async () => ({ ok: true, menu: { id: "cfixture", isPublished: false, version: 43 } }) }; },
        async abortClient() { calls.abort++; }, async deliverOnce() { calls.deliver++; },
        async observeUi() { calls.ui++; return { inputRetained: true, fileRetained: true, successDisplayed: false, followupWrites: 0 }; },
        async record(e) { events.push(structuredClone(e)); },
    };
    const input: Input = { scope, target, mode, fileExpected: true, adapter };
    return { input, adapter, calls, events, request: { method: target.method, path: target.path, bodySha256: target.bodySha256 } };
}

test("送信前遮断と上流応答取得後の返却抑止を別の事実として記録し、どちらも実DB確定や画面成功へ変換しない", async () => {
    for (const mode of ["BLOCK_BEFORE_FORWARD", "WITHHOLD_AFTER_RESPONSE", "DELIVER"] as const) {
        const f = fixture(mode), probe = prepareWriteObservation(f.input), result = await probe.execute(f.request);
        assert.equal(result.forwards, mode === "BLOCK_BEFORE_FORWARD" ? 0 : 1);
        assert.equal(f.calls.deliver, mode === "DELIVER" ? 1 : 0); assert.equal(f.calls.abort, mode === "DELIVER" ? 0 : 1);
        assert.equal(result.upstreamStatus, mode === "BLOCK_BEFORE_FORWARD" ? null : 200);
        assert.equal(result.clientUnknown, mode !== "DELIVER"); assert.equal(result.externalAuthDatabaseBlob, "NOT_ATTESTED");
        assert.equal(result.automaticRetry, false); assert.equal(result.automaticCleanup, false); assert.equal("overall" in result, false);
        await assert.rejects(probe.execute(f.request)); assert.equal(f.calls.forward, result.forwards);
    }
});

test("対象method/path/bodyの不一致は他の要求をabortもforwardもせず、scope/claimの拒否は送信前で止まる", async () => {
    for (const fault of ["method", "path", "bodySha256", "scope", "claim"] as const) {
        const f = fixture();
        if (fault === "scope") f.adapter.assertScope = async () => { throw Error("secret source URL"); };
        else if (fault === "claim") f.adapter.claim = async () => false;
        else if (fault === "method") f.request.method = "PUT";
        else f.request[fault] = "mismatch";
        const result = await prepareWriteObservation(f.input).execute(f.request);
        assert.equal(f.calls.forward, 0); assert.equal(f.calls.deliver, 0);
        assert.equal(f.calls.abort, ["scope", "claim"].includes(fault) ? 1 : 0);
        assert.equal(result.clientUnknown, true); assert.equal(JSON.stringify(result).includes("secret"), false);
    }
});

test("上流例外/本文喪失/相関ID不正/旧版の応答では再送せず1回だけabortし原例外を返さない", async () => {
    for (const fault of ["forward", "body", "requestId", "version"] as const) {
        const f = fixture(), original = f.adapter.forwardOnce;
        f.adapter.forwardOnce = async () => {
            const r = await original();
            if (fault === "forward") throw Error("secret provider exception");
            if (fault === "body") r.json = async () => { throw Error("secret response"); };
            if (fault === "requestId") r.requestId = async () => "secret header";
            if (fault === "version") r.json = async () => ({ ok: true, menu: { id: "cfixture", version: 42, isPublished: false } });
            return r;
        };
        const result = await prepareWriteObservation(f.input).execute(f.request);
        assert.equal(result.stage, "HOLD_AFTER_FORWARD_NO_RETRY_OR_CLEANUP"); assert.equal(result.bodyValidated, false);
        assert.equal(f.calls.forward, 1); assert.equal(f.calls.abort, 1); assert.equal(f.calls.deliver, 0);
        assert.equal(JSON.stringify(result).includes("secret"), false);
    }
});

test("abort/deliver自体の応答喪失と不適切なUI表示を誤成功にせず、client操作も再試行しない", async () => {
    for (const fault of ["abort", "deliver", "ui"] as const) {
        const f = fixture(fault === "deliver" ? "DELIVER" : "WITHHOLD_AFTER_RESPONSE");
        if (fault === "abort") f.adapter.abortClient = async () => { f.calls.abort++; throw Error("secret abort"); };
        if (fault === "deliver") f.adapter.deliverOnce = async () => { f.calls.deliver++; throw Error("secret delivery"); };
        if (fault === "ui") f.adapter.observeUi = async () => ({ inputRetained: true, fileRetained: true, successDisplayed: true, followupWrites: 1 });
        const result = await prepareWriteObservation(f.input).execute(f.request);
        assert.equal(result.stage, "HOLD_AFTER_FORWARD_NO_RETRY_OR_CLEANUP"); assert.equal(result.clientUnknown, true);
        assert.equal(f.calls.forward, 1); assert.equal(f.calls.abort, fault === "deliver" ? 0 : 1);
    }
});

test("UI観測の追加プロパティと不正な必須型に秘密があっても、HOLD結果へ生値を残さない", async () => {
    for (const invalidField of [false, true]) {
        const f = fixture();
        f.adapter.observeUi = async () => ({ inputRetained: invalidField ? "secret-invalid-ui-field" : true,
            fileRetained: true, successDisplayed: false, followupWrites: 0, authorization: "secret-extra-property" }) as unknown as Awaited<ReturnType<Input["adapter"]["observeUi"]>>;
        const result = await prepareWriteObservation(f.input).execute(f.request);
        assert.equal(JSON.stringify(result).includes("secret"), false);
        if (invalidField) { assert.equal(result.stage, "HOLD_AFTER_FORWARD_NO_RETRY_OR_CLEANUP"); assert.equal(result.ui, undefined); }
        else assert.deepEqual(Object.keys(result.ui!).sort(), ["fileRetained", "followupWrites", "inputRetained", "successDisplayed"]);
    }
});

test("作成201の有効IDを後の応答契約エラーより先に記録し、operationIdとともに照合用に残す", async () => {
    const f = fixture(); f.input.target = { kind: "MENU_CREATE", method: "POST", path: "/api/admin/menus", bodySha256: target.bodySha256, creationOperationId: scope.runId };
    const menuId = "c123456789012345678901234";
    f.adapter.forwardOnce = async () => ({ status: () => 201, requestId: async () => requestId, json: async () => ({ id: menuId, publicRefreshPending: "bad" }) });
    const result = await prepareWriteObservation(f.input).execute({ ...f.request, path: "/api/admin/menus" });
    assert.equal(result.createdMenuId, menuId); assert.equal(result.creationOperationId, scope.runId);
    assert.equal(result.bodyValidated, false); assert.equal(result.stage, "HOLD_AFTER_FORWARD_NO_RETRY_OR_CLEANUP");
    assert.ok(f.events.some(e => (e as { stage: string }).stage === "CREATED_201_ID_RECORDED"));
});

test("メニュー/店舗の返却抑止も既存保存応答parserのIDと実版を検査してから観測する", async () => {
    for (const kind of ["MENU_SAVE", "SHOP_SAVE"] as const) for (const wrongId of [false, true]) {
        const f = fixture();
        f.input.target = kind === "MENU_SAVE" ? { ...target, kind, method: "PUT", path: "/api/admin/menus/cfixture" }
            : { kind, method: "PUT", path: "/api/admin/shop", bodySha256: target.bodySha256, beforeUpdatedAt: "2026-11-01T10:00:00Z" };
        const shop = { ...Object.fromEntries(["description", "address", "prefecture", "city", "nearestStation", "category", "googlePlaceId", "hours", "regularHoliday", "phoneNumber", "note"].map(k => [k, null])),
            id: wrongId ? "cwrong" : scope.shopId, name: "架空店舗", latitude: null, longitude: null, averageBudgetYen: null, coverImageUrl: null,
            coverImageFrame: "square", coverImageFit: "cover", coverImagePosition: "center", coverImageZoom: 100, coverImagePositionX: 50, coverImagePositionY: 50, updatedAt: "2026-11-01T10:00:01Z" };
        const body = kind === "SHOP_SAVE" ? { shop } : { menu: { id: wrongId ? "cwrong" : "cfixture", version: 43, foodVersion: 12,
            reviewedFoodVersion: null, publicationConfirmedFoodVersion: null, isPublished: false, imageUrl: null, foodReviews: [] } };
        f.adapter.forwardOnce = async () => ({ status: () => 200, requestId: async () => requestId, json: async () => body });
        const result = await prepareWriteObservation(f.input).execute({ ...f.request, method: "PUT", path: f.input.target.path });
        assert.equal(result.bodyValidated, !wrongId); assert.equal(result.clientUnknown, true); assert.equal(f.calls.deliver, 0);
        assert.equal(result.stage, wrongId ? "HOLD_AFTER_FORWARD_NO_RETRY_OR_CLEANUP" : "UPSTREAM_RESPONSE_WITHHELD_CLIENT_UNKNOWN");
    }
});

function uploadFixture(mode: Input["mode"] = "DELIVER", kind: "menu" | "shop" = "menu") {
    const f = fixture(mode), pathname = kind === "menu" ? "menu-images/cshopa/1234567890123-random.png" : "shops/cshopa/cover-1234567890123-random.png";
    const url = "https://fixture.public.blob.vercel-storage.com/" + pathname;
    f.input.target = { kind: kind === "menu" ? "MENU_UPLOAD" : "SHOP_UPLOAD", method: "POST", path: `/api/admin/upload-${kind}-image`, bodySha256: target.bodySha256 };
    f.input.upload = { origin: "https://fixture.public.blob.vercel-storage.com", fixtureSha256: "d".repeat(64), fixtureBytes: 68 };
    f.adapter.recordKnownObject = async ref => { f.events.push({ objectSha256: ref.objectSha256 }); return true; };
    f.adapter.forwardOnce = async () => { f.calls.forward++; return { status: () => 200, requestId: async () => requestId, json: async () => ({ url, pathname }) }; };
    return { ...f, url, pathname, request: { ...f.request, path: f.input.target.path } };
}
function cleanupFixture(url: string) {
    let reads = 0, deletes = 0, leases = 0;
    const input = { approval: { action: "DELETE_SINGLE_RUN_BLOB" as const, runId: scope.runId, objectSha256: hash(url) },
        reconciliation: { runId: scope.runId, requestId, objectSha256: hash(url), isolationReceiptSha256: scope.isolationReceiptSha256,
            uploadAuditMatches: true, fixturePrivateAndKnown: true, allOriginalWritesTerminal: true, totalDbReferences: 0 },
        adapter: { async assertScope() {}, async recheckUnreferencedUnderExclusiveOwnerLease() { leases++; return true; },
            async readExactObject(ref: { url: string }) { assert.equal(ref.url, url); reads++; return { status: reads === 1 ? 200 : 404, sha256: "d".repeat(64), bytes: 68 }; },
            async deleteExactObject(ref: { url: string }) { assert.equal(ref.url, url); deletes++; return { acknowledged: true }; } } };
    return { input, get reads() { return reads; }, get deletes() { return deletes; }, get leases() { return leases; } };
}

test("menu/shop uploadの既知応答は固定storeとownerのPNG1件だけ追跡し、生URL/path/headerを結果へ出さない", async () => {
    for (const kind of ["menu", "shop"] as const) {
        const f = uploadFixture("DELIVER", kind), result = await prepareWriteObservation(f.input).execute(f.request);
        assert.equal(result.objectSha256, hash(f.url)); assert.equal(result.bodyValidated, true); assert.equal(result.clientUnknown, false);
        assert.equal(JSON.stringify(result).includes(f.url), false); assert.equal(JSON.stringify(result).includes(f.pathname), false);
    }
    for (const invalid of ["https://other.public.blob.vercel-storage.com/menu-images/cshopa/a.png", "https://fixture.public.blob.vercel-storage.com/menu-images/cshopb/a.png",
        "https://fixture.public.blob.vercel-storage.com/menu-images/cshopa/a.png?token=secret", "https://fixture.public.blob.vercel-storage.com/menu-images/cshopa/%61.png"]) {
        const f = uploadFixture(); f.adapter.forwardOnce = async () => ({ status: () => 200, requestId: async () => requestId, json: async () => ({ url: invalid, pathname: new URL(invalid).pathname.slice(1) }) });
        const result = await prepareWriteObservation(f.input).execute(f.request);
        assert.equal(result.bodyValidated, false); assert.equal(result.clientUnknown, true); assert.equal(result.objectSha256, undefined);
    }
    for (const origin of ["not-a-url", "https://user:secret@fixture.public.blob.vercel-storage.com", "https://fixture.public.blob.vercel-storage.com/other-path"]) {
        const f = uploadFixture(); f.input.upload!.origin = origin;
        assert.throws(() => prepareWriteObservation(f.input), /ISSUE118_SERVICE_PROBE_REFUSED/); assert.equal(f.calls.forward, 0);
    }
});

test("既知objectの資格情報なしGET観測は未配達の書込を解除せず、違うbytes/404/証跡失敗は確認成功にしない", async () => {
    for (const fault of ["none", "withheld", "bytes", "notFound", "receipt"] as const) {
        const f = uploadFixture(fault === "withheld" ? "WITHHOLD_AFTER_RESPONSE" : "DELIVER"), probe = prepareWriteObservation(f.input);
        await probe.execute(f.request); let reads = 0;
        if (fault === "receipt") f.adapter.record = async () => { throw Error("secret receipt"); };
        const observed = await probe.observeKnownBlob({ async assertScope() {}, async readExactObject(ref) {
            reads++; assert.equal(ref.url, f.url); return { status: fault === "notFound" ? 404 : 200,
                sha256: fault === "bytes" ? "f".repeat(64) : "d".repeat(64), bytes: 68, contentType: "image/png" }; } });
        assert.equal(reads, 1); assert.equal(observed.clientUnknown, fault === "withheld");
        assert.equal(observed.stage, ["none", "withheld"].includes(fault) ? "EXACT_KNOWN_OBJECT_BYTES_MATCH" : "OBJECT_READ_UNVERIFIED");
        assert.equal(observed.externalBlob, "NOT_ATTESTED"); await assert.rejects(probe.observeKnownBlob({ async assertScope() {}, async readExactObject() { throw Error("should not read twice"); } }));
    }
    const f = uploadFixture(); f.adapter.recordKnownObject = async () => false;
    const probe = prepareWriteObservation(f.input), result = await probe.execute(f.request);
    assert.equal(result.clientUnknown, true);
    await assert.rejects(probe.observeKnownBlob({ async assertScope() {}, async readExactObject() { throw Error("unrecorded object"); } }));
});

test("cleanupは同run/同相関ID/監査/所有/全要求既知/全DB参照ゼロと個別承認が揃った既知1件だけを削除する", async () => {
    const f = uploadFixture(), probe = prepareWriteObservation(f.input); await probe.execute(f.request);
    const c = cleanupFixture(f.url), result = await probe.cleanupKnownBlob(c.input);
    assert.equal(result.stage, "EXACT_OBJECT_DELETE_ACK_AND_NOT_FOUND"); assert.equal(c.deletes, 1); assert.equal(c.reads, 2); assert.equal(c.leases, 1);
    assert.equal(result.externalBlob, "NOT_ATTESTED"); await assert.rejects(probe.cleanupKnownBlob(c.input)); assert.equal(c.deletes, 1);
});

test("未確認upload/応答抑止/参照中/未確定write/別run等ではcleanupを送らず、store一覧や推測削除へ進まない", async () => {
    for (const fault of ["withheld", "unknown", "run", "object", "request", "audit", "public", "terminal", "references", "isolation"] as const) {
        const f = uploadFixture(fault === "withheld" ? "WITHHOLD_AFTER_RESPONSE" : "DELIVER");
        if (fault === "unknown") f.adapter.forwardOnce = async () => { throw Error("unknown upload"); };
        const probe = prepareWriteObservation(f.input); await probe.execute(f.request); const c = cleanupFixture(f.url), r = c.input.reconciliation;
        if (fault === "run") c.input.approval.runId = requestId;
        if (fault === "object") c.input.approval.objectSha256 = "f".repeat(64);
        if (fault === "request") r.requestId = scope.runId;
        if (fault === "audit") r.uploadAuditMatches = false;
        if (fault === "public") r.fixturePrivateAndKnown = false;
        if (fault === "terminal") r.allOriginalWritesTerminal = false;
        if (fault === "references") r.totalDbReferences = 1;
        if (fault === "isolation") r.isolationReceiptSha256 = "f".repeat(64);
        await assert.rejects(probe.cleanupKnownBlob(c.input)); assert.equal(c.reads, 0); assert.equal(c.deletes, 0);
    }
});

test("cleanup直前のlease/内容照合失敗とdelete応答喪失/404未確認は安全側に止め、同じ削除を再送しない", async () => {
    for (const fault of ["lease", "bytes", "delete", "notFound"] as const) {
        const f = uploadFixture(), probe = prepareWriteObservation(f.input); await probe.execute(f.request); const c = cleanupFixture(f.url);
        if (fault === "lease") c.input.adapter.recheckUnreferencedUnderExclusiveOwnerLease = async () => false;
        if (fault === "bytes") c.input.adapter.readExactObject = async () => ({ status: 200, sha256: "f".repeat(64), bytes: 68 });
        if (fault === "delete") c.input.adapter.deleteExactObject = async () => { throw Error("secret delete exception"); };
        if (fault === "notFound") c.input.adapter.readExactObject = async () => ({ status: 200, sha256: "d".repeat(64), bytes: 68 });
        const result = await probe.cleanupKnownBlob(c.input);
        assert.equal(result.deleteCalls, ["delete", "notFound"].includes(fault) ? 1 : 0);
        assert.notEqual(result.stage, "EXACT_OBJECT_DELETE_ACK_AND_NOT_FOUND");
        assert.equal(JSON.stringify(result).includes("secret"), false); await assert.rejects(probe.cleanupKnownBlob(c.input));
    }
});
