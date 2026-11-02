// Test infrastructure only. All I/O is injected; no HTTP/Blob/auth/CLI imports.
import { createHash } from "node:crypto";
import { menuCreateResponseSchema, menuSaveResponseSchema } from "../features/admin/menus/schemas/menu-response";
import { parseShopSaveResponse } from "../features/admin/shop/schemas/shop-response";

const uuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const sha = (s: string) => /^[a-f0-9]{64}$/.test(s);
const id = (s: string) => /^c[a-z0-9]+$/.test(s);
function requireThat(value: unknown): asserts value { if (!value) throw Error("ISSUE118_SERVICE_PROBE_REFUSED"); }
function parseUrl(value: string) { try { return new URL(value); } catch { return null; } }
export type ProbeScope = { runId: string; applicationSha: string; shopId: string; isolationReceiptSha256: string };
export type ProbeTarget = { kind: "MENU_CREATE" | "MENU_SAVE" | "SHOP_SAVE" | "STOP" | "MENU_UPLOAD" | "SHOP_UPLOAD";
    method: "POST" | "PUT"; path: string; bodySha256: string; menuId?: string; beforeVersion?: number; beforeUpdatedAt?: string; creationOperationId?: string };
export type ProbeResponse = { status(): number; requestId(): Promise<string | null>; json(): Promise<unknown> };
type Ui = { inputRetained: boolean; fileRetained: boolean; successDisplayed: boolean; followupWrites: number };
type PrivateBlob = { url: string; pathname: string; objectSha256: string; requestId: string; kind: "menu" | "shop" };
type UploadScope = { origin: string; fixtureSha256: string; fixtureBytes: number };
type ProbeAdapter = {
    assertScope(scope: ProbeScope): Promise<void>;
    // Atomic durable claim for the logical write, not mode-specific. Unknown is
    // not released, including across processes or a change of fault mode.
    claim(manifest: { scope: ProbeScope; target: ProbeTarget; mode: string }): Promise<boolean>;
    // Sole sender. Must use the existing protected route transport with retry and
    // automatic redirects disabled. NEVER call route.continue/fallback on failure.
    forwardOnce(): Promise<ProbeResponse>;
    abortClient(): Promise<void>;
    deliverOnce(response: ProbeResponse): Promise<void>;
    observeUi(): Promise<Ui>;
    record(event: { stage: string; httpStatus?: number; requestId?: string; menuId?: string; objectSha256?: string }): Promise<void>;
    // A private run receipt, not console/public artifacts. No credentials in ref.
    recordKnownObject?(ref: Readonly<PrivateBlob>): Promise<boolean>;
};
function verifyTarget(t: ProbeTarget, shopId: string) {
    requireThat(sha(t.bodySha256));
    if (t.kind === "MENU_CREATE") requireThat(t.method === "POST" && t.path === "/api/admin/menus" && uuid(t.creationOperationId ?? ""));
    else if (t.kind === "MENU_UPLOAD" || t.kind === "SHOP_UPLOAD") requireThat(t.method === "POST" && t.path === `/api/admin/upload-${t.kind === "MENU_UPLOAD" ? "menu" : "shop"}-image`);
    else if (t.kind === "SHOP_SAVE") requireThat(t.method === "PUT" && t.path === "/api/admin/shop" && id(shopId)
        && typeof t.beforeUpdatedAt === "string" && Number.isFinite(Date.parse(t.beforeUpdatedAt)));
    else requireThat(["MENU_SAVE", "STOP"].includes(t.kind) && id(t.menuId ?? "") && Number.isSafeInteger(t.beforeVersion) && t.beforeVersion! >= 0
        && t.method === (t.kind === "STOP" ? "POST" : "PUT") && t.path === `/api/admin/menus/${t.menuId}${t.kind === "STOP" ? "/stop" : ""}`);
}
function verifyUploadScope(upload: UploadScope) {
    const origin = parseUrl(upload.origin); requireThat(origin);
    requireThat(origin.href === origin.origin + "/" && origin.protocol === "https:" && !origin.username && !origin.password
        && !origin.port && /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(origin.hostname)
        && sha(upload.fixtureSha256) && Number.isSafeInteger(upload.fixtureBytes) && upload.fixtureBytes > 0);
}
function blobFromResponse(raw: unknown, scope: ProbeScope, upload: UploadScope, kind: "menu" | "shop", requestId: string): PrivateBlob {
    requireThat(raw && typeof raw === "object");
    const { url, pathname } = raw as { url?: unknown; pathname?: unknown };
    requireThat(typeof url === "string" && url.length <= 2048 && typeof pathname === "string");
    const parsed = parseUrl(url), origin = parseUrl(upload.origin); requireThat(parsed && origin);
    requireThat(parsed.href === url && parsed.origin === origin.origin && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && !parsed.port
        && parsed.pathname === "/" + pathname && !pathname.includes("%"));
    const prefix = kind === "menu" ? `menu-images/${scope.shopId}/` : `shops/${scope.shopId}/cover-`;
    requireThat(pathname.startsWith(prefix) && /^[A-Za-z0-9_-]+\.png$/.test(pathname.slice(prefix.length)));
    return { url, pathname, objectSha256: digest(url), requestId, kind };
}

