import { POST as handlePOST } from "@/features/admin/menus/server/uploadMenuImageRoute";
import { withRequestObservability } from "@/lib/observability";

export const POST = withRequestObservability("/api/admin/upload-menu-image", handlePOST);
