// Real Preview only. Reuses isolated Playwright; no credential or session-state files.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync, fsyncSync, lstatSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from 'node:zlib';
import { createCiAccess, assertCiEnvironment, ciIdentity, managedActorIdentity, assertOidcClaims, assertClerkPublishableKey } from "./issue118-ci-auth.mjs";
import { transportObservation, scopedOidcHeaders, protectedPreviewFetch } from "./issue118-preview-transport.mjs";
import { closeIsolatedBrowser,finalizeOwnedCiActor,ownedCiActorBoundary } from "./issue118-close-browser.mjs";
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
    check(["PREPARATION_ONLY", "APPROVED_MANAGED_LIVE"].includes(cfg.mode) && uuid(input.runId) && typeof cfg.claimDirectory === "string");
    if (cfg.mode === "APPROVED_MANAGED_LIVE") check(typeof cfg.sendBoundary?.authorize === "function" && typeof cfg.sendBoundary?.recordCreated === "function" && typeof cfg.sendBoundary?.consumeSendPermission === "function");
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
    let used = false, held = false, journal, sequence = 0, managedReady = false, serviceActive = false,finalizationStarted=false,cleanupStarted=false;
    const claimDirectory = resolve(cfg.claimDirectory), created = new Map(), observations = [];
    const claim = (file, data) => {
        let fd;
        try { fd = openSync(join(claimDirectory, file + ".json"), "wx", 0o600);
            writeFileSync(fd, JSON.stringify(data)); fsyncSync(fd); return true;
        } catch { held = true; return false; } finally { if (fd !== undefined) closeSync(fd); }
    };
    const record = async event => {
        check(/^[A-Z0-9_]+$/.test(event.stage));
        const safe = { sequence: ++sequence, stage: event.stage, observedUtc: new Date(now()).toISOString(),
            ...(["M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08"].includes(event.key) ? { key: event.key } : {}),
            ...(/^c[a-z0-9]+$/.test(event.menuId || "") ? { menuId: event.menuId } : {}),
            ...(Number.isSafeInteger(event.version) && event.version >= 0 ? { version: event.version } : {}),
            ...(Number.isInteger(event.httpStatus) && event.httpStatus >= 100 && event.httpStatus <= 599 ? { httpStatus: event.httpStatus } : {}),
            ...(uuid(event.requestId) ? { requestId: event.requestId } : {}) };
        let fd=journal,append=false;
        try {
            if(fd===undefined){check(JSON.parse(readFileSync(join(claimDirectory,"managed-run.json"),"utf8")).runId===batchRunId);
                check(lstatSync(join(claimDirectory,"events.jsonl")).isFile()&&!lstatSync(join(claimDirectory,"events.jsonl")).isSymbolicLink());
                fd=openSync(join(claimDirectory,"events.jsonl"),'a');append=true;}
            writeFileSync(fd, JSON.stringify(safe) + "\n"); fsyncSync(fd);
        }catch { held = true; refused(); }
        finally{if(append&&fd!==undefined)closeSync(fd);}
    };
    const readProtected = async (actor, path) => {
        validate();
        if(actor.access.ensureToken)await actor.access.ensureToken();validate();
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
            // Refresh only this role after both real frontend and owner API checks.
            // A late response cannot revive evidence that expired while awaiting it.
            validate();
            evidence.find(entry => entry.owner === binding.owner).observedUtc = new Date(now()).toISOString();
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
            check(["CREATE", "INITIAL_PUBLISH", "STOP", "CORRECT_PRIVATE", "REPUBLISH", "CLEANUP"].includes(command.phase));
            if (command.phase === "CREATE") check(command.method === "POST" && command.path === "/api/admin/menus"
                && command.body.operationId === operationIds[scenario][command.key] && command.body.isPublished === false);
            else { check(/^c[a-z0-9]+$/.test(command.menuId || "") && created.get(command.menuId)?.scenario === scenario
                    && actorForTarget({ ...command, shopId: command.owner.shopId, contextRef: command.owner.contextRef }) === actor);
                check(command.method === (["STOP", "CLEANUP"].includes(command.phase) ? "POST" : "PUT")
                    && command.path === `/api/admin/menus/${command.menuId}${["STOP", "CLEANUP"].includes(command.phase) ? "/stop" : ""}`); }
            check(claim(`${scenario}-${command.key}-${command.phase}`, { scenario, key: command.key, phase: command.phase,
                ...(command.menuId ? { menuId: command.menuId } : {}) }));
            await record({ stage: "TRANSPORT_INTENT_DURABLY_CLAIMED", key: command.key, menuId: command.menuId });
            validate(); check(!held && !input.signal?.aborted);
            const resource={method:command.method,path:command.path,shopId:actor.binding.shopId,purpose:'CORE',
                ...(command.phase==='CREATE'?{creationOperationId:command.body.operationId}:{menuId:command.menuId,beforeVersion:command.body.expectedVersion})};
            const permit = cfg.sendBoundary ? await cfg.sendBoundary.authorize({id:`${scenario}_${command.key}_${command.phase}`,
                kind:command.phase === "CREATE" ? "MENU_CREATE" : "MENU_WRITE", owner:actor.binding.owner,resource}) : undefined;
            check(cfg.mode !== "APPROVED_MANAGED_LIVE" || permit?.allowedForward === true);
            const url = target.origin + command.path, token = assertOidcClaims(actor.access.token(), now());
            if(cfg.sendBoundary?.consumeSendPermission)cfg.sendBoundary.consumeSendPermission({id:permit.id,resource});
            const response = await actor.context.request.fetch(url, { method: command.method, data: command.body,
                headers: scopedOidcHeaders(url, { "Content-Type": "application/json", Origin: target.origin }, token),
                maxRedirects: 0, maxRetries: 0, timeout: 20000, failOnStatusCode: false });
            check(response.status() < 300 || response.status() >= 400);
            const requestId = response.headers?.()["x-request-id"];
            await record({stage:"TRANSPORT_STATUS_" + command.phase,key:command.key,menuId:command.menuId,httpStatus:response.status(),requestId});
            return { status: () => response.status(), json: async () => {
                const body = await response.json();
                if (command.phase === "CREATE" && response.status() === 201 && /^c[a-z0-9]+$/.test(body?.id || "")) {
                    if (cfg.sendBoundary) await cfg.sendBoundary.recordCreated({operationId:permit.id,id:body.id});
                    check(!created.has(body.id) && ![target.anchor, "cmvs4x86o000vwn0w93c8ttez", "cmvs4x8wt000xwn0wj6gwdih1",
                        "cmvs4x986000zwn0wer2ymhow", "cmvuy8d4z0003jw07e9fobsdm", "cmvuzlqhf0003l308lem3uwck"].includes(body.id));
                    created.set(body.id, { key: command.key, owner: command.owner.owner, scenario });
                }
                return body;
            }, headerValue: async key => key.toLowerCase() === "x-request-id" ? requestId : null };
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
        check(managedReady && !held && !serviceActive&&!finalizationStarted); validate();
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
    return { prepareServiceObservation,
    createdFixtures:()=>[...created].map(([menuId,data])=>({menuId,...data})),
    async cleanupKnownPrivate(){
        check(managedReady&&!held&&!serviceActive&&!finalizationStarted&&!cleanupStarted);cleanupStarted=true;const verifiedPrivateIds=[],final=[];
        try {
            for(const [menuId,data] of created){
                check(["T2","T3","T4"].includes(data.scenario));const actor=actors.get(data.owner);
                await verifyActor(actor.binding);const response=await readProtected(actor,"/api/admin/menus/"+menuId);
                check(response.status()===200);const before=(await response.json())?.menu;check(before?.id===menuId);
                let after=before;
                if(before.isPublished){const ledger=newWriteLedger(),op=beginWrite(ledger,"CLEANUP");op.state="IN_FLIGHT";
                    const changed=await send(data.scenario,{key:data.key,owner:actor.binding,menuId,phase:"CLEANUP",method:"POST",
                        path:`/api/admin/menus/${menuId}/stop`,body:{expectedVersion:before.version}});
                    const parsed=await consumeWriteResponse(ledger,op,changed,menuId);confirmWrite(ledger,op);
                    const read=await readProtected(actor,"/api/admin/menus/"+menuId);check(read.status()===200);after=(await read.json())?.menu;
                    check(after?.id===menuId&&after.version===parsed.menu.version&&after.version>before.version&&after.foodVersion===before.foodVersion);
                }
                check(after.isPublished===false);verifiedPrivateIds.push(menuId);final.push(state(after));
                await record({stage:"FINAL_PRIVATE_HISTORY_RETAINED",key:data.key,menuId,version:after.version});
            }
            return {verifiedPrivateIds,final,unknownWrite:false};
        }catch{held=true;refused();}
    },async finalizeActors(){
        check(!finalizationStarted&&!serviceActive);finalizationStarted=true;managedReady=false;
        const list=[...actors.values()];
        if(list.some(a=>!a.lifecycle?.browser||typeof a.lifecycle?.tracker?.drain!=='function'||typeof a.lifecycle?.tracker?.snapshot!=='function'||!ownedCiActorBoundary({access:a.access,page:a.page,
            context:a.context,browser:a.lifecycle.browser,expectedOwnerId:a.expectedUserId,drainRoutes:()=>a.lifecycle.tracker.drain(),readRouteState:()=>a.lifecycle.tracker.snapshot()},true))||
            new Set(list.map(a=>a.lifecycle.browser)).size!==2){held=true;return {status:'ACTOR_FINALIZATION_HELD_NO_OPERATION',actors:[]};}
        const results=[];
        for(const actor of list){const result=await finalizeOwnedCiActor({access:actor.access,page:actor.page,context:actor.context,
            browser:actor.lifecycle.browser,expectedOwnerId:actor.expectedUserId,drainRoutes:()=>actor.lifecycle.tracker.drain(),
            readRouteState:()=>actor.lifecycle.tracker.snapshot(),
            attempts:{contextCreateAttempted:true,browserLaunchAttempted:true},onStage:actor.lifecycle.onStage});
            results.push({owner:actor.binding.owner,result});if(!result.complete)held=true;
        }
        return {status:results.every(r=>r.result.complete)?'OWNED_ACTORS_FINISHED_NOT_LIVE_PASS':'ACTOR_FINALIZATION_UNVERIFIED',actors:results};
    },async execute() {
        check(!used&&!finalizationStarted); used = true;
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
                journal=undefined;
            }
        }
        if (held) report.status = "MANAGED_HOLD_NO_FURTHER_WRITES";
        managedReady = !held && report.status === "MANAGED_ADAPTER_SEQUENCE_CONFIRMED_NOT_LIVE_PASS";
        return report;
    } };
}

