import { GET as handleGET } from "@/features/public/shops/server/allergensRoute";
import { withRequestObservability } from "@/lib/observability";

export const GET = withRequestObservability("/api/allergens", handleGET);
