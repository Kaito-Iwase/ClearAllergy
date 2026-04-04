// このファイルはメニュー画像アップロード API です。
// 管理画面の新規作成 / 編集フォームから呼ばれ、画像を Vercel Blob に保存します。
// 店舗画像と同様に shopId で認可し、他店舗の保存先を使えないようにします。

import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireShopId, internalError } from "@/app/api/admin/_utils";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(req: Request) {
    try {
        // アップロード権限は管理者の shopId にひも付けます。
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }

        // formData から File を取り出します。
        const formData = await req.formData();
        const file = formData.get("file");

        if (!(file instanceof File)) {
            return NextResponse.json(
                { error: "画像ファイルがありません。" },
                { status: 400 },
            );
        }

        // Vercel Blob に公開画像として保存できるよう、画像 MIME のみ許可します。
        if (!file.type.startsWith("image/")) {
            return NextResponse.json(
                { error: "画像ファイルのみアップロードできます。" },
                { status: 400 },
            );
        }

        // 大きすぎるファイルはアップロード前に弾き、体験とコストの両方を守ります。
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: "画像サイズは5MB以下にしてください。" },
                { status: 400 },
            );
        }

        // パスに shopId と時刻を含め、他店舗との混在や名前衝突を避けます。
        const safeFileName = file.name.replace(/\s+/g, "-");
        const pathname = `menu-images/${auth.shopId}/${Date.now()}-${safeFileName}`;

        const blob = await put(pathname, file, {
            access: "public",
            addRandomSuffix: true,
        });

        return NextResponse.json({
            url: blob.url,
            pathname: blob.pathname,
        });
    } catch (e) {
        return internalError(e);
    }
}
