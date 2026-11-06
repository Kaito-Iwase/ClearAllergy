"use client";
// TEST ONLY: no Clerk SDK, session, beacon, credential or provider request.
import React, { type ReactNode } from "react";

type ClerkClient = typeof import("@clerk/nextjs");

function unsupported(): never {
    throw Error("Real Clerk authentication is unsupported in the local E2E boundary double.");
}

function FixtureProvider({ children }: { children?: ReactNode }) {
    return <>{children}</>;
}
export const ClerkProvider = FixtureProvider as unknown as ClerkClient["ClerkProvider"];
export const SignOutButton = unsupported as unknown as ClerkClient["SignOutButton"];
export const useSignIn: ClerkClient["useSignIn"] = () => unsupported();
export const useSignUp: ClerkClient["useSignUp"] = () => unsupported();

// Deliberately anonymous on the client. In particular, the application's SSO
// beacon sees no signed-in session and cannot turn this double into audit proof.
export const useAuth = (() => ({
    isLoaded: true, isSignedIn: false, userId: null, sessionId: null, sessionClaims: null,
    orgId: null, orgRole: null, orgSlug: null, getToken: async () => unsupported(),
    signOut: async () => unsupported(), has: () => false,
})) as unknown as ClerkClient["useAuth"];
export const useUser = (() => ({ isLoaded: true, isSignedIn: false, user: null })) as unknown as ClerkClient["useUser"];
export const useSession = (() => ({ isLoaded: true, isSignedIn: false, session: null })) as unknown as ClerkClient["useSession"];
export const useClerk = (() => ({
    loaded: true, user: null, session: null, client: null,
    signOut: async () => unsupported(), setActive: async () => unsupported(),
    openSignIn: unsupported, openSignUp: unsupported,
    redirectToSignIn: unsupported, redirectToSignUp: unsupported,
})) as unknown as ClerkClient["useClerk"];

function UnsupportedRedirectCallback() {
    // Rendering during a static build is inert. Visiting the callback is an
    // unsupported authentication operation, not a simulated successful login.
    React.useEffect(() => { unsupported(); }, []);
    return null;
}
export const AuthenticateWithRedirectCallback = UnsupportedRedirectCallback as unknown as ClerkClient["AuthenticateWithRedirectCallback"];
