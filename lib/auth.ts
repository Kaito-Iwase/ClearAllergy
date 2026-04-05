// このファイルは NextAuth の設定本体です。
// app/api/auth/[...nextauth]/route.ts から読み込まれ、旧メールアドレス+パスワード認証を担当します。
// authorize で DB を確認し、jwt / session callback で userId と shopId を管理画面へ渡します。

import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/email";
import bcrypt from "bcrypt";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getIpFromHeaders } from "@/lib/request-ip";

export const authOptions: NextAuthOptions = {
    // DB に session テーブルを持たず、JWT の中にログイン情報を載せる方式です。
    session: { strategy: "jwt" },

    providers: [
        Credentials({
            name: "Email and Password",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },

            async authorize(credentials, req) {
                // まず入力値を整えます。
                // email は大小文字や余分な空白の揺れを減らすため正規化します。
                const email = normalizeEmail(credentials?.email);
                const password = credentials?.password;

                if (!email || !password) return null;

                const ip = getIpFromHeaders(req?.headers ?? {});
                const rateLimit = consumeRateLimit({
                    key: `login:${ip}`,
                    limit: 10,
                    windowMs: 10 * 60 * 1000,
                });

                if (!rateLimit.allowed) {
                    return null;
                }

                // 認証対象のユーザーを DB から探します。
                // 旧認証では email を一意キーとして扱っています。
                const user = await prisma.user.findUnique({
                    where: { email },
                    select: { id: true, email: true, passwordHash: true },
                });
                if (!user) return null;
                if (!user.passwordHash) return null;

                // 平文パスワードをそのまま比較せず、ハッシュ化済み値と照合します。
                const ok = await bcrypt.compare(password, user.passwordHash);
                if (!ok) return null;

                // 管理画面では「どの店舗の管理者か」が重要です。
                // そのためログイン成功時点で shopId も引いておきます。
                const shop = await prisma.shop.findUnique({
                    where: { userId: user.id },
                    select: { id: true },
                });
                if (!shop) return null;

                // ここで返した値が callbacks.jwt の user に入ります。
                // 後続の session に shopId を橋渡しするため、ここで一緒に返します。
                return {
                    id: user.id,
                    email: user.email,
                    shopId: shop.id,
                };
            },
        }),
    ],

    callbacks: {
        async jwt({ token, user }) {
            // 初回ログイン時だけ user が入るので、
            // JWT に userId / shopId を保存して次回以降のリクエストでも参照できるようにします。
            if (user) {
                token.userId = user.id;
                token.shopId = user.shopId;
            }
            return token;
        },

        async session({ session, token }) {
            // Client / Server Component から session.user.shopId を使えるように、
            // JWT に保存した値を session 側へ写します。
            session.user.userId = token.userId;
            session.user.shopId = token.shopId;
            return session;
        },
    },

    // 署名や暗号化に使う秘密鍵です。
    secret: process.env.NEXTAUTH_SECRET,
};
