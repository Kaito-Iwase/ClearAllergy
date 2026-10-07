import { POST as handlePOST } from "@/features/admin/shop/server/uploadShopImageRoute";
import { withRequestObservability } from "@/lib/observability";

export const POST = withRequestObservability("/api/admin/upload-shop-image", handlePOST);
