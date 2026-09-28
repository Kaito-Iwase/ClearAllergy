import { POST as handlePOST } from "@/features/admin/invitations/server/resendInvitationRoute";
import { withRequestObservability } from "@/lib/observability";

export const POST = withRequestObservability("/api/admin/invitations/[inviteId]/resend", handlePOST);
