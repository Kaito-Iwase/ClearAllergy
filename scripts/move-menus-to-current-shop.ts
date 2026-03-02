// scripts/move-menus-to-current-shop.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    // 旧shopId（メニューが入ってる方）
    const fromShopId = "cmm8ollib0001wnqcyimmbm6a";
    // 新shopId（今ログイン中の方）
    const toShopId = "cmm90d5ut0002wnecaagmwb0p";

    const result = await prisma.menuItem.updateMany({
        where: { shopId: fromShopId },
        data: { shopId: toShopId },
    });

    console.log("moved menus:", result.count);
}

main()
    .catch(console.error)
    .finally(async () => prisma.$disconnect());
