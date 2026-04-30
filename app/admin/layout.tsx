import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

export default function AdminLayout({ children }: { children: ReactNode }) {
    return <ClerkProvider>{children}</ClerkProvider>;
}
