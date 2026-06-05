// このファイルはメニュー画像アップロード API です。
// 管理画面の新規作成 / 編集フォームから呼ばれ、画像を Vercel Blob に保存します。
// 店舗画像と同様に shopId で認可し、他店舗の保存先を使えないようにします。

import { Hono } from "hono";
import { NextResponse } from "next/server";
import { requireShopId } from "@/app/api/admin/_utils";
import { enforceSameOriginAdminMutation } from "@/lib/admin-api-security";
import {
    buildUploadJsonError,
    uploadImageToBlob,
    validateImageFile,
} from "@/lib/upload-images";
import { writeAdminAuditLog } from "@/lib/audit-log";
import { requirePortfolioMutationAccessApi } from "@/lib/portfolio-mode";

const app = new Hono();

app.post("/api/admin/upload-menu-image", async (c) => {
    const req = c.req.raw;
    let actorUserId: string | null = null;
    let actorShopId: string | null = null;
    try {
        const originError = enforceSameOriginAdminMutation(req);
        if (originError) {
            return originError;
        }

        // アップロード権限は管理者の shopId にひも付けます。
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }
        actorUserId = auth.appUser.id;
        actorShopId = auth.shopId;

        const portfolioAccess = await requirePortfolioMutationAccessApi();
        if (!portfolioAccess.ok) {
            return portfolioAccess.res;
        }

        // formData から File を取り出します。
        const formData = await req.formData();
        const file = formData.get("file");

        if (!(file instanceof File)) {
            await writeAdminAuditLog({
                req,
                actorUserId,
                actorShopId,
                action: "menu_image_upload",
                targetType: "image_upload",
                targetId: actorShopId,
                success: false,
                metadata: { reason: "file_missing" },
            });
            return NextResponse.json(
                { error: "画像ファイルがありません。" },
                { status: 400 },
            );
        }

        const validation = validateImageFile(file);
        if (!validation.ok) {
            // MIME やサイズが条件を満たさない時は、ここで保存処理へ進ませません。
            await writeAdminAuditLog({
                req,
                actorUserId,
                actorShopId,
                action: "menu_image_upload",
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

        // パスに shopId と時刻を含め、他店舗との混在や名前衝突を避けます。
        const pathname = `menu-images/${auth.shopId}/${Date.now()}.${validation.extension}`;

        const blob = await uploadImageToBlob({
            file,
            pathname,
        });

        await writeAdminAuditLog({
            req,
            actorUserId,
            actorShopId,
            action: "menu_image_upload",
            targetType: "image_upload",
            targetId: actorShopId,
            success: true,
            metadata: { pathname: blob.pathname },
        });

        return NextResponse.json({
            url: blob.url,
            pathname: blob.pathname,
        });
    } catch (e) {
        if (actorShopId) {
            await writeAdminAuditLog({
                req,
                actorUserId,
                actorShopId,
                action: "menu_image_upload",
                targetType: "image_upload",
                targetId: actorShopId,
                success: false,
                metadata: { reason: "internal_error" },
            });
        }
        const uploadError = buildUploadJsonError(e);
        return NextResponse.json(
            { error: uploadError.error },
            { status: uploadError.status },
        );
    }
});

export const POST = (req: Request) => app.fetch(req);
