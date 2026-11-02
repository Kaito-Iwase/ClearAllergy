import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { allowedMutation, assertAnchor, stopWithDialog, target, assertIdentityReceipt,
    newWriteLedger, beginWrite, holdWrite, confirmWrite, consumeWriteResponse, canCleanup,
    claimMutation, protectedApiSnapshot, overallResult, openCreatedEditor, classifyLiveError, browserSetupStage,
    transportLifecycleSnapshot, recordTransportDiagnostic, readCloseRequestAllowed, observeReadCloseFixture,
    readCloseFixtureId, readCloseResult, guardReadCloseRoute } from "../scripts/check-issue118-live-t1-browser.mjs";
import { closeIsolatedBrowser } from "../scripts/issue118-close-browser.mjs";
import { routePreviewRequest } from "../scripts/issue118-preview-transport.mjs";

test('read-close diagnostic restricts app traffic to GET and the two owned API reads', async () => {
    for (const path of ['/admin/login','/admin/shop','/_next/static/mock.js','/api/admin/shop','/api/admin/menus/'+readCloseFixtureId])
        assert.equal(readCloseRequestAllowed('GET',target.origin+path),true);
    for (const method of ['POST','PUT','PATCH','DELETE','OPTIONS','HEAD','get'])
        for (const path of ['/api/admin/menus','/api/admin/menus/'+readCloseFixtureId+'/stop','/admin/shop'])
            assert.equal(readCloseRequestAllowed(method,target.origin+path),false);
    for (const path of ['/api/admin/menus','/api/admin/menus/other','/api/menus/'+readCloseFixtureId,'/api/admin/shop?secret=x'])
        assert.equal(readCloseRequestAllowed('GET',target.origin+path),false);
    for (const url of ['https://other.invalid/','https://wtqdbklmg3bbqk4s.public.blob.vercel-storage.com/a',target.origin.replace('https:','http:'),'https://u:p@'+new URL(target.origin).host+'/'])
        assert.equal(readCloseRequestAllowed('GET',url),false);
    assert.equal(readCloseRequestAllowed('POST','https://one-dolphin-7936.clerk.accounts.dev/v1/client/sign_ins'),true);
    const menu={id:readCloseFixtureId,shopId:target.shop,isPublished:false,version:96,foodVersion:87,
        publicationConfirmedFoodVersion:87,reviewedFoodVersion:null,priceYen:1000,allergens:[{slug:'milk',status:'CONTAINS'}]};
    const reads=[];
    assert.equal((await observeReadCloseFixture({id:target.shop},async id=>{reads.push(id);return menu;})).id,readCloseFixtureId);
    assert.deepEqual(reads,[readCloseFixtureId]);
    for (const change of [{id:'other'},{shopId:'other'},{isPublished:true},{version:97},{foodVersion:88},{priceYen:1001},{reviewedFoodVersion:87}])
        await assert.rejects(observeReadCloseFixture({id:target.shop},async()=>({...menu,...change})));
    await assert.rejects(observeReadCloseFixture({id:'other'},async()=>assert.fail('wrong shop must not read fixture')));
});
test('read-close result never turns transport/closure/mutation uncertainty into diagnostic success', () => {
    const report={flow:'PASS_READ_ONLY_FIXTURE',cleanup:'NOT_APPLICABLE_READ_ONLY',writes:{held:false,operations:[]},authenticationCleanup:'SIGNOUT_CONFIRMED'};
    assert.equal(readCloseResult(report,false,true).status,'READ_CLOSE_DIAGNOSTIC_COMPLETE');
    for (const [change,transport,closed] of [[{},true,true],[{},false,false],[{readOnlyRequestRefused:true},false,true],
        [{firstTransportFailure:{originRole:'APP',method:'GET',status:500,exception:'NONE'}},false,true],
        [{writes:{held:false,operations:[{}]}},false,true],[{authenticationCleanup:'SIGNOUT_UNVERIFIED'},false,true],[{flow:'FAIL'},false,true]])
        assert.equal(readCloseResult({...report,...change},transport,closed).status,'FAIL_OR_INCOMPLETE');
    assert.equal(readCloseResult({...report,writes:{held:true,operations:[]}},false,true).status,'HOLD_UNCERTAIN_WRITE');
});
test('last-registered admin route delegates forbidden POST to read-close refusal with zero forwarding', async () => {
    const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
    const browser=await chromium.launch({headless:true,channel:'chromium'});
    const context=await browser.newContext({serviceWorkers:'block'});
    let refused=false, adminStarts=0, mutationForwards=0, postSeen=false;
    const common=async route=>{
        try {
            if(!await guardReadCloseRoute(route,()=>{refused=true;},()=>{}))return;
            if(route.request().method()!=='GET')mutationForwards++;
            await route.fulfill({status:200,contentType:'text/html',body:'<link rel="icon" href="data:,">offline read-close control'});
        } catch { /* The fixed refusal is observed through refused, method and zero forwarding below. */ }
    };
    await context.route('**/*',common);
    await context.route('**/api/admin/**',route=>{adminStarts++;postSeen=route.request().method()==='POST';return common(route);});
    try {
        const page=await context.newPage();await page.goto(target.origin+'/offline-read-close-control');
        await page.evaluate(async()=>{try{await fetch('/api/admin/menus',{method:'POST',body:'synthetic'});}catch{/* expected local abort */}});
        assert.equal(adminStarts,1);assert.equal(postSeen,true);assert.equal(mutationForwards,0);assert.equal(refused,true);
        const report={flow:'PASS_READ_ONLY_FIXTURE',cleanup:'NOT_APPLICABLE_READ_ONLY',writes:{held:false,operations:[]},authenticationCleanup:'SIGNOUT_CONFIRMED',readOnlyRequestRefused:refused};
        assert.equal(readCloseResult(report,false,true).status,'FAIL_OR_INCOMPLETE');
    }finally{await context.close();await browser.close();}
});

