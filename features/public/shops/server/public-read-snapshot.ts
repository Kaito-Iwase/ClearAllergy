import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PublicReadUnavailableError } from "@/lib/public-db";

// Nested selects can execute several SQL statements; use one snapshot for
// menu, links, master and supplement during concurrent food corrections.
export function readPublicSnapshot<T>(read: (tx: Prisma.TransactionClient) => Promise<T>, db: PrismaClient = prisma) {
    return db.$transaction(read, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }).catch(error => {
        // Pool wait / expired read transactions keep the existing unavailable UI.
        // Do not reinterpret query/schema/programming failures as missing food.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2028") {
            throw new PublicReadUnavailableError();
        }
        throw error;
    });
}
