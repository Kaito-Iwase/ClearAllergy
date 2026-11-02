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
function htmlAssetSources(text) {
    const sources = []; let cursor = 0;
    const decode = value => value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_, entity) => {
        if (entity[0] !== '#') return ({ amp:'&',quot:'"',apos:"'",lt:'<',gt:'>' })[entity.toLowerCase()];
        const point = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2),16) : Number(entity.slice(1));
        if (!Number.isInteger(point) || point < 1 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) held();
        return String.fromCodePoint(point);
    });
    while (cursor < text.length) {
        const open = text.indexOf('<',cursor); if (open < 0) break; cursor = open + 1;
        if (text.startsWith('!--',cursor)) { const end = text.indexOf('-->',cursor+3); if (end < 0) held(); cursor=end+3; continue; }
        const tag = /^[A-Za-z][A-Za-z0-9:-]*/.exec(text.slice(cursor));
        if (!tag) continue;
        const name = tag[0].toLowerCase(), attrs = new Map(); cursor += tag[0].length;
        let closed=false,selfClosing=false,duplicate=false;
        while (cursor < text.length) {
            const space = /^\s*/.exec(text.slice(cursor))[0]; cursor+=space.length;
            if (text[cursor] === '>') { cursor++;closed=true;break; }
            if (text.startsWith('/>',cursor)) { cursor+=2;closed=true;selfClosing=true;break; }
            const attr = /^[^\s="'<>/`]+/.exec(text.slice(cursor)); if (!attr) held();
            const key=attr[0].toLowerCase(); cursor+=attr[0].length; cursor+=/^\s*/.exec(text.slice(cursor))[0].length;
            let value='';
            if (text[cursor] === '=') {
                cursor++;cursor+=/^\s*/.exec(text.slice(cursor))[0].length;
                const quote=text[cursor];
                if (quote==='"' || quote==="'") { const end=text.indexOf(quote,cursor+1);if(end<0)held();value=text.slice(cursor+1,end);cursor=end+1; }
                else { const token=/^[^\s"'=<>`]+/.exec(text.slice(cursor));if(!token)held();value=token[0];cursor+=value.length; }
            }
            if(attrs.has(key))duplicate=true;attrs.set(key,value);
        }
        if(!closed)held();
        if(selfClosing&&['script','style','textarea','title'].includes(name))held();
        const rel=(attrs.get('rel')||'').toLowerCase().split(/\s+/);
        const selected=name==='script'&&attrs.has('src') ? 'src' : name==='link'&&attrs.has('href')&&
            (rel.includes('modulepreload')||(rel.includes('preload')&&(attrs.get('as')||'').toLowerCase()==='script')) ? 'href' : null;
        if(selected) { if(duplicate)held();const raw=attrs.get(selected);sources.push({value:decode(raw),escaped:raw.includes('&'),kind:name==='script'?'scriptSrc':'scriptPreload'}); }
        // Raw-text contents are not HTML tags and never provide asset permission.
        if(!selfClosing&&['script','style','textarea','title'].includes(name)) {
            const end=new RegExp('</'+name+'\\s*>','gi');end.lastIndex=cursor;const match=end.exec(text);if(!match)held();cursor=end.lastIndex;
        }
    }
    return sources;
}
export function inspectPublicCode(text, html = false) {
    const paths = new Set(), actions = new Set(), telemetry = new Map();
    const referenceCounts=Object.fromEntries(['scriptSrc','scriptPreload','jsLiteral','htmlEscaped','rootRelative','assetRelative','documentRelative',
        'sameOriginAbsolute','queryless','matchingDpl','duplicate','acceptedUnique','foreignOriginRefused','nonStaticRefused',
        'otherQueryRefused','unsafeReferenceRefused','htmlMalformed'].map(key=>[key,0]));
    const reference = ({value,escaped=false,kind='jsLiteral'}) => {
        referenceCounts[kind]++;if(escaped)referenceCounts.htmlEscaped++;
        if(typeof value!=='string'||value.length>1000||/[\u0000-\u0020\u007f\\%#]/.test(value)){referenceCounts.unsafeReferenceRefused++;return;}
        let path;
        if(value.startsWith(target.origin+'/')) { referenceCounts.sameOriginAbsolute++;path=value.slice(target.origin.length); }
        else if(value.startsWith('//')||/^[A-Za-z][\w+.-]*:/.test(value)) { referenceCounts.foreignOriginRefused++;return; }
        else if(value.startsWith('/_next/static/chunks/')) { referenceCounts.rootRelative++;path=value; }
        else if(value.startsWith('static/chunks/')) { referenceCounts.assetRelative++;path='/_next/'+value; }
        else if(value.startsWith('_next/static/chunks/')) { referenceCounts.documentRelative++;path='/'+value; }
        else { referenceCounts.nonStaticRefused++;return; }
        if(!path.startsWith('/_next/static/chunks/')) { referenceCounts.nonStaticRefused++;return; }
        const pieces=path.split('?');
        if(pieces.length===1)referenceCounts.queryless++;
        else if(pieces.length===2&&pieces[1]==='dpl='+target.deployment)referenceCounts.matchingDpl++;
        else { referenceCounts.otherQueryRefused++;return; }
        // The immutable origin pins the build. Only canonical query-free GET paths
        // are forwarded; the recognized matching dpl marker is not a credential.
        try { path=assertPublicAssetPath(pieces[0]); } catch { referenceCounts.unsafeReferenceRefused++;return; }
        if(paths.has(path))referenceCounts.duplicate++;paths.add(path);referenceCounts.acceptedUnique=paths.size;
    };
    if(html) { try { for(const source of htmlAssetSources(text))reference(source); } catch { referenceCounts.htmlMalformed++; } }
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
            if(ts.isStringLiteral(node)&&node.text.includes('static/chunks/')&&/\.js(?:[?#]|$)/.test(node.text))reference({value:node.text});
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
    return { paths: [...paths], actionReferences: [...actions], telemetryBindings: [...telemetry.values()],referenceCounts,
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
                referenceCounts:observation.referenceCounts,
                namedActionMarkerPresent: observation.namedActionMarkerPresent,
                legacyTelemetryScriptLiteral: observation.legacyTelemetryScriptLiteral,
                legacyTelemetryViewLiteral: observation.legacyTelemetryViewLiteral,
                legacyTelemetryEventLiteral: observation.legacyTelemetryEventLiteral });
            result.stage='APP_REFERENCES';
            if(observation.referenceCounts.otherQueryRefused||observation.referenceCounts.unsafeReferenceRefused||observation.referenceCounts.htmlMalformed)held();
            for (const reference of observation.actionReferences) result.actionReferences.push({ path, reference, export: 'invalidateCacheAction' });
            for (const binding of observation.telemetryBindings) result.telemetryBindings.push({ assetPath: path, ...binding });
            for (const dependency of observation.paths) if (!seen.has(dependency) && !queue.includes(dependency)) queue.push(dependency);
            if (queue.length > maxAssets + 1) held();
        }
        result.stage = 'STOP_PUBLIC_ASSETS_ONLY'; result.completed = true;
        result.code = result.actionReferences.length ? 'PUBLIC_ACTION_REFERENCE_OBSERVED' :
            result.publicAssets.length===1 ? 'PUBLIC_ROOT_ONLY_ACTION_UNOBSERVED' : 'PUBLIC_REACHABLE_ASSETS_INSPECTED_ACTION_UNOBSERVED';
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
