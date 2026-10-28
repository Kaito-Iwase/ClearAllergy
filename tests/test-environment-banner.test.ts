import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TestEnvironmentBanner from "../components/layout/TestEnvironmentBanner";
import { isTestPreviewEnvironment } from "../lib/test-preview-environment";

const testPreview = { CLEARALLERGY_TEST_PREVIEW: "true", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "test/staging" };

test("帯は明示されたVercel test Previewの全条件が一致した場合だけ表示対象になる", () => {
    assert.equal(isTestPreviewEnvironment(testPreview), true);
    assert.equal(isTestPreviewEnvironment({}), false);
    for (const key of Object.keys(testPreview)) {
        for (const value of [undefined, "", "false", "TRUE", "unknown"]) {
            assert.equal(isTestPreviewEnvironment({ ...testPreview, [key]: value }), false);
        }
    }
    for (const env of [
        { ...testPreview, VERCEL_ENV: "production" },
        { ...testPreview, VERCEL_ENV: "development" },
        { ...testPreview, VERCEL_GIT_COMMIT_REF: "main" },
        { ...testPreview, VERCEL_GIT_COMMIT_REF: "develop" },
        { ...testPreview, VERCEL_GIT_COMMIT_REF: "prepare/staging-main-v1-final-20261028" },
        { ...testPreview, VERCEL_GIT_COMMIT_REF: "test/staging-other" },
    ]) assert.equal(isTestPreviewEnvironment(env), false);
});

test("架空データの常設案内は読み上げ可能なasideで、操作や環境識別子を含めない", () => {
    const html = renderToStaticMarkup(createElement(TestEnvironmentBanner));
    assert.match(html, /^<aside[^>]*aria-label="テスト環境の案内"/);
    assert.match(html, /<strong>テスト環境・架空データ<\/strong>/);
    assert.match(html, /実店舗の情報ではありません。/);
    assert.doesNotMatch(html, /role="alert"|aria-live|tabindex|<button|<a\s|test\/staging|VERCEL|TOKEN|DATABASE|user_|app_|ins_|neon/);
});
