import { POST as handlePOST } from "@/features/admin/auth/server/adminOnboardingRoute";
import { withRequestObservability } from "@/lib/observability";

export const POST = withRequestObservability("/api/admin/onboarding", handlePOST);
