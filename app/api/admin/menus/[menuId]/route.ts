// app/api/admin/menus/[menuId]/route.ts
// 管理API：
// GET  /api/admin/menus/:menuId ・・・ 管理用の詳細取得（必要なら）
// PUT  /api/admin/menus/:menuId ・・・ 更新（bodyからshopIdを受けない。セッションから取得）
//
// 目的：
// - ログイン中の店舗（session.user.shopId）だけが、その店舗のメニューを更新できるようにする

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Next.jsの環境で params の形が揺れることがあるので両対応
type Context = {
    params?: { menuId?: string } | Promise<{ menuId?: string }>;
};

function getMenuIdFromUrl(req: Request) {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1];
}

// menuIdを「params優先、ダメならURL末尾」から取る
async function getMenuId(
    req: Request,
    context: Context,
): Promise<string | undefined> {
    const p = context.params ? await context.params : undefined;
    return p?.menuId ?? getMenuIdFromUrl(req);
}

// 3択の状態（DB enumに合わせる）
type Status = "CONTAINS" | "FREE" | "MAY_CONTAIN";

// 更新ボディ（★shopIdは受け取らない！）
type UpdateMenuBody = {
    name?: string;
    description?: string | null;
    priceYen?: number | null;
    category?: string | null;
    ingredients?: string | null;
    precaution?: string | null;
    isPublished?: boolean;

    // 例：{ egg: "CONTAINS", milk: "FREE" }
    allergenStatusBySlug?: Record<string, Status>;
};

export async function GET(req: Request, context: Context) {
    try {
        // 1) セッション確認（未ログインなら401）
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json(
                { error: "unauthorized" },
                { status: 401 },
            );
        }

        // 2) shopIdはセッションから
        const shopId = session.user?.shopId;
        if (!shopId) {
            return NextResponse.json(
                { error: "unauthorized: shopId missing in session" },
                { status: 401 },
            );
        }

        // 3) menuId取得
        const menuId = await getMenuId(req, context);
        if (!menuId) {
            return NextResponse.json(
                { error: "menuId is required" },
                { status: 400 },
            );
        }

        // 4) DBから取得（このshopのmenuだけ許可）
        const menu = await prisma.menuItem.findFirst({
            where: { id: menuId, shopId },
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

        if (!menu) {
            // 他店舗のmenuIdを指定しても「見つからない」にする（情報漏えいを減らす）
            return NextResponse.json(
                { error: "menu not found" },
                { status: 404 },
            );
        }

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
}

export async function PUT(req: Request, context: Context) {
    try {
        // 1) セッション確認（未ログインなら401）
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json(
                { error: "unauthorized" },
                { status: 401 },
            );
        }

        // 2) shopIdはセッションから
        const shopId = session.user?.shopId;
        if (!shopId) {
            return NextResponse.json(
                { error: "unauthorized: shopId missing in session" },
                { status: 401 },
            );
        }

        // 3) menuId取得
        const menuId = await getMenuId(req, context);
        if (!menuId) {
            return NextResponse.json(
                { error: "menuId is required" },
                { status: 400 },
            );
        }

        // 4) body取得（shopIdは受け取らない）
        const body = (await req.json()) as UpdateMenuBody;

        // 5) menuの存在 & このshopのものかチェック
        // findUnique(id) → shopId照合、でも良い。
        // ここは一発で絞れる findFirst を使う（whereに shopId を含める）。
        const existing = await prisma.menuItem.findFirst({
            where: { id: menuId, shopId },
            select: { id: true, shopId: true },
        });

        if (!existing) {
            // 他店舗のmenuIdを指定しても404（安全）
            return NextResponse.json(
                { error: "menu not found" },
                { status: 404 },
            );
        }

        // 6) MenuItem更新（undefinedなら更新しない）
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
            },
            select: {
                id: true,
                shopId: true,
                name: true,
                isPublished: true,
                updatedAt: true,
            },
        });

        // 7) アレルゲン状態更新（送ってきたslugだけ）
        const map = body.allergenStatusBySlug ?? {};
        const slugs = Object.keys(map);

        if (slugs.length > 0) {
            // slug -> allergenId
            const allergens = await prisma.allergen.findMany({
                where: { slug: { in: slugs } },
                select: { id: true, slug: true },
            });

            // ★ 追加：存在しないslugを検出して400で返す（黙って無視しない）
            const found = new Set(allergens.map((a) => a.slug));
            const missing = slugs.filter((s) => !found.has(s));
            if (missing.length > 0) {
                return NextResponse.json(
                    { error: "unknown allergen slug(s)", missing },
                    { status: 400 },
                );
            }

            // ★ 変更：全部まとめてtransaction（途中失敗で中途半端にならない）
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
}