export function prepareWriteObservation(input: { scope: ProbeScope; target: ProbeTarget;
    mode: "DELIVER" | "BLOCK_BEFORE_FORWARD" | "WITHHOLD_AFTER_RESPONSE"; fileExpected: boolean;
    upload?: UploadScope; adapter: ProbeAdapter }) {
    const scope = structuredClone(input.scope), target = structuredClone(input.target), upload = input.upload && structuredClone(input.upload);
    const { adapter, mode, fileExpected } = input;
    requireThat(uuid(scope.runId) && /^[a-f0-9]{40}$/.test(scope.applicationSha) && id(scope.shopId) && sha(scope.isolationReceiptSha256)
        && ["DELIVER", "BLOCK_BEFORE_FORWARD", "WITHHOLD_AFTER_RESPONSE"].includes(mode));
    verifyTarget(target, scope.shopId);
    requireThat(typeof fileExpected === "boolean");
    if (target.kind.endsWith("UPLOAD")) { requireThat(upload && typeof adapter.recordKnownObject === "function"); verifyUploadScope(upload); }
    let used = false, cleanupUsed = false, objectReadUsed = false, objectRecorded = false;
    let privateBlob: PrivateBlob | undefined, completed = false, clientUnknown = true;
    return {
        async execute(observedRequest: { method: string; path: string; bodySha256: string }) {
            requireThat(!used); used = true;
            let forwards = 0, upstreamStatus: number | null = null, bodyValidated = false, clientDelivery = "NOT_ATTEMPTED", requestId: string | undefined;
            let stage = "PREFLIGHT", ui: Ui | undefined, createdMenuId: string | undefined;
            const result = () => ({ stage, mode, forwards, upstreamStatus, bodyValidated, clientDelivery, clientUnknown,
                ...(requestId ? { requestId } : {}), ...(privateBlob ? { objectSha256: privateBlob.objectSha256 } : {}), ...(ui ? { ui } : {}),
                ...(createdMenuId ? { createdMenuId, creationOperationId: target.creationOperationId } : {}),
                automaticRetry: false, automaticCleanup: false, externalAuthDatabaseBlob: "NOT_ATTESTED" });
            if (observedRequest.method !== target.method || observedRequest.path !== target.path || observedRequest.bodySha256 !== target.bodySha256) {
                stage = "REQUEST_MISMATCH_NO_ACTION"; return result();
            }
            const abort = async () => {
                clientDelivery = "ABORT_IN_FLIGHT";
                try { await adapter.abortClient(); clientDelivery = "ABORT_CONFIRMED"; }
                catch { clientDelivery = "ABORT_UNVERIFIED"; throw Error("ABORT_UNVERIFIED"); }
            };
            try {
                await adapter.assertScope(structuredClone(scope));
                requireThat(await adapter.claim({ scope: structuredClone(scope), target: structuredClone(target), mode }) === true);
                await adapter.record({ stage: "PROBE_ARMED_BEFORE_FORWARD" });
                await adapter.assertScope(structuredClone(scope));
                if (mode === "BLOCK_BEFORE_FORWARD") {
                    await abort();
                    // Zero local sender calls is distinct from an independent DB observation.
                    stage = "NO_FORWARD_CALL_CLIENT_STILL_UNKNOWN";
                } else {
                    stage = "FORWARD_IN_FLIGHT"; forwards++;
                    const response = await adapter.forwardOnce();
                    const status = response.status(); requireThat(Number.isInteger(status) && status >= 100 && status <= 599); upstreamStatus = status;
                    const correlation = await response.requestId(); requireThat(typeof correlation === "string" && uuid(correlation)); requestId = correlation;
                    await adapter.record({ stage: "UPSTREAM_STATUS_OBSERVED", httpStatus: status, requestId });
                    // Never treat status 200 alone as a committed DB/Blob write.
                    if (status === (target.kind === "MENU_CREATE" ? 201 : 200)) {
                        const raw = await response.json();
                        if (target.kind === "MENU_CREATE") {
                            const parsedId = menuCreateResponseSchema.shape.id.safeParse(raw && typeof raw === "object" ? (raw as { id?: unknown }).id : undefined);
                            if (parsedId.success) { createdMenuId = parsedId.data; await adapter.record({ stage: "CREATED_201_ID_RECORDED", menuId: createdMenuId, requestId }); }
                            requireThat(menuCreateResponseSchema.safeParse(raw).success);
                        }
                        else if (target.kind === "MENU_SAVE") {
                            const r = menuSaveResponseSchema.parse(raw); requireThat(r.menu.id === target.menuId && r.menu.version > target.beforeVersion!);
                        } else if (target.kind === "SHOP_SAVE") requireThat(parseShopSaveResponse(raw, scope.shopId, target.beforeUpdatedAt!) !== null);
                        else if (target.kind === "STOP") {
                            const r = raw as { ok?: unknown; menu?: { id?: unknown; version?: unknown; isPublished?: unknown } };
                            requireThat(r && r.ok === true && r.menu && r.menu.id === target.menuId && r.menu.isPublished === false
                                && typeof r.menu.version === "number" && Number.isSafeInteger(r.menu.version) && r.menu.version > target.beforeVersion!);
                        } else {
                            privateBlob = blobFromResponse(raw, scope, upload!, target.kind === "MENU_UPLOAD" ? "menu" : "shop", requestId);
                            requireThat(await adapter.recordKnownObject!(Object.freeze(structuredClone(privateBlob))) === true);
                            objectRecorded = true;
                        }
                        bodyValidated = true;
                    }
                    await adapter.assertScope(structuredClone(scope));
                    if (mode === "WITHHOLD_AFTER_RESPONSE") {
                        await abort();
                        stage = "UPSTREAM_RESPONSE_WITHHELD_CLIENT_UNKNOWN";
                    } else {
                        clientDelivery = "DELIVERY_IN_FLIGHT";
                        await adapter.deliverOnce(response); clientDelivery = "DELIVERY_CONFIRMED"; clientUnknown = !bodyValidated;
                        stage = bodyValidated ? "DELIVERED_RESPONSE_NOT_INDEPENDENTLY_ATTESTED" : "DELIVERED_NON_SUCCESS_RESPONSE";
                    }
                }
                const observedUi = await adapter.observeUi();
                requireThat(observedUi && [observedUi.inputRetained, observedUi.fileRetained, observedUi.successDisplayed].every(v => typeof v === "boolean")
                    && Number.isSafeInteger(observedUi.followupWrites) && observedUi.followupWrites >= 0);
                ui = { inputRetained: observedUi.inputRetained, fileRetained: observedUi.fileRetained,
                    successDisplayed: observedUi.successDisplayed, followupWrites: observedUi.followupWrites };
                if (mode !== "DELIVER") requireThat(ui.inputRetained && (!fileExpected || ui.fileRetained) && !ui.successDisplayed && ui.followupWrites === 0);
                completed = true;
                await adapter.record({ stage });
            } catch {
                completed = false; clientUnknown = true; stage = forwards ? "HOLD_AFTER_FORWARD_NO_RETRY_OR_CLEANUP" : "HELD_NO_FORWARD_CALL";
                // Do not continue/fallback, refetch to infer success, or send a second write.
                if (clientDelivery === "NOT_ATTEMPTED") {
                    try { await abort(); } catch { /* fixed state above; no retry */ }
                }
            }
            return result();
        },
        // One credential-free public GET of the exact acknowledged object. A
        // read can collect evidence after a withheld response but NEVER unholds
        // that client write or enables followup writes/cleanup.
        async observeKnownBlob(read: { assertScope(scope: ProbeScope): Promise<void>;
            readExactObject(ref: Readonly<PrivateBlob>): Promise<{ status: number; sha256?: string; bytes?: number; contentType?: string }> }) {
            requireThat(!objectReadUsed && objectRecorded && privateBlob && upload); objectReadUsed = true;
            const ref = Object.freeze(structuredClone(privateBlob));
            try {
                await read.assertScope(structuredClone(scope));
                const got = await read.readExactObject(ref);
                requireThat(got.status === 200 && got.sha256 === upload.fixtureSha256 && got.bytes === upload.fixtureBytes && got.contentType === "image/png");
                await adapter.record({ stage: "EXACT_KNOWN_OBJECT_BYTES_MATCH", objectSha256: ref.objectSha256 });
                return { stage: "EXACT_KNOWN_OBJECT_BYTES_MATCH", clientUnknown, externalBlob: "NOT_ATTESTED" };
            } catch { return { stage: "OBJECT_READ_UNVERIFIED", clientUnknown, externalBlob: "NOT_ATTESTED" }; }
        },
        // Cleanup cannot use a guessed URL, a prefix/listing, old fixture, unknown
        // upload, or an image still referenced by any public OR private record.
        async cleanupKnownBlob(input: {
            approval: { action: "DELETE_SINGLE_RUN_BLOB"; runId: string; objectSha256: string };
            reconciliation: { runId: string; requestId: string; objectSha256: string; isolationReceiptSha256: string;
                uploadAuditMatches: boolean; fixturePrivateAndKnown: boolean; allOriginalWritesTerminal: boolean; totalDbReferences: number };
            adapter: { assertScope(scope: ProbeScope): Promise<void>;
                // Fresh independent DB zero-reference check under the caller's
                // exclusive owner lease. If other writers cannot be excluded,
                // retain the object instead. No schema/locking change implied.
                recheckUnreferencedUnderExclusiveOwnerLease(ref: Readonly<PrivateBlob>): Promise<boolean>;
                readExactObject(ref: Readonly<PrivateBlob>): Promise<{ status: number; sha256?: string; bytes?: number }>;
                deleteExactObject(ref: Readonly<PrivateBlob>): Promise<{ acknowledged: boolean }>; }
        }) {
            const ref = privateBlob && Object.freeze(structuredClone(privateBlob));
            const { approval, reconciliation: r, adapter: cleanup } = input;
            requireThat(completed && !clientUnknown && ref && upload && approval.action === "DELETE_SINGLE_RUN_BLOB"
                && approval.runId === scope.runId && approval.objectSha256 === ref.objectSha256 && r.runId === scope.runId
                && r.requestId === ref.requestId && r.objectSha256 === ref.objectSha256 && r.isolationReceiptSha256 === scope.isolationReceiptSha256
                && r.uploadAuditMatches === true && r.fixturePrivateAndKnown === true && r.allOriginalWritesTerminal === true && r.totalDbReferences === 0);
            requireThat(!cleanupUsed); cleanupUsed = true;
            let deleteCalls = 0;
            try {
                await cleanup.assertScope(structuredClone(scope));
                const before = await cleanup.readExactObject(ref);
                requireThat(before.status === 200 && before.sha256 === upload.fixtureSha256 && before.bytes === upload.fixtureBytes);
                await adapter.record({ stage: "EXACT_OBJECT_CLEANUP_INTENT", objectSha256: ref.objectSha256 });
                await cleanup.assertScope(structuredClone(scope));
                requireThat(await cleanup.recheckUnreferencedUnderExclusiveOwnerLease(ref) === true);
                deleteCalls++; requireThat((await cleanup.deleteExactObject(ref)).acknowledged === true);
                const after = await cleanup.readExactObject(ref); requireThat(after.status === 404);
                await adapter.record({ stage: "EXACT_OBJECT_DELETE_ACK_AND_NOT_FOUND" });
                return { stage: "EXACT_OBJECT_DELETE_ACK_AND_NOT_FOUND", deleteCalls, externalBlob: "NOT_ATTESTED" };
            } catch { return { stage: deleteCalls ? "HOLD_DELETE_RESULT_OR_VERIFICATION_UNKNOWN_NO_RETRY" : "CLEANUP_REFUSED_NO_DELETE", deleteCalls, externalBlob: "NOT_ATTESTED" }; }
        },
    };
}
