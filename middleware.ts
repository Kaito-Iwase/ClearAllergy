// middleware.ts
// /admin 配下をログイン必須にする。
// 未ログインなら /admin/login に飛ばす。

export { default } from "next-auth/middleware";

export const config = {
    matcher: ["/admin/((?!login).*)"],
};
