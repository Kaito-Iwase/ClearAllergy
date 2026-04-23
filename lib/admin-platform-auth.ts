import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hasAppAdminRole } from "@/lib/portfolio-mode";

export type PlatformAdmin = {
    clerkUserId: string;
};

export async function getCurrentPlatformAdmin(): Promise<PlatformAdmin | null> {
    const { userId } = await auth();

    if (!userId) {
        return null;
    }

    const user = await currentUser();

    if (!hasAppAdminRole(user)) {
        return null;
    }

    return {
        clerkUserId: userId,
    };
}

export async function requirePlatformAdminApi() {
    const { userId } = await auth();

    if (!userId) {
        return {
            ok: false as const,
            res: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
        };
    }

    const user = await currentUser();

    if (!hasAppAdminRole(user)) {
        return {
            ok: false as const,
            res: NextResponse.json({ error: "forbidden" }, { status: 403 }),
        };
    }

    return {
        ok: true as const,
        clerkUserId: userId,
    };
}

export async function requirePlatformAdminOrRedirect() {
    const admin = await getCurrentPlatformAdmin();

    if (!admin) {
        redirect("/admin/login");
    }

    return admin;
}
