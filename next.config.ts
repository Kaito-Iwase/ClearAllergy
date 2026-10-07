import { getAllowedImageOrigins } from "./lib/storage/image-url-policy";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    async headers() {
        return [
            { source: "/:path*", headers: [
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            ] },
            { source: "/admin/:path*", headers: [
                { key: "X-Frame-Options", value: "SAMEORIGIN" },
            ] },
        ];
    },
    images: {
        remotePatterns: getAllowedImageOrigins().map((origin) => ({
            protocol: "https" as const,
            hostname: new URL(origin).hostname,
            port: "",
            search: "",
        })),
    },
};

export default nextConfig;
