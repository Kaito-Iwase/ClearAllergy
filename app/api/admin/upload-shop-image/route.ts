// このファイルは店舗画像アップロード API です。
// 管理画面の店舗編集フォームから呼ばれ、画像を Vercel Blob に保存します。
// 保存先パスに shopId を含めることで、店舗ごとに画像を整理しやすくしています。

import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireShopId } from "@/app/api/admin/_utils";

export async function POST(req: Request) {
    // 画像アップロードも管理画面の操作なので、まず認証と shopId を確認します。
    const auth = await requireShopId();
    if (!auth.ok) {
        return auth.res;
    }

    // formData はファイル送信に向いた形式です。
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
        return NextResponse.json(
            { error: "画像ファイルが見つかりません。" },
            { status: 400 },
        );
    }

    // 画像以外を弾き、公開ページへ不正なファイルが混ざるのを防ぎます。
    if (!file.type.startsWith("image/")) {
        return NextResponse.json(
            { error: "画像ファイルのみアップロードできます。" },
            { status: 400 },
        );
    }

    // Blob 上の保存パスに shopId と時刻を含め、同名ファイル衝突を避けます。
    const ext = file.name.split(".").pop() || "jpg";
    const path = `shops/${auth.shopId}/cover-${Date.now()}.${ext}`;

    const blob = await put(path, file, {
        access: "public",
    });

    return NextResponse.json({
        url: blob.url,
    });
}
