import assert from "node:assert/strict";
import test from "node:test";
import { buildUploadJsonError, MAX_UPLOAD_FILE_SIZE, validateImageFile } from "../lib/storage/upload-images";

// These are format signatures, not fully decoded image fixtures. Passing this
// check identifies the declared container only; it is not a malware/decoder test.
function avifHeader(major = "avif", compatible: string[] = []) {
    const bytes = Buffer.alloc(16 + compatible.length * 4);
    bytes.writeUInt32BE(bytes.length, 0);
    bytes.write("ftyp", 4, "ascii");
    bytes.write(major, 8, "ascii");
    compatible.forEach((brand, index) => bytes.write(brand, 16 + index * 4, "ascii"));
    return bytes;
}

const signatures = [
    { mime: "image/jpeg", extension: "jpg", bytes: Buffer.from([0xff, 0xd8, 0xff]) },
    { mime: "image/png", extension: "png", bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
    { mime: "image/gif", extension: "gif", bytes: Buffer.from("GIF89a", "ascii") },
    { mime: "image/webp", extension: "webp", bytes: Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]) },
    { mime: "image/avif", extension: "avif", bytes: avifHeader() },
];

test("許可した形式の署名とMIMEが一致すれば対応する拡張子を返す", async () => {
    for (const fixture of signatures) {
        assert.deepEqual(await validateImageFile(new File([fixture.bytes], "untrusted.name", { type: fixture.mime })), {
            ok: true, extension: fixture.extension,
        });
    }
    assert.equal((await validateImageFile(new File(["GIF87a"], "legacy.gif", { type: "image/gif" }))).ok, true);
});

test("画像署名と申告MIMEが異なる組合せを拒否する", async () => {
    for (const content of signatures) {
        for (const declaration of signatures) {
            if (content.mime === declaration.mime) continue;
            assert.equal((await validateImageFile(new File([content.bytes], "fake.png", { type: declaration.mime }))).ok, false);
        }
    }
    assert.equal((await validateImageFile(new File(["<svg/>"], "fake.png", { type: "image/png" }))).ok, false);
    assert.equal((await validateImageFile(new File([signatures[1].bytes], "image.svg", { type: "image/svg+xml" }))).ok, false);
});

test("空ファイルと形式判定に足りない署名を拒否する", async () => {
    for (const fixture of signatures) {
        assert.equal((await validateImageFile(new File([], "empty", { type: fixture.mime }))).ok, false);
        assert.equal((await validateImageFile(new File([fixture.bytes.subarray(0, fixture.bytes.length - 1)], "truncated", { type: fixture.mime }))).ok, false);
    }
});

test("AVIFはftyp内のmajor・compatible brandを確認し宣言サイズ外の文字列を採用しない", async () => {
    for (const bytes of [avifHeader("avis"), avifHeader("mif1", ["miaf", "avif"]), avifHeader("mif1", ["avis"])]) {
        assert.equal((await validateImageFile(new File([bytes], "fixture.avif", { type: "image/avif" }))).ok, true);
    }
    const wrongBox = avifHeader(); wrongBox.write("free", 4, "ascii");
    const truncatedBox = avifHeader(); truncatedBox.writeUInt32BE(32, 0);
    const misalignedBox = Buffer.concat([avifHeader(), Buffer.alloc(1)]); misalignedBox.writeUInt32BE(17, 0);
    const brandOutsideBox = Buffer.concat([avifHeader("mif1"), Buffer.from("avif")]);
    const brandInMinorVersion = avifHeader("mif1"); brandInMinorVersion.write("avif", 12, "ascii");
    for (const bytes of [wrongBox, truncatedBox, misalignedBox, brandOutsideBox, brandInMinorVersion, avifHeader("heic")]) {
        assert.equal((await validateImageFile(new File([bytes], "invalid.avif", { type: "image/avif" }))).ok, false);
    }
});

test("形式検査の読取は先頭4KiB以内で上限超過なら内容を読まない", async (t) => {
    const bytes = new Uint8Array(MAX_UPLOAD_FILE_SIZE); bytes.set(signatures[1].bytes);
    const atLimit = new File([bytes], "limit.png", { type: "image/png" });
    const originalSlice = atLimit.slice.bind(atLimit);
    const reads: Array<[number | undefined, number | undefined]> = [];
    t.mock.method(atLimit, "slice", (start?: number, end?: number) => {
        reads.push([start, end]);
        assert.equal(start, 0);
        assert.ok(end !== undefined && end <= 4096);
        return originalSlice(start, end);
    });
    assert.equal((await validateImageFile(atLimit)).ok, true);
    assert.equal(reads.length, 1);
    const tooLarge = new File([bytes, new Uint8Array(1)], "too-large.png", { type: "image/png" });
    t.mock.method(tooLarge, "slice", () => assert.fail("Oversized input must be rejected before reading content"));
    assert.equal((await validateImageFile(tooLarge)).ok, false);
});

test("Blob設定不足と未知の例外は環境変数名・秘密値・内部URLを利用者へ返さない", () => {
    for (const error of [
        new Error("BLOB_READ_WRITE_TOKEN=fixture-secret"),
        new Error("read-write token: fixture-secret"),
        new Error("https://internal.invalid/private fixture-secret"),
        { message: "fixture-secret", stack: "private-stack" },
        null,
    ]) {
        const result = buildUploadJsonError(error);
        assert.equal(result.status, 500);
        const output = JSON.stringify(result);
        for (const value of ["BLOB_READ_WRITE_TOKEN", "fixture-secret", "internal.invalid", "private-stack"]) assert.ok(!output.includes(value));
    }
});
