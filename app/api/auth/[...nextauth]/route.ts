// このファイルは NextAuth の API エンドポイントです。
// /api/auth/* への GET / POST を NextAuth に委譲し、旧認証フローを動かします。
// 実際の認証内容は lib/auth.ts の authOptions に集約しています。

import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

// NextAuth は同じ handler を GET と POST の両方で使います。
export { handler as GET, handler as POST };
