import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const PORTFOLIO_DEMO_ADMIN_PATH = "/admin/demo";

export function isPortfolioMode() {
    return process.env.PORTFOLIO_MODE === "true";
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

    return getCurrentUserIsAppAdmin();
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
