// types/next-auth.d.ts
import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
    interface Session {
        user: DefaultSession["user"] & {
            userId: string;
            shopId: string;
        };
    }

    interface User {
        shopId: string;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        userId: string;
        shopId: string;
    }
}
