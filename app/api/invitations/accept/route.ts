import { POST as handlePOST } from "@/features/admin/invitations/server/acceptInvitationRoute";
import { withRequestObservability } from "@/lib/observability";

export const POST = withRequestObservability("/api/invitations/accept", handlePOST);
