import { redirect } from "next/navigation";
import AdminRegisterPageClient from "@/components/admin/auth/AdminRegisterPageClient";
import AdminOnboardingPageClient from "@/components/admin/auth/AdminOnboardingPageClient";
import { getCurrentAppUser } from "@/lib/auth/getCurrentAppUser";
import { getCurrentAdminContext } from "@/lib/admin-auth";

export default async function AdminRegisterPage() {
    const appUser = await getCurrentAppUser();

    if (appUser && !appUser.shop) {
        return <AdminOnboardingPageClient email={appUser.email} />;
    }

    const context = await getCurrentAdminContext();

    if (context?.shop) {
        redirect("/admin/menus");
    }

    return <AdminRegisterPageClient />;
}
