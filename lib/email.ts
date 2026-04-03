const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
    return EMAIL_PATTERN.test(value);
}
