import { GET as handleGET } from "@/features/public/shops/server/placesSearchRoute";
import { withRequestObservability } from "@/lib/observability";

export const GET = withRequestObservability("/api/places/search", handleGET);
