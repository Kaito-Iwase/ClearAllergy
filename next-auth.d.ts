// このファイルは NextAuth の型拡張です。
// session.user に userId と shopId が存在することを TypeScript に教えます。
// 管理画面の権限チェックで session.user.shopId を安全に扱うために必要です。

// types/next-auth.d.ts
import { DefaultSession } from "next-auth";

declare module "next-auth" {
    interface Session {
        // 既定の user 情報に、アプリ独自で使う ID を追加します。
        user: DefaultSession["user"] & {
            userId: string;
            shopId: string;
        };
    }

    interface User {
        // authorize() が返した shopId を callback へ渡すための型です。
        shopId: string;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        // JWT にも同じ値を持たせ、毎回 DB を引かなくても参照できるようにします。
        userId: string;
        shopId: string;
    }
}
