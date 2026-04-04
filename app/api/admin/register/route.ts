// このファイルは旧認証用の新規登録 API です。
// /api/admin/register の POST を担当し、User と Shop を同時に作成します。
// Clerk 段階移行中でも、既存のメール+パスワード登録を壊さないために残しています。

import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db";
import { isValidEmail, normalizeEmail } from "@/lib/email";

type RegisterRequestBody = {
    shopName?: string;
    email?: string;
    password?: string;
};

export async function POST(req: Request) {
    try {
        // POST body からフォーム値を受け取ります。
        const body = (await req.json()) as RegisterRequestBody;

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
    } catch (error) {
        // 予期しない失敗は 500 として返し、画面側でまとめて表示できるようにします。
        const message =
            error instanceof Error ? error.message : "不明なエラーです。";

        return NextResponse.json(
            {
                message: `新規登録中にサーバーエラーが発生しました: ${message}`,
            },
            { status: 500 },
        );
    }
}
