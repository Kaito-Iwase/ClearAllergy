// このファイルは Clerk のログイン情報から、アプリ内 User を解決する helper です。
// 管理画面や API から呼ばれ、clerkUserId と既存 User テーブルを橋渡しします。
// 現在は Clerk を認証の正本にしたため、read-only な取得と、
// 明示的な初回セットアップ用の provisioning を分けています。

import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import {
    isDatabaseUnavailableError,
    logDatabaseUnavailableError,
} from "@/lib/db-errors";
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
    try {
        return await prisma.user.findUnique({
            where: { clerkUserId: clerkUserId },
            include: { shop: true },
        });
    } catch (error) {
        if (isDatabaseUnavailableError(error)) {
            logDatabaseUnavailableError(
                {
                    scope: "auth:getCurrentAppUser",
                    operation: "prisma.user.findUnique",
                    visibility: "admin",
                    details: {
                        clerkUserIdPresent: clerkUserId.length > 0,
                    },
                },
                error,
            );
        }

        throw error;
    }
}

async function createAppUser(clerkUserId: string, email: string | null) {
    // Clerk ログイン済みだがローカル User がまだ無い場合にだけ、新しい User を作ります。
    try {
        return await prisma.user.create({
            data: {
                clerkUserId,
                email,
            },
            include: { shop: true },
        });
    } catch (error) {
        if (isDatabaseUnavailableError(error)) {
            logDatabaseUnavailableError(
                {
                    scope: "auth:provisionCurrentAppUserFromClerk",
                    operation: "prisma.user.create",
                    visibility: "admin",
                    details: {
                        clerkUserIdPresent: clerkUserId.length > 0,
                        emailPresent: Boolean(email),
                    },
                },
                error,
            );
        }

        throw error;
    }
}

export async function getCurrentClerkIdentity() {
    const { userId } = await auth();

    if (!userId) {
        return null;
    }

    const clerkUser = await currentUser();

    return {
        clerkUserId: userId,
        email: extractPrimaryEmail(clerkUser),
    };
}

// Clerk の認証情報から「アプリ内の User」を引く read-only helper。
// ここでは DB の create / update を行わず、既にひも付いている User だけ返します。
export async function getCurrentAppUser() {
    const { userId } = await auth();

    if (!userId) {
        return null;
    }

    return findExistingAppUser(userId);
}

// Clerk ログイン中の利用者を、明示的な初回セットアップ時だけアプリ内 User として作成 / 連携します。
// read-only な認証確認中に副作用を出さないため、この処理は onboarding API などからだけ呼びます。
export async function provisionCurrentAppUserFromClerk() {
    const identity = await getCurrentClerkIdentity();

    if (!identity) {
        return null;
    }

    const byClerkId = await findExistingAppUser(identity.clerkUserId);
    if (byClerkId) {
        return byClerkId;
    }

    // Clerk 完全移行後は、旧 passwordHash ユーザーの自動 email 連携は行いません。
    // 既存ユーザーは移行スクリプトで事前に clerkUserId を付与し、
    // ランタイムでは「まだ無いなら新規 User を作る」だけに絞ります。
    return createAppUser(identity.clerkUserId, identity.email);
}
