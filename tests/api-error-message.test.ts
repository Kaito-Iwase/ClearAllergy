import assert from "node:assert/strict";
import test from "node:test";
import { getApiErrorMessage } from "../lib/utils/api-error-message";

const fallback = "保存結果を確認できません。保存状態を確認してください。";

test("HTMLの障害応答は大文字・小文字や断片の違いによらず操作用の案内に戻す", async () => {
    for (const body of [
        "<HTML><BODY>Bad gateway</BODY></HTML>",
        "<!doctype html><title>Unavailable</title>",
        "<h1>Request too large</h1>",
    ]) {
        assert.equal(await getApiErrorMessage(new Response(body, {
            status: 502, headers: { "content-type": "text/html; charset=utf-8" },
        }), fallback), fallback, body);
    }
});

test("HTMLヘッダー欠落時の文書・断片・コメントもエラー欄へ表示しない", async () => {
    for (const body of ["<HTML>Unavailable</HTML>", "<!doctype html><title>Error</title>",
        "<h1>Bad gateway</h1>", "<!-- proxy error --><p>Unavailable</p>"]) {
        assert.equal(await getApiErrorMessage(new Response(body, { status: 502 }), fallback), fallback, body);
    }
});

test("HTMLとして届くJSON風本文も信頼せず、JSONと通常テキストの既存案内は保つ", async () => {
    assert.equal(await getApiErrorMessage(new Response('{"error":"proxy detail"}', {
        headers: { "content-type": "TeXt/HtMl" },
    }), fallback), fallback);
    assert.equal(await getApiErrorMessage(new Response("proxy detail", {
        headers: { "content-type": "Application/Xhtml+Xml; charset=utf-8" },
    }), fallback), fallback);
    for (const [body, expected] of [
        ['{"error":" 入力を確認してください。 "}', "入力を確認してください。"],
        ['{"message":"処理を確認してください。"}', "処理を確認してください。"],
        ['{"error":"<h1>既存のJSON案内</h1>"}', "<h1>既存のJSON案内</h1>"],
        ['{"error":42}', fallback], ["[]", fallback], ["", fallback],
        ['{"error":', fallback],
        ["  一時的に利用できません。  ", "一時的に利用できません。"],
        ["価格は < 1000 円です。", "価格は < 1000 円です。"],
    ]) {
        assert.equal(await getApiErrorMessage(new Response(body), fallback), expected);
    }
});

test("本文の読取失敗は既存の操作案内へ戻す", async () => {
    const response = new Response("already consumed");
    await response.text();
    assert.equal(await getApiErrorMessage(response, fallback), fallback);
});
