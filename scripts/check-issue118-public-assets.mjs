// Inspect public client code only. Never execute it, follow redirects, or start Clerk.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { assertRedirectDiagnosticEnvironment } from './check-issue118-preview-redirect.mjs';
import { assertOidcClaims, oidcRequestUrl } from './issue118-ci-auth.mjs';
import { assertIdentityReceipt, target } from './check-issue118-live-t1-browser.mjs';

export const assetMode = 'PUBLIC_ASSETS_ONLY';
const maxAssets = 48, maxTotalBytes = 16 * 1024 * 1024;
const held = () => { throw Error('PUBLIC_ASSETS_HELD'); };
export function assertPublicAssetPath(path) {
    if (typeof path !== 'string' || path.length > 240 ||
        !/^\/_next\/static\/chunks\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.js$/.test(path) ||
        path.split('/').some(p => p === '.' || p === '..')) held();
    return path;
}
export function inspectPublicCode(text, html = false) {
    const paths = new Set(), actions = new Set(), telemetry = new Map();
    // Quoted static chunk paths only, including Turbopack's public dependency strings.
    for (const match of text.matchAll(/["']((?:\/_next\/)?static\/chunks\/[A-Za-z0-9_./-]+\.js)["']/g)) {
        const path = match[1].startsWith('/') ? match[1] : '/_next/' + match[1];
        try { paths.add(assertPublicAssetPath(path)); } catch { held(); }
    }
    if (!html) {
        // Existing locked TypeScript parser, never eval/import the inspected bundle.
        // Comments, string contents and HTML cannot become confirmed factory calls.
        const ts = createRequire(import.meta.url)('typescript');
        const ast = ts.createSourceFile('public-client.js', text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
        if (ast.parseDiagnostics.length) held();
        const unwrap = node => {
            while (ts.isParenthesizedExpression(node) || (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.CommaToken))
                node = ts.isParenthesizedExpression(node) ? node.expression : node.right;
            return node;
        };
        const visit = node => {
            if (ts.isCallExpression(node)) {
                const callee = unwrap(node.expression), args = node.arguments;
                const namedFactory = (ts.isPropertyAccessExpression(callee) && callee.name.text === 'createServerReference') ||
                    (ts.isIdentifier(callee) && callee.text === 'createServerReference');
                if (namedFactory && args.length === 5 && ts.isStringLiteral(args[0]) && /^[a-f0-9]{42}$/.test(args[0].text) &&
                    ts.isStringLiteral(args[4]) && args[4].text === 'invalidateCacheAction') actions.add(args[0].text);
            }
            if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
                ['scriptSrc','viewEndpoint','eventEndpoint'].includes(node.name.text) && ts.isStringLiteral(node.initializer)) {
                const field = node.name.text, path = node.initializer.text;
                if (path.length <= 180 && /^\/[A-Za-z0-9_/-]+(?:\.js)?$/.test(path) && !path.split('/').includes('..'))
                    telemetry.set(field + ':' + path, { field, path });
            }
            ts.forEachChild(node, visit);
        };
        visit(ast);
    }
    return { paths: [...paths], actionReferences: [...actions], telemetryBindings: [...telemetry.values()],
        namedActionMarkerPresent: text.includes('invalidateCacheAction'),
        legacyTelemetryScriptLiteral: text.includes('/_vercel/insights/script.js'),
        legacyTelemetryViewLiteral: text.includes('/_vercel/insights/view'),
        legacyTelemetryEventLiteral: text.includes('/_vercel/insights/event'), html };
}
async function readLimited(response, limit) {
    const reader = response.body?.getReader(); if (!reader) held();
    const parts = []; let size = 0;
    try {
        for (;;) { const { value, done } = await reader.read(); if (done) break;
            size += value.byteLength; if (size > limit) held(); parts.push(value); }
    } catch { try { await reader.cancel(); } catch { /* fixed failure only */ } held(); }
    return { bytes: size, text: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts)) };
}
export async function inspectDeploymentAssets(env, receipt, fetcher = fetch) {
    const result = { stage: 'CONTEXT', code: 'PUBLIC_ASSETS_INCOMPLETE', completed: false,
        deployment: target.deployment, source: target.source, origin: target.origin,
        oidcRequestSent: false, appGetCount: 0, redirectFollowed: false,
        clerkStarted: false, sessionStarted: false, browserStarted: false, fixtureWriteStarted: false,
        responseBodiesRetained: false, publicAssets: [], actionReferences: [], telemetryBindings: [] };
    try {
        assertRedirectDiagnosticEnvironment(env, assetMode);
        result.stage = 'RECEIPT'; assertIdentityReceipt(receipt);
        result.stage = 'OIDC_TARGET'; const oidcUrl = oidcRequestUrl(env.ACTIONS_ID_TOKEN_REQUEST_URL);
        if (!env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) held();
        result.stage = 'OIDC_REQUEST'; result.oidcRequestSent = true;
        const response = await fetcher(oidcUrl, { method: 'GET', redirect: 'error',
            headers: { Authorization: `bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` }, signal: AbortSignal.timeout(20000) });
        if (!response.ok) held();
        result.stage = 'OIDC_CLAIMS'; const token = assertOidcClaims((await response.json()).value);
        const queue = ['/'], seen = new Set(); let totalBytes = 0;
        for (let i = 0; i < queue.length; i++) {
            const path = queue[i]; if (seen.has(path)) continue;
            result.stage = 'APP_TARGET'; if (path !== '/') assertPublicAssetPath(path);
            if (seen.size >= maxAssets + 1) held();
            assertIdentityReceipt(receipt); assertOidcClaims(token); seen.add(path);
            result.stage = 'APP_GET'; result.appGetCount++;
            const asset = await fetcher(target.origin + path, { method: 'GET', redirect: 'error',
                credentials: 'omit', cache: 'no-store', headers: {
                    'x-vercel-trusted-oidc-idp-token': token,
                    Accept: path === '/' ? 'text/html' : 'application/javascript',
                }, signal: AbortSignal.timeout(20000) });
            result.stage = 'APP_RESPONSE'; if (asset.status !== 200) held();
            const type = asset.headers.get('content-type') || '';
            if (path === '/' ? !/^text\/html(?:;|$)/i.test(type) : !/^(?:text|application)\/(?:javascript|x-javascript)(?:;|$)/i.test(type)) held();
            result.stage = 'APP_BODY';
            const remainingBytes = maxTotalBytes - totalBytes; if (remainingBytes <= 0) held();
            const body = await readLimited(asset, Math.min(remainingBytes, path === '/' ? 1024 * 1024 : 2 * 1024 * 1024));
            totalBytes += body.bytes; if (totalBytes > maxTotalBytes) held();
            const observation = inspectPublicCode(body.text, path === '/');
            result.publicAssets.push({ path, bytes: body.bytes, sha256: createHash('sha256').update(body.text).digest('hex'),
                namedActionMarkerPresent: observation.namedActionMarkerPresent,
                legacyTelemetryScriptLiteral: observation.legacyTelemetryScriptLiteral,
                legacyTelemetryViewLiteral: observation.legacyTelemetryViewLiteral,
                legacyTelemetryEventLiteral: observation.legacyTelemetryEventLiteral });
            for (const reference of observation.actionReferences) result.actionReferences.push({ path, reference, export: 'invalidateCacheAction' });
            for (const binding of observation.telemetryBindings) result.telemetryBindings.push({ assetPath: path, ...binding });
            for (const dependency of observation.paths) if (!seen.has(dependency) && !queue.includes(dependency)) queue.push(dependency);
            if (queue.length > maxAssets + 1) held();
        }
        result.stage = 'STOP_PUBLIC_ASSETS_ONLY'; result.completed = true;
        result.code = result.actionReferences.length ? 'PUBLIC_ACTION_REFERENCE_OBSERVED' : 'PUBLIC_REACHABLE_ASSETS_INSPECTED_ACTION_UNOBSERVED';
    } catch { result.code = result.stage + '_HELD'; }
    return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        if (process.argv.slice(2).join(' ') !== '--public-assets-only' || !process.env.RUNNER_TEMP ||
            !process.env.CLEARALLERGY_ISSUE118_IDENTITY_RECEIPT) held();
        const receipt = JSON.parse(readFileSync(process.env.CLEARALLERGY_ISSUE118_IDENTITY_RECEIPT, 'utf8'));
        const result = await inspectDeploymentAssets(process.env, receipt);
        const directory = join(process.env.RUNNER_TEMP, 'issue118-public-assets'); mkdirSync(directory, { recursive: false });
        writeFileSync(join(directory, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
        console.log(JSON.stringify(result)); if (!result.completed) process.exitCode = 1;
    } catch { console.error('PUBLIC_ASSETS_REFUSED_NO_RAW_ERROR'); process.exitCode = 1; }
}
