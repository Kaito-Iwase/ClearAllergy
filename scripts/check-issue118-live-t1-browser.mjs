// Real Preview only. Reuses isolated Playwright; no credential or session-state files.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync, fsyncSync, lstatSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCiAccess, assertCiEnvironment, ciIdentity, assertOidcClaims, assertClerkPublishableKey } from "./issue118-ci-auth.mjs";
import { transportObservation, scopedOidcHeaders, protectedPreviewFetch } from "./issue118-preview-transport.mjs";
import { closeIsolatedBrowser } from "./issue118-close-browser.mjs";
import { prepareT4Observation } from "./issue118-t4-observer.mjs";

// Callable bridge for the separately scoped T2/T3 run. It deliberately does not
// change runLive(), --ci-apply, its one-fixture confirmation, auth or workflow.
// The caller must supply the guarded A/B transport and durable claims; passing
// T1's action()/click wrapper would duplicate ownership of the send/ledger.
export function prepareOriginalBatchRun(input) {
    const { prepareOriginalScenario } = createRequire(import.meta.url)("tsx/cjs/api").require("./issue118-batch-stop.ts", import.meta.url);
    if (input.managed) {
        const source = createRequire(import.meta.url)("tsx/cjs/api").require("./issue118-batch-stop.ts", import.meta.url);
        try { return prepareManagedOriginalBatch(input, source); }
        catch { throw Error("ORIGINAL_MANAGED_PREPARATION_HELD"); }
    }
    return prepareOriginalScenario({ ...input, ledgerPort: { newWriteLedger, beginWrite, holdWrite, confirmWrite } });
}

