import { Hono } from "hono";
import { NextResponse } from "next/server";
import {
    isGooglePlacesConfigured,
    searchGooglePlaces,
} from "@/lib/google-places";
import { consumeRateLimit } from "@/lib/utils/rate-limit";
import { getIpFromHeaders } from "@/lib/utils/request-ip";

const app = new Hono();

app.get("/api/places/search", async (c) => {
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
            message:
                "Google Places検索は現在設定されていません。登録済み店舗検索は利用できます。",
        });
    }

    const limit = consumeRateLimit({
        key: `public-places:${getIpFromHeaders(c.req.raw.headers)}`,
        limit: 20,
        windowMs: 15 * 60 * 1000,
    });
    if (!limit.allowed) {
        return NextResponse.json(
            { error: "検索回数が多すぎます。しばらく待ってください。" },
            { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
        );
    }

    try {
        return NextResponse.json({
            available: true,
            places: await searchGooglePlaces(query),
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json(
            { error: "周辺店舗を現在検索できません。", places: [] },
            { status: 503 },
        );
    }
});

export const GET = (req: Request) => app.fetch(req);
