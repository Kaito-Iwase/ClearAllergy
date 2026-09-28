import { GET as handleGET } from "@/features/public/shops/server/publicMenuRoute";
import { withRequestObservability } from "@/lib/observability";

export const GET = withRequestObservability("/api/menus/[menuId]", handleGET);
