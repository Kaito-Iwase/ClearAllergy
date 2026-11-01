// Real Preview only. Reuses isolated Playwright; no credential or session-state files.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCiAccess, assertCiEnvironment } from "./issue118-ci-auth.mjs";
import { transportObservation } from "./issue118-preview-transport.mjs";

export function recordTransportDiagnostic(report, observation) {
    const safe = transportObservation(observation.originRole, observation.method, observation.status,
        observation.exception, observation.stages);
    const events = report.transportDiagnostics ??= [];
    if (events.length < 64) events.push(safe); else report.transportDiagnosticsTruncated = true;
    if ((safe.exception !== 'NONE' && safe.exception !== 'POLICY_REFUSED') || safe.status >= 400)
        report.firstTransportFailure ??= safe;
}

const fixedErrors = new Set(["DIALOG_TIMEOUT", "DIALOG_HANDLER_FAILED", "WRITE_RESULT_UNCERTAIN",
    "CI_AUTHENTICATION_FAILED", "CI_TRANSPORT_HELD", "CI_IDENTITY_REFUSED", "CI_AMBIENT_CONFIGURATION_REFUSED",
    "CI_DEBUG_REFUSED", "TEST_CLERK_KEY_REQUIRED", "OIDC_REQUEST_TARGET_REFUSED", "OIDC_REQUEST_AUTH_REQUIRED",
    "OIDC_REQUEST_FAILED", "OIDC_CLAIMS_INVALID", "OIDC_CLAIMS_REFUSED", "OIDC_TIME_REFUSED",
    "BROWSER_LAUNCH_FAILED", "BROWSER_CONTEXT_FAILED", "BROWSER_PAGE_FAILED"]);
export function classifyLiveError(error) {
    if (error instanceof assert.AssertionError) return "ASSERTION_FAILED";
    if (!(error instanceof Error)) return "UNCLASSIFIED_ERROR";
    // Only exact fixed strings survive; never retain provider text, cause, stack or URL.
    const message = Object.getOwnPropertyDescriptor(error, "message")?.value;
    const name = Object.getOwnPropertyDescriptor(error, "name")?.value;
    return fixedErrors.has(message) ? message : name === "TimeoutError" ? "OPERATION_TIMEOUT" : "UNCLASSIFIED_ERROR";
}
export async function browserSetupStage(stage, operation, onStage) {
    assert.ok(["BROWSER_LAUNCH", "BROWSER_CONTEXT", "BROWSER_PAGE"].includes(stage));
    onStage(stage);
    try { return await operation(); } catch { throw Error(stage + "_FAILED"); }
}

export const target = Object.freeze({
    project: "clear-allergy-e2e",
    projectId: "prj_0i0cPZtGyoPYXnnB1XaC17DmLXBK",
    origin: "https://clear-allergy-e2e-kzfhilgul-kaitoexe00-9350s-projects.vercel.app",
    deployment: "dpl_FCdWVUy7Zo1GQd2xXdbDiFUD2wz3",
    source: "6293d5a02758f72a7cf00201fec239afc6b699eb",
    alias: "https://clear-allergy-e2e-git-test-staging-kaitoexe00-9350s-projects.vercel.app",
    shop: "cmvs4x80y000twn0wbxkwzbt6",
    anchor: "cmvuiodx30001jg08xmr6nexe",
    anchorName: "【架空・Issue118 T1】ひよこ豆サラダ 20261030-A1",
});

export function assertAnchor(shop, menu) {
    assert.equal(shop.id, target.shop);
    assert.equal(menu.id, target.anchor);
    assert.equal(menu.name, target.anchorName);
    assert.equal(menu.isPublished, false);
    assert.equal(menu.priceYen, 1000);
    assert.equal(menu.foodVersion, 87);
    assert.equal(menu.publicationConfirmedFoodVersion, 87);
    assert.equal(menu.allergens.find(a => a.slug === "milk")?.status, "CONTAINS");
    assert.ok(menu.allergens.length > 0);
    assert.equal(new Set(menu.allergens.map(a => a.slug)).size, menu.allergens.length);
}

