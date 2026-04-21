import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePlatformAdminOrRedirect } from "@/lib/admin-platform-auth";
import AdminInvitationManager from "@/components/admin/invitations/AdminInvitationManager";
import type { AdminInvitationListItem } from "@/components/admin/invitations/AdminInvitationManager";
import AdminLogoutButton from "@/components/admin/common/AdminLogoutButton";
import BrandLogo from "@/components/layout/BrandLogo";

export default async function AdminInvitationsPage() {
    await requirePlatformAdminOrRedirect();

    const invitations = await prisma.adminInvite.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
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

    const initialInvitations: AdminInvitationListItem[] = invitations.map(
        (invite) => ({
            id: invite.id,
            email: invite.email,
            status: invite.status,
            expiresAt: invite.expiresAt?.toISOString() ?? null,
            createdAt: invite.createdAt.toISOString(),
            shop: invite.shop,
        }),
    );

    return (
        <div className="min-h-screen bg-background-light text-text-main">
            <header className="border-b border-gray-100 bg-white">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-8">
                    <Link href="/" className="inline-flex items-center">
                        <BrandLogo priority />
                    </Link>
                    <div className="w-[140px]">
                        <AdminLogoutButton />
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
                <div className="mb-6">
                    <p className="text-sm font-bold text-green-700">
                        ClearAllergy Operations
                    </p>
                    <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900">
                        店舗管理者招待
                    </h1>
                    <p className="mt-2 text-sm leading-7 text-gray-600">
                        招待メールの送信、再送、取消だけを扱うMVP用の運営画面です。
                    </p>
                </div>

                <AdminInvitationManager
                    initialInvitations={initialInvitations}
                />
            </main>
        </div>
    );
}
