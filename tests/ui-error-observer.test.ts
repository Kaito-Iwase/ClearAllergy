import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { observeUIErrors } from "../scripts/ui-error-observer.mjs";

const notFoundUrl = "http://127.0.0.1:3101/shops/ui-audit-does-not-exist";
const recoveryUrl = "http://127.0.0.1:3101/shops";
const message = "Minified React error #419; visit https://react.dev/errors/419 for the full message";
const digest = "NEXT_HTTP_ERROR_FALLBACK;404";
const html = '<template data-dgst="NEXT_HTTP_ERROR_FALLBACK;404"></template><meta name="robots" content="noindex"/>';

function fixture() {
    const frame = {};
    const page = { mainFrame: () => frame };
    type Source = { page: typeof page, frame: object };
    type Receipt = { message: string, digest: string, documentUrl: string, eventUrl: string };
    let binding: (source: Source, receipt: Receipt) => void;
    let closing = async () => {};
    const context = Object.assign(new EventEmitter(), {
        async exposeBinding(_name: string, callback: typeof binding) { binding = callback; },
        async addInitScript() {},
        async close() { await closing(); },
    });
    return {
        context, page,
        duringClose(callback: () => Promise<void>) { closing = callback; },
        error(text = message, origin = page) { context.emit("weberror", { page: () => origin, error: () => new Error(text) }); },
        receipt(overrides: Partial<Receipt> = {}, source: Source = { page, frame }) {
            binding(source, { message, digest, documentUrl: notFoundUrl, eventUrl: recoveryUrl, ...overrides });
        },
    };
}

test("normal observation fails on an exception delivered asynchronously during context teardown", async () => {
    const f = fixture();
    const observer = await observeUIErrors(f.context, { label: "normal" });
    f.duringClose(async () => { await new Promise(resolve => setImmediate(resolve)); f.error("private-secret-must-not-be-logged"); });
    await assert.rejects(observer.closeAndVerify(), error => {
        assert.match(String(error), /normal: unexpected client exceptions/);
        assert.doesNotMatch(String(error), /private-secret/);
        return true;
    });
    assert.deepEqual(observer.report, { label: "normal", observed: 1, streamedNotFound419: 0, unexpected: 1, closed: true });
});

test("normal and font fallback contexts never allow React 419", async () => {
    for (const label of ["normal", "font-fallback"]) {
        const f = fixture();
        const observer = await observeUIErrors(f.context, { label });
        f.error();
        await assert.rejects(observer.closeAndVerify(), /unexpected client exceptions/);
    }
});

test("streamed 404 receipts can arrive after pageerror and still be checked after teardown", async () => {
    const f = fixture();
    const observer = await observeUIErrors(f.context, { label: "404", notFoundUrl });
    observer.confirmNotFoundResponse({ page: f.page, url: notFoundUrl, status: 200, html });
    f.duringClose(async () => { f.error(); await new Promise(resolve => setImmediate(resolve)); f.receipt(); });
    assert.deepEqual(await observer.closeAndVerify(), { label: "404", observed: 1, streamedNotFound419: 1, unexpected: 0, closed: true });
    await assert.rejects(observer.closeAndVerify(), /only once/);
});

test("known 404 does not permit an unknown error during recovery or teardown", async () => {
    const f = fixture();
    const observer = await observeUIErrors(f.context, { label: "404", notFoundUrl });
    observer.confirmNotFoundResponse({ page: f.page, url: notFoundUrl, status: 200, html });
    f.receipt(); f.error();
    f.duringClose(async () => { f.error("unexpected recovery exception"); });
    await assert.rejects(observer.closeAndVerify(), /unexpected client exceptions/);
    assert.equal(observer.report.unexpected, 1);
});

test("one valid digest cannot excuse a second 419 with the same message", async () => {
    const f = fixture();
    const observer = await observeUIErrors(f.context, { label: "404", notFoundUrl });
    observer.confirmNotFoundResponse({ page: f.page, url: notFoundUrl, status: 200, html });
    f.receipt(); f.error(); f.error();
    await assert.rejects(observer.closeAndVerify(), /unexpected client exceptions/);
    assert.equal(observer.report.unexpected, 1);
});

test("a popup with a matching 404 digest needs its own verified response and is not allowlisted", async () => {
    const f = fixture();
    const observer = await observeUIErrors(f.context, { label: "404", notFoundUrl });
    observer.confirmNotFoundResponse({ page: f.page, url: notFoundUrl, status: 200, html });
    const frame = {};
    const popup = { mainFrame: () => frame };
    f.receipt({}, { page: popup, frame });
    f.error(message, popup);
    await assert.rejects(observer.closeAndVerify(), /unexpected client exceptions/);
});

test("404 exception allowance requires response, digest, document, route, page and main frame evidence", async () => {
    for (const mismatch of ["response", "digest", "document", "route", "page", "frame"]) {
        const f = fixture();
        const observer = await observeUIErrors(f.context, { label: mismatch, notFoundUrl });
        if (mismatch !== "response") observer.confirmNotFoundResponse({ page: f.page, url: notFoundUrl, status: 200, html });
        const otherFrame = {};
        const otherPage = { mainFrame: () => otherFrame };
        f.receipt({
            ...(mismatch === "digest" ? { digest: "unrelated-server-error" } : {}),
            ...(mismatch === "document" ? { documentUrl: recoveryUrl } : {}),
            ...(mismatch === "route" ? { eventUrl: "http://127.0.0.1:3101/terms" } : {}),
        }, mismatch === "page" ? { page: otherPage, frame: otherFrame }
            : { page: f.page, frame: mismatch === "frame" ? otherFrame : f.page.mainFrame() });
        f.error();
        await assert.rejects(observer.closeAndVerify(), /unexpected client exceptions/, mismatch);
    }
});

test("invalid status, mismatched response, absent digest or noindex cannot authorize exceptions", async () => {
    const f = fixture();
    const observer = await observeUIErrors(f.context, { label: "404", notFoundUrl });
    for (const evidence of [
        { url: recoveryUrl, status: 200, html }, { url: notFoundUrl, status: 500, html },
        { url: notFoundUrl, status: 200, html: '<meta name="robots" content="noindex"/>' },
        { url: notFoundUrl, status: 200, html: '<template data-dgst="NEXT_HTTP_ERROR_FALLBACK;404"></template>' },
    ]) assert.throws(() => observer.confirmNotFoundResponse({ page: f.page, ...evidence }));
    f.receipt(); f.error();
    await assert.rejects(observer.closeAndVerify(), /unexpected client exceptions/);
});

test("a clean observation succeeds, and a context close failure is never PASS", async () => {
    const f = fixture();
    const observer = await observeUIErrors(f.context, { label: "clean" });
    assert.equal((await observer.closeAndVerify()).observed, 0);
    const broken = fixture();
    const failed = await observeUIErrors(broken.context, { label: "broken" });
    broken.duringClose(async () => { throw new Error("close failed"); });
    await assert.rejects(failed.closeAndVerify(), /close failed/);
    assert.equal(failed.report.closed, false);
});
