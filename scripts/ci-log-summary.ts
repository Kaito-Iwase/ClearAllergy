// Artifact output contains fixed category names and counts only. Never include
// raw log lines, error messages, request paths, stack traces, IDs or environment.
const categories = {
    serverReady: /(?:Ready in |"event":"server_ready")/i,
    databaseUnavailable: /(?:P1001|P1002|P1008|P1017|database_unavailable|db_unavailable)/i,
    databaseAuthentication: /(?:P1000|P1010)/,
    databaseSchema: /(?:P2021|P2022)/,
    uniqueConstraint: /P2002/,
    transactionConflict: /(?:P2034|55P03|40P01|40001)/,
    externalService: /"category"\s*:\s*"external_service"/,
    unhandledFailure: /(?:unhandledRejection|uncaughtException)/i,
    applicationError: /(?:\bError\b|"level"\s*:\s*"error"|"event"\s*:\s*"operation_failed")/,
};

export function summarizeCiLog(contents: string) {
    const lines = contents.split(/\r?\n/).filter(Boolean);
    return {
        formatVersion: 1,
        lineCount: lines.length,
        categories: Object.fromEntries(Object.entries(categories).map(([name, pattern]) => [name, lines.filter((line) => pattern.test(line)).length])),
        rawLogIncluded: false,
    };
}
