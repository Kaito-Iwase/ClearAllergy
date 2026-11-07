// TEST ONLY: copy solely to the isolated Next app's /e2e-fixture-check route.
import { NextResponse } from "next/server";
import { requireLocalFixture, requireLocalRequest, type LocalFixture } from "@/e2e/local-auth/fixture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
    let fixture: LocalFixture;
    try {
        fixture = requireLocalFixture();
    } catch {
        return NextResponse.json({ error: "Local E2E preflight refused.", stage: "fixture" }, { status: 403, headers });
    }
    try {
        requireLocalRequest(request.url, fixture, request.headers.get("host"));
        if (new URL(request.url).pathname !== "/e2e-fixture-check") throw Error();
    } catch {
        return NextResponse.json({ error: "Local E2E preflight refused.", stage: "request-origin",
            requestOrigin: new URL(request.url).origin, expectedOrigin: fixture.baseURL,
            requestHost: request.headers.get("host") }, { status: 403, headers });
    }
    try {
        // Load and query the actual application client only after the CI guard.
        const { prisma } = await import("@/lib/db");
        const rows = await prisma.$queryRaw<Array<{ name: string; user: string; host: string | null; port: number | null }>>`
            SELECT current_database() AS name, current_user AS "user",
                   host(inet_server_addr()) AS host, inet_server_port() AS port
        `;
        const database = rows[0];
        if (rows.length !== 1 || !database || database.name !== fixture.serverIdentity.name ||
            database.user !== fixture.serverIdentity.user || database.host !== fixture.serverIdentity.host ||
            database.port !== fixture.serverIdentity.port) throw Error();
        return NextResponse.json({
            mode: fixture.mode, runId: fixture.runId, baseURL: fixture.baseURL,
            database: fixture.database, serverIdentity: database,
        }, { headers });
    } catch {
        return NextResponse.json({ error: "Local E2E database identity could not be verified.", stage: "database" }, { status: 503, headers });
    }
}
