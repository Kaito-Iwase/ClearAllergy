// このファイルは管理画面用の認証入口です。
// 現在は Clerk を唯一の認証基盤として扱い、
// Server Component や API から「今の管理者」と「その店舗」を取得する時に使います。

import { redirect } from "next/navigation";
import { cache } from "react";
import { getCurrentAppUser } from "@/lib/auth/getCurrentAppUser";
import { isDatabaseUnavailableError } from "@/lib/db/errors";
import { prisma } from "@/lib/db";

type AdminSessionLike = {
    user: {
        userId: string;
        clerkUserId: string | null;
        email: string | null;
        shopId: string | null;
    };
};

type AdminContext = {
    appUser: {
        id: string;
        clerkUserId: string | null;
        email: string | null;
        passwordHash: string | null;
        createdAt: Date;
        updatedAt: Date;
        shop: {
            id: string;
            userId: string | null;
            ownerClerkUserId: string | null;
            name: string;
            description: string | null;
            address: string | null;
            hours: string | null;
            coverImageUrl: string | null;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
        } | null;
    };
    shop: {
        id: string;
        userId: string | null;
        ownerClerkUserId: string | null;
        name: string;
        description: string | null;
        address: string | null;
        hours: string | null;
        coverImageUrl: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
    } | null;
    authProvider: "clerk";
};

/**
 * Clerk から解決した管理者情報を、旧来の session 互換形状で返します。
 * 独自 session を作る関数ではなく、認証の正本は常に Clerk です。
 */
export async function getAdminSession(): Promise<AdminSessionLike | null> {
    const context = await getCurrentAdminContext();

    if (!context) {
        return null;
    }

    return {
        user: {
            userId: context.appUser.id,
            clerkUserId: context.appUser.clerkUserId,
            email: context.appUser.email,
            shopId: context.shop?.id ?? null,
        },
    };
}

// 認証は Clerk を正本とし、店舗所有権はローカル DB の ownerClerkUserId で引き直します。
export const getCurrentAdminContext = cache(
    async function getCurrentAdminContext(): Promise<AdminContext | null> {
        const clerkAppUser = await getCurrentAppUser();

        if (!clerkAppUser) {
            return null;
        }

        const activeOwnedShop = clerkAppUser.clerkUserId
            ? await prisma.shop.findFirst({
                  where: {
                      ownerClerkUserId: clerkAppUser.clerkUserId,
                      isActive: true,
                  },
              })
            : null;

        return {
            appUser: clerkAppUser,
            shop: activeOwnedShop,
            authProvider: "clerk",
        };
    },
);

export async function requireCurrentAdminContextOrRedirect(): Promise<{
    appUser: AdminContext["appUser"];
    shop: NonNullable<AdminContext["shop"]>;
    authProvider: AdminContext["authProvider"];
}> {
    // 管理画面で必須の認証ガードです。
    // 未ログインならログイン画面、店舗未作成なら登録画面へ送ります。
    let context: AdminContext | null;

    try {
        context = await getCurrentAdminContext();
    } catch (error) {
        if (isDatabaseUnavailableError(error)) {
            redirect("/admin/login?database=unavailable");
        }

        throw error;
    }

    if (!context) {
        redirect("/admin/login");
    }

    if (
        !context.shop ||
        !context.shop.isActive ||
        context.shop.ownerClerkUserId !== context.appUser.clerkUserId
    ) {
        redirect("/admin/register");
    }

    return {
        appUser: context.appUser,
        shop: context.shop,
        authProvider: context.authProvider,
    };
}

/**
 * 互換性のため関数名を維持していますが、shopId は現在の Clerk 認証情報から解決します。
 */
export async function getSessionShopId(): Promise<string | null> {
    const context = await getCurrentAdminContext();
    return context?.shop?.id ?? null;
}

export async function requireSessionShopIdOrRedirect(): Promise<string> {
    const context = await requireCurrentAdminContextOrRedirect();
    return context.shop.id;
}
