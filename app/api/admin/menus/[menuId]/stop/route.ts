import { STOP } from "@/features/admin/menus/server/adminMenuRoute";
import { withRequestObservability } from "@/lib/observability";

export const POST = withRequestObservability("/api/admin/menus/[menuId]/stop", STOP);
