// 画面ごとに品目の順序がずれないよう、現行マスタを表示順つきで返します。

import { Hono } from "hono";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const app = new Hono();

app.get("/api/allergens", async () => {
    const allergens = await prisma.allergen.findMany({
        orderBy: { sortOrder: "asc" },

        // API 契約を表示用の項目に限定し、内部 ID を公開レスポンスへ含めません。
        select: {
            slug: true,
            nameJa: true,
            nameEn: true,
            sortOrder: true,
        },
    });

    return NextResponse.json({ allergens });
});

export const GET = (req: Request) => app.fetch(req);
