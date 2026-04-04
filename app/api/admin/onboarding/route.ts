import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/getCurrentAppUser";
import { prisma } from "@/lib/db";

type OnboardingBody = {
    shopName?: unknown;
};

export async function POST(req: Request) {
    try {
        const appUser = await getCurrentAppUser();

        if (!appUser) {
            return NextResponse.json(
                { message: "認証が必要です。" },
                { status: 401 },
            );
        }

        if (appUser.shop) {
            return NextResponse.json(
                {
                    message: "このアカウントにはすでに店舗が作成されています。",
                    shop: {
                        id: appUser.shop.id,
                        name: appUser.shop.name,
                    },
                },
                { status: 409 },
            );
        }

        const body = (await req.json().catch(() => null)) as OnboardingBody | null;
        const shopName =
            typeof body?.shopName === "string" ? body.shopName.trim() : "";

        if (!shopName) {
            return NextResponse.json(
                { message: "店舗名は必須です。" },
                { status: 400 },
            );
        }

        const shop = await prisma.shop.create({
            data: {
                userId: appUser.id,
                name: shopName,
            },
            select: {
                id: true,
                name: true,
            },
        });

        return NextResponse.json(
            {
                message: "店舗の初期設定が完了しました。",
                shop,
            },
            { status: 201 },
        );
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "不明なエラーです。";

        return NextResponse.json(
            {
                message: `店舗の初期設定中にサーバーエラーが発生しました: ${message}`,
            },
            { status: 500 },
        );
    }
}