// Preparation-only orchestration. No CLI, workflow, credential acquisition or
// authentication entrypoint calls this. Existing A-only authentication is unchanged.
// A future caller must supply TWO independently authenticated guarded contexts and
// fresh external owner evidence. No real ownerB is inferred or stored in this code.
function prepareManagedOriginalBatch(input, { prepareOriginalScenario, projectOriginalPayloads, fixturePayload }) {
    const refused = () => { throw Error("ORIGINAL_MANAGED_PREPARATION_HELD"); };
    const check = value => { if (!value) refused(); };
    const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    const cfg = input.managed, now = cfg.now || Date.now;
    check(cfg.mode === "PREPARATION_ONLY" && uuid(input.runId) && typeof cfg.claimDirectory === "string");
    check(Array.isArray(cfg.actors) && cfg.actors.length === 2);
    const actors = new Map(cfg.actors.map(a => [a.binding?.owner, { ...a, binding: structuredClone(a.binding) }]));
    check(actors.size === 2 && actors.has("S1") && actors.has("S2"));
    const owners = cfg.actors.map(a => structuredClone(a.binding));
    check(new Set(owners.map(a => a.shopId)).size === 2 && new Set(owners.map(a => a.contextRef)).size === 2
        && new Set(cfg.actors.map(a => a.context)).size === 2 && new Set(cfg.actors.map(a => a.page)).size === 2
        && new Set(cfg.actors.map(a => a.access)).size === 2 && new Set(cfg.actors.map(a => a.expectedUserId)).size === 2);
    for (const actor of actors.values()) {
        check(/^user_[A-Za-z0-9]+$/.test(actor.expectedUserId || "") && /^c[a-z0-9]+$/.test(actor.binding.shopId)
            && /^[A-Za-z0-9_-]{1,64}$/.test(actor.binding.contextRef)
            && typeof actor.access?.read === "function" && typeof actor.access?.token === "function"
            && typeof actor.context?.request?.fetch === "function" && typeof actor.page?.evaluate === "function"
            && actor.page.context() === actor.context);
    }
    check(actors.get("S1").expectedUserId === ciIdentity.ownerId && actors.get("S1").binding.shopId === target.shop);
    // Historical approved main19 pair, not evidence of a current B session/shop.
    check(actors.get("S2").expectedUserId === "user_3LFyNjtUBNFHoDjyYiieTXEhHd0");
    check(typeof actors.get("S1").context.newPage === "function" && typeof actors.get("S1").context.pages === "function"
        && ["SYNTHETIC_HTTP_BROWSER", "APP_BROWSER_READS_ONLY"].includes(cfg.t4EvidenceLevel));
    const evidence = structuredClone(cfg.ownerEvidence), identityReceipt = structuredClone(cfg.identityReceipt);
    const validate = () => {
        assertIdentityReceipt(identityReceipt, now());
        check(Array.isArray(evidence) && evidence.length === 2);
        for (const [role, actor] of actors) {
            const entries = evidence.filter(e => e.owner === role), entry = entries[0];
            const age = now() - Date.parse(entry?.observedUtc);
            check(entries.length === 1 && entry.clerkUserId === actor.expectedUserId && entry.shopId === actor.binding.shopId
                && entry.contextRef === actor.binding.contextRef && entry.deployment === target.deployment
                && entry.source === target.source && entry.origin === target.origin
                && ["human", "browser_metadata_observer"].includes(entry.verifiedBy)
                && typeof entry.evidenceReference === "string" && entry.evidenceReference.length > 0
                && Number.isFinite(age) && age >= 0 && age <= 600000);
        }
    };
    validate();
    check(["T2", "T3", "T4"].every(s => uuid(cfg.runIds?.[s]))
        && new Set([input.runId, cfg.runIds.T2, cfg.runIds.T3, cfg.runIds.T4]).size === 4);
    const batchRunId = input.runId, runIds = structuredClone(cfg.runIds);
    const operationIds = structuredClone(cfg.operationIds);
    check(["T2", "T3"].every(s => Object.keys(operationIds?.[s] || {}).length === 8
        && Array.from({ length: 8 }, (_, i) => "M0" + (i + 1)).every(k => uuid(operationIds[s][k])))
        && Object.keys(operationIds).length === 3 && Object.keys(operationIds.T4 || {}).length === 1 && uuid(operationIds.T4.M02)
        && new Set(Object.values(operationIds).flatMap(x => Object.values(x))).size === 17);
    let used = false, held = false, journal, sequence = 0, managedReady = false, serviceActive = false;
    const claimDirectory = resolve(cfg.claimDirectory), created = new Map(), observations = [];
    const claim = (file, data) => {
        let fd;
        try { fd = openSync(join(claimDirectory, file + ".json"), "wx", 0o600);
            writeFileSync(fd, JSON.stringify(data)); fsyncSync(fd); return true;
        } catch { held = true; return false; } finally { if (fd !== undefined) closeSync(fd); }
    };
    const record = async event => {
        check(/^[A-Z0-9_]+$/.test(event.stage));
        const safe = { sequence: ++sequence, stage: event.stage,
            ...(["M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08"].includes(event.key) ? { key: event.key } : {}),
            ...(/^c[a-z0-9]+$/.test(event.menuId || "") ? { menuId: event.menuId } : {}),
            ...(Number.isSafeInteger(event.version) && event.version >= 0 ? { version: event.version } : {}),
            ...(Number.isInteger(event.httpStatus) && event.httpStatus >= 100 && event.httpStatus <= 599 ? { httpStatus: event.httpStatus } : {}) };
        try { writeFileSync(journal, JSON.stringify(safe) + "\n"); fsyncSync(journal); }
        catch { held = true; refused(); }
    };
    const readProtected = (actor, path) => {
        validate();
        return protectedPreviewFetch(actor.context.request, target.origin + path, {}, assertOidcClaims(actor.access.token(), now()));
    };
    const verifyActor = async (binding, readOnlyReconciliation = false) => {
        try {
            check((!held || readOnlyReconciliation) && !input.signal?.aborted); validate();
            const actor = actors.get(binding.owner);
            check(actor && actor.binding.shopId === binding.shopId && actor.binding.contextRef === binding.contextRef
                && actor.page.context() === actor.context && actor.page.url() === target.origin + "/admin/shop");
            const identity = await actor.page.evaluate(() => ({ id: window.Clerk?.user?.id, pk: window.Clerk?.publishableKey }));
            check(identity?.id === actor.expectedUserId); assertClerkPublishableKey(identity.pk);
            const response = await readProtected(actor, "/api/admin/shop");
            check(response.status() === 200 && (await response.json())?.shop?.id === binding.shopId);
            return actor;
        } catch { held = true; refused(); }
    };
    const actorForTarget = t => {
        const actor = [...actors.values()].find(a => a.binding.shopId === t.shopId && a.binding.contextRef === t.contextRef);
        check(actor && created.get(t.menuId)?.owner === actor.binding.owner && created.get(t.menuId)?.key === t.key);
        return actor;
    };
    const adapter = scenario => ({
        claimScenario: async manifest => claim(scenario + "-setup", { runId: manifest.runId, scenario, operationIds: manifest.operationIds }),
        claimRun: async manifest => claim(scenario + "-stops", { runId: manifest.runId, scenario, fixtures: manifest.fixtures }),
        assertOwner: verifyActor,
        assertActor: async t => { await verifyActor(actorForTarget(t).binding); },
        readOwnMenu: async t => {
            const actor = await verifyActor(actorForTarget(t).binding);
            const response = await readProtected(actor, "/api/admin/menus/" + t.menuId);
            check(response.status() === 200); return { shopId: actor.binding.shopId, menu: (await response.json())?.menu };
        },
        dispatch: async command => send(scenario, command),
        dispatchStop: async command => send(scenario, { ...command, phase: "STOP", owner: actorForTarget(command).binding }),
        record,
    });
    const send = async (scenario, command) => {
        try {
            const actor = await verifyActor(command.owner);
            check(["CREATE", "INITIAL_PUBLISH", "STOP", "CORRECT_PRIVATE", "REPUBLISH"].includes(command.phase));
            if (command.phase === "CREATE") check(command.method === "POST" && command.path === "/api/admin/menus"
                && command.body.operationId === operationIds[scenario][command.key] && command.body.isPublished === false);
            else { check(/^c[a-z0-9]+$/.test(command.menuId || "") && created.get(command.menuId)?.scenario === scenario
                    && actorForTarget({ ...command, shopId: command.owner.shopId, contextRef: command.owner.contextRef }) === actor);
                check(command.method === (command.phase === "STOP" ? "POST" : "PUT")
                    && command.path === `/api/admin/menus/${command.menuId}${command.phase === "STOP" ? "/stop" : ""}`); }
            check(claim(`${scenario}-${command.key}-${command.phase}`, { scenario, key: command.key, phase: command.phase,
                ...(command.menuId ? { menuId: command.menuId } : {}) }));
            await record({ stage: "TRANSPORT_INTENT_DURABLY_CLAIMED", key: command.key, menuId: command.menuId });
            validate(); check(!held && !input.signal?.aborted);
            const url = target.origin + command.path, token = assertOidcClaims(actor.access.token(), now());
            const response = await actor.context.request.fetch(url, { method: command.method, data: command.body,
                headers: scopedOidcHeaders(url, { "Content-Type": "application/json", Origin: target.origin }, token),
                maxRedirects: 0, maxRetries: 0, timeout: 20000, failOnStatusCode: false });
            check(response.status() < 300 || response.status() >= 400);
            return { status: () => response.status(), json: async () => {
                const body = await response.json();
                if (command.phase === "CREATE" && response.status() === 201 && /^c[a-z0-9]+$/.test(body?.id || "")) {
                    check(!created.has(body.id) && ![target.anchor, "cmvs4x86o000vwn0w93c8ttez", "cmvs4x8wt000xwn0wj6gwdih1",
                        "cmvs4x986000zwn0wer2ymhow", "cmvuy8d4z0003jw07e9fobsdm", "cmvuzlqhf0003l308lem3uwck"].includes(body.id));
                    created.set(body.id, { key: command.key, owner: command.owner.owner, scenario });
                }
                return body;
            } };
        } catch { held = true; refused(); }
    };
    const runT4 = async () => {
        const { savedMenuResponseSchema } = createRequire(import.meta.url)("tsx/cjs/api").require("../features/admin/menus/schemas/menu-response.ts", import.meta.url);
        const actor = actors.get("S1"), owner = actor.binding, key = "M02", ledger = newWriteLedger();
        const payload = projectOriginalPayloads(runIds.T4).expectedByMenu.M02;
        const report = { scenario: "T4", status: "T4_HOLD_NO_FURTHER_WRITES", stage: "SETUP", code: "HOLD", fixtureId: null, writes: ledger,
            observation: null, ownedPagesClosed: null, preexistingPagesPreserved: null, database: "NOT_ATTESTED", automaticCleanup: false };
        let observer, beforePages, menuId, previous;
        const readOwn = async () => savedMenuResponseSchema.parse({ menu: (await adapter("T4").readOwnMenu({ key, menuId, shopId: owner.shopId, contextRef: owner.contextRef })).menu }).menu;
        const mutate = async (phase, method, path, body) => {
            report.stage = phase;
            const op = beginWrite(ledger, phase); op.state = "IN_FLIGHT";
            try {
                const response = await send("T4", { key, owner, phase, method, path, menuId, body });
                const parsed = await consumeWriteResponse(ledger, op, response, menuId, id => { menuId = id; report.fixtureId = id; });
                const menu = await readOwn();
                assert.deepEqual(fixturePayload(menu), payload);
                check(menu.allergens.length === 29 && new Set(menu.allergens.map(a => a.slug)).size === 29);
                if (phase === "CREATE") check(!menu.isPublished && menu.publicationConfirmedFoodVersion === null);
                else {
                    check(previous && menu.version === parsed.menu.version && menu.version > previous.version
                        && menu.foodVersion === previous.foodVersion);
                    if (phase === "INITIAL_PUBLISH") check(menu.isPublished && menu.publicationConfirmedFoodVersion === menu.foodVersion);
                    else {
                        check(!menu.isPublished);
                        const stable = value => { const copy = structuredClone(value); delete copy.version; delete copy.isPublished; return copy; };
                        assert.deepEqual(stable(menu), stable(previous));
                    }
                }
                confirmWrite(ledger, op); previous = menu;
                await record({ stage: "T4_RESPONSE_AND_API_READBACK_CONFIRMED", key, menuId, version: menu.version });
            } catch { holdWrite(ledger, op, "T4_RESULT_OR_READBACK_UNCONFIRMED"); held = true; refused(); }
        };
        try {
            check(claim("T4-setup", { runId: runIds.T4, operationId: operationIds.T4.M02 }));
            await mutate("CREATE", "POST", "/api/admin/menus", { ...payload, operationId: operationIds.T4.M02, isPublished: false });
            await mutate("INITIAL_PUBLISH", "PUT", `/api/admin/menus/${menuId}`, { expectedVersion: previous.version, publicationAction: "publish" });
            await verifyActor(owner); beforePages = new Set(actor.context.pages());
            report.stage = "OBSERVER_BASELINE";
            observer = await prepareT4Observation({ context: actor.context,
                fixture: { origin: target.origin, shopId: owner.shopId, menuId, name: payload.name },
                assertReadTarget: () => verifyActor(owner), evidenceLevel: cfg.t4EvidenceLevel,
                readPublicApi: async url => {
                    check(url === target.origin + "/api/menus/" + menuId); await verifyActor(owner);
                    const response = await readProtected(actor, "/api/menus/" + menuId), status = response.status();
                    return { status, ...(status === 200 ? { menuId: (await response.json())?.menu?.id } : {}) };
                } });
            await record({ stage: "T4_BASELINE_READY_BEFORE_STOP", key, menuId });
            await mutate("STOP", "POST", `/api/admin/menus/${menuId}/stop`, { expectedVersion: previous.version });
            report.stage = "OBSERVER_AFTER_STOP";
            report.observation = await observer.afterExternalChange();
            report.stage = "OBSERVATION_VALIDATE";
            check(report.observation.freshReadOutcome === "FRESH_READS_HIDE_TARGET" && !report.observation.truncated
                && !report.observation.observationFailed && report.observation.held.targetMatched === true
                && report.observation.back.targetMatched === true
                && report.observation.failedRefetch.injection === "ONE_DOCUMENT_GET_ABORTED_BEFORE_FORWARD");
            await record({ stage: "T4_OBSERVATION_COLLECTED_NOT_DATABASE_ATTESTATION", key, menuId });
            report.status = "T4_STOP_API_AND_OBSERVATIONS_CONFIRMED_NOT_LIVE_PASS";
            report.code = "MODEL_OR_ADAPTER_OBSERVATIONS_ONLY";
        } catch { report.code = report.stage + "_HELD"; held = true; }
        finally {
            try {
                const close = observer ? await observer.close() : null;
                report.ownedPagesClosed = beforePages ? (!close || close.allOwnedPagesClosed === true)
                    && actor.context.pages().every(p => beforePages.has(p) || p.isClosed()) : true;
                report.preexistingPagesPreserved = beforePages ? [...beforePages].every(p => !p.isClosed()) : true;
            } catch { report.ownedPagesClosed = false; report.preexistingPagesPreserved = false; }
            if (!report.ownedPagesClosed || !report.preexistingPagesPreserved) held = true;
        }
        if (held) report.status = "T4_HOLD_NO_FURTHER_WRITES";
        return report;
    };
    const prepareServiceObservation = cfgProbe => {
        check(managedReady && !held && !serviceActive); validate();
        const { prepareWriteObservation } = createRequire(import.meta.url)("tsx/cjs/api").require("./issue118-service-observer.ts", import.meta.url);
        const { menuCreateResponseSchema } = createRequire(import.meta.url)("tsx/cjs/api").require("../features/admin/menus/schemas/menu-response.ts", import.meta.url);
        const probeTarget = structuredClone(cfgProbe.target), mode = cfgProbe.mode;
        check(["MENU_CREATE", "MENU_SAVE", "STOP", "MENU_UPLOAD"].includes(probeTarget.kind));
        const actor = actors.get(cfgProbe.owner);
        check(actor && typeof cfgProbe.observeUi === "function");
        if (probeTarget.kind !== "MENU_CREATE") check(created.get(probeTarget.menuId)?.owner === actor.binding.owner);
        if (probeTarget.kind === "MENU_UPLOAD") check(cfgProbe.upload?.origin === "https://wtqdbklmg3bbqk4s.public.blob.vercel-storage.com");
        const logical = createHash("sha256").update(JSON.stringify({ kind: probeTarget.kind,
            id: probeTarget.menuId || probeTarget.creationOperationId, version: probeTarget.beforeVersion ?? null })).digest("hex");
        if (probeTarget.kind === "MENU_CREATE") check(!Object.values(operationIds).flatMap(x => Object.values(x)).includes(probeTarget.creationOperationId));
        const serviceLedger = newWriteLedger(); let op, rawResponse, started = false, body, before, forwardCalls = 0, abortCalls = 0, createdMenuId;
        const assertRequestActor = () => {
            const page = cfgProbe.page, expectedPath = probeTarget.kind === "MENU_CREATE" ? "/admin/menus/new" : `/admin/menus/${probeTarget.menuId}/edit`;
            check(page && page.context() === actor.context && page.url() === target.origin + expectedPath
                && cfgProbe.route.request().frame().page() === page);
        };
        const serviceRecord = async event => {
            const safe = { sequence: ++sequence, stage: event.stage,
                ...(Number.isInteger(event.httpStatus) ? { httpStatus: event.httpStatus } : {}),
                ...(uuid(event.requestId) ? { requestId: event.requestId } : {}),
                ...(/^c[a-z0-9]+$/.test(event.menuId || "") ? { menuId: event.menuId } : {}),
                ...(/^[a-f0-9]{64}$/.test(event.objectSha256 || "") ? { objectSha256: event.objectSha256 } : {}) };
            check(/^[A-Z0-9_]+$/.test(safe.stage)); let fd;
            try {
                check(JSON.parse(readFileSync(join(claimDirectory, "managed-run.json"), "utf8")).runId === batchRunId);
                check(lstatSync(join(claimDirectory, "events.jsonl")).isFile() && !lstatSync(join(claimDirectory, "events.jsonl")).isSymbolicLink());
                fd = openSync(join(claimDirectory, "events.jsonl"), "a"); writeFileSync(fd, JSON.stringify(safe) + "\n"); fsyncSync(fd);
                if (event.stage === "CREATED_201_ID_RECORDED") {
                    check(event.menuId === createdMenuId && created.get(event.menuId)?.owner === actor.binding.owner
                        && created.get(event.menuId)?.creationOperationId === probeTarget.creationOperationId);
                }
            } catch { held = true; refused(); } finally { if (fd !== undefined) closeSync(fd); }
        };
        const readBoundMenu = async id => {
            check(created.get(id)?.owner === actor.binding.owner);
            await verifyActor(actor.binding);
            const response = await readProtected(actor, "/api/admin/menus/" + id);
            check(response.status() === 200); const menu = (await response.json())?.menu;
            check(menu?.id === id); return menu;
        };
        const source = prepareWriteObservation({ scope: { runId: batchRunId, applicationSha: target.source, shopId: actor.binding.shopId,
            isolationReceiptSha256: createHash("sha256").update(JSON.stringify(identityReceipt)).digest("hex") },
            target: probeTarget, mode, fileExpected: cfgProbe.fileExpected, upload: cfgProbe.upload,
            adapter: {
                assertScope: async () => { await verifyActor(actor.binding);
                    if (probeTarget.kind !== "MENU_CREATE") check(created.get(probeTarget.menuId)?.owner === actor.binding.owner); },
                claim: async () => { op = beginWrite(serviceLedger, "SERVICE");
                    const ok = claim("service-" + logical, { runId: batchRunId, kind: probeTarget.kind,
                        menuId: probeTarget.menuId, creationOperationId: probeTarget.creationOperationId });
                    if (!ok) holdWrite(serviceLedger, op, "SERVICE_LOGICAL_CLAIM_HELD"); return ok; },
                forwardOnce: async () => {
                    assertRequestActor(); await verifyActor(actor.binding);
                    if (probeTarget.kind === "MENU_CREATE") {
                        const data = JSON.parse(body.toString("utf8"));
                        check(data.operationId === probeTarget.creationOperationId && data.isPublished === false
                            && typeof data.name === "string" && data.name.startsWith("【架空") && data.name.includes(batchRunId));
                    } else {
                        before = await readBoundMenu(probeTarget.menuId);
                        if (probeTarget.kind !== "MENU_UPLOAD") check(before.version === probeTarget.beforeVersion
                            && JSON.parse(body.toString("utf8")).expectedVersion === probeTarget.beforeVersion);
                    }
                    const headers = scopedOidcHeaders(target.origin + probeTarget.path, await cfgProbe.route.request().allHeaders(),
                        assertOidcClaims(actor.access.token(), now()));
                    assertRequestActor();
                    op.requestSent = true; op.state = "IN_FLIGHT"; forwardCalls++;
                    rawResponse = await cfgProbe.route.fetch({ headers, maxRedirects: 0, maxRetries: 0, timeout: 20000 });
                    check(rawResponse.status() < 300 || rawResponse.status() >= 400);
                    if (probeTarget.kind === "MENU_CREATE" && rawResponse.status() === 201) {
                        const raw = await rawResponse.json(), parsedId = menuCreateResponseSchema.shape.id.safeParse(raw?.id);
                        if (parsedId.success) {
                            createdMenuId = parsedId.data; op.createdId = createdMenuId;
                            check(!created.has(createdMenuId) && ![target.anchor, "cmvs4x86o000vwn0w93c8ttez", "cmvs4x8wt000xwn0wj6gwdih1",
                                "cmvs4x986000zwn0wer2ymhow", "cmvuy8d4z0003jw07e9fobsdm", "cmvuzlqhf0003l308lem3uwck"].includes(createdMenuId));
                            check(claim("service-created-" + probeTarget.creationOperationId, { runId: batchRunId, menuId: createdMenuId,
                                creationOperationId: probeTarget.creationOperationId, correlation: "NOT_YET_VERIFIED" }));
                            created.set(createdMenuId, { key: "SERVICE", owner: actor.binding.owner, scenario: "SERVICE", creationOperationId: probeTarget.creationOperationId });
                            await serviceRecord({ stage: "CREATED_201_ID_HELD_BEFORE_CORRELATION", menuId: createdMenuId });
                        }
                    }
                    return { status: () => rawResponse.status(), requestId: async () => rawResponse.headers()["x-request-id"] ?? null,
                        json: () => rawResponse.json() };
                },
                abortClient: async () => { abortCalls++; await cfgProbe.route.abort("failed"); },
                deliverOnce: async () => { assertRequestActor(); await cfgProbe.route.fulfill({ response: rawResponse }); },
                observeUi: cfgProbe.observeUi, record: serviceRecord,
                recordKnownObject: async ref => claim("object-" + ref.objectSha256, ref),
            } });
        serviceActive = true;
        return {
            async execute() {
                check(!started); started = true; let result, sourceEntered = false;
                try {
                    assertRequestActor();
                    const request = cfgProbe.route.request(), url = new URL(request.url());
                    check(url.href === target.origin + probeTarget.path && !url.username && !url.password && !url.search && !url.hash);
                    body = request.postDataBuffer(); check(Buffer.isBuffer(body) && body.length <= 6 * 1024 * 1024);
                    sourceEntered = true; result = await source.execute({ method: request.method(), path: url.pathname,
                        bodySha256: createHash("sha256").update(body).digest("hex") });
                    if (result.stage === "REQUEST_MISMATCH_NO_ACTION") { abortCalls++; await cfgProbe.route.abort("failed"); }
                    check(result.clientDelivery === "DELIVERY_CONFIRMED" && result.bodyValidated && !result.clientUnknown
                        && result.ui?.successDisplayed === true && result.ui?.followupWrites === 0);
                    const id = result.createdMenuId || probeTarget.menuId, after = await readBoundMenu(id);
                    if (probeTarget.kind === "MENU_UPLOAD") assert.deepEqual(after, before);
                    else if (probeTarget.kind === "MENU_CREATE") check(after.isPublished === false && after.name === JSON.parse(body.toString("utf8")).name);
                    else { const responseBody = await rawResponse.json(); check(after.version === responseBody.menu.version
                        && (probeTarget.kind !== "STOP" || after.isPublished === false)); }
                    op.bodyValidated = true; confirmWrite(serviceLedger, op);
                    return { status: "SERVICE_DELIVERED_AND_OWN_API_CONFIRMED_NOT_LIVE_PASS", result, writes: serviceLedger, transportForwardCalls: forwardCalls,
                        ...(createdMenuId ? { createdMenuId, creationOperationId: probeTarget.creationOperationId } : {}),
                        imageFix: "NOT_ATTESTED_PR121_CANDIDATE_REQUIRED", cleanup: "RETAIN_NO_DELETE_METHOD" };
                } catch {
                    held = true; if (op) holdWrite(serviceLedger, op, "SERVICE_RESULT_OR_UI_OR_READBACK_HELD");
                    if (!sourceEntered && abortCalls === 0) { abortCalls++; try { await cfgProbe.route.abort("failed"); } catch { /* never retry abort */ } }
                    return { status: "SERVICE_HOLD_NO_FURTHER_WRITES", result, writes: serviceLedger, transportForwardCalls: forwardCalls,
                        ...(createdMenuId ? { createdMenuId, creationOperationId: probeTarget.creationOperationId } : {}), cleanup: "RETAIN_NO_DELETE_METHOD" };
                } finally { serviceActive = false; }
            },
            // This does not clear held/clientUnknown and never exposes deletion.
            async observeKnownBlob(readExactObject) {
                try {
                    const result = await source.observeKnownBlob({ assertScope: () => verifyActor(actor.binding, true), readExactObject });
                    if (result.stage !== "EXACT_KNOWN_OBJECT_BYTES_MATCH") held = true;
                    return { ...result, managedHeld: held };
                } catch { held = true; refused(); }
            },
        };
    };
    return { prepareServiceObservation, async execute() {
        check(!used); used = true;
        const results = []; let report;
        try {
            validate(); for (const owner of owners) await verifyActor(owner);
            mkdirSync(claimDirectory, { recursive: true }); check(lstatSync(claimDirectory).isDirectory() && !lstatSync(claimDirectory).isSymbolicLink());
            check(claim("managed-run", { runId: batchRunId, scenarios: ["T2", "T3", "T4"], runIds }));
            journal = openSync(join(claimDirectory, "events.jsonl"), "wx", 0o600);
            for (const scenario of ["T2", "T3"]) {
                const result = await prepareOriginalScenario({ scenario, runId: runIds[scenario], owners, operationIds: operationIds[scenario],
                    adapter: adapter(scenario), signal: input.signal, ledgerPort: { newWriteLedger, beginWrite, holdWrite, confirmWrite } }).execute();
                results.push(result);
                const expected = scenario === "T2" ? "SCENARIO_APP_RESPONSES_CONFIRMED_NOT_LIVE_PASS" : "SCENARIO_STOP_CONFIRMED_LOT_HOLD_NOT_LIVE_PASS";
                if (held || result.status !== expected) refused();
            }
            const t4 = await runT4(); results.push(t4);
            check(!held && t4.status === "T4_STOP_API_AND_OBSERVATIONS_CONFIRMED_NOT_LIVE_PASS");
            observations.push(t4.observation);
            report = { status: "MANAGED_ADAPTER_SEQUENCE_CONFIRMED_NOT_LIVE_PASS", results, observations, t4,
                authentication: "CALLER_CONTEXTS_NOT_INDEPENDENTLY_ATTESTED", independentDatabase: "NOT_ATTESTED", automaticCleanup: false };
        } catch { report = { status: "MANAGED_HOLD_NO_FURTHER_WRITES", results, observations, automaticCleanup: false, automaticRetry: false }; }
        finally {
            if (journal !== undefined) {
                try { closeSync(journal); } catch { held = true; }
            }
        }
        if (held) report.status = "MANAGED_HOLD_NO_FURTHER_WRITES";
        managedReady = !held && report.status === "MANAGED_ADAPTER_SEQUENCE_CONFIRMED_NOT_LIVE_PASS";
        return report;
    } };
}

