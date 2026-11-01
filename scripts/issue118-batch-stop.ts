// Injectable evaluator-side STOP executor. No HTTP, auth, DB, Blob, file I/O or CLI.
// Setup/create/publish, source CSV projection and independent SQL stay with caller.
import { createHash } from "node:crypto";
import { savedMenuResponseSchema, type SavedMenu } from "../features/admin/menus/schemas/menu-response";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import { phase1Source, prepareFixtureStops, type FixtureBinding, type OwnerBinding } from "./issue118-fixture-map";
import { menuOwners, type MenuId } from "./issue118-stop-oracle";

type Operation = { phase: string; state: string; bodyValidated?: boolean; requestSent?: boolean; code?: string };
type Ledger = { held: boolean; operations: Operation[] };
export type LedgerPort = {
    newWriteLedger(): Ledger;
    beginWrite(ledger: Ledger, phase: string): Operation;
    holdWrite(ledger: Ledger, op: Operation, code: string): void;
    confirmWrite(ledger: Ledger, op: Operation): void;
};
function requireThat(condition: unknown): asserts condition { if (!condition) throw Error("ISSUE118_BATCH_INPUT_REFUSED"); }

// Same four pure state operations as the read-only PR120 ledger. Local copy avoids
// importing its auth/live entry module into this main-based test branch. A caller
// can inject those four exports directly. NEVER inject T1's action()/click wrapper.
// Neither implementation sends: dispatchStop below is the sole send boundary.
const localLedger: LedgerPort = {
    newWriteLedger: () => ({ held: false, operations: [] }),
    beginWrite(ledger, phase) {
        requireThat(!ledger.held && ledger.operations.every(op => op.state === "CONFIRMED_SUCCESS")
            && !ledger.operations.some(op => op.phase === phase));
        const op = { phase, state: "ARMED", requestSent: false }; ledger.operations.push(op); return op;
    },
    holdWrite(ledger, op, code) { ledger.held = true; op.state = "INDETERMINATE"; op.code = code; },
    confirmWrite(ledger, op) { requireThat(!ledger.held && op.bodyValidated === true); op.state = "CONFIRMED_SUCCESS"; },
};

export function fixturePayload(menu: SavedMenu) {
    return { name: menu.name, description: menu.description, category: menu.category, priceYen: menu.priceYen,
        ingredients: menu.ingredients, precaution: menu.precaution, imageUrl: menu.imageUrl,
        imageFrame: menu.imageFrame, imageFit: menu.imageFit, imagePosition: menu.imagePosition,
        imageZoom: menu.imageZoom, imagePositionX: menu.imagePositionX, imagePositionY: menu.imagePositionY,
        allergenStatusBySlug: Object.fromEntries(menu.allergens.map(a => [a.slug, a.status])) };
}
export type PayloadPack = {
    kind: "SYNTHETIC" | "CALLER_PROJECTED_ORIGINAL";
    archiveSha256?: string; recipeCardsSha256?: string; physicalGoldSha256?: string;
    expectedByMenu: Record<MenuId, ReturnType<typeof fixturePayload>>;
};
export type MenuTarget = { key: MenuId; menuId: string; shopId: string; contextRef: string };
export type StopCommand = MenuTarget & {
    method: "POST"; path: string; body: { expectedVersion: number };
};
type StopResponse = { status(): number; json(): Promise<unknown> };
type Event = { sequence: number; stage: string; key?: MenuId; menuId?: string; version?: number; httpStatus?: number };
type Adapter = {
    // Atomic durable run claim/manifest receipt, including across fresh instances.
    // A pending/unknown claim is not cleared automatically. Not a business write.
    claimRun(manifest: { runId: string; scenario: string; fixtures: Array<{ key: MenuId; menuId: string; creationOperationId: string; version: number }> }): Promise<boolean>;
    // Must use existing target/isolation/identity guards and actor's own context.
    assertActor(target: MenuTarget): Promise<void>;
    // shopId must come from that context's server owner receipt, not client input.
    readOwnMenu(target: MenuTarget): Promise<{ shopId: string; menu: unknown }>;
    // Exactly one dispatch. No nested UI action, retry or cleanup wrapper here.
    dispatchStop(command: StopCommand): Promise<StopResponse>;
    // Caller persists this safe event before dispatch; this module never writes files.
    record(event: Event): Promise<void>;
};
type RecordEntry = { key: MenuId; menuId: string; state: string; dispatchCalls: number; httpStatus: number | null; publicRefreshPending: boolean | null; code?: string };
const normalized = (value: unknown): unknown => value && typeof value === "object"
    ? Array.isArray(value) ? value.map(normalized)
        : Object.fromEntries(Object.keys(value).sort().map(k => [k, normalized((value as Record<string, unknown>)[k])])) : value;
