import { GET as handleGET } from "@/features/admin/shop/server/adminPlacesSearchRoute";
import { withRequestObservability } from "@/lib/observability";

export const GET = withRequestObservability("/api/admin/places/search", handleGET);
