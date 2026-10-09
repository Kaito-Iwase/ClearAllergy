import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type PrismaClient } from "@prisma/client";
import { readPublicSnapshot } from "../features/public/shops/server/public-read-snapshot";
import { PublicReadUnavailableError, readPublicDataOrFallback } from "../lib/public-db";

test("公開snapshotのタイムアウトは取得不能、通常の処理エラーは保持する", async () => {
    for (const code of ["P2028", "P2022"]) {
        const original = new Prisma.PrismaClientKnownRequestError("fictional failure", { code, clientVersion: "test" });
        const db = { $transaction: async () => { throw original; } } as unknown as PrismaClient;
        await assert.rejects(readPublicSnapshot(async () => "unused", db), error =>
            code === "P2028" ? error instanceof PublicReadUnavailableError : error === original);
    }
});

test("公開snapshotを完了できない場合は古い食品を使わず既存の取得不能表示へ渡す", async () => {
    const fallback = { menu: null };
    const result = await readPublicDataOrFallback(async () => { throw new PublicReadUnavailableError(); }, fallback);
    assert.equal(result.isDatabaseAvailable, false);
    assert.equal(result.data, fallback);
});
