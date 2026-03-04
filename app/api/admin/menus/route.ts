// app/api/admin/menus/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// POST /api/admin/menus ・・・ 新規作成
export async function POST(req: Request) {
    try {
        // 1) セッションを取る（ログイン確認）
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json(
                { error: "unauthorized" },
                { status: 401 },
            );
        }

        // 2) shopIdをセッションから取る（bodyでは受けない）
        const shopId = session.user?.shopId;
        if (!shopId) {
            return NextResponse.json(
                { error: "unauthorized: shopId missing in session" },
                { status: 401 },
            );
        }

        // 3) bodyを読む
        const body = await req.json().catch(() => null);
        if (!body) {
            return NextResponse.json(
                { error: "bad request: invalid json" },
                { status: 400 },
            );
        }

        // 4) name必須（空白だけもNG）
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name) {
            return NextResponse.json(
                { error: "bad request: name is required" },
                { status: 400 },
            );
        }

        // 5) DBに作成（shopIdはセッション由来で固定）
        const created = await prisma.menuItem.create({
            data: {
                shopId,
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
            },
            select: { id: true },
        });

        // 6) 作れたidを返す（次に編集画面へ飛ぶため）
        return NextResponse.json({ id: created.id }, { status: 201 });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
            { error: "Internal Server Error", message: msg },
            { status: 500 },
        );
    }
}
