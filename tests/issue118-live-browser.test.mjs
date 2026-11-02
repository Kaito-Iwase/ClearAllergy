import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { allowedMutation, assertAnchor, stopWithDialog, target, assertIdentityReceipt,
    newWriteLedger, beginWrite, holdWrite, confirmWrite, consumeWriteResponse, canCleanup,
    claimMutation, protectedApiSnapshot, overallResult, openCreatedEditor, classifyLiveError, browserSetupStage } from "../scripts/check-issue118-live-t1-browser.mjs";

test("fixed setup errors remain distinguishable without provider text or getters", async () => {
    for (const code of ["CI_IDENTITY_REFUSED", "CI_AMBIENT_CONFIGURATION_REFUSED", "CI_DEBUG_REFUSED",
        "TEST_CLERK_KEY_REQUIRED", "OIDC_REQUEST_TARGET_REFUSED", "OIDC_REQUEST_AUTH_REQUIRED",
        "OIDC_REQUEST_FAILED", "OIDC_CLAIMS_INVALID", "OIDC_CLAIMS_REFUSED", "OIDC_TIME_REFUSED",
        "T1_KEY_CLASS_READ_HELD", "T1_KEY_CLASS_NOT_READY"])
        assert.equal(classifyLiveError(Error(code)), code);
    for (const secret of ["sk_test_SYNTHETIC", "https://u:p@invalid/", "秘密・架空"])
        assert.equal(classifyLiveError(Error(secret)), "UNCLASSIFIED_ERROR");
    const getter = Error(); Object.defineProperty(getter, "message", { get() { throw Error("must not inspect"); } });
    assert.equal(classifyLiveError(getter), "UNCLASSIFIED_ERROR");
    for (const stage of ["BROWSER_LAUNCH", "BROWSER_CONTEXT", "BROWSER_PAGE"]) {
        const observed = []; let calls = 0;
        await assert.rejects(browserSetupStage(stage, async () => { calls++; throw Error("sk_test_SYNTHETIC https://u:p@invalid/ 秘密"); }, value => observed.push(value)),
            error => classifyLiveError(error) === stage + "_FAILED" && !error.message.includes("SYNTHETIC"));
        assert.equal(calls, 1); assert.deepEqual(observed, [stage]);
        assert.equal(await browserSetupStage(stage, async () => 42, () => {}), 42);
    }
    let invalidCalls = 0;
    await assert.rejects(browserSetupStage("ARBITRARY_SECRET", () => { invalidCalls++; }, () => {}));
    assert.equal(invalidCalls, 0);
});

const response = (status, body) => ({ status: () => status, json: async () => body });
const saved = { menu: { id: "cnewfixture", version: 4, foodVersion: 2, isPublished: true, publicationConfirmedFoodVersion: 2 } };
test("audit UUID correlation is bounded, non-secret and cannot turn an unknown write into success", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    for (const value of [id, null, "SYNTHETIC_PRIVATE_NOT_AN_ID"]) {
        const ledger=newWriteLedger(),op=beginWrite(ledger,"CREATE");let tracked;
        await consumeWriteResponse(ledger,op,{...response(201,{id:"cnewfixture"}),headerValue:async name=>{assert.equal(name,"x-request-id");return value;}},undefined,x=>{tracked=x;});
        assert.equal(tracked,"cnewfixture");confirmWrite(ledger,op);assert.equal(canCleanup(ledger),true);
        assert.equal(op.auditRequestId,value===id?id:undefined);assert.doesNotMatch(JSON.stringify(op),/SYNTHETIC_PRIVATE/);
    }
    const ledger=newWriteLedger(),op=beginWrite(ledger,"CREATE");
    await assert.rejects(consumeWriteResponse(ledger,op,{status:()=>201,json:async()=>{throw Error("SYNTHETIC_PRIVATE");},headerValue:async()=>id}));
    assert.equal(op.auditRequestId,id);assert.equal(op.state,"INDETERMINATE");assert.equal(canCleanup(ledger),false);
    const failed=newWriteLedger(),bad=beginWrite(failed,"CREATE");
    await consumeWriteResponse(failed,bad,{...response(201,{id:"cknown"}),headerValue:async()=>{throw Error("SYNTHETIC_PRIVATE");}});
    assert.equal(bad.bodyValidated,true);assert.equal(bad.auditCorrelationReadCompleted,false);assert.equal(bad.createdId,"cknown");
    const pending=newWriteLedger(),waiting=beginWrite(pending,"CREATE");
    await consumeWriteResponse(pending,waiting,{...response(201,{id:"cknown"}),headerValue:()=>new Promise(()=>{})});
    assert.equal(waiting.bodyValidated,true);assert.equal(waiting.auditCorrelationReadCompleted,false);
});

