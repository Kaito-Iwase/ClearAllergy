import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getSessionShopId } from "@/lib/admin-auth";

export async function POST(req: Request) {
    const shopId = await getSessionShopId();

    if (!shopId) {
        return NextResponse.json(
            { error: "認証が必要です。" },
            { status: 401 },
        );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
        return NextResponse.json(
            { error: "画像ファイルが見つかりません。" },
            { status: 400 },
        );
    }

    if (!file.type.startsWith("image/")) {
        return NextResponse.json(
            { error: "画像ファイルのみアップロードできます。" },
            { status: 400 },
        );
    }

    const ext = file.name.split(".").pop() || "jpg";
    const path = `shops/${shopId}/cover-${Date.now()}.${ext}`;

    const blob = await put(path, file, {
        access: "public",
    });

    return NextResponse.json({
        url: blob.url,
    });
}