export function allowedMutation(method, pathname, phase, menuId) {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return true;
    // Login audit is ordinary authentication, not a data mutation authorization.
    if (!pathname.startsWith("/api/admin/")) return true;
    if (phase === "NONE" && pathname === "/api/admin/auth/login" && method === "POST") return true;
    if (phase === "CREATE") return method === "POST" && pathname === "/api/admin/menus";
    if (!menuId || !["INITIAL_PUBLISH", "REPUBLISH", "CORRECT", "STOP", "CLEANUP"].includes(phase)) return false;
    if (phase === "STOP" || phase === "CLEANUP") return method === "POST" && pathname === `/api/admin/menus/${menuId}/stop`;
    return method === "PUT" && pathname === `/api/admin/menus/${menuId}`;
}

export function assertIdentityReceipt(receipt, now = Date.now()) {
    for (const key of ["project", "projectId", "origin", "deployment", "source", "alias"]) assert.equal(receipt[key], target[key]);
    assert.equal(receipt.environment, "Preview"); assert.equal(receipt.status, "Ready");
    assert.ok(["human", "browser_metadata_observer"].includes(receipt.verifiedBy));
    assert.ok(typeof receipt.evidenceReference === "string" && receipt.evidenceReference.length > 0);
    const age = now - Date.parse(receipt.observedUtc);
    assert.ok(Number.isFinite(age) && age >= 0 && age <= 60 * 60 * 1000);
}

export const newWriteLedger = () => ({ held: false, operations: [] });
export function beginWrite(ledger, phase) {
    assert.equal(ledger.held, false);
    assert.ok(ledger.operations.every(op => op.state === "CONFIRMED_SUCCESS"));
    assert.ok(!ledger.operations.some(op => op.phase === phase));
    const op = { phase, state: "ARMED", requestSent: false };
    ledger.operations.push(op); return op;
}
export function holdWrite(ledger, op, code) {
    ledger.held = true; op.state = "INDETERMINATE"; op.code = code;
}
export function confirmWrite(ledger, op) {
    assert.equal(ledger.held, false); assert.equal(op.bodyValidated, true);
    op.state = "CONFIRMED_SUCCESS";
}
export function canCleanup(ledger) {
    return !ledger.held && ledger.operations.every(op => op.state === "CONFIRMED_SUCCESS");
}
export function claimMutation(counts, phase) {
    const count = (counts.get(phase) || 0) + 1; counts.set(phase, count);
    return count === 1;
}
export async function consumeWriteResponse(ledger, op, response, menuId, trackCreated = () => {}) {
    try {
        op.httpStatus = response.status();
        const body = await response.json();
        // Keep a known committed creation ID BEFORE checking ancillary response fields.
        if (op.phase === "CREATE" && op.httpStatus === 201 && typeof body?.id === "string" && /^c[a-z0-9]+$/.test(body.id)) {
            op.createdId = body.id; trackCreated(body.id);
        }
        assert.equal(op.httpStatus, op.phase === "CREATE" ? 201 : 200);
        assert.ok(body && typeof body === "object");
        assert.ok(body.publicRefreshPending === undefined || typeof body.publicRefreshPending === "boolean");
        if (op.phase === "CREATE") assert.ok(op.createdId);
        else {
            assert.equal(body.menu?.id, menuId);
            assert.ok(Number.isInteger(body.menu.version) && body.menu.version >= 0);
            assert.equal(typeof body.menu.isPublished, "boolean");
            if (["STOP", "CLEANUP"].includes(op.phase)) {
                assert.equal(body.ok, true); assert.equal(body.menu.isPublished, false);
            } else {
                assert.ok(Number.isInteger(body.menu.foodVersion) && body.menu.foodVersion >= 0);
                assert.ok(body.menu.publicationConfirmedFoodVersion === null || Number.isInteger(body.menu.publicationConfirmedFoodVersion));
                if (body.menu.isPublished) assert.equal(body.menu.foodVersion, body.menu.publicationConfirmedFoodVersion);
            }
        }
        op.bodyValidated = true;
        return body;
    } catch {
        holdWrite(ledger, op, "WRITE_RESPONSE_UNCONFIRMED");
        throw Error("WRITE_RESULT_UNCERTAIN");
    }
}
export function protectedApiSnapshot(menu) {
    const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
    return { id: menu.id, sha256: createHash("sha256").update(JSON.stringify(canonical(menu))).digest("hex"), fields: Object.keys(menu).sort() };
}
export function overallResult(flow, cleanup, protection, held, browserClosed = true) {
    if (held) return { status: "HOLD_UNCERTAIN_WRITE", exit: 2 };
    if (!browserClosed || flow !== "PASS_APP_BROWSER_API" || cleanup !== "PRIVATE_VERIFIED" || protection !== "PASS_API_REPRESENTATION") return { status: "FAIL_OR_INCOMPLETE", exit: 1 };
    return { status: "INCOMPLETE_INDEPENDENT_DB", exit: 2 };
}