test("external identity receipt is required, exact and recent", () => {
    const now = Date.parse("2026-10-30T11:00:00Z");
    const receipt = { ...target, environment: "Preview", status: "Ready", verifiedBy: "browser_metadata_observer", evidenceReference: "metadata observation", observedUtc: "2026-10-30T10:59:00Z" };
    assertIdentityReceipt(receipt, now);
    assert.throws(() => assertIdentityReceipt({}, now));
    for (const change of [{ source: "6293d5a" }, { deployment: "old" }, { status: "Building" }, { environment: "Production" },
        { alias: "https://other.example" }, { observedUtc: "2026-10-30T09:00:00Z" }, { observedUtc: "2026-10-31T00:00:00Z" }]) {
        assert.throws(() => assertIdentityReceipt({ ...receipt, ...change }, now));
    }
});

test("new Project pin rejects old Project receipts and bootstrap Production", () => {
    const now = Date.parse("2026-10-30T17:30:00Z");
    const receipt = { ...target, environment: "Preview", status: "Ready", verifiedBy: "browser_metadata_observer", evidenceReference: "offline synthetic", observedUtc: "2026-10-30T17:29:00Z" };
    assert.equal(target.projectId, "prj_0i0cPZtGyoPYXnnB1XaC17DmLXBK");
    assert.equal(target.deployment, "dpl_BQHQr4WYL9SVphQB1BpJZ8r2ad29");
    assertIdentityReceipt(receipt, now);
    for (const change of [{ project: "clear-allergy" }, { projectId: "other" }, { project: undefined },
        { origin: "https://clear-allergy-ernxjj96q-kaitoexe00-9350s-projects.vercel.app" },
        { deployment: "dpl_7Ea2jsXwwf3kvcwftyiZNDd83PgX" },
        { origin: "https://clear-allergy-e2e-co7nvr7xf-kaitoexe00-9350s-projects.vercel.app", environment: "Production" }]) {
        assert.throws(() => assertIdentityReceipt({ ...receipt, ...change }, now));
    }
});

test("create201 records ID before optional-field validation, and 200 is not accepted", async () => {
    const ledger = newWriteLedger(); const op = beginWrite(ledger, "CREATE"); let id;
    await consumeWriteResponse(ledger, op, response(201, { id: "cnewfixture" }), undefined, value => { id = value; });
    confirmWrite(ledger, op); assert.equal(id, "cnewfixture"); assert.equal(canCleanup(ledger), true);
    const malformed = newWriteLedger(); const bad = beginWrite(malformed, "CREATE"); let knownId;
    await assert.rejects(consumeWriteResponse(malformed, bad, response(201, { id: "ccommitted", publicRefreshPending: "bad" }), undefined, value => { knownId = value; }));
    assert.equal(knownId, "ccommitted"); assert.equal(malformed.held, true); assert.equal(canCleanup(malformed), false);
    const wrong = newWriteLedger(); await assert.rejects(consumeWriteResponse(wrong, beginWrite(wrong, "CREATE"), response(200, { id: "cnot201" })));
});

test("commit followed by JSON parse failure is HOLD with no automatic cleanup or raw error", async () => {
    const ledger = newWriteLedger(); const op = beginWrite(ledger, "CREATE");
    op.requestSent = true; op.creationOperationId = "11111111-1111-4111-8111-111111111111";
    await assert.rejects(consumeWriteResponse(ledger, op, { status: () => 201, json: async () => { throw Error("秘密 postgres://password@host"); } }));
    assert.equal(op.createdId, undefined); assert.equal(canCleanup(ledger), false);
    assert.equal(JSON.stringify(ledger).includes("password"), false);
    assert.equal(op.creationOperationId, "11111111-1111-4111-8111-111111111111");
});

