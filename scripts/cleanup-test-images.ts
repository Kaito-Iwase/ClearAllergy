import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { del } from "@vercel/blob";
import { assertTestDatabaseTarget } from "./test-environment";
import { validateStoredImageUrl } from "../lib/storage/image-url-policy";
async function main() {
    assertTestDatabaseTarget();
    const path = ".clerk/clearallergy-test-created-images.json";
    if (!existsSync(path)) return;
    const accounts = JSON.parse(readFileSync(".clerk/clearallergy-test-accounts.json", "utf8")) as { accounts: Array<{ shopId: string }> };
    const urls: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(urls) || urls.some((url) => typeof url !== "string" || !accounts.accounts.some((a) => validateStoredImageUrl(url, { shopId: a.shopId, kind: "menu" }).ok))) {
        throw new Error("今回のテスト店舗に属する画像以外は削除できません。");
    }
    if (urls.length) await del(urls);
    unlinkSync(path);
    console.log(`今回の検証で記録した画像${urls.length}件だけを削除しました。`);
}
main().catch(() => { console.error("テスト画像の片付けを完了できませんでした。記録ファイルを保持します。"); process.exitCode = 1; });
