import { POST as handlePOST } from "@/features/admin/invitations/server/revokeInvitationRoute";
import { withRequestObservability } from "@/lib/observability";

export const POST = withRequestObservability("/api/admin/invitations/[inviteId]/revoke", handlePOST);
