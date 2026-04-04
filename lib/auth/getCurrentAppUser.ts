// このファイルは Clerk のログイン情報から、アプリ内 User を解決する helper です。
// 管理画面や API から呼ばれ、clerkUserId と既存 User テーブルを橋渡しします。
// 段階移行中なので、既存 email ユーザーへ clerkUserId を後付けする処理もここで担当します。

import { Prisma } from "@prisma/client";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/email";

function extractPrimaryEmail(
    clerkUser: Awaited<ReturnType<typeof currentUser>>,
): string | null {
    // Clerk では複数メールを持てるため、
    // まず primary を優先し、無ければ先頭メールを使います。
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
    // Clerk 連携済みユーザーは clerkUserId だけで見つかります。
    return prisma.user.findUnique({
        where: { clerkUserId: clerkUserId },
        include: { shop: true },
    });
}

async function attachClerkIdToLegacyUser(clerkUserId: string, email: string) {
    // 旧認証ユーザーが同じ email を持っていれば、そのレコードへ Clerk ID をひも付けます。
    // これにより既存 Shop や Menu を別ユーザーとして作り直さずに済みます。
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
    // 旧ユーザーとつながらなかった場合のみ、新しい User を作ります。
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
    // auth() は Clerk 側の認証状態を返します。
    const { userId } = await auth();

    if (!userId) {
        return null;
    }

    const byClerkId = await findExistingAppUser(userId);
    if (byClerkId) {
        return byClerkId;
    }

    // まだ DB にアプリ内 User が無い場合だけ Clerk のプロフィール本体を読みます。
    const clerkUser = await currentUser();
    if (!clerkUser) {
        return null;
    }

    const email = extractPrimaryEmail(clerkUser);

    try {
        if (email) {
            // 同じ email の旧ユーザーがいれば、そのレコードへ Clerk ID を後付けします。
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
        // 初回ログインが同時に走ると、一意制約にぶつかることがあります。
        // その場合は「誰かが先に作った」前提で DB を取り直します。
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
