// app/api/admin/menus/route.ts
// GET /api/admin/menus?shopId=...
// 管理画面用：店舗のメニュー一覧を返す（編集ページへの導線用）

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
    try {
        // 1) URLからクエリパラメータ（shopId）を取得
        const url = new URL(req.url);
        const shopId = url.searchParams.get("shopId");

        // 2) shopId が無ければ 400（入力ミス）
        if (!shopId) {
            return NextResponse.json(
                { error: "shopId is required" },
                { status: 400 },
            );
        }

        // 3) メニュー一覧を取得（新しい順）
        const menus = await prisma.menuItem.findMany({
            where: { shopId },
            orderBy: { updatedAt: "desc" },
            select: {
                id: true,
                name: true,
                isPublished: true,
                updatedAt: true,
            },
        });

        // 4) JSONで返す
        return NextResponse.json({ menus });
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
