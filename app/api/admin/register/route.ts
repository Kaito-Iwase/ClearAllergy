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
        const body = (await req.json()) as RegisterRequestBody;

        const shopName = body.shopName?.trim() ?? "";
        const email = normalizeEmail(body.email);
        const password = body.password ?? "";

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

        const passwordHash = await bcrypt.hash(password, 10);

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
