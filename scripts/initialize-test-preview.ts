import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { assertApprovedTestPreviewOwners, assertTestPreviewDatabaseTarget, initializeTestPreviewDatabase,
    parseTestPreviewInitializationArgs, readTestPreviewMigrations } from "./test-preview-initialization";

const PHASES = ["ARGS", "DB_TARGET", "OWNER_ARGS", "OWNERS", "MIGRATION_FILES", "PRISMA_LOAD", "DB_CONNECT",
    "DB_PREFLIGHT", "MIGRATE", "MIGRATION_VERIFY", "FIXTURES", "DB_DISCONNECT", "DONE"] as const;
const ERROR_CODES = new Set(["P1000", "P1001", "P1002", "P1003", "P1008", "P1009", "P1010", "P1011", "P1012", "P1013",
    "P1014", "P1015", "P1016", "P1017", "P2002", "P2003", "P2010", "P2024", "P2028", "ENOENT", "EACCES", "EPERM",
    "ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND"]);
const PROVIDER_CODES = new Set(["28000", "28P01", "3D000", "3F000", "42P01", "42501", "42703", "53300", "57P03"]);
const SIGNALS = new Set(["SIGTERM", "SIGKILL", "SIGINT", "SIGABRT", "SIGSEGV", "SIGHUP", "SIGQUIT", "SIGPIPE",
    "SIGILL", "SIGBUS", "SIGFPE", "SIGTRAP", "SIGSYS", "SIGXCPU", "SIGXFSZ"]);

// Read data fields only. Getters, string coercion, message/stack, nested causes,
// stdout/stderr and arbitrary object serialization are deliberately excluded.
function dataField(value: unknown, key: string): unknown {
    try {
        return value !== null && (typeof value === "object" || typeof value === "function")
            ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
    } catch { return undefined; }
}
function allowed(value: unknown, codes: Set<string>): string | null {
    return typeof value === "string" && codes.has(value) ? value : null;
}
function errorFields(error: unknown) {
    return {
        error_code: allowed(dataField(error, "code"), ERROR_CODES) ?? allowed(dataField(error, "errorCode"), ERROR_CODES) ?? "UNCLASSIFIED",
        provider_code: allowed(dataField(dataField(error, "meta"), "code"), PROVIDER_CODES),
    };
}

export function createTestPreviewDiagnostics(write: (line: string) => void) {
    let currentPhase = "ARGS";
    let firstFailure: { phase: string; error_code: string; provider_code: string | null } | undefined;
    let migration: { exit_code: number | null; signal: string | null; timed_out: boolean; error_code: string | null } | undefined;
    const phaseCode = (value: unknown) => typeof value === "string" && PHASES.includes(value as typeof PHASES[number]) ? value : "UNKNOWN_PHASE";
    const emit = (record: object) => { try { write(JSON.stringify(record)); } catch { /* Reporting must not change execution. */ } };
    return {
        phase(value: unknown) {
            currentPhase = phaseCode(value);
            emit({ event: "INIT_PHASE", phase: currentPhase });
        },
        failure(value: unknown, error: unknown) {
            const failure = { phase: phaseCode(value), ...errorFields(error) };
            firstFailure ??= failure;
            emit({ event: "INIT_ERROR", ...failure });
        },
        migrationResult(result: unknown) {
            const status = dataField(result, "status");
            const signal = dataField(result, "signal");
            const error = dataField(result, "error");
            const code = allowed(dataField(error, "code"), ERROR_CODES);
            migration = {
                exit_code: typeof status === "number" && Number.isInteger(status) && status >= 0 && status <= 255 ? status : null,
                signal: signal == null ? null : allowed(signal, SIGNALS) ?? "UNKNOWN_SIGNAL",
                timed_out: code === "ETIMEDOUT",
                error_code: error == null ? null : code ?? "UNCLASSIFIED",
            };
            emit({ event: "MIGRATION_RESULT", phase: "MIGRATE", ...migration });
        },
        stop(error: unknown) {
            emit({ event: "CLI_STOP", ...(firstFailure ?? { phase: currentPhase, ...errorFields(error) }), ...(migration ? { migration } : {}) });
        },
        done() { emit({ event: "CLI_DONE", phase: "DONE" }); },
    };
}

const diagnostics = createTestPreviewDiagnostics(line => console.error(line));

async function main() {
    diagnostics.phase("ARGS");
    const owners = parseTestPreviewInitializationArgs(process.argv.slice(2));
    diagnostics.phase("DB_TARGET");
    assertTestPreviewDatabaseTarget();
    diagnostics.phase("OWNERS");
    assertApprovedTestPreviewOwners(owners); // reject unapproved IDs before Prisma load or any connection
    diagnostics.phase("MIGRATION_FILES");
    const migrations = readTestPreviewMigrations();
    diagnostics.phase("PRISMA_LOAD");
    const { PrismaClient } = await import("@prisma/client");
    await initializeTestPreviewDatabase(owners, {
        onDiagnostic: event => event.type === "PHASE" ? diagnostics.phase(event.phase) : diagnostics.failure(event.phase, event.error),
        verifyOwners: assertApprovedTestPreviewOwners,
        connect: () => new PrismaClient(),
        migrations,
        migrate: () => {
            const env: NodeJS.ProcessEnv = { NODE_ENV: "test" };
            for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "DATABASE_URL", "DIRECT_URL"]) {
                if (process.env[key] !== undefined) env[key] = process.env[key];
            }
            const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "prisma/schema.prisma"],
                { cwd: fileURLToPath(new URL("../", import.meta.url)), env, encoding: "utf8", stdio: "pipe", windowsHide: true, timeout: 120_000 });
            diagnostics.migrationResult(result);
            // Do not print Prisma output: connection strings or internal details may occur in errors.
            if (result.error || result.status !== 0) throw new Error("Migration failed. Inspect the dedicated database read-only; do not retry automatically.");
        },
    });
    diagnostics.done();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main().catch(error => { diagnostics.stop(error); process.exitCode = 1; });
}
