import assert from "node:assert/strict";
import test from "node:test";
import { fixtureName, phase1Source, prepareFixtureStops, type FixtureBinding, type OwnerBinding } from "../scripts/issue118-fixture-map";
import { menuOwners, type MenuId } from "../scripts/issue118-stop-oracle";

const run = "11111111-1111-4111-8111-111111111111";
const owners: OwnerBinding[] = [{ owner: "S1", shopId: "cshopa", contextRef: "context-A" },
    { owner: "S2", shopId: "cshopb", contextRef: "context-B" }];
function bindings(): FixtureBinding[] {
    return (Object.keys(menuOwners) as MenuId[]).map((key, index) => ({
        key, menuId: `cfixture${index}`, shopId: owners.find(o => o.owner === menuOwners[key])!.shopId,
        runId: run, name: fixtureName(run, key),
        creation: { operationId: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`, status: 201, outcome: "CONFIRMED_SUCCESS" },
        before: { version: 90 + index, foodVersion: 29, publicationConfirmedFoodVersion: 29, isPublished: true },
    }));
}
const refused = (fixtures: FixtureBinding[], actors = owners) => assert.throws(
    () => prepareFixtureStops("T2", run, fixtures, actors), /ISSUE118_FIXTURE_MAP_REFUSED/);

test("T2は今回8件の対応を検査しM06を含む4停止と他4件維持を別ownerへ分ける", () => {
    const fixtures = bindings(), plan = prepareFixtureStops("T2", run, fixtures, owners);
    assert.deepEqual(plan.byOwner.S1.map(s => s.key), ["M01", "M02"]);
    assert.deepEqual(plan.byOwner.S2.map(s => s.key), ["M05", "M06"]);
    assert.deepEqual(plan.preserve, ["cfixture2", "cfixture3", "cfixture6", "cfixture7"]);
    assert.equal(plan.byOwner.S2[1].expectedVersion, 95);
    assert.deepEqual(plan.byOwner.S2[1].expectAfterStop, { isPublished: false, foodVersion: 29 });
    assert.equal(plan.evidenceLevel, "PREPARATION_ONLY");
    assert.equal("overall" in plan, false);
    assert.equal("identityVerified" in plan, false);
    assert.equal(plan.source.verifiedBy, "parent_library_byte_audit");
    assert.equal(plan.source.archiveSha256, phase1Source.archiveSha256);
    assert.ok(plan.runtimePrerequisites.includes("RECIPE_PAYLOAD_AND_SOURCE_CSV_MATCH"));
});

test("T3は2件停止後ロット割当HOLD、T4はM02停止後の4観測を要求する", () => {
    const mixed = prepareFixtureStops("T3", run, bindings(), owners);
    assert.deepEqual(mixed.byOwner.S1.map(s => s.key), ["M01"]);
    assert.deepEqual(mixed.byOwner.S2.map(s => s.key), ["M05"]);
    assert.equal(mixed.afterStops, "HOLD_LOT_ALLOCATION_NO_REPUBLICATION");
    const oldView = prepareFixtureStops("T4", run, bindings(), owners);
    assert.deepEqual(oldView.byOwner.S1.map(s => s.key), ["M02"]);
    assert.deepEqual(oldView.byOwner.S2, []);
    assert.equal(oldView.afterStops, "OBSERVE_FRESH_OLD_BACK_REFETCH_SEPARATELY");
});

test("対応辺欠落M06、重複key、未知keyを完全fixtureとして受理しない", () => {
    refused(bindings().filter(b => b.key !== "M06"));
    const duplicate = bindings(); duplicate[5] = structuredClone(duplicate[4]); refused(duplicate);
    const unknown = bindings(); unknown[5].key = "M99" as MenuId; refused(unknown);
});

test("実IDの重複と既存保護/過去fixtureの流用を拒否する", () => {
    const duplicate = bindings(); duplicate[5].menuId = duplicate[4].menuId; refused(duplicate);
    for (const oldId of ["cmvs4x86o000vwn0w93c8ttez", "cmvs4x8wt000xwn0wj6gwdih1", "cmvs4x986000zwn0wer2ymhow",
        "cmvuiodx30001jg08xmr6nexe", "cmvuy8d4z0003jw07e9fobsdm", "cmvuzlqhf0003l308lem3uwck"]) {
        const prior = bindings(); prior[5].menuId = oldId; refused(prior);
    }
});

test("所有shop/別context/別ownerの対応不足を拒否する", () => {
    const wrong = bindings(); wrong[5].shopId = owners[0].shopId; refused(wrong);
    refused(bindings(), [owners[0]]);
    refused(bindings(), [owners[0], { ...owners[1], shopId: owners[0].shopId }]);
    refused(bindings(), [owners[0], { ...owners[1], contextRef: owners[0].contextRef }]);
    refused(bindings(), [owners[0], { ...owners[1], owner: "S1" }]);
});

test("別run/名前/operationId再使用と未確定作成を拒否する", () => {
    const other = bindings(); other[5].runId = "33333333-3333-4333-8333-333333333333"; refused(other);
    const renamed = bindings(); renamed[5].name = "existing menu"; refused(renamed);
    const repeated = bindings(); repeated[5].creation.operationId = repeated[4].creation.operationId; refused(repeated);
    for (const outcome of ["INDETERMINATE", "CONFIRMED_SUCCESS"] as const) {
        const uncertain = bindings(); uncertain[5].creation.outcome = outcome;
        if (outcome === "CONFIRMED_SUCCESS") uncertain[5].creation.status = 200;
        refused(uncertain);
    }
});

test("非公開/確認版不一致/不正な版をSTOP直前の正常基準にしない", () => {
    for (const before of [{ isPublished: false }, { publicationConfirmedFoodVersion: null },
        { publicationConfirmedFoodVersion: 28 }, { version: -1 }, { foodVersion: Number.NaN }, { version: 1.5 }]) {
        const fixtures = bindings(); Object.assign(fixtures[5].before, before); refused(fixtures);
    }
});

test("返却された計画の変更で入力snapshotや次試行の期待版を変えない", () => {
    const fixtures = bindings(), first = prepareFixtureStops("T2", run, fixtures, owners);
    first.byOwner.S2[1].expectedVersion = 0; first.byOwner.S2[1].expectAfterStop.foodVersion = 0;
    assert.equal(fixtures[5].before.version, 95);
    assert.equal(prepareFixtureStops("T2", run, fixtures, owners).byOwner.S2[1].expectedVersion, 95);
});
