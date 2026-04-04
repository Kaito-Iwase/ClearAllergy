import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/getCurrentAppUser";
import { prisma } from "@/lib/db";
import { authOptions } from "@/lib/auth";

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
            userId: string;
            name: string;
            description: string | null;
            address: string | null;
            hours: string | null;
            coverImageUrl: string | null;
            createdAt: Date;
            updatedAt: Date;
        } | null;
    };
    shop: {
        id: string;
        userId: string;
        name: string;
        description: string | null;
        address: string | null;
        hours: string | null;
        coverImageUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
    } | null;
    authProvider: "clerk" | "legacy";
};

// 既存コードの変更量を抑えるため、
// NextAuth の session に近い形を Clerk 由来の情報で返す。
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

// 管理画面向けに「アプリ内ユーザー + 店舗」をまとめて返す。
// Server Component 側で appUser を扱いたい時はこの helper を使う。
export async function getCurrentAdminContext(): Promise<AdminContext | null> {
    const clerkAppUser = await getCurrentAppUser();

    if (clerkAppUser) {
        return {
            appUser: clerkAppUser,
            shop: clerkAppUser.shop ?? null,
            authProvider: "clerk",
        };
    }

    const legacySession = await getServerSession(authOptions);
    const legacyUserId = legacySession?.user?.userId;

    if (!legacyUserId) {
        return null;
    }

    const legacyAppUser = await prisma.user.findUnique({
        where: { id: legacyUserId },
        include: { shop: true },
    });

    if (!legacyAppUser) {
        return null;
    }

    return {
        appUser: legacyAppUser,
        shop: legacyAppUser.shop ?? null,
        authProvider: "legacy",
    };
}

export async function requireCurrentAdminContextOrRedirect(): Promise<{
    appUser: AdminContext["appUser"];
    shop: NonNullable<AdminContext["shop"]>;
    authProvider: AdminContext["authProvider"];
}> {
    const context = await getCurrentAdminContext();

    if (!context) {
        redirect("/admin/login");
    }

    if (!context.shop) {
        redirect("/admin/register");
    }

    return {
        appUser: context.appUser,
        shop: context.shop,
        authProvider: context.authProvider,
    };
}

export async function getSessionShopId(): Promise<string | null> {
    const context = await getCurrentAdminContext();
    return context?.shop?.id ?? null;
}

export async function requireSessionShopIdOrRedirect(): Promise<string> {
    const context = await requireCurrentAdminContextOrRedirect();
    return context.shop.id;
}
