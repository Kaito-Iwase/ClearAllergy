import { PrismaClient } from "@prisma/client";
import { assertCiDatabaseTarget } from "./ci-environment";
import { runPublicationDatabaseRegression } from "./publication-database-regression";
import { runFoodIssueResolutionDatabaseRegression } from "./food-issue-resolution-database-regression";

async function main() {
    assertCiDatabaseTarget();
    const db = new PrismaClient();
    const shop = await db.shop.create({ data: { name: "【架空】公開回帰専用" } });
    try {
        const master = await db.allergen.findMany({ select: { id: true } });
        await runPublicationDatabaseRegression(db, shop.id, master);
        await runFoodIssueResolutionDatabaseRegression(db, shop.id, master);
    }
    finally {
        await db.auditLog.deleteMany({ where: { actorShopId: shop.id } });
        await db.shop.delete({ where: { id: shop.id } });
        await db.$disconnect();
    }
}
main().catch(() => { console.error("Publication DB regression failed. Check the isolated target and last completed check; raw DB errors are not logged."); process.exitCode = 1; });
