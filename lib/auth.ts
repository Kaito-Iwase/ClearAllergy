// lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/email";
import bcrypt from "bcrypt";

export const authOptions: NextAuthOptions = {
    session: { strategy: "jwt" },

    providers: [
        Credentials({
            name: "Email and Password",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },

            async authorize(credentials) {
                const email = normalizeEmail(credentials?.email);
                const password = credentials?.password;

                if (!email || !password) return null;

                const user = await prisma.user.findUnique({
                    where: { email },
                    select: { id: true, email: true, passwordHash: true },
                });
                if (!user) return null;
                if (!user.passwordHash) return null;

                const ok = await bcrypt.compare(password, user.passwordHash);
                if (!ok) return null;

                const shop = await prisma.shop.findUnique({
                    where: { userId: user.id },
                    select: { id: true },
                });
                if (!shop) return null;

                // types/next-auth.d.ts で User に shopId を追加済みなので any 不要
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
            if (user) {
                token.userId = user.id;
                token.shopId = user.shopId;
            }
            return token;
        },

        async session({ session, token }) {
            session.user.userId = token.userId;
            session.user.shopId = token.shopId;
            return session;
        },
    },

    secret: process.env.NEXTAUTH_SECRET,
};
