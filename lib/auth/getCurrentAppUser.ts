import { Prisma } from "@prisma/client";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/email";

function extractPrimaryEmail(
    clerkUser: Awaited<ReturnType<typeof currentUser>>,
): string | null {
    if (!clerkUser) {
        return null;
    }

    const primaryEmail =
        clerkUser.emailAddresses.find(
            (email) => email.id === clerkUser.primaryEmailAddressId,
        )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

    const normalized = normalizeEmail(primaryEmail);
    return normalized || null;
}

async function findExistingAppUser(clerkUserId: string) {
    return prisma.user.findUnique({
        where: { clerkUserId: clerkUserId },
        include: { shop: true },
    });
}

async function attachClerkIdToLegacyUser(clerkUserId: string, email: string) {
    const legacyUser = await prisma.user.findUnique({
        where: { email },
        include: { shop: true },
    });

    if (!legacyUser) {
        return null;
    }

    return prisma.user.update({
        where: { id: legacyUser.id },
        data: {
            clerkUserId,
            email,
        },
        include: { shop: true },
    });
}

async function createAppUser(clerkUserId: string, email: string | null) {
    return prisma.user.create({
        data: {
            clerkUserId,
            email,
        },
        include: { shop: true },
    });
}

// Clerk の認証情報から「アプリ内の User」を引く helper。
// 1. clerkUserId で検索
// 2. まだ移行前の legacy User が同じ email を持っていれば clerkUserId を後付け
// 3. 見つからなければ新規作成
// という順で処理し、既存の Shop 紐付きを壊さないようにする。
export async function getCurrentAppUser() {
    const { userId } = await auth();

    if (!userId) {
        return null;
    }

    const byClerkId = await findExistingAppUser(userId);
    if (byClerkId) {
        return byClerkId;
    }

    const clerkUser = await currentUser();
    if (!clerkUser) {
        return null;
    }

    const email = extractPrimaryEmail(clerkUser);

    try {
        if (email) {
            const linkedLegacyUser = await attachClerkIdToLegacyUser(
                userId,
                email,
            );

            if (linkedLegacyUser) {
                return linkedLegacyUser;
            }
        }

        return await createAppUser(userId, email);
    } catch (error) {
        // 初回ログインが重なった時の race condition 向け。
        // すでに別リクエストで作られていたら再取得する。
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            const createdByOtherRequest = await findExistingAppUser(userId);
            if (createdByOtherRequest) {
                return createdByOtherRequest;
            }

            if (email) {
                const linkedByEmail = await prisma.user.findUnique({
                    where: { email },
                    include: { shop: true },
                });

                if (linkedByEmail) {
                    return linkedByEmail;
                }
            }
        }

        throw error;
    }
}
