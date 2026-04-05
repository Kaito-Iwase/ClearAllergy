// このファイルはメニュー画像アップロード API です。
// 管理画面の新規作成 / 編集フォームから呼ばれ、画像を Vercel Blob に保存します。
// 店舗画像と同様に shopId で認可し、他店舗の保存先を使えないようにします。

import { NextResponse } from "next/server";
import { requireShopId } from "@/app/api/admin/_utils";
import {
    buildUploadJsonError,
    uploadImageToBlob,
    validateImageFile,
} from "@/lib/upload-images";

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

        const validation = validateImageFile(file);
        if (!validation.ok) {
            return NextResponse.json(
                { error: validation.message },
                { status: 400 },
            );
        }

        // パスに shopId と時刻を含め、他店舗との混在や名前衝突を避けます。
        const pathname = `menu-images/${auth.shopId}/${Date.now()}.${validation.extension}`;

        const blob = await uploadImageToBlob({
            file,
            pathname,
        });

        return NextResponse.json({
            url: blob.url,
            pathname: blob.pathname,
        });
    } catch (e) {
        const uploadError = buildUploadJsonError(e);
        return NextResponse.json(
            { error: uploadError.error },
            { status: uploadError.status },
        );
    }
}
