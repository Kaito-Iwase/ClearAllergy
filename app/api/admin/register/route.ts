import { POST as handlePOST } from "@/features/admin/auth/server/adminRegisterRoute";
import { withRequestObservability } from "@/lib/observability";

export const POST = withRequestObservability("/api/admin/register", handlePOST);
