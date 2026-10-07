import { GET as handleGET, POST as handlePOST } from "@/features/admin/invitations/server/adminInvitationsRoute";
import { withRequestObservability } from "@/lib/observability";

export const GET = withRequestObservability("/api/admin/invitations", handleGET);
export const POST = withRequestObservability("/api/admin/invitations", handlePOST);