// Existing managed transport adapter. It never authenticates or opens a browser.
// The caller supplies the two already verified, tracked owned actors.
export function createManagedRuntimePorts({actors,batchInput,claimDirectory,t1FixtureId,record=()=>{},operation='CORE',checkpointFixtures=[],serviceConfig=undefined,resumeCheckpoint=undefined}) {
    const roles=new Map(actors.map(a=>[a.binding.owner,a]));
    assert.ok(['CORE','SERVICE_ARM','RESUME_CORE'].includes(operation));assert.equal(roles.size,operation==='SERVICE_ARM'?1:2);assert.ok(roles.has('S1')&&(operation==='SERVICE_ARM'||roles.has('S2')));
    for(const [role,a] of roles){assert.equal(a.expectedUserId,managedActorIdentity[role].ownerId);assert.equal(a.binding.shopId,managedActorIdentity[role].shopId);}
    const source=createRequire(import.meta.url)('tsx/cjs/api').require('./issue118-batch-stop.ts',import.meta.url);
    const schemas=createRequire(import.meta.url)('tsx/cjs/api').require('../features/admin/menus/schemas/menu-response.ts',import.meta.url);
    const known=new Map([[t1FixtureId,{id:t1FixtureId,owner:'S1'}]]),operations=[];
    const serviceIds=new Set(),knownObjects=new Map();
    if(operation!=='CORE')for(const f of checkpointFixtures){assert.match(f.id,/^c[a-z0-9]+$/);assert.ok(['S1','S2'].includes(f.owner));known.set(f.id,{...f});}
    // This fixed interrupted run is a different entry contract from a fresh core.
    // Merely supplying its ports cannot grant an approval, authenticate, or dispatch.
    const recoveryBinding={
        cmvzk8bru0001l608a2gjmewc:['T2','M01','S1'],cmvzk905d0009l608790fkj9u:['T2','M02','S1'],
        cmvzk9mbm000hl6085xpcrgm6:['T2','M03','S1'],cmvzka8kt000pl608yugd9vi3:['T2','M04','S1'],
        cmvzkaueq000xl6086shu6i7o:['T2','M05','S2'],cmvzkbgd80015l6089s4spnqg:['T2','M06','S2'],
        cmvzkc2u5001dl6089rwngm8c:['T2','M07','S2'],cmvzkcoq3001ll608iv8ekwxk:['T2','M08','S2'],
        cmvzkk6r9002pl608yc64yz0m:['T3','M01','S1'],cmvzkkvde002xl608mxvyjpda:['T3','M02','S1'],
    };
    if(operation==='RESUME_CORE'){
        assert.equal(t1FixtureId,'cmvziwd1k0001js07pqfoctkr');assert.ok(checkpointFixtures.length>=11&&checkpointFixtures.length<=32);
        if(!resumeCheckpoint)assert.equal(checkpointFixtures.length,11);
        assert.equal(new Set(checkpointFixtures.map(f=>f.id)).size,checkpointFixtures.length);
        assert.ok([t1FixtureId,...Object.keys(recoveryBinding)].every(id=>checkpointFixtures.some(f=>f.id===id)));
        for(const f of checkpointFixtures){if(f.id===t1FixtureId){assert.equal(f.owner,'S1');continue;}
            if(recoveryBinding[f.id])assert.deepEqual([f.scenario,f.key,f.owner],recoveryBinding[f.id]);else assert.ok(resumeCheckpoint);}
    }
    if(resumeCheckpoint){
        assert.ok(operation!=='CORE'&&Object.keys(resumeCheckpoint).length===3
            &&['knownFixtures','newClaims','terminalCreationBindings'].every(k=>Object.hasOwn(resumeCheckpoint,k)));
        const restored=resumeCheckpoint.knownFixtures,claims=resumeCheckpoint.newClaims,terminalBindings=resumeCheckpoint.terminalCreationBindings;
        assert.ok(Array.isArray(restored)&&restored.length>=11&&restored.length<=32&&new Set(restored.map(f=>f.id)).size===restored.length);
        assert.ok(Array.isArray(claims)&&claims.length<=180&&new Set(claims.map(c=>c.id)).size===claims.length&&Array.isArray(terminalBindings));
        const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
        const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
        const creations=claims.filter(c=>c.kind==='MENU_CREATE'&&c.createdId!==undefined),usedOperations=new Set();
        assert.equal(new Set(creations.map(c=>c.createdId)).size,creations.length);
        assert.equal(new Set(terminalBindings.map(b=>b.operationId)).size,terminalBindings.length);
        const fixed=new Set([t1FixtureId,...Object.keys(recoveryBinding)]);
        for(const f of restored){
            assert.match(f.id,/^c[a-z0-9]+$/);assert.ok(['S1','S2'].includes(f.owner));
            if(fixed.has(f.id)){
                assert.equal(f.owner,f.id===t1FixtureId?'S1':recoveryBinding[f.id][2]);
                if(f.id!==t1FixtureId)assert.deepEqual([f.scenario,f.key],recoveryBinding[f.id].slice(0,2));continue;
            }
            assert.ok(![target.anchor,readCloseFixtureId,'cmvs4x86o000vwn0w93c8ttez','cmvs4x8wt000xwn0wj6gwdih1',
                'cmvs4x986000zwn0wer2ymhow','cmvuy8d4z0003jw07e9fobsdm','cmvuzlqhf0003l308lem3uwck'].includes(f.id));
            const c=creations.find(c=>c.createdId===f.id);assert.ok(c&&c.owner===f.owner);
            assert.equal(c.resource?.method,'POST');assert.equal(c.resource.path,'/api/admin/menus');
            assert.equal(c.resource.shopId,managedActorIdentity[f.owner].shopId);
            assert.match(c.resource.creationOperationId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
            assert.ok(!usedOperations.has(c.resource.creationOperationId));usedOperations.add(c.resource.creationOperationId);
            if(c.state!=='CONFIRMED_RESPONSE_AND_READBACK'){
                assert.equal(c.state,'FORWARD_CONSUMED');assert.match(c.arm,/^RESUME_SERVICE_[1-6]$/);
                const binding=terminalBindings.find(b=>b.operationId===c.id);
                assert.ok(binding&&Object.keys(binding).length===6&&['id','operationId','creationOperationId','owner','armId','resourcesSha256'].every(k=>Object.hasOwn(binding,k)));
                assert.equal(binding.id,c.createdId);assert.equal(binding.creationOperationId,c.resource.creationOperationId);
                assert.equal(binding.owner,c.owner);assert.equal(binding.armId,c.arm);
                const armClaims=claims.filter(value=>value.arm===c.arm).map(value=>({operationId:value.id,kind:value.kind,mode:value.mode,owner:value.owner,resource:value.resource}));
                assert.equal(binding.resourcesSha256,hash(armClaims));
            }
            const fromT3=/^RESUME414953_T3_(M0[3-8])_CREATE$/.exec(c.id);
            if(fromT3)assert.equal(f.owner,Number(fromT3[1].slice(1))<=4?'S1':'S2');
            const scenario=fromT3?'T3':f.scenario,key=fromT3?fromT3[1]:f.key;
            known.set(f.id,{id:f.id,owner:f.owner,zone:f.zone,...(scenario?{scenario}:{}),...(key?{key}:{}),creationOperationId:c.resource.creationOperationId});
            if(f.owner==='S1'&&(f.zone==='SERVICE'||c.cellId))serviceIds.add(f.id);
        }
        assert.ok([...fixed].every(id=>restored.some(f=>f.id===id)));
        assert.ok(creations.every(c=>!fixed.has(c.createdId)&&restored.some(f=>f.id===c.createdId)));
        assert.ok(terminalBindings.every(b=>creations.some(c=>c.id===b.operationId&&['FORWARD_CONSUMED','CONFIRMED_RESPONSE_AND_READBACK'].includes(c.state))));
        assert.ok(checkpointFixtures.every(f=>restored.some(r=>r.id===f.id&&r.owner===f.owner)));
    }
    let boundary,managed,batchResult,held=false;
    const requireOpen=()=>assert.equal(held,false);
    const event=value=>{record({...value,observedUtc:new Date().toISOString()});};
    const claim=(name,value)=>{let fd;try{assert.match(name,/^[A-Za-z0-9_-]{1,160}$/);mkdirSync(claimDirectory,{recursive:true});
        fd=openSync(join(claimDirectory,name+'.json'),'wx',0o600);writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);return true;
    }catch{held=true;return false;}finally{if(fd!==undefined)closeSync(fd);}};
    const actor=role=>{requireOpen();const a=roles.get(role);assert.ok(a);return a;};
    const verify=async role=>{const a=actor(role);const identity=await a.page.evaluate(()=>({id:window.Clerk?.user?.id,pk:window.Clerk?.publishableKey}));
        assert.equal(identity.id,a.expectedUserId);assertClerkPublishableKey(identity.pk);const r=await a.access.read(a.context.request,target.origin+'/api/admin/shop');
        assert.equal(r.status(),200);assert.equal((await r.json())?.shop?.id,a.binding.shopId);return a;};
    const read=async(id,role)=>{assert.match(id,/^c[a-z0-9]+$/);assert.equal(known.get(id)?.owner,role);const a=await verify(role);
        const r=await a.access.read(a.context.request,target.origin+'/api/admin/menus/'+id);assert.equal(r.status(),200);
        const m=schemas.savedMenuResponseSchema.parse(await r.json()).menu;assert.equal(m.id,id);return m;};
    const write=async(id,role,phase,method,path,body,scope,uiCommand)=>{
        requireOpen();const a=await verify(role);assert.ok(boundary);const creation=phase==='CREATE';
        if(scope){assert.equal(role,'S1');assert.ok(['SETUP_CREATE','SETUP_PUBLISH','FOLLOWUP_PUBLISH','CLEANUP'].includes(scope.purpose));
            assert.match(scope.cellId,/^(MENU_CREATE|MENU_SAVE|STOP|MENU_UPLOAD|SHOP_SAVE|SHOP_UPLOAD)_(DELIVER|BLOCK_BEFORE_FORWARD|WITHHOLD_AFTER_RESPONSE)$/);
            assert.ok(Object.keys(scope).every(k=>['cellId','purpose','evidence'].includes(k)));if(!creation)assert.ok(serviceIds.has(body.__menuId));}
        if(creation){assert.equal(method,'POST');assert.equal(path,'/api/admin/menus');assert.equal(body.isPublished,false);assert.match(body.operationId,/^[0-9a-f-]{36}$/);}
        else {assert.ok(['PUBLISH','SAVE','STOP'].includes(phase));assert.equal(method,phase==='STOP'?'POST':'PUT');
            assert.ok(Number.isSafeInteger(body.expectedVersion)&&body.expectedVersion>=0);assert.equal(known.get(body.__menuId)?.owner,role);assert.equal(path,`/api/admin/menus/${body.__menuId}${phase==='STOP'?'/stop':''}`);}
        const data={...body};delete data.__menuId;
        const resource={method,path,shopId:a.binding.shopId,purpose:scope?.purpose||'CORE',...(scope?.evidence?{evidence:structuredClone(scope.evidence)}:{}),
            ...(creation?{creationOperationId:data.operationId}:{menuId:body.__menuId,beforeVersion:data.expectedVersion})};
        const permit=await boundary.authorize({id,kind:creation?'MENU_CREATE':'MENU_WRITE',owner:role,resource,...(scope?{cellId:scope.cellId,mode:'DELIVER'}:{})});
        assert.equal(permit.allowedForward,true);const op={id,owner:role,phase,state:'INTENT',startedUtc:new Date().toISOString(),...(creation?{creationOperationId:data.operationId}:{menuId:body.__menuId})};operations.push(op);event({stage:'SUITE_WRITE_INTENT',operation:id,owner:role,phase});
        try {const url=target.origin+path;op.state='REQUEST_SENT';if(!uiCommand)boundary.consumeSendPermission({id:permit.id,resource});const r=uiCommand?await (await import('./issue118-t2-reobserve.mjs')).dispatchT2Ui({actor:a,command:uiCommand,data,permit,resource,boundary,verify:()=>verify(role)}):await a.context.request.fetch(url,{method,data,
            headers:scopedOidcHeaders(url,{'Content-Type':'application/json',Origin:target.origin},assertOidcClaims(a.access.token())),
            maxRedirects:0,maxRetries:0,timeout:20000,failOnStatusCode:false});op.status=r.status();
            const requestId=r.headers()['x-request-id'];if(typeof requestId==='string'&&/^[0-9a-f-]{36}$/i.test(requestId))op.requestId=requestId;
            const raw=await r.json();if(creation&&r.status()===201&&/^c[a-z0-9]+$/.test(raw?.id||'')){
                op.menuId=raw.id;assert.ok(!known.has(raw.id)&&![target.anchor,readCloseFixtureId,'cmvs4x86o000vwn0w93c8ttez','cmvs4x8wt000xwn0wj6gwdih1','cmvs4x986000zwn0wer2ymhow','cmvuy8d4z0003jw07e9fobsdm','cmvuzlqhf0003l308lem3uwck'].includes(raw.id));
                known.set(raw.id,{id:raw.id,owner:role});if(scope)serviceIds.add(raw.id);await boundary.recordCreated({operationId:permit.id,id:raw.id});event({stage:'SUITE_CREATED_ID',operation:id,owner:role,menuId:raw.id});}
            assert.equal(r.status(),creation?201:200);
            if(creation)schemas.menuCreateResponseSchema.parse(raw);
            else if(phase==='STOP'){assert.equal(raw?.ok,true);assert.equal(raw?.menu?.id,body.__menuId);
                assert.equal(raw.menu.isPublished,false);assert.ok(Number.isSafeInteger(raw.menu.version)&&raw.menu.version>=0);}
            else schemas.menuSaveResponseSchema.parse(raw);
            op.state='RESPONSE_CONFIRMED';op.acknowledgedUtc=new Date().toISOString();event({stage:'SUITE_WRITE_CONFIRMED',...op});
            const menu=await read(creation?raw.id:body.__menuId,role);
            if(phase==='STOP'){assert.equal(menu.id,raw.menu.id);assert.equal(menu.version,raw.menu.version);assert.equal(menu.isPublished,false);}
            if(creation){assert.equal(menu.name,data.name);assert.equal(menu.isPublished,false);assert.deepEqual(source.fixturePayload(menu),source.fixturePayload({...data,allergens:Object.entries(data.allergenStatusBySlug).map(([slug,status])=>({slug,status}))}));}
            return {raw,menu};
        }catch{held=true;op.state='HOLD_NO_FURTHER_WRITES';event({stage:'SUITE_WRITE_HELD',operation:id,owner:role,phase,...(op.menuId?{menuId:op.menuId}:{})});throw Error('MANAGED_BROWSER_PORT_HELD');}
    };
    const cleanup=async(id,role,key)=>{const before=await read(id,role);if(before.isPublished){const {menu:after}=await write(key,role,'STOP','POST',`/api/admin/menus/${id}/stop`,{__menuId:id,expectedVersion:before.version});
        assert.equal(after.isPublished,false);assert.equal(after.foodVersion,before.foodVersion);}assert.equal((await read(id,role)).isPublished,false);};
    const ports={
        claimSuite:async value=>claim('suite',value),claimOperation:async value=>claim('operation-'+value.id,value),
        async installSendGuard(value){assert.equal(boundary,undefined);boundary=value;if(batchInput)batchInput.managed.sendBoundary=value;
            return {beforeSend:true,remove:async()=>{assert.equal(boundary,value);boundary=undefined;return true;}};},
        prepareBatch(input){managed=prepareOriginalBatchRun(input);return {execute:async()=>{batchResult=await managed.execute();
            for(const f of managed.createdFixtures())known.set(f.menuId,{id:f.menuId,owner:f.owner,key:f.key,scenario:f.scenario});return batchResult;}};},
        async runControls({runId:fixedRunId}={}){
            const cases=[['PRICE','M04','S1'],['STOP','M07','S2'],['SILENT','M08','S2']];const measured={};
            if(fixedRunId!==undefined)assert.match(fixedRunId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
            for(const [kind,key,role] of cases){const runId=fixedRunId||randomUUID(),payload=source.projectOriginalPayloads(runId).expectedByMenu[key];
                const created=await write('CONTROL_'+kind+'_CREATE',role,'CREATE','POST','/api/admin/menus',{...payload,isPublished:false,operationId:randomUUID()});
                const id=created.menu.id;const published=(await write('CONTROL_'+kind+'_PUBLISH',role,'PUBLISH','PUT',`/api/admin/menus/${id}`,{__menuId:id,expectedVersion:created.menu.version,publicationAction:'publish'})).menu;
                assert.equal(published.isPublished,true);const food=published.foodVersion;
                if(kind==='PRICE'){const changed=(await write('CONTROL_PRICE_ONLY',role,'SAVE','PUT',`/api/admin/menus/${id}`,{__menuId:id,expectedVersion:published.version,priceYen:801})).menu;
                    assert.equal(changed.priceYen,801);assert.equal(changed.foodVersion,food);assert.equal(changed.isPublished,true);measured.priceFoodVersionUnchanged=true;}
                if(kind==='STOP'){await cleanup(id,role,'CONTROL_STOP_ONLY');assert.equal((await read(id,role)).foodVersion,food);measured.stopFoodVersionUnchanged=true;}
                if(kind==='SILENT'){const after=await read(id,role);assert.equal(after.isPublished,true);assert.equal(after.version,published.version);measured.noSignalAutomaticStops=0;measured.noSignalRequiredStopDenominator=0;}
                if(kind!=='STOP')await cleanup(id,role,'CONTROL_'+kind+'_FINAL_PRIVATE');
            }
            return measured;
        },
        async runDenials({authorize,fixtures}){
            for(const f of fixtures)if(!known.has(f.id))known.set(f.id,f);
            const sample=role=>fixtures.find(f=>f.owner===role&&f.id!==t1FixtureId);
            let crossOwnerRefusals=0,staleVersionConflicts=0;
            for(const caller of ['S1','S2']){const owner=caller==='S1'?'S2':'S1',f=sample(owner);assert.ok(f);const before=await read(f.id,owner);
                for(const [label,method,suffix,data] of [['GET','GET','',undefined],['SAVE','PUT','',{expectedVersion:before.version,priceYen:802}],
                    ['STOP','POST','/stop',{expectedVersion:before.version}],['PUBLISH','PUT','',{expectedVersion:before.version,publicationAction:'publish'}]]){
                    const resource={method,path:'/api/admin/menus/'+f.id+suffix,menuId:f.id,shopId:roles.get(owner).binding.shopId,
                        purpose:'CROSS_OWNER_'+({SAVE:'EDIT',GET:'GET',STOP:'STOP',PUBLISH:'PUBLISH'})[label],...(method==='GET'?{}:{beforeVersion:before.version})};
                    const permit=await authorize({id:'DENIAL_'+caller+'_'+label,kind:'DENIAL',owner:caller,resource});const a=await verify(caller),url=target.origin+resource.path;
                    boundary.consumeSendPermission({id:permit.id,resource});
                    const r=await a.context.request.fetch(url,{method,...(data?{data}:{}),headers:scopedOidcHeaders(url,{'Content-Type':'application/json',Origin:target.origin},assertOidcClaims(a.access.token())),maxRedirects:0,maxRetries:0,timeout:20000,failOnStatusCode:false});
                    assert.equal(r.status(),404);assert.deepEqual(await read(f.id,owner),before);crossOwnerRefusals++;event({stage:'CROSS_OWNER_REFUSED',owner:caller,menuId:f.id,status:404,operation:label});
                }
            }
            for(const role of ['S1','S2']){const f=[...known.values()].find(f=>f.owner===role&&f.scenario==='T3'&&['M01','M05'].includes(f.key));assert.ok(f);
                const before=await read(f.id,role);assert.equal(before.isPublished,false);assert.ok(before.version>0);
                const resource={method:'PUT',path:'/api/admin/menus/'+f.id,menuId:f.id,shopId:roles.get(role).binding.shopId,purpose:'STALE_EDIT',beforeVersion:before.version-1};
                const permit=await authorize({id:'STALE_'+role,kind:'DENIAL',owner:role,resource});
                const a=await verify(role),url=target.origin+'/api/admin/menus/'+f.id;
                boundary.consumeSendPermission({id:permit.id,resource});
                const r=await a.context.request.fetch(url,{method:'PUT',data:{expectedVersion:before.version-1,priceYen:803},headers:scopedOidcHeaders(url,{'Content-Type':'application/json',Origin:target.origin},assertOidcClaims(a.access.token())),maxRedirects:0,maxRetries:0,timeout:20000,failOnStatusCode:false});
                assert.equal(r.status(),409);assert.deepEqual(await read(f.id,role),before);staleVersionConflicts++;event({stage:'STOP_STALE_VERSION_REFUSED',owner:role,menuId:f.id,status:409});
            }
            return {crossOwnerRefusals,staleVersionConflicts,routeContractChecked:true,ownerStateUnchanged:true,historyObservation:'PENDING_INDEPENDENT_SQL'};
        },
        async cleanupKnownPrivate({fixtures}){requireOpen();const batch=await managed.cleanupKnownPrivate();assert.equal(batch.unknownWrite,false);
            const ids=[];for(const f of fixtures){assert.equal((await read(f.id,f.owner)).isPublished,false);ids.push(f.id);}return {verifiedPrivateIds:ids,unknownWrite:false};},
    };
    const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)
        ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
    const sha=value=>createHash('sha256').update(value).digest('hex');
    const serviceGuard=async action=>{try{requireOpen();assert.ok(boundary);return await action();}
        catch{held=true;throw Error('MANAGED_SERVICE_API_HELD');}};
    const requireServiceId=id=>{assert.match(id,/^c[a-z0-9]+$/);assert.ok(serviceIds.has(id));assert.equal(known.get(id)?.owner,'S1');};
    const validNewId=id=>{assert.match(id,/^c[a-z0-9]+$/);assert.ok(!known.has(id)&&![target.anchor,readCloseFixtureId,
        'cmvs4x86o000vwn0w93c8ttez','cmvs4x8wt000xwn0wj6gwdih1','cmvs4x986000zwn0wer2ymhow',
        'cmvuy8d4z0003jw07e9fobsdm','cmvuzlqhf0003l308lem3uwck'].includes(id));};
    const blobUrl=(url,kind)=>{const parsed=new URL(url);assert.equal(parsed.href,url);
        assert.equal(parsed.origin,'https://wtqdbklmg3bbqk4s.public.blob.vercel-storage.com');
        assert.ok(!parsed.username&&!parsed.password&&!parsed.port&&!parsed.search&&!parsed.hash&&!parsed.pathname.includes('%'));
        const prefix=kind==='menu'?`/menu-images/${target.shop}/`:`/shops/${target.shop}/`;
        assert.ok(parsed.pathname.startsWith(prefix));const filename=parsed.pathname.slice(prefix.length);
        assert.match(filename,kind==='menu'?/^[A-Za-z0-9_-]+\.(?:jpe?g|png|webp|gif|avif)$/i:/^cover-[A-Za-z0-9_-]+\.(?:jpe?g|png|webp|gif|avif)$/i);return parsed;};
    const shopSchemas=createRequire(import.meta.url)('tsx/cjs/api').require('../features/admin/shop/schemas/shop-response.ts',import.meta.url);
    const readShop=()=>serviceGuard(async()=>{const a=await verify('S1'),r=await a.access.read(a.context.request,target.origin+'/api/admin/shop');
        assert.equal(r.status(),200);const shop=shopSchemas.shopResponseSchema.parse(await r.json()).shop;assert.equal(shop.id,target.shop);return shop;});
    const readMenu=id=>serviceGuard(async()=>{requireServiceId(id);return read(id,'S1');});
    const readCreationBaseline=()=>serviceGuard(async()=>{const a=await verify('S1'),r=await a.access.read(a.context.request,target.origin+'/api/admin/menus');
        assert.equal(r.status(),200);const body=await r.json();assert.ok(Array.isArray(body?.menus)&&body.menus.length<=1000);
        const menus=body.menus.map(m=>{assert.match(m.id,/^c[a-z0-9]+$/);assert.ok(Number.isSafeInteger(m.version)&&m.version>=0);
            assert.equal(typeof m.name,'string');assert.equal(typeof m.isPublished,'boolean');assert.ok(Number.isFinite(Date.parse(m.updatedAt)));
            return {id:m.id,name:m.name,version:m.version,isPublished:m.isPublished,updatedAt:m.updatedAt};});
        assert.equal(new Set(menus.map(m=>m.id)).size,menus.length);return {menus:menus.sort((a,b)=>a.id.localeCompare(b.id))};});
    const observeKnownBlob=ref=>serviceGuard(async()=>{
        assert.ok(ref&&['menu','shop'].includes(ref.kind));const parsed=blobUrl(ref.url,ref.kind);assert.equal(parsed.pathname,'/'+ref.pathname);
        assert.equal(ref.objectSha256,sha(ref.url));assert.match(ref.requestId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        const prior=knownObjects.get(ref.url);if(prior){assert.equal(prior.requestId,ref.requestId);return {...prior.observation};}
        const a=await verify('S1'),r=await a.context.request.fetch(ref.url,{method:'GET',maxRedirects:0,maxRetries:0,timeout:20000,failOnStatusCode:false});
        assert.equal(r.status(),200);const length=r.headers?.()['content-length'];if(length!==undefined)assert.equal(Number(length),1904984);
        const bytes=await r.body();assert.ok(Buffer.isBuffer(bytes));assert.equal(bytes.length,1904984);
        const hash=sha(bytes);assert.equal(hash,'0dd35a26a11cd90536b1610ce8d5d04bd6933b456602264d53f209a58e83add6');
        const observation={status:200,sha256:hash,bytes:bytes.length};knownObjects.set(ref.url,{requestId:ref.requestId,observation});
        event({stage:'SERVICE_KNOWN_BLOB_BYTES_VERIFIED',objectSha256:ref.objectSha256});return {...observation};});
    const registerCreated=({menuId,operationId})=>serviceGuard(async()=>{
        validNewId(menuId);assert.match(operationId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        known.set(menuId,{id:menuId,owner:'S1',creationOperationId:operationId});serviceIds.add(menuId);
        assert.equal(claim('service-created-'+menuId,{menuId,operationId}),true);return true;});
    const serviceApi={readMenu,readShop,readCreationBaseline,registerCreated,observeKnownBlob,
        verifyActor:actor=>serviceGuard(async()=>{const a=await verify('S1');if(actor){assert.equal(actor.context,a.context);assert.equal(actor.page,a.page);}return true;}),
        readOwner:({kind,menuId})=>kind==='MENU_CREATE'&&!menuId?readCreationBaseline():kind.startsWith('SHOP')?readShop():readMenu(menuId),
        claimPrivate:ref=>serviceGuard(async()=>{
            if(ref.stage==='CREATED_201_BEFORE_CORRELATION')return registerCreated({menuId:ref.menuId,operationId:ref.operationId});
            assert.equal(ref.stage,'KNOWN_RUN_BLOB_RETAIN');await observeKnownBlob(ref);
            assert.equal(claim('service-blob-'+ref.objectSha256,{kind:ref.kind,pathname:ref.pathname,objectSha256:ref.objectSha256,requestId:ref.requestId}),true);return true;}),
        createMenu:({id,cellId,purpose,payload})=>serviceGuard(async()=>{
            assert.equal(purpose,'SETUP_CREATE');const {menu}=await write(id,'S1','CREATE','POST','/api/admin/menus',payload,{cellId,purpose});return menu;}),
        menuWrite:({id,cellId,purpose,menuId,publicationAction,evidence})=>serviceGuard(async()=>{
            requireServiceId(menuId);assert.ok(['publish','stop'].includes(publicationAction));const before=await readMenu(menuId);
            assert.equal(before.isPublished,publicationAction==='stop');
            assert.ok(evidence&&['knownOutcome','ownerStateMatches','freshVersion'].every(k=>evidence[k]===true));
            const stopping=publicationAction==='stop';const {menu}=await write(id,'S1',stopping?'STOP':'PUBLISH',stopping?'POST':'PUT',
                `/api/admin/menus/${menuId}${stopping?'/stop':''}`,{__menuId:menuId,expectedVersion:before.version,...(!stopping?{publicationAction:'publish'}:{})},
                {cellId,purpose,evidence});assert.equal(menu.foodVersion,before.foodVersion);assert.equal(menu.version,before.version+(stopping?1:3));
            assert.deepEqual(source.fixturePayload(menu),source.fixturePayload(before));assert.equal(menu.isPublished,!stopping);return menu;}),
        verifyPublicImage:({menuId,url})=>serviceGuard(async()=>{
            requireServiceId(menuId);blobUrl(url,'menu');assert.ok(knownObjects.has(url));const own=await readMenu(menuId);
            assert.equal(own.isPublished,true);assert.equal(own.imageUrl,url);const a=await verify('S1');
            const r=await a.access.read(a.context.request,target.origin+'/api/menus/'+menuId);assert.equal(r.status(),200);const body=await r.json();
            assert.equal(body?.menu?.id,menuId);assert.equal(body.menu.shopId,target.shop);assert.equal(body.menu.imageUrl,url);return true;}),
        shopWrite:input=>serviceGuard(async()=>{
            const {id,cellId,purpose,sourceClaimId,before,values,expectedOwnAfter,evidence}=input;
            assert.ok(['RESTORE','RESTORE_PRIOR_SHOP'].includes(purpose));assert.ok(values&&Object.keys(values).length===2&&Object.keys(values).every(k=>['note','coverImageUrl'].includes(k)));
            assert.ok(values.note===null||typeof values.note==='string');assert.ok(values.coverImageUrl===null||typeof values.coverImageUrl==='string');
            if(values.coverImageUrl!==null)blobUrl(values.coverImageUrl,'shop');
            const expected=shopSchemas.shopResponseSchema.parse({shop:expectedOwnAfter}).shop;
            assert.equal(expected.id,target.shop);assert.deepEqual(before,expected);const fresh=await readShop();assert.equal(sha(canonical(fresh)),sha(canonical(expected)));
            const proof=['knownOutcome','ownerStateMatches','freshUpdatedAt','ownChangeMatches','noConcurrentChange',...(purpose==='RESTORE_PRIOR_SHOP'?['independentTerminalVerified']:[])];
            assert.ok(evidence&&proof.every(k=>evidence[k]===true));
            const {expectedServiceShopPayload}=await import('./issue118-managed-service-browser.mjs');const data=expectedServiceShopPayload(fresh,values);
            const resource={method:'PUT',path:'/api/admin/shop',shopId:target.shop,purpose,beforeUpdatedAt:fresh.updatedAt,evidence:structuredClone(evidence),
                ...(sourceClaimId?{sourceClaimId}:{})};assert.ok(boundary);const a=await verify('S1');
            const permit=await boundary.authorize({id,kind:'SHOP_WRITE',owner:'S1',mode:'DELIVER',resource,...(cellId?{cellId}:{})});assert.equal(permit.allowedForward,true);
            const op={id,owner:'S1',phase:purpose,state:'INTENT',startedUtc:new Date().toISOString()};operations.push(op);
            const url=target.origin+resource.path;boundary.consumeSendPermission({id:permit.id,resource});op.state='REQUEST_SENT';
            try{const r=await a.context.request.fetch(url,{method:'PUT',data,headers:scopedOidcHeaders(url,{'Content-Type':'application/json',Origin:target.origin},assertOidcClaims(a.access.token())),
                maxRedirects:0,maxRetries:0,timeout:20000,failOnStatusCode:false});assert.equal(r.status(),200);
                const parsed=shopSchemas.parseShopSaveResponse(await r.json(),target.shop,fresh.updatedAt);assert.ok(parsed);const after=await readShop();assert.deepEqual(after,parsed.shop);
                const stable=shop=>{const copy={...shop};delete copy.note;delete copy.coverImageUrl;delete copy.updatedAt;return copy;};assert.deepEqual(stable(after),stable(fresh));
                assert.equal(after.note??'',(values.note??'').trim());assert.equal(after.coverImageUrl,values.coverImageUrl);op.state='RESPONSE_CONFIRMED';
                event({stage:'SERVICE_SHOP_RESTORE_CONFIRMED',operation:id});return after;
            }catch{op.state='HOLD_NO_FURTHER_WRITES';throw Error('MANAGED_SERVICE_SHOP_HELD');}
        }),
    };
    // No CLI/workflow uses this port set. The resume controller must first verify
    // a new explicit approval and independent checkpoint, and install its guard.
    let serviceBrowser,servicePreparation,servicePages,serviceClosed=false;
    const createPermissions=new Map(),remainderStages=new Set();
    const ensureServiceBrowser=async()=>{
        requireOpen();assert.ok(boundary&&!serviceClosed);
        if(serviceBrowser)return serviceBrowser;
        assert.ok(serviceConfig&&Object.keys(serviceConfig).length===4&&['runId','identityReceipt','image','preparationState'].every(k=>Object.hasOwn(serviceConfig,k)));
        assert.match(serviceConfig.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        assertIdentityReceipt(serviceConfig.identityReceipt);
        const serviceModule=await import('./issue118-managed-service-browser.mjs'),a=await verify('S1');
        for(const key of ['origin','source','deployment'])assert.equal(serviceModule.serviceBrowserApplication[key],target[key]);
        assert.ok(Buffer.isBuffer(serviceConfig.image?.buffer));assert.equal(serviceConfig.image.buffer.length,serviceModule.serviceBrowserImage.bytes);
        assert.equal(sha(serviceConfig.image.buffer),serviceModule.serviceBrowserImage.sha256);
        assert.ok(serviceConfig.preparationState&&Object.getPrototypeOf(serviceConfig.preparationState)===Object.prototype);
        const ts=createRequire(import.meta.url)('tsx/cjs/api'),{ALLERGEN_MASTER}=ts.require('../lib/constants/allergen-master.ts',import.meta.url);
        servicePreparation=serviceModule.createManagedServicePreparation({api:serviceApi,state:serviceConfig.preparationState,runId:serviceConfig.runId,
            menuTemplate:source.projectOriginalPayloads(serviceConfig.runId).expectedByMenu.M04,allergens:ALLERGEN_MASTER,shopId:target.shop});
        const {prepareWriteObservation}=ts.require('./issue118-service-observer.ts',import.meta.url);
        servicePages=new Set(a.context.pages());
        serviceBrowser=serviceModule.prepareManagedServiceBrowser({actor:{...a,owner:'S1'},target,image:serviceConfig.image,
            scope:{runId:serviceConfig.runId,applicationSha:target.source,shopId:target.shop,
                isolationReceiptSha256:sha(JSON.stringify(serviceConfig.identityReceipt))},
            ports:{prepareCell:servicePreparation.prepareCell,finishCell:servicePreparation.finishCell,
                recordSetupObject:servicePreparation.recordSetupObject,retainHeldCell:servicePreparation.retainHeldCell,
                verifyActor:async(value,expected)=>{assert.equal(value.context,a.context);
                    for(const key of ['origin','source','deployment'])assert.equal(expected[key],target[key]);assert.equal(await serviceApi.verifyActor(value),true);},
                readOwner:value=>serviceApi.readOwner(value),claimPrivate:value=>serviceApi.claimPrivate(value),emit:event,
                oidcHeaders:(url,headers,token)=>scopedOidcHeaders(url,headers,assertOidcClaims(token)),prepareWriteObservation}});
        return serviceBrowser;
    };
    const serviceObservationPorts={
        async runServiceCellLazy(value){try{const browser=await ensureServiceBrowser(),result=await browser.runServiceCell(value);
            assert.notEqual(result?.status,'NOT_IMPLEMENTED');return result;}
            catch{held=true;throw Error('MANAGED_RECOVERY_SERVICE_HELD');}},
        async restorePriorShop(value){try{await ensureServiceBrowser();return await servicePreparation.restorePriorShop(value);}
            catch{held=true;throw Error('MANAGED_RECOVERY_SERVICE_RESTORE_HELD');}},
        async closeServiceBrowser(){
            serviceClosed=true;
            if(!serviceBrowser)return {ownedPageClosed:true,routesDrained:true,notStarted:true};
            try{const result=await serviceBrowser.close(),a=roles.get('S1');
                assert.equal(result.ownedPageClosed,true);assert.equal(result.routesDrained,true);
                assert.ok([...servicePages].every(p=>!p.isClosed())&&a.context.pages().every(p=>servicePages.has(p)||p.isClosed()));
                return {...result,preexistingPagesPreserved:true};
            }catch{held=true;throw Error('MANAGED_RECOVERY_SERVICE_CLOSE_HELD');}
        },
        closeServiceObservation(){return serviceObservationPorts.closeServiceBrowser();},
    };
    const resumePorts=operation!=='RESUME_CORE'?undefined:{
        readT2:({id,owner})=>read(id,owner),
        async writeT2({command,claim,resource,before}){
            try{requireOpen();const f=known.get(command.id);assert.equal(f?.scenario,'T2');assert.equal(f.key,command.key);assert.equal(f.owner,command.owner);
                const {t2ExpectedFood}=await import('./issue118-t2-reobserve.mjs');assert.equal(resource.menuId,command.id);assert.equal(resource.beforeVersion,before.version);
                assert.equal(claim.id,command.claimId);assert.equal(claim.kind,'MENU_WRITE');
                const body={__menuId:command.id,expectedVersion:before.version,...(command.kind==='PUBLISH'?{publicationAction:'publish'}:
                    command.kind==='SAVE'?{...t2ExpectedFood(command.key,command.phase==='CORRECT'),isPublished:false}:{})};
                const response=await write(claim.id,command.owner,command.kind,resource.method,resource.path,body,undefined,command.ui?command:undefined),op=operations.at(-1);
                return {status:op.status,requestId:op.requestId,menu:response.menu,uiObserved:command.ui};
            }catch{held=true;throw Error('MANAGED_T2_WRITE_HELD');}
        },
        async readT2Evidence(){requireOpen();const cards=[...source.originalEvidence('T2','START'),...source.originalEvidence('T2','RECIPE_LOOKUP'),...source.originalEvidence('T2','PHYSICAL_SOURCE_LOOKUP')];
            assert.deepEqual(cards.map(c=>c.id),['E21','E22','E23']);return {source:'ORIGINAL_T2_EVIDENCE',evidenceIds:cards.map(c=>c.id)};},
        async observeT2(args){try{return await (await import('./issue118-t2-reobserve.mjs')).observeT2RuntimePhase({...args,actors:roles,readOwner:read,verify});}
            catch{held=true;throw Error('MANAGED_T2_OBSERVATION_HELD');}},
        installSendGuard:ports.installSendGuard,claimOperation:ports.claimOperation,
        ...serviceObservationPorts,
        async verifyResourceBeforeForward({claim:pending}){
            try{requireOpen();assert.ok(boundary&&pending&&['S1','S2'].includes(pending.owner));
                const r=pending.resource;assert.ok(r&&typeof r==='object');
                if(pending.kind!=='DENIAL')assert.ok(r.shopId===undefined||r.shopId===managedActorIdentity[pending.owner].shopId);
                if(pending.kind==='MENU_CREATE'){
                    assert.equal(r.method,'POST');assert.equal(r.path,'/api/admin/menus');assert.match(r.creationOperationId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
                    assert.ok(!operations.some(o=>o.creationOperationId===r.creationOperationId)&&![...known.values()].some(f=>f.creationOperationId===r.creationOperationId));
                    const previous=createPermissions.get(r.creationOperationId);assert.ok(previous===undefined||previous===pending.id);
                    createPermissions.set(r.creationOperationId,pending.id);return {creationOperationFresh:true};
                }
                if(['MENU_WRITE','DENIAL'].includes(pending.kind)){
                    const owner=known.get(r.menuId)?.owner;assert.ok(owner&&(/^\/api\/admin\/menus\/[a-z0-9]+(?:\/stop)?$/).test(r.path));
                    assert.equal(r.path,'/api/admin/menus/'+r.menuId+(r.method==='POST'?'/stop':''));
                    if(r.shopId!==undefined)assert.equal(r.shopId,managedActorIdentity[owner].shopId);
                    if(pending.kind==='MENU_WRITE')assert.equal(owner,pending.owner);
                    return {menu:await read(r.menuId,owner)};
                }
                if(pending.kind==='SHOP_WRITE'){assert.equal(pending.owner,'S1');assert.equal(r.method,'PUT');assert.equal(r.path,'/api/admin/shop');return {shop:await readShop()};}
                if(pending.kind==='BLOB_UPLOAD'){assert.equal(pending.owner,'S1');assert.equal(r.method,'POST');
                    assert.ok(['/api/admin/upload-menu-image','/api/admin/upload-shop-image'].includes(r.path));return {uploadTargetValidated:true};}
                assert.equal(pending.kind,'SESSION');assert.equal(pending.owner,'S1');assert.equal(r.method,'NONE');assert.equal(r.path,'');return {sessionPermitOnly:true};
            }catch{held=true;throw Error('MANAGED_RECOVERY_PRE_SEND_HELD');}
        },
        async runT4({runId}={}){
            const report={status:'T4_HOLD_NO_FURTHER_WRITES',writesConfirmed:0,observation:null,ownedPagesClosed:false,
                preexistingPagesPreserved:false,database:'NOT_ATTESTED'};
            let observer,beforePages,a;
            try{
                requireOpen();assert.ok(boundary&&!remainderStages.has('T4'));remainderStages.add('T4');
                assert.match(runId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
                a=await verify('S1');const payload=source.projectOriginalPayloads(runId).expectedByMenu.M02;
                const created=await write('RESUME_T4_CREATE','S1','CREATE','POST','/api/admin/menus',{...payload,isPublished:false,operationId:randomUUID()});
                const id=created.menu.id;known.set(id,{id,owner:'S1',scenario:'T4',key:'M02'});report.fixtureId=id;report.writesConfirmed++;
                const published=(await write('RESUME_T4_INITIAL_PUBLISH','S1','PUBLISH','PUT','/api/admin/menus/'+id,
                    {__menuId:id,expectedVersion:created.menu.version,publicationAction:'publish'})).menu;
                assert.equal(published.isPublished,true);assert.deepEqual(source.fixturePayload(published),payload);
                assert.equal(published.foodVersion,created.menu.foodVersion);assert.equal(published.publicationConfirmedFoodVersion,published.foodVersion);report.writesConfirmed++;
                beforePages=new Set(a.context.pages());
                observer=await prepareT4Observation({context:a.context,fixture:{origin:target.origin,shopId:target.shop,menuId:id,name:payload.name},
                    assertReadTarget:()=>verify('S1'),evidenceLevel:'APP_BROWSER_READS_ONLY',readPublicApi:async url=>{
                        assert.equal(url,target.origin+'/api/menus/'+id);await verify('S1');
                        const r=await a.access.read(a.context.request,url),status=r.status();return {status,...(status===200?{menuId:(await r.json())?.menu?.id}:{})};
                    }});
                event({stage:'RESUME_T4_BASELINE_READY_BEFORE_STOP',menuId:id});
                const stopped=(await write('RESUME_T4_STOP','S1','STOP','POST','/api/admin/menus/'+id+'/stop',
                    {__menuId:id,expectedVersion:published.version})).menu;
                assert.equal(stopped.isPublished,false);assert.equal(stopped.foodVersion,published.foodVersion);
                assert.deepEqual(source.fixturePayload(stopped),payload);assert.equal(stopped.publicationConfirmedFoodVersion,published.publicationConfirmedFoodVersion);
                report.writesConfirmed++;report.observation=await observer.afterExternalChange();const o=report.observation;
                assert.equal(o.freshReadOutcome,'FRESH_READS_HIDE_TARGET');assert.equal(o.truncated,false);assert.equal(o.observationFailed,false);
                assert.equal(o.held.targetMatched,true);assert.equal(o.back.targetMatched,true);assert.equal(o.failedRefetch.injection,'ONE_DOCUMENT_GET_ABORTED_BEFORE_FORWARD');
                report.status='T4_STOP_API_AND_OBSERVATIONS_CONFIRMED_NOT_LIVE_PASS';
            }catch{held=true;}
            finally{
                try{if(observer)assert.equal((await observer.close()).allOwnedPagesClosed,true);
                    report.ownedPagesClosed=beforePages?!!observer&&a.context.pages().every(p=>beforePages.has(p)||p.isClosed()):true;
                    report.preexistingPagesPreserved=beforePages?[...beforePages].every(p=>!p.isClosed()):true;
                }catch{held=true;report.ownedPagesClosed=false;report.preexistingPagesPreserved=false;}
                if(!report.ownedPagesClosed||!report.preexistingPagesPreserved)held=true;
            }
            if(held)report.status='T4_HOLD_NO_FURTHER_WRITES';return report;
        },
        async runControls(input){try{requireOpen();assert.ok(boundary&&!remainderStages.has('CONTROLS'));remainderStages.add('CONTROLS');
            assert.match(input?.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);return await ports.runControls(input);
        }catch{held=true;throw Error('MANAGED_RECOVERY_CONTROLS_HELD');}},
        async runDenials(input){try{requireOpen();assert.ok(boundary&&!remainderStages.has('DENIALS'));remainderStages.add('DENIALS');
            return await ports.runDenials({...input,authorize:input?.authorize||boundary.authorize});
        }catch{held=true;throw Error('MANAGED_RECOVERY_DENIALS_HELD');}},
        async reserveRecoveryBudget(value){
            try { requireOpen();
            assert.ok(['RESUME_414953_B4_T3_ONLY','RESUME_414953_FULL_MANAGED'].includes(value?.scope));
            if(value.type==='OWNER_SESSIONS'){
                assert.ok(Object.keys(value).every(k=>['type','scope','limits','normal','recovery','oldClaimsSha256'].includes(k)));
                assert.deepEqual(value.normal,{S1:1,S2:1});assert.deepEqual(value.recovery,{S1:1,S2:1});
                assert.deepEqual(value.limits,{menus:32,createAttempts:33,menuWrites:106,shopWrites:5,blobUploads:5,sessions:16,denialRequests:10});
                assert.match(value.oldClaimsSha256,/^[a-f0-9]{64}$/);return claim('recovery-reservation',structuredClone(value));
            }
            assert.equal(value.type,'STOP_WRITE');assert.ok(Object.keys(value).every(k=>['type','scope','menuId','owner','sourceClaimId','slots'].includes(k)));
            assert.equal(known.get(value.menuId)?.owner,value.owner);assert.equal(value.slots,1);
            assert.match(value.sourceClaimId,/^[A-Za-z0-9_-]{1,128}$/);
            return claim('recovery-stop-'+value.menuId,structuredClone(value));
            }catch{held=true;throw Error('MANAGED_RECOVERY_RESERVATION_HELD');}
        },
        async readMenu({id,owner,key,scenario,checkpoint}){
            try {
                requireOpen();assert.equal(known.get(id)?.owner,owner);
                if(scenario==='REMAINDER_PRIVATE'){assert.ok(boundary&&key===undefined&&checkpoint===undefined);return {menu:await read(id,owner),checkpointMatches:false};}
                assert.equal(known.get(id)?.key,key);
                assert.equal(known.get(id)?.scenario,scenario);assert.ok(['T2','T3'].includes(scenario));
                if(scenario==='T2')assert.ok(['M05','M06','M07','M08'].includes(key));
                const menu=await read(id,owner);
                const recipeRunId=scenario==='T3'?'39390038-ddea-409d-bbe3-0faee2293ed6':'fc6fd8a4-6f9a-4fa9-b30e-04981bf77f67';
                const pack=source.projectOriginalPayloads(recipeRunId);
                const expected=scenario==='T2'&&['M05','M06'].includes(key)
                    ?source.t2PrivateCorrections(recipeRunId,['E21','E23']).find(c=>c.key===key).body:pack.expectedByMenu[key];
                const payload={...expected};delete payload.isPublished;
                assert.deepEqual(source.fixturePayload(menu),payload);
                if(checkpoint){
                    assert.equal(checkpoint.id,id);assert.equal(checkpoint.owner,owner);assert.equal(checkpoint.ownerMatches,true);
                    for(const field of ['version','foodVersion','reviewedFoodVersion','publicationConfirmedFoodVersion','isPublished'])assert.equal(menu[field],checkpoint[field]);
                    if(checkpoint.food===undefined){
                        // A verified T2 prefix carries a complete food/review digest,
                        // not a second raw food object. Match that same content before
                        // the controller can authorize any subsequent request.
                        const keys=['id','owner','ownerMatches','version','foodVersion','isPublished','reviewedFoodVersion','publicationConfirmedFoodVersion','foodSha256','reviewsSha256'];
                        assert.equal(Object.keys(checkpoint).length,keys.length);assert.ok(keys.every(k=>Object.hasOwn(checkpoint,k)));
                        assert.match(checkpoint.foodSha256,/^[a-f0-9]{64}$/);assert.match(checkpoint.reviewsSha256,/^[a-f0-9]{64}$/);
                        assert.equal(managedResumeHash(source.fixturePayload(menu)),checkpoint.foodSha256);assert.equal(managedResumeHash(menu.foodReviews),checkpoint.reviewsSha256);
                    }else{
                        assert.equal(checkpoint.shopId,managedActorIdentity[owner].shopId);assert.deepEqual(source.fixturePayload(menu),checkpoint.food);
                        assert.equal(checkpoint.reviews,'0');assert.equal(checkpoint.resolutions,'0');
                    }
                    assert.equal(menu.foodReviews.length,0);
                }
                return {menu,checkpointMatches:!!checkpoint};
            }catch{held=true;throw Error('MANAGED_RECOVERY_READ_HELD');}
        },
        async write({claim:expectedClaim,resource,payloadIntent}){
            try{
                requireOpen();assert.ok(boundary);assert.equal(resource.purpose,'CORE');
                assert.ok(Object.keys(payloadIntent).every(k=>['kind','key','scenario'].includes(k)));
                const {kind,key,scenario}=payloadIntent;assert.ok(['CREATE','PUBLISH','STOP'].includes(kind));
                assert.ok(/^M0[1-8]$/.test(key));assert.ok(['T2','T3'].includes(scenario));
                const owner=expectedClaim.owner;assert.equal(owner,Number(key.slice(1))<=4?'S1':'S2');
                assert.equal(resource.shopId,managedActorIdentity[owner].shopId);
                assert.equal(expectedClaim.kind,kind==='CREATE'?'MENU_CREATE':'MENU_WRITE');
                let body,path,method;
                if(kind==='CREATE'){
                    assert.equal(scenario,'T3');assert.ok(['M03','M04','M05','M06','M07','M08'].includes(key));
                    assert.ok(![...known.values()].some(f=>f.scenario==='T3'&&f.key===key));
                    body={...source.projectOriginalPayloads('39390038-ddea-409d-bbe3-0faee2293ed6').expectedByMenu[key],
                        isPublished:false,operationId:resource.creationOperationId};method='POST';path='/api/admin/menus';
                }else{
                    const f=known.get(resource.menuId);assert.equal(f?.scenario,scenario);assert.equal(f?.key,key);assert.equal(f?.owner,owner);
                    if(scenario==='T2')assert.ok(kind==='STOP'&&['M05','M06','M07','M08'].includes(key));
                    const before=(await resumePorts.readMenu({id:resource.menuId,owner,key,scenario})).menu;
                    assert.equal(before.version,resource.beforeVersion);
                    if(kind==='STOP')assert.equal(before.isPublished,true);else assert.equal(before.isPublished,false);
                    method=kind==='STOP'?'POST':'PUT';path='/api/admin/menus/'+resource.menuId+(kind==='STOP'?'/stop':'');
                    body={__menuId:resource.menuId,expectedVersion:before.version,...(kind==='PUBLISH'?{publicationAction:'publish'}:{})};
                }
                assert.equal(resource.method,method);assert.equal(resource.path,path);
                const result=await write(expectedClaim.id,owner,kind,method,path,body);
                if(kind==='CREATE')known.set(result.menu.id,{id:result.menu.id,owner,key,scenario});
                const op=operations.at(-1);assert.equal(op.id,expectedClaim.id);
                return {status:op.status,requestId:op.requestId,menu:result.menu,...(kind==='CREATE'?{createdId:result.menu.id}:{})};
            }catch{held=true;throw Error('MANAGED_RECOVERY_WRITE_HELD');}
        },
        async observeT3Evidence({phase}){
            try {
            requireOpen();for(const owner of ['S1','S2'])await verify(owner);
            assert.ok(['START','LOT_ALLOCATION_LOOKUP'].includes(phase));
            const cards=source.originalEvidence('T3',phase);
            assert.deepEqual(cards.map(c=>c.id),[phase==='START'?'E31':'E32']);assert.ok(cards.every(c=>c.caseId==='T3'&&typeof c.text==='string'&&c.text.length>0));
            event({stage:phase==='START'?'RESUME_ORIGINAL_E31_CONSULTED_AUTOMATED':'RESUME_ORIGINAL_E32_CONSULTED_AUTOMATED'});
            return {evidenceIds:cards.map(c=>c.id),source:'ORIGINAL_T3_EVIDENCE',observed:true,lotAllocationHeld:phase==='LOT_ALLOCATION_LOOKUP'};
            }catch{held=true;throw Error('MANAGED_RECOVERY_EVIDENCE_HELD');}
        },
    };
    return {ports,serviceApi,resumePorts,serviceObservationPorts,snapshot:()=>({held,operations:structuredClone(operations),fixtures:[...known.values()],batch:batchResult,
        ...(serviceConfig?{preparationState:structuredClone(serviceConfig.preparationState)}:{})}),assertOpen:requireOpen};
}

// One callable first-arm continuation. The root owns actor authentication/finalization;
// this function closes only service-created pages. Factories are injectable for offline
// orchestration tests and are explicitly labelled in the returned evidence.
export async function executeManagedContinuation({actors,t1,identityReceipt,claimDirectory,image,
    record=()=>{},outputRecord=()=>{},signal,dependencies={}}={}) {
    let suite,runtime,serviceBrowser,stage='PREFLIGHT',continuationStatus='HOLD_CONTINUATION_NOT_STARTED',injected=false;
    const preparationState={},preexisting=new Set();
    let browserAdapterClose={ownedPageClosed:true,routesDrained:false,notStarted:true};
    const safeRecord=value=>{
        const event={stage:/^[A-Z0-9_]{1,100}$/.test(value?.stage||'')?value.stage:'CONTINUATION_OBSERVATION'};
        for(const key of ['owner','phase','state'])if(typeof value?.[key]==='string'&&/^[A-Z0-9_]{1,100}$/.test(value[key]))event[key]=value[key];
        for(const key of ['menuId'])if(/^c[a-z0-9]+$/.test(value?.[key]||''))event[key]=value[key];
        for(const key of ['operation','requestId'])if(typeof value?.[key]==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value[key]))event[key]=value[key];
        for(const key of ['objectSha256'])if(/^[a-f0-9]{64}$/.test(value?.[key]||''))event[key]=value[key];
        for(const key of ['status','httpStatus'])if(Number.isInteger(value?.[key])&&value[key]>=100&&value[key]<=599)event[key]=value[key];
        for(const key of ['observedUtc','startedUtc','acknowledgedUtc'])if(typeof value?.[key]==='string'&&/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(value[key])&&Number.isFinite(Date.parse(value[key])))event[key]=value[key];
        record(event);
    };
    let actorA;
    try {
        assert.ok(!signal?.aborted&&Array.isArray(actors)&&actors.length===2&&typeof claimDirectory==='string'&&claimDirectory.length>0
            &&typeof record==='function'&&typeof outputRecord==='function');
        assert.ok(dependencies&&typeof dependencies==='object');
        assert.ok(Object.keys(dependencies).every(k=>['createRuntimePorts','createSuite','prepareServiceBrowser','createServicePreparation'].includes(k)));
        injected=Object.keys(dependencies).length>0;
        assertIdentityReceipt(identityReceipt);
        assert.equal(t1?.flow,'PASS_APP_BROWSER_API');assert.equal(t1.cleanup,'PRIVATE_VERIFIED');assert.equal(t1.protection,'PASS_API_REPRESENTATION');
        assert.equal(t1.unknownWrite,false);assert.match(t1.fixtureId,/^c[a-z0-9]+$/);assert.equal(t1.menuWrites,6);assert.equal(t1.sessions,2);
        const serviceModule=await import('./issue118-managed-service-browser.mjs');
        const suiteModule=await import('./issue118-managed-suite.mjs');
        for(const key of ['source','deployment','origin'])assert.equal(serviceModule.serviceBrowserApplication[key],target[key]);
        assert.ok(Buffer.isBuffer(image?.buffer));assert.equal(image.buffer.length,serviceModule.serviceBrowserImage.bytes);
        assert.equal(createHash('sha256').update(image.buffer).digest('hex'),serviceModule.serviceBrowserImage.sha256);
        const roleMap=new Map(actors.map(a=>[a.binding?.owner,a]));assert.equal(roleMap.size,2);assert.ok(roleMap.has('S1')&&roleMap.has('S2'));
        for(const key of ['context','page','access'])assert.equal(new Set(actors.map(a=>a[key])).size,2);
        assert.equal(new Set(actors.map(a=>a.lifecycle?.browser)).size,2);
        stage='OWNERS_VERIFY';
        const ownerEvidence=[];
        for(const role of ['S1','S2']){
            const a=roleMap.get(role),identity=managedActorIdentity[role],tracker=a.lifecycle?.tracker;
            assert.equal(a.expectedUserId,identity.ownerId);assert.equal(a.binding.shopId,identity.shopId);
            assert.match(a.binding.contextRef,/^[A-Za-z0-9_-]{1,64}$/);
            assert.ok(ownedCiActorBoundary({access:a.access,page:a.page,context:a.context,browser:a.lifecycle?.browser,
                expectedOwnerId:identity.ownerId,drainRoutes:()=>tracker.drain(),readRouteState:()=>tracker.snapshot()},true));
            assert.equal(a.page.isClosed(),false);assert.equal(a.page.url(),target.origin+'/admin/shop');
            const frontend=await a.page.evaluate(()=>({id:window.Clerk?.user?.id,pk:window.Clerk?.publishableKey}));
            assert.equal(frontend.id,identity.ownerId);assertClerkPublishableKey(frontend.pk);
            const response=await a.access.read(a.context.request,target.origin+'/api/admin/shop');
            assert.equal(response.status(),200);assert.equal((await response.json())?.shop?.id,identity.shopId);
            assert.ok(!a.routeFailed?.());
            ownerEvidence.push({owner:role,clerkUserId:identity.ownerId,shopId:identity.shopId,contextRef:a.binding.contextRef,
                deployment:target.deployment,source:target.source,origin:target.origin,observedUtc:new Date().toISOString(),
                verifiedBy:'browser_metadata_observer',evidenceReference:'CONTINUATION_TRACKED_ACTOR_FRONTEND_AND_OWN_SHOP_API'});
            safeRecord({stage:'CONTINUATION_OWNER_VERIFIED',owner:role});
        }
        actorA=roleMap.get('S1');for(const page of actorA.context.pages())preexisting.add(page);
        stage='FACTORIES';
        const suiteId=randomUUID(),keys=Array.from({length:8},(_,i)=>'M0'+(i+1));
        const batchInput={runId:suiteId,signal,managed:{mode:'APPROVED_MANAGED_LIVE',claimDirectory,
            actors,identityReceipt:structuredClone(identityReceipt),ownerEvidence,finalizeActors:false,t4EvidenceLevel:'APP_BROWSER_READS_ONLY',
            runIds:{T2:randomUUID(),T3:randomUUID(),T4:randomUUID()},operationIds:{
                T2:Object.fromEntries(keys.map(key=>[key,randomUUID()])),T3:Object.fromEntries(keys.map(key=>[key,randomUUID()])),T4:{M02:randomUUID()}}}};
        runtime=(dependencies.createRuntimePorts||createManagedRuntimePorts)({actors,batchInput,claimDirectory,t1FixtureId:t1.fixtureId,record:safeRecord});
        const api=runtime.serviceApi;
        for(const name of ['readMenu','readShop','readCreationBaseline','createMenu','menuWrite','shopWrite','observeKnownBlob',
            'verifyPublicImage','verifyActor','readOwner','claimPrivate'])assert.equal(typeof api?.[name],'function');
        const ts=createRequire(import.meta.url)('tsx/cjs/api');
        const {projectOriginalPayloads}=ts.require('./issue118-batch-stop.ts',import.meta.url);
        const {ALLERGEN_MASTER}=ts.require('../lib/constants/allergen-master.ts',import.meta.url);
        const preparation=(dependencies.createServicePreparation||serviceModule.createManagedServicePreparation)({api,state:preparationState,
            runId:suiteId,menuTemplate:projectOriginalPayloads(suiteId).expectedByMenu.M04,allergens:ALLERGEN_MASTER,shopId:target.shop});
        for(const name of ['prepareCell','finishCell','recordSetupObject','retainHeldCell'])assert.equal(typeof preparation[name],'function');
        const {prepareWriteObservation}=ts.require('./issue118-service-observer.ts',import.meta.url);
        const scope={runId:suiteId,applicationSha:target.source,shopId:target.shop,
            isolationReceiptSha256:createHash('sha256').update(JSON.stringify(identityReceipt)).digest('hex')};
        serviceBrowser=(dependencies.prepareServiceBrowser||serviceModule.prepareManagedServiceBrowser)({actor:{...actorA,owner:'S1'},target,scope,image,
            ports:{prepareCell:preparation.prepareCell,finishCell:preparation.finishCell,recordSetupObject:preparation.recordSetupObject,
                retainHeldCell:preparation.retainHeldCell,verifyActor:async(a,expected)=>{
                    assert.equal(a.context,actorA.context);for(const key of ['source','deployment','origin'])assert.equal(expected[key],target[key]);
                    assert.equal(await api.verifyActor(a),true);
                },readOwner:value=>api.readOwner(value),claimPrivate:value=>api.claimPrivate(value),emit:safeRecord,
                oidcHeaders:(url,headers,token)=>scopedOidcHeaders(url,headers,assertOidcClaims(token)),prepareWriteObservation}});
        assert.equal(typeof serviceBrowser.runServiceCell,'function');assert.equal(typeof serviceBrowser.close,'function');
        const ports={...runtime.ports,runServiceCell:value=>serviceBrowser.runServiceCell(value),prepareServiceActor:async({existingActor,permit})=>{
            assert.equal(existingActor,true);assert.equal(permit,null);assert.equal(actorA.page.isClosed(),false);
            assert.equal(await api.verifyActor(actorA),true);const routes=actorA.lifecycle.tracker.snapshot();
            assert.equal(routes.pending,0);assert.equal(routes.started,routes.settled);
            return {owner:'S1',identityVerified:true,separateFromClosedActors:true};
        }};
        suite=(dependencies.createSuite||suiteModule.prepareManagedSuite)({suiteId,batchInput,t1,ports,signal});
        stage='CORE';safeRecord({stage:'CONTINUATION_CORE_START'});
        const core=await suite.executeCore();
        if(core.status==='CORE_COMPLETE_SUITE_INCOMPLETE'&&core.arms?.[0]?.status==='CORE_API_SEQUENCE_COMPLETE'){
            assert.ok(!signal?.aborted);stage='FIRST_SERVICE_ARM';safeRecord({stage:'CONTINUATION_FIRST_SERVICE_ARM_START'});
            const order=['MENU_CREATE','MENU_SAVE','STOP','MENU_UPLOAD','SHOP_UPLOAD','SHOP_SAVE'];
            await suite.executeServiceArm({armId:'SERVICE_ARM_1',cellIds:[...order.map(k=>k+'_DELIVER'),...order.map(k=>k+'_BLOCK_BEFORE_FORWARD'),
                'MENU_CREATE_WITHHOLD_AFTER_RESPONSE']});
        }
        continuationStatus='RETURNED_SUITE_STATE';
    }catch{continuationStatus='HOLD_CONTINUATION_'+stage;}
    finally{
        if(serviceBrowser){
            try{
                browserAdapterClose=await serviceBrowser.close();
                const routes=actorA.lifecycle.tracker.snapshot();
                browserAdapterClose={...browserAdapterClose,preexistingPagesPreserved:[...preexisting].every(p=>!p.isClosed()),
                    ownedPagesClosed:actorA.context.pages().every(p=>preexisting.has(p)||p.isClosed()),
                    pendingRequests:routes.pending,started:routes.started,settled:routes.settled};
                if(browserAdapterClose.ownedPageClosed!==true||browserAdapterClose.routesDrained!==true
                    ||!browserAdapterClose.preexistingPagesPreserved||!browserAdapterClose.ownedPagesClosed
                    ||routes.pending!==0||routes.started!==routes.settled)continuationStatus='HOLD_SERVICE_PAGE_CLOSE_UNVERIFIED';
            }catch{browserAdapterClose={ownedPageClosed:false,routesDrained:false};continuationStatus='HOLD_SERVICE_PAGE_CLOSE_UNVERIFIED';}
        }
    }
    let suiteSnapshot={status:'HOLD_CONTINUATION_NOT_STARTED',livePass:false,automaticRetry:false,automaticCleanup:false},runtimeSnapshot={held:true},savedPreparation={};
    try{if(suite)suiteSnapshot=suite.snapshot();if(runtime)runtimeSnapshot=runtime.snapshot();savedPreparation=structuredClone(preparationState);}
    catch{continuationStatus='HOLD_SNAPSHOT_UNVERIFIED';}
    const result={suiteSnapshot,runtimeSnapshot:{...runtimeSnapshot,continuationStatus,stoppedStage:stage,
        continuationEvidence:injected?'INJECTED_FACTORY_TEST':'OWNED_ACTOR_PORTS'},preparationState:savedPreparation,browserAdapterClose};
    try{await outputRecord(structuredClone(result));}catch{result.runtimeSnapshot.continuationStatus='HOLD_CHECKPOINT_WRITE_UNVERIFIED';}
    return result;
}

// Resume one independently reconciled terminal arm. Authentication remains lazy;
// actorHandle is private to the caller and must never be included in an artifact.
export async function executeManagedServiceResume({initialSnapshot,preparationState,checkpointReceipt,terminalProof,nextCellId,
    claimDirectory,identityReceipt,image,actorFactory,verifyCheckpoint,record=()=>{},outputRecord=()=>{},signal,dependencies={}}={}) {
    let suite,runtime,preparation,serviceBrowser,actorHandle,boundary,runtimeGuard,actorAttempted=false;
    let stage='PREFLIGHT',resumeStatus='HOLD_RESUME_PREFLIGHT',savedState={},restoredInput,attested=false,injected=false;
    const preexisting=new Set();
    let browserAdapterClose={ownedPageClosed:true,routesDrained:true,notStarted:true};
    const hash=value=>createHash('sha256').update(value).digest('hex');
    const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)
        ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
    const exact=(object,keys)=>assert.ok(object&&Object.keys(object).length===keys.length&&keys.every(k=>Object.hasOwn(object,k)));
    const emit=value=>{const event={stage:/^[A-Z0-9_]{1,100}$/.test(value?.stage||'')?value.stage:'RESUME_OBSERVATION'};
        for(const key of ['owner','phase','state','operation','requestId'])if(typeof value?.[key]==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value[key]))event[key]=value[key];
        if(/^c[a-z0-9]+$/.test(value?.menuId||''))event.menuId=value.menuId;
        if(/^[a-f0-9]{64}$/.test(value?.objectSha256||''))event.objectSha256=value.objectSha256;
        for(const key of ['status','httpStatus'])if(Number.isInteger(value?.[key])&&value[key]>=100&&value[key]<=599)event[key]=value[key];
        record(event);};
    const durableClaim=value=>{let fd;try{
        assert.match(value.id,/^[A-Za-z0-9_-]{1,128}$/);mkdirSync(claimDirectory,{recursive:true});
        fd=openSync(join(claimDirectory,'operation-'+value.id+'.json'),'wx',0o600);
        writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);return true;
    }catch{return false;}finally{if(fd!==undefined)closeSync(fd);}};
    try {
        assert.ok(!signal?.aborted&&typeof verifyCheckpoint==='function'&&typeof record==='function'&&typeof outputRecord==='function');
        assert.ok(typeof claimDirectory==='string'&&claimDirectory.length>0);
        assert.ok(dependencies&&typeof dependencies==='object'&&Object.keys(dependencies).every(k=>
            ['createRuntimePorts','createSuite','prepareServiceBrowser','createServicePreparation'].includes(k)));
        injected=Object.keys(dependencies).length>0;
        assertIdentityReceipt(identityReceipt);
        // Clone caller data before any await; a later mutation cannot change the attested operation set.
        restoredInput=structuredClone(initialSnapshot);savedState=structuredClone(preparationState);
        const receipt=structuredClone(checkpointReceipt),proof=structuredClone(terminalProof);
        const terminal=restoredInput.arms.at(-1),suiteId=restoredInput.suiteId;
        assert.match(suiteId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        assert.equal(restoredInput.applicationSha,target.source);assert.equal(restoredInput.status,'HOLD_NO_FURTHER_WRITES');
        assert.equal(terminal.zone,'SERVICE');assert.equal(terminal.status,'HOLD');assert.equal(terminal.terminalVerified,false);
        assert.equal(savedState.version,1);assert.equal(savedState.runId,suiteId);assert.ok(savedState.cells&&typeof savedState.cells==='object');
        const sequence=['MENU_CREATE','MENU_SAVE','STOP','MENU_UPLOAD','SHOP_SAVE','SHOP_UPLOAD'].map(k=>k+'_WITHHOLD_AFTER_RESPONSE');
        const previous=sequence.indexOf(terminal.currentCell);assert.ok(previous>=0);
        if(nextCellId===null){assert.equal(previous,5);assert.equal(restoredInput.service.length,18);
            assert.ok(restoredInput.service.every(c=>['OBSERVED_NOT_INDEPENDENTLY_ATTESTED','NO_FORWARD_PROVEN_CLIENT_UNKNOWN','HOLD'].includes(c.status)));
        }else{assert.equal(nextCellId,sequence[previous+1]);assert.equal(typeof actorFactory,'function');
            assert.equal(restoredInput.service.find(c=>c.id===nextCellId)?.status,'NOT_RUN');}
        const bindings=terminal.operationIds.map(id=>{const claim=restoredInput.claims.find(c=>c.id===id);assert.ok(claim);
            return {operationId:id,kind:claim.kind,mode:claim.mode,owner:claim.owner,resource:structuredClone(claim.resource)};});
        const resourcesSha256=hash(canonical(bindings));
        exact(receipt,['snapshotSha256','applicationSha','suiteId','terminalArmId','resourcesSha256','terminalMetadataReceipt']);
        assert.equal(receipt.snapshotSha256,hash(JSON.stringify(restoredInput)));assert.equal(receipt.applicationSha,target.source);
        assert.equal(receipt.suiteId,suiteId);assert.equal(receipt.terminalArmId,terminal.id);assert.equal(receipt.resourcesSha256,resourcesSha256);
        const metadata=receipt.terminalMetadataReceipt;
        exact(metadata,['verifiedBy','evidenceReference','observedUtc','githubRunId','status','authSessionsClosed','pendingRequests','artifactSha256']);
        assert.equal(metadata.verifiedBy,'cli_metadata_observer');assert.ok(typeof metadata.evidenceReference==='string'&&metadata.evidenceReference.length>0&&metadata.evidenceReference.length<=512);
        assert.match(metadata.githubRunId,/^[0-9]{1,30}$/);assert.equal(metadata.status,'completed');assert.equal(metadata.authSessionsClosed,true);
        assert.equal(metadata.pendingRequests,0);assert.match(metadata.artifactSha256,/^[a-f0-9]{64}$/);
        assert.match(metadata.observedUtc,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
        const age=Date.now()-Date.parse(metadata.observedUtc);assert.ok(Number.isFinite(age)&&age>=0&&age<=3600000);
        exact(proof,['source','originalTerminal','unknownResolved','sessionsClosed','pendingRequests','operationIds','resourcesSha256']);
        assert.equal(proof.source,'INDEPENDENT_READ_ONLY');assert.equal(proof.originalTerminal,true);assert.equal(proof.unknownResolved,true);
        assert.equal(proof.sessionsClosed,true);assert.equal(proof.pendingRequests,0);assert.equal(proof.resourcesSha256,resourcesSha256);
        assert.ok(Array.isArray(proof.operationIds)&&proof.operationIds.length===terminal.operationIds.length
            &&new Set(proof.operationIds).size===proof.operationIds.length&&proof.operationIds.every(id=>terminal.operationIds.includes(id)));
        const serviceModule=await import('./issue118-managed-service-browser.mjs'),suiteModule=await import('./issue118-managed-suite.mjs');
        for(const key of ['source','deployment','origin'])assert.equal(serviceModule.serviceBrowserApplication[key],target[key]);
        if(nextCellId!==null){assert.ok(Buffer.isBuffer(image?.buffer));assert.equal(image.buffer.length,serviceModule.serviceBrowserImage.bytes);
            assert.equal(hash(image.buffer),serviceModule.serviceBrowserImage.sha256);}
        const ports={
            claimSuite:async()=>false,claimOperation:async value=>durableClaim(value),
            verifyCheckpoint:async input=>{attested=await verifyCheckpoint({...input,preparationState:structuredClone(savedState),terminalProof:structuredClone(proof)})===true;return attested;},
            verifyTerminalReadOnly:async input=>{
                assert.equal(actorAttempted,false);assert.equal(input.armId,terminal.id);assert.equal(input.resourcesSha256,resourcesSha256);
                assert.equal(canonical(input.resourceBindings),canonical(bindings));
                assert.equal(canonical([...input.operationIds].sort()),canonical([...terminal.operationIds].sort()));return structuredClone(proof);
            },
            installSendGuard:async value=>{assert.equal(boundary,undefined);boundary=value;
                return {beforeSend:true,remove:async()=>{try{if(runtimeGuard)assert.equal(await runtimeGuard.remove(),true);
                    return true;}finally{boundary=undefined;runtimeGuard=undefined;}}};},
            prepareServiceActor:async({existingActor,permit})=>{
                assert.equal(existingActor,false);assert.equal(actorAttempted,false);assert.ok(!signal?.aborted&&boundary);
                assert.ok(permit?.allowedForward===true&&permit.resource?.purpose==='SESSION');
                const sessionClaim=suite.snapshot().claims.find(c=>c.id===permit.id);
                assert.equal(sessionClaim?.kind,'SESSION');assert.equal(sessionClaim.owner,'S1');assert.equal(sessionClaim.state,'FORWARD_CONSUMED');
                actorAttempted=true;stage='ACTOR_FACTORY';actorHandle=await actorFactory({role:'S1',permit});
                const a=actorHandle,identity=managedActorIdentity.S1,tracker=a.lifecycle?.tracker;
                assert.equal(a.binding?.owner,'S1');assert.equal(a.expectedUserId,identity.ownerId);assert.equal(a.binding.shopId,identity.shopId);
                assert.ok(ownedCiActorBoundary({access:a.access,page:a.page,context:a.context,browser:a.lifecycle?.browser,
                    expectedOwnerId:identity.ownerId,drainRoutes:()=>tracker.drain(),readRouteState:()=>tracker.snapshot()},true));
                assert.equal(a.page.isClosed(),false);assert.equal(a.page.url(),target.origin+'/admin/shop');
                const frontend=await a.page.evaluate(()=>({id:window.Clerk?.user?.id,pk:window.Clerk?.publishableKey}));
                assert.equal(frontend.id,identity.ownerId);assertClerkPublishableKey(frontend.pk);
                const own=await a.access.read(a.context.request,target.origin+'/api/admin/shop');assert.equal(own.status(),200);
                assert.equal((await own.json())?.shop?.id,identity.shopId);assert.ok(!a.routeFailed?.());
                const routes=tracker.snapshot();assert.equal(routes.pending,0);assert.equal(routes.started,routes.settled);
                for(const page of a.context.pages())preexisting.add(page);
                runtime=(dependencies.createRuntimePorts||createManagedRuntimePorts)({operation:'SERVICE_ARM',actors:[a],claimDirectory,
                    checkpointFixtures:restoredInput.fixtures,t1FixtureId:restoredInput.t1.fixtureId,record:emit});
                runtimeGuard=await runtime.ports.installSendGuard(boundary);assert.equal(runtimeGuard?.beforeSend,true);
                const api=runtime.serviceApi;
                for(const name of ['readMenu','readShop','readCreationBaseline','createMenu','menuWrite','shopWrite','observeKnownBlob',
                    'verifyPublicImage','verifyActor','readOwner','claimPrivate'])assert.equal(typeof api?.[name],'function');
                const ts=createRequire(import.meta.url)('tsx/cjs/api');
                const {projectOriginalPayloads}=ts.require('./issue118-batch-stop.ts',import.meta.url);
                const {ALLERGEN_MASTER}=ts.require('../lib/constants/allergen-master.ts',import.meta.url);
                preparation=(dependencies.createServicePreparation||serviceModule.createManagedServicePreparation)({api,state:savedState,runId:suiteId,
                    menuTemplate:projectOriginalPayloads(suiteId).expectedByMenu.M04,allergens:ALLERGEN_MASTER,shopId:target.shop});
                for(const name of ['prepareCell','finishCell','recordSetupObject','retainHeldCell','restorePriorShop'])assert.equal(typeof preparation[name],'function');
                const {prepareWriteObservation}=ts.require('./issue118-service-observer.ts',import.meta.url);
                serviceBrowser=(dependencies.prepareServiceBrowser||serviceModule.prepareManagedServiceBrowser)({actor:{...a,owner:'S1'},target,
                    scope:{runId:suiteId,applicationSha:target.source,shopId:target.shop,isolationReceiptSha256:hash(JSON.stringify(identityReceipt))},image,
                    ports:{prepareCell:preparation.prepareCell,finishCell:preparation.finishCell,recordSetupObject:preparation.recordSetupObject,
                        retainHeldCell:preparation.retainHeldCell,verifyActor:async(value,expected)=>{
                            assert.equal(value.context,a.context);for(const key of ['source','deployment','origin'])assert.equal(expected[key],target[key]);
                            assert.equal(await api.verifyActor(value),true);},readOwner:value=>api.readOwner(value),claimPrivate:value=>api.claimPrivate(value),
                        emit,oidcHeaders:(url,headers,token)=>scopedOidcHeaders(url,headers,assertOidcClaims(token)),prepareWriteObservation}});
                assert.equal(typeof serviceBrowser.runServiceCell,'function');assert.equal(typeof serviceBrowser.close,'function');stage='SERVICE_ARM';
                return {owner:'S1',identityVerified:true,separateFromClosedActors:true};
            },
            runServiceCell:async value=>{assert.ok(serviceBrowser&&value.cell.id===nextCellId);return serviceBrowser.runServiceCell(value);},
            restorePriorShop:async value=>{assert.ok(preparation);return preparation.restorePriorShop({...value,independentTerminalVerified:true});},
        };
        stage='CHECKPOINT_AND_TERMINAL';
        suite=(dependencies.createSuite||suiteModule.prepareManagedSuite)({suiteId,initialSnapshot:restoredInput,checkpointReceipt:receipt,ports,signal});
        await suite.reconcileTerminalArm(proof);
        assert.equal(actorAttempted,false);assert.ok(!signal?.aborted);
        if(nextCellId===null)resumeStatus='TERMINAL_RECONCILED_NO_AUTH';
        else{stage='SERVICE_ARM';await suite.executeServiceArm({armId:'SERVICE_ARM_'+(restoredInput.arms.filter(a=>a.zone==='SERVICE').length+1),cellIds:[nextCellId]});
            resumeStatus='RETURNED_SUITE_STATE';}
    }catch{resumeStatus='HOLD_RESUME_'+stage;}
    finally{if(serviceBrowser)try{
        browserAdapterClose=await serviceBrowser.close();const routes=actorHandle.lifecycle.tracker.snapshot();
        browserAdapterClose={...browserAdapterClose,preexistingPagesPreserved:[...preexisting].every(p=>!p.isClosed()),
            ownedPagesClosed:actorHandle.context.pages().every(p=>preexisting.has(p)||p.isClosed()),pendingRequests:routes.pending,started:routes.started,settled:routes.settled};
        if(browserAdapterClose.ownedPageClosed!==true||browserAdapterClose.routesDrained!==true||!browserAdapterClose.preexistingPagesPreserved
            ||!browserAdapterClose.ownedPagesClosed||routes.pending!==0||routes.started!==routes.settled)resumeStatus='HOLD_SERVICE_PAGE_CLOSE_UNVERIFIED';
    }catch{browserAdapterClose={ownedPageClosed:false,routesDrained:false};resumeStatus='HOLD_SERVICE_PAGE_CLOSE_UNVERIFIED';}}
    let suiteSnapshot={status:'HOLD_RESUME_PREFLIGHT',livePass:false,automaticRetry:false,automaticCleanup:false},runtimeSnapshot={held:true};
    try{if(suite)suiteSnapshot=suite.snapshot();if(runtime)runtimeSnapshot=runtime.snapshot();}catch{resumeStatus='HOLD_RESUME_SNAPSHOT_UNVERIFIED';}
    const result={suiteSnapshot,runtimeSnapshot:{...runtimeSnapshot,resumeStatus,stoppedStage:stage,
        resumeEvidence:injected?'INJECTED_FACTORY_TEST':'OWNED_ACTOR_PORTS'},preparationState:attested?savedState:{},browserAdapterClose};
    try{await outputRecord(structuredClone(result));}catch{result.runtimeSnapshot.resumeStatus='HOLD_CHECKPOINT_WRITE_UNVERIFIED';}
    return {result,actorHandle};
}

// Metadata only: the PC attester supplies independently observed SQL/terminal facts.
// This helper is usable before dependencies/authentication and performs no I/O.
export function assertManagedCleanupProof(proof,now=Date.now()) {
    try {
        const ids=['cmvziwd1k0001js07pqfoctkr','cmvzk8bru0001l608a2gjmewc','cmvzk905d0009l608790fkj9u',
            'cmvzk9mbm000hl6085xpcrgm6','cmvzka8kt000pl608yugd9vi3','cmvzkk6r9002pl608yc64yz0m','cmvzkkvde002xl608mxvyjpda'];
        const fixed={source:'INDEPENDENT_READ_ONLY',verifiedBy:'cli_metadata_observer',sourceRunId:'41495319922',status:'completed',
            evidenceReference:'https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/41495319922',
            applicationSha:'8bf5bea476d5cf5a8dd6ac38713a2d393d7460b1',deployment:'dpl_14PXhbZ9EnKuiL2kTQwbuU7d5ebo',
            origin:'https://clear-allergy-e2e-qs7v9eaim-kaitoexe00-9350s-projects.vercel.app',ownerId:'user_3LFy4E2hco0VpC63CbjjMjOznIx',
            shopId:'cmvs4x80y000twn0wbxkwzbt6',knownTerminal:true,sessionsEnded:true,pendingRequests:0,unknownResolved:true};
        const exact=(value,keys)=>assert.ok(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===keys.length
            &&keys.every(k=>Object.hasOwn(value,k)));
        exact(proof,[...Object.keys(fixed),'observedUtc','fixtures']);
        for(const [key,value] of Object.entries(fixed))assert.equal(proof[key],value);
        assert.equal(target.source,fixed.applicationSha);assert.equal(target.deployment,fixed.deployment);assert.equal(target.origin,fixed.origin);
        assert.equal(ciIdentity.ownerId,fixed.ownerId);assert.equal(target.shop,fixed.shopId);
        assert.match(proof.observedUtc,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
        const age=now-Date.parse(proof.observedUtc);assert.ok(Number.isFinite(now)&&Number.isFinite(age)&&age>=0&&age<=3600000);
        assert.ok(Array.isArray(proof.fixtures)&&proof.fixtures.length===7&&new Set(proof.fixtures.map(f=>f.id)).size===7);
        for(const f of proof.fixtures){exact(f,['id','version','foodVersion','isPublished','foodSha256']);assert.ok(ids.includes(f.id));
            assert.ok(Number.isSafeInteger(f.version)&&f.version>=0&&f.version<=2147483647&&Number.isSafeInteger(f.foodVersion)&&f.foodVersion>=0&&f.foodVersion<=f.version);
            assert.equal(typeof f.isPublished,'boolean');assert.match(f.foodSha256,/^[a-f0-9]{64}$/);}
        assert.equal(proof.fixtures.find(f=>f.id===ids[0]).isPublished,false);
        assert.equal(proof.fixtures.find(f=>f.id===ids[6]).isPublished,false);
        assert.ok(proof.fixtures.filter(f=>f.isPublished).length<=5);
        return Object.freeze({...fixed,observedUtc:proof.observedUtc,
            fixtures:Object.freeze(ids.map(id=>Object.freeze({...proof.fixtures.find(f=>f.id===id)})))});
    }catch{throw Error('MANAGED_CLEANUP_PROOF_REFUSED');}
}

// Unwired local B candidate. Its proposed eighth-session metadata is not a
// change to the active seven-session policy or permission to authenticate.
export function assertManagedBCleanupProof(proof,now=Date.now()) {
    try {
        const fixtures=[['cmvzkaueq000xl6086shu6i7o',95,88],['cmvzkbgd80015l6089s4spnqg',95,88],
            ['cmvzkc2u5001dl6089rwngm8c',32,29],['cmvzkcoq3001ll608iv8ekwxk',32,29]];
        const fixed={source:'INDEPENDENT_READ_ONLY',verifiedBy:'cli_metadata_observer',sourceRunId:'41495319922',
            checkpointRunId:'41501320828',checkpointSqlObservedUtc:'2026-11-02T18:42:53.901Z',status:'completed',
            evidenceReference:'https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/41501320828',
            applicationSha:'8bf5bea476d5cf5a8dd6ac38713a2d393d7460b1',deployment:'dpl_14PXhbZ9EnKuiL2kTQwbuU7d5ebo',
            origin:'https://clear-allergy-e2e-qs7v9eaim-kaitoexe00-9350s-projects.vercel.app',
            ownerId:'user_3LFyNjtUBNFHoDjyYiieTXEhHd0',shopId:'cmvs4x9h80011wn0w7s8abaie',
            knownTerminal:true,sessionsEnded:true,pendingRequests:0,unknownResolved:true};
        const budget={priorSessions:7,priorMenuWrites:42,proposedSessionMaximum:8,neededSessions:1,maximumMenuWrites:103};
        const exact=(value,keys)=>assert.ok(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===keys.length
            &&keys.every(k=>Object.hasOwn(value,k)));
        exact(proof,[...Object.keys(fixed),'sqlObservedUtc','observedUtc','fixtures','candidateBudget']);
        for(const [key,value] of Object.entries(fixed))assert.equal(proof[key],value);
        exact(proof.candidateBudget,Object.keys(budget));for(const [key,value] of Object.entries(budget))assert.equal(proof.candidateBudget[key],value);
        assert.equal(target.source,fixed.applicationSha);assert.equal(target.deployment,fixed.deployment);assert.equal(target.origin,fixed.origin);
        assert.equal(managedActorIdentity.S2.ownerId,fixed.ownerId);assert.equal(managedActorIdentity.S2.shopId,fixed.shopId);
        assert.match(proof.sqlObservedUtc,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
        assert.match(proof.observedUtc,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
        const sqlObserved=Date.parse(proof.sqlObservedUtc),observed=Date.parse(proof.observedUtc);
        assert.ok(Number.isFinite(now)&&Number.isFinite(sqlObserved)&&Number.isFinite(observed)
            &&sqlObserved>=Date.parse(fixed.checkpointSqlObservedUtc)&&sqlObserved<=observed&&observed<=now&&now-sqlObserved<=3600000);
        assert.equal(new Date(sqlObserved).toISOString(),proof.sqlObservedUtc);assert.equal(new Date(observed).toISOString(),proof.observedUtc);
        assert.ok(Array.isArray(proof.fixtures)&&proof.fixtures.length===4&&new Set(proof.fixtures.map(f=>f.id)).size===4);
        for(const [id,version,foodVersion] of fixtures){const f=proof.fixtures.find(f=>f.id===id);
            exact(f,['id','version','foodVersion','isPublished','publicationConfirmedFoodVersion','foodSha256']);
            assert.equal(f.version,version);assert.equal(f.foodVersion,foodVersion);assert.equal(f.isPublished,true);
            assert.equal(f.publicationConfirmedFoodVersion,foodVersion);assert.match(f.foodSha256,/^[a-f0-9]{64}$/);}
        return Object.freeze({...fixed,sqlObservedUtc:proof.sqlObservedUtc,observedUtc:proof.observedUtc,candidateBudget:Object.freeze({...budget}),
            fixtures:Object.freeze(fixtures.map(([id])=>Object.freeze({...proof.fixtures.find(f=>f.id===id)})))});
    }catch{throw Error('MANAGED_B_CLEANUP_PROOF_REFUSED');}
}

// Stops only explicitly attested, already-existing S1 fixtures. The caller owns
// the actor/session lifecycle. A fresh GET is an observation, not an atomic CAS.
export async function executeManagedKnownFixtureCleanup(input={}) {
    return executeManagedFixtureCleanup(input,{assertProof:assertManagedCleanupProof,owner:'S1',maxStops:5});
}

// Candidate callable seam only: no CLI/workflow connection, session creation,
// automatic finalization, or active-budget increase is introduced here.
export async function executeManagedKnownBFixtureCleanup(input={}) {
    const result=await executeManagedFixtureCleanup(input,{assertProof:assertManagedBCleanupProof,owner:'S2',maxStops:4,revalidateBeforeFetch:true});
    return {...result,candidateOnly:true,activeSessionMaximum:7};
}

async function executeManagedFixtureCleanup({actor,proof,record=()=>{}}={},policy) {
    const result={status:'HOLD_KNOWN_FIXTURE_CLEANUP',stopAttempts:0,fixtures:[],failureStage:null,
        automaticRetry:false,automaticCleanup:false,independentDatabase:'EXTERNAL_ATTESTER_REQUIRED'};
    let stage='PROOF';
    const emit=async(stage,id,status,requestId)=>{const event={stage};if(id)event.id=id;
        if(Number.isInteger(status)&&status>=100&&status<=599)event.status=status;
        if(typeof requestId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))event.requestId=requestId;
        try{await record(event);}catch{throw Error('MANAGED_CLEANUP_DIAGNOSTIC_REFUSED');}};
    try {
        const attestation=policy.assertProof(proof);assert.equal(typeof record,'function');stage='ACTOR';
        assert.equal(actor?.binding?.owner,policy.owner);assert.equal(actor.binding.shopId,attestation.shopId);assert.equal(actor.expectedUserId,attestation.ownerId);
        assert.equal(actor.access?.sessionLifecycleMode(),'TRACKED_OWNER_SESSION');
        const owned=()=>{const s=actor.access.sessionObservation();assert.equal(s?.ownerId,attestation.ownerId);
            assert.equal(s.ownerVerified,true);assert.equal(s.eligibleForCleanup,true);assert.ok(!actor.routeFailed?.());};
        owned();assert.equal(typeof actor.access.ensureToken,'function');assert.equal(typeof actor.context?.request?.fetch,'function');
        const ts=createRequire(import.meta.url)('tsx/cjs/api');
        const {savedMenuResponseSchema}=ts.require('../features/admin/menus/schemas/menu-response.ts',import.meta.url);
        const {fixturePayload}=ts.require('./issue118-batch-stop.ts',import.meta.url);
        const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)
            ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
        const foodHash=menu=>createHash('sha256').update(canonical(fixturePayload(menu))).digest('hex');
        const read=async id=>{owned();await actor.access.ensureToken();owned();const response=await protectedPreviewFetch(actor.context.request,
            attestation.origin+'/api/admin/menus/'+id,{},actor.access.token());assert.equal(response.status(),200);
            const raw=await response.json();if(raw?.menu?.shopId!==undefined)assert.equal(raw.menu.shopId,attestation.shopId);
            const menu=savedMenuResponseSchema.parse(raw).menu;assert.equal(menu.id,id);return menu;};
        const validateBefore=(before,expected)=>{assert.equal(before.version,expected.version);assert.equal(before.foodVersion,expected.foodVersion);
            assert.equal(before.isPublished,expected.isPublished);assert.equal(foodHash(before),expected.foodSha256);
            if(Object.hasOwn(expected,'publicationConfirmedFoodVersion'))assert.equal(before.publicationConfirmedFoodVersion,expected.publicationConfirmedFoodVersion);
            if(Object.hasOwn(expected,'reviewsSha256')){assert.equal(before.reviewedFoodVersion,expected.reviewedFoodVersion);assert.equal(createHash('sha256').update(canonical(before.foodReviews)).digest('hex'),expected.reviewsSha256);}};
        if(policy.preReadAll){stage='OWNER_PREFLIGHT';for(const expected of attestation.fixtures)validateBefore(await read(expected.id),expected);}
        for(const expected of attestation.fixtures){
            const entry={id:expected.id,state:'NOT_CONFIRMED',stopAttempted:false};result.fixtures.push(entry);stage='OWNER_READ';
            const before=await read(expected.id);validateBefore(before,expected);
            await emit('CLEANUP_OWNER_STATE_MATCHED',expected.id,200);
            if(!before.isPublished){entry.state='NO_WRITE_ALREADY_PRIVATE';await emit('CLEANUP_NO_WRITE_PRIVATE',expected.id);continue;}
            stage='STOP_PRE_SEND';policy.assertProof(attestation);owned();await actor.access.ensureToken();owned();
            const url=attestation.origin+'/api/admin/menus/'+expected.id+'/stop';
            assert.ok(result.stopAttempts<policy.maxStops);
            entry.stopAttempted=true;result.stopAttempts++;await emit('CLEANUP_STOP_INTENT',expected.id);
            if(policy.revalidateBeforeFetch){policy.assertProof(attestation);owned();}
            stage='STOP';
            // Deliberately omit data/body: the stop endpoint's approved contract is an empty POST.
            const response=await actor.context.request.fetch(url,{method:'POST',headers:scopedOidcHeaders(url,
                {Origin:attestation.origin},actor.access.token()),maxRedirects:0,maxRetries:0,timeout:20000,failOnStatusCode:false});
            const status=response.status(),requestId=response.headers?.()['x-request-id'];await emit('CLEANUP_STOP_STATUS',expected.id,status,requestId);
            if(policy.requestIds){assert.match(requestId,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);assert.ok(!policy.requestIds.has(requestId));policy.requestIds.add(requestId);}
            assert.equal(status,200);const body=await response.json();assert.equal(body?.ok,true);assert.equal(body.menu?.id,expected.id);
            assert.equal(body.menu.isPublished,false);assert.ok(Number.isSafeInteger(body.menu.version)&&body.menu.version<=2147483647);
            assert.equal(body.menu.version,before.version+1);
            stage='STOP_READBACK';const after=await read(expected.id);assert.equal(after.isPublished,false);assert.equal(after.version,body.menu.version);
            assert.equal(after.foodVersion,before.foodVersion);assert.equal(foodHash(after),expected.foodSha256);
            assert.equal(after.publicationConfirmedFoodVersion,before.publicationConfirmedFoodVersion);
            assert.equal(after.reviewedFoodVersion,before.reviewedFoodVersion);assert.deepEqual(after.foodReviews,before.foodReviews);
            entry.state='PRIVATE_API_CONFIRMED';entry.version=after.version;await emit('CLEANUP_PRIVATE_API_CONFIRMED',expected.id,200,requestId);
        }
        if(policy.verifyAllAfter){stage='OWNER_FINAL_READ';for(const expected of attestation.fixtures)validateBefore(await read(expected.id),{...expected,version:expected.version+1,isPublished:false});}
        result.status='KNOWN_FIXTURES_PRIVATE_API_CONFIRMED';
    }catch{result.failureStage=stage;result.errorClass='MANAGED_KNOWN_FIXTURE_CLEANUP_HELD';}
    return result;
}

// Exact finite cleanup only. Runtime IDs come from the genuine prior artifact,
// not a second menu registry. This does not enable FULL/T2 continuation.
export function assertExact8CleanupInput(input,now=Date.now()){
    try{
        const hash=v=>createHash('sha256').update(managedResumeCanonical(v)).digest('hex');
        const exact=(v,keys)=>assert.ok(v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)));
        exact(input,['operation','authorization','identityReceipt','cleanupCheckpoint','cleanupReceipt','executionApproval']);
        assert.equal(input.operation,'EXACT_T2_CLEANUP8');exact(input.identityReceipt,['project','projectId','origin','deployment','source','alias','environment','status','observedUtc','verifiedBy','evidenceReference','protectionVerified','protectionMode','productionTarget']);assertIdentityReceipt(input.identityReceipt,now);
        assert.equal(input.identityReceipt.protectionVerified,true);assert.equal(input.identityReceipt.protectionMode,'ALL_DEPLOYMENTS');assert.equal(input.identityReceipt.productionTarget,false);
        const a=input.authorization,cp=input.cleanupCheckpoint,p=input.cleanupReceipt;
        exact(a,['status','scope','verifiedBy','evidenceReference','approvedUtc','limits','sourceSha256']);
        assert.equal(a.status,'APPROVED');assert.equal(a.scope,'EXACT_T2_CLEANUP8');assert.equal(a.verifiedBy,'human');assert.match(a.evidenceReference,/^Sentinel_[a-f0-9]{32,64}$/);
        assert.ok(Number.isFinite(Date.parse(a.approvedUtc))&&Date.parse(a.approvedUtc)<=now);
        const e=input.executionApproval;exact(e,['status','scope','verifiedBy','evidenceReference','actionsReadApproved','singleAttempt','runnerSha','operation','inputSha256']);
        assert.equal(e.status,'APPROVED');assert.equal(e.scope,'FULL_RESUME_WITH_ACTIONS_READ');assert.equal(e.verifiedBy,'human');assert.equal(e.evidenceReference,a.evidenceReference);
        assert.equal(e.actionsReadApproved,true);assert.equal(e.singleAttempt,true);assert.match(e.runnerSha,/^[a-f0-9]{40}$/);assert.equal(e.operation,input.operation);
        assert.equal(e.inputSha256,hash(Object.fromEntries(Object.entries(input).filter(([k])=>k!=='executionApproval'))));
        assert.deepEqual(a.limits,{priorMenuWrites:58,priorSessions:10,maximumMenuWrites:66,maximumSessions:12,maximumStops:8,maximumNewSessions:2,globalMenuWrites:138,globalSessions:18});
        exact(cp,['version','result','source','failedAttempt']);assert.equal(cp.version,2);assert.equal(a.sourceSha256,hash(cp));
        exact(cp.source,['githubRunId','runnerSha','artifactSha256','jobTerminal','pendingRequests']);
        assert.match(cp.source.githubRunId,/^\d{1,20}$/);assert.match(cp.source.runnerSha,/^[a-f0-9]{40}$/);assert.match(cp.source.artifactSha256,/^[a-f0-9]{64}$/);
        assert.equal(cp.source.jobTerminal,true);assert.equal(cp.source.pendingRequests,0);
        const r=cp.result,c=r.controller;assert.equal(r.target?.source,target.source);assert.equal(r.target?.deployment,target.deployment);assert.equal(r.target?.origin,target.origin);
        assert.equal(r.livePass,false);assert.equal(r.sessionConsumption,9);assert.equal(r.evidencePersistenceComplete,true);
        assert.equal(c?.kind,'T2_REOBSERVATION_PREFIX');assert.equal(c.status,'HOLD_T2_REOBSERVATION_NO_RETRY_OR_CLEANUP');assert.equal(c.firstFailure?.stage,'BASELINE');
        assert.equal(c.applicationSha,target.source);assert.equal(c.deployment,target.deployment);assert.equal(c.automaticRetry,false);assert.equal(c.automaticCleanup,false);
        assert.deepEqual(c.counts,{menus:11,createAttempts:11,menuWrites:58,shopWrites:0,blobUploads:0,sessions:9,denialRequests:0});
        assert.equal(c.claims.length,16);const ids=new Map(),requests=new Set(),states=new Map();
        const order=[...['M05','M06','M07','M08'].map(key=>['B_CLEANUP',key]),...['M01','M02','M05','M06'].map(key=>['RESET',key]),...Array.from({length:8},(_,i)=>['BASELINE_PUBLISH','M0'+(i+1)])];
        for(const [i,x] of c.claims.entries()){
            const [phase,key]=order[i],owner=Number(key.slice(1))<=4?'S1':'S2',pub=phase==='BASELINE_PUBLISH';
            assert.equal(x.id,'REOBSERVE_T2_'+phase+'_'+key);assert.equal(x.phase,phase);assert.equal(x.key,key);assert.equal(x.owner,owner);assert.equal(x.kind,'MENU_WRITE');
            assert.equal(x.state,'CONFIRMED_RESPONSE_AND_READBACK');assert.equal(x.uiObserved,false);assert.match(x.requestId,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);assert.ok(!requests.has(x.requestId));requests.add(x.requestId);
            assert.match(x.after?.id,/^c[a-z0-9]+$/);assert.equal(x.before.id,x.after.id);assert.equal(x.before.owner,owner);assert.equal(x.after.owner,owner);
            if(ids.has(key))assert.equal(ids.get(key),x.after.id);else{assert.ok(![...ids.values()].includes(x.after.id));ids.set(key,x.after.id);}
            if(states.has(x.after.id))assert.deepEqual(x.before,states.get(x.after.id));
            assert.equal(x.after.isPublished,pub);assert.ok(Number.isSafeInteger(x.after.version)&&Number.isSafeInteger(x.after.foodVersion)&&x.after.foodVersion>=0&&x.after.foodVersion<=x.after.version&&x.after.version<=2147483647);
            assert.equal(x.after.reviewedFoodVersion,null);assert.match(x.after.foodSha256,/^[a-f0-9]{64}$/);assert.match(x.after.reviewsSha256,/^[a-f0-9]{64}$/);
            assert.deepEqual(x.resource,{method:phase==='B_CLEANUP'?'POST':'PUT',path:'/api/admin/menus/'+x.after.id+(phase==='B_CLEANUP'?'/stop':''),shopId:managedActorIdentity[owner].shopId,menuId:x.after.id,purpose:'CORE',beforeVersion:x.before.version});
            if(phase==='RESET'){assert.equal(x.before.isPublished,false);assert.ok(x.after.version>x.before.version&&x.after.foodVersion>x.before.foodVersion);assert.equal(x.after.publicationConfirmedFoodVersion,null);}
            else{assert.equal(x.before.isPublished,!pub);assert.equal(x.after.version,x.before.version+(pub?3:1));assert.equal(x.after.foodVersion,x.before.foodVersion);assert.equal(x.after.foodSha256,x.before.foodSha256);assert.equal(x.after.publicationConfirmedFoodVersion,pub?x.before.foodVersion:x.before.publicationConfirmedFoodVersion);}
            assert.equal(x.after.reviewsSha256,x.before.reviewsSha256);states.set(x.after.id,x.after);
        }
        assert.equal(ids.size,8);assert.equal(states.size,8);
        exact(p,['source','readOnly','verifiedBy','project','branch','database','role','applicationSha','deployment','sourceSha256','knownTerminal','unknownResolved','exclusive','pendingRequests','menuWrites','sessionConsumption','allNineSessionsClosed','requestIds','rows','sessionClosures','sqlObservedUtc','observedUtc']);
        assert.equal(p.source,'INDEPENDENT_READ_ONLY');assert.equal(p.readOnly,true);assert.ok(['human','cli_metadata_observer'].includes(p.verifiedBy));
        assert.equal(p.project,'patient-heart-55595249');assert.equal(p.branch,'br-flat-wildflower-aoeragrs');assert.equal(p.database,'clearallergy_main19');assert.equal(p.role,'neondb_owner');
        assert.equal(p.applicationSha,target.source);assert.equal(p.deployment,target.deployment);assert.equal(p.sourceSha256,hash(cp));
        for(const k of ['knownTerminal','unknownResolved','exclusive','allNineSessionsClosed'])assert.equal(p[k],true);
        assert.equal(p.pendingRequests,0);assert.equal(p.menuWrites,58);assert.equal(p.sessionConsumption,10);
        const sql=Date.parse(p.sqlObservedUtc),at=Date.parse(p.observedUtc);assert.ok(Number.isFinite(sql)&&Number.isFinite(at)&&sql<=at&&at<=now&&now-sql<=3600000);
        assert.equal(p.requestIds.length,58);assert.equal(new Set(p.requestIds).size,58);assert.ok(p.requestIds.every(x=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x)));assert.ok([...requests].every(x=>p.requestIds.includes(x)));
        assert.equal(p.rows.length,8);assert.equal(new Set(p.rows.map(x=>x.id)).size,8);const owners={S1:[],S2:[]};
        for(const row of p.rows){exact(row,['id','owner','version','foodVersion','isPublished','reviewedFoodVersion','publicationConfirmedFoodVersion','foodSha256','reviewsSha256','ownerMatches']);assert.equal(row.ownerMatches,true);
            const {ownerMatches,...projection}=row;assert.equal(ownerMatches,true);assert.deepEqual(projection,states.get(row.id));assert.equal(row.isPublished,true);owners[row.owner].push({...projection});}
        assert.equal(owners.S1.length,4);assert.equal(owners.S2.length,4);assert.equal(r.sessionAttempts.length,2);assert.equal(r.sessionFinalizations.length,2);assert.equal(p.sessionClosures.length,2);
        const sessionIds=new Set();for(const role of ['S1','S2']){const slot=r.sessionAttempts.find(x=>x.owner===role),fin=r.sessionFinalizations.find(x=>x.owner===role),s=slot?.sessionIdentity,e=p.sessionClosures.find(x=>x.owner===role);
            assert.equal(s?.ownerId,managedActorIdentity[role].ownerId);assert.equal(s.ownerVerified,true);assert.match(s.id,/^sess_[A-Za-z0-9]{1,128}$/);assert.ok(!sessionIds.has(s.id));sessionIds.add(s.id);assert.equal(fin?.localClosed,true);assert.equal(fin.sessionIdentity?.id,s.id);
            exact(e,['owner','sessionId','providerCreatedUtc','method','terminated','localClosed','observedUtc']);assert.equal(e.sessionId,s.id);assert.equal(e.providerCreatedUtc,s.providerCreatedUtc);assert.equal(e.terminated,true);assert.equal(e.localClosed,true);
            assert.ok(['PROVIDER_TERMINAL','DASHBOARD_REVOKED_RELOAD_ABSENT'].includes(e.method));if(e.method==='PROVIDER_TERMINAL')assert.equal(s.providerTerminationConfirmed,true);
            const created=Date.parse(s.providerCreatedUtc),ended=Date.parse(e.observedUtc);assert.ok(Number.isFinite(created)&&Number.isFinite(ended)&&created<=ended&&ended<=at&&created<=sql);
        }
        // Preserve the additional charged authentication attempt; the original
        // nine-session source is still verified separately and is never reset.
        const failed=cp.failedAttempt;exact(failed,['result','source','closure']);
        exact(failed.source,['githubRunId','runnerSha','artifactSha256','jobTerminal','pendingRequests']);
        assert.match(failed.source.githubRunId,/^\d{1,20}$/);assert.notEqual(failed.source.githubRunId,cp.source.githubRunId);assert.match(failed.source.runnerSha,/^[a-f0-9]{40}$/);assert.match(failed.source.artifactSha256,/^[a-f0-9]{64}$/);assert.equal(failed.source.jobTerminal,true);assert.equal(failed.source.pendingRequests,0);
        const f=failed.result;exact(f,['status','scope','livePass','sourceRunId','counts','sessionAttempts','owners','evidencePersistenceComplete','automaticRetry','automaticCleanup','independentDatabase']);
        assert.equal(f.status,'HOLD_EXACT8_CLEANUP');assert.equal(f.scope,'EXACT_T2_CLEANUP8');assert.equal(f.livePass,false);assert.equal(f.sourceRunId,cp.source.githubRunId);
        assert.deepEqual(f.counts,{menus:11,menuWrites:58,sessions:10,shopWrites:0,blobUploads:0});assert.deepEqual(f.owners,[]);assert.equal(f.evidencePersistenceComplete,true);assert.equal(f.automaticRetry,false);assert.equal(f.automaticCleanup,false);assert.equal(f.independentDatabase,'NOT_ATTESTED');
        assert.deepEqual(f.sessionAttempts,[{index:10,owner:'S2',consumedBeforeAuthentication:true,sessionIdentity:null,finalization:null}]);
        const z=failed.closure;exact(z,['owner','sessionId','method','terminated','uniqueInSourceRunWindow','createdMinuteUtc','observedUtc','loadedDevices','targetRows','priorWindowsRows']);
        assert.equal(z.owner,'S2');assert.match(z.sessionId,/^sess_[A-Za-z0-9]{1,128}$/);assert.ok(!sessionIds.has(z.sessionId));assert.equal(z.method,'DASHBOARD_REVOKED_RELOAD_ABSENT');
        assert.equal(z.terminated,true);assert.equal(z.uniqueInSourceRunWindow,true);assert.equal(z.loadedDevices,true);assert.equal(z.targetRows,0);assert.equal(z.priorWindowsRows,1);
        const minute=Date.parse(z.createdMinuteUtc),ended=Date.parse(z.observedUtc);assert.ok(Number.isFinite(minute)&&minute%60000===0&&Number.isFinite(ended)&&minute<=ended&&ended<=sql);
        return {cleanup:true,owners,requestIds:[...p.requestIds],source:structuredClone(cp.source),checkpointKey:hash({operation:input.operation,source:a.sourceSha256,approval:a.evidenceReference}),limits:structuredClone(a.limits)};
    }catch{throw Error('EXACT8_CLEANUP_ADMISSION_REFUSED');}
}

export async function executeExact8Cleanup(input,{env=process.env,chromium,claimDirectory,openActor=openManagedOwnedActor}={}){
    const frozen=structuredClone(input),admission=assertExact8CleanupInput(frozen);assert.equal(env.GITHUB_SHA,frozen.executionApproval.runnerSha);assert.equal(typeof claimDirectory,'string');
    const directory=resolve(claimDirectory);mkdirSync(directory,{recursive:false});assert.equal(lstatSync(directory).isSymbolicLink(),false);
    const report={status:'HOLD_EXACT8_CLEANUP',scope:'EXACT_T2_CLEANUP8',livePass:false,sourceRunId:admission.source.githubRunId,
        counts:{menus:11,menuWrites:58,sessions:10,shopWrites:0,blobUploads:0},sessionAttempts:[],owners:[],evidencePersistenceComplete:true,automaticRetry:false,automaticCleanup:false,independentDatabase:'NOT_ATTESTED'};
    const requestIds=new Set(admission.requestIds),intents=new Set(),sessionIds=new Set([...frozen.cleanupCheckpoint.result.sessionAttempts.map(x=>x.sessionIdentity.id),frozen.cleanupCheckpoint.failedAttempt.closure.sessionId]);let event=0;
    const persist=(name,value)=>{let fd;try{fd=openSync(join(directory,name+'.json'),'wx',0o600);writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}catch{report.evidencePersistenceComplete=false;throw Error('EXACT8_JOURNAL_HELD');}finally{if(fd!==undefined)closeSync(fd);}};
    const safeSession=(s,role)=>{if(!s||s.ownerId!==managedActorIdentity[role].ownerId||!/^sess_[A-Za-z0-9]{1,128}$/.test(s.id||''))return null;
        return {id:s.id,ownerId:s.ownerId,providerCreatedUtc:Number.isFinite(Date.parse(s.providerCreatedUtc))?s.providerCreatedUtc:null,ownerVerified:s.ownerVerified===true,
            providerTerminationConfirmed:s.providerTerminationConfirmed===true,providerStatus:['active','pending','ended','revoked','removed','expired','abandoned','replaced'].includes(s.providerStatus)?s.providerStatus:'OTHER'};};
    try{persist('admission',{operation:frozen.operation,claim:admission.checkpointKey,limits:admission.limits,sourceRunId:admission.source.githubRunId});
        for(const owner of ['S2','S1']){assertExact8CleanupInput(frozen);assert.equal(report.counts.sessions<12,true);
            const index=report.counts.sessions+1,slot={index,owner,consumedBeforeAuthentication:true,sessionIdentity:null,finalization:null};report.counts.sessions++;report.sessionAttempts.push(slot);
            persist('session-attempt-'+index,{index,owner,consumedBeforeAuthentication:true});let actor;
            const record=value=>{const s=safeSession(value?.sessionIdentity||value?.finalization?.sessionIdentity,owner);if(s){
                    if(slot.sessionIdentity)assert.equal(s.id,slot.sessionIdentity.id);else{assert.equal(sessionIds.has(s.id),false);sessionIds.add(s.id);}
                    // Clerk emits the created ID before the canonical lookup supplies
                    // created_at/owner verification. Retain that partial ID for cleanup;
                    // it grants no permission to read or stop a menu.
                    if(s.ownerVerified||s.providerCreatedUtc!==null){const created=Date.parse(s.providerCreatedUtc);assert.ok(Number.isFinite(created)&&created>=Date.parse(frozen.cleanupReceipt.sqlObservedUtc)-30000&&created<=Date.now()+30000);}slot.sessionIdentity=s;}
                if(value?.finalization)slot.finalization={complete:value.finalization.complete===true,authenticationCleanup:value.finalization.authenticationCleanup==='SIGNOUT_CONFIRMED'?'SIGNOUT_CONFIRMED':'SIGNOUT_UNVERIFIED',sessionIdentity:s,localClosed:value.finalization.localClose?.allLocalClosed===true};
                persist('session-observation-'+(++event),{owner,sessionIdentity:slot.sessionIdentity,finalization:slot.finalization,stage:/^[A-Z0-9_]{1,100}$/.test(value?.stage||'')?value.stage:'OTHER'});};
            try{actor=await openActor({role:owner,chromium,env:{...env,ISSUE118_MANAGED_SCOPE:'MAX32_103_4_5_7'},identityReceipt:frozen.identityReceipt,record});
                assert.ok(slot.sessionIdentity?.ownerVerified&&Number.isFinite(Date.parse(slot.sessionIdentity.providerCreatedUtc)));
                // Legacy SDK scope selects the already-approved identities only;
                // exact admission and the durable 10 -> 11/12 charge own this budget.
                const result=await executeManagedFixtureCleanup({actor,proof:null,record:async x=>{
                    if(x.stage==='CLEANUP_STOP_INTENT'){assert.equal(intents.has(x.id),false);assert.equal(report.counts.menuWrites<66,true);intents.add(x.id);report.counts.menuWrites++;}
                    persist('cleanup-event-'+(++event),{owner,...x});}},
                {owner,maxStops:4,preReadAll:true,verifyAllAfter:true,revalidateBeforeFetch:true,requestIds,
                    assertProof:()=>{const a=assertExact8CleanupInput(frozen);return {origin:target.origin,ownerId:managedActorIdentity[owner].ownerId,shopId:managedActorIdentity[owner].shopId,fixtures:a.owners[owner]};}});
                report.owners.push({owner,...result});assert.equal(result.status,'KNOWN_FIXTURES_PRIVATE_API_CONFIRMED');assert.equal(result.stopAttempts,4);
            }finally{if(actor){try{const fin=await actor.finalize(),ended=safeSession(fin.sessionIdentity,owner);assert.ok(ended&&slot.sessionIdentity&&ended.id===slot.sessionIdentity.id);slot.sessionIdentity=ended;
                        slot.finalization={complete:fin.complete===true,authenticationCleanup:fin.authenticationCleanup==='SIGNOUT_CONFIRMED'?'SIGNOUT_CONFIRMED':'SIGNOUT_UNVERIFIED',sessionIdentity:slot.sessionIdentity,localClosed:fin.localClose?.allLocalClosed===true};}
                    catch{slot.finalization={complete:false,authenticationCleanup:'SIGNOUT_UNVERIFIED',sessionIdentity:slot.sessionIdentity,localClosed:false};}}
                persist('session-end-'+index,{index,owner,finalization:slot.finalization});}
            assert.equal(slot.finalization?.complete,true);assert.equal(slot.finalization.localClosed,true);assert.equal(slot.finalization.authenticationCleanup,'SIGNOUT_CONFIRMED');
            assert.equal(slot.sessionIdentity?.ownerVerified,true);assert.equal(slot.sessionIdentity?.providerTerminationConfirmed,true);assert.ok(Number.isFinite(Date.parse(slot.sessionIdentity?.providerCreatedUtc)));
        }
        assert.equal(report.counts.menuWrites,66);assert.equal(report.counts.sessions,12);assert.equal(report.evidencePersistenceComplete,true);report.status='EXACT8_PRIVATE_API_CONFIRMED_PENDING_SQL';
    }catch{report.status=report.evidencePersistenceComplete?'HOLD_EXACT8_CLEANUP':'HOLD_EXACT8_PERSISTENCE';}
    return report;
}

// Pre-authentication metadata check only. It does not manufacture menu/API evidence,
// prove the SQL observation, or authorize continuation without the owner-API check below.
export function assertManagedT1ResumeProofMetadata(proof,now=Date.now()) {
    try {
        const expected={githubRunId:'41489714874',applicationSha:'8bf5bea476d5cf5a8dd6ac38713a2d393d7460b1',
            deployment:'dpl_14PXhbZ9EnKuiL2kTQwbuU7d5ebo',
            origin:'https://clear-allergy-e2e-qs7v9eaim-kaitoexe00-9350s-projects.vercel.app',
            fixtureId:'cmvziwd1k0001js07pqfoctkr',creationOperationId:'58f43e90-d322-4558-b9c0-c54586104249',
            requestId:'d73feda8-00e9-43a4-b984-4f85dc57b2e5',ownerId:'user_3LFy4E2hco0VpC63CbjjMjOznIx',shopId:'cmvs4x80y000twn0wbxkwzbt6',
            name:'【架空・Issue118 runner】ひよこ豆サラダ 8d40b351',
            version:29,foodVersion:29,priceYen:1000,isPublished:false,imageUrl:null,allergenCount:29,freeCount:29,
            publicationConfirmationCount:0,foodReviewCount:0,issueResolutionCount:0,createAuditCount:1,
            uniqueCreationCount:1,successfulCreateAuditRequestCount:1};
        assert.equal(target.source,expected.applicationSha);assert.equal(target.deployment,expected.deployment);assert.equal(target.origin,expected.origin);
        assert.equal(ciIdentity.ownerId,expected.ownerId);
        const keys=[...Object.keys(expected),'source','verifiedBy','observedUtc','evidenceReference','knownTerminal','sessionsEnded','pendingRequests','sourceWindow'];
        assert.ok(proof&&Object.getPrototypeOf(proof)===Object.prototype&&Object.keys(proof).length===keys.length&&keys.every(k=>Object.hasOwn(proof,k)));
        for(const [key,value] of Object.entries(expected))assert.equal(proof[key],value);
        assert.equal(proof.source,'INDEPENDENT_READ_ONLY');assert.equal(proof.verifiedBy,'cli_metadata_observer');
        assert.equal(proof.evidenceReference,'https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/'+expected.githubRunId);
        assert.equal(proof.knownTerminal,true);assert.equal(proof.sessionsEnded,true);assert.equal(proof.pendingRequests,0);
        const window=proof.sourceWindow;
        assert.ok(window&&Object.keys(window).length===2&&Object.hasOwn(window,'startedUtc')&&Object.hasOwn(window,'finishedUtc'));
        assert.equal(window.startedUtc,'2026-11-02T17:17:58.614Z');assert.equal(window.finishedUtc,'2026-11-02T17:19:07.788Z');
        assert.match(proof.observedUtc,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
        const observed=Date.parse(proof.observedUtc),age=now-observed;
        assert.ok(Number.isFinite(now)&&Number.isFinite(observed)&&observed>=Date.parse(window.finishedUtc)&&age>=0&&age<=3600000);
        return Object.freeze({...expected,attestationFormatMatched:true,independentDatabase:'EXTERNAL_ATTESTER_REQUIRED'});
    }catch{throw Error('MANAGED_T1_RESUME_PROOF_REFUSED');}
}

// Pure validation for one already-created fictional T1. Current owner-API values
// remain mandatory after the shared pre-authentication metadata check.
export function verifyManagedT1ResumeProof({proof,menu,shop,now=Date.now()}={}) {
    try {
        const expected=assertManagedT1ResumeProofMetadata(proof,now);
        const ts=createRequire(import.meta.url)('tsx/cjs/api');
        const {savedMenuResponseSchema}=ts.require('../features/admin/menus/schemas/menu-response.ts',import.meta.url);
        const {ALLERGEN_MASTER}=ts.require('../lib/constants/allergen-master.ts',import.meta.url);
        const saved=savedMenuResponseSchema.parse({menu}).menu;
        assert.equal(shop?.id,expected.shopId);if(menu.shopId!==undefined)assert.equal(menu.shopId,expected.shopId);
        for(const key of ['name','version','foodVersion','priceYen','isPublished','imageUrl'])assert.equal(saved[key],expected[key]);
        assert.equal(saved.id,expected.fixtureId);assert.equal(saved.ingredients,'ひよこ豆、共通ドレッシング');
        assert.equal(saved.description,'Issue118専用の架空検証。実食品ではありません。');
        assert.equal(saved.reviewedFoodVersion,null);assert.equal(saved.publicationConfirmedFoodVersion,null);assert.equal(saved.foodReviews.length,0);
        assert.equal(ALLERGEN_MASTER.length,29);assert.equal(saved.allergens.length,29);
        const statuses=new Map(saved.allergens.map(a=>[a.slug,a.status]));assert.equal(statuses.size,29);
        assert.ok(ALLERGEN_MASTER.every(a=>statuses.get(a.slug)==='FREE'));
        const externalConfirmation=Object.freeze({sourceRunId:expected.githubRunId,evidenceReference:proof.evidenceReference,observedUtc:proof.observedUtc});
        return Object.freeze({fixtureId:expected.fixtureId,name:expected.name,nextPhase:'INITIAL_PUBLISH',attestationFormatMatched:true,
            independentDatabase:'EXTERNAL_ATTESTER_REQUIRED',confirmedCreate:Object.freeze({phase:'CREATE',state:'CONFIRMED_SUCCESS',requestSent:true,
                bodyValidated:true,httpStatus:201,createdId:expected.fixtureId,creationOperationId:expected.creationOperationId,
                requestId:expected.requestId,auditActionExpected:'menu_create',externalConfirmation})});
    }catch{throw Error('MANAGED_T1_RESUME_PROOF_REFUSED');}
}

export async function readManagedResumeBeforePublish({proof,read,shop,onRefusal,now=Date.now()}){
    try{
        const menu=await read(proof.fixtureId);
        verifyManagedT1ResumeProof({proof,menu,shop,now});return menu;
    }catch{onRefusal();throw Error('MANAGED_T1_RESUME_PROOF_REFUSED');}
}

// One nonpersistent context per pinned owner. No imported profile/storageState.
// Read-only gate on an already owned/authenticated page; never logs in, sets a
// session, mutates data or performs cleanup. No URL/key/identity/body/error values
// enter this diagnostic. A successful gate is not independent isolation proof.
export async function verifyManagedOwnedPage({role,page,context,access,navigate=true,navigationResponse,
    routeFailed=()=>false,record=()=>{},timeoutMs=20000}={}){
    const r={owner:['S1','S2'].includes(role)?role:'UNKNOWN',stage:'INPUT',failureStage:null,code:'HOLD',verified:false,
        contextMatched:false,navigationAttempted:false,navigationCompleted:false,http200:false,fixedPageMatched:false,
        hydrationWaitAttempted:false,hydrationWaitCompleted:false,hydrationSnapshotObserved:false,
        clerkLoaded:false,frontendOwnerMatched:false,publishableKeyChecked:false,publishableKeyMatched:false,
        ownApiReadAttempted:false,ownApiHttp200:false,ownShopMatched:false,routeHealthy:false,
        observerFailed:false,cleanupAttempted:false};
    const emit=async()=>{try{await record(structuredClone(r));}catch{r.observerFailed=true;throw Error('MANAGED_PAGE_OBSERVER_HELD');}};
    const stage=async code=>{r.stage=code;await emit();};
    const bound=async operation=>{
        let timer;
        try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{
            timer=setTimeout(()=>reject(Error('MANAGED_PAGE_TIMEOUT')),timeoutMs);
        })]);}finally{clearTimeout(timer);}
    };
    const snapshot=async identity=>{
        const view=await bound(()=>page.evaluate(expected=>({loaded:window.Clerk?.loaded===true,
            ownerMatched:window.Clerk?.user?.id===expected,pk:window.Clerk?.publishableKey}),identity.ownerId));
        r.hydrationSnapshotObserved=true;r.clerkLoaded=view?.loaded===true;r.frontendOwnerMatched=view?.ownerMatched===true;
        return view;
    };
    try{
        assert.ok(['S1','S2'].includes(role)&&Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=30000);
        const identity=managedActorIdentity[role];
        assert.ok(page&&context&&typeof page.waitForFunction==='function'&&typeof access?.read==='function');
        r.contextMatched=page.context()===context;assert.equal(r.contextMatched,true);
        let response=navigationResponse;
        if(navigate){await stage('NAVIGATION');r.navigationAttempted=true;
            response=await bound(()=>page.goto(target.origin+'/admin/shop',{waitUntil:'domcontentloaded',timeout:timeoutMs}));
            r.navigationCompleted=true;
        }
        await stage('HTTP');r.http200=response?.status()===200;assert.equal(r.http200,true);
        await stage('PAGE_URL');r.fixedPageMatched=page.url()===target.origin+'/admin/shop';assert.equal(r.fixedPageMatched,true);
        await stage('HYDRATION_WAIT');r.hydrationWaitAttempted=true;
        try{
            await bound(()=>page.waitForFunction(expected=>window.Clerk?.loaded===true&&window.Clerk?.user?.id===expected,
                identity.ownerId,{timeout:timeoutMs}));r.hydrationWaitCompleted=true;
        }catch(error){
            // Read only fixed predicates after a failed wait; an observation
            // failure must not replace the original HYDRATION_WAIT failure.
            try{await snapshot(identity);}catch{ /* snapshotObserved remains false */ }
            let name,message;try{name=Object.getOwnPropertyDescriptor(error??{},'name')?.value;
                message=Object.getOwnPropertyDescriptor(error??{},'message')?.value;}catch{ /* unknown fixed classification */ }
            r.code=name==='TimeoutError'||message==='MANAGED_PAGE_TIMEOUT'?'HYDRATION_TIMEOUT_HELD':'HYDRATION_EXCEPTION_HELD';
            throw Error('MANAGED_PAGE_HYDRATION_HELD');
        }
        await stage('FRONTEND_IDENTITY');const frontend=await snapshot(identity);
        assert.equal(r.clerkLoaded,true);assert.equal(r.frontendOwnerMatched,true);
        // Navigation or an owner change during hydration cannot pass the gate.
        r.fixedPageMatched=page.url()===target.origin+'/admin/shop';assert.equal(r.fixedPageMatched,true);
        await stage('PUBLISHABLE_KEY');r.publishableKeyChecked=true;assertClerkPublishableKey(frontend.pk);r.publishableKeyMatched=true;
        await stage('OWN_API_STATUS');r.ownApiReadAttempted=true;
        const own=await bound(()=>access.read(context.request,target.origin+'/api/admin/shop'));
        r.ownApiHttp200=own?.status()===200;assert.equal(r.ownApiHttp200,true);
        await stage('OWN_API_SHOP');const body=await bound(()=>own.json());
        r.ownShopMatched=body?.shop?.id===identity.shopId;assert.equal(r.ownShopMatched,true);
        await stage('ROUTE_HEALTH');r.routeHealthy=routeFailed()===false;assert.equal(r.routeHealthy,true);
        r.stage='VERIFIED';r.code='OWNER_PAGE_AND_OWN_API_VERIFIED';r.verified=true;await emit();return r;
    }catch{
        r.verified=false;r.failureStage??=r.stage;
        if(r.code==='HOLD'||r.code==='OWNER_PAGE_AND_OWN_API_VERIFIED')r.code=r.observerFailed?'DIAGNOSTIC_OBSERVER_HELD':'OWNER_PAGE_GATE_HELD';
        try{await emit();}catch{ /* returned fixed diagnostics remain available to caller */ }
        return r;
    }
}

