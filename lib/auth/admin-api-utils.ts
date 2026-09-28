// このファイルは管理画面 API で共通利用する helper 集です。
// 認証確認、shopId の取り出し、JSON 読み取り、500 エラー整形をまとめています。
// 各 route.ts から使い回し、同じ認可ルールとレスポンス形式を保ちます。

import { NextResponse } from "next/server";
import { getCurrentAdminContext } from "@/lib/auth/admin-auth";
import { isDatabaseUnavailableError } from "@/lib/db/errors";
import { logOperationalError } from "@/lib/observability";

// request.json() は壊れた JSON で例外を投げるので、
// 各 API で try/catch を増やしすぎないよう helper にしています。
export async function readJson<T>(req: Request): Promise<T | null> {
    return req.json().catch(() => null);
}

// 管理画面 API 共通の認証チェックです。
// shopId まで確認するのは「自分の店舗のデータだけ更新できる」ようにするためです。
export async function requireShopId() {
    let context = null;

    try {
        context = await getCurrentAdminContext();
    } catch (error) {
        if (isDatabaseUnavailableError(error)) {
            return {
                ok: false as const,
                res: NextResponse.json(
                    {
                        error: "database unavailable",
                        message:
                            "現在データベースへ接続できないため、管理APIを処理できません。",
                    },
                    { status: 503 },
                ),
            };
        }

        throw error;
    }

    if (!context) {
        return {
            ok: false as const,
            res: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
        };
    }

    if (!context.shop) {
        return {
            ok: false as const,
            res: NextResponse.json(
                { error: "shop setup required" },
                { status: 403 },
            ),
        };
    }

    return {
        ok: true as const,
        shopId: context.shop.id,
        appUser: context.appUser,
    };
}

// 開発環境を含め、例外のmessageやstackをAPIレスポンスへ返さない。
export function internalError(e: unknown) {
    logOperationalError(e, { operation: "admin_api" });
    return NextResponse.json(
        { error: "Internal Server Error" },
        { status: 500 },
    );
}
