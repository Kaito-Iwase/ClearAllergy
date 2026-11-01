import assert from "node:assert/strict";
import test from "node:test";
import { menuOwners, requiredStopsByOwner, scenarioIds, scoreStops, stopGold, t2InitialCsvHits, type MenuId, type ScenarioId } from "../scripts/issue118-stop-oracle";

test("Phase1の現物・観測必要STOP・余分STOP分母をケース別に保ち、無信号を有信号へ合算しない", () => {
    const physical = [1, 4, 2, 1, 0, 0, 1], required = [1, 4, 2, 1, 0, 1, 0], excess = [7, 4, 6, 7, 8, 7, 8];
    scenarioIds.forEach((scenario, i) => {
        const result = scoreStops(scenario, [], []);
        assert.equal(result.physicalCoverage.opportunities, physical[i]);
        assert.equal(result.observableStopCoverage.opportunities, required[i]);
        assert.equal(result.excessStops.opportunities, excess[i]);
        assert.equal(result.physicalCoverage.fraction, physical[i] ? 0 : null);
    });
    assert.equal(physical.slice(0, 4).reduce((a, b) => a + b), 8);
    assert.equal(physical[6], 1);
    assert.equal(required.reduce((a, b) => a + b), 9);
    assert.equal(excess.reduce((a, b) => a + b), 47);
});

test("T2のCSV 3件を成功分母にせずM06を含む4件で採点する", () => {
    const initial = scoreStops("T2", t2InitialCsvHits, []);
    assert.deepEqual(initial.physicalCoverage, { hits: 3, opportunities: 4, fraction: 0.75 });
    assert.deepEqual(initial.observableStopCoverage, { hits: 3, opportunities: 4, fraction: 0.75 });
    assert.deepEqual(initial.requiredMissedOrUnconfirmed, ["M06"]);
    assert.deepEqual(scoreStops("T2", [...t2InitialCsvHits, "M06"], []).physicalCoverage, { hits: 4, opportunities: 4, fraction: 1 });
});

test("T2の結果不明M06を停止成功にも未停止確定にも置き換えない", () => {
    const result = scoreStops("T2", t2InitialCsvHits, ["M06"]);
    assert.equal(result.observableStopCoverage.hits, 3);
    assert.deepEqual(result.requestedUnknown, ["M06"]);
    assert.deepEqual(result.requiredMissedOrUnconfirmed, ["M06"]);
    assert.equal("failedStops" in result, false);
    assert.equal("overall" in result, false);
});

test("C_SILENTの偶然停止は検知成功にならず、通常STOPは食品変更成功に数えない", () => {
    const silent = scoreStops("C_SILENT", ["M08"], []);
    assert.equal(silent.physicalCoverage.fraction, 1);
    assert.equal(silent.observableStopCoverage.fraction, null);
    assert.equal(silent.detection, "NOT_SCORABLE_WITHOUT_OBSERVABLE_SIGNAL");
    assert.deepEqual(silent.surplus, ["M08"]);
    const ordinary = scoreStops("C_STOP", ["M07"], []);
    assert.equal(ordinary.physicalCoverage.fraction, null);
    assert.equal(ordinary.observableStopCoverage.fraction, 1);
    assert.deepEqual(ordinary.surplus, []);
});

test("全停止で見逃しゼロになっても過剰停止を消さず、価格対照の必要STOPはN/A", () => {
    const everyMenu = Object.keys(menuOwners) as MenuId[];
    const t2 = scoreStops("T2", everyMenu, []);
    assert.deepEqual(t2.excessStops, { hits: 4, opportunities: 4, fraction: 1 });
    assert.equal(t2.physicalCoverage.fraction, 1);
    const price = scoreStops("C_PRICE", everyMenu, []);
    assert.equal(price.observableStopCoverage.fraction, null);
    assert.equal(price.excessStops.hits, 8);
});

test("T2/T3の必要操作を別ownerへ分け、単一ownerの複数店舗操作を前提にしない", () => {
    assert.deepEqual(requiredStopsByOwner("T2"), { S1: ["M01", "M02"], S2: ["M05", "M06"] });
    assert.deepEqual(requiredStopsByOwner("T3"), { S1: ["M01"], S2: ["M05"] });
    assert.deepEqual(requiredStopsByOwner("T4"), { S1: ["M02"], S2: [] });
    assert.deepEqual(requiredStopsByOwner("C_STOP"), { S1: [], S2: ["M07"] });
});

test("重複・未知ID・矛盾する成功/不明・未知ケースでは偽の集計値を返さない", () => {
    assert.throws(() => scoreStops("T2", ["M01", "M01"], []), /INVALID_MENU_SET/);
    assert.throws(() => scoreStops("T2", ["M99" as MenuId], []), /INVALID_MENU_SET/);
    assert.throws(() => scoreStops("T2", [], ["M06", "M06"]), /INVALID_MENU_SET/);
    assert.throws(() => scoreStops("T2", ["M06"], ["M06"]), /AMBIGUOUS_STOP_OUTCOME/);
    assert.throws(() => scoreStops("T9" as ScenarioId, [], []), /UNKNOWN_SCENARIO/);
});

test("採点者の返却集合を変更しても次の条件や群の正解分母は変わらない", () => {
    const before = stopGold("T2"); before.required.length = 0; before.physical.push("M08");
    assert.deepEqual(stopGold("T2"), { physical: ["M01", "M02", "M05", "M06"], required: ["M01", "M02", "M05", "M06"] });
    assert.ok(Object.isFrozen(t2InitialCsvHits));
});
