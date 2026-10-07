import { DELETE as handleDELETE, GET as handleGET, PUT as handlePUT } from "@/features/admin/menus/server/adminMenuRoute";
import { withRequestObservability } from "@/lib/observability";

export const DELETE = withRequestObservability("/api/admin/menus/[menuId]", handleDELETE);
export const GET = withRequestObservability("/api/admin/menus/[menuId]", handleGET);
export const PUT = withRequestObservability("/api/admin/menus/[menuId]", handlePUT);
