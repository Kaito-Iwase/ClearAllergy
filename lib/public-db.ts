import {
    isDatabaseUnavailableError,
    logDatabaseUnavailableError,
} from "@/lib/db-errors";

type PublicQueryResult<T> = {
    data: T;
    isDatabaseAvailable: boolean;
};

export async function readPublicDataOrFallback<T>(
    loader: () => Promise<T>,
    fallback: T,
    options?: {
        context?: string;
    },
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

        logDatabaseUnavailableError(
            {
                scope: "public-db-fallback",
                operation: options?.context ?? "readPublicDataOrFallback",
                visibility: "public",
            },
            error,
        );

        return {
            data: fallback,
            isDatabaseAvailable: false,
        };
    }
}
