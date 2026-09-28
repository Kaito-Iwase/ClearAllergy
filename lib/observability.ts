import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type ErrorCategory = "validation" | "authentication" | "authorization" | "not_found" | "conflict" | "rate_limit" | "database" | "external_service" | "unexpected";
type RequestContext = { requestId: string; route: string; startedAt: number; category?: ErrorCategory };
const requests = new AsyncLocalStorage<RequestContext>();

export function getRequestLogContext() {
    const context = requests.getStore();
    return context ? { requestId: context.requestId, route: context.route } : {};
}

function safeErrorCode(error: unknown) {
    if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
    const code = error.code;
    return typeof code === "string" && (/^P\d{4}$/.test(code) || ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"].includes(code)) ? code : undefined;
}

// message/stack/cause、URL、headers、入力本文を受け取っても出力しない。
export function logOperationalError(error: unknown, context: { operation: string; category?: ErrorCategory }) {
    const code = safeErrorCode(error);
    const category = context.category ?? (code?.startsWith("P") ? "database" : "unexpected");
    const request = requests.getStore();
    if (request) request.category = category;
    console.error(JSON.stringify({
        event: "operation_failed",
        operation: context.operation,
        category,
        ...(code ? { code } : {}),
        ...getRequestLogContext(),
        ...(request ? { durationMs: Math.round(performance.now() - request.startedAt) } : {}),
    }));
}

function statusCategory(status: number): ErrorCategory | undefined {
    if (status === 400 || status === 413 || status === 422) return "validation";
    if (status === 401) return "authentication";
    if (status === 403) return "authorization";
    if (status === 404) return "not_found";
    if (status === 409) return "conflict";
    if (status === 429) return "rate_limit";
    if (status >= 500) return "unexpected";
    return undefined;
}

// Honoの既定ハンドラは例外全文を出力するため、各APIの未捕捉例外にも適用する。
export function handleUnhandledApiError(error: Error) {
    logOperationalError(error, { operation: "api_unhandled" });
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
}

// routeは実URLでなく呼出元で固定したテンプレート。クエリ/実IDはログへ渡さない。
export function withRequestObservability(route: string, handler: (req: Request) => Response | Promise<Response>) {
    return (req: Request) => requests.run({ requestId: randomUUID(), route, startedAt: performance.now() }, async () => {
        const context = requests.getStore()!;
        let response: Response;
        try {
            response = await handler(req);
        } catch (error) {
            logOperationalError(error, { operation: "route_handler" });
            response = Response.json({ error: "Internal Server Error" }, { status: 500 });
        }
        const category = context.category ?? statusCategory(response.status);
        console.info(JSON.stringify({
            event: "request_completed", requestId: context.requestId, route,
            method: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(req.method) ? req.method : "OTHER",
            status: response.status, result: response.status < 400 ? "success" : "failure",
            ...(category ? { category } : {}),
            durationMs: Math.round(performance.now() - context.startedAt),
        }));
        // HeadersがimmutableなResponseもあり得るので、本文を再読込せず包む。
        const headers = new Headers(response.headers);
        headers.set("X-Request-Id", context.requestId);
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    });
}

const auditReasons = new Set([
    "invalid_input", "rate_limited", "unauthorized", "internal_error", "file_missing",
    "registration_guard_denied", "shop_already_exists", "clerk_admin_auth_disabled",
    "no_pending_invite", "session_not_verified", "client_reported_failure",
]);

// 既存の自由形式metadataから必要な状態・変更項目だけを監査DBへ保存する。
export function sanitizeAuditMetadata(value: unknown): Record<string, string | boolean | string[]> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    const input = value as Record<string, unknown>;
    const output: Record<string, string | boolean | string[]> = {};
    for (const key of ["isPublished", "hasImage", "imageUrlProvided", "wasPublished"]) {
        if (typeof input[key] === "boolean") output[key] = input[key];
    }
    if (typeof input.reason === "string" && auditReasons.has(input.reason)) output.reason = input.reason;
    if (input.provider === "google") output.provider = "google";
    if (input.source === "server_session" || input.source === "client_report") output.source = input.source;
    if (input.entrypoint === "password" || input.entrypoint === "google") output.entrypoint = input.entrypoint;
    // 呼出側はClerkの検証済みセッションから取得する。要求本文のIDは渡さない。
    if (typeof input.actorClerkUserId === "string" && /^user_[a-zA-Z0-9]{1,80}$/.test(input.actorClerkUserId)) output.actorClerkUserId = input.actorClerkUserId;
    const fields = new Set(["name", "description", "address", "prefecture", "city", "nearestStation", "category", "latitude", "longitude", "googlePlaceId", "hours", "regularHoliday", "phoneNumber", "note", "averageBudgetYen", "coverImageUrl", "coverImageFrame", "coverImageFit", "coverImagePosition", "coverImageZoom", "coverImagePositionX", "coverImagePositionY"]);
    if (Array.isArray(input.changedFields)) output.changedFields = input.changedFields.filter((field): field is string => typeof field === "string" && fields.has(field));
    return output;
}