test("timeout stays HOLD after a late success or failure; a private GET cannot release it", async () => {
    for (const httpStatus of [200, 500]) {
        const ledger = newWriteLedger(); const op = beginWrite(ledger, "INITIAL_PUBLISH"); op.requestSent = true;
        let settle;
        const delayed = new Promise(resolve => { settle = resolve; });
        const pending = consumeWriteResponse(ledger, op, { status: () => httpStatus, json: () => delayed }, "cnewfixture");
        holdWrite(ledger, op, "ORIGINAL_REQUEST_NOT_CONFIRMED");
        const lastGet = { isPublished: false }; assert.equal(lastGet.isPublished, false);
        assert.equal(canCleanup(ledger), false);
        settle(httpStatus === 200 ? saved : { error: "raw secret-like failure" });
        if (httpStatus === 200) await pending; else await assert.rejects(pending);
        assert.throws(() => confirmWrite(ledger, op)); assert.equal(canCleanup(ledger), false);
        assert.throws(() => beginWrite(ledger, "CLEANUP"));
        assert.equal(JSON.stringify(ledger).includes("secret-like"), false);
    }
});

test("an unknown request without any terminal result forbids followup writes", () => {
    const ledger = newWriteLedger(); const op = beginWrite(ledger, "STOP"); op.requestSent = true;
    holdWrite(ledger, op, "ORIGINAL_REQUEST_NOT_CONFIRMED");
    assert.equal(canCleanup(ledger), false); assert.throws(() => beginWrite(ledger, "CLEANUP"));
    assert.equal(overallResult("PASS_APP_BROWSER_API", "PRIVATE_VERIFIED", "PASS_API_REPRESENTATION", ledger.held).status, "HOLD_UNCERTAIN_WRITE");
});

test("initial publication and republication each have a separate single-request budget", () => {
    const counts = new Map();
    assert.equal(claimMutation(counts, "INITIAL_PUBLISH"), true);
    assert.equal(claimMutation(counts, "INITIAL_PUBLISH"), false);
    assert.equal(claimMutation(counts, "REPUBLISH"), true);
    assert.equal(claimMutation(counts, "REPUBLISH"), false);
});

test("full returned API representation comparison detects changes outside the old summary", () => {
    const original = { id: "coldprotected", milk: "FREE", description: "before", allergens: [{ slug: "soybean", status: "FREE" }], imageFrame: "square", foodReviews: [] };
    const before = protectedApiSnapshot(original);
    for (const change of [{ description: "changed" }, { imageFrame: "wide" }, { foodReviews: [{ id: "review" }] }, { allergens: [{ slug: "soybean", status: "CONTAINS" }] }]) {
        assert.notEqual(before.sha256, protectedApiSnapshot({ ...original, ...change }).sha256);
    }
    assert.equal(before.sha256, protectedApiSnapshot({ ...original }).sha256);
});

test("flow success cannot mask cleanup/protection failure or missing independent DB verification", () => {
    assert.equal(overallResult("PASS_APP_BROWSER_API", "UNVERIFIED_NO_AUTOMATIC_RETRY", "PASS_API_REPRESENTATION", false).status, "FAIL_OR_INCOMPLETE");
    assert.equal(overallResult("PASS_APP_BROWSER_API", "PRIVATE_VERIFIED", "FAIL_OR_UNVERIFIED_API_REPRESENTATION", false).status, "FAIL_OR_INCOMPLETE");
    const incomplete = overallResult("PASS_APP_BROWSER_API", "PRIVATE_VERIFIED", "PASS_API_REPRESENTATION", false);
    assert.equal(incomplete.status, "INCOMPLETE_INDEPENDENT_DB"); assert.equal(incomplete.exit, 2);
    assert.equal(overallResult("PASS_APP_BROWSER_API", "PRIVATE_VERIFIED", "PASS_API_REPRESENTATION", false, false).status, "FAIL_OR_INCOMPLETE");
});

