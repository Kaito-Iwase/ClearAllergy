import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { internalError, readJson, requireShopId } from "@/app/api/admin/_utils";
import {
    parsePriceYen,
    toBooleanOrDefault,
    toRequiredTrimmedString,
    toTrimmedNullableString,
} from "@/lib/admin-validators";

// リクエスト body の型
type MenuCreateBody = {
    name?: unknown;
    description?: unknown;
    priceYen?: unknown;
    category?: unknown;
    ingredients?: unknown;
    precaution?: unknown;
    isPublished?: unknown;
    imageUrl?: unknown;
};

// GET /api/admin/menus ・・・ 一覧（管理用）
export async function GET() {
    try {
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }

        const menus = await prisma.menuItem.findMany({
            where: { shopId: auth.shopId },
            orderBy: { updatedAt: "desc" },
            select: {
                id: true,
                name: true,
                priceYen: true,
                category: true,
                imageUrl: true,
                isPublished: true,
                updatedAt: true,
            },
        });

        return NextResponse.json({ menus });
    } catch (e) {
        return internalError(e);
    }
}

// POST /api/admin/menus ・・・ 新規作成（下書き作成対応）
export async function POST(req: Request) {
    try {
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }

        const body = await readJson<MenuCreateBody>(req);

        // body が無くても仮タイトルで下書きを作れるようにする
        const name = toRequiredTrimmedString(body?.name) ?? "新しいメニュー";

        const priceResult = parsePriceYen(body?.priceYen);
        if (!priceResult.ok) {
            return NextResponse.json(
                { error: priceResult.message },
                { status: 400 },
            );
        }

        const description = toTrimmedNullableString(body?.description);
        const category = toTrimmedNullableString(body?.category);
        const ingredients = toTrimmedNullableString(body?.ingredients);
        const precaution = toTrimmedNullableString(body?.precaution);
        const imageUrl = toTrimmedNullableString(body?.imageUrl);

        // 新規作成時は基本下書き
        const isPublished = toBooleanOrDefault(body?.isPublished, false);

        const created = await prisma.menuItem.create({
            data: {
                shopId: auth.shopId,
                name,
                description,
                priceYen: priceResult.value,
                category,
                ingredients,
                precaution,
                isPublished,
                imageUrl,
            },
            select: {
                id: true,
            },
        });

        return NextResponse.json({ id: created.id }, { status: 201 });
    } catch (e) {
        return internalError(e);
    }
}
