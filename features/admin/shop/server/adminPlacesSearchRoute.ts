import { Hono } from "hono";
import { NextResponse } from "next/server";
import { requireShopId } from "@/lib/auth/admin-api-utils";
import {
    isGooglePlacesConfigured,
    searchGooglePlaces,
} from "@/lib/google-places";

const app = new Hono();

app.get("/api/admin/places/search", async (c) => {
    const auth = await requireShopId();
    if (!auth.ok) return auth.res;

    const query = (c.req.query("q") ?? "").trim();
    if (query.length < 2 || query.length > 120) {
        return NextResponse.json(
            { error: "検索語は2文字以上120文字以内で入力してください。" },
            { status: 400 },
        );
    }

    if (!isGooglePlacesConfigured()) {
        return NextResponse.json({
            available: false,
            places: [],
            message: "Google Places検索は現在設定されていません。",
        });
    }

    try {
        return NextResponse.json({
            available: true,
            places: await searchGooglePlaces(query, { limit: 5 }),
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json(
            { error: "Google店舗候補を現在検索できません。", places: [] },
            { status: 503 },
        );
    }
});

export const GET = (req: Request) => app.fetch(req);