test('lifecycle observations distinguish active failure from close-time completion without releasing either failure', async () => {
    for (const duringClose of [false, true]) {
        let phase = 'APP_FLOW', rejectFetch, fetched;
        const fetchStarted = new Promise(resolve => { fetched = resolve; });
        const report = {};
        const pending = routePreviewRequest({
            request: () => ({ url: () => target.origin + '/admin', method: () => 'GET', allHeaders: async () => ({}) }),
            fetch: async () => { fetched(); return new Promise((_resolve, reject) => { rejectFetch = reject; }); },
            abort: async () => {}, fulfill: async () => assert.fail('failed fetch cannot fulfill'),
        }, 'synthetic.payload.signature', observation => recordTransportDiagnostic(report, observation, transportLifecycleSnapshot(phase)));
        const failed = assert.rejects(pending, { message: 'PROTECTED_TRANSPORT_FAILED' });
        await fetchStarted;
        if (!duringClose) { rejectFetch(Error('SYNTHETIC_PRIVATE https://u:p@invalid/')); await failed; }
        const close = await closeIsolatedBrowser({ close: async () => {
            if (duringClose) { rejectFetch(Error('SYNTHETIC_PRIVATE')); await failed; }
        } }, { close: async () => {} }, { contextCreateAttempted: true, browserLaunchAttempted: true }, stage => { phase = stage; });
        assert.equal(report.firstTransportFailure.exception, 'FETCH_EXCEPTION');
        assert.equal(report.firstTransportFailure.lifecycle.phase, duringClose ? 'CONTEXT_CLOSE_START' : 'APP_FLOW');
        assert.match(report.firstTransportFailure.lifecycle.observedUtc, /^\d{4}-\d{2}-\d{2}T/);
        assert.equal(close.allLocalClosed, true); assert.equal(close.lifecycleObservationFailed, false);
        // This is a synthetic cancellation model, not proof of the real provider's cause.
        assert.equal(overallResult('PASS_APP_BROWSER_API', 'PRIVATE_VERIFIED', 'PASS_API_REPRESENTATION', false, false).status, 'FAIL_OR_INCOMPLETE');
        assert.doesNotMatch(JSON.stringify(report), /SYNTHETIC_PRIVATE|https:|u:p/);
    }
});
test('lifecycle metadata stays closed and first failure survives a full diagnostic buffer', () => {
    const at = '2026-11-02T04:08:11.000Z';
    assert.deepEqual(transportLifecycleSnapshot('SYNTHETIC_PRIVATE', 'https://u:p@invalid/'), { phase: 'UNKNOWN', observedUtc: null });
    const report = {};
    for (let i=0;i<65;i++) recordTransportDiagnostic(report, { originRole:'APP',method:'GET',status:200,exception:'NONE' }, transportLifecycleSnapshot('APP_FLOW', at));
    recordTransportDiagnostic(report, { originRole:'APP',method:'GET',exception:'FETCH_EXCEPTION' }, transportLifecycleSnapshot('BROWSER_CLOSE_START',at));
    recordTransportDiagnostic(report, { originRole:'APP',method:'GET',exception:'FETCH_EXCEPTION' }, transportLifecycleSnapshot('LOCAL_CLOSE_FINISHED',at));
    assert.equal(report.transportDiagnostics.length,64); assert.equal(report.transportDiagnosticsTruncated,true);
    assert.equal(report.firstTransportFailure.lifecycle.phase,'BROWSER_CLOSE_START');
    assert.equal(report.firstTransportFailure.lifecycle.observedUtc,at);
});
test('lifecycle observer failure cannot prevent either close or prove observation completion', async () => {
    const order=[];
    const closed=await closeIsolatedBrowser({close:async()=>{order.push('context');}}, {close:async()=>{order.push('browser');}},
        {contextCreateAttempted:true,browserLaunchAttempted:true},()=>{throw Error('SYNTHETIC_PRIVATE');});
    assert.deepEqual(order,['context','browser']);assert.equal(closed.allLocalClosed,true);
    assert.equal(closed.lifecycleObservationFailed,true);
    assert.equal(overallResult('PASS_APP_BROWSER_API','PRIVATE_VERIFIED','PASS_API_REPRESENTATION',false,!closed.lifecycleObservationFailed).status,'FAIL_OR_INCOMPLETE');
    assert.doesNotMatch(JSON.stringify(closed),/SYNTHETIC_PRIVATE/);
});

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
