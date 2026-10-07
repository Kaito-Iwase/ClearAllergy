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

// この関数は、アップロードされたファイルが「許可した画像か」を確認します。
// 危険な形式や大きすぎるファイルをここで弾くことで、
// ストレージ濫用や想定外の表示崩れを防ぎます。
export async function validateImageFile(file: File) {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as never)) {
        return {
            ok: false as const,
            message:
                "JPEG / PNG / WebP / GIF / AVIF 形式の画像のみアップロードできます。",
        };
    }

    if (file.size === 0) {
        return {
            ok: false as const,
            message: "画像ファイルが空です。",
        };
    }

    if (file.size > MAX_UPLOAD_FILE_SIZE) {
        return {
            ok: false as const,
            message: "画像サイズは5MB以下にしてください。",
        };
    }

    // MIME はクライアントの申告なので、先頭の形式署名とも照合する。
    // 画像全体のデコードやマルウェア検査を保証するものではない。
    const bytes = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    const matches = (offset: number, values: number[]) => values.every((value, index) => bytes[offset + index] === value);
    const ascii = (offset: number, value: string) => matches(offset, Array.from(value, (character) => character.charCodeAt(0)));
    let matchesType = false;
    switch (file.type) {
        case "image/jpeg": matchesType = matches(0, [0xff, 0xd8, 0xff]); break;
        case "image/png": matchesType = matches(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); break;
        case "image/gif": matchesType = ascii(0, "GIF87a") || ascii(0, "GIF89a"); break;
        case "image/webp": matchesType = ascii(0, "RIFF") && ascii(8, "WEBP"); break;
        case "image/avif": {
            if (bytes.length < 16 || !ascii(4, "ftyp")) break;
            const boxSize = new DataView(bytes.buffer).getUint32(0);
            if (boxSize < 16 || boxSize > bytes.length || boxSize % 4 !== 0) break;
            matchesType = ascii(8, "avif") || ascii(8, "avis");
            for (let offset = 16; !matchesType && offset < boxSize; offset += 4) {
                matchesType = ascii(offset, "avif") || ascii(offset, "avis");
            }
            break;
        }
    }
    if (!matchesType) {
        return { ok: false as const, message: "画像の内容とファイル形式が一致しません。画像ファイルを選び直してください。" };
    }

    return {
        ok: true as const,
        extension: extensionByMimeType[file.type as keyof typeof extensionByMimeType],
    };
}

// Blob 側の失敗はそのまま利用者へ返さず、分かりやすい JSON エラーへ変換します。
// 内部エラーの詳細をむやみに出さないための安全策でもあります。
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
                error: "画像アップロードを現在利用できません。時間をおいて再度お試しください。",
                status: 500,
            };
        }
    }

    return {
        error: "画像アップロード中にサーバーエラーが発生しました。",
        status: 500,
    };
}

// 実際の保存処理はこの関数にまとめます。
// API ごとに put() の呼び方がばらけると、保存設定の差分が事故の元になるためです。
export async function uploadImageToBlob(args: {
    file: File;
    pathname: string;
}) {
    return put(args.pathname, args.file, {
        access: "public",
        addRandomSuffix: true,
    });
}
