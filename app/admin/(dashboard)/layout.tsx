import type { ReactNode } from "react";
import AdminDashboardShell from "@/components/layout/AdminDashboardShell";

export default function AdminDashboardLayout({
    children,
}: {
    children: ReactNode;
}) {
    return <AdminDashboardShell>{children}</AdminDashboardShell>;
}