const managedResumeSessionPermits=new WeakSet();
export async function openManagedOwnedActor({role,chromium,env,identityReceipt,record=()=>{},sessionPermit}){
    assert.equal(liveTargetPinsVerified,true);assert.ok(['S1','S2'].includes(role));assertIdentityReceipt(identityReceipt);
    let actorEnv=env;
    if(['RESUME_414953_FULL_MANAGED','RESUME_414953_T2_FULL','RESUME_416276_FULL'].includes(env.ISSUE118_MANAGED_SCOPE)){
        assert.ok(managedResumeSessionPermits.has(sessionPermit)&&sessionPermit.owner===role);
        managedResumeSessionPermits.delete(sessionPermit);
        // The SDK adapter's legacy flag authorizes the same fixed A/B identities;
        // it is not the session/write budget. Extended admission and fsync charge
        // have already happened before minting this non-serializable permit.
        actorEnv={...env,ISSUE118_MANAGED_SCOPE:'MAX32_103_4_5_7'};
    }else assert.equal(env.ISSUE118_MANAGED_SCOPE,'MAX32_103_4_5_7');
    const identity=managedActorIdentity[role],tracker=createCiRouteLifecycleTracker();
    const observation={owner:role,expectedUserId:identity.ownerId,expectedShopId:identity.shopId,stage:'SETUP',gateVerified:false,sessionIdentity:null};
    let browser,context,page,access,phase='AUTHENTICATION',routeFailed=false;
    const emit=()=>record(structuredClone(observation));
    const setupStage=code=>{observation.stage=code;emit();};
    const stages=code=>{phase=code;setupStage(code);};
    const ready=()=>{const s=access.sessionObservation();assert.ok(s?.eligibleForCleanup&&s.ownerVerified);assert.equal(s.ownerId,identity.ownerId);};
    const policy=createVerifiedReadCloseAuthPolicyCandidate(identityReceipt,ready);
    try{
        access=await createCiAccess({...actorEnv,ISSUE118_SESSION_LIFECYCLE:'TRACKED_OWNER_SESSION'},fetch,setupStage,
            {session:s=>{observation.sessionIdentity=s;emit();},authentication:a=>{observation.authentication=a;emit();},
                transport:t=>{if(t.exception!=='NONE'&&t.exception!=='POLICY_REFUSED')routeFailed=true;},
                handshake:h=>{observation.handshake=h;emit();}},role);
        browser=await chromium.launch({headless:true,channel:'chromium'});
        context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:false,serviceWorkers:'block'});
        await context.route('**/*',tracker.wrap(async route=>{
            try{if(!await guardReadCloseRoute(route,()=>{routeFailed=true;},()=>{},
                {policy,getPhase:()=>phase,observe:()=>{}}))return;
                await access.route(route,undefined,()=>policy.assertBeforeSend(route.request(),()=>phase));
            }catch{routeFailed=true;observation.routeFailure=true;emit();}
        }));
        page=await context.newPage();page.setDefaultTimeout(20000);
        const {readT1KeyClassPreflight,assertT1KeyClassReady}=await import('./check-issue118-server-callback-candidate.mjs');
        observation.keyClass=await readT1KeyClassPreflight(context.request,access.token());assertT1KeyClassReady(observation.keyClass);emit();
        const navigationResponse=await access.authenticate(page);assert.equal(routeFailed,false);
        observation.ownerPageGate=await verifyManagedOwnedPage({role,page,context,access,navigate:false,navigationResponse,routeFailed:()=>routeFailed,
            record:gate=>{observation.ownerPageGate=gate;emit();}});
        assert.equal(observation.ownerPageGate.verified,true);
        observation.gateVerified=true;phase='APP_FLOW';observation.stage='OWNER_AND_SHOP_VERIFIED';emit();
        return {owner:role,expectedUserId:identity.ownerId,binding:{owner:role,shopId:identity.shopId,contextRef:'managed_'+role},
            page,context,browser,access,observation,lifecycle:{browser,tracker,onStage:stages},
            setPhase:code=>{phase=code;},routeFailed:()=>routeFailed,
            finalize:async()=>{const result=await finalizeOwnedCiActor({access,page,context,browser,expectedOwnerId:identity.ownerId,
                prepareForSignout:()=>prepareManagedSignoutPage({page,access,expectedOwnerId:identity.ownerId,drainRoutes:()=>tracker.drain()}),
                drainRoutes:()=>tracker.drain(),readRouteState:()=>tracker.snapshot(),attempts:{browserLaunchAttempted:true,contextCreateAttempted:true},onStage:stages});
                observation.finalization=result;emit();return result;}};
    }catch{observation.failureStage??=observation.ownerPageGate?.failureStage??observation.stage;observation.stage='ACTOR_GATE_HELD';
        try{await emit();}catch{observation.diagnosticPersistenceFailed=true;}
        observation.finalization=access&&page?await finalizeOwnedCiActor({access,page,context,browser,expectedOwnerId:identity.ownerId,
            prepareForSignout:()=>prepareManagedSignoutPage({page,access,expectedOwnerId:identity.ownerId,drainRoutes:()=>tracker.drain()}),
            drainRoutes:()=>tracker.drain(),readRouteState:()=>tracker.snapshot(),attempts:{browserLaunchAttempted:!!browser,contextCreateAttempted:!!context},onStage:stages})
            :await closeIsolatedBrowser(context,browser,{browserLaunchAttempted:!!browser,contextCreateAttempted:!!context});
        emit();throw Error('MANAGED_ACTOR_GATE_HELD');}
}

const managedResumeCanonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)
    ?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const managedResumeHash=v=>createHash('sha256').update(managedResumeCanonical(v)).digest('hex');
// Admission is data-only and runs before creating a directory, actor, OIDC client
// or temporary Clerk session. The explicit FULL candidate CLI repeats it before auth.
export async function assertManagedResumeActivation({authorization,identityReceipt,checkpointReceipt,snapshot,terminal,creationOperationIds,fullCheckpoint,continuationReceipt,prefixCheckpoint,prefixReceipt,rebaseCheckpoint,rebaseReceipt,operation,now=Date.now()}={}){
    try{
        const {planManaged414953Recovery,validateManagedFullCheckpoint}=await import('./issue118-managed-suite.mjs');
        const {rebasedCompletionScope,isCompletionScope,planManagedT2Completion,validateT2PrefixCheckpoint}=await import('./issue118-t2-reobserve.mjs');
        const fullT2=isCompletionScope(authorization?.scope),rebased=authorization?.scope===rebasedCompletionScope;
        if(!rebased){assert.equal(rebaseCheckpoint,undefined);assert.equal(rebaseReceipt,undefined);}
        const rebaseArgs=rebased?{rebaseCheckpoint,rebaseReceipt,historical:fullCheckpoint!==undefined||prefixCheckpoint!==undefined}:{};
        const plan=(fullT2?planManagedT2Completion:planManaged414953Recovery)({snapshot,terminal,...rebaseArgs});
        assertIdentityReceipt(identityReceipt,now);
        assert.equal(identityReceipt.protectionVerified,true);assert.equal(identityReceipt.protectionMode,'ALL_DEPLOYMENTS');
        assert.equal(identityReceipt.productionTarget,false);
        assert.equal(authorization?.status,'APPROVED');assert.ok(authorization.scope==='RESUME_414953_FULL_MANAGED'||fullT2);
        assert.equal(authorization.verifiedBy,'human');assert.match(authorization.evidenceReference,/^Sentinel_[a-f0-9]{32,64}$/);
        assert.ok(Number.isFinite(Date.parse(authorization.approvedUtc))&&Date.parse(authorization.approvedUtc)<=now);
        assert.deepEqual(authorization.limits,plan.reservedMaximum);
        assert.equal(authorization.oldClaimsSha256,plan.inherited.claimsSha256);
        assert.equal(authorization.snapshotSha256,managedResumeHash(snapshot));
        assert.equal(authorization.terminalSha256,managedResumeHash(terminal));
        assert.equal(authorization.creationIdsSha256,managedResumeHash(creationOperationIds));
        if(rebased)assert.equal(authorization.rebaseSha256,plan.rebaseBasis.hash);
        const keys=['M03','M04','M05','M06','M07','M08'];assert.deepEqual(Object.keys(creationOperationIds).sort(),keys);
        const ids=Object.values(creationOperationIds);assert.equal(new Set(ids).size,6);
        assert.ok(ids.every(id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)&&!plan.inherited.creationOperationIds.includes(id)));
        const p=checkpointReceipt;assert.equal(p?.source,'INDEPENDENT_READ_ONLY');assert.equal(p.readOnly,true);
        assert.equal(p.project,'patient-heart-55595249');assert.equal(p.branch,'br-flat-wildflower-aoeragrs');assert.equal(p.database,'clearallergy_main19');assert.equal(p.role,'neondb_owner');
        assert.equal(p.applicationSha,target.source);assert.equal(p.deployment,target.deployment);
        assert.equal(p.originalRunId,'41495319922');assert.equal(p.originalTerminal,true);assert.equal(p.unknownResolved,true);
        assert.equal(p.allSevenSessionsClosed,true);assert.equal(p.pendingRequests,0);assert.equal(p.menuWrites,42);assert.equal(p.menuCount,11);
        assert.equal(p.extraAudits,0);assert.equal(p.exclusive,true);assert.equal(p.snapshotSha256,authorization.snapshotSha256);
        assert.equal(p.terminalSha256,authorization.terminalSha256);assert.equal(p.oldClaimsSha256,authorization.oldClaimsSha256);
        assert.equal(p.requestIdsSha256,managedResumeHash([...terminal.consumedRequestIds].sort()));
        const sql=Date.parse(p.sqlObservedUtc),observed=Date.parse(p.observedUtc);
        assert.ok(Number.isFinite(sql)&&Number.isFinite(observed)&&sql>=Date.parse('2026-11-02T18:42:53.901Z')&&sql<=observed&&observed<=now&&(rebased||fullCheckpoint!==undefined||prefixCheckpoint!==undefined||now-sql<=3600000));
        assert.equal(terminal.consumedSessions,7);assert.equal(terminal.confirmedMenuWrites,42);
        if(operation==='T2_REOBSERVE_PREFIX')assert.ok(fullT2&&prefixCheckpoint===undefined&&prefixReceipt===undefined&&fullCheckpoint===undefined&&continuationReceipt===undefined);
        if(fullT2&&operation==='CORE_AND_SERVICE')assert.ok(prefixCheckpoint!==undefined&&prefixReceipt!==undefined&&fullCheckpoint===undefined&&continuationReceipt===undefined);
        if(operation==='SERVICE_NEXT')assert.ok(fullCheckpoint!==undefined&&continuationReceipt!==undefined&&prefixCheckpoint===undefined&&prefixReceipt===undefined);
        const prefixData=fullCheckpoint?.controller?.t2Prefix??(prefixCheckpoint?{checkpoint:prefixCheckpoint,receipt:prefixReceipt}:null);
        const prefix=fullT2&&prefixData?validateT2PrefixCheckpoint({snapshot,terminal,authorization,prefixCheckpoint:prefixData.checkpoint,prefixReceipt:prefixData.receipt,rebaseCheckpoint,rebaseReceipt,now,historical:fullCheckpoint!==undefined}):null;
        assert.ok(!fullT2||prefix||operation==='T2_REOBSERVE_PREFIX');assert.ok(fullT2||!prefixData);
        const restored=fullCheckpoint===undefined?null:validateManagedFullCheckpoint({snapshot,terminal,approval:authorization,creationOperationIds,fullCheckpoint,continuationReceipt,rebaseCheckpoint,rebaseReceipt,now});
        return {scope:authorization.scope,limits:structuredClone(plan.reservedMaximum),plan,restored,prefix,prefixData,completion:fullT2,rebased,baselineConsumed:rebased?12:7,
            checkpointKey:managedResumeHash({snapshot:authorization.snapshotSha256,terminal:authorization.terminalSha256,approval:authorization.evidenceReference,
                stage:restored?restored.controller.serviceArms.at(-1).id:operation==='T2_REOBSERVE_PREFIX'?'T2_PREFIX':prefix?'CORE_AFTER_T2':'INITIAL_CORE',rebase:rebased?authorization.rebaseSha256:undefined}),
            initialCounts:restored?structuredClone(restored.controller.counts):prefix?structuredClone(prefix.controller.counts):{menus:11,menuWrites:rebased?66:42,shopWrites:0,blobUploads:0,sessions:rebased?12:7}};
    }catch{throw Error('MANAGED_RESUME_ACTIVATION_NOT_APPROVED_OR_FRESH');}
}

