// TEST ONLY: Clerk identity boundary double; no Clerk session is authenticated.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { LOCAL_ACTOR_COOKIE, requireLocalFixture, requireLocalRequest } from "./fixture";

type ClerkServer = typeof import("@clerk/nextjs/server");

function unsupported(): never {
    throw Error("Real Clerk authentication is unsupported in the local E2E boundary double.");
}

async function actor() {
    const fixture = requireLocalFixture();
    const values = (await cookies()).getAll(LOCAL_ACTOR_COOKIE);
    if (values.length !== 1) return null;
    return Object.values(fixture.accounts).find(account => account.cookie === values[0].value) ?? null;
}

const fixtureAuth = async () => ({
    userId: (await actor())?.clerkUserId ?? null,
    sessionId: null,
    sessionClaims: null,
    isAuthenticated: false,
    getToken: async () => unsupported(),
    has: () => false,
    redirectToSignIn: unsupported,
    redirectToSignUp: unsupported,
});
export const auth = Object.assign(fixtureAuth, { protect: unsupported }) as unknown as ClerkServer["auth"];

export const currentUser = (async () => {
    const identity = await actor();
    if (!identity) return null;
    const fixture = requireLocalFixture();
    const role = identity.clerkUserId === fixture.accounts.a.clerkUserId ? "a" : "b";
    const emailId = `e2e_${role}`;
    return {
        id: identity.clerkUserId,
        externalId: null,
        publicMetadata: {},
        privateMetadata: {},
        primaryEmailAddressId: emailId,
        emailAddresses: [{ id: emailId, emailAddress: `e2e-${fixture.runId}-${role}@example.invalid` }],
    };
}) as unknown as ClerkServer["currentUser"];

export const clerkMiddleware = ((...options: unknown[]) => {
    requireLocalFixture();
    if (options.some(value => value !== undefined)) unsupported();
    return (request: NextRequest) => {
        const fixture = requireLocalFixture();
        requireLocalRequest(request.url, fixture, request.headers.get("host"));
        return NextResponse.next();
    };
}) as unknown as ClerkServer["clerkMiddleware"];
