// このファイルは旧認証用の新規登録 API です。
// /api/admin/register の POST を担当し、User と Shop を同時に作成します。
// Clerk 段階移行中でも、既存のメール+パスワード登録を壊さないために残しています。

import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db";
import { isValidEmail, normalizeEmail } from "@/lib/email";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getIpFromHeaders } from "@/lib/request-ip";
import { getAdminRegistrationGuard } from "@/lib/admin-registration";

type RegisterRequestBody = {
    shopName?: string;
    email?: string;
    password?: string;
    inviteToken?: string;
};

export async function POST(req: Request) {
    try {
        const ip = getIpFromHeaders(req.headers);
        // 最低限の IP 単位制限です。
        // 本番で BOT 登録や短時間の連続試行を減らすために入れています。
        const rateLimit = consumeRateLimit({
            key: `register:${ip}`,
            limit: 5,
            windowMs: 15 * 60 * 1000,
        });

        if (!rateLimit.allowed) {
            return NextResponse.json(
                {
                    message:
                        "登録試行が多すぎます。しばらく待ってから再度お試しください。",
                },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(rateLimit.retryAfterSeconds),
                    },
                },
            );
        }

        // POST body からフォーム値を受け取ります。
        const body = (await req.json()) as RegisterRequestBody;
        const inviteToken =
            req.headers.get("x-admin-invite-token") ??
            (typeof body?.inviteToken === "string" ? body.inviteToken : null);
        // 登録画面が見えていても、最終判断は必ず API 側で行います。
        // ここが無いと API 直打ちで登録されてしまいます。
        const registrationGuard = getAdminRegistrationGuard({ inviteToken });

        if (!registrationGuard.allowed) {
            return NextResponse.json(
                {
                    message: registrationGuard.message,
                },
                { status: 403 },
            );
        }

        // 先に文字列を整形しておくと、以後のバリデーションを単純にできます。
        const shopName = body.shopName?.trim() ?? "";
        const email = normalizeEmail(body.email);
        const password = body.password ?? "";

        // 必須項目と形式を順番にチェックし、分かりやすいメッセージで返します。
        if (!shopName) {
            return NextResponse.json(
                { message: "店舗名は必須です。" },
                { status: 400 },
            );
        }

        if (!email) {
            return NextResponse.json(
                { message: "メールアドレスは必須です。" },
                { status: 400 },
            );
        }

        if (!isValidEmail(email)) {
            return NextResponse.json(
                { message: "メールアドレスの形式が正しくありません。" },
                { status: 400 },
            );
        }

        if (!password || password.length < 8) {
            return NextResponse.json(
                { message: "パスワードは8文字以上で入力してください。" },
                { status: 400 },
            );
        }

        // email が重複すると意図せず複数アカウントが作れるので、先に確認します。
        const existingUser = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });

        if (existingUser) {
            return NextResponse.json(
                { message: "このメールアドレスはすでに登録されています。" },
                { status: 409 },
            );
        }

        // パスワードは平文保存せず、ハッシュ化してから DB へ保存します。
        const passwordHash = await bcrypt.hash(password, 10);

        // User と Shop は 1:1 のため、User 作成時に nested create で店舗も一緒に作成します。
        const createdUser = await prisma.user.create({
            data: {
                email,
                passwordHash,
                shop: {
                    create: {
                        name: shopName,
                    },
                },
            },
            select: {
                id: true,
                email: true,
                shop: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        return NextResponse.json(
            {
                message: "新規登録が完了しました。",
                user: {
                    id: createdUser.id,
                    email: createdUser.email,
                },
                shop: createdUser.shop,
            },
            { status: 201 },
        );
    } catch {
        return NextResponse.json(
            {
                message: "新規登録中にサーバーエラーが発生しました。",
            },
            { status: 500 },
        );
    }
}
