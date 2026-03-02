// lib/db.ts
// Prisma Client（DB操作の道具）を「1つだけ」使い回すためのファイル。

import { PrismaClient } from "@prisma/client";

// globalThis（Node.jsのグローバル領域）に prisma を保存して再利用するための型。

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// すでに globalThis に prisma があればそれを使う。
// なければ新しく PrismaClient を作る。
export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        // log：DB操作で何かあった時にコンソールへ出すログの種類
        log: ["error", "warn"],
    });

// 開発環境（production以外）だけ globalThis に保存する。
// 本番ではプロセスの挙動が違うので、グローバル保存は不要・想定外になり得る。
if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
