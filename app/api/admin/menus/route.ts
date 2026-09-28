import { GET as handleGET, POST as handlePOST } from "@/features/admin/menus/server/adminMenusRoute";
import { withRequestObservability } from "@/lib/observability";

export const GET = withRequestObservability("/api/admin/menus", handleGET);
export const POST = withRequestObservability("/api/admin/menus", handlePOST);
