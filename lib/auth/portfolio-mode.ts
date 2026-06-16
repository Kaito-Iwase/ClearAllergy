import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/getCurrentAppUser";

export const PORTFOLIO_DEMO_ADMIN_PATH = "/admin/demo";

const DEFAULT_PORTFOLIO_EDITOR_APP_USER_IDS = [
    "cmmef0xfy0001wneg2kdp3jso",
    "cmmef0xfv0000wneg4b5d0zsl",
] as const;

export function isPortfolioMode() {
    return process.env.PORTFOLIO_MODE === "true";
}

function getPortfolioEditorAppUserIds() {
    const configuredIds =
        process.env.PORTFOLIO_EDITOR_APP_USER_IDS?.split(",")
            .map((id) => id.trim())
            .filter(Boolean) ?? [];

    return new Set([
        ...DEFAULT_PORTFOLIO_EDITOR_APP_USER_IDS,
        ...configuredIds,
    ]);
}

export function isPortfolioEditorAppUserId(appUserId: string | null | undefined) {
    if (!appUserId) {
        return false;
    }

    return getPortfolioEditorAppUserIds().has(appUserId);
}

export function hasAppAdminRole(
    user: Awaited<ReturnType<typeof currentUser>>,
) {
    return user?.publicMetadata?.role === "admin";
}

export async function getCurrentUserIsAppAdmin() {
    const user = await currentUser();
    return hasAppAdminRole(user);
}

export async function canCurrentUserMutateInPortfolioMode() {
    if (!isPortfolioMode()) {
        return true;
    }

    const user = await currentUser();

    if (hasAppAdminRole(user)) {
        return true;
    }

    if (isPortfolioEditorAppUserId(user?.externalId)) {
        return true;
    }

    const appUser = await getCurrentAppUser();
    return isPortfolioEditorAppUserId(appUser?.id);
}

export async function requirePortfolioMutationAccessApi() {
    const canMutate = await canCurrentUserMutateInPortfolioMode();

    if (canMutate) {
        return { ok: true as const };
    }

    return {
        ok: false as const,
        res: NextResponse.json(
            {
                error: "portfolio mode read only",
                message:
                    "ポートフォリオ公開版のため、この操作は閲覧専用です。",
                redirectTo: PORTFOLIO_DEMO_ADMIN_PATH,
            },
            { status: 403 },
        ),
    };
}

export async function getPortfolioRegistrationDemoResponse() {
    const canMutate = await canCurrentUserMutateInPortfolioMode();

    if (canMutate) {
        return null;
    }

    return NextResponse.json({
        message:
            "ポートフォリオ公開版のため、登録内容は保存せずデモ管理画面を表示します。",
        portfolioMode: true,
        redirectTo: PORTFOLIO_DEMO_ADMIN_PATH,
    });
}
