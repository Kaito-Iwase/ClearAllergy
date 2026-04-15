export function extractClerkErrorMessage(
    error: unknown,
    fallbackMessage: string,
): string {
    if (
        typeof error === "object" &&
        error !== null &&
        "errors" in error &&
        Array.isArray(error.errors) &&
        error.errors.length > 0
    ) {
        const firstError = error.errors[0];

        if (
            typeof firstError === "object" &&
            firstError !== null &&
            "longMessage" in firstError &&
            typeof firstError.longMessage === "string" &&
            firstError.longMessage.trim()
        ) {
            return firstError.longMessage;
        }

        if (
            typeof firstError === "object" &&
            firstError !== null &&
            "message" in firstError &&
            typeof firstError.message === "string" &&
            firstError.message.trim()
        ) {
            return firstError.message;
        }
    }

    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }

    return fallbackMessage;
}
