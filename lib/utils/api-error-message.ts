type ErrorPayloadLike = {
    error?: unknown;
    message?: unknown;
};

function pickErrorMessage(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") {
        return null;
    }

    const { error, message } = payload as ErrorPayloadLike;

    if (typeof error === "string" && error.trim() !== "") {
        return error.trim();
    }

    if (typeof message === "string" && message.trim() !== "") {
        return message.trim();
    }

    return null;
}

function isMachineReadableText(text: string): boolean {
    return (
        text.startsWith("{") ||
        text.startsWith("[") ||
        text.startsWith("<!DOCTYPE") ||
        text.startsWith("<html")
    );
}

export async function getApiErrorMessage(
    response: Response,
    fallbackMessage: string,
): Promise<string> {
    const rawText = await response.text().catch(() => "");
    const trimmed = rawText.trim();

    if (trimmed === "") {
        return fallbackMessage;
    }

    try {
        return pickErrorMessage(JSON.parse(trimmed)) ?? fallbackMessage;
    } catch {
        return isMachineReadableText(trimmed) ? fallbackMessage : trimmed;
    }
}

export function getThrownErrorMessage(
    error: unknown,
    fallbackMessage: string,
): string {
    if (error instanceof Error && error.message.trim() !== "") {
        return error.message;
    }

    if (typeof error === "string" && error.trim() !== "") {
        return error.trim();
    }

    return fallbackMessage;
}
