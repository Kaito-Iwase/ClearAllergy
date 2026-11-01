// Injectable evaluator-side STOP executor. No HTTP, auth, DB, Blob, file I/O or CLI.
// Actual setup/create/publish and independent SQL stay with caller.
import { createHash } from "node:crypto";
import { menuCreateResponseSchema, menuSaveResponseSchema, savedMenuResponseSchema, type SavedMenu } from "../features/admin/menus/schemas/menu-response";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import { DEFAULT_MENU_IMAGE_FIT, DEFAULT_MENU_IMAGE_FRAME, DEFAULT_MENU_IMAGE_POSITION, DEFAULT_MENU_IMAGE_ZOOM,
    DEFAULT_MENU_IMAGE_POSITION_X, DEFAULT_MENU_IMAGE_POSITION_Y } from "../lib/utils/menu-image-display";
import { menuInputSchema } from "../features/admin/menus/schemas/menu-input";
import { fixtureName, originalMenuNames, phase1Source, prepareFixtureStops, type FixtureBinding, type OwnerBinding } from "./issue118-fixture-map";
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

// Parent's original ZIP extraction transcription; not original BOM/CSV bytes.
// menu-register.csv L2-9; recipe-cards.csv L2-9. No mock version/time/PUB history.
const originalRows = [
    ["M01", "鶏肉、共通ソース（トマト、ひまわり油、塩）", "AV-CHICKEN", "P-SAUCE"],
    ["M02", "にんじん、ブロッコリー、共通ソース（トマト、ひまわり油、塩）", "AV-BASE", "P-SAUCE"],
    ["M03", "ひよこ豆、ドレッシング（油、酢、塩）", "AV-BASE", "P-DRESS"],
    ["M04", "米、水", "AV-BASE", "P-RICE"],
    ["M05", "タラ、共通ソース（トマト、ひまわり油、塩）", "AV-BASE", "P-SAUCE"],
    ["M06", "かぼちゃ、にんじん、共通ソース（トマト、ひまわり油、塩）", "AV-BASE", "P-SAUCE"],
    ["M07", "さつまいも、塩", "AV-BASE", "P-POTATO"],
    ["M08", "キャベツ、にんじん、スープベース（野菜、塩）", "AV-BASE", "P-STOCK"],
] as const;
const originalSlugs = ["shrimp", "crab", "walnut", "wheat", "buckwheat", "egg", "milk", "peanut", "almond", "abalone", "squid",
    "salmon_roe", "orange", "cashew", "kiwifruit", "beef", "sesame", "salmon", "mackerel", "soybean", "chicken", "banana", "pork",
    "macadamia_nut", "peach", "apple", "yam", "gelatin", "pistachio"];
