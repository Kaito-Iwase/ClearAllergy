// app/api/menus/route.ts
// POST /api/menus
// メニュー（商品）を作成し、アレルゲン28品目の状態（含む/含まない/注意）もまとめて保存する。

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// リクエストボディの型（この形でJSONを送る）
type CreateMenuBody = {
    // いまは認証なしで動作確認するため、shopIdを受け取る（あとでセッションから取得に変更する）
    shopId: string;

    // メニュー基本情報
    name: string;
    description?: string;
    priceYen?: number | null;
    category?: string;
    ingredients?: string;
    precaution?: string;

    // 公開/非公開（MVPは2段階）
    isPublished?: boolean;

    // アレルゲン状態：slug をキーにして状態を渡す
    // 例: { "egg": "CONTAINS", "milk": "MAY_CONTAIN" }
    allergenStatusBySlug?: Record<string, "CONTAINS" | "FREE" | "MAY_CONTAIN">;
};

export async function POST(req: Request) {
    try {
        // 1) リクエストJSONを読み取る
        const body = (await req.json()) as CreateMenuBody;

        // 2) 最低限のバリデーション（入力チェック）
        // バリデーション（入力チェック）＝変なデータが来た時にDBを壊さないための防御
        if (!body.shopId || typeof body.shopId !== "string") {
            return NextResponse.json(
                { error: "shopId is required" },
                { status: 400 },
            );
        }
        if (!body.name || typeof body.name !== "string") {
            return NextResponse.json(
                { error: "name is required" },
                { status: 400 },
            );
        }

        // shopIdが本当に存在するか確認する。
        // （存在しないshopIdでmenuを作ろうとすると、DBの制約で例外→500になりやすい）
        const shop = await prisma.shop.findUnique({
            where: { id: body.shopId }, // Shop.id は主キーなので findUnique が使える
            select: { id: true }, // idだけ取れば十分（無駄にデータを取らない）
        });

        if (!shop) {
            // これはサーバの不具合ではなく「入力が間違い」なので 400 を返す
            return NextResponse.json(
                { error: "shopId not found" },
                { status: 400 },
            );
        }

        // 3) メニュー（MenuItem）を作る
        // create = 1件作成
        const menu = await prisma.menuItem.create({
            data: {
                shopId: body.shopId,
                name: body.name,
                description: body.description ?? null,
                priceYen: body.priceYen ?? null,
                category: body.category ?? null,
                ingredients: body.ingredients ?? null,
                precaution: body.precaution ?? null,
                isPublished: body.isPublished ?? false,
            },
            select: {
                id: true,
                shopId: true,
                name: true,
                isPublished: true,
                createdAt: true,
            },
        });

        // 4) アレルゲン状態を保存する（任意）
        // ここは「allergenStatusBySlugが送られてきたときだけ」実行する
        const map = body.allergenStatusBySlug ?? {};
        const slugs = Object.keys(map);

        if (slugs.length > 0) {
            // 4-1) slug から Allergen の id をまとめて取得
            const allergens = await prisma.allergen.findMany({
                where: { slug: { in: slugs } },
                select: { id: true, slug: true },
            });

            // 4-2) 中間テーブル（MenuItemAllergen）にまとめて作成
            // createMany = 複数行を一括で作る（速い）
            // ※ @@id([menuItemId, allergenId]) があるので重複はそもそも起きにくい（新規作成時）
            const rows = allergens.map((a) => ({
                menuItemId: menu.id,
                allergenId: a.id,
                status: map[a.slug] ?? "FREE",
            }));

            // rowsが空のときはcreateManyしない（無駄なクエリを避ける）
            if (rows.length > 0) {
                await prisma.menuItemAllergen.createMany({
                    data: rows,
                });
            }
        }

        // 5) 成功レスポンス
        return NextResponse.json({ menu }, { status: 201 });
    } catch (e) {
        // 6) 例外（予期しないエラー）を返す
        console.error(e);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
