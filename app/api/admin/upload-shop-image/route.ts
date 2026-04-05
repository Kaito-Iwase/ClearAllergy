// このファイルは店舗画像アップロード API です。
// 管理画面の店舗編集フォームから呼ばれ、画像を Vercel Blob に保存します。
// 保存先パスに shopId を含めることで、店舗ごとに画像を整理しやすくしています。

import { NextResponse } from "next/server";
import { requireShopId } from "@/app/api/admin/_utils";
import {
    buildUploadJsonError,
    uploadImageToBlob,
    validateImageFile,
} from "@/lib/upload-images";
import { writeAdminAuditLog } from "@/lib/audit-log";

export async function POST(req: Request) {
    let actorUserId: string | null = null;
    let actorShopId: string | null = null;
    try {
        // 画像アップロードも管理画面の操作なので、まず認証と shopId を確認します。
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }
        actorUserId = auth.appUser.id;
        actorShopId = auth.shopId;

        // formData はファイル送信に向いた形式です。
        const formData = await req.formData();
        const file = formData.get("file");

        if (!(file instanceof File)) {
            await writeAdminAuditLog({
                req,
                actorUserId,
                actorShopId,
                action: "shop_image_upload",
                targetType: "image_upload",
                targetId: actorShopId,
                success: false,
                metadata: { reason: "file_missing" },
            });
            return NextResponse.json(
                { error: "画像ファイルが見つかりません。" },
                { status: 400 },
            );
        }

        const validation = validateImageFile(file);
        if (!validation.ok) {
            await writeAdminAuditLog({
                req,
                actorUserId,
                actorShopId,
                action: "shop_image_upload",
                targetType: "image_upload",
                targetId: actorShopId,
                success: false,
                metadata: { reason: validation.message, mimeType: file.type },
            });
            return NextResponse.json(
                { error: validation.message },
                { status: 400 },
            );
        }

        const path = `shops/${auth.shopId}/cover-${Date.now()}.${validation.extension}`;
        const blob = await uploadImageToBlob({
            file,
            pathname: path,
        });

        await writeAdminAuditLog({
            req,
            actorUserId,
            actorShopId,
            action: "shop_image_upload",
            targetType: "image_upload",
            targetId: actorShopId,
            success: true,
            metadata: { pathname: blob.pathname },
        });

        return NextResponse.json({
            url: blob.url,
            pathname: blob.pathname,
        });
    } catch (error) {
        if (actorShopId) {
            await writeAdminAuditLog({
                req,
                actorUserId,
                actorShopId,
                action: "shop_image_upload",
                targetType: "image_upload",
                targetId: actorShopId,
                success: false,
                metadata: { reason: "internal_error" },
            });
        }
        const uploadError = buildUploadJsonError(error);
        return NextResponse.json(
            { error: uploadError.error },
            { status: uploadError.status },
        );
    }
}
