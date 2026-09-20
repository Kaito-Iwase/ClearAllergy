import { Hono } from "hono";
import { NextResponse } from "next/server";

const app = new Hono();

// v1 の公開検索は登録済み店舗だけ。旧URLは unavailable 応答を維持し、
// サーバーキーの有無にかかわらず外部Places APIは呼び出しません。
app.get("/api/places/search", (c) => {
    const query = (c.req.query("q") ?? "").trim();
    if (query.length < 2 || query.length > 120) {
        return NextResponse.json(
            { error: "検索語は2文字以上120文字以内で入力してください。" },
            { status: 400 },
        );
    }
    return NextResponse.json({
        available: false,
        places: [],
        message: "公開デモでは登録済み店舗検索をご利用ください。",
    });
});

export const GET = (req: Request) => app.fetch(req);
