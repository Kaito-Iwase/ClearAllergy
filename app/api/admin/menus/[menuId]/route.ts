// このファイルは 1 件のメニューに対する取得・更新・削除 API です。
// /api/admin/menus/[menuId] の GET / PUT / DELETE をまとめています。
// 毎回 shopId で絞り込み、「自分の店舗のメニューだけ触れる」ことを保証します。

// app/api/admin/menus/[menuId]/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
    Context,
    getMenuId,
    internalError,
    readJson,
    requireShopId,
} from "@/app/api/admin/_utils";
import { type AllergenStatus } from "@/lib/allergens";

// 更新用の request body です。
// shopId はクライアントから受け取らず、必ず session 側の shopId を使います。
type UpdateMenuBody = {
    name?: string;
    description?: string | null;
    priceYen?: number | null;
    category?: string | null;
    ingredients?: string | null;
    precaution?: string | null;
    isPublished?: boolean;

    // ★追加：画像URL（まずはこれで十分）
    imageUrl?: string | null;

    // 例：{ egg: "CONTAINS", milk: "FREE" }
    allergenStatusBySlug?: Record<string, AllergenStatus>;
};

export async function GET(req: Request, context: Context) {
    try {
        // 認証された管理者か確認し、権限判定に使う shopId を取ります。
        const auth = await requireShopId();
        if (!auth.ok) return auth.res;

        // 動的ルートの menuId を取得します。
        const menuId = await getMenuId(req, context);
        if (!menuId) {
            return NextResponse.json(
                { error: "menuId is required" },
                { status: 400 },
            );
        }

        // shopId を条件に入れ、他店舗の menuId を直接叩かれても取得できないようにします。
        const menu = await prisma.menuItem.findFirst({
            where: { id: menuId, shopId: auth.shopId },
            select: {
                id: true,
                shopId: true,
                name: true,
                description: true,
                priceYen: true,
                category: true,
                ingredients: true,
                precaution: true,
                imageUrl: true,
                isPublished: true,
                createdAt: true,
                updatedAt: true,
                allergenLinks: {
                    select: {
                        status: true,
                        allergen: {
                            select: {
                                slug: true,
                                nameJa: true,
                                nameEn: true,
                                sortOrder: true,
                            },
                        },
                    },
                },
            },
        });

        // 他店舗のデータ存在有無を推測されにくいよう、単純に 404 として返します。
        if (!menu) {
            return NextResponse.json(
                { error: "menu not found" },
                { status: 404 },
            );
        }

        // DB の relation 形のままだと扱いにくいので、画面向けの配列へ整形します。
        const allergens = menu.allergenLinks
            .map((link) => ({
                slug: link.allergen.slug,
                nameJa: link.allergen.nameJa,
                nameEn: link.allergen.nameEn,
                sortOrder: link.allergen.sortOrder,
                status: link.status,
            }))
            .sort((a, b) => a.sortOrder - b.sortOrder);

        return NextResponse.json({
            menu: {
                id: menu.id,
                shopId: menu.shopId,
                name: menu.name,
                description: menu.description,
                priceYen: menu.priceYen,
                category: menu.category,
                ingredients: menu.ingredients,
                precaution: menu.precaution,
                imageUrl: menu.imageUrl,
                isPublished: menu.isPublished,
                createdAt: menu.createdAt,
                updatedAt: menu.updatedAt,
                allergens,
            },
        });
    } catch (e) {
        return internalError(e);
    }
}

