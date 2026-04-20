import { Prisma, type AdminInvite, type InviteStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/email";

export class InvitationError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "InvitationError";
        this.status = status;
    }
}

type LockedInviteRow = {
    id: string;
    email: string;
    shopId: string;
    expiresAt: Date | null;
};

export function getInvitationExpiresAt(expiresInDays: number) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    return expiresAt;
}

export function buildInvitationRedirectUrl(req: Request) {
    return new URL("/admin/register", req.url).toString();
}

export function serializeAdminInvite(
    invite: Pick<
        AdminInvite,
        | "id"
        | "email"
        | "shopId"
        | "status"
        | "clerkInvitationId"
        | "expiresAt"
        | "acceptedAt"
        | "revokedAt"
        | "createdAt"
        | "updatedAt"
    > & {
        shop?: {
            id: string;
            name: string;
            isActive: boolean;
            ownerClerkUserId: string | null;
        };
    },
) {
    return {
        id: invite.id,
        email: invite.email,
        shopId: invite.shopId,
        status: invite.status,
        clerkInvitationId: invite.clerkInvitationId,
        expiresAt: invite.expiresAt?.toISOString() ?? null,
        acceptedAt: invite.acceptedAt?.toISOString() ?? null,
        revokedAt: invite.revokedAt?.toISOString() ?? null,
        createdAt: invite.createdAt.toISOString(),
        updatedAt: invite.updatedAt.toISOString(),
        shop: invite.shop
            ? {
                  id: invite.shop.id,
                  name: invite.shop.name,
                  isActive: invite.shop.isActive,
                  ownerClerkUserId: invite.shop.ownerClerkUserId,
              }
            : undefined,
    };
}

export async function expirePendingInvitesForEmail(email: string) {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
        return;
    }

    await prisma.adminInvite.updateMany({
        where: {
            email: normalizedEmail,
            status: "pending",
            expiresAt: {
                not: null,
                lte: new Date(),
            },
        },
        data: {
            status: "expired",
        },
    });
}

export async function expirePendingInvitesForShop(shopId: string) {
    await prisma.adminInvite.updateMany({
        where: {
            shopId,
            status: "pending",
            expiresAt: {
                not: null,
                lte: new Date(),
            },
        },
        data: {
            status: "expired",
        },
    });
}

export function isInviteLockError(error: unknown) {
    if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2010"
    ) {
        const meta = error.meta as { code?: unknown } | undefined;
        return meta?.code === "55P03";
    }

    return error instanceof Error && error.message.includes("55P03");
}

async function resolveAcceptingAppUser(args: {
    tx: Prisma.TransactionClient;
    clerkUserId: string;
    email: string;
}) {
    const existingByClerkId = await args.tx.user.findUnique({
        where: { clerkUserId: args.clerkUserId },
        include: { shop: true },
    });

    if (existingByClerkId) {
        if (existingByClerkId.email !== args.email) {
            return args.tx.user.update({
                where: { id: existingByClerkId.id },
                data: { email: args.email },
                include: { shop: true },
            });
        }

        return existingByClerkId;
    }

    const existingByEmail = await args.tx.user.findUnique({
        where: { email: args.email },
        include: { shop: true },
    });

    if (existingByEmail?.clerkUserId) {
        throw new InvitationError(
            "このメールアドレスは別のClerkユーザーに紐づいています。",
            409,
        );
    }

    if (existingByEmail) {
        return args.tx.user.update({
            where: { id: existingByEmail.id },
            data: { clerkUserId: args.clerkUserId },
            include: { shop: true },
        });
    }

    return args.tx.user.create({
        data: {
            clerkUserId: args.clerkUserId,
            email: args.email,
        },
        include: { shop: true },
    });
}

export async function acceptPendingInviteForCurrentUser(args: {
    clerkUserId: string;
    email: string;
}) {
    const email = normalizeEmail(args.email);

    if (!email) {
        throw new InvitationError("Clerkのメールアドレスを確認できません。", 400);
    }

    await expirePendingInvitesForEmail(email);

    return prisma.$transaction(async (tx) => {
        const lockedInvites = await tx.$queryRaw<LockedInviteRow[]>`
            SELECT "id", "email", "shopId", "expiresAt"
            FROM "AdminInvite"
            WHERE "email" = ${email}
              AND "status" = 'pending'::"InviteStatus"
              AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
            ORDER BY "createdAt" ASC
            LIMIT 1
            FOR UPDATE NOWAIT
        `;
        const invite = lockedInvites[0];

        if (!invite) {
            throw new InvitationError(
                "このメールアドレスで有効な招待が見つかりません。",
                404,
            );
        }

        const shop = await tx.shop.findUnique({
            where: { id: invite.shopId },
            select: {
                id: true,
                name: true,
                userId: true,
                ownerClerkUserId: true,
                isActive: true,
            },
        });

        if (!shop) {
            throw new InvitationError("招待対象の店舗が見つかりません。", 404);
        }

        if (
            shop.ownerClerkUserId &&
            shop.ownerClerkUserId !== args.clerkUserId
        ) {
            throw new InvitationError(
                "この店舗にはすでに管理者が設定されています。",
                409,
            );
        }

        const appUser = await resolveAcceptingAppUser({
            tx,
            clerkUserId: args.clerkUserId,
            email,
        });

        if (appUser.shop && appUser.shop.id !== shop.id) {
            throw new InvitationError(
                "このアカウントにはすでに別の店舗が紐づいています。",
                409,
            );
        }

        const acceptedAt = new Date();
        const updatedShop = await tx.shop.update({
            where: { id: shop.id },
            data: {
                userId: appUser.id,
                ownerClerkUserId: args.clerkUserId,
                isActive: true,
            },
            select: {
                id: true,
                name: true,
                isActive: true,
            },
        });

        const updatedInvite = await tx.adminInvite.update({
            where: { id: invite.id },
            data: {
                status: "accepted",
                acceptedAt,
                acceptedByClerkUserId: args.clerkUserId,
            },
            include: {
                shop: {
                    select: {
                        id: true,
                        name: true,
                        isActive: true,
                        ownerClerkUserId: true,
                    },
                },
            },
        });

        return {
            shop: updatedShop,
            invite: updatedInvite,
            appUser,
        };
    });
}

export function inviteStatusLabel(status: InviteStatus) {
    switch (status) {
        case "pending":
            return "招待中";
        case "accepted":
            return "承認済み";
        case "revoked":
            return "取消済み";
        case "expired":
            return "期限切れ";
        case "failed":
            return "失敗";
    }
}
