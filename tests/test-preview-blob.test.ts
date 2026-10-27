import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import test, { type TestContext } from "node:test";
import { parseBlobReadWriteTokenStoreId } from "../lib/storage/image-url-policy";

const calls: Array<{ pathname: string; file: File; options: Record<string, unknown> }> = [];
const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
let upload: typeof import("../lib/storage/upload-images");
try {
    loader._load = function (id, ...args) {
        if (id === "@vercel/blob") return { put: async (pathname: string, file: File, options: Record<string, unknown>) => {
            calls.push({ pathname, file, options });
            return { pathname, url: `https://teststore.public.blob.vercel-storage.com/${pathname}` };
        } };
        return originalLoad.call(this, id, ...args);
    };
    upload = createRequire(import.meta.url)("../lib/storage/upload-images.ts");
} finally { loader._load = originalLoad; }

const testEnv = {
    CLEARALLERGY_TEST_PREVIEW: "true", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "test/staging",
    TEST_BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_TestStore_fictional-secret", EXPECTED_TEST_BLOB_STORE_ID: "store_TestStore",
    BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_SharedStore_fictional-shared-secret", BLOB_STORE_ID: "store_SharedStore",
    VERCEL_OIDC_TOKEN: "fictional-oidc-token",
};
const args = { pathname: "menu-images/fictional-shop/image.png", file: new File(["mock-image"], "image.png", { type: "image/png" }) };

function setup(t: TestContext, overrides: Partial<Record<keyof typeof testEnv, string | undefined>> = {}) {
    calls.length = 0;
    for (const [key, value] of Object.entries({ ...testEnv, ...overrides })) {
        const original = process.env[key];
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
        t.after(() => { if (original === undefined) delete process.env[key]; else process.env[key] = original; });
    }
}

test("専用Previewは共有token・OIDC・storeIdが残っていても検証済みtest tokenを明示する", async t => {
    setup(t);
    await upload.uploadImageToBlob(args);
    assert.deepEqual(calls, [{ ...args, options: { access: "public", addRandomSuffix: true, token: testEnv.TEST_BLOB_READ_WRITE_TOKEN } }]);
    process.env.EXPECTED_TEST_BLOB_STORE_ID = "TestStore";
    await upload.uploadImageToBlob(args);
    assert.equal(calls[1].options.token, testEnv.TEST_BLOB_READ_WRITE_TOKEN);
});

test("test token・期待storeの欠損/不正/不一致ではSDKを呼ばず共有設定へfallbackしない", async t => {
    setup(t);
    for (const [key, invalid] of [
        ["TEST_BLOB_READ_WRITE_TOKEN", undefined], ["TEST_BLOB_READ_WRITE_TOKEN", ""], ["TEST_BLOB_READ_WRITE_TOKEN", "   "],
        ["TEST_BLOB_READ_WRITE_TOKEN", "not-a-token"], ["TEST_BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_TestStore_"],
        ["TEST_BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_TestStore_secret whitespace"],
        ["TEST_BLOB_READ_WRITE_TOKEN", testEnv.BLOB_READ_WRITE_TOKEN],
        ["EXPECTED_TEST_BLOB_STORE_ID", undefined], ["EXPECTED_TEST_BLOB_STORE_ID", ""],
        ["EXPECTED_TEST_BLOB_STORE_ID", "store_"], ["EXPECTED_TEST_BLOB_STORE_ID", "store_TestStore.invalid"],
        ["EXPECTED_TEST_BLOB_STORE_ID", "teststore"], ["EXPECTED_TEST_BLOB_STORE_ID", "store_OtherStore"],
    ] as const) {
        Object.assign(process.env, testEnv);
        if (invalid === undefined) delete process.env[key]; else process.env[key] = invalid;
        await assert.rejects(upload.uploadImageToBlob(args), { message: "Test Preview Blob configuration is invalid." });
    }
    assert.deepEqual(calls, []);
});

test("flag・Vercel preview・対象branchの不一致をSDK呼出前に拒否する", async t => {
    setup(t);
    for (const [key, invalid] of [
        ["CLEARALLERGY_TEST_PREVIEW", undefined], ["CLEARALLERGY_TEST_PREVIEW", ""], ["CLEARALLERGY_TEST_PREVIEW", "false"],
        ["CLEARALLERGY_TEST_PREVIEW", "TRUE"], ["VERCEL", undefined], ["VERCEL", "0"],
        ["VERCEL_ENV", undefined], ["VERCEL_ENV", "production"], ["VERCEL_ENV", "development"],
        ["VERCEL_GIT_COMMIT_REF", undefined], ["VERCEL_GIT_COMMIT_REF", "main"], ["VERCEL_GIT_COMMIT_REF", "test/staging-other"],
    ] as const) {
        Object.assign(process.env, testEnv);
        if (invalid === undefined) delete process.env[key]; else process.env[key] = invalid;
        await assert.rejects(upload.uploadImageToBlob(args), { message: "Test Preview Blob configuration is invalid." });
    }
    assert.deepEqual(calls, []);
});

test("通常のproduction/developmentでflagなし/無効ならmainと同じSDK optionsを維持する", async t => {
    setup(t, { VERCEL_GIT_COMMIT_REF: "main", VERCEL_ENV: "production", TEST_BLOB_READ_WRITE_TOKEN: undefined, EXPECTED_TEST_BLOB_STORE_ID: undefined });
    for (const environment of [
        { VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" },
        { VERCEL: undefined, VERCEL_ENV: "development", VERCEL_GIT_COMMIT_REF: undefined },
    ]) {
        for (const [key, value] of Object.entries(environment)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        for (const value of [undefined, "", "false"]) {
            if (value === undefined) delete process.env.CLEARALLERGY_TEST_PREVIEW; else process.env.CLEARALLERGY_TEST_PREVIEW = value;
            await upload.uploadImageToBlob(args);
        }
    }
    for (const call of calls) assert.deepEqual(call.options, { access: "public", addRandomSuffix: true });
    assert.equal(calls.length, 6);
});

test("token parserは既存形式のstoreだけを抽出し、秘密部分や認証成功を返さない", () => {
    assert.equal(parseBlobReadWriteTokenStoreId(testEnv.TEST_BLOB_READ_WRITE_TOKEN), "TestStore");
    for (const token of [undefined, "", "vercel_blob_rw__secret", "vercel_blob_rw_TestStore_", "client_TestStore_secret"]) {
        assert.equal(parseBlobReadWriteTokenStoreId(token), null);
    }
    const response = upload.buildUploadJsonError(new Error("Test Preview Blob configuration is invalid."));
    assert.equal(response.status, 500);
    assert.doesNotMatch(JSON.stringify(response), /TestStore|fictional-secret|TOKEN|OIDC/);
});
