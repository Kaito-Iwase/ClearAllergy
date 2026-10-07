import { POST as handlePOST } from "@/features/admin/auth/server/adminLoginRoute";
import { withRequestObservability } from "@/lib/observability";

export const POST = withRequestObservability("/api/admin/auth/login", handlePOST);
