// scripts/create-test-user.ts
import { prisma } from "../lib/db";
import bcrypt from "bcrypt";
import { syncLegacyUserToClerk } from "../lib/auth/clerkAdminServer";

async function main() {
    // ★好きな値にしてOK
    const email = "test@shop.com";
    const password = "Passw0rd!";

    // 1) パスワードをハッシュ化（bcrypt）
    const passwordHash = await bcrypt.hash(password, 10);

    // 2) Userを作成（既にあれば更新）
    const user = await prisma.user.upsert({
        where: { email },
        update: { passwordHash },
        create: { email, passwordHash },
        select: { id: true, email: true, createdAt: true },
    });

    // 3) Shopを作成（User 1 : 1）
    const shop = await prisma.shop.upsert({
        where: { userId: user.id },
        update: {},
        create: {
            userId: user.id,
            name: "テスト店舗",
            description: "ログイン確認用",
        },
        select: { id: true, userId: true, name: true },
    });

    const synced = await syncLegacyUserToClerk({
        id: user.id,
        clerkUserId: null,
        email: user.email,
        passwordHash,
        createdAt: user.createdAt,
    });

    console.log("Created/Updated user:", user);
    console.log("Created/Updated shop:", shop);
    console.log("Clerk sync:", synced);
    console.log("Login email:", email);
    console.log("Login password:", password);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
