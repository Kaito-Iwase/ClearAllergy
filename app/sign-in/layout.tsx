import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

export default function SignInLayout({ children }: { children: ReactNode }) {
    return <ClerkProvider>{children}</ClerkProvider>;
}
