"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

export default function AdminGoogleSsoAuditBeacon() {
    const { isLoaded, isSignedIn, sessionId } = useAuth();
    useEffect(() => {
        if (!isLoaded || !isSignedIn || !sessionId) return;
        void fetch("/api/admin/auth/sso", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                provider: "google",
                stage: "success",
            }),
            keepalive: true,
        }).catch(() => null);
    }, [isLoaded, isSignedIn, sessionId]);

    return null;
}