export function transportLifecycleSnapshot(phase, at = new Date().toISOString()) {
    const phases = ['SETUP', 'AUTHENTICATION', 'APP_FLOW', 'FLOW_VERIFIED', 'CLEANUP',
        'PROTECTION_CHECK', 'PROTECTION_CHECK_FINISHED', 'SIGNOUT', 'SIGNOUT_FINISHED',
        'CONTEXT_CLOSE_START', 'CONTEXT_CLOSE_END', 'BROWSER_CLOSE_START', 'BROWSER_CLOSE_END', 'LOCAL_CLOSE_FINISHED'];
    return { phase: phases.includes(phase) ? phase : 'UNKNOWN',
        observedUtc: typeof at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at)
            && Number.isFinite(Date.parse(at)) ? at : null };
}
export function recordTransportDiagnostic(report, observation, lifecycle) {
    const safe = transportObservation(observation.originRole, observation.method, observation.status,
        observation.exception, observation.stages);
    if (lifecycle) safe.lifecycle = transportLifecycleSnapshot(lifecycle.phase, lifecycle.observedUtc);
    const events = report.transportDiagnostics ??= [];
    if (events.length < 64) events.push(safe); else report.transportDiagnosticsTruncated = true;
    if ((safe.exception !== 'NONE' && safe.exception !== 'POLICY_REFUSED') || safe.status >= 400)
        report.firstTransportFailure ??= safe;
}

