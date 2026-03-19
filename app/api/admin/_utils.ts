// app/api/admin/_utils.ts

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";

// 1) JSONの読み取り（壊れてても落ちない）
export async function readJson<T>(req: Request): Promise<T | null> {
    // req.json() が例外を投げることがあるので catch する
    return req.json().catch(() => null);
}

// 2) ログイン確認 + shopId取得（毎回書くのをやめる）
export async function requireShopId() {
    const session = await getAdminSession();

    if (!session) {
        return {
            ok: false as const,
            res: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
        };
    }

    const shopId = session.user?.shopId;
    if (!shopId) {
        return {
            ok: false as const,
            res: NextResponse.json(
                { error: "unauthorized: shopId missing in session" },
                { status: 401 },
            ),
        };
    }

    return { ok: true as const, shopId };
}

// 3) URLから menuId を取る（paramsが揺れても壊れない）
export type Context = {
    params?: { menuId?: string } | Promise<{ menuId?: string }>;
};

function getMenuIdFromUrl(req: Request) {
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

// 4) 500の返し方を統一（開発中だけ message を出す）
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