test("live runner confines menu mutations to one created fixture and an explicit stage", () => {
    const own = "cfictionalnewfixture";
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        for (const path of ["/api/admin/shop", `/api/admin/menus/${target.anchor}`, "/api/admin/menus/cother/stop"]) {
            assert.equal(allowedMutation(method, path, "NONE", own), false);
            assert.equal(allowedMutation(method, path, "CORRECT", own), false);
        }
    }
    assert.equal(allowedMutation("POST", "/api/admin/menus", "CREATE", null), true);
    assert.equal(allowedMutation("PUT", `/api/admin/menus/${own}`, "CORRECT", own), true);
    assert.equal(allowedMutation("POST", `/api/admin/menus/${own}/stop`, "STOP", own), true);
    assert.equal(allowedMutation("DELETE", `/api/admin/menus/${own}`, "CLEANUP", own), false);
    assert.equal(allowedMutation("POST", "/api/admin/auth/login", "NONE", null), true);
});

test("read-only anchor rejects wrong shop, public state, version or milk", () => {
    const shop = { id: target.shop };
    const menu = { id: target.anchor, name: target.anchorName, isPublished: false, priceYen: 1000,
        foodVersion: 87, publicationConfirmedFoodVersion: 87, allergens: [{ slug: "milk", status: "CONTAINS" }] };
    assertAnchor(shop, menu);
    for (const change of [{ id: "cother" }, { isPublished: true }, { foodVersion: 88 }, { priceYen: 999 },
        { allergens: [{ slug: "milk", status: "UNKNOWN" }] }]) assert.throws(() => assertAnchor(shop, { ...menu, ...change }));
    assert.throws(() => assertAnchor({ id: "other" }, menu));
});

test("real isolated Chromium handles confirm before click without external requests", async () => {
    const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
    const browser = await chromium.launch({ headless: true, channel: 'chromium' });
    const context = await browser.newContext();
    const external = [];
    await context.route("**/*", route => { external.push("unexpected request"); return route.abort(); });
    try {
        const page = await context.newPage();
        await page.setContent('<button onclick="document.querySelector(\'output\').textContent=window.confirm(\'架空メニューの公開を停止します\')?\'ACCEPTED\':\'DISMISSED\'">STOP</button><output></output>');
        await stopWithDialog(page, "架空メニュー", () => page.getByRole("button", { name: "STOP", exact: true }).click(), 5000);
        assert.equal(await page.locator("output").innerText(), "ACCEPTED");
        await assert.rejects(stopWithDialog(page, "unrelated", () => page.getByRole("button", { name: "STOP", exact: true }).click(), 5000), /DIALOG_HANDLER_FAILED/);
        assert.equal(await page.locator("output").innerText(), "DISMISSED");
        await assert.rejects(stopWithDialog(page, "架空メニュー", async () => {}, 100), /DIALOG_TIMEOUT/);
        assert.deepEqual(external, []);
    } finally { await context.close(); await browser.close(); }
});

test("post201 page stays on new; runner follows only the acknowledged fixture edit link", async () => {
    const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
    const browser = await chromium.launch({ headless: true, channel: 'chromium' });
    const context = await browser.newContext();
    const origin = "https://issue118-offline.example";
    const id = "cnewfixture";
    const reads = []; let mutations = 0;
    await context.route("**/*", route => {
        const request = route.request(); const url = new URL(request.url());
        if (request.method() !== "GET") { mutations++; return route.abort(); }
        if (url.origin !== origin) return route.abort();
        if (!["/admin/menus/new", `/admin/menus/${id}/edit`].includes(url.pathname)) return route.abort();
        reads.push(url.pathname);
        const html = url.pathname === "/admin/menus/new"
            ? `<h1>Saved201</h1><a href="/admin/menus/${id}/edit">Open saved editor</a>`
            : "<h1>Persisted fixture editor</h1>";
        return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
    });
    try {
        const page = await context.newPage();
        await page.goto(origin + "/admin/menus/new");
        assert.equal(page.url(), origin + "/admin/menus/new");
        await openCreatedEditor(page, origin, id);
        assert.equal(page.url(), origin + `/admin/menus/${id}/edit`);
        assert.equal(await page.getByRole("heading").innerText(), "Persisted fixture editor");
        assert.deepEqual(reads, ["/admin/menus/new", `/admin/menus/${id}/edit`]);
        assert.equal(mutations, 0);
        await assert.rejects(openCreatedEditor(page, origin, "../other"));
    } finally { await context.close(); await browser.close(); }
});