const fixedErrors = new Set(["DIALOG_TIMEOUT", "DIALOG_HANDLER_FAILED", "WRITE_RESULT_UNCERTAIN",
    "CI_AUTHENTICATION_FAILED", "CI_TRANSPORT_HELD", "CI_IDENTITY_REFUSED", "CI_AMBIENT_CONFIGURATION_REFUSED",
    "CI_DEBUG_REFUSED", "TEST_CLERK_KEY_REQUIRED", "OIDC_REQUEST_TARGET_REFUSED", "OIDC_REQUEST_AUTH_REQUIRED",
    "OIDC_REQUEST_FAILED", "OIDC_CLAIMS_INVALID", "OIDC_CLAIMS_REFUSED", "OIDC_TIME_REFUSED",
    "BROWSER_LAUNCH_FAILED", "BROWSER_CONTEXT_FAILED", "BROWSER_PAGE_FAILED",
    "T1_KEY_CLASS_READ_HELD", "T1_KEY_CLASS_NOT_READY"]);
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
    origin: "https://clear-allergy-e2e-nv6akym6f-kaitoexe00-9350s-projects.vercel.app",
    deployment: "dpl_BQHQr4WYL9SVphQB1BpJZ8r2ad29",
    source: "ea9f28b14b7741276115abb8a33b331339526f5e",
    alias: null, // CLI source deployment has no alias; all requests use its immutable URL.
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
    assert.ok(["human", "browser_metadata_observer", "cli_metadata_observer"].includes(receipt.verifiedBy));
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
    } finally {
        // Non-secret UUID header only; metadata failure never overrides the write outcome.
        // Capture after body/created-ID handling, including a failed body parse, with a bound.
        let timer;
        try {
            if (typeof response.headerValue === "function") {
                op.auditCorrelationReadAttempted = true; op.auditCorrelationReadCompleted = false;
                const value = await Promise.race([Promise.resolve().then(() => response.headerValue("x-request-id")),
                    new Promise(resolve => { timer = setTimeout(() => resolve(undefined), 1000); })]);
                op.auditCorrelationReadCompleted = value !== undefined;
                op.auditRequestIdValid = typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
                if (op.auditRequestIdValid) op.auditRequestId = value.toLowerCase();
            }
        } catch { op.auditCorrelationReadCompleted = false; }
        finally { clearTimeout(timer); }
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
        reviewedFoodVersionObserved: menu.reviewedFoodVersion === null || Number.isSafeInteger(menu.reviewedFoodVersion),
        ...(menu.reviewedFoodVersion === null || Number.isSafeInteger(menu.reviewedFoodVersion) ? { reviewedFoodVersion: menu.reviewedFoodVersion } : {}),
        priceYen: menu.priceYen, milk: menu.allergens.find(a => a.slug === "milk")?.status,
        unknown: menu.allergens.filter(a => a.status === "UNKNOWN").length };
}

