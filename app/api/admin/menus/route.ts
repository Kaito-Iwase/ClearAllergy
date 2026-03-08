import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { internalError, readJson, requireShopId } from "@/app/api/admin/_utils";

// Prisma の Int は 32bit signed integer
const PRISMA_INT_MAX = 2147483647;

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

// 文字列を trim して、空文字なら null にする
function toTrimmedNullableString(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
}

// 必須文字列を trim して返す。空なら null
function toRequiredTrimmedString(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
}

// Boolean だけ通す。未指定や異常値は defaultValue を返す
function toBooleanOrDefault(value: unknown, defaultValue: boolean): boolean {
    return typeof value === "boolean" ? value : defaultValue;
}

// priceYen を安全に number | null に変換する
function parsePriceYen(
    value: unknown,
): { ok: true; value: number | null } | { ok: false; message: string } {
    if (value === undefined || value === null || value === "") {
        return { ok: true, value: null };
    }

    let parsed: number;

    if (typeof value === "number") {
        parsed = value;
    } else if (typeof value === "string") {
        const trimmed = value.trim();

        if (trimmed === "") {
            return { ok: true, value: null };
        }

        parsed = Number(trimmed);
    } else {
        return { ok: false, message: "価格は数値で入力してください。" };
    }

    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
        return { ok: false, message: "価格は数値で入力してください。" };
    }

    if (!Number.isInteger(parsed)) {
        return { ok: false, message: "価格は整数で入力してください。" };
    }

    if (parsed < 0) {
        return { ok: false, message: "価格は0以上で入力してください。" };
    }

    if (parsed > PRISMA_INT_MAX) {
        return {
            ok: false,
            message: `価格が大きすぎます。${PRISMA_INT_MAX}円以下で入力してください。`,
        };
    }

    return { ok: true, value: parsed };
}

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
