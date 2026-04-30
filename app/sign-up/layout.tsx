import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

export default function SignUpLayout({ children }: { children: ReactNode }) {
    return <ClerkProvider>{children}</ClerkProvider>;
}
