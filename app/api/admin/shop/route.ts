import { GET as handleGET, PUT as handlePUT } from "@/features/admin/shop/server/adminShopRoute";
import { withRequestObservability } from "@/lib/observability";

export const GET = withRequestObservability("/api/admin/shop", handleGET);
export const PUT = withRequestObservability("/api/admin/shop", handlePUT);
