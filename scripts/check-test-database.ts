import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseTarget } from "./test-environment";
import { runDatabaseRegression } from "./database-regression";

async function main() {
    assertTestDatabaseTarget();
    const db = new PrismaClient();
    try {
        await runDatabaseRegression(db);
    } finally {
        await db.$disconnect();
    }
}
main().catch(() => { console.error("Dedicated DB regression failed. Check the target guard, migrations and last completed check; raw DB errors are not logged."); process.exitCode = 1; });