export const readCloseMode = 'FIXTURE_READ_CLOSE_ONLY';
export const readCloseFixtureId = 'cmvyqm8q30001jh07qly55qtw';
export async function readCloseDirectFetch(api, url, token) {
    if (![target.origin + '/api/admin/shop', target.origin + '/api/admin/menus/' + readCloseFixtureId].includes(url))
        throw Error('READ_ONLY_DIRECT_TARGET_REFUSED');
    return protectedPreviewFetch(api, url, {}, token);
}
// Unwired candidate. Pins must come from the reviewed immutable public client build,
// not a CLI/env input or a guessed Server Action/telemetry path. Missing pins grant nothing.
export const verifiedReadCloseAction = Object.freeze({
    source:'ea9f28b14b7741276115abb8a33b331339526f5e',deployment:'dpl_BQHQr4WYL9SVphQB1BpJZ8r2ad29',
    reference:'002d5a40d57114e6b57c906dd03491ecf8c46419f0',
    callerChunk:'/_next/static/immutable/chunks/1yxbpkao8jjq-.js',callerSha256:'22f889779049694ab8497801e8286d170f1101edbad60f9d61d06335458a50a7',
    factoryChunk:'/_next/static/immutable/chunks/44xcerwlley0q.js',factorySha256:'a070e193cc6aa2af93f87b93c668ae7fa6039f396007a82104ba7b228d7850ac',
});
// Dedicated read-close only; the mutation-bearing T1 entry does not use this policy.
// Provenance: caller41895 -> getters95187 -> CJS35326 ->21413 -> React64893;
// callServer95187 ->32120 -> Next48658. No environment/CLI action-ID override.
export function createVerifiedReadCloseAuthPolicyCandidate(receipt) {
    const fixedReceipt=structuredClone(receipt);assertIdentityReceipt(fixedReceipt);
    assert.equal(target.source,verifiedReadCloseAction.source);assert.equal(target.deployment,verifiedReadCloseAction.deployment);
    return createReadCloseAuthPolicyCandidate({actionReference:verifiedReadCloseAction.reference,
        telemetryScripts:['/_vercel/insights/script.js'],assertContext:()=>assertIdentityReceipt(fixedReceipt)});
}
export function createReadCloseAuthPolicyCandidate({ actionReference, telemetryPaths = [],telemetryScripts=[],assertContext=()=>{} } = {}) {
    const actionPinned = typeof actionReference === 'string' && /^[a-f0-9]{40,128}$/.test(actionReference);
    const telemetry = new Set((Array.isArray(telemetryPaths) ? telemetryPaths : []).filter(path => typeof path === 'string' &&
        /^\/(?:_vercel\/insights|[A-Za-z0-9_-]{8,64})\/(?:view|event)$/.test(path)));
    const scripts=new Set((Array.isArray(telemetryScripts)?telemetryScripts:[]).filter(path=>path==='/_vercel/insights/script.js'));
    let actionUsed = false;const approvedRequests=new WeakSet(),sentRequests=new WeakSet();
    const policy=async (request, getPhase) => {
        const names = ['isApp', 'isPost', 'authPhase', 'exactLoginTarget', 'authAuditApi', 'menuApi',
            'queryPresent', 'legacyTelemetryShape', 'pinnedTelemetry', 'headersRead', 'nextActionPresent',
            'nextActionPinned', 'originMatches', 'refererMatches', 'plainTextUtf8', 'acceptsRsc', 'bodyInspected',
            'emptyArguments', 'actionUnused', 'inspectionComplete','pinnedTelemetryScript','isScript'];
        const observation = Object.fromEntries(names.map(name => [name, false]));
        const result = { decision: 'REFUSE', observation };
        try {
            assertContext();
            const raw = request.url(), url = new URL(raw), method = request.method();
            observation.isApp = url.origin === target.origin;
            observation.isPost = method === 'POST'; observation.authPhase = getPhase() === 'AUTHENTICATION';
            observation.queryPresent = !!url.search || raw.includes('?');
            observation.exactLoginTarget = raw === target.origin + '/admin/login';
            observation.authAuditApi = url.pathname === '/api/admin/auth/login';
            observation.menuApi = url.pathname.startsWith('/api/admin/menus');
            observation.legacyTelemetryShape = /^\/_vercel\/insights\/(?:view|event)$/.test(url.pathname);
            observation.pinnedTelemetry = telemetry.has(url.pathname);
            if (url.username || url.password || url.hash) return result;
            if (!observation.isApp) {
                if (readCloseRequestAllowed(method, raw)) { observation.inspectionComplete = true; result.decision = 'USE_EXISTING_TRANSPORT'; }
                return result; // Configured Clerk still delegates to its unchanged CI adapter; no other origin is granted.
            }
            if (observation.authAuditApi || observation.menuApi && method !== 'GET') return result;
            observation.pinnedTelemetryScript=scripts.has(url.pathname);
            if(method==='GET'&&observation.pinnedTelemetryScript) {
                if(observation.queryPresent||raw!==target.origin+url.pathname)return result;
                observation.isScript=request.resourceType()==='script';
                if(observation.isScript) {observation.inspectionComplete=true;result.decision='SUPPRESS_PINNED_TELEMETRY_SCRIPT';return result;}
                return result;
            }
            if (observation.isPost && observation.pinnedTelemetry && !observation.queryPresent) {
                observation.inspectionComplete = true; result.decision = 'SUPPRESS_PINNED_TELEMETRY'; return result;
            }
            if (readCloseRequestAllowed(method, raw)) {
                observation.inspectionComplete = true; result.decision = 'USE_EXISTING_TRANSPORT'; return result;
            }
            if (!observation.isPost || !observation.authPhase || !observation.exactLoginTarget) return result;
            const headers = await request.allHeaders(); observation.headersRead = true;
            const header = name => {
                const keys = Object.keys(headers).filter(key => key.toLowerCase() === name);
                return keys.length === 1 ? Object.getOwnPropertyDescriptor(headers, keys[0])?.value : undefined;
            };
            const action = header('next-action'), contentType = header('content-type');
            observation.nextActionPresent = typeof action === 'string' && action.length > 0;
            observation.nextActionPinned = actionPinned && action === actionReference;
            observation.originMatches = header('origin') === target.origin;
            observation.refererMatches = header('referer') === target.origin + '/admin/login';
            observation.plainTextUtf8 = typeof contentType === 'string' && contentType.toLowerCase().replaceAll(' ', '') === 'text/plain;charset=utf-8';
            observation.acceptsRsc = header('accept') === 'text/x-component';
            if (!observation.nextActionPresent || !observation.originMatches || !observation.refererMatches || !observation.plainTextUtf8 || !observation.acceptsRsc) return result;
            const body = request.postData(); observation.bodyInspected = true; observation.emptyArguments = body === '[]';
            observation.actionUnused = !actionUsed; observation.authPhase = getPhase() === 'AUTHENTICATION';
            assertContext();
            observation.inspectionComplete = true;
            if (observation.nextActionPinned && observation.emptyArguments && observation.actionUnused && observation.authPhase) {
                actionUsed = true;approvedRequests.add(request);result.decision = 'ALLOW_PINNED_AUTH_CACHE_ACTION';
            }
        } catch { /* Unknown inputs/provider failures are REFUSE; no values or raw exceptions escape. */ }
        return result;
    };
    // Revalidate this already claimed request immediately before the transport's
    // fetch, after its separate asynchronous allHeaders(). Never acquire a new claim.
    policy.assertBeforeSend=(request,getPhase)=>{
        assertContext();
        if(approvedRequests.has(request)) {
            if(sentRequests.has(request)||request.method()!=='POST'||getPhase()!=='AUTHENTICATION'||request.url()!==target.origin+'/admin/login'||request.postData()!=='[]')
                throw Error('READ_CLOSE_PRE_SEND_REFUSED');
            sentRequests.add(request);
        }else if(request.method()!=='GET'||!readCloseRequestAllowed('GET',request.url()))throw Error('READ_CLOSE_PRE_SEND_REFUSED');
    };
    return policy;
}
export function readCloseRequestAllowed(method, rawUrl) {
    try {
        const url = new URL(rawUrl);
        if (url.username || url.password) return false;
        if (url.origin !== target.origin) return url.origin === 'https://' + ciIdentity.clerkDomain;
        if (method !== 'GET') return false;
        if (url.pathname.startsWith('/api/')) return !url.search && !url.hash &&
            ['/api/admin/shop', '/api/admin/menus/' + readCloseFixtureId].includes(url.pathname);
        return true; // Static/document GETs remain subject to existing origin/redirect guards.
    } catch { return false; }
}
export async function guardReadCloseRoute(route, onAppRefused, onOtherBlocked, candidate) {
    const request = route.request();
    if(candidate) {
        try {
            const inspected=await candidate.policy(request,candidate.getPhase);
            candidate.observe?.(inspected.observation,inspected.decision);
            if(inspected.decision==='ALLOW_PINNED_AUTH_CACHE_ACTION'||inspected.decision==='USE_EXISTING_TRANSPORT')return true;
            if(inspected.decision==='SUPPRESS_PINNED_TELEMETRY_SCRIPT') {
                await route.fulfill({status:200,contentType:'application/javascript',body:''});return false;
            }
            if(inspected.decision==='SUPPRESS_PINNED_TELEMETRY') {await route.fulfill({status:204,body:''});return false;}
        }catch { /* Unknown policy/header/callback/fulfillment failure refuses below. */ }
        // Never fall back to a broader GET rule after an explicit candidate refusal.
    }else
    if (readCloseRequestAllowed(request.method(), request.url())) return true;
    let app = false;
    try { app = new URL(request.url()).origin === target.origin; } catch { /* unknown target is never forwarded */ }
    if (app) onAppRefused(); else onOtherBlocked();
    await route.abort('blockedbyclient');
    if (app) throw Error('READ_ONLY_REQUEST_REFUSED');
    return false;
}
export async function observeReadCloseFixture(shop, read) {
    assert.equal(shop?.id, target.shop);
    const menu = await read(readCloseFixtureId);
    const observed = state(menu);
    assert.deepEqual(observed, { id: readCloseFixtureId, isPublished: false, version: 96, foodVersion: 87,
        publicationConfirmedFoodVersion: 87, reviewedFoodVersionObserved: true, reviewedFoodVersion: null,
        priceYen: 1000, milk: 'CONTAINS', unknown: 0 });
    if (menu.shopId !== undefined) assert.equal(menu.shopId, target.shop);
    return observed;
}
export function readCloseResult(report, transportFailed, closed) {
    if (report.writes?.held) return { status: 'HOLD_UNCERTAIN_WRITE', exit: 2 };
    const reads=report.readOnlyApiRequests,session=report.sessionIdentity;
    const readsConfirmed=Array.isArray(reads)&&reads.length===2&&new Set(reads.map(r=>r.kind)).size===2&&
        reads.every(r=>['SHOP','FIXTURE'].includes(r.kind)&&r.status===200&&r.responseObserved===true);
    const sessionConfirmed=session&&/^sess_[A-Za-z0-9]{1,128}$/.test(session.id||'')&&session.ownerId===ciIdentity.ownerId&&
        session.ownerVerified===true&&session.providerTerminationConfirmed===true&&session.frontendSignOutAcknowledged===true&&
        !session.diagnosticObservationFailed&&Number.isFinite(Date.parse(session.providerCreatedUtc));
    const complete = report.flow === 'PASS_READ_ONLY_FIXTURE' && report.cleanup === 'NOT_APPLICABLE_READ_ONLY'
        && report.writes?.operations?.length === 0 && report.authenticationCleanup === 'SIGNOUT_CONFIRMED'
        && readsConfirmed&&sessionConfirmed&&closed === true && !transportFailed && !report.firstTransportFailure && !report.readOnlyRequestRefused;
    return { status: complete ? 'READ_CLOSE_DIAGNOSTIC_COMPLETE' : 'FAIL_OR_INCOMPLETE', exit: complete ? 0 : 1 };
}
export function readCloseRequestObservation(request,sequence,lifecycle) {
    const out={sequence:Number.isSafeInteger(sequence)&&sequence>0?sequence:null,
        started:transportLifecycleSnapshot(lifecycle?.phase,lifecycle?.observedUtc),pending:true,originRole:'OTHER',method:'OTHER',kind:'OTHER',resourceType:'other',queryPresent:false};
    try {
        const url=new URL(request.url());out.originRole=url.origin===target.origin?'APP':url.origin==='https://'+ciIdentity.clerkDomain?'CLERK':'OTHER';
        out.method=transportObservation(out.originRole,request.method(),null,'NONE').method;out.queryPresent=!!url.search;
        const type=request.resourceType();if(['document','script','xhr','fetch','stylesheet','font','image'].includes(type))out.resourceType=type;
        out.kind=out.originRole==='CLERK'?'CLERK':out.originRole!=='APP'?'OTHER':url.pathname==='/admin/login'?'LOGIN':
            url.pathname==='/admin/shop'?'SHOP_DOCUMENT':url.pathname==='/api/admin/shop'?'SHOP_API':
            url.pathname==='/api/admin/menus/'+readCloseFixtureId?'FIXTURE_API':url.pathname.startsWith('/_next/static/')?'APP_STATIC':'APP_OTHER';
    }catch {out.metadataReadFailed=true;}
    return out;
}
export function observeReadCloseRoute(route,entry,getPhase,save) {
    const stamp=key=>{entry[key]=transportLifecycleSnapshot(getPhase());save();};
    return {request:()=>route.request(),
        fetch:async options=>{stamp('fetchAttempted');try{const response=await route.fetch(options);stamp('fetchReturned');return response;}
            catch(error){stamp('fetchRejected');throw error;}},
        fulfill:async options=>{stamp('fulfillAttempted');const result=await route.fulfill(options);stamp('fulfillReturned');return result;},
        abort:async code=>{stamp('abortAttempted');const result=await route.abort(code);stamp('abortReturned');return result;}};
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
    const readCloseOnly = process.argv.slice(2).join(' ') === '--ci-read-close';
    if (readCloseOnly && process.env.ISSUE118_DIAGNOSTIC_MODE !== readCloseMode) throw Error('READ_CLOSE_MODE_REFUSED');
    const ciMode = readCloseOnly || process.argv.slice(2).join(" ") === "--ci-apply";
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
        run: randomUUID(), startedUtc: new Date().toISOString(), stage: "LOGIN", phase: "NONE", observations: [], requests: [], status: "RUNNING",
        flow: "NOT_RUN", cleanup: "NOT_REQUIRED_NO_KNOWN_FIXTURE", protection: "NOT_CHECKED" };
    if (readCloseOnly) report.diagnosticMode = readCloseMode;
    const save = () => writeFileSync(join(output, "result.json"), JSON.stringify(report, null, 2));
    let browser;
    let context;
    let browserLaunchAttempted = false;
    let contextCreateAttempted = false;
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
    const readCloseRequestEntries=new WeakMap();
    let activeOperation;
    let ciAccess;
    let ciTransportFailed = false;
    const readClosePolicy = readCloseOnly ? createVerifiedReadCloseAuthPolicyCandidate(identityReceipt) : undefined;
    let lifecyclePhase = 'SETUP', routeSequence = 0;
    const markLifecycle = code => {
        lifecyclePhase = code;
        const event = transportLifecycleSnapshot(code);
        (report.lifecycle ??= []).push(event);
        if (event.phase === 'UNKNOWN' || !event.observedUtc) report.lifecycleIncomplete = true;
    };
    const record = (stage, menu) => { report.observations.push({ at: new Date().toISOString(), stage, ...state(menu) }); save(); };
    const read = async id => {
        const response = await readRequest(`${target.origin}/api/admin/menus/${id}`);
        assert.equal(response.status(), 200);
        const { menu } = await response.json();
        assert.equal(menu.id, id);
        return menu;
    };
    const readRequest = async url => {
        if(ciAccess&&readCloseOnly) {
            assertIdentityReceipt(identityReceipt);
            const kind=url===target.origin+'/api/admin/shop'?'SHOP':url===target.origin+'/api/admin/menus/'+readCloseFixtureId?'FIXTURE':null;
            if(!kind)throw Error('READ_ONLY_DIRECT_TARGET_REFUSED');
            const records=report.readOnlyApiRequests??=[];if(records.some(r=>r.kind===kind))throw Error('READ_ONLY_DUPLICATE_GET_REFUSED');
            const entry={kind,startedUtc:new Date().toISOString(),status:null,responseObserved:false};records.push(entry);save();
            const response=await readCloseDirectFetch(context.request,url,ciAccess.token());
            entry.status=response.status();entry.responseObserved=true;entry.responseObservedUtc=new Date().toISOString();save();return response;
        }
        return ciAccess?ciAccess.read(context.request,url):context.request.get(url,{timeout:20000});
    };
    const action = async (nextPhase, method, path, click) => {
        if (readCloseOnly) throw Error('READ_ONLY_MUTATION_REFUSED');
        assertIdentityReceipt(identityReceipt);
        if (ciTransportFailed) throw Error("CI_TRANSPORT_HELD");
        const op = beginWrite(ledger, nextPhase); activeOperation = op;
        op.startedUtc = new Date().toISOString();
        op.auditActionExpected = ({ CREATE: "menu_create", INITIAL_PUBLISH: "menu_publish", STOP: "menu_unpublish",
            CORRECT: "menu_update", REPUBLISH: "menu_publish", CLEANUP: "menu_unpublish" })[nextPhase];
        phase = nextPhase; report.stage = nextPhase; save();
        try {
            const response = page.waitForResponse(r => r.url() === target.origin + path && r.request().method() === method && requestOperations.get(r.request()) === op, { timeout: 20000 });
            const body = response.then(actual => consumeWriteResponse(ledger, op, actual, menuId, id => { menuId = id; report.fixtureId = id; save(); }));
            const [, parsed] = await Promise.all([click(), body]);
            confirmWrite(ledger, op); op.acknowledgedUtc = new Date().toISOString(); phase = "NONE"; activeOperation = undefined; save();
            return parsed;
        } catch {
            // Neither a timeout nor a GET showing private proves the original request cannot commit later.
            holdWrite(ledger, op, "ORIGINAL_REQUEST_NOT_CONFIRMED"); op.heldUtc = new Date().toISOString(); phase = "HOLD"; save();
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
        markLifecycle('AUTHENTICATION');
        const setupStage = stage => { report.stage = stage; (report.setupStages ??= []).push(stage); save(); };
        if (ciMode) ciAccess = await createCiAccess(process.env, fetch, setupStage, {
            authentication: progress => { report.authenticationProgress = progress; save(); },
            session: progress => { report.sessionIdentity=progress;save(); },
            handshake: progress => { report.initialHandshake = progress; save(); },
            frontendRedirect: observation => { report.frontendRedirect ??= observation; save(); },
            scriptTransfer: observation => { const events = report.clerkScriptTransfers ??= [];
                if (events.length < 64) events.push(observation); else report.clerkScriptTransfersTruncated = true; save(); },
            transport: observation => {
                recordTransportDiagnostic(report, observation, transportLifecycleSnapshot(lifecyclePhase));
                save();
            },
        });
        browserLaunchAttempted = true;
        browser = await browserSetupStage("BROWSER_LAUNCH", () => chromium.launch({ headless: ciMode, ...(ciMode ? { channel: "chromium" } : {}) }), setupStage);
        contextCreateAttempted = true;
        context = await browserSetupStage("BROWSER_CONTEXT", () => browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: false, serviceWorkers: "block" }), setupStage);
        const ciRoute = async route => {
            const sequence = ++routeSequence, started = transportLifecycleSnapshot(lifecyclePhase);
            let entry;
            try {
                if(readCloseOnly) {
                    const request=route.request();entry=readCloseRequestObservation(request,sequence,started);readCloseRequestEntries.set(request,entry);
                    const entries=report.readCloseRoutes??=[];if(entries.length<128)entries.push(entry);else report.lifecycleIncomplete=true;
                }
                if (readCloseOnly && !await guardReadCloseRoute(route,
                    () => { report.readOnlyRequestRefused = true; },
                    () => { report.readOnlyOtherRequestsBlocked = (report.readOnlyOtherRequestsBlocked || 0) + 1; },
                    {policy:readClosePolicy,getPhase:()=>lifecyclePhase,observe:(predicates,decision)=>{
                        const events=report.readClosePolicyObservations??=[];
                        if(events.length<128)events.push({sequence,...transportLifecycleSnapshot(lifecyclePhase),predicates,decision});
                        else report.readClosePolicyObservationsTruncated=true;
                        save();
                    }})) {
                    save(); return;
                }
                await ciAccess.route(entry?observeReadCloseRoute(route,entry,()=>lifecyclePhase,save):route,entry?observation=>{
                    const events=entry.transport??=[];
                    if(events.length<4)events.push({...transportLifecycleSnapshot(lifecyclePhase),
                        ...transportObservation(observation.originRole,observation.method,observation.status,observation.exception,observation.stages)});
                    else report.lifecycleIncomplete=true;save();
                }:undefined,readCloseOnly?()=>readClosePolicy.assertBeforeSend(route.request(),()=>lifecyclePhase):undefined);
            }
            catch {
                if(entry)entry.handlerFailed=true;
                report.firstRouteHandlerFailure ??= { sequence, started, observed: transportLifecycleSnapshot(lifecyclePhase) };
                ciTransportFailed = true; report.transportError = "CI_ROUTE_FAILED";
                if (activeOperation) holdWrite(ledger, activeOperation, "TRANSPORT_RESULT_UNCONFIRMED");
                save();
            }
            finally{if(entry){entry.pending=false;entry.finished=transportLifecycleSnapshot(lifecyclePhase);save();}}
        };
        if (ciAccess) await context.route("**/*", ciRoute);
        context.on("response", response => {
            const entry=readCloseRequestEntries.get(response.request());if(entry){entry.browserResponse={...transportLifecycleSnapshot(lifecyclePhase),status:transportObservation(entry.originRole,entry.method,response.status(),'NONE').status};save();}
            const op = requestOperations.get(response.request());
            if (op) { op.responseHeadersObserved = true; op.observedHttpStatus = response.status(); save(); }
        });
        context.on("requestfinished", request => { const entry=readCloseRequestEntries.get(request);if(entry){entry.browserFinished=transportLifecycleSnapshot(lifecyclePhase);save();}const op = requestOperations.get(request); if (op) { op.transportFinished = true; save(); } });
        context.on("requestfailed", request => { const entry=readCloseRequestEntries.get(request);if(entry){let failure='OTHER_FAILURE';try{const text=request.failure()?.errorText;if(text==='net::ERR_ABORTED')failure='ERR_ABORTED';else if(text==='net::ERR_FAILED')failure='ERR_FAILED';}catch{report.lifecycleIncomplete=true;}entry.browserFailed={...transportLifecycleSnapshot(lifecyclePhase),failure};save();}const op = requestOperations.get(request); if (op) { op.transportFailed = true; save(); } });
        await context.route("**/api/admin/**", async route => {
            if (readCloseOnly) return ciRoute(route); // Last-registered admin handler must not bypass the common refusal record.
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
            // Keep the diagnostic CLI's top-level await out of TSX/CJS imports of disabled batch helpers.
            const { readT1KeyClassPreflight, assertT1KeyClassReady } = await import("./check-issue118-server-callback-candidate.mjs");
            report.stage = "T1_KEY_CLASS_PREFLIGHT"; save();
            report.keyClassPreflight = await readT1KeyClassPreflight(context.request, ciAccess.token());
            save();
            assertT1KeyClassReady(report.keyClassPreflight);
            report.keyClassFormatReady = true; save();
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
        markLifecycle('APP_FLOW');
        const own = await readRequest(target.origin + "/api/admin/shop");
        assert.equal(own.status(), 200);
        const shopData = await own.json();
        if (readCloseOnly) {
            report.stage = readCloseMode;
            const observed = await observeReadCloseFixture(shopData.shop, read);
            report.fixtureId = readCloseFixtureId;
            report.observations.push({ at: new Date().toISOString(), stage: 'EXISTING_FIXTURE_READ_ONLY', ...observed });
            report.flow = 'PASS_READ_ONLY_FIXTURE';
            report.cleanup = 'NOT_APPLICABLE_READ_ONLY';
            report.protection = 'NOT_APPLICABLE_READ_ONLY';
            markLifecycle('FLOW_VERIFIED'); save();
            return; // Finally signs out/closes; the mutation-bearing T1 body is unreachable in this mode.
        }
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
        markLifecycle('FLOW_VERIFIED');
    } catch (error) {
        report.flow = ledger.held ? "HOLD_UNCERTAIN_WRITE" : "FAIL";
        report.errorClass = classifyLiveError(error);
    } finally {
        markLifecycle('CLEANUP');
        if (readCloseOnly) {
            report.cleanup = 'NOT_APPLICABLE_READ_ONLY';
        } else if (ledger.held) {
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
            markLifecycle('PROTECTION_CHECK');
            try {
                report.protectedAfter = await Promise.all(protectedIds.map(async id => protectedApiSnapshot(await read(id))));
                assert.deepEqual(report.protectedAfter, protectedBefore);
                report.protection = "PASS_API_REPRESENTATION";
            } catch { report.protection = "FAIL_OR_UNVERIFIED_API_REPRESENTATION"; }
            markLifecycle('PROTECTION_CHECK_FINISHED');
        }
        report.cleanupStopAttempted = cleanupAttempted;
        report.phase = phase;
        if (ledger.held) report.residualRisk = "Original write may commit after timeout, transport failure or last GET. No further write/cleanup/retry. Read-only reconciliation must establish the original operation outcome, creationOperationId/name, current API/DB state and audit history; otherwise keep HOLD.";
        if (ciAccess) report.authenticationProgress = ciAccess.authenticationProgress();
        if (ciAccess) report.initialHandshake = ciAccess.handshakeProgress();
        if (ciAccess && page) {
            markLifecycle('SIGNOUT');
            report.authenticationCleanup = await ciAccess.signOut(page);
            if(readCloseOnly)report.sessionIdentity=ciAccess.sessionObservation();
            markLifecycle('SIGNOUT_FINISHED');
        }
        report.localClose = await closeIsolatedBrowser(context, browser, { browserLaunchAttempted, contextCreateAttempted }, markLifecycle);
        if(readCloseOnly){report.pendingReadCloseRoutes=(report.readCloseRoutes||[]).filter(r=>r.pending).length;if(report.pendingReadCloseRoutes)ciTransportFailed=true;}
        markLifecycle('LOCAL_CLOSE_FINISHED');
        report.browserClose = report.localClose.allLocalClosed ? "CONFIRMED" : "UNVERIFIED";
        const closureComplete = report.browserClose === 'CONFIRMED' && !report.localClose.lifecycleObservationFailed && !report.lifecycleIncomplete;
        const overall = readCloseOnly ? readCloseResult(report, ciTransportFailed, closureComplete) :
            overallResult(report.flow, report.cleanup, report.protection, ledger.held,
                closureComplete && report.authenticationCleanup !== "SIGNOUT_UNVERIFIED" && !ciTransportFailed);
        report.overall = overall.status; report.status = overall.status;
        process.exitCode = overall.exit; save();
        console.log(`ISSUE118_RESULT ${report.overall}; flow=${report.flow}; cleanup=${report.cleanup}`);
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runLive().catch(() => { console.error("ISSUE118_PREFLIGHT_FAILED_NO_RAW_ERROR"); process.exitCode = 1; });
}
