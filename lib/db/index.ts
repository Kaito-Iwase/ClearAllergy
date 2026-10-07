// Prisma Client をアプリ全体で使い回すための共通入口です。
// 開発中の hot reload で接続数が増えすぎないよう、globalThis に保持します。

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        // 生のPrisma例外は入力値を含み得る。処理境界の安全な運用ログへ集約する。
        log: [],
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
