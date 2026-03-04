// app/api/admin/menus/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { internalError, readJson, requireShopId } from "@/app/api/admin/_utils";

// GET /api/admin/menus ・・・ 一覧（管理用）
export async function GET() {
    try {
        // 1) セッション確認 + shopId 取得
        const auth = await requireShopId();
        if (!auth.ok) return auth.res;

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
        if (!auth.ok) return auth.res;

        // 2) body を読む（壊れてたら400）
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body = await readJson<any>(req);
        if (!body) {
            return NextResponse.json(
                { error: "bad request: invalid json" },
                { status: 400 },
            );
        }

        // 3) name 必須（空白はNG）
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name) {
            return NextResponse.json(
                { error: "bad request: name is required" },
                { status: 400 },
            );
        }

        // 4) DBに作成（shopIdはセッション由来で固定）
        const created = await prisma.menuItem.create({
            data: {
                shopId: auth.shopId,
                name,
                description:
                    typeof body.description === "string"
                        ? body.description.trim()
                        : null,
                priceYen:
                    typeof body.priceYen === "number" ? body.priceYen : null,
                category:
                    typeof body.category === "string"
                        ? body.category.trim()
                        : null,
                ingredients:
                    typeof body.ingredients === "string"
                        ? body.ingredients.trim()
                        : null,
                precaution:
                    typeof body.precaution === "string"
                        ? body.precaution.trim()
                        : null,
                isPublished:
                    typeof body.isPublished === "boolean"
                        ? body.isPublished
                        : false,
                imageUrl:
                    typeof body.imageUrl === "string"
                        ? body.imageUrl.trim()
                        : null,
            },
            select: { id: true },
        });

        // 5) 作れたidを返す
        return NextResponse.json({ id: created.id }, { status: 201 });
    } catch (e) {
        return internalError(e);
    }
}
