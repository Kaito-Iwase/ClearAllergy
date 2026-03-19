import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export async function getAdminSession() {
    return getServerSession(authOptions);
}

export async function getSessionShopId(): Promise<string | null> {
    const session = await getAdminSession();
    return session?.user?.shopId ?? null;
}

export async function requireSessionShopIdOrRedirect(): Promise<string> {
    const shopId = await getSessionShopId();
    if (!shopId) {
        redirect("/admin/login");
    }

    return shopId;
}
