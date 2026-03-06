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
    // 1) 未入力は null
    if (value === undefined || value === null || value === "") {
        return { ok: true, value: null };
    }

    // 2) number でも string でも受ける
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

    // 3) 数値でない
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
        return { ok: false, message: "価格は数値で入力してください。" };
    }

    // 4) 整数でない
    if (!Number.isInteger(parsed)) {
        return { ok: false, message: "価格は整数で入力してください。" };
    }

    // 5) マイナス不可
    if (parsed < 0) {
        return { ok: false, message: "価格は0以上で入力してください。" };
    }

    // 6) Prisma Int の上限超過
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
        // 1) セッション確認 + shopId 取得
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }

        // 2) この店舗のメニューを更新日時の新しい順で取得
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

        // 3) 返す
        return NextResponse.json({ menus });
    } catch (e) {
        return internalError(e);
    }
}

// POST /api/admin/menus ・・・ 新規作成
export async function POST(req: Request) {
    try {
        // 1) セッション確認 + shopId 取得
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }

        // 2) body を読む（壊れてたら400）
        const body = await readJson<MenuCreateBody>(req);
        if (!body) {
            return NextResponse.json(
                { error: "bad request: invalid json" },
                { status: 400 },
            );
        }

        // 3) 必須 name を検証
        const name = toRequiredTrimmedString(body.name);
        if (!name) {
            return NextResponse.json(
                { error: "bad request: name is required" },
                { status: 400 },
            );
        }

        // 4) priceYen を安全に解釈
        const priceResult = parsePriceYen(body.priceYen);
        if (!priceResult.ok) {
            return NextResponse.json(
                { error: priceResult.message },
                { status: 400 },
            );
        }

        // 5) その他の入力を整形
        const description = toTrimmedNullableString(body.description);
        const category = toTrimmedNullableString(body.category);
        const ingredients = toTrimmedNullableString(body.ingredients);
        const precaution = toTrimmedNullableString(body.precaution);
        const imageUrl = toTrimmedNullableString(body.imageUrl);
        const isPublished = toBooleanOrDefault(body.isPublished, false);

        // 6) DBに作成（shopIdはセッション由来で固定）
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

        // 7) 作れたidを返す
        return NextResponse.json({ id: created.id }, { status: 201 });
    } catch (e) {
        return internalError(e);
    }
}