// Same callable entry is used by memory-transport tests and future owned actors.
// Overrides substitute the transport factories, never the admission or budget
// checks. The candidate CLI additionally requires a new explicit approval and provenance.
export async function executeManagedApprovedResume(input={}){
    const {authorization,identityReceipt,snapshot,terminal,creationOperationIds,claimDirectory,rebaseCheckpoint,rebaseReceipt,
        chromium,env=process.env,image,serviceRunId,preparationState={},terminalReader,dependencies={}}=input;
    const admission=await assertManagedResumeActivation(input);
    if((input.operation??'CORE_AND_SERVICE')!==(admission.restored?'SERVICE_NEXT':input.operation==='T2_REOBSERVE_PREFIX'&&admission.completion?'T2_REOBSERVE_PREFIX':'CORE_AND_SERVICE'))throw Error('MANAGED_RESUME_STAGE_NOT_IMPLEMENTED');
    if(typeof claimDirectory!=='string'||claimDirectory.length===0)throw Error('MANAGED_RESUME_CLAIM_DIRECTORY_REQUIRED');
    const {serviceBrowserImage}=await import('./issue118-managed-service-browser.mjs');
    if(!Buffer.isBuffer(image?.buffer)||image.buffer.length!==serviceBrowserImage.bytes
        ||createHash('sha256').update(image.buffer).digest('hex')!==serviceBrowserImage.sha256
        ||typeof serviceRunId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serviceRunId)
        ||!preparationState||Object.keys(preparationState).length!==0||admission.restored&&serviceRunId!==admission.restored.controller.serviceRunId)throw Error('MANAGED_RESUME_SERVICE_INPUT_REQUIRED');
    const prefixOnly=input.operation==='T2_REOBSERVE_PREFIX',restored=admission.restored,serviceState=restored?structuredClone(restored.preparationState):preparationState;
    const {prepareManaged414953Resume}=await import('./issue118-managed-suite.mjs');
    const report={status:'LOCAL_ENTRY_ADMITTED_NOT_STARTED',target,scope:authorization.scope,livePass:false,coverage:'NOT_ATTESTED',
        transportEvidence:dependencies.openActor||dependencies.createRuntime?'INJECTED_TRANSPORT_TEST':'OWNED_PREVIEW_TRANSPORT_NOT_YET_ATTESTED',
        originalHold:snapshot.status,sessionConsumption:admission.initialCounts.sessions,sessionReservations:{normal:restored?{S1:6-restored.nextArmIndex,S2:0}:{S1:1,S2:1},recovery:{S1:1,S2:1}},
        sessionAttempts:[],sessionFinalizations:[],evidencePersistenceComplete:true,writes:'NOT_STARTED',independentDatabase:'NOT_ATTESTED',automaticRetry:false,automaticCleanup:false};
    let actorA,actorB,runtime,runtimeGuard,pendingBoundary,controller,held=false,normalA=restored?restored.nextArmIndex:0,normalB=restored?1:0,latestServiceTerminal=restored?{observedUtc:restored.receipt.observedUtc}:undefined;
    if(restored){actorB={owner:'S2',expectedUserId:managedActorIdentity.S2.ownerId,binding:{owner:'S2',shopId:managedActorIdentity.S2.shopId},closedMetadataOnly:true};}
    const closed=new WeakSet(),owned=new Set();if(actorB)closed.add(actorB);
    const safeSession=(s,owner)=>{
        if(!s||typeof s.id!=='string'||!/^sess_[A-Za-z0-9]{1,128}$/.test(s.id)||s.ownerId!==managedActorIdentity[owner].ownerId)return null;
        return {id:s.id,ownerId:s.ownerId,providerCreatedUtc:typeof s.providerCreatedUtc==='string'&&Number.isFinite(Date.parse(s.providerCreatedUtc))?s.providerCreatedUtc:null,
            ownerVerified:s.ownerVerified===true,providerTerminationConfirmed:s.providerTerminationConfirmed===true,
            providerStatus:['active','pending','ended','revoked','removed','expired','abandoned','replaced'].includes(s.providerStatus)?s.providerStatus:'OTHER'};
    };
    const directory=resolve(claimDirectory),persist=(name,value)=>{
        let fd;try{assert.match(name,/^[A-Za-z0-9_-]{1,160}$/);fd=openSync(join(directory,name+'.json'),'wx',0o600);
            writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);return true;
        }catch{return false;}finally{if(fd!==undefined)closeSync(fd);}
    };
    const checkpoint=()=>{assertIdentityReceipt(identityReceipt);return assertManagedResumeActivation({...input,now:Date.now()});};
    const record=value=>{
        // Only session metadata from the owned actor is retained. No provider URL,
        // header, key, cookie, token, raw exception or full actor object is saved.
        const owner=value?.owner;if(!['S1','S2'].includes(owner))return;
        const slot=[...report.sessionAttempts].reverse().find(s=>s.owner===owner);
        if(slot){const s=safeSession(value.sessionIdentity||value.finalization?.sessionIdentity,owner);if(s){slot.sessionIdentity=s;
                const key=managedResumeCanonical(s);
                if(slot.lastSessionObservation!==key){
                    slot.sessionObservationCount=(slot.sessionObservationCount||0)+1;slot.lastSessionObservation=key;
                    if(!persist('session-observation-'+slot.index+'-'+slot.sessionObservationCount,{index:slot.index,owner,sessionIdentity:s})){
                        held=true;report.evidencePersistenceComplete=false;
                    }
                }
            }
            if(value.finalization)slot.failedOpeningFinalization={owner,complete:value.finalization.complete===true,
                authenticationCleanup:value.finalization.authenticationCleanup==='SIGNOUT_CONFIRMED'?'SIGNOUT_CONFIRMED':'SIGNOUT_UNVERIFIED',
                sessionIdentity:safeSession(value.finalization.sessionIdentity,owner),localClosed:value.finalization.localClose?.allLocalClosed===true};
            slot.stage=/^[A-Z0-9_]{1,100}$/.test(value.stage||'')?value.stage:'OBSERVATION';}
    };
    const finalize=async actor=>{
        if(!actor||closed.has(actor))return;closed.add(actor);
        let result;try{result=await actor.finalize();}catch{result={complete:false,authenticationCleanup:'SIGNOUT_UNVERIFIED'};}
        const safe={owner:actor.owner,complete:result?.complete===true,authenticationCleanup:result?.authenticationCleanup==='SIGNOUT_CONFIRMED'?'SIGNOUT_CONFIRMED':'SIGNOUT_UNVERIFIED',
            sessionIdentity:safeSession(result?.sessionIdentity,actor.owner),localClosed:result?.localClose?.allLocalClosed===true};
        report.sessionFinalizations.push(safe);if(!safe.complete)held=true;
        if(!persist('session-end-'+report.sessionFinalizations.length,safe)){held=true;report.evidencePersistenceComplete=false;}
        return safe;
    };
    const open=async owner=>{
        await checkpoint();assert.equal(held,false);assert.ok(owner==='S1'?normalA<6:normalB<1);
        if(owner==='S1'&&normalA>0){
            assert.ok(latestServiceTerminal&&Date.now()-Date.parse(latestServiceTerminal.observedUtc)<=3600000);
            assert.ok(!actorA||closed.has(actorA));assert.ok(!actorB||closed.has(actorB));latestServiceTerminal=null;
        }
        // Recovery S1/S2 slots are never available to normal authentication.
        assert.ok(report.sessionConsumption+1+2<=admission.limits.sessions);
        if(owner==='S1')normalA++;else normalB++;
        const slot={index:report.sessionAttempts.length+1,owner,consumedBeforeAuthentication:true,startedUtc:new Date().toISOString(),stage:'AUTHENTICATION_NOT_STARTED',sessionIdentity:null};
        assert.ok(persist('session-attempt-'+slot.index,slot));report.sessionAttempts.push(slot);report.sessionConsumption++;
        const permit=Object.freeze({owner,index:slot.index});managedResumeSessionPermits.add(permit);
        let actor;try{
            actor=await (dependencies.openActor||openManagedOwnedActor)({role:owner,chromium,env:{...env,ISSUE118_MANAGED_SCOPE:authorization.scope},
                identityReceipt,record,sessionPermit:permit});
            managedResumeSessionPermits.delete(permit);
            assert.equal(actor.owner,owner);assert.equal(actor.expectedUserId,managedActorIdentity[owner].ownerId);
            assert.equal(actor.binding.shopId,managedActorIdentity[owner].shopId);assert.equal(typeof actor.finalize,'function');
            assert.ok(ownedCiActorBoundary({access:actor.access,page:actor.page,context:actor.context,browser:actor.lifecycle?.browser,
                expectedOwnerId:actor.expectedUserId,drainRoutes:()=>actor.lifecycle.tracker.drain(),readRouteState:()=>actor.lifecycle.tracker.snapshot()},true));
            owned.add(actor);slot.stage='OWNER_AND_SESSION_CONFIRMED';slot.sessionIdentity=safeSession(actor.access.sessionObservation(),owner);
            assert.ok(slot.sessionIdentity);assert.equal(held,false);assert.ok(persist('session-created-'+slot.index,{index:slot.index,owner,sessionIdentity:slot.sessionIdentity}));return actor;
        }catch{managedResumeSessionPermits.delete(permit);held=true;slot.stage='AUTHENTICATION_UNCERTAIN_NO_RETRY';
            if(actor)await finalize(actor);else if(slot.failedOpeningFinalization){report.sessionFinalizations.push(slot.failedOpeningFinalization);
                if(!persist('session-end-'+report.sessionFinalizations.length,slot.failedOpeningFinalization))report.evidencePersistenceComplete=false;}
            throw Error('MANAGED_RESUME_AUTH_HELD');}
    };
    const bindRuntime=async suppliedCheckpoint=>{
        assert.ok(actorA&&actorB);const state=controller.snapshot();
        if(runtimeGuard){assert.equal(await runtimeGuard.remove(),true);runtimeGuard=undefined;}
        const initialFixtures=snapshot.fixtures.map(f=>{const c=snapshot.claims.find(c=>c.kind==='MENU_CREATE'&&c.createdId===f.id),m=/^(T[23])_(M0[1-8])_CREATE$/.exec(c?.id||'');
            return {...f,...(m?{scenario:m[1],key:m[2]}:{})};});
        runtime=(dependencies.createRuntime||createManagedRuntimePorts)({actors:[actorA,actorB],claimDirectory:directory,t1FixtureId:'cmvziwd1k0001js07pqfoctkr',
            operation:'RESUME_CORE',checkpointFixtures:initialFixtures,...(!prefixOnly?{resumeCheckpoint:suppliedCheckpoint||{
                knownFixtures:state.knownFixtures,newClaims:state.newClaims,terminalCreationBindings:state.terminalCreationBindings||[]}}:{}),
            ...(!prefixOnly?{serviceConfig:{runId:serviceRunId,identityReceipt,image,preparationState:serviceState}}:{}),record:()=>{}});
        assert.ok(runtime.resumePorts);if(pendingBoundary)runtimeGuard=await runtime.ports.installSendGuard(pendingBoundary);
    };
    const call=(name,...args)=>{assert.equal(held,false);assert.equal(typeof runtime?.resumePorts?.[name],'function');return runtime.resumePorts[name](...args);};
    const ports={
        verifyApproval:async()=>{await checkpoint();return true;},verifyCheckpoint:async()=>{await checkpoint();return true;},
        reserveRecoveryBudget:async value=>{
            assert.equal(value.scope,authorization.scope);assert.ok(['OWNER_SESSIONS','STOP_WRITE','CONTINUATION_RESERVATIONS','T2_PREFIX_OWNER_SESSIONS'].includes(value.type));
            if(value.type==='T2_PREFIX_OWNER_SESSIONS'){assert.ok(prefixOnly);assert.deepEqual(value.normal,{S1:1,S2:1});assert.deepEqual(value.recovery,{S1:1,S2:1});assert.deepEqual(value.limits,admission.limits);return persist('t2-owner-reservations',value);}
            if(value.type==='CONTINUATION_RESERVATIONS'){
                assert.ok(restored);assert.deepEqual(value.normal,{S1:6-restored.nextArmIndex,S2:0});assert.deepEqual(value.recovery,{S1:1,S2:1});
                assert.deepEqual(value.limits,admission.limits);assert.equal(value.priorSessionConsumption,report.sessionConsumption);
                assert.equal(value.checkpointSha256,restored.checkpointSha256);return persist('continuation-recovery-reservations',value);
            }
            if(value.type==='OWNER_SESSIONS'){
                assert.deepEqual(value.normal,{S1:1,S2:1});assert.deepEqual(value.recovery,{S1:1,S2:1});assert.deepEqual(value.limits,admission.limits);
                return persist('owner-recovery-reservations',{type:value.type,scope:value.scope,limits:value.limits,normal:value.normal,recovery:value.recovery,oldClaimsSha256:authorization.oldClaimsSha256});
            }
            assert.match(value.menuId,/^c[a-z0-9]+$/);assert.ok(['S1','S2'].includes(value.owner));assert.equal(value.slots,1);assert.match(value.sourceClaimId,/^[A-Za-z0-9_-]{1,128}$/);
            return persist('stop-reservation-'+value.menuId+'-'+managedResumeHash(value.sourceClaimId).slice(0,32),{type:value.type,scope:value.scope,menuId:value.menuId,owner:value.owner,sourceClaimId:value.sourceClaimId,slots:1});
        },
        claimOperation:async claim=>persist('operation-'+claim.id,claim),
        installSendGuard:async boundary=>{assert.equal(pendingBoundary,undefined);pendingBoundary=boundary;
            if(runtime)runtimeGuard=await runtime.ports.installSendGuard(boundary);
            return {beforeSend:true,remove:async()=>{if(runtimeGuard){assert.equal(await runtimeGuard.remove(),true);runtimeGuard=undefined;}pendingBoundary=undefined;return true;}};},
        readT2:args=>call('readT2',args),writeT2:args=>call('writeT2',args),observeT2:args=>call('observeT2',args),readT2Evidence:()=>call('readT2Evidence'),
        readMenu:args=>call('readMenu',args),write:args=>call('write',args),observeT3Evidence:args=>call('observeT3Evidence',args),
        runT4:args=>call('runT4',args),runControls:args=>call('runControls',args),runDenials:args=>call('runDenials',args),
        runServiceCell:args=>call('runServiceCell',args),restorePriorShop:args=>call('restorePriorShop',args),
        runServiceCellLazy:args=>call('runServiceCellLazy',args),verifyResourceBeforeForward:args=>call('verifyResourceBeforeForward',args),
        closeServiceBrowser:args=>call('closeServiceObservation',args),
        async prepareServiceActor({existingActor,resumeCheckpoint}){if(existingActor){assert.ok(actorA&&!closed.has(actorA));}
            else{assert.ok(!actorA||closed.has(actorA));actorA=await open('S1');await bindRuntime(resumeCheckpoint);}
            return {owner:'S1',identityVerified:true,separateFromClosedActors:true,globalConsumedSessions:report.sessionConsumption,
                recoveryReservations:{S1:1,S2:1},sessionConsumedBeforeAuthentication:true};},
        async finishServiceActor(){await finalize(actorA);await finalize(actorB);assert.equal(held,false);return {sessionsClosed:true,pendingRequests:0};},
        async verifyServiceTerminal(args){
            if(typeof terminalReader!=='function')return null;
            const result=await terminalReader(args);assert.ok(result?.source==='INDEPENDENT_READ_ONLY'&&result.originalTerminal===true
                &&result.unknownResolved===true&&result.sessionsClosed===true&&result.pendingRequests===0&&result.resourcesSha256===args.resourcesSha256
                &&managedResumeCanonical(result.operationIds)===managedResumeCanonical(args.operationIds));
            assert.equal(result.applicationSha,target.source);assert.equal(result.deployment,target.deployment);
            assert.equal(result.project,'patient-heart-55595249');assert.equal(result.branch,'br-flat-wildflower-aoeragrs');
            assert.equal(result.database,'clearallergy_main19');assert.equal(result.readOnly,true);
            assert.equal(args.closedOwnerPrivateBindingsSha256,managedResumeHash(args.closedOwnerPrivateBindings));
            assert.equal(result.closedOwnerPrivateBindingsSha256,args.closedOwnerPrivateBindingsSha256);
            assert.equal(result.closedOwnerPrivateBindingsMatch,true);
            assert.deepEqual(result.closedOwnerPrivateIds,[...args.closedOwnerPrivateBindings.map(b=>b.id)].sort());
            const observed=Date.parse(result.observedUtc);assert.ok(Number.isFinite(observed)&&observed<=Date.now()&&Date.now()-observed<=3600000);
            latestServiceTerminal={observedUtc:result.observedUtc};return result;
        },
    };
    try{
        assert.ok(typeof claimDirectory==='string'&&claimDirectory.length>0);mkdirSync(directory,{recursive:true});
        assert.ok(lstatSync(directory).isDirectory()&&!lstatSync(directory).isSymbolicLink());
        assert.ok(persist('resume-admission',{scope:authorization.scope,checkpointKey:admission.checkpointKey,evidenceReference:authorization.evidenceReference,
            limits:admission.limits,oldClaimsSha256:authorization.oldClaimsSha256,originalSnapshotSha256:authorization.snapshotSha256,originalTerminalSha256:authorization.terminalSha256}));
        controller=prefixOnly?(await import('./issue118-t2-reobserve.mjs')).prepareT2Reobservation({snapshot,terminal,authorization,runId:serviceRunId,ports,rebaseCheckpoint,rebaseReceipt}):prepareManaged414953Resume({snapshot,terminal,approval:authorization,creationOperationIds,ports,fullCheckpoint:input.fullCheckpoint,continuationReceipt:input.continuationReceipt,prefixCheckpoint:input.prefixCheckpoint,prefixReceipt:input.prefixReceipt,rebaseCheckpoint,rebaseReceipt});
        await controller.initialize();
        if(!restored){actorA=await open('S1');actorB=await open('S2');await bindRuntime();
            report.core=prefixOnly?await controller.execute():await controller.executeT3();
            if(!prefixOnly&&!report.core.status.startsWith('T3_API_SEQUENCE_PRIVATE'))throw Error('MANAGED_RESUME_CORE_HELD');
        }else report.core={status:'INHERITED_TERMINAL_NOT_REPLAYED',checkpointSha256:restored.checkpointSha256};
        if(prefixOnly){report.status=report.core.status;}
        else if(typeof controller.executeRemainder!=='function'){report.status='HOLD_REMAINDER_NOT_IMPLEMENTED';}
        else{report.remainder=await controller.executeRemainder({runId:serviceRunId});report.status=report.remainder.status;}
    }catch{held=true;report.status='HOLD_MANAGED_RESUME_ENTRY';}
    finally{
        if(runtime?.resumePorts?.closeServiceObservation)try{report.observerClose=await runtime.resumePorts.closeServiceObservation();}catch{held=true;}
        for(const actor of [...owned].reverse())try{await finalize(actor);}catch{held=true;report.evidencePersistenceComplete=false;}
        report.controller=controller?.snapshot();report.runtime=runtime?.snapshot();report.writes=report.controller?.counts||'NOT_STARTED';
        report.sessionsComplete=report.sessionFinalizations.length===report.sessionAttempts.length&&report.sessionFinalizations.every(r=>r.complete);
        if(held||!report.sessionsComplete)report.status='HOLD_MANAGED_RESUME_ENTRY';
        report.actualServicePass=false;report.independentDatabase='NOT_ATTESTED';
        const priorAttempts=restored?restored.sessionLedger.attempts:admission.prefix?admission.prefix.sessionLedger.attempts:[];
        report.fullCheckpointPayload={version:1,controller:report.controller,preparationState:structuredClone(serviceState),
            sessionLedger:{version:1,baselineConsumed:admission.baselineConsumed,attempts:[...priorAttempts,...report.sessionAttempts.map((a,i)=>{
                const end=report.sessionFinalizations.find(e=>e.sessionIdentity?.id===a.sessionIdentity?.id),sid=end?.sessionIdentity;
                return {index:priorAttempts.length+i+1,owner:a.owner,sessionId:sid?.id??null,providerCreatedUtc:sid?.providerCreatedUtc??null,
                    providerStatus:sid?.providerStatus??'OTHER',terminated:sid?.providerTerminationConfirmed===true&&end?.complete===true,
                    localClosed:end?.localClosed===true,sourceGithubRunId:env.GITHUB_RUN_ID??null,runnerSha:env.GITHUB_SHA??null};})]}};
        // Terminal/source/artifact provenance is attached only after the job ends
        // and the independent operator reads the immutable artifact and SQL.
        report.fullCheckpointExportable=!!report.controller&&report.sessionsComplete&&report.evidencePersistenceComplete
            &&report.controller.status==='HOLD_REMAINDER_RESULT_OR_INDEPENDENT_TERMINAL'
            &&report.controller.serviceArms?.at(-1)?.status==='HOLD';
        report.t2CheckpointExportable=prefixOnly&&report.sessionsComplete&&report.evidencePersistenceComplete&&report.controller?.status==='T2_PRIVATE_PENDING_INDEPENDENT_SQL';
        if(prefixOnly){const payload=report.fullCheckpointPayload;delete payload.preparationState;report.t2PrefixPayload=payload;report.fullCheckpointExportable=false;}
    }
    return report;
}

