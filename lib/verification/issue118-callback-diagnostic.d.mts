export const callbackDiagnosticHeader: string;
type Metadata = { projectId?: string; environment?: string; branch?: string; sourceSha?: string; deploymentHost?: string };
type Dependencies = {
    getSecretKey: () => string | undefined;
    decode: typeof import('@clerk/backend/jwt').decodeJwt;
    verifySignature: typeof import('@clerk/backend/jwt').hasValidSignature;
    fetch: typeof fetch;
};
export function serverCallbackDiagnostic(request: Request, metadata: Metadata, dependencies: Dependencies): Promise<Response>;
