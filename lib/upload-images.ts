import { put } from "@vercel/blob";

export const ALLOWED_IMAGE_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
] as const;

export const MAX_UPLOAD_FILE_SIZE = 5 * 1024 * 1024;

const extensionByMimeType: Record<(typeof ALLOWED_IMAGE_MIME_TYPES)[number], string> =
    {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/avif": "avif",
    };

export function validateImageFile(file: File) {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as never)) {
        return {
            ok: false as const,
            message:
                "JPEG / PNG / WebP / GIF / AVIF 形式の画像のみアップロードできます。",
        };
    }

    if (file.size > MAX_UPLOAD_FILE_SIZE) {
        return {
            ok: false as const,
            message: "画像サイズは5MB以下にしてください。",
        };
    }

    return {
        ok: true as const,
        extension: extensionByMimeType[file.type as keyof typeof extensionByMimeType],
    };
}

export function buildUploadJsonError(error: unknown) {
    if (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string"
    ) {
        if (
            error.message.includes("BLOB_READ_WRITE_TOKEN") ||
            error.message.includes("read-write token")
        ) {
            return {
                error: "画像アップロード設定が不完全です。BLOB_READ_WRITE_TOKEN を確認してください。",
                status: 500,
            };
        }
    }

    return {
        error: "画像アップロード中にサーバーエラーが発生しました。",
        status: 500,
    };
}

export async function uploadImageToBlob(args: {
    file: File;
    pathname: string;
}) {
    return put(args.pathname, args.file, {
        access: "public",
        addRandomSuffix: true,
    });
}
