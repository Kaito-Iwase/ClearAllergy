import { POST as handlePOST } from "@/features/admin/auth/server/adminSsoRoute";
import { withRequestObservability } from "@/lib/observability";

export const POST = withRequestObservability("/api/admin/auth/sso", handlePOST);
