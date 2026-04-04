// このファイルは管理画面の店舗情報 API です。
// /api/admin/shop の GET は表示用取得、PUT は更新を担当します。
// 認証済み管理者の shopId を使い、他店舗の情報が触れないようにします。

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { internalError, readJson, requireShopId } from "@/app/api/admin/_utils";
import {
    toRequiredTrimmedString,
    toTrimmedNullableString,
} from "@/lib/admin-validators";

type ShopUpdateBody = {
    name?: unknown;
    description?: unknown;
    address?: unknown;
    hours?: unknown;
    coverImageUrl?: unknown;
};

export async function GET() {
    try {
        // GET は現在ログイン中の店舗情報を取得します。
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }

        const shop = await prisma.shop.findUnique({
            where: { id: auth.shopId },
            select: {
                id: true,
                name: true,
                description: true,
                address: true,
                hours: true,
                coverImageUrl: true,
                updatedAt: true,
            },
        });

        if (!shop) {
            return NextResponse.json(
                { error: "shop not found" },
                { status: 404 },
            );
        }

        return NextResponse.json({ shop });
    } catch (e) {
        return internalError(e);
    }
}

export async function PUT(req: Request) {
    try {
        // PUT は編集フォームから送られた店舗情報の保存です。
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }

        // JSON が壊れている場合は 400 を返し、DB 更新まで進ませません。
        const body = await readJson<ShopUpdateBody>(req);
        if (!body) {
            return NextResponse.json(
                { error: "bad request: invalid json" },
                { status: 400 },
            );
        }

        // 店舗名は必須なので、空文字や空白だけはここで弾きます。
        const name = toRequiredTrimmedString(body.name);
        if (!name) {
            return NextResponse.json(
                { error: "bad request: name is required" },
                { status: 400 },
            );
        }

        // 文字列項目は空なら null に寄せて保存し、DB の扱いを揃えます。
        const description = toTrimmedNullableString(body.description);
        const address = toTrimmedNullableString(body.address);
        const hours = toTrimmedNullableString(body.hours);
        const coverImageUrl = toTrimmedNullableString(body.coverImageUrl);

        // where に auth.shopId を使うことで、必ず本人の店舗だけ更新します。
        const shop = await prisma.shop.update({
            where: { id: auth.shopId },
            data: {
                name,
                description,
                address,
                hours,
                coverImageUrl,
            },
            select: {
                id: true,
                name: true,
                description: true,
                address: true,
                hours: true,
                coverImageUrl: true,
                updatedAt: true,
            },
        });

        return NextResponse.json({ shop });
    } catch (e) {
        return internalError(e);
    }
}