// Restore the single verified signout document, never a session or a mutation.
// Historical route failures remain in the caller's final result.
export async function prepareManagedSignoutPage({page,access,expectedOwnerId,drainRoutes}){
    const role=Object.keys(managedActorIdentity).find(key=>managedActorIdentity[key].ownerId===expectedOwnerId);
    assert.ok(role);const drained=await drainRoutes();assert.equal(drained.status,'QUIET_CONFIRMED');assert.equal(drained.pending,0);
    const gate=await verifyManagedOwnedPage({role,page,context:page.context(),access,navigate:true});
    assert.equal(gate.verified,true);
}

export function transportLifecycleSnapshot(phase, at = new Date().toISOString()) {
    const phases = ['SETUP', 'AUTHENTICATION', 'APP_FLOW', 'FLOW_VERIFIED', 'CLEANUP',
        'PROTECTION_CHECK', 'PROTECTION_CHECK_FINISHED', 'SIGNOUT', 'SIGNOUT_FINISHED', 'ROUTE_DRAIN_START', 'ROUTE_DRAIN_FINISHED',
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
    "OIDC_REQUEST_FAILED", "OIDC_CLAIMS_INVALID", "OIDC_CLAIMS_REFUSED", "OIDC_TIME_REFUSED", "OIDC_RENEWAL_HELD", "OIDC_RENEWAL_LIMIT",
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
    origin: "https://clear-allergy-e2e-qs7v9eaim-kaitoexe00-9350s-projects.vercel.app",
    deployment: "dpl_14PXhbZ9EnKuiL2kTQwbuU7d5ebo",
    source: "8bf5bea476d5cf5a8dd6ac38713a2d393d7460b1",
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
// Register a committed CREATE before the browser can receive201 and issue its GET.
// This wrapper never fetches, retries, rewrites the response, or retains its body.
export function createResponseTrackingRoute({route,ledger,operation,requestOperations,trackCreated,protectedIds,knownCreatedIds}) {
    let fulfillAttempted=false;
    return new Proxy(route,{get(delegate,key){
        if(key!=='fulfill'){const value=Reflect.get(delegate,key);return typeof value==='function'?value.bind(delegate):value;}
        return async options=>{
            if(operation?.phase!=='CREATE')return delegate.fulfill(options);
            try{
                assert.equal(fulfillAttempted,false);fulfillAttempted=true;
                const request=delegate.request(),url=new URL(request.url());
                assert.equal(request.method(),'POST');assert.equal(url.href,target.origin+'/api/admin/menus');
                assert.equal(ledger.held,false);assert.equal(ledger.operations.filter(op=>op===operation).length,1);
                assert.equal(requestOperations.get(request),operation);assert.equal(operation.requestSent,true);
                assert.equal(operation.state,'IN_FLIGHT');assert.equal(operation.createdId,undefined);
                assert.match(operation.creationOperationId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
                assert.equal(request.postDataJSON()?.operationId,operation.creationOperationId);
                assert.equal(typeof trackCreated,'function');assert.ok(protectedIds instanceof Set&&knownCreatedIds instanceof Set);
                assert.ok(options&&Object.keys(options).length===1&&Object.hasOwn(options,'response'));
                const response=options.response;assert.equal(response.url(),url.href);
                // A non201 remains an ordinary failed-response observation downstream.
                if(response.status()!==201)return await delegate.fulfill(options);
                const body=await response.json();
                assert.ok(body&&typeof body==='object'&&!Array.isArray(body));assert.match(body.id,/^c[a-z0-9]{24}$/);
                assert.equal(protectedIds.has(body.id),false);assert.equal(knownCreatedIds.has(body.id),false);
                operation.createdId=body.id;
                await trackCreated(body.id);knownCreatedIds.add(body.id);
                // Capture above survives a malformed ancillary field or failed callback.
                assert.ok(body.publicRefreshPending===undefined||typeof body.publicRefreshPending==='boolean');
                if(body.operationId!==undefined)assert.equal(body.operationId,operation.creationOperationId);
                return await delegate.fulfill(options);
            }catch{
                holdWrite(ledger,operation,'CREATE_RESPONSE_FULFILL_UNCONFIRMED');
                throw Error('CREATE_RESPONSE_ROUTE_HELD');
            }
        };
    }});
}
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
// Pins come from the reviewed immutable public client build,
// not a CLI/env input or a guessed Server Action/telemetry path. Missing pins grant nothing.
// Run 41470110878: caller/factory bytes match the independently traced factory
// chain. This establishes the client action pin, not auth/API/DB success.
export const liveTargetPinsVerified = true;
export const verifiedReadCloseAction = Object.freeze({
    source:'8bf5bea476d5cf5a8dd6ac38713a2d393d7460b1',deployment:'dpl_14PXhbZ9EnKuiL2kTQwbuU7d5ebo',
    reference:'002d5a40d57114e6b57c906dd03491ecf8c46419f0',
    callerChunk:'/_next/static/immutable/chunks/1yxbpkao8jjq-.js',callerSha256:'22f889779049694ab8497801e8286d170f1101edbad60f9d61d06335458a50a7',
    factoryChunk:'/_next/static/immutable/chunks/44xcerwlley0q.js',factorySha256:'a070e193cc6aa2af93f87b93c668ae7fa6039f396007a82104ba7b228d7850ac',
});
// Shared auth/termination policy. T1 writes retain their separate single-send ledger.
// Provenance: caller41895 -> getters95187 -> CJS35326 ->21413 -> React64893;
// callServer95187 ->32120 -> Next48658. No environment/CLI action-ID override.
export function assertReadCloseSignoutReady(report) {
    const reads=report.readOnlyApiRequests,session=report.sessionIdentity;
    assert.equal(report.flow,'PASS_READ_ONLY_FIXTURE');
    assert.ok(!report.writes?.held&&report.writes?.operations?.length===0);
    assert.ok(Array.isArray(reads)&&reads.length===2&&new Set(reads.map(r=>r.kind)).size===2&&
        reads.every(r=>['SHOP','FIXTURE'].includes(r.kind)&&r.status===200&&r.responseObserved===true));
    assert.ok(session?.ownerId===ciIdentity.ownerId&&session.ownerVerified===true&&session.eligibleForCleanup===true&&
        /^sess_[A-Za-z0-9]{1,128}$/.test(session.id||'')&&Number.isFinite(Date.parse(session.providerCreatedUtc)));
    assert.equal(report.authenticationProgress?.activationAcknowledged,true);
}
export function createVerifiedReadCloseAuthPolicyCandidate(receipt,assertSignoutReady=()=>{throw Error('SIGNOUT_CONTEXT_UNVERIFIED');}) {
    const fixedReceipt=structuredClone(receipt);assertIdentityReceipt(fixedReceipt);
    assert.equal(target.source,verifiedReadCloseAction.source);assert.equal(target.deployment,verifiedReadCloseAction.deployment);
    return createReadCloseAuthPolicyCandidate({actionReference:verifiedReadCloseAction.reference,
        telemetryScripts:['/_vercel/insights/script.js'],assertContext:()=>assertIdentityReceipt(fixedReceipt),assertSignoutReady});
}
const readClosePredicateNames = ['isApp', 'isPost', 'authPhase', 'signoutPhase', 'signoutReady', 'exactLoginTarget', 'exactShopTarget', 'authAuditApi', 'menuApi',
    'queryPresent', 'legacyTelemetryShape', 'pinnedTelemetry', 'headersRead', 'nextActionPresent',
    'nextActionPinned', 'originMatches', 'refererMatches', 'refererShopMatches', 'plainTextUtf8', 'acceptsRsc', 'bodyInspected',
    'emptyArguments', 'actionUnused', 'signoutActionUnused', 'inspectionComplete','pinnedTelemetryScript','isScript'];
export function recordReadClosePolicy(report,entry,predicates,decision,phase) {
    const safe={sequence:entry?.sequence??null,...transportLifecycleSnapshot(phase),
        predicates:Object.fromEntries(readClosePredicateNames.map(k=>[k,predicates?.[k]===true])),
        decision:['REFUSE','USE_EXISTING_TRANSPORT','ALLOW_PINNED_AUTH_CACHE_ACTION','ALLOW_PINNED_SIGNOUT_CACHE_ACTION','SUPPRESS_PINNED_TELEMETRY_SCRIPT','SUPPRESS_PINNED_TELEMETRY'].includes(decision)?decision:'REFUSE'};
    if(entry)entry.policy=safe;
    const events=report.readClosePolicyObservations??=[];
    if(events.length<128)events.push(safe);else report.readClosePolicyObservationsTruncated=true;
    if(safe.decision==='REFUSE') {
        report.firstReadCloseRefusal??={policy:safe,request:entry};
        if(safe.predicates.isApp)report.firstReadCloseAppRefusal??={policy:safe,request:entry};
    }
    if(safe.phase==='SIGNOUT')report.firstReadCloseSignoutPolicy??={policy:safe,request:entry};
}
export function recordReadCloseHandlerFailure(report,entry,phase,error) {
    const codes=['READ_ONLY_REQUEST_REFUSED','READ_CLOSE_PRE_SEND_REFUSED','CI_ROUTE_FAILED'];
    let code='UNKNOWN_HANDLER_FAILURE';try{const message=Object.getOwnPropertyDescriptor(error,'message')?.value;if(codes.includes(message))code=message;}catch{/* no provider values or accessors */}
    report.firstRouteHandlerFailure??={sequence:entry?.sequence??null,started:entry?.started,
        observed:transportLifecycleSnapshot(phase),code,request:entry};
}
export function createReadCloseAuthPolicyCandidate({ actionReference, telemetryPaths = [],telemetryScripts=[],assertContext=()=>{},assertSignoutReady } = {}) {
    const actionPinned = typeof actionReference === 'string' && /^[a-f0-9]{40,128}$/.test(actionReference);
    const telemetry = new Set((Array.isArray(telemetryPaths) ? telemetryPaths : []).filter(path => typeof path === 'string' &&
        /^\/(?:_vercel\/insights|[A-Za-z0-9_-]{8,64})\/(?:view|event)$/.test(path)));
    const scripts=new Set((Array.isArray(telemetryScripts)?telemetryScripts:[]).filter(path=>path==='/_vercel/insights/script.js'));
    let actionUsed = false,signoutActionUsed=false;const approvedRequests=new WeakMap(),sentRequests=new WeakSet();
    const policy=async (request, getPhase) => {
        const observation = Object.fromEntries(readClosePredicateNames.map(name => [name, false]));
        const result = { decision: 'REFUSE', observation };
        try {
            assertContext();
            const raw = request.url(), url = new URL(raw), method = request.method();
            observation.isApp = url.origin === target.origin;
            observation.isPost = method === 'POST'; observation.authPhase = getPhase() === 'AUTHENTICATION';
            observation.signoutPhase=getPhase()==='SIGNOUT';
            observation.queryPresent = !!url.search || raw.includes('?');
            observation.exactLoginTarget = raw === target.origin + '/admin/login';
            observation.exactShopTarget = raw === target.origin + '/admin/shop';
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
            // Diagnose refused document POSTs too, without granting their phase/target.
            if (!observation.isPost || observation.legacyTelemetryShape) return result;
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
            observation.refererShopMatches = header('referer') === target.origin + '/admin/shop';
            observation.plainTextUtf8 = typeof contentType === 'string' && contentType.toLowerCase().replaceAll(' ', '') === 'text/plain;charset=utf-8';
            observation.acceptsRsc = header('accept') === 'text/x-component';
            const body = request.postData(); observation.bodyInspected = true; observation.emptyArguments = body === '[]';
            observation.actionUnused = !actionUsed; observation.authPhase = getPhase() === 'AUTHENTICATION';
            observation.signoutActionUnused=!signoutActionUsed;observation.signoutPhase=getPhase()==='SIGNOUT';
            assertContext();
            observation.inspectionComplete = true;
            if (observation.exactLoginTarget && observation.nextActionPresent && observation.originMatches && observation.refererMatches &&
                observation.plainTextUtf8 && observation.acceptsRsc && observation.nextActionPinned && observation.emptyArguments && observation.actionUnused && observation.authPhase) {
                actionUsed = true;approvedRequests.set(request,{phase:'AUTHENTICATION',url:target.origin+'/admin/login'});result.decision = 'ALLOW_PINNED_AUTH_CACHE_ACTION';
            }else if(observation.signoutPhase&&observation.exactShopTarget&&observation.nextActionPinned&&observation.originMatches&&
                observation.refererShopMatches&&observation.plainTextUtf8&&observation.acceptsRsc&&observation.emptyArguments&&
                actionUsed&&observation.signoutActionUnused&&typeof assertSignoutReady==='function'){
                assertSignoutReady();observation.signoutReady=true;
                if(getPhase()!=='SIGNOUT')return result;
                signoutActionUsed=true;approvedRequests.set(request,{phase:'SIGNOUT',url:target.origin+'/admin/shop'});result.decision='ALLOW_PINNED_SIGNOUT_CACHE_ACTION';
            }
        } catch { /* Unknown inputs/provider failures are REFUSE; no values or raw exceptions escape. */ }
        return result;
    };
    // Revalidate this already claimed request immediately before the transport's
    // fetch, after its separate asynchronous allHeaders(). Never acquire a new claim.
    policy.assertBeforeSend=(request,getPhase)=>{
        assertContext();
        if(approvedRequests.has(request)) {
            const grant=approvedRequests.get(request);
            if(grant.phase==='SIGNOUT')assertSignoutReady();
            if(sentRequests.has(request)||request.method()!=='POST'||getPhase()!==grant.phase||request.url()!==grant.url||request.postData()!=='[]')
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
            if(inspected.decision==='ALLOW_PINNED_AUTH_CACHE_ACTION'||inspected.decision==='ALLOW_PINNED_SIGNOUT_CACHE_ACTION'||inspected.decision==='USE_EXISTING_TRANSPORT')return true;
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
          && readsConfirmed&&sessionConfirmed&&report.readCloseDrain?.status==='QUIET_CONFIRMED'&&closed === true && !transportFailed && !report.firstTransportFailure && !report.readOnlyRequestRefused;
    return { status: complete ? 'READ_CLOSE_DIAGNOSTIC_COMPLETE' : 'FAIL_OR_INCOMPLETE', exit: complete ? 0 : 1 };
}
export async function drainReadCloseRoutes(getPending,getGeneration,{timeoutMs=10000,quietMs=250,pollMs=25,
    now=()=>performance.now(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
    let generation,quietStarted;
    try {
        if(!Number.isFinite(timeoutMs)||!Number.isFinite(quietMs)||!Number.isFinite(pollMs)||timeoutMs<quietMs||quietMs<0||pollMs<1)throw Error();
        const started=now();
        while(now()-started<=timeoutMs){
            const pending=getPending(),nextGeneration=getGeneration();
            if(!Number.isSafeInteger(pending)||pending<0||!Number.isSafeInteger(nextGeneration)||nextGeneration<0)throw Error();
            if(nextGeneration!==generation||pending!==0)quietStarted=undefined;
            generation=nextGeneration;
            if(pending===0){quietStarted??=now();if(now()-quietStarted>=quietMs)return {status:'QUIET_CONFIRMED',pending:0,generation,quietWindowObserved:true};}
            await wait(pollMs);
        }
        return {status:'DRAIN_TIMEOUT',quietWindowObserved:false};
    }catch{return {status:'DRAIN_OBSERVATION_FAILED',quietWindowObserved:false};}
}
export function createCiRouteLifecycleTracker(){
    const pending=new Set();let started=0,settled=0;
    return {wrap:handler=>async route=>{const token={};pending.add(token);started++;
        try{return await handler(route);}finally{pending.delete(token);settled++;}},
        snapshot:()=>({started,settled,pending:pending.size}),
        drain:()=>drainReadCloseRoutes(()=>pending.size,()=>started)};
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

// PC-side durable single dispatcher. A failed/uncertain dispatch consumes its
// checkpoint too: observe the old outcome, never erase this claim and resend.
export function claimManagedDispatch({directory,checkpointKey,runnerSha,now=new Date().toISOString()}){
    assert.ok(typeof directory==='string'&&directory.length>0);
    assert.ok(checkpointKey==='INITIAL_MANAGED_APPROVAL_20261102'||/^[a-f0-9]{64}$/.test(checkpointKey));
    assert.match(runnerSha,/^[a-f0-9]{40}$/);assert.ok(Number.isFinite(Date.parse(now)));
    mkdirSync(directory,{recursive:true});assert.ok(lstatSync(directory).isDirectory()&&!lstatSync(directory).isSymbolicLink());
    const key=createHash('sha256').update(checkpointKey).digest('hex');let fd;
    const claim={id:randomUUID(),checkpointKey,runnerSha,applicationSha:target.source,deployment:target.deployment,createdUtc:now,state:'PENDING_CONSUMED_NO_RETRY'};
    try{fd=openSync(join(directory,key+'.json'),'wx',0o600);writeFileSync(fd,JSON.stringify(claim));fsyncSync(fd);return claim;}
    catch{throw Error('MANAGED_DISPATCH_CHECKPOINT_ALREADY_CLAIMED_OR_UNWRITABLE');}
    finally{if(fd!==undefined)closeSync(fd);}
}

// External single-dispatcher ledger supplies prior consumption, including failed
// runs whose sessions were later terminated. Per-suite counts never refund it.
export function assertManagedSessionBudget(receipt,needed){
    const prior=receipt?.managedPriorSessionConsumption;
    if(!Number.isSafeInteger(prior)||prior<0||prior>7||!Number.isSafeInteger(needed)||needed<0||needed>2||prior+needed>7)
        throw Error('MANAGED_GLOBAL_SESSION_BUDGET_REFUSED');
    return {prior,reserved:needed,maximum:7};
}

export function decodeManagedResumeBundle(receipt){
    try{
        const encoded=receipt?.managedResumeBundle;
        assert.ok(typeof encoded==='string'&&encoded.length>0&&encoded.length<=60000&&/^[A-Za-z0-9_-]+$/.test(encoded));
        const compressed=Buffer.from(encoded,'base64url');assert.equal(compressed.toString('base64url'),encoded);
        const bytes=gunzipSync(compressed,{maxOutputLength:262144}),text=bytes.toString('utf8');
        assert.equal(Buffer.from(text,'utf8').equals(bytes),true);const value=JSON.parse(text);
        const keys=['initialSnapshot','preparationState','checkpointReceipt','terminalProof','nextCellId'];
        assert.ok(value&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k)));
        const attestation=receipt.managedCheckpointAttestation;
        assert.ok(attestation&&Object.keys(attestation).length===5&&['verifiedBy','bundleSha256','artifactSha256','githubRunId','evidenceReference'].every(k=>Object.hasOwn(attestation,k)));
        assert.equal(attestation?.verifiedBy,'cli_metadata_observer');
        assert.match(attestation.artifactSha256,/^[a-f0-9]{64}$/);assert.match(attestation.githubRunId,/^[0-9]{1,30}$/);
        assert.equal(attestation.bundleSha256,createHash('sha256').update(bytes).digest('hex'));
        assert.equal(attestation.artifactSha256,value.checkpointReceipt?.terminalMetadataReceipt?.artifactSha256);
        assert.equal(attestation.githubRunId,value.checkpointReceipt?.terminalMetadataReceipt?.githubRunId);
        assert.equal(attestation.evidenceReference,`https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/${attestation.githubRunId}`);
        return value;
    }catch{throw Error('MANAGED_RESUME_BUNDLE_REFUSED');}
}

export async function runManagedServiceArm(){
    assert.equal(liveTargetPinsVerified,true);assertCiEnvironment(process.env);
    assert.equal(process.env.ISSUE118_MANAGED_SCOPE,'MAX32_103_4_5_7');
    assert.equal(process.env.ISSUE118_MANAGED_OPERATION,'APPROVE_MANAGED_SERVICE_ARM');
    assert.ok(!process.env.DEBUG&&!process.env.PWDEBUG&&!process.env.NODE_OPTIONS);
    const receipt=JSON.parse(readFileSync(process.env.CLEARALLERGY_ISSUE118_IDENTITY_RECEIPT,'utf8'));assertIdentityReceipt(receipt);
    const bundle=decodeManagedResumeBundle(receipt);
    const budget=assertManagedSessionBudget(receipt,bundle.nextCellId===null?0:1);
    const output=resolve(process.env.CLEARALLERGY_BROWSER_OUTPUT);mkdirSync(dirname(output),{recursive:true});mkdirSync(output,{recursive:false});
    const report={target,startedUtc:new Date().toISOString(),operation:'MANAGED_SERVICE_ARM',status:'HOLD_NOT_STARTED',
        sessionBudget:budget,
        dbObservation:'Independent READ ONLY proof supplied as an externally verified checkpoint; new arm SQL remains separate',events:[]};
    const save=()=>writeFileSync(join(output,'result.json'),JSON.stringify(report,null,2));
    let actor;
    try{
        save();const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
        const run=await executeManagedServiceResume({...bundle,identityReceipt:receipt,claimDirectory:join(output,'managed-claims'),
            image:{buffer:readFileSync(new URL('../public/images/cion_notxt.png',import.meta.url))},
            verifyCheckpoint:async({snapshot,preparationState,terminalProof})=>{
                // This attestation is prepared outside the job from actual completed-run
                // metadata, downloaded artifact bytes and independent Neon READ ONLY SQL.
                assert.deepEqual(snapshot,bundle.initialSnapshot);assert.deepEqual(preparationState,bundle.preparationState);
                assert.deepEqual(terminalProof,bundle.terminalProof);assertIdentityReceipt(receipt);decodeManagedResumeBundle(receipt);return true;
            },
            actorFactory:async()=>{actor=await openManagedOwnedActor({role:'S1',chromium,env:process.env,identityReceipt:receipt,
                record:value=>{report.actor=value;save();}});return actor;},
            record:value=>{report.events.push(value);save();},outputRecord:value=>{report.managed=value;save();}});
        assert.equal(run.actorHandle,actor);report.managed=run.result;
        report.status=run.result.suiteSnapshot?.status==='HOLD_NO_FURTHER_WRITES'?'HOLD_MANAGED_RECONCILIATION_REQUIRED':'INCOMPLETE_INDEPENDENT_DB';
    }catch{report.status='HOLD_MANAGED_SERVICE_ARM_FAILED';}
    finally{
        if(actor){try{report.actorFinalization=await actor.finalize();if(!report.actorFinalization.complete)report.status='HOLD_MANAGED_LIFECYCLE_UNVERIFIED';}
            catch{report.actorFinalization={complete:false};report.status='HOLD_MANAGED_LIFECYCLE_UNVERIFIED';}}
        report.finishedUtc=new Date().toISOString();save();process.exitCode=2;
        console.log('ISSUE118_RESULT '+report.status);
    }
}

export async function runManagedCleanup(){
    assert.equal(liveTargetPinsVerified,true);assertCiEnvironment(process.env);
    assert.equal(process.env.ISSUE118_MANAGED_SCOPE,'MAX32_103_4_5_7');
    assert.equal(process.env.ISSUE118_MANAGED_OPERATION,'APPROVE_MANAGED_KNOWN_CLEANUP');
    assert.ok(!process.env.DEBUG&&!process.env.PWDEBUG&&!process.env.NODE_OPTIONS);
    const receipt=JSON.parse(readFileSync(process.env.CLEARALLERGY_ISSUE118_IDENTITY_RECEIPT,'utf8'));assertIdentityReceipt(receipt);
    const proof=receipt.managedCleanupProof;assertManagedCleanupProof(proof);
    assert.equal(receipt.managedPriorSessionConsumption,6);assert.equal(receipt.managedPriorMenuWrites,37);
    const budget=assertManagedSessionBudget(receipt,1);assert.ok(37+proof.fixtures.filter(f=>f.isPublished).length<=103);
    const output=resolve(process.env.CLEARALLERGY_BROWSER_OUTPUT);mkdirSync(dirname(output),{recursive:true});mkdirSync(output,{recursive:false});
    const report={target,startedUtc:new Date().toISOString(),operation:'EXACT_KNOWN_OWNER_A_CLEANUP',status:'HOLD_NOT_STARTED',
        sessionBudget:budget,sourceRunId:'41495319922',menuCreates:0,shopWrites:0,uploads:0,
        independentDatabase:'NOT_RUN_IN_JOB',events:[],automaticRetry:false,automaticCleanup:false};
    const save=()=>writeFileSync(join(output,'result.json'),JSON.stringify(report,null,2));let actor;
    try{
        save();const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
        actor=await openManagedOwnedActor({role:'S1',chromium,env:process.env,identityReceipt:receipt,
            record:value=>{report.actor=value;save();}});
        report.cleanup=await executeManagedKnownFixtureCleanup({actor,proof,record:value=>{report.events.push(value);save();}});
        report.status=report.cleanup.status==='KNOWN_FIXTURES_PRIVATE_API_CONFIRMED'?'INCOMPLETE_INDEPENDENT_DB':'HOLD_KNOWN_CLEANUP_INCOMPLETE';
    }catch{report.status='HOLD_KNOWN_CLEANUP_FAILED';}
    finally{
        if(actor){try{report.actorFinalization=await actor.finalize();if(!report.actorFinalization.complete)report.status='HOLD_KNOWN_CLEANUP_LIFECYCLE';}
            catch{report.actorFinalization={complete:false};report.status='HOLD_KNOWN_CLEANUP_LIFECYCLE';}}
        report.finishedUtc=new Date().toISOString();save();process.exitCode=2;console.log('ISSUE118_RESULT '+report.status);
    }
}

export async function runLive() {
    if (!liveTargetPinsVerified) throw Error('TARGET_STATIC_VERIFICATION_PENDING');
    const readCloseOnly = process.argv.slice(2).join(' ') === '--ci-read-close';
    if (readCloseOnly && process.env.ISSUE118_DIAGNOSTIC_MODE !== readCloseMode) throw Error('READ_CLOSE_MODE_REFUSED');
    const managedMode = process.argv.slice(2).join(' ') === '--ci-managed';
    if(managedMode&&process.env.ISSUE118_MANAGED_SCOPE!=='MAX32_103_4_5_7')throw Error('MANAGED_SCOPE_REFUSED');
    if(managedMode&&process.env.ISSUE118_MANAGED_OPERATION==='APPROVE_MANAGED_SERVICE_ARM')return runManagedServiceArm();
    if(managedMode&&process.env.ISSUE118_MANAGED_OPERATION==='APPROVE_MANAGED_KNOWN_CLEANUP')return runManagedCleanup();
    if(managedMode&&process.env.ISSUE118_MANAGED_OPERATION!=='APPROVE_MANAGED_SUITE')throw Error('MANAGED_OPERATION_REFUSED');
    const ciMode = managedMode || readCloseOnly || process.argv.slice(2).join(" ") === "--ci-apply";
    if (!ciMode && process.argv.slice(2).join(" ") !== "--apply") throw Error("EXPLICIT_APPLY_REQUIRED");
    if (ciMode) assertCiEnvironment(process.env);
    if (process.env.DEBUG || process.env.PWDEBUG || process.env.NODE_OPTIONS) throw Error("DEBUG_OR_PRELOAD_FORBIDDEN");
    if (!process.env.CLEARALLERGY_ISSUE118_IDENTITY_RECEIPT) throw Error("EXTERNAL_IDENTITY_RECEIPT_REQUIRED");
    const identityBytes = readFileSync(process.env.CLEARALLERGY_ISSUE118_IDENTITY_RECEIPT);
    const identityReceipt = JSON.parse(identityBytes.toString("utf8"));
    assertIdentityReceipt(identityReceipt);
    if(managedMode)assertManagedSessionBudget(identityReceipt,2);
    const t1ResumeProof=managedMode?identityReceipt.managedT1Resume:undefined;
    if(managedMode)assertManagedT1ResumeProofMetadata(t1ResumeProof); // Initial allocation was already consumed; CREATE replay is closed.
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
    if(managedMode)report.sessionBudget=assertManagedSessionBudget(identityReceipt,2);
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
    let resumeGuardFailed=false;
    let protectedBefore;
    const protectedIds = ["cmvs4x86o000vwn0w93c8ttez", "cmvs4x8wt000xwn0wj6gwdih1", "cmvs4x986000zwn0wer2ymhow"];
    const mutationCounts = new Map();
    const ledger = newWriteLedger(); report.writes = ledger;
    const requestOperations = new WeakMap();
    const trackedCreatedIds=new Set();
    const readCloseRequestEntries=new WeakMap(),pendingReadCloseRoutes=new Set();
    const ciRouteLifecycle=createCiRouteLifecycleTracker();
    let activeOperation;
    let ciAccess;
    let managedB, managedStarted=false, t1PrivateVerified=false;
    let ciTransportFailed = false;
    const readClosePolicy = ciMode ? createVerifiedReadCloseAuthPolicyCandidate(identityReceipt,()=>{
        if(readCloseOnly)return assertReadCloseSignoutReady(report);
        const s=ciAccess.sessionObservation();assert.ok(s?.ownerVerified&&s.eligibleForCleanup&&s.ownerId===ciIdentity.ownerId);
    }) : undefined;
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
        if (ciMode) ciAccess = await createCiAccess({...process.env,ISSUE118_SESSION_LIFECYCLE:'TRACKED_OWNER_SESSION'}, fetch, setupStage, {
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
        const ciRoute = ciRouteLifecycle.wrap(async route => {
            const sequence = ++routeSequence, started = transportLifecycleSnapshot(lifecyclePhase);
            let entry;
            try {
                if(readCloseOnly) {
                    const request=route.request();entry=readCloseRequestObservation(request,sequence,started);readCloseRequestEntries.set(request,entry);
                    pendingReadCloseRoutes.add(entry);
                    const counts=report.readCloseRouteCounts??={started:0,settled:0,sampledOut:0};counts.started++;
                    const entries=report.readCloseRoutes??=[];if(entries.length<128)entries.push(entry);else {counts.sampledOut++;report.readCloseRoutesTruncated=true;}
                }
                const authorizedT1Mutation=requestOperations.has(route.request());
                const routedUrl=new URL(route.request().url());
                const authorizedFlowRead=!readCloseOnly&&route.request().method()==='GET'&&routedUrl.origin===target.origin&&
                    !routedUrl.username&&!routedUrl.password&&!routedUrl.search&&!routedUrl.hash&&
                    ['/api/admin/shop','/api/admin/menus',...(menuId?['/api/admin/menus/'+menuId,'/api/menus/'+menuId]:[])].includes(routedUrl.pathname);
                if (!authorizedT1Mutation && !authorizedFlowRead && !await guardReadCloseRoute(route,
                    () => { report.readOnlyRequestRefused = true; },
                    () => { report.readOnlyOtherRequestsBlocked = (report.readOnlyOtherRequestsBlocked || 0) + 1; },
                    {policy:readClosePolicy,getPhase:()=>lifecyclePhase,observe:(predicates,decision)=>{
                        recordReadClosePolicy(report,entry,predicates,decision,lifecyclePhase);
                        if(!readCloseOnly&&routedUrl.origin===target.origin&&decision==='REFUSE')
                            report.firstAppFlowRefusal??={sequence,phase:lifecyclePhase,predicates,decision,
                                knownFixtureId:!!menuId,currentFixtureApiMatched:routedUrl.pathname==='/api/admin/menus/'+menuId};
                        save();
                    }})) {
                    save(); return;
                }
                let transportRoute=entry?observeReadCloseRoute(route,entry,()=>lifecyclePhase,save):route;
                const operation=requestOperations.get(route.request());
                if(operation?.phase==='CREATE')transportRoute=createResponseTrackingRoute({route:transportRoute,ledger,operation,requestOperations,
                    protectedIds:new Set([...protectedIds,target.anchor,readCloseFixtureId,'cmvuy8d4z0003jw07e9fobsdm','cmvuzlqhf0003l308lem3uwck']),
                    knownCreatedIds:trackedCreatedIds,trackCreated:async id=>{assert.ok(!menuId||menuId===id);menuId=id;report.fixtureId=id;
                        report.createdIdBoundBeforeDelivery=true;save();}});
                await ciAccess.route(transportRoute,entry?observation=>{
                    const events=entry.transport??=[];
                    if(events.length<4)events.push({...transportLifecycleSnapshot(lifecyclePhase),
                        ...transportObservation(observation.originRole,observation.method,observation.status,observation.exception,observation.stages)});
                    else report.lifecycleIncomplete=true;save();
                }:undefined,authorizedT1Mutation||authorizedFlowRead?undefined:()=>readClosePolicy.assertBeforeSend(route.request(),()=>lifecyclePhase));
            }
            catch (error) {
                if(entry)entry.handlerFailed=true;
                if(readCloseOnly)recordReadCloseHandlerFailure(report,entry,lifecyclePhase,error);
                else report.firstRouteHandlerFailure ??= { sequence, started, observed: transportLifecycleSnapshot(lifecyclePhase) };
                ciTransportFailed = true; report.transportError = "CI_ROUTE_FAILED";
                if (activeOperation) holdWrite(ledger, activeOperation, "TRANSPORT_RESULT_UNCONFIRMED");
                save();
            }
            finally{if(entry){entry.pending=false;entry.finished=transportLifecycleSnapshot(lifecyclePhase);pendingReadCloseRoutes.delete(entry);report.readCloseRouteCounts.settled++;save();}}
        });
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
                save(); // Persist the single send claim before the guarded fetch.
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
        if(managedMode){
            // Both identities are established before the first fixture write.
            managedB=await openManagedOwnedActor({role:'S2',chromium,env:process.env,identityReceipt,
                record:value=>{report.managedActorB=value;save();}});
            assert.equal(managedB.observation.gateVerified,true);
        }
        if(t1ResumeProof){
            report.stage='RESUME_CREATED_T1_VERIFY';save();
            try{
                const resumed=verifyManagedT1ResumeProof({proof:t1ResumeProof,menu:await read(t1ResumeProof.fixtureId),shop:shopData.shop});
                menuId=resumed.fixtureId;name=resumed.name;trackedCreatedIds.add(menuId);
                ledger.operations.push(structuredClone(resumed.confirmedCreate));
                report.fixtureId=menuId;report.fixtureName=name;report.resumedCreation={sourceRunId:t1ResumeProof.githubRunId,
                    creationOperationId:t1ResumeProof.creationOperationId,requestId:t1ResumeProof.requestId,externalSqlAttestation:true};
                save();await page.goto(target.origin+`/admin/menus/${menuId}/edit`);
            }catch{resumeGuardFailed=true;throw Error('MANAGED_T1_RESUME_PROOF_REFUSED');}
        }else{
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
        }
        report.stage = "CREATED_PRIVATE_VERIFY"; save();
        let menu;
        try{
            menu=t1ResumeProof?await readManagedResumeBeforePublish({proof:t1ResumeProof,read,shop:shopData.shop,
                onRefusal:()=>{resumeGuardFailed=true;}}):await read(menuId);
            assert.equal(menu.name,name);assert.equal(menu.isPublished,false);
        }catch{if(t1ResumeProof)resumeGuardFailed=true;throw Error('CREATED_PRIVATE_VERIFICATION_REFUSED');}
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
        if(managedMode){
            // T1 must be terminal/private before its session is reused for the managed core.
            await page.goto(target.origin+'/admin/menus');
            cleanupAttempted=true;
            await action('CLEANUP','POST',`/api/admin/menus/${menuId}/stop`,()=>page.getByRole('button',{name:name+'の公開を停止',exact:true}).click());
            const final=await read(menuId);assert.equal(final.isPublished,false);assert.equal(final.name,name);
            record('FINAL_PRIVATE_HISTORY_RETAINED',final);report.cleanup='PRIVATE_VERIFIED';t1PrivateVerified=true;
            report.protectedAfter=await Promise.all(protectedIds.map(async id=>protectedApiSnapshot(await read(id))));
            assert.deepEqual(report.protectedAfter,protectedBefore);report.protection='PASS_API_REPRESENTATION';
            const viewerDrain=await ciRouteLifecycle.drain();assert.equal(viewerDrain.status,'QUIET_CONFIRMED');assert.equal(viewerDrain.pending,0);
            await viewer.close();const managedNavigation=await page.goto(target.origin+'/admin/shop');
            const managedAGate=await verifyManagedOwnedPage({role:'S1',page,context,access:ciAccess,navigate:false,
                navigationResponse:managedNavigation,routeFailed:()=>ciTransportFailed,record:value=>{report.managedAGate=value;save();}});
            assert.equal(managedAGate.verified,true);
            const a={owner:'S1',expectedUserId:ciIdentity.ownerId,binding:{owner:'S1',shopId:target.shop,contextRef:'managed_S1'},
                page,context,browser,access:ciAccess,lifecycle:{browser,tracker:ciRouteLifecycle,onStage:markLifecycle},
                routeFailed:()=>ciTransportFailed};
            managedStarted=true;report.managed={status:'STARTED'};save();
            report.managed=await executeManagedContinuation({actors:[a,managedB],identityReceipt,
                t1:{flow:report.flow,cleanup:report.cleanup,protection:report.protection,unknownWrite:false,fixtureId:menuId,menuWrites:6,sessions:2},
                claimDirectory:join(output,'managed-claims'),
                image:{buffer:readFileSync(new URL('../public/images/cion_notxt.png',import.meta.url))},
                record:value=>{(report.managedEvents??=[]).push(value);save();},
                outputRecord:value=>{report.managed=value;save();}});save();
        }
    } catch (error) {
        if(managedStarted)report.managedExecutionError=classifyLiveError(error);
        else report.flow = ledger.held ? "HOLD_UNCERTAIN_WRITE" : "FAIL";
        report.errorClass = classifyLiveError(error);
    } finally {
        markLifecycle('CLEANUP');
        if (readCloseOnly) {
            report.cleanup = 'NOT_APPLICABLE_READ_ONLY';
        } else if(resumeGuardFailed){
            report.cleanup='HOLD_RESUME_CONFLICT_NO_WRITE';
        } else if (managedStarted||t1PrivateVerified) {
            // A later unknown operation never triggers a second T1 cleanup.
            report.cleanup=t1PrivateVerified?'PRIVATE_VERIFIED':'UNVERIFIED_NO_AUTOMATIC_RETRY';
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
        if(managedB){try{report.managedActorBFinalization=await managedB.finalize();if(!report.managedActorBFinalization.complete)ciTransportFailed=true;}
            catch{report.managedActorBFinalization={complete:false,status:'FINALIZATION_EXCEPTION'};ciTransportFailed=true;}}
        if(report.managedActorB?.finalization?.complete===false){ciTransportFailed=true;report.managedBTerminationUnverified=true;}
        if(ciAccess&&page){
            const finalized=await finalizeOwnedCiActor({access:ciAccess,page,context,browser,expectedOwnerId:ciIdentity.ownerId,
                prepareForSignout:managedMode?()=>prepareManagedSignoutPage({page,access:ciAccess,expectedOwnerId:ciIdentity.ownerId,
                    drainRoutes:()=>ciRouteLifecycle.drain()}):undefined,
                drainRoutes:()=>ciRouteLifecycle.drain(),readRouteState:()=>ciRouteLifecycle.snapshot(),attempts:{browserLaunchAttempted,contextCreateAttempted},onStage:markLifecycle});
            report.authenticationCleanup=finalized.authenticationCleanup;report.sessionIdentity=finalized.sessionIdentity;
            report.ciRouteDrain=finalized.drain;report.ciRouteLifecycle=ciRouteLifecycle.snapshot();
            if(report.ciRouteLifecycle.pending!==0||report.ciRouteLifecycle.started!==report.ciRouteLifecycle.settled)ciTransportFailed=true;
            if(readCloseOnly)report.readCloseDrain=finalized.drain;
            report.localClose=finalized.localClose;
            if(!finalized.complete)ciTransportFailed=true;
        }else report.localClose = await closeIsolatedBrowser(context, browser, { browserLaunchAttempted, contextCreateAttempted }, markLifecycle);
        if(!report.localClose)report.localClose={allLocalClosed:false,lifecycleObservationFailed:true};
        if(readCloseOnly){report.pendingReadCloseRoutes=pendingReadCloseRoutes.size;if(report.pendingReadCloseRoutes||report.readCloseRouteCounts?.started!==report.readCloseRouteCounts?.settled)ciTransportFailed=true;}
        markLifecycle('LOCAL_CLOSE_FINISHED');
        report.browserClose = report.localClose.allLocalClosed ? "CONFIRMED" : "UNVERIFIED";
        const closureComplete = report.browserClose === 'CONFIRMED' && !report.localClose.lifecycleObservationFailed && !report.lifecycleIncomplete;
        const overall = readCloseOnly ? readCloseResult(report, ciTransportFailed, closureComplete) :
            overallResult(report.flow, report.cleanup, report.protection, ledger.held,
                closureComplete && report.authenticationCleanup !== "SIGNOUT_UNVERIFIED" && !ciTransportFailed);
        if(managedMode){
            report.overall=ledger.held?'HOLD_UNCERTAIN_WRITE':report.managed?.suiteSnapshot?.status==='HOLD_NO_FURTHER_WRITES'?'HOLD_MANAGED_RECONCILIATION_REQUIRED':'HOLD_MANAGED_SUITE_INCOMPLETE';
            if(!ledger.held&&(!closureComplete||ciTransportFailed||report.authenticationCleanup==='SIGNOUT_UNVERIFIED'))report.overall='HOLD_MANAGED_LIFECYCLE_UNVERIFIED';
            report.status=report.overall;process.exitCode=2;
        }else{report.overall = overall.status; report.status = overall.status;process.exitCode = overall.exit;}
        save();
        console.log(`ISSUE118_RESULT ${report.overall}; flow=${report.flow}; cleanup=${report.cleanup}`);
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runLive().catch(() => { console.error("ISSUE118_PREFLIGHT_FAILED_NO_RAW_ERROR"); process.exitCode = 1; });
}
