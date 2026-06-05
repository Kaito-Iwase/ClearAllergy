"use client";

import { useEffect } from "react";

export default function AdminGoogleSsoAuditBeacon() {
    useEffect(() => {
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
    }, []);

    return null;
}
