import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireShopId, internalError } from "@/app/api/admin/_utils";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(req: Request) {
    try {
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }

        const formData = await req.formData();
        const file = formData.get("file");

        if (!(file instanceof File)) {
            return NextResponse.json(
                { error: "画像ファイルがありません。" },
                { status: 400 },
            );
        }

        if (!file.type.startsWith("image/")) {
            return NextResponse.json(
                { error: "画像ファイルのみアップロードできます。" },
                { status: 400 },
            );
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: "画像サイズは5MB以下にしてください。" },
                { status: 400 },
            );
        }

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
