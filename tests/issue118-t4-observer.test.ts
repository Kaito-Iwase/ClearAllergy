import assert from "node:assert/strict";
import test from "node:test";
import { prepareT4Observation, t4FreshReadOutcome, t4RefetchFailure, t4Target } from "../scripts/issue118-t4-observer.mjs";
import { previewOrigin } from "../scripts/issue118-preview-transport.mjs";

const fixture = { origin: "http://127.0.0.1:3102", shopId: "cshop", menuId: "cmenu", name: "【架空】T4観測" };
test("disabled observer shares the one fixed transport origin without accepting the old deployment", () => {
    assert.equal(t4Target({ ...fixture, origin: previewOrigin }).origin, previewOrigin);
    assert.throws(() => t4Target({ ...fixture, origin: "https://clear-allergy-e2e-kzfhilgul-kaitoexe00-9350s-projects.vercel.app" }), /TARGET_REFUSED/);
});
test("T4の対象は固定Previewまたはloopbackの1fixtureだけで、query/credentials/Productionを受理しない", () => {
    assert.equal(t4Target(fixture).menu, "http://127.0.0.1:3102/shops/cshop/menus/cmenu");
    for (const origin of ["https://clearallergy.example", "http://127.0.0.1:3102/", "http://u:p@127.0.0.1:3102",
        "http://127.0.0.1:3102?q=x", "http://127.0.0.1:3102#x", "http://127.0.0.1.evil.example:3102"]) {
        assert.throws(() => t4Target({ ...fixture, origin }), /TARGET_REFUSED/);
    }
    assert.throws(() => t4Target({ ...fixture, menuId: "../other" }), /TARGET_REFUSED/);
    assert.throws(() => t4Target({ ...fixture, name: "real menu" }), /TARGET_REFUSED/);
});

test("fresh API404だけやbody未取得で成功とせず、streaming200のnotFound表示と食品不在を区別する", () => {
    for (const navigationResponseStatus of [200, 404]) assert.equal(t4FreshReadOutcome({ status: 404 },
        { targetMatched: true, notFoundVisible: true, foodNameVisible: false, navigationResponseStatus }), "FRESH_READS_HIDE_TARGET");
    for (const navigationResponseStatus of [500, null]) assert.equal(t4FreshReadOutcome({ status: 404 },
        { targetMatched: true, notFoundVisible: true, foodNameVisible: false, navigationResponseStatus }), "UNVERIFIED");
    assert.equal(t4FreshReadOutcome({ status: 404 }, { error: "DOM_OBSERVATION_UNVERIFIED" }), "UNVERIFIED");
    assert.equal(t4FreshReadOutcome({ status: null }, { targetMatched: true, notFoundVisible: true, foodNameVisible: false, navigationResponseStatus: 200 }), "UNVERIFIED");
    assert.equal(t4FreshReadOutcome({ status: 200 }, {}), "STOPPED_CONTENT_STILL_OBSERVED");
    assert.equal(t4FreshReadOutcome({ status: 404 }, { foodNameVisible: true }), "STOPPED_CONTENT_STILL_OBSERVED");
});

test("対象document GETだけを遮断し、他method/URL/RSCは既存transportへfallbackする", async () => {
    const target = t4Target(fixture), failure = t4RefetchFailure(target.menu);
    let aborts = 0, fallbacks = 0;
    const route = (url: string, method = "GET", type = "document") => ({
        request: () => ({ url: () => url, method: () => method, resourceType: () => type }),
        abort: async () => { aborts++; }, fallback: async () => { fallbacks++; },
        continue: () => { throw Error("MUST_NOT_BYPASS_CONTEXT_ROUTE"); },
        fetch: () => { throw Error("MUST_NOT_FORWARD_REQUEST"); },
    });
    await failure.handler(route(target.menu)); await failure.handler(route(target.menu));
    await failure.handler(route(target.menu, "POST")); await failure.handler(route(target.menu + "?_rsc=synthetic", "GET", "fetch"));
    await failure.handler(route(target.api));
    assert.equal(aborts, 2); assert.equal(fallbacks, 3);
    assert.deepEqual(failure.observation, { matchingAttempts: 2, abortConfirmed: 2, handlerFailed: false });
});

test("非同期fallback/abort失敗を生例外や未処理rejectionにせず、注入未確認として残す", async () => {
    for (const match of [true, false]) {
        const failure = t4RefetchFailure(t4Target(fixture).menu);
        await failure.handler({ request: () => ({ url: () => match ? t4Target(fixture).menu : "https://external.example",
            method: () => "GET", resourceType: () => "document" }),
        abort: async () => { throw Error("provider secret raw exception"); }, fallback: async () => { throw Error("provider secret raw exception"); } });
        assert.equal(failure.observation.handlerFailed, true);
        assert.equal(JSON.stringify(failure.observation).includes("secret"), false);
    }
});

test("guard拒否またはAPI基準不成立ではページ作成前に停止する", async () => {
    let opened = 0, read = 0;
    const context = { newPage: async () => { opened++; throw Error("MUST_NOT_OPEN"); } };
    await assert.rejects(prepareT4Observation({ context, fixture, evidenceLevel: "SYNTHETIC_HTTP_BROWSER",
        assertReadTarget: () => { throw Error("secret guard detail"); }, readPublicApi: async () => { read++; return { status: 200, menuId: fixture.menuId }; } }), /PREPARE_UNVERIFIED/);
    assert.equal(opened, 0); assert.equal(read, 0);
    await assert.rejects(prepareT4Observation({ context, fixture, evidenceLevel: "SYNTHETIC_HTTP_BROWSER",
        assertReadTarget: () => {}, readPublicApi: async () => ({ status: 200, menuId: "cother" }) }), /PREPARE_UNVERIFIED/);
    assert.equal(opened, 0);
});
