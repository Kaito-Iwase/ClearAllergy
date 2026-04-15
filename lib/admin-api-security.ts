import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";

function firstHeaderValue(value: string | null) {
    return value?.split(",")[0]?.trim() || null;
}

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

    let origin: URL;

    try {
        origin = new URL(originHeader);
    } catch {
        return NextResponse.json(
            { error: "forbidden" },
            { status: 403 },
        );
    }

    const requestUrl = new URL(req.url);
    const forwardedHost = firstHeaderValue(req.headers.get("x-forwarded-host"));
    const forwardedProto = firstHeaderValue(req.headers.get("x-forwarded-proto"));
    const hostHeader = firstHeaderValue(req.headers.get("host"));
    const allowedHosts = new Set(
        [requestUrl.host, forwardedHost, hostHeader].filter(Boolean),
    );
    const allowedProtocols = new Set(
        [
            requestUrl.protocol.replace(":", ""),
            forwardedProto,
            origin.protocol.replace(":", ""),
        ].filter(Boolean),
    );

    if (!allowedHosts.has(origin.host)) {
        return NextResponse.json(
            { error: "forbidden" },
            { status: 403 },
        );
    }

    if (!allowedProtocols.has(origin.protocol.replace(":", ""))) {
        return NextResponse.json(
            { error: "forbidden" },
            { status: 403 },
        );
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
        key: `${args.scope}:ip:${args.ip}`,
        limit: args.ipLimit,
        windowMs: args.windowMs,
    });

    const identifierResult = consumeRateLimit({
        key: `${args.scope}:identifier:${args.identifier}`,
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
