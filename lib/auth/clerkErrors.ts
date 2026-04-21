function translateClerkErrorMessage(message: string) {
    const normalized = message.trim();
    const lower = normalized.toLowerCase();

    if (
        lower.includes("password has been found in an online data breach") ||
        lower.includes("data breach")
    ) {
        return "このパスワードは過去の情報漏えいで確認されています。安全のため、別のパスワードを使用してください。";
    }

    if (
        lower.includes("password is too weak") ||
        lower.includes("password has been pwned")
    ) {
        return "このパスワードは安全性が低すぎます。より推測されにくいパスワードを使用してください。";
    }

    if (lower.includes("password must be")) {
        return "パスワードの条件を満たしていません。8文字以上で、推測されにくい文字列を入力してください。";
    }

    if (
        lower.includes("invalid ticket") ||
        lower.includes("ticket is invalid") ||
        lower.includes("ticket has expired") ||
        lower.includes("invitation has expired")
    ) {
        return "招待リンクが無効または期限切れです。運営から届いた最新の招待メールを開いてください。";
    }

    if (
        lower.includes("pending invitations") ||
        lower.includes("already pending invitations")
    ) {
        return "このメールアドレスには未承認の招待がすでにあります。再送する場合は、既存の招待行の「再送」ボタンを使ってください。";
    }

    if (
        lower.includes("already exists") ||
        lower.includes("identifier is taken")
    ) {
        return "このメールアドレスはすでに登録されています。ログイン画面から続行してください。";
    }

    return normalized;
}

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
            return translateClerkErrorMessage(firstError.longMessage);
        }

        if (
            typeof firstError === "object" &&
            firstError !== null &&
            "message" in firstError &&
            typeof firstError.message === "string" &&
            firstError.message.trim()
        ) {
            return translateClerkErrorMessage(firstError.message);
        }
    }

    if (error instanceof Error && error.message.trim()) {
        return translateClerkErrorMessage(error.message);
    }

    return fallbackMessage;
}
