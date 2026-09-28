import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { consumeRateLimit } from "@/lib/utils/rate-limit";

export function enforceSameOriginAdminMutation(req: Request) {
    const method = req.method.toUpperCase();

    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
        return null;
    }

    const originHeader = req.headers.get("origin");
    if (!originHeader) {
        return NextResponse.json(
            { error: "forbidden" },
            { status: 403 },
        );
    }

    try {
        const origin = new URL(originHeader);
        const requestUrl = new URL(req.url);
        // Next.js can use the bind hostname in req.url. Host is the public request
        // authority; the deployment proxy must preserve it and normalize the
        // protocol before Next.js constructs the Request URL. Forwarded headers
        // are not additional allowed origins.
        const host = req.headers.get("host") ?? requestUrl.host;
        const target = new URL(`${requestUrl.protocol}//${host}`);
        if (
            !["http:", "https:"].includes(requestUrl.protocol) ||
            !/^[a-z0-9.[\]:-]+$/i.test(host) ||
            originHeader !== origin.origin ||
            origin.origin !== target.origin
        ) {
            return NextResponse.json({ error: "forbidden" }, { status: 403 });
        }
    } catch {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    return null;
}

export function consumeIpAndIdentifierRateLimit(args: {
    scope: string;
    ip: string;
    identifier: string;
    ipLimit: number;
    identifierLimit: number;
    windowMs: number;
}) {
    const ipResult = consumeRateLimit({
        key: `${args.scope}:ip:${createHash("sha256").update(args.ip).digest("hex")}`,
        limit: args.ipLimit,
        windowMs: args.windowMs,
    });

    const identifierResult = consumeRateLimit({
        key: `${args.scope}:identifier:${createHash("sha256").update(args.identifier).digest("hex")}`,
        limit: args.identifierLimit,
        windowMs: args.windowMs,
    });

    return {
        allowed: ipResult.allowed && identifierResult.allowed,
        retryAfterSeconds: Math.max(
            ipResult.retryAfterSeconds,
            identifierResult.retryAfterSeconds,
        ),
    };
}
