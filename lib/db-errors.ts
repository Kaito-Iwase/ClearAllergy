import { Prisma } from "@prisma/client";

export function isDatabaseUnavailableError(error: unknown) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
        return true;
    }

    if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P1001"
    ) {
        return true;
    }

    return (
        error instanceof Error &&
        error.message.includes("Can't reach database server")
    );
}

type DatabaseUrlSummary = {
    present: boolean;
    parseable: boolean;
    scheme: string | null;
    host: string | null;
    port: number | null;
    database: string | null;
    queryKeys: string[];
    usesPoolerHost: boolean | null;
};

type DatabaseUnavailableLogContext = {
    scope: string;
    operation?: string;
    visibility?: "public" | "admin" | "internal";
    details?: Record<string, unknown>;
};

function normalizeEnvValue(value: string | undefined) {
    const trimmed = value?.trim();
    if (!trimmed) {
        return null;
    }

    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1);
    }

    return trimmed;
}

function summarizeDatabaseUrl(value: string | undefined): DatabaseUrlSummary {
    const normalized = normalizeEnvValue(value);

    if (!normalized) {
        return {
            present: false,
            parseable: false,
            scheme: null,
            host: null,
            port: null,
            database: null,
            queryKeys: [],
            usesPoolerHost: null,
        };
    }

    try {
        const parsed = new URL(normalized);

        return {
            present: true,
            parseable: true,
            scheme: parsed.protocol.replace(/:$/, ""),
            host: parsed.hostname || null,
            port:
                parsed.port === ""
                    ? parsed.protocol === "postgresql:"
                        ? 5432
                        : null
                    : Number(parsed.port),
            database: parsed.pathname.replace(/^\//, "") || null,
            queryKeys: [...parsed.searchParams.keys()].sort(),
            usesPoolerHost: parsed.hostname.includes("-pooler."),
        };
    } catch {
        return {
            present: true,
            parseable: false,
            scheme: null,
            host: null,
            port: null,
            database: null,
            queryKeys: [],
            usesPoolerHost: null,
        };
    }
}

export function getDatabaseConnectionDiagnostics() {
    const databaseUrl = summarizeDatabaseUrl(process.env.DATABASE_URL);
    const directUrl = summarizeDatabaseUrl(process.env.DIRECT_URL);

    return {
        nodeEnv: process.env.NODE_ENV ?? null,
        databaseUrl,
        directUrl,
        diagnosis: !databaseUrl.present
            ? "missing_database_url"
            : !databaseUrl.parseable
              ? "invalid_database_url"
              : "database_unreachable_or_network_blocked",
    } as const;
}

function getErrorSummary(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return {
            name: error.name,
            code: error.code,
            message: error.message,
        };
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
        return {
            name: error.name,
            code: "P1001",
            message: error.message,
        };
    }

    if (error instanceof Error) {
        return {
            name: error.name,
            code: null,
            message: error.message,
        };
    }

    return {
        name: "UnknownError",
        code: null,
        message: String(error),
    };
}

export function logDatabaseUnavailableError(
    context: DatabaseUnavailableLogContext,
    error: unknown,
) {
    const logger =
        context.visibility === "public" ? console.warn : console.error;

    logger("[db-unavailable]", {
        scope: context.scope,
        operation: context.operation ?? null,
        visibility: context.visibility ?? "internal",
        ...getErrorSummary(error),
        ...getDatabaseConnectionDiagnostics(),
        details: context.details ?? {},
    });
}
