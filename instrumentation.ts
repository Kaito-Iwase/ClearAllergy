import type { Instrumentation } from "next";

// Next.jsが捕捉したServer Component等の想定外例外。要求本文/headersは収集しない。
export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { logOperationalError } = await import("./lib/observability");
        logOperationalError(error, { operation: `next:${context.routeType}:${context.routePath}` });
    }
};