export function state(menu) {
    return { id: menu.id, isPublished: menu.isPublished, version: menu.version,
        foodVersion: menu.foodVersion, publicationConfirmedFoodVersion: menu.publicationConfirmedFoodVersion,
        priceYen: menu.priceYen, milk: menu.allergens.find(a => a.slug === "milk")?.status,
        unknown: menu.allergens.filter(a => a.status === "UNKNOWN").length };
}

export async function openCreatedEditor(page, origin, id) {
    assert.match(id, /^c[a-z0-9]+$/);
    const editPath = `/admin/menus/${id}/edit`;
    // NewMenuForm deliberately stays on /new after201 and renders this persisted-ID link.
    const link = page.locator(`a[href="${editPath}"]`).filter({ visible: true });
    await link.waitFor({ state: "visible" });
    await link.click();
    await page.waitForURL(origin + editPath);
}

// Handler is installed before the click. Unrelated dialogs are dismissed and fail the run.
export async function stopWithDialog(page, name, click, timeout = 20000) {
    let resolveDialog;
    let rejectDialog;
    const handled = new Promise((yes, no) => { resolveDialog = yes; rejectDialog = no; });
    const handler = async dialog => {
        try {
            if (dialog.type() !== "confirm" || !dialog.message().includes(name) || !dialog.message().includes("公開を停止")) {
                await dialog.dismiss();
                throw Error("UNEXPECTED_DIALOG");
            }
            await dialog.accept();
            resolveDialog();
        } catch { rejectDialog(Error("DIALOG_HANDLER_FAILED")); }
    };
    page.once("dialog", handler);
    let timer;
    try {
        await Promise.race([
            Promise.all([handled, click()]),
            new Promise((_, no) => { timer = setTimeout(() => no(Error("DIALOG_TIMEOUT")), timeout); }),
        ]);
    } finally { clearTimeout(timer); page.off("dialog", handler); }
}