export function projectOriginalPayloads(runId: string, masterSlugs: readonly string[] = ALLERGEN_MASTER.map(a => a.slug)): PayloadPack {
    requireThat(masterSlugs.length === originalSlugs.length && new Set(masterSlugs).size === originalSlugs.length && masterSlugs.every(slug => originalSlugs.includes(slug)));
    const expectedByMenu = Object.fromEntries(originalRows.map(([key, ingredients, vector]) => [key, {
        name: fixtureName(runId, key), description: null, category: null, priceYen: 800, ingredients, precaution: null, imageUrl: null,
        imageFrame: DEFAULT_MENU_IMAGE_FRAME, imageFit: DEFAULT_MENU_IMAGE_FIT, imagePosition: DEFAULT_MENU_IMAGE_POSITION,
        imageZoom: DEFAULT_MENU_IMAGE_ZOOM, imagePositionX: DEFAULT_MENU_IMAGE_POSITION_X, imagePositionY: DEFAULT_MENU_IMAGE_POSITION_Y,
        allergenStatusBySlug: Object.fromEntries(originalSlugs.map(slug => [slug, vector === "AV-CHICKEN" && slug === "chicken" ? "CONTAINS" : "FREE"])),
    }])) as PayloadPack["expectedByMenu"];
    return { kind: "CALLER_PROJECTED_ORIGINAL", archiveSha256: phase1Source.archiveSha256,
        recipeCardsSha256: phase1Source.recipeCardsSha256, physicalGoldSha256: phase1Source.physicalGoldSha256, expectedByMenu };
}
export function originalCreateRequests(runId: string, operationIds: Record<MenuId, string>) {
    const pack = projectOriginalPayloads(runId);
    requireThat(new Set(Object.values(operationIds)).size === 8 && Object.keys(operationIds).length === 8);
    return originalRows.map(([key, , vector, ingredient], i) => {
        const parsed = menuInputSchema.safeParse({ ...pack.expectedByMenu[key], operationId: operationIds[key], isPublished: false });
        requireThat(parsed.success && typeof parsed.data.operationId === "string");
        return { key, owner: menuOwners[key], originalName: originalMenuNames[key], recipeIngredientId: ingredient,
            source: { menuRegisterRow: i + 2, recipeCardRow: i + 2, vector,
                allergenBaselineRows: vector === "AV-CHICKEN" ? "31-59" : "2-30", provenance: "PARENT_ORIGINAL_TRANSCRIPTION_NOT_BYTE_COPY" },
            body: parsed.data };
    });
}
const originalCards = [
    ["T2", "E21", "START", "仕入先：P-SAUCE L1に乳成分追加。両店へ本日納品済。対応する料理を確認してください。", 4],
    ["T2", "E22", "RECIPE_LOOKUP", "R-M01～R-M08の全8件を同じ目録で提示。CSV以外の使用がないかはこの一覧と厨房記録を照合できる。", 5],
    ["T2", "E23", "PHYSICAL_SOURCE_LOOKUP", "P-SAUCE L1新ラベルに乳。旧L0撤去済の両店棚卸票。本日仕込み表にはR-M01/R-M02/R-M05/R-M06がある。", 6],
    ["T3", "E31", "START", "P-SAUCE旧L0（乳表示なし）と新L1（乳表示あり）が同じ棚にある。今日のM01/M05の仕込みに使用。ロットと提供皿の対応記録はない。", 7],
    ["T3", "E32", "LOT_ALLOCATION_LOOKUP", "仕込み担当：どの皿がどのロットかは確認できない。現在追加の資料はない。", 8],
] as const;
export function originalEvidence(scenario: "T2" | "T3", trigger: "START" | "RECIPE_LOOKUP" | "PHYSICAL_SOURCE_LOOKUP" | "LOT_ALLOCATION_LOOKUP") {
    return originalCards.filter(row => row[0] === scenario && row[2] === trigger)
        .map(([caseId, id, releaseTrigger, text, row]) => ({ caseId, id, releaseTrigger, text, sourceRow: row, sourceSha256: phase1Source.evidenceCardsSha256 }));
}
// Derived private correction, not a verbatim CSV cell. E21/E23 establish milk in
// L1 and removal of L0; T3 deliberately has no equivalent correction/publication.
export function t2PrivateCorrections(runId: string, observedEvidenceIds: readonly string[]) {
    requireThat(observedEvidenceIds.includes("E21") && observedEvidenceIds.includes("E23"));
    const pack = projectOriginalPayloads(runId);
    return originalRows.filter(row => row[3] === "P-SAUCE").map(([key]) => ({ key, owner: menuOwners[key],
        sourceEvidence: ["E21", "E23"], body: { ...pack.expectedByMenu[key], isPublished: false,
            ingredients: pack.expectedByMenu[key].ingredients!.replace("共通ソース（トマト、ひまわり油、塩）", "共通ソース（トマト、ひまわり油、塩、乳成分）"),
            allergenStatusBySlug: { ...pack.expectedByMenu[key].allergenStatusBySlug, milk: "CONTAINS" as const } as ReturnType<typeof fixturePayload>["allergenStatusBySlug"] } }));
}

type ScenarioCommand = { key: MenuId; owner: OwnerBinding; phase: "CREATE" | "INITIAL_PUBLISH" | "CORRECT_PRIVATE" | "REPUBLISH";
    menuId?: string; method: "POST" | "PUT"; path: string; body: ReturnType<typeof menuInputSchema.parse> };
export type OriginalScenarioAdapter = Adapter & {
    // Must be durable and exclusive BEFORE any fixture is created, not just STOP.
    claimScenario(manifest: { runId: string; scenario: "T2" | "T3"; owners: readonly OwnerBinding[]; operationIds: Record<MenuId, string> }): Promise<boolean>;
    assertOwner(owner: OwnerBinding): Promise<void>;
    // Single actual sender; do not wrap with T1's action() (which sends/owns its own ledger).
    dispatch(command: ScenarioCommand): Promise<StopResponse>;
};

