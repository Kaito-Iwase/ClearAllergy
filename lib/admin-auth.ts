// このファイルは管理画面用の認証入口です。
// 現在は Clerk を唯一の認証基盤として扱い、
// Server Component や API から「今の管理者」と「その店舗」を取得する時に使います。

import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/getCurrentAppUser";
import { isDatabaseUnavailableError } from "@/lib/db-errors";

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
    authProvider: "clerk";
};

// 既存のコードが session.user.shopId 前提で書かれているため、
// できるだけ近い形の値を返して移行コストを下げます。
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

// 管理画面で必要な「アプリ内 User」と「紐づく Shop」をまとめて返します。
// 認証は Clerk セッションだけを正本にし、local DB は clerkUserId で引き直します。
export async function getCurrentAdminContext(): Promise<AdminContext | null> {
    const clerkAppUser = await getCurrentAppUser();

    if (!clerkAppUser) {
        return null;
    }

    return {
        appUser: clerkAppUser,
        shop: clerkAppUser.shop ?? null,
        authProvider: "clerk",
    };
}

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
    // API などで shopId だけあればよい時の軽量 helper です。
    const context = await getCurrentAdminContext();
    return context?.shop?.id ?? null;
}

export async function requireSessionShopIdOrRedirect(): Promise<string> {
    const context = await requireCurrentAdminContextOrRedirect();
    return context.shop.id;
}
