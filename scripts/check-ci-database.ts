import { PrismaClient } from "@prisma/client";
import { assertCiDatabaseTarget } from "./ci-environment";
import { runDatabaseRegression } from "./database-regression";

async function main() {
    assertCiDatabaseTarget();
    const db = new PrismaClient();
    try { await runDatabaseRegression(db); }
    finally { await db.$disconnect(); }
}

main().catch(() => { console.error("CI DB regression failed. Check the isolated target, migrations and last completed check; raw DB errors are not logged."); process.exitCode = 1; });
