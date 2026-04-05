// このファイルは Clerk ログイン後の初回店舗作成 API です。
// Google ログインなどで appUser はあるが Shop がまだ無い時に使われます。
// 1ユーザー1店舗の前提を守るため、既存 Shop がある場合は新規作成しません。

import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/getCurrentAppUser";
import { prisma } from "@/lib/db";
import { getAdminRegistrationGuard } from "@/lib/admin-registration";

type OnboardingBody = {
    shopName?: unknown;
    inviteToken?: unknown;
};

export async function POST(req: Request) {
    try {
        // まず Clerk 由来の appUser を解決します。
        const appUser = await getCurrentAppUser();

        if (!appUser) {
            return NextResponse.json(
                { message: "認証が必要です。" },
                { status: 401 },
            );
        }

        // 既に店舗があるなら重複作成せず、その情報を返します。
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

        // 初回セットアップでは店舗名だけ受け取り、最小構成で Shop を作ります。
        const body = (await req.json().catch(() => null)) as OnboardingBody | null;
        const registrationGuard = getAdminRegistrationGuard({
            inviteToken:
                typeof body?.inviteToken === "string" ? body.inviteToken : null,
        });

        if (!registrationGuard.allowed) {
            return NextResponse.json(
                { message: registrationGuard.message },
                { status: 403 },
            );
        }

        const shopName =
            typeof body?.shopName === "string" ? body.shopName.trim() : "";

        if (!shopName) {
            return NextResponse.json(
                { message: "店舗名は必須です。" },
                { status: 400 },
            );
        }

        // userId に appUser.id を使い、今ログイン中のアプリユーザーへ店舗をひも付けます。
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
    } catch {
        return NextResponse.json(
            {
                message: "店舗の初期設定中にサーバーエラーが発生しました。",
            },
            { status: 500 },
        );
    }
}