const canonical = (value: unknown) => JSON.stringify(normalized(value)) ?? "null";
const stableAfterStop = (menu: SavedMenu) => {
    const copy: Partial<SavedMenu> = structuredClone(menu); delete copy.version; delete copy.isPublished; return canonical(copy);
};
const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

async function untilAbort<T>(task: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return task;
    // Keep late rejection observed. Aborting the wait does NOT cancel/rollback a server write.
    void task.catch(() => {});
    if (signal.aborted) throw Error("BATCH_ABORTED_IN_FLIGHT");
    let listener: () => void = () => {};
    try {
        return await Promise.race([task, new Promise<never>((_, reject) => {
            listener = () => reject(Error("BATCH_ABORTED_IN_FLIGHT")); signal.addEventListener("abort", listener, { once: true });
        })]);
    } finally { signal.removeEventListener("abort", listener); }
}

export function prepareBatchStops(input: { scenario: "T2" | "T3"; runId: string; bindings: readonly FixtureBinding[];
    owners: readonly OwnerBinding[]; payloads: PayloadPack; adapter: Adapter; ledgerPort?: LedgerPort; signal?: AbortSignal }) {
    const { scenario, runId, signal } = input;
    requireThat(["T2", "T3"].includes(scenario));
    const bindings = structuredClone(input.bindings), owners = structuredClone(input.owners), payloads = structuredClone(input.payloads);
    const plan = prepareFixtureStops(scenario, runId, bindings, owners);
    requireThat(payloads && payloads.expectedByMenu && ["SYNTHETIC", "CALLER_PROJECTED_ORIGINAL"].includes(payloads.kind)
        && Object.keys(payloads.expectedByMenu).length === 8 && Object.keys(menuOwners).every(key => Object.hasOwn(payloads.expectedByMenu, key)));
    if (payloads.kind === "CALLER_PROJECTED_ORIGINAL") requireThat(payloads.archiveSha256 === phase1Source.archiveSha256
        && payloads.recipeCardsSha256 === phase1Source.recipeCardsSha256 && payloads.physicalGoldSha256 === phase1Source.physicalGoldSha256);
    const adapter = input.adapter, port = input.ledgerPort ?? localLedger;
    requireThat([adapter.claimRun, adapter.assertActor, adapter.readOwnMenu, adapter.dispatchStop, adapter.record,
        port.newWriteLedger, port.beginWrite, port.holdWrite, port.confirmWrite].every(f => typeof f === "function"));
    const commands = bindings.map(binding => Object.freeze({ key: binding.key, menuId: binding.menuId, shopId: binding.shopId,
        contextRef: owners.find(o => o.owner === menuOwners[binding.key])!.contextRef, method: "POST" as const,
        path: `/api/admin/menus/${binding.menuId}/stop`, body: Object.freeze({ expectedVersion: binding.before.version }) }));
    const selected = [...plan.byOwner.S1, ...plan.byOwner.S2].map(step => commands.find(c => c.key === step.key)!);
    const ledgers = new Map<MenuId, Ledger>(), identities = new Set<Ledger>();
    for (const command of commands) {
        const ledger = port.newWriteLedger(); requireThat(!identities.has(ledger) && !ledger.held && ledger.operations.length === 0);
        identities.add(ledger); ledgers.set(command.key, ledger);
    }
    let used = false, sequence = 0;
    return {
        async execute() {
            requireThat(!used); used = true;
            const journal: RecordEntry[] = selected.map(command => ({ key: command.key, menuId: command.menuId,
                state: "NOT_DISPATCHED", dispatchCalls: 0, httpStatus: null, publicRefreshPending: null }));
            const baseline = new Map<MenuId, SavedMenu>(), expected = new Map<MenuId, SavedMenu>();
            let evidenceAcknowledged = true;
            const result = (status: string) => ({ status, scenario, runId,
                evidenceLevel: payloads.kind === "SYNTHETIC" ? "SYNTHETIC_ADAPTER_TEST" : "APP_ADAPTER_NOT_INDEPENDENTLY_ATTESTED",
                originalPayloadProjection: "CALLER_SUPPLIED_NOT_ATTESTED", externalAuthAndDatabase: "NOT_ATTESTED", publicPropagation: "NOT_ATTESTED",
                journal: structuredClone(journal), evidenceAcknowledged,
                confirmedIds: journal.filter(r => r.state === "CONFIRMED_RESPONSE_AND_READBACK").map(r => r.key),
                unknownOrUnverifiedIds: journal.filter(r => r.dispatchCalls > 0 && r.state !== "CONFIRMED_RESPONSE_AND_READBACK").map(r => r.key),
                next: scenario === "T3" ? "HOLD_LOT_ALLOCATION_NO_REPUBLICATION"
                    : status === "ALL_STOP_RESPONSES_AND_API_READBACKS_CONFIRMED_NOT_LIVE_PASS" ? "REVIEW_BEFORE_SEPARATE_PUBLICATION"
                        : "HOLD_RECONCILE_ORIGINAL_OPERATION_NO_WRITES",
                automaticRetry: false, automaticCleanup: false, republication: false,
                payloadHashes: Object.fromEntries(commands.map(c => [c.key, digest(payloads.expectedByMenu[c.key])])) });
            const record = async (stage: string, command?: StopCommand, httpStatus?: number) => {
                try { await adapter.record({ sequence: ++sequence, stage, ...(command ? { key: command.key, menuId: command.menuId, version: command.body.expectedVersion } : {}),
                    ...(httpStatus === undefined ? {} : { httpStatus }) }); }
                catch { evidenceAcknowledged = false; throw Error("BATCH_EVIDENCE_UNVERIFIED"); }
            };
            const read = async (command: StopCommand) => {
                const target = Object.freeze({ key: command.key, menuId: command.menuId, shopId: command.shopId, contextRef: command.contextRef });
                await adapter.assertActor(target);
                const receipt = await adapter.readOwnMenu(target), menu = savedMenuResponseSchema.parse({ menu: receipt.menu }).menu;
                requireThat(receipt.shopId === command.shopId && menu.id === command.menuId
                    && menu.allergens.length === ALLERGEN_MASTER.length && ALLERGEN_MASTER.every(a => menu.allergens.some(b => b.slug === a.slug)));
                return menu;
            };
            if (signal?.aborted) return result("ABORTED_BEFORE_DISPATCH");
            try {
                const claimed = await adapter.claimRun({ runId, scenario, fixtures: bindings.map(b => ({ key: b.key,
                    menuId: b.menuId, creationOperationId: b.creation.operationId, version: b.before.version })) });
                if (claimed !== true) return result("RUN_ALREADY_CLAIMED_NO_DISPATCH");
            } catch { return result("RUN_CLAIM_UNVERIFIED_NO_DISPATCH"); }
            try {
                await record("PLAN_VALIDATED_NO_DISPATCH");
                for (const command of commands) {
                    const menu = await untilAbort(read(command), signal), binding = bindings.find(b => b.key === command.key)!;
                    requireThat(menu.version === binding.before.version && menu.foodVersion === binding.before.foodVersion && menu.isPublished
                        && menu.publicationConfirmedFoodVersion === binding.before.publicationConfirmedFoodVersion
                        && canonical(fixturePayload(menu)) === canonical(payloads.expectedByMenu[command.key]));
                    baseline.set(command.key, menu); expected.set(command.key, menu);
                }
            } catch { return result("PREFLIGHT_REFUSED_NO_DISPATCH"); }
            for (const command of selected) {
                if (signal?.aborted) return result("ABORTED_BETWEEN_OPERATIONS");
                const entry = journal.find(r => r.key === command.key)!, ledger = ledgers.get(command.key)!;
                let op: Operation;
                try {
                    requireThat(canonical(await untilAbort(read(command), signal)) === canonical(baseline.get(command.key)));
                    if (signal?.aborted) return result("ABORTED_BETWEEN_OPERATIONS");
                    op = port.beginWrite(ledger, "STOP");
                    await record("DISPATCH_INTENT_NOT_NETWORK_RECEIPT", command);
                    if (signal?.aborted) return result("ABORTED_BETWEEN_OPERATIONS");
                    await adapter.assertActor(Object.freeze({ key: command.key, menuId: command.menuId, shopId: command.shopId, contextRef: command.contextRef }));
                    if (signal?.aborted) return result("ABORTED_BETWEEN_OPERATIONS");
                } catch { entry.code = "BEFORE_DISPATCH_REFUSED"; return result("PREFLIGHT_REFUSED_NO_FURTHER_DISPATCH"); }
                let responseKnown = false;
                try {
                    op.state = "IN_FLIGHT"; entry.state = "IN_FLIGHT"; entry.dispatchCalls++;
                    const response = await untilAbort(Promise.resolve(adapter.dispatchStop(command)), signal);
                    const httpStatus = response.status();
                    requireThat(Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599); entry.httpStatus = httpStatus;
                    if (entry.httpStatus !== 200) { entry.state = "KNOWN_HTTP_NON_SUCCESS"; throw Error("STOP_NON_SUCCESS"); }
                    const body = await untilAbort(response.json(), signal) as { ok?: unknown; publicRefreshPending?: unknown; menu?: { id?: unknown; version?: unknown; isPublished?: unknown } };
                    requireThat(body?.ok === true && body.menu?.id === command.menuId && body.menu.isPublished === false
                        && Number.isSafeInteger(body.menu.version) && (body.menu.version as number) > command.body.expectedVersion
                        && (body.publicRefreshPending === undefined || typeof body.publicRefreshPending === "boolean"));
                    entry.publicRefreshPending = typeof body.publicRefreshPending === "boolean" ? body.publicRefreshPending : null;
                    responseKnown = true; entry.state = "CONFIRMED_RESPONSE_READBACK_PENDING";
                    const after = await untilAbort(read(command), signal), before = baseline.get(command.key)!;
                    requireThat(after.version === body.menu.version && !after.isPublished && stableAfterStop(after) === stableAfterStop(before));
                    if (signal?.aborted) throw Error("ABORTED_BEFORE_VERIFICATION_RECORDED");
                    op.bodyValidated = true; port.confirmWrite(ledger, op);
                    await record("RESPONSE_AND_READBACK_CONFIRMED", command, 200);
                    entry.state = "CONFIRMED_RESPONSE_AND_READBACK"; expected.set(command.key, after);
                } catch {
                    try { port.holdWrite(ledger, op, "BATCH_OPERATION_HELD"); } catch { /* never resume if supplied ledger fails */ }
                    if (entry.state !== "KNOWN_HTTP_NON_SUCCESS") entry.state = responseKnown ? "KNOWN_RESPONSE_VERIFICATION_HELD" : "INDETERMINATE";
                    entry.code = "NO_RETRY_OR_CLEANUP_RECONCILE_ORIGINAL_OPERATION";
                    try { await record("HELD_NO_FURTHER_DISPATCH", command, entry.httpStatus ?? undefined); } catch { /* return unacknowledged evidence */ }
                    return result("HOLD_NO_FURTHER_DISPATCH");
                }
            }
            try {
                for (const command of commands) { if (signal?.aborted) return result("ABORTED_BEFORE_FINAL_RECONCILIATION");
                    requireThat(canonical(await untilAbort(read(command), signal)) === canonical(expected.get(command.key))); }
                await record("ALL_SUPPLIED_API_FIELDS_RECONCILED_NOT_SQL");
            } catch { return result("HOLD_FINAL_API_RECONCILIATION_UNVERIFIED"); }
            return result("ALL_STOP_RESPONSES_AND_API_READBACKS_CONFIRMED_NOT_LIVE_PASS");
        },
    };
}
