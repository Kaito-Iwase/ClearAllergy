// このファイルは管理画面 API で共通利用する helper 集です。
// 認証確認、shopId の取り出し、JSON 読み取り、500 エラー整形をまとめています。
// 各 route.ts から使い回し、同じ認可ルールとレスポンス形式を保ちます。

// app/api/admin/_utils.ts

import { NextResponse } from "next/server";
import { getCurrentAdminContext } from "@/lib/admin-auth";

// request.json() は壊れた JSON で例外を投げるので、
// 各 API で try/catch を増やしすぎないよう helper にしています。
export async function readJson<T>(req: Request): Promise<T | null> {
    return req.json().catch(() => null);
}

// 管理画面 API 共通の認証チェックです。
// shopId まで確認するのは「自分の店舗のデータだけ更新できる」ようにするためです。
export async function requireShopId() {
    const context = await getCurrentAdminContext();

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

// Next.js の params はバージョンや呼ばれ方で Promise のことがあるため両対応にしています。
export type Context = {
    params?: { menuId?: string } | Promise<{ menuId?: string }>;
};

function getMenuIdFromUrl(req: Request) {
    // params が取れない環境でも動くよう、URL 末尾から menuId を抜く保険です。
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1];
}

export async function getMenuId(
    req: Request,
    context: Context,
): Promise<string | undefined> {
    const p = context.params ? await context.params : undefined;
    return p?.menuId ?? getMenuIdFromUrl(req);
}

// 開発中は原因を追いやすくしつつ、本番では内部情報を出しすぎないよう分けています。
export function internalError(e: unknown) {
    console.error(e);
    if (process.env.NODE_ENV !== "production") {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
            { error: "Internal Server Error", message: msg },
            { status: 500 },
        );
    }
    return NextResponse.json(
        { error: "Internal Server Error" },
        { status: 500 },
    );
}