// One callable run, from source projection through setup/STOP and (T2 only)
// private correction + separately saved-version publication. The caller owns
// target/auth transport, durable receipts, independent SQL/public observations
// and explicit cleanup. Nothing here imports or starts an external service.
export function prepareOriginalScenario(input: { scenario: "T2" | "T3"; runId: string; owners: readonly OwnerBinding[];
    operationIds: Record<MenuId, string>; adapter: OriginalScenarioAdapter; ledgerPort?: LedgerPort; signal?: AbortSignal }) {
    requireThat(["T2", "T3"].includes(input.scenario));
    const { scenario, runId, signal } = input, owners = structuredClone(input.owners), operationIds = structuredClone(input.operationIds);
    const requests = originalCreateRequests(runId, operationIds), pack = projectOriginalPayloads(runId), adapter = input.adapter;
    requireThat(owners.length === 2 && ["S1", "S2"].every(owner => owners.filter(o => o.owner === owner).length === 1)
        && new Set(owners.map(o => o.shopId)).size === 2 && new Set(owners.map(o => o.contextRef)).size === 2
        && owners.every(o => /^c[a-z0-9]+$/.test(o.shopId) && /^[A-Za-z0-9_-]{1,64}$/.test(o.contextRef)));
    requireThat([adapter.claimScenario, adapter.assertOwner, adapter.dispatch, adapter.claimRun, adapter.assertActor,
        adapter.readOwnMenu, adapter.dispatchStop, adapter.record].every(fn => typeof fn === "function"));
    const port = input.ledgerPort ?? localLedger;
    const ledgers = new Map(requests.map(r => [r.key, port.newWriteLedger()]));
    requireThat(new Set(ledgers.values()).size === 8 && [...ledgers.values()].every(l => !l.held && l.operations.length === 0));
    let used = false;
    return { async execute() {
        requireThat(!used); used = true;
        const created: Array<{ key: MenuId; menuId: string; operationId: string; outcome: string }> = [];
        const bindings: FixtureBinding[] = [], saved = new Map<MenuId, SavedMenu>();
        const phases: Array<{ key: MenuId; phase: string; state: string; httpStatus: number | null }> = [];
        let stage = "PREFLIGHT", sequence = 0, held = false;
        let stops: Awaited<ReturnType<ReturnType<typeof prepareBatchStops>["execute"]>> | undefined;
        const result = (status: string) => ({ status, scenario, runId, stage, created: structuredClone(created), phases: structuredClone(phases),
            ...(stops ? { stops } : {}), finalVersions: Object.fromEntries([...saved].map(([key, m]) => [key, { id: m.id, version: m.version,
                foodVersion: m.foodVersion, isPublished: m.isPublished, publicationConfirmedFoodVersion: m.publicationConfirmedFoodVersion }])),
            automaticRetry: false, automaticCleanup: false, externalAuthAndDatabase: "NOT_ATTESTED", publicPropagation: "NOT_ATTESTED",
            next: held ? "HOLD_RECONCILE_ORIGINAL_OPERATION_NO_WRITES" : scenario === "T3" ? "HOLD_LOT_ALLOCATION_NO_REPUBLICATION"
                : status === "SCENARIO_APP_RESPONSES_CONFIRMED_NOT_LIVE_PASS" ? "INDEPENDENT_DB_PUBLIC_AND_EXPLICIT_CLEANUP_REQUIRED" : "HOLD_NO_FURTHER_WRITES" });
        const record = (event: string, key?: MenuId, menuId?: string, version?: number) => adapter.record({ sequence: ++sequence, stage: event,
            ...(key ? { key } : {}), ...(menuId ? { menuId } : {}), ...(version === undefined ? {} : { version }) });
        const ownerOf = (key: MenuId) => owners.find(o => o.owner === menuOwners[key])!;
        const read = async (key: MenuId, id: string) => {
            const owner = ownerOf(key), target = { key, menuId: id, shopId: owner.shopId, contextRef: owner.contextRef };
            await adapter.assertActor(target);
            const got = await adapter.readOwnMenu(target), menu = savedMenuResponseSchema.parse({ menu: got.menu }).menu;
            requireThat(got.shopId === owner.shopId && menu.id === id && menu.allergens.length === originalSlugs.length
                && originalSlugs.every(slug => menu.allergens.some(a => a.slug === slug)));
            return menu;
        };
        const action = async (command: ScenarioCommand, expectedPayload: ReturnType<typeof fixturePayload>) => {
            stage = command.phase;
            const owner = ownerOf(command.key), ledger = ledgers.get(command.key)!;
            requireThat(!held && !signal?.aborted);
            await adapter.assertOwner(owner);
            if (command.menuId) {
                const previous = saved.get(command.key)!;
                requireThat(previous && canonical(await read(command.key, command.menuId)) === canonical(previous));
            }
            const op = port.beginWrite(ledger, command.phase);
            await record("SCENARIO_DISPATCH_INTENT_NOT_NETWORK_RECEIPT", command.key, command.menuId, command.body.expectedVersion);
            await adapter.assertOwner(owner); requireThat(!signal?.aborted);
            const item = { key: command.key, phase: command.phase, state: "IN_FLIGHT", httpStatus: null as number | null }; phases.push(item);
            let known = false;
            try {
                op.state = "IN_FLIGHT";
                const response = await untilAbort(Promise.resolve(adapter.dispatch(structuredClone(command))), signal);
                const status = response.status(); requireThat(Number.isInteger(status) && status >= 100 && status <= 599); item.httpStatus = status;
                if (status !== (command.phase === "CREATE" ? 201 : 200)) { item.state = "KNOWN_HTTP_NON_SUCCESS"; known = true; throw Error("SCENARIO_NON_SUCCESS"); }
                const raw = await untilAbort(response.json(), signal);
                let id: string;
                if (command.phase === "CREATE") {
                    // Retain confirmed 201 ID before later validation/readback can fail.
                    requireThat(raw && typeof raw === "object" && typeof (raw as { id?: unknown }).id === "string"
                        && /^c[a-z0-9]+$/.test((raw as { id: string }).id));
                    id = (raw as { id: string }).id;
                    requireThat(!created.some(c => c.menuId === id));
                    created.push({ key: command.key, menuId: id, operationId: operationIds[command.key], outcome: "201_ID_RECORDED_READBACK_PENDING" });
                    await record("CREATED_201_ID_RECORDED", command.key, id);
                    requireThat(menuCreateResponseSchema.safeParse(raw).success);
                } else {
                    const parsed = menuSaveResponseSchema.parse(raw);
                    id = parsed.menu.id; requireThat(id === command.menuId);
                }
                op.bodyValidated = true; port.confirmWrite(ledger, op); known = true;
                const previous = saved.get(command.key), menu = await untilAbort(read(command.key, id), signal);
                requireThat(canonical(fixturePayload(menu)) === canonical(expectedPayload));
                if (command.phase === "CREATE") requireThat(!menu.isPublished && menu.publicationConfirmedFoodVersion === null);
                else {
                    requireThat(previous && menu.version > previous.version);
                    const responseMenu = menuSaveResponseSchema.parse(raw).menu;
                    requireThat(menu.version === responseMenu.version && menu.foodVersion === responseMenu.foodVersion
                        && menu.isPublished === responseMenu.isPublished && menu.publicationConfirmedFoodVersion === responseMenu.publicationConfirmedFoodVersion);
                    if (command.phase === "CORRECT_PRIVATE") requireThat(!menu.isPublished && menu.foodVersion > previous.foodVersion && menu.publicationConfirmedFoodVersion === null);
                    else requireThat(menu.isPublished && menu.foodVersion === previous.foodVersion && menu.publicationConfirmedFoodVersion === menu.foodVersion);
                }
                saved.set(command.key, menu); item.state = "CONFIRMED_RESPONSE_AND_READBACK";
                if (command.phase === "CREATE") created.find(c => c.key === command.key)!.outcome = "CONFIRMED_RESPONSE_AND_READBACK";
                await record("SCENARIO_RESPONSE_AND_READBACK_CONFIRMED", command.key, id, menu.version);
                return menu;
            } catch {
                held = true;
                if (!known) { port.holdWrite(ledger, op, "SCENARIO_RESULT_UNKNOWN"); item.state = "INDETERMINATE"; }
                else if (item.state !== "KNOWN_HTTP_NON_SUCCESS") item.state = "KNOWN_RESPONSE_VERIFICATION_HELD";
                throw Error("SCENARIO_HALTED_NO_RAW_ERROR");
            }
        };
        try {
            requireThat(!signal?.aborted);
            for (const owner of owners) await adapter.assertOwner(owner);
            requireThat(await adapter.claimScenario({ runId, scenario, owners: structuredClone(owners), operationIds: structuredClone(operationIds) }) === true);
            for (const request of requests) {
                const owner = ownerOf(request.key), menu = await action({ key: request.key, owner, phase: "CREATE", method: "POST",
                    path: "/api/admin/menus", body: request.body }, pack.expectedByMenu[request.key]);
                const published = await action({ key: request.key, owner, menuId: menu.id, phase: "INITIAL_PUBLISH", method: "PUT",
                    path: `/api/admin/menus/${menu.id}`, body: { expectedVersion: menu.version, publicationAction: "publish" } }, pack.expectedByMenu[request.key]);
                bindings.push({ key: request.key, menuId: menu.id, shopId: owner.shopId, runId, name: published.name,
                    creation: { operationId: operationIds[request.key], status: 201, outcome: "CONFIRMED_SUCCESS" }, before: {
                        version: published.version, foodVersion: published.foodVersion, publicationConfirmedFoodVersion: published.publicationConfirmedFoodVersion, isPublished: true } });
            }
            stage = "STOP";
            await record(scenario === "T2" ? "SOURCE_E21_START_CONSULTED_AUTOMATED" : "SOURCE_E31_START_CONSULTED_AUTOMATED");
            stops = await prepareBatchStops({ scenario, runId, owners, bindings, payloads: pack, adapter, ledgerPort: port, signal }).execute();
            requireThat(stops.status === "ALL_STOP_RESPONSES_AND_API_READBACKS_CONFIRMED_NOT_LIVE_PASS");
            for (const key of stops.confirmedIds) {
                const menu = await read(key, bindings.find(b => b.key === key)!.menuId), before = saved.get(key)!;
                requireThat(!menu.isPublished && menu.foodVersion === before.foodVersion
                    && canonical(fixturePayload(menu)) === canonical(pack.expectedByMenu[key]));
                saved.set(key, menu);
            }
            if (scenario === "T3") {
                await record("SOURCE_E32_LOT_ALLOCATION_LOOKUP_CONSULTED_AUTOMATED");
                stage = "LOT_ALLOCATION_HOLD"; return result("SCENARIO_STOP_CONFIRMED_LOT_HOLD_NOT_LIVE_PASS");
            }
            // Automated source-known checks only; no human discovery-rate claim.
            await record("SOURCE_E23_PHYSICAL_SOURCE_LOOKUP_CONSULTED_AUTOMATED");
            for (const correction of t2PrivateCorrections(runId, ["E21", "E23"])) {
                const before = saved.get(correction.key)!, owner = ownerOf(correction.key);
                const expectedCorrected = { ...pack.expectedByMenu[correction.key], ingredients: correction.body.ingredients,
                    allergenStatusBySlug: correction.body.allergenStatusBySlug };
                const corrected = await action({ key: correction.key, owner, menuId: before.id, phase: "CORRECT_PRIVATE", method: "PUT",
                    path: `/api/admin/menus/${before.id}`, body: { ...correction.body, expectedVersion: before.version } }, expectedCorrected);
                await record("SAVED_FOOD_VERSION_READ_BEFORE_SEPARATE_PUBLICATION", correction.key, corrected.id, corrected.version);
                await action({ key: correction.key, owner, menuId: corrected.id, phase: "REPUBLISH", method: "PUT",
                    path: `/api/admin/menus/${corrected.id}`, body: { expectedVersion: corrected.version, publicationAction: "publish" } }, expectedCorrected);
            }
            for (const [key, expectedMenu] of saved) requireThat(canonical(await read(key, expectedMenu.id)) === canonical(expectedMenu));
            stage = "INDEPENDENT_ATTESTATION_REQUIRED";
            return result("SCENARIO_APP_RESPONSES_CONFIRMED_NOT_LIVE_PASS");
        } catch {
            if (stops && stops.status !== "ALL_STOP_RESPONSES_AND_API_READBACKS_CONFIRMED_NOT_LIVE_PASS") held = true;
            return result(held ? "HOLD_NO_FURTHER_WRITES" : "PREFLIGHT_OR_READ_VERIFICATION_HELD_NO_FURTHER_WRITES");
        }
    } };
}
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
