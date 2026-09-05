import { getAllowedImageOrigins } from "./lib/storage/image-url-policy";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
