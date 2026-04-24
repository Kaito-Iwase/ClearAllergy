// GET /api/allergens
// アレルゲン29品目の一覧（日本語/英語）を表示順つきで返すAPI。
// 管理画面の「29品目三択UI」を作るための基盤。

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GETリクエストが来たときに呼ばれる関数。
// async（非同期）にするのは、DBアクセスが「待ち時間のある処理」だから。
export async function GET() {
    // Allergenテーブルから複数件を取得する（findMany＝複数行取得）。
    const allergens = await prisma.allergen.findMany({
        // sortOrderの昇順（小さい順）で並べる：UI表示順を固定できる
        orderBy: { sortOrder: "asc" },

        // select：返す列を限定する（不要な情報を返さない＝安全＆軽い）
        select: {
            slug: true, // API/フィルタ用の固定キー（例：egg, milk）
            nameJa: true, // 表示用（日本語）
            nameEn: true, // 表示用（英語）
            sortOrder: true, // 表示順
        },
    });

    // JSONとして返す。
    // 返す形を { allergens: [...] } に固定しておくとフロントが扱いやすい。
    return NextResponse.json({ allergens });
}
