export { default as middleware } from "next-auth/middleware";

export const config = {
    matcher: ["/admin/menus/:path*", "/admin/shop/:path*"],
};