export async function PUT(req: Request, context: Context) {
    try {
        // PUT は既存メニューの保存です。
        // まず本人の店舗かどうか判定するため、認証と shopId 確認を行います。
        const auth = await requireShopId();
        if (!auth.ok) return auth.res;

        // 2) menuId 取得
        const menuId = await getMenuId(req, context);
        if (!menuId) {
            return NextResponse.json(
                { error: "menuId is required" },
                { status: 400 },
            );
        }

        // request body が JSON として壊れていたら早めに 400 を返します。
        const body = await readJson<UpdateMenuBody>(req);
        if (!body) {
            return NextResponse.json(
                { error: "bad request: invalid json" },
                { status: 400 },
            );
        }

        // 対象メニューが自分の店舗に属しているか確認します。
        const existing = await prisma.menuItem.findFirst({
            where: { id: menuId, shopId: auth.shopId },
            select: { id: true },
        });
        if (!existing) {
            return NextResponse.json(
                { error: "menu not found" },
                { status: 404 },
            );
        }

        // undefined を渡した項目は更新しないので、部分更新に使えます。
        const updatedMenu = await prisma.menuItem.update({
            where: { id: menuId },
            data: {
                name: body.name ?? undefined,
                description: body.description ?? undefined,
                priceYen: body.priceYen ?? undefined,
                category: body.category ?? undefined,
                ingredients: body.ingredients ?? undefined,
                precaution: body.precaution ?? undefined,
                isPublished: body.isPublished ?? undefined,

                // ★追加：imageUrlを更新できるようにした
                imageUrl: body.imageUrl ?? undefined,
            },
            select: {
                id: true,
                shopId: true,
                name: true,
                isPublished: true,
                imageUrl: true,
                updatedAt: true,
            },
        });

        // アレルゲンは menu 本体とは別テーブルなので、後続で更新します。
        const map = body.allergenStatusBySlug ?? {};
        const slugs = Object.keys(map);

        if (slugs.length > 0) {
            // 画面が扱う slug を、DB の外部キーである allergenId に変換します。
            const allergens = await prisma.allergen.findMany({
                where: { slug: { in: slugs } },
                select: { id: true, slug: true },
            });

            // 未知の slug を黙って無視すると入力ミスが埋もれるので 400 にします。
            const found = new Set(allergens.map((a) => a.slug));
            const missing = slugs.filter((s) => !found.has(s));
            if (missing.length > 0) {
                return NextResponse.json(
                    { error: "unknown allergen slug(s)", missing },
                    { status: 400 },
                );
            }

            // upsert で「既存なら更新、なければ作成」をまとめて行います。
            // transaction にするのは、途中失敗で一部だけ保存されるのを防ぐためです。
            const ops = allergens.map((a) =>
                prisma.menuItemAllergen.upsert({
                    where: {
                        menuItemId_allergenId: {
                            menuItemId: menuId,
                            allergenId: a.id,
                        },
                    },
                    update: { status: map[a.slug] ?? "FREE" },
                    create: {
                        menuItemId: menuId,
                        allergenId: a.id,
                        status: map[a.slug] ?? "FREE",
                    },
                }),
            );

            await prisma.$transaction(ops);
        }

        return NextResponse.json({ menu: updatedMenu });
    } catch (e) {
        return internalError(e);
    }
}

export async function DELETE(req: Request, context: Context) {
    try {
        // DELETE でも shopId を確認し、自店舗メニュー以外は削除できないようにします。
        const auth = await requireShopId();
        if (!auth.ok) return auth.res;

        // 2) menuId 取得
        const menuId = await getMenuId(req, context);
        if (!menuId) {
            return NextResponse.json(
                { error: "menuId is required" },
                { status: 400 },
            );
        }

        // 3) この店のメニューか確認（他店なら404）
        const existing = await prisma.menuItem.findFirst({
            where: { id: menuId, shopId: auth.shopId },
            select: { id: true },
        });
        if (!existing) {
            return NextResponse.json(
                { error: "menu not found" },
                { status: 404 },
            );
        }

        // 中間テーブルが残っていると外部キー制約で本体を消せないため、先に削除します。
        await prisma.menuItemAllergen.deleteMany({
            where: { menuItemId: menuId },
        });

        // その後で menu 本体を削除します。
        await prisma.menuItem.delete({
            where: { id: menuId },
        });

        return NextResponse.json({ ok: true });
    } catch (e) {
        return internalError(e);
    }
}