export async function runLive() {
    const ciMode = process.argv.slice(2).join(" ") === "--ci-apply";
    if (!ciMode && process.argv.slice(2).join(" ") !== "--apply") throw Error("EXPLICIT_APPLY_REQUIRED");
    if (ciMode) assertCiEnvironment(process.env);
    if (process.env.DEBUG || process.env.PWDEBUG || process.env.NODE_OPTIONS) throw Error("DEBUG_OR_PRELOAD_FORBIDDEN");
    if (!process.env.CLEARALLERGY_ISSUE118_IDENTITY_RECEIPT) throw Error("EXTERNAL_IDENTITY_RECEIPT_REQUIRED");
    const identityBytes = readFileSync(process.env.CLEARALLERGY_ISSUE118_IDENTITY_RECEIPT);
    const identityReceipt = JSON.parse(identityBytes.toString("utf8"));
    assertIdentityReceipt(identityReceipt);
    const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
    const output = resolve(process.env.CLEARALLERGY_BROWSER_OUTPUT || join(".agent-runs", `issue118-live-${randomUUID()}`));
    mkdirSync(dirname(output), { recursive: true });
    mkdirSync(output, { recursive: false });
    const report = { target, driver: ciMode ? "Isolated Playwright / official Clerk temporary testing authentication" : "Isolated Playwright script / existing browser-runner, manual normal login",
        sessionExport: false, traces: false, dbObservation: "NOT_RUN: app API is not independent SQL",
        runnerScriptSha256: createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex"),
        externalIdentityReceiptSha256: createHash("sha256").update(identityBytes).digest("hex"),
        run: randomUUID(), stage: "LOGIN", phase: "NONE", observations: [], requests: [], status: "RUNNING",
        flow: "NOT_RUN", cleanup: "NOT_REQUIRED_NO_KNOWN_FIXTURE", protection: "NOT_CHECKED" };
    const save = () => writeFileSync(join(output, "result.json"), JSON.stringify(report, null, 2));
    let browser;
    let context;
    let page;
    let menuId;
    let name;
    let phase = "NONE";
    let cleanupAttempted = false;
    let protectedBefore;
    const protectedIds = ["cmvs4x86o000vwn0w93c8ttez", "cmvs4x8wt000xwn0wj6gwdih1", "cmvs4x986000zwn0wer2ymhow"];
    const mutationCounts = new Map();
    const ledger = newWriteLedger(); report.writes = ledger;
    const requestOperations = new WeakMap();
    let activeOperation;
    let ciAccess;
    let ciTransportFailed = false;
    const record = (stage, menu) => { report.observations.push({ at: new Date().toISOString(), stage, ...state(menu) }); save(); };
    const read = async id => {
        const response = await readRequest(`${target.origin}/api/admin/menus/${id}`);
        assert.equal(response.status(), 200);
        const { menu } = await response.json();
        assert.equal(menu.id, id);
        return menu;
    };
    const readRequest = url => ciAccess ? ciAccess.read(context.request, url) : context.request.get(url, { timeout: 20000 });
    const action = async (nextPhase, method, path, click) => {
        assertIdentityReceipt(identityReceipt);
        if (ciTransportFailed) throw Error("CI_TRANSPORT_HELD");
        const op = beginWrite(ledger, nextPhase); activeOperation = op;
        phase = nextPhase; report.stage = nextPhase; save();
        try {
            const response = page.waitForResponse(r => r.url() === target.origin + path && r.request().method() === method && requestOperations.get(r.request()) === op, { timeout: 20000 });
            const body = response.then(actual => consumeWriteResponse(ledger, op, actual, menuId, id => { menuId = id; report.fixtureId = id; save(); }));
            const [, parsed] = await Promise.all([click(), body]);
            confirmWrite(ledger, op); phase = "NONE"; activeOperation = undefined; save();
            return parsed;
        } catch {
            // Neither a timeout nor a GET showing private proves the original request cannot commit later.
            holdWrite(ledger, op, "ORIGINAL_REQUEST_NOT_CONFIRMED"); phase = "HOLD"; save();
            throw Error("WRITE_RESULT_UNCERTAIN");
        }
    };
    const publish = async publishPhase => {
        const panel = page.getByRole("region", { name: /保存しました|保存済み内容の確認/ });
        if (!await panel.count()) await page.getByRole("button", { name: "公開する", exact: true }).click();
        await panel.getByText(name, { exact: true }).waitFor();
        await action(publishPhase, "PUT", `/api/admin/menus/${menuId}`, () => panel.getByRole("button", { name: "この内容で公開", exact: true }).click());
        await page.getByText("保存済み内容を公開しました。", { exact: true }).waitFor();
    };
    try {
        save();
        const setupStage = stage => { report.stage = stage; (report.setupStages ??= []).push(stage); save(); };
        if (ciMode) ciAccess = await createCiAccess(process.env, fetch, setupStage, {
            authentication: progress => { report.authenticationProgress = progress; save(); },
            transport: observation => {
                recordTransportDiagnostic(report, observation);
                save();
            },
        });
        browser = await browserSetupStage("BROWSER_LAUNCH", () => chromium.launch({ headless: ciMode, ...(ciMode ? { channel: "chromium" } : {}) }), setupStage);
        context = await browserSetupStage("BROWSER_CONTEXT", () => browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: false, serviceWorkers: "block" }), setupStage);
        const ciRoute = async route => {
            try { await ciAccess.route(route); }
            catch {
                ciTransportFailed = true; report.transportError = "CI_ROUTE_FAILED";
                if (activeOperation) holdWrite(ledger, activeOperation, "TRANSPORT_RESULT_UNCONFIRMED");
                save();
            }
        };
        if (ciAccess) await context.route("**/*", ciRoute);
        context.on("response", response => {
            const op = requestOperations.get(response.request());
            if (op) { op.responseHeadersObserved = true; op.observedHttpStatus = response.status(); save(); }
        });
        context.on("requestfinished", request => { const op = requestOperations.get(request); if (op) { op.transportFinished = true; save(); } });
        context.on("requestfailed", request => { const op = requestOperations.get(request); if (op) { op.transportFailed = true; save(); } });
        await context.route("**/api/admin/**", async route => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin !== target.origin || (ledger.held && request.method() !== "GET") || !allowedMutation(request.method(), url.pathname, phase, menuId)) {
                report.requests.push({ phase, method: request.method(), kind: "BLOCKED_ADMIN_REQUEST" });
                return route.abort("blockedbyclient");
            }
            if (request.method() !== "GET" && url.pathname.startsWith("/api/admin/menus")) {
                if (!activeOperation || !claimMutation(mutationCounts, phase)) {
                    report.requests.push({ phase, kind: "BLOCKED_DUPLICATE" });
                    if (activeOperation) holdWrite(ledger, activeOperation, "DUPLICATE_REQUEST_BLOCKED");
                    return route.abort("blockedbyclient");
                }
                activeOperation.requestSent = true; activeOperation.state = "IN_FLIGHT";
                requestOperations.set(request, activeOperation);
                if (phase === "CREATE") {
                    try { const id = request.postDataJSON()?.operationId; if (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) activeOperation.creationOperationId = id; } catch { /* no raw body/error is retained */ }
                }
                report.requests.push({ phase, method: request.method(), kind: url.pathname.endsWith("/stop") ? "OWN_FIXTURE_STOP" : "OWN_FIXTURE_WRITE" });
            }
            return ciAccess ? ciRoute(route) : route.continue();
        });
        page = await browserSetupStage("BROWSER_PAGE", () => context.newPage(), setupStage);
        page.setDefaultTimeout(20000);
        if (ciAccess) {
            report.stage = "CI_AUTHENTICATION"; save();
            await ciAccess.authenticate(page);
            report.authentication = "OFFICIAL_TEST_TICKET_OWNER_A";
        } else {
            await page.goto(target.origin + "/admin");
            report.loginWindowOpened = true;
            report.loginGate = new URL(page.url()).hostname === "vercel.com" ? "VERCEL_PROTECTION" : page.url().startsWith(target.origin + "/admin/login") ? "APP_NORMAL_LOGIN" : "OTHER_OR_READY";
            save();
            console.log("MANUAL_NORMAL_LOGIN_REQUIRED: visible isolated Chromium; Vercel protection then ownerA. No session import or recording.");
            await page.waitForURL(target.origin + "/admin/shop", { timeout: 15 * 60 * 1000 });
        }
        if (ciTransportFailed) throw Error("CI_TRANSPORT_HELD");
        const own = await readRequest(target.origin + "/api/admin/shop");
        assert.equal(own.status(), 200);
        const shopData = await own.json();
        const anchor = await read(target.anchor);
        assertAnchor(shopData.shop, anchor);
        protectedBefore = await Promise.all(protectedIds.map(async id => protectedApiSnapshot(await read(id))));
        report.protectedBefore = protectedBefore;
        report.stage = "TARGET_ANCHOR_VERIFIED"; save();
        name = `【架空・Issue118 runner】ひよこ豆サラダ ${report.run.slice(0, 8)}`;
        report.fixtureName = name;
        report.specification = "Complete fictional initial dressing: chickpea/rice oil/rice vinegar/salt, listed allergens absent. Signal later adds milk; no real food claim.";
        await page.goto(target.origin + "/admin/menus/new");
        await page.getByLabel("メニュー名", { exact: true }).fill(name);
        await page.getByLabel("価格（税込・円）", { exact: true }).fill("1000");
        await page.getByLabel("原材料名", { exact: false }).fill("ひよこ豆、共通ドレッシング");
        await page.getByLabel("説明", { exact: true }).fill("Issue118専用の架空検証。実食品ではありません。");
        for (const allergen of anchor.allergens) {
            await page.getByRole("group", { name: allergen.nameJa, exact: true }).getByRole("button", { name: "原材料に含まない登録", exact: true }).click();
        }
        await action("CREATE", "POST", "/api/admin/menus", () => page.getByRole("button", { name: "メニューを登録する", exact: true }).click());
        report.stage = "CREATED_EDITOR_LINK"; save();
        await openCreatedEditor(page, target.origin, menuId);
        report.stage = "CREATED_PRIVATE_VERIFY"; save();
        let menu = await read(menuId); assert.equal(menu.name, name); assert.equal(menu.isPublished, false);
        assert.ok(menu.allergens.every(a => a.status === "FREE")); record("CREATED_PRIVATE", menu);
        await publish("INITIAL_PUBLISH"); menu = await read(menuId); assert.equal(menu.isPublished, true); assert.equal(menu.publicationConfirmedFoodVersion, menu.foodVersion); record("INITIAL_PUBLISH", menu);
        const initialPublic = await readRequest(`${target.origin}/api/menus/${menuId}`);
        assert.equal(initialPublic.status(), 200);
        assert.equal((await initialPublic.json()).menu.allergens.find(a => a.slug === "milk").status, "FREE");
        const initialFood = menu.foodVersion;
        report.signal = "E11/E12 fictional milk-added label; ingredient string unchanged; AI knows gold."; save();
        await action("STOP", "POST", `/api/admin/menus/${menuId}/stop`, () => stopWithDialog(page, name, () => page.getByRole("button", { name: "公開を停止する", exact: true }).click()));
        menu = await read(menuId); assert.equal(menu.isPublished, false); assert.equal(menu.foodVersion, initialFood); record("EDITOR_DIALOG_STOP", menu);
        assert.equal((await readRequest(`${target.origin}/api/menus/${menuId}`)).status(), 404);
        await page.reload();
        await page.getByRole("group", { name: "乳", exact: true }).getByRole("button", { name: "含む", exact: true }).click();
        await action("CORRECT", "PUT", `/api/admin/menus/${menuId}`, () => page.getByRole("button", { name: "保存する", exact: true }).click());
        await page.getByRole("region", { name: "保存しました", exact: true }).waitFor();
        menu = await read(menuId); assert.equal(menu.isPublished, false); assert.ok(menu.foodVersion > initialFood); assert.equal(menu.publicationConfirmedFoodVersion, null); assert.equal(state(menu).milk, "CONTAINS"); record("MILK_CORRECTED_PRIVATE", menu);
        await publish("REPUBLISH"); menu = await read(menuId); assert.equal(menu.isPublished, true); assert.equal(menu.publicationConfirmedFoodVersion, menu.foodVersion); record("CORRECTED_SEPARATE_PUBLISH", menu);
        const publicResponse = await readRequest(`${target.origin}/api/menus/${menuId}`);
        assert.equal(publicResponse.status(), 200); const published = await publicResponse.json();
        assert.equal(published.menu.allergens.find(a => a.slug === "milk").status, "CONTAINS");
        const viewer = await context.newPage(); await viewer.goto(`${target.origin}/shops/${target.shop}/menus/${menuId}`);
        await viewer.getByRole("heading", { name, exact: true }).waitFor();
        await viewer.getByText("乳", { exact: true }).waitFor();
        assert.match(await viewer.getByText("乳", { exact: true }).locator("..").innerText(), /含む/);
        report.publicApiMilk = "CONTAINS"; report.publicPageFixtureHeading = true;
        if (ciTransportFailed) throw Error("CI_TRANSPORT_HELD");
        report.flow = "PASS_APP_BROWSER_API";
    } catch (error) {
        report.flow = ledger.held ? "HOLD_UNCERTAIN_WRITE" : "FAIL";
        report.errorClass = classifyLiveError(error);
    } finally {
        if (ledger.held) {
            report.cleanup = "HOLD_ORIGINAL_REQUEST_UNCONFIRMED_NO_WRITE";
            report.residualRisk = "Original write may commit after timeout, transport failure or last GET. No automatic cleanup/retry. Reconcile original operation terminal result, creationOperationId/name, current API/DB state and audit history before any further write.";
        } else if (menuId && ciTransportFailed) {
            report.cleanup = "UNVERIFIED_NO_AUTOMATIC_RETRY";
            report.residualRisk = "Transport failed with a known fixture. No further write; inspect this fixture state read-only.";
        } else if (context && menuId && canCleanup(ledger) && !ciTransportFailed) {
            try {
                const current = await read(menuId); assert.equal(current.name, name); record("CLEANUP_PRE_READ", current);
                if (current.isPublished) {
                    cleanupAttempted = true;
                    await page.goto(target.origin + "/admin/menus");
                    await action("CLEANUP", "POST", `/api/admin/menus/${menuId}/stop`, () => page.getByRole("button", { name: name + "の公開を停止", exact: true }).click());
                }
                const final = await read(menuId); assert.equal(final.name, name); assert.equal(final.isPublished, false); record("FINAL_PRIVATE_HISTORY_RETAINED", final);
                report.cleanup = "PRIVATE_VERIFIED";
            } catch { report.cleanup = ledger.held ? "HOLD_ORIGINAL_REQUEST_UNCONFIRMED_NO_WRITE" : "UNVERIFIED_NO_AUTOMATIC_RETRY"; }
        }
        if (context && protectedBefore) {
            try {
                report.protectedAfter = await Promise.all(protectedIds.map(async id => protectedApiSnapshot(await read(id))));
                assert.deepEqual(report.protectedAfter, protectedBefore);
                report.protection = "PASS_API_REPRESENTATION";
            } catch { report.protection = "FAIL_OR_UNVERIFIED_API_REPRESENTATION"; }
        }
        report.cleanupStopAttempted = cleanupAttempted;
        report.phase = phase;
        if (ledger.held) report.residualRisk = "Original write may commit after timeout, transport failure or last GET. No further write/cleanup/retry. Read-only reconciliation must establish the original operation outcome, creationOperationId/name, current API/DB state and audit history; otherwise keep HOLD.";
        if (ciAccess) report.authenticationProgress = ciAccess.authenticationProgress();
        if (ciAccess && page) report.authenticationCleanup = await ciAccess.signOut(page);
        const closes = await Promise.allSettled([context?.close(), browser?.close()]);
        report.browserClose = closes.every(result => result.status === "fulfilled") ? "CONFIRMED" : "UNVERIFIED";
        const overall = overallResult(report.flow, report.cleanup, report.protection, ledger.held,
            report.browserClose === "CONFIRMED" && report.authenticationCleanup !== "SIGNOUT_UNVERIFIED" && !ciTransportFailed);
        report.overall = overall.status; report.status = overall.status;
        process.exitCode = overall.exit; save();
        console.log(`ISSUE118_RESULT ${report.overall}; flow=${report.flow}; cleanup=${report.cleanup}`);
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runLive().catch(() => { console.error("ISSUE118_PREFLIGHT_FAILED_NO_RAW_ERROR"); process.exitCode = 1; });
}
