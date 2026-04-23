// Clerk 管理 API を直接呼ぶ処理を集約します。
// ローカル User / Shop と Clerk user の対応を崩さないよう、同期処理もここで扱います。

import { createClerkClient, type User as ClerkUser } from "@clerk/backend";
import { prisma } from "../db";
import { normalizeEmail } from "../email";

export type SyncableLegacyUser = {
    id: string;
    clerkUserId: string | null;
    email: string | null;
    passwordHash: string | null;
    createdAt: Date;
};

let cachedClerkAdminClient: ReturnType<typeof createClerkClient> | null = null;

function getRequiredClerkSecretKey() {
    const secretKey = process.env.CLERK_SECRET_KEY?.trim();

    if (!secretKey) {
        throw new Error(
            "CLERK_SECRET_KEY is required to run Clerk admin operations.",
        );
    }

    return secretKey;
}

export function getClerkAdminClient() {
    if (!cachedClerkAdminClient) {
        cachedClerkAdminClient = createClerkClient({
            secretKey: getRequiredClerkSecretKey(),
        });
    }

    return cachedClerkAdminClient;
}

export async function findClerkUserByEmail(email: string) {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
        return null;
    }

    const client = getClerkAdminClient();
    const result = await client.users.getUserList({
        emailAddress: [normalizedEmail],
        limit: 1,
    });

    return result.data[0] ?? null;
}

export async function createClerkPasswordUser(params: {
    email: string;
    password: string;
}) {
    const normalizedEmail = normalizeEmail(params.email);

    if (!normalizedEmail) {
        throw new Error("Clerk user creation requires a valid email address.");
    }

    const client = getClerkAdminClient();
    return client.users.createUser({
        emailAddress: [normalizedEmail],
        password: params.password,
        skipLegalChecks: true,
    });
}

export async function createClerkApplicationInvitation(params: {
    email: string;
    expiresInDays?: number;
    redirectUrl?: string;
    publicMetadata?: Record<string, unknown>;
}) {
    const normalizedEmail = normalizeEmail(params.email);

    if (!normalizedEmail) {
        throw new Error("Clerk invitation requires a valid email address.");
    }

    const client = getClerkAdminClient();
    return client.invitations.createInvitation({
        emailAddress: normalizedEmail,
        expiresInDays: params.expiresInDays,
        notify: true,
        ignoreExisting: false,
        redirectUrl: params.redirectUrl,
        publicMetadata: params.publicMetadata,
    });
}

export async function revokeClerkApplicationInvitation(invitationId: string) {
    const client = getClerkAdminClient();
    await client.invitations.revokeInvitation(invitationId);
}

export async function deleteClerkUser(userId: string) {
    const client = getClerkAdminClient();
    await client.users.deleteUser(userId);
}

async function linkLocalUserToClerk(params: {
    appUserId: string;
    clerkUser: ClerkUser;
    email: string | null;
}) {
    // User と Shop の所有者を同じ Clerk user id へ更新し、片方だけ進む状態を防ぎます。
    await prisma.$transaction(async (tx) => {
        await tx.user.update({
            where: { id: params.appUserId },
            data: {
                clerkUserId: params.clerkUser.id,
                email: params.email,
            },
        });

        await tx.shop.updateMany({
            where: { userId: params.appUserId },
            data: {
                ownerClerkUserId: params.clerkUser.id,
                isActive: true,
            },
        });
    });
}

export async function updateClerkExternalId(params: {
    clerkUserId: string;
    appUserId: string;
    passwordHash?: string | null;
}) {
    const client = getClerkAdminClient();

    await client.users.updateUser(params.clerkUserId, {
        externalId: params.appUserId,
        ...(params.passwordHash
            ? {
                  passwordDigest: params.passwordHash,
                  passwordHasher: "bcrypt" as const,
              }
            : {}),
        skipLegalChecks: true,
    });
}

export async function syncLegacyUserToClerk(
    legacyUser: SyncableLegacyUser,
): Promise<{
    status: "linked" | "created" | "skipped";
    clerkUserId: string | null;
    reason?: string;
}> {
    const email = normalizeEmail(legacyUser.email);

    if (!email) {
        return {
            status: "skipped",
            clerkUserId: legacyUser.clerkUserId,
            reason: "email が無いため Clerk へ移行できません。",
        };
    }

    const client = getClerkAdminClient();

    if (legacyUser.clerkUserId) {
        try {
            const existingClerkUser = await client.users.getUser(
                legacyUser.clerkUserId,
            );

            await updateClerkExternalId({
                clerkUserId: existingClerkUser.id,
                appUserId: legacyUser.id,
                passwordHash: legacyUser.passwordHash,
            });

            await linkLocalUserToClerk({
                appUserId: legacyUser.id,
                clerkUser: existingClerkUser,
                email,
            });

            return {
                status: "linked",
                clerkUserId: existingClerkUser.id,
            };
        } catch {
            // ローカルに clerkUserId が残っていても、Clerk 側に実体が無い場合は
            // email ベースで作り直します。
        }
    }

    const existingByEmail = await findClerkUserByEmail(email);

    if (existingByEmail) {
        await updateClerkExternalId({
            clerkUserId: existingByEmail.id,
            appUserId: legacyUser.id,
            passwordHash: legacyUser.passwordHash,
        });

        await linkLocalUserToClerk({
            appUserId: legacyUser.id,
            clerkUser: existingByEmail,
            email,
        });

        return {
            status: "linked",
            clerkUserId: existingByEmail.id,
        };
    }

    if (!legacyUser.passwordHash) {
        return {
            status: "skipped",
            clerkUserId: null,
            reason:
                "passwordHash が無いため既存のメールアドレス + パスワードを引き継げません。",
        };
    }

    const createdClerkUser = await client.users.createUser({
        externalId: legacyUser.id,
        emailAddress: [email],
        passwordDigest: legacyUser.passwordHash,
        passwordHasher: "bcrypt",
        createdAt: legacyUser.createdAt,
        skipLegalChecks: true,
    });

    await linkLocalUserToClerk({
        appUserId: legacyUser.id,
        clerkUser: createdClerkUser,
        email,
    });

    return {
        status: "created",
        clerkUserId: createdClerkUser.id,
    };
}
