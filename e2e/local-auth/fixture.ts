// TEST ONLY: never alias this module into the product app or a shared deployment.
import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertCiDatabaseTarget } from "../../scripts/ci-environment";
import { assertLocalRequestOrigin, fixtureServerIdentity } from "../environment.mjs";

export const LOCAL_AUTH_MODE = "clerk-boundary-double" as const;
export const LOCAL_ACTOR_COOKIE = "__clearallergy_e2e_actor";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cuid = /^c[a-z0-9]{24}$/;

export type LocalActor = { clerkUserId: string; shopId: string; cookie: string };
export type LocalFixture = {
    mode: typeof LOCAL_AUTH_MODE;
    runId: string;
    baseURL: string;
    database: { name: string; user: string; host: string; port: number };
    accounts: { a: LocalActor; b: LocalActor };
    serverIdentity: { name: string; user: string; host: string; port: number };
};

function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
    return value as Record<string, unknown>;
}

// Re-read on every boundary: a removed or changed manifest must fail closed.
// Errors deliberately contain neither environment values nor manifest fragments.
export function requireLocalFixture(): LocalFixture {
    try {
        assertCiDatabaseTarget();
        const runId = process.env.E2E_LOCAL_RUN_ID;
        const stateFile = process.env.E2E_LOCAL_STATE_FILE;
        const configuredBaseURL = process.env.E2E_BASE_URL;
        if (!runId || !uuid.test(runId) || !stateFile || !configuredBaseURL) throw Error();
        const file = resolve(stateFile);
        const metadata = lstatSync(file);
        if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 64 * 1024) throw Error();
        const state = object(JSON.parse(readFileSync(file, "utf8")));
        if (state.mode !== LOCAL_AUTH_MODE || state.runId !== runId || state.baseURL !== configuredBaseURL) throw Error();
        const base = new URL(configuredBaseURL);
        if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || !base.port ||
            base.username || base.password || base.origin !== configuredBaseURL) throw Error();

        const database = object(state.database);
        if (database.name !== "clearallergy_ci" || database.user !== "clearallergy_ci" ||
            database.host !== "127.0.0.1" || typeof database.port !== "number" ||
            !Number.isInteger(database.port) || database.port < 1024 || database.port > 65535 ||
            database.port === Number(base.port)) throw Error();
        for (const name of ["DATABASE_URL", "DIRECT_URL"] as const) {
            const url = new URL(process.env[name]!);
            if (url.protocol !== "postgresql:" || url.hostname !== database.host ||
                Number(url.port) !== database.port || url.pathname !== "/" + database.name ||
                decodeURIComponent(url.username) !== database.user) throw Error();
        }

        const accounts = object(state.accounts);
        const validated: LocalActor[] = [];
        for (const role of ["a", "b"] as const) {
            const account = object(accounts[role]);
            if (account.clerkUserId !== `e2e_local_${runId}_${role}` ||
                typeof account.shopId !== "string" || !cuid.test(account.shopId) ||
                typeof account.cookie !== "string" || !uuid.test(account.cookie) || account.cookie === runId) throw Error();
            validated.push({ clerkUserId: account.clerkUserId, shopId: account.shopId, cookie: account.cookie });
        }
        const [a, b] = validated;
        if (a.shopId === b.shopId || a.cookie === b.cookie || a.clerkUserId === b.clerkUserId) throw Error();
        const receiptPath = file + ".receipt.json";
        const receiptMeta = lstatSync(receiptPath);
        if (!receiptMeta.isFile() || receiptMeta.isSymbolicLink() || receiptMeta.size > 1024 * 1024) throw Error();
        const receipt = object(JSON.parse(readFileSync(receiptPath, "utf8")));
        if (receipt.runId !== runId) throw Error();
        const serverIdentity = fixtureServerIdentity(receipt.serverIdentity,
            { name: "clearallergy_ci", user: "clearallergy_ci" });
        return {
            mode: LOCAL_AUTH_MODE, runId, baseURL: configuredBaseURL,
            database: { name: "clearallergy_ci", user: "clearallergy_ci", host: "127.0.0.1", port: database.port },
            accounts: { a, b },
            serverIdentity,
        };
    } catch {
        throw Error("Local E2E fixture guard refused the run, manifest, or database target.");
    }
}

export function requireLocalRequest(url: string, fixture: LocalFixture, requestHost: string | null): void {
    assertLocalRequestOrigin(url, fixture.baseURL, requestHost);
}
