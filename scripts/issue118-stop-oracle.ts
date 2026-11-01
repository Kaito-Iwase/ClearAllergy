// Evaluator-only arithmetic, not a product rule or an executable service fixture.
// Transcribed from ClearAllergy-Issue118-検証設計.md (Phase 1, 2026-10-29),
// sections 台本と期待行動 / 採点、分子・分母 / 比較上の追加制約.
// The original operator CSV/cards are not bundled here. Never give this gold to
// an operator or use synthetic scores as evidence of live STOP/auth/DB success.
export const scenarioIds = ["T1", "T2", "T3", "T4", "C_PRICE", "C_STOP", "C_SILENT"] as const;
export type ScenarioId = typeof scenarioIds[number];
export type MenuId = "M01" | "M02" | "M03" | "M04" | "M05" | "M06" | "M07" | "M08";
export const menuOwners: Readonly<Record<MenuId, "S1" | "S2">> = Object.freeze({
    M01: "S1", M02: "S1", M03: "S1", M04: "S1", M05: "S2", M06: "S2", M07: "S2", M08: "S2",
});
const gold: Readonly<Record<ScenarioId, { physical: readonly MenuId[]; required: readonly MenuId[] }>> = {
    T1: { physical: ["M03"], required: ["M03"] },
    T2: { physical: ["M01", "M02", "M05", "M06"], required: ["M01", "M02", "M05", "M06"] },
    T3: { physical: ["M01", "M05"], required: ["M01", "M05"] },
    T4: { physical: ["M02"], required: ["M02"] },
    C_PRICE: { physical: [], required: [] },
    C_STOP: { physical: [], required: ["M07"] },
    C_SILENT: { physical: ["M08"], required: [] },
};
export const t2InitialCsvHits: readonly MenuId[] = Object.freeze(["M01", "M02", "M05"]);

// Return detached data so a caller cannot narrow the next arm's denominator.
export function stopGold(scenario: ScenarioId) {
    if (!Object.hasOwn(gold, scenario)) throw new Error("ISSUE118_UNKNOWN_SCENARIO");
    const { physical, required } = gold[scenario];
    return { physical: [...physical], required: [...required] };
}
function checkedIds(values: readonly MenuId[]) {
    if (!Array.isArray(values) || values.some(id => !Object.hasOwn(menuOwners, id)) || new Set(values).size !== values.length)
        throw new Error("ISSUE118_INVALID_MENU_SET");
    return [...values];
}
const rate = (hits: number, opportunities: number) => ({ hits, opportunities, fraction: opportunities ? hits / opportunities : null });

// Inputs are observations supplied by the caller; this function does not attest
// their provenance. It deliberately returns no overall PASS or live-verification flag.
export function scoreStops(scenario: ScenarioId, confirmedIds: readonly MenuId[], unknownIds: readonly MenuId[]) {
    const confirmed = checkedIds(confirmedIds), unknown = checkedIds(unknownIds);
    if (confirmed.some(id => unknown.includes(id))) throw new Error("ISSUE118_AMBIGUOUS_STOP_OUTCOME");
    const { physical, required } = stopGold(scenario);
    const surplus = confirmed.filter(id => !required.includes(id));
    return {
        physicalCoverage: rate(confirmed.filter(id => physical.includes(id)).length, physical.length),
        observableStopCoverage: rate(confirmed.filter(id => required.includes(id)).length, required.length),
        excessStops: rate(surplus.length, Object.keys(menuOwners).length - required.length),
        physicalMissedOrUnconfirmed: physical.filter(id => !confirmed.includes(id)),
        requiredMissedOrUnconfirmed: required.filter(id => !confirmed.includes(id)),
        requestedUnknown: unknown,
        surplus,
        detection: scenario === "C_SILENT" ? "NOT_SCORABLE_WITHOUT_OBSERVABLE_SIGNAL" : "NOT_EVALUATED_BY_STOP_ARITHMETIC",
    };
}

export function requiredStopsByOwner(scenario: ScenarioId) {
    const { required } = stopGold(scenario);
    return { S1: required.filter(id => menuOwners[id] === "S1"), S2: required.filter(id => menuOwners[id] === "S2") };
}
