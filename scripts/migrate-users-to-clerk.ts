import { loadEnvConfig } from "@next/env";
import { prisma } from "../lib/db";
import { normalizeEmail } from "../lib/email";
import { syncLegacyUserToClerk } from "../lib/auth/clerkAdminCore";

loadEnvConfig(process.cwd());

async function main() {
    const requestedEmail = normalizeEmail(process.argv[2]);

    const users = await prisma.user.findMany({
        where: requestedEmail
            ? {
                  email: requestedEmail,
              }
            : {
                  email: {
                      not: null,
                  },
              },
        select: {
            id: true,
            clerkUserId: true,
            email: true,
            passwordHash: true,
            createdAt: true,
        },
        orderBy: {
            createdAt: "asc",
        },
    });

    if (users.length === 0) {
        console.log("No users matched the migration target.");
        return;
    }

    let created = 0;
    let linked = 0;
    let skipped = 0;

    for (const user of users) {
        const result = await syncLegacyUserToClerk(user);

        if (result.status === "created") {
            created += 1;
        } else if (result.status === "linked") {
            linked += 1;
        } else {
            skipped += 1;
        }

        console.log(
            JSON.stringify({
                email: user.email,
                status: result.status,
                clerkUserId: result.clerkUserId,
                reason: result.reason ?? null,
            }),
        );
    }

    console.log(
        JSON.stringify({
            total: users.length,
            created,
            linked,
            skipped,
        }),
    );
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
