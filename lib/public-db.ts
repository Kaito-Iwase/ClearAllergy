import { isDatabaseUnavailableError } from "@/lib/db-errors";

type PublicQueryResult<T> = {
    data: T;
    isDatabaseAvailable: boolean;
};

export async function readPublicDataOrFallback<T>(
    loader: () => Promise<T>,
    fallback: T,
): Promise<PublicQueryResult<T>> {
    try {
        return {
            data: await loader(),
            isDatabaseAvailable: true,
        };
    } catch (error) {
        if (!isDatabaseUnavailableError(error)) {
            throw error;
        }

        console.warn(
            "Public page fallback: database is unavailable, returning safe fallback.",
        );

        return {
            data: fallback,
            isDatabaseAvailable: false,
        };
    }
}
