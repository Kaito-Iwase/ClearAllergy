// Evaluator-side preparation only: no I/O, authentication, write or overall PASS.
// The caller supplies observations; structural validation is not their attestation.
// Keep gold-derived target lists away from an operator's first discovery task.
import { menuOwners, requiredStopsByOwner, type MenuId } from "./issue118-stop-oracle";

export const phase1Source = Object.freeze({
    verifiedBy: "parent_library_byte_audit",
    archiveSha256: "caf9556f660bff6516b8da6413fd323b0da794ba91c1269247f18a904a31b027",
    expectedSetsSha256: "1843c3af806144981e7b82b5b36bb09a10d6a1ba96b8e4be155d963f3e7df4bc",
    physicalGoldSha256: "ed1f47b2f05762fb7fb9c0258ee116ce49b4ae746c15d388f2612d01f78bb13c",
    recipeCardsSha256: "85cb69e60f2695a5b451c698f0f24455027e0e5437f58c2d9faef0cda2624dfe",
    csvMappingSha256: "7e6570c855a845a2257cae0aca481deaeb7d67c8082976817c2db019fe5dc338",
    viewerFixturesSha256: "f4f21a9b169785a9d875f5f09b3c37b8999efff6fc3d7ea32744d59ebcc70eac",
});
type Owner = "S1" | "S2";
export type FixtureBinding = {
    key: MenuId;
    menuId: string;
    shopId: string;
    runId: string;
    name: string;
    creation: { operationId: string; status: number; outcome: "CONFIRMED_SUCCESS" | "INDETERMINATE" };
    before: { version: number; foodVersion: number; publicationConfirmedFoodVersion: number | null; isPublished: boolean };
};
export type OwnerBinding = { owner: Owner; shopId: string; contextRef: string };

const previousFixtures = new Set([
    "cmvs4x86o000vwn0w93c8ttez", "cmvs4x8wt000xwn0wj6gwdih1", "cmvs4x986000zwn0wer2ymhow",
    "cmvuiodx30001jg08xmr6nexe", "cmvuy8d4z0003jw07e9fobsdm", "cmvuzlqhf0003l308lem3uwck",
]);
const id = (value: string) => typeof value === "string" && /^c[a-z0-9]+$/.test(value);
const uuid = (value: string) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validVersion = (value: number) => Number.isSafeInteger(value) && value >= 0;
function refuse(condition: unknown) {
    if (!condition) throw new Error("ISSUE118_FIXTURE_MAP_REFUSED");
}
export function fixtureName(runId: string, key: MenuId) {
    refuse(uuid(runId) && Object.hasOwn(menuOwners, key));
    return `【架空・Issue118 batch】${runId} ${key}`;
}

// Called AFTER creation/publication has been separately authorized and confirmed.
// This does not create/publish fixtures, verify recipes or authenticate contexts.
// Before each actual write the live runner must recheck identity/target/version
// and use its existing one-write/unknown ledger. Do not execute this list blindly.
export function prepareFixtureStops(scenario: "T2" | "T3" | "T4", runId: string,
    bindings: readonly FixtureBinding[], owners: readonly OwnerBinding[]) {
    refuse(["T2", "T3", "T4"].includes(scenario) && uuid(runId));
    refuse(Array.isArray(owners) && owners.length === 2);
    const byOwner = new Map<Owner, OwnerBinding>();
    for (const owner of owners) {
        refuse(owner && ["S1", "S2"].includes(owner.owner) && !byOwner.has(owner.owner));
        refuse(id(owner.shopId) && typeof owner.contextRef === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(owner.contextRef));
        byOwner.set(owner.owner, owner);
    }
    refuse(new Set(owners.map(o => o.shopId)).size === 2 && new Set(owners.map(o => o.contextRef)).size === 2);
    refuse(Array.isArray(bindings) && bindings.length === Object.keys(menuOwners).length);
    const byMenu = new Map<MenuId, FixtureBinding>(), ids = new Set<string>(), operations = new Set<string>();
    for (const binding of bindings) {
        refuse(binding && Object.hasOwn(menuOwners, binding.key) && !byMenu.has(binding.key));
        refuse(id(binding.menuId) && !ids.has(binding.menuId) && !previousFixtures.has(binding.menuId));
        refuse(binding.runId === runId && binding.name === fixtureName(runId, binding.key));
        refuse(binding.shopId === byOwner.get(menuOwners[binding.key])?.shopId);
        refuse(binding.creation?.status === 201 && binding.creation.outcome === "CONFIRMED_SUCCESS"
            && uuid(binding.creation.operationId) && !operations.has(binding.creation.operationId));
        const before = binding.before;
        refuse(before && validVersion(before.version) && validVersion(before.foodVersion)
            && before.isPublished === true && before.publicationConfirmedFoodVersion === before.foodVersion);
        byMenu.set(binding.key, binding); ids.add(binding.menuId); operations.add(binding.creation.operationId);
    }
    const required = requiredStopsByOwner(scenario);
    const steps = (owner: Owner) => required[owner].map(key => {
        const binding = byMenu.get(key)!;
        return { key, menuId: binding.menuId, shopId: binding.shopId, contextRef: byOwner.get(owner)!.contextRef,
            expectedVersion: binding.before.version, foodVersionBefore: binding.before.foodVersion,
            expectAfterStop: { isPublished: false, foodVersion: binding.before.foodVersion } };
    });
    return {
        scenario, runId, source: phase1Source, evidenceLevel: "PREPARATION_ONLY" as const,
        byOwner: { S1: steps("S1"), S2: steps("S2") },
        preserve: bindings.filter(b => !required.S1.includes(b.key) && !required.S2.includes(b.key)).map(b => b.menuId),
        afterStops: scenario === "T3" ? "HOLD_LOT_ALLOCATION_NO_REPUBLICATION" : scenario === "T4"
            ? "OBSERVE_FRESH_OLD_BACK_REFETCH_SEPARATELY" : "REVIEW_CHANGED_FOOD_BEFORE_SEPARATE_PUBLICATION",
        runtimePrerequisites: ["CURRENT_TARGET_AND_ISOLATION_RECEIPT", "REAL_IDENTITY_AND_SHOP_MATCH",
            "RECIPE_PAYLOAD_AND_SOURCE_CSV_MATCH", "FRESH_VERSION_BEFORE_EACH_WRITE",
            "EXISTING_WRITE_LEDGER_NO_RETRY_OR_CLEANUP_ON_UNKNOWN", "INDEPENDENT_DB_AND_PROTECTION_RECONCILIATION"],
    };
}
