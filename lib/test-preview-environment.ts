export function isTestPreviewEnvironment(env: Record<string, string | undefined> = process.env) {
    return env.CLEARALLERGY_TEST_PREVIEW === "true" && env.VERCEL === "1"
        && env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "test/staging";
}
