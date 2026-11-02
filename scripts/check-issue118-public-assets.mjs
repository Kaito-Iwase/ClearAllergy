// Inspect public client code only. Never execute it, follow redirects, or start Clerk.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { assertRedirectDiagnosticEnvironment } from './check-issue118-preview-redirect.mjs';
import { assertOidcClaims, oidcRequestUrl } from './issue118-ci-auth.mjs';
import { assertIdentityReceipt, target } from './check-issue118-live-t1-browser.mjs';
import { createInitialHandshakeCandidate } from './issue118-initial-handshake-candidate.mjs';
import { closeIsolatedBrowser } from './issue118-close-browser.mjs';

export const assetMode = 'PUBLIC_ASSETS_ONLY';
export const loginAssetMode = 'LOGIN_PUBLIC_ASSETS_ONLY';
export const sourceLockSha256 = '2efea34912a5c27d59c1675fa2cd3c6600a445ba2bd920de2a937258cb0a015c';
// Git stores LF while Windows checkouts can contain CRLF. Normalize only that
// checkout transformation; whitespace/content changes still fail the source pin.
export function sourceLockMatches(bytes) {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replace(/\r\n/g, '\n');
    return createHash('sha256').update(text).digest('hex') === sourceLockSha256;
}
const maxAssets = 48, maxTotalBytes = 16 * 1024 * 1024;
const held = () => { throw Error('PUBLIC_ASSETS_HELD'); };
export function assertPublicAssetPath(path) {
    if (typeof path !== 'string' || path.length > 240 ||
        !/^\/_next\/static\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.js$/.test(path) ||
        path.split('/').some(p => p === '.' || p === '..')) held();
    return path;
}
function htmlAssetSources(text) {
    const sources = []; let cursor = 0;
    const identity={titleCount:0,expectedTitle:false,appIcon:false,vercelTitle:false,protectionTitle:false};
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
        if(name==='link'&&duplicate)held();
        const rel=(attrs.get('rel')||'').toLowerCase().split(/\s+/);
        if(name==='link'&&rel.some(r=>['icon','shortcut','apple-touch-icon'].includes(r))&&attrs.has('href')) {
            const href=decode(attrs.get('href'));if(href==='/images/clearallergy-mark-small.svg'||href===target.origin+'/images/clearallergy-mark-small.svg')identity.appIcon=true;
        }
        const selected=name==='script'&&attrs.has('src') ? 'src' : name==='link'&&attrs.has('href')&&
            (rel.includes('modulepreload')||(rel.includes('preload')&&(attrs.get('as')||'').toLowerCase()==='script')) ? 'href' : null;
        if(selected) { if(duplicate)held();const raw=attrs.get(selected);sources.push({value:decode(raw),escaped:raw.includes('&'),kind:name==='script'?'scriptSrc':'scriptPreload'}); }
        // Raw-text contents are not HTML tags and never provide asset permission.
        if(!selfClosing&&['script','style','textarea','title'].includes(name)) {
            const end=new RegExp('</'+name+'\\s*>','gi');end.lastIndex=cursor;const match=end.exec(text);if(!match)held();
            if(name==='title') { identity.titleCount++;const title=decode(text.slice(cursor,match.index)).trim();identity.expectedTitle ||= title==='ClearAllergy';
                identity.vercelTitle ||= /vercel/i.test(title);identity.protectionTitle ||= /Authentication Required|Vercel Authentication|Log in.*Vercel/i.test(title); }
            cursor=end.lastIndex;
        }
    }
    return {sources,identity};
}
export function inspectPublicCode(text, html = false) {
    const paths = new Set(), actions = new Set(), telemetry = new Map(), candidates = new Map();
    const referenceCounts=Object.fromEntries(['scriptSrc','scriptPreload','jsLiteral','htmlEscaped','rootRelative','assetRelative','documentRelative',
        'sameOriginAbsolute','queryless','matchingDpl','duplicate','acceptedUnique','foreignOriginRefused','nonStaticRefused',
        'otherQueryRefused','unsafeReferenceRefused','htmlMalformed','dotRelative','rootNextStatic','rootNextOther','rootOther',
        'relativeOther','absoluteHttps','schemeRelative','pathHasStaticSegment','pathHasChunksSegment'].map(key=>[key,0]));
    let documentIdentity=null;
    const reference = ({value,escaped=false,kind='jsLiteral'}) => {
        referenceCounts[kind]++;if(escaped)referenceCounts.htmlEscaped++;
        if(value.startsWith('/_next/static/'))referenceCounts.rootNextStatic++;
        else if(value.startsWith('/_next/'))referenceCounts.rootNextOther++;
        else if(value.startsWith('/')&&!value.startsWith('//'))referenceCounts.rootOther++;
        if(value.startsWith('https://'))referenceCounts.absoluteHttps++;
        if(value.startsWith('//'))referenceCounts.schemeRelative++;
        if(/(?:^|\/)static\//.test(value))referenceCounts.pathHasStaticSegment++;
        if(/(?:^|\/)chunks\//.test(value))referenceCounts.pathHasChunksSegment++;
        if(typeof value!=='string'||value.length>1000||/[\u0000-\u0020\u007f\\%#]/.test(value)){referenceCounts.unsafeReferenceRefused++;return;}
        let path;
        if(value.startsWith(target.origin+'/')) { referenceCounts.sameOriginAbsolute++;path=value.slice(target.origin.length); }
        else if(value.startsWith('//')||/^[A-Za-z][\w+.-]*:/.test(value)) { referenceCounts.foreignOriginRefused++;return; }
        else if(value.startsWith('/_next/static/')) { referenceCounts.rootRelative++;path=value; }
        else if(value.startsWith('./_next/static/')) { referenceCounts.dotRelative++;path=value.slice(1); }
        else if(value.startsWith('static/')&&kind==='jsLiteral') { referenceCounts.assetRelative++;path='/_next/'+value; }
        else if(value.startsWith('_next/static/')) { referenceCounts.documentRelative++;path='/'+value; }
        else { referenceCounts.nonStaticRefused++;referenceCounts.relativeOther+=!value.startsWith('/')&&!value.includes(':')?1:0;return; }
        if(!path.startsWith('/_next/static/')) { referenceCounts.nonStaticRefused++;return; }
        const pieces=path.split('?');
        if(pieces.length===1)referenceCounts.queryless++;
        else if(pieces.length===2&&pieces[1]==='dpl='+target.deployment)referenceCounts.matchingDpl++;
        else { referenceCounts.otherQueryRefused++;return; }
        // The immutable origin pins the build. Only canonical query-free GET paths
        // are forwarded; the recognized matching dpl marker is not a credential.
        try { path=assertPublicAssetPath(pieces[0]); } catch { referenceCounts.unsafeReferenceRefused++;return; }
        if(paths.has(path))referenceCounts.duplicate++;paths.add(path);referenceCounts.acceptedUnique=paths.size;
    };
    if(html) { try { const parsed=htmlAssetSources(text);documentIdentity=parsed.identity;for(const source of parsed.sources)reference(source); } catch { referenceCounts.htmlMalformed++; } }
    if (!html) {
        // Existing locked TypeScript parser, never eval/import the inspected bundle.
        // Comments, string contents and HTML cannot become confirmed factory calls.
        const ts = createRequire(import.meta.url)('typescript');
        const ast = ts.createSourceFile('public-client.js', text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
        if (ast.parseDiagnostics.length) held();
        let checker;
        const symbol = node => {
            if(!checker) {
                const options={allowJs:true,noLib:true,noResolve:true,types:[]};
                const host=ts.createCompilerHost(options);host.getSourceFile=file=>file.endsWith('public-client.js')?ast:undefined;
                host.fileExists=file=>file.endsWith('public-client.js');host.readFile=file=>file.endsWith('public-client.js')?text:undefined;
                checker=ts.createProgram(['public-client.js'],options,host).getTypeChecker();
            }
            return checker.getSymbolAtLocation(node);
        };
        const unwrap = node => {
            while (ts.isParenthesizedExpression(node) || (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.CommaToken))
                node = ts.isParenthesizedExpression(node) ? node.expression : node.right;
            return node;
        };
        const approvedImport = declaration => ts.isImportDeclaration(declaration)&&ts.isStringLiteral(declaration.moduleSpecifier)&&
            declaration.moduleSpecifier.text==='private-next-rsc-action-client-wrapper';
        const knownNamespace = (input,seen=new Set()) => {
            const node=unwrap(input);if(!ts.isIdentifier(node)||seen.has(node)||seen.size>4)return false;seen.add(node);
            const declarations=symbol(node)?.declarations||[];if(declarations.length!==1)return false;const d=declarations[0];
            if(ts.isNamespaceImport(d))return approvedImport(d.parent.parent);
            return ts.isVariableDeclaration(d)&&!!d.initializer&&!!(d.parent.flags&ts.NodeFlags.Const)&&knownNamespace(d.initializer,seen);
        };
        const knownFactory = (input,seen=new Set()) => {
            const node=unwrap(input);if(seen.has(node)||seen.size>4)return false;seen.add(node);
            if(ts.isPropertyAccessExpression(node)&&node.name.text==='createServerReference')return knownNamespace(node.expression);
            if(!ts.isIdentifier(node))return false;
            const declarations=symbol(node)?.declarations||[];
            if(declarations.length!==1)return false;
            const d=declarations[0];
            if(ts.isImportSpecifier(d)) {
                const declaration=d.parent.parent.parent;
                return (d.propertyName||d.name).text==='createServerReference'&&approvedImport(declaration);
            }
            return ts.isVariableDeclaration(d)&&!!d.initializer&&!!(d.parent.flags&ts.NodeFlags.Const)&&knownFactory(d.initializer,seen);
        };
        const visit = node => {
            if(ts.isStringLiteral(node)&&node.text.includes('static/')&&/\.js(?:[?#]|$)/.test(node.text))reference({value:node.text});
            if (ts.isCallExpression(node)) {
                const args = node.arguments;
                if(args.length>=2&&args.length<=8&&ts.isStringLiteral(args[0])&&/^[a-f0-9]{42}$/.test(args[0].text)) {
                    const nameIndex=args.findIndex((a,i)=>i>0&&ts.isStringLiteral(a)&&a.text==='invalidateCacheAction');
                    if(nameIndex>=0) {
                        const factoryRecognized=knownFactory(node.expression),confirmed=factoryRecognized&&args.length===5&&nameIndex===4;
                        const candidate={reference:args[0].text,argCount:args.length,nameArgumentIndex:nameIndex,factoryRecognized,confirmed};
                        candidates.set(JSON.stringify(candidate),candidate);if(candidates.size>16)held();
                        if(confirmed)actions.add(args[0].text);
                    }
                }
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
    return { paths: [...paths], actionReferences: [...actions],actionCandidates:[...candidates.values()], telemetryBindings: [...telemetry.values()],referenceCounts,documentIdentity,
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
// A real, new nonpersistent context and main-frame request reuse the existing
// bounded handshake. The final route receives EMPTY text/plain, never app HTML:
// no ClerkJS, React action, analytics or other remote code can execute.
export async function readLoginAssetDocument(getToken,browserFactory) {
    const r={browserLaunchAttempted:false,contextCreateAttempted:false,finalHtmlCaptured:false,extraBrowserRequestsBlocked:0,
        routeAbortFailed:false,held:false,handshake:null,clerkAuthenticationStarted:false,sessionStarted:false};
    let browser,context,response,bytes,type,initialWork;const extraWork=[];
    try {
        r.browserLaunchAttempted=true;browser=await browserFactory();r.contextCreateAttempted=true;
        context=await browser.newContext({acceptDownloads:false,serviceWorkers:'block'});const page=await context.newPage();
        let started=false;const policy=createInitialHandshakeCandidate(page,getToken,{allowLegacyCandidate:true});
        await page.route('**/*',async route=>{
            if(started) {r.extraBrowserRequestsBlocked++;const work=Promise.resolve().then(()=>route.abort('blockedbyclient')).catch(()=>{r.routeAbortFailed=true;});extraWork.push(work);await work;return;}
            started=true;
            initialWork=(async()=>{try {await policy.run({request:()=>route.request(),abort:(...args)=>route.abort(...args),fulfill:async({response:actual})=>{
                response=actual;await route.fulfill({status:200,headers:{'content-type':'text/plain; charset=utf-8',
                    'content-security-policy':"default-src 'none'; script-src 'none'; connect-src 'none'"},body:''});
            }});}catch{r.held=true;}finally{r.handshake=policy.diagnostics();}})();await initialWork;
        });
        await page.goto(target.origin+'/admin/login',{waitUntil:'domcontentloaded',timeout:30000});
        await initialWork;await Promise.allSettled(extraWork);
        if(r.held||r.routeAbortFailed||r.extraBrowserRequestsBlocked||!r.handshake?.complete||!response||response.status()!==200)held();
        type=response.headers()['content-type']||'';if(!/^text\/html(?:;|$)/i.test(type))held();
        // Playwright buffers API responses internally. Apply the body cap before
        // parsing/copying into the inspector, and never retain response headers.
        bytes=await response.body();if(bytes.length>1024*1024)held();r.finalHtmlCaptured=true;
    }catch{r.held=true;}
    finally {Object.assign(r,await closeIsolatedBrowser(context,browser,r));await Promise.allSettled([initialWork,...extraWork]);
        if(!r.allLocalClosed||r.extraBrowserRequestsBlocked||r.routeAbortFailed)r.held=true;}
    return {diagnostics:r,response:!r.held&&bytes?new Response(bytes,{headers:{'content-type':type}}):null};
}
export async function inspectDeploymentAssets(env, receipt, fetcher = fetch, loginReader) {
    const result = { stage: 'CONTEXT', code: 'PUBLIC_ASSETS_INCOMPLETE', completed: false,
        deployment: target.deployment, source: target.source, origin: target.origin,
        oidcRequestSent: false, appGetCount: 0, redirectFollowed: false,
        clerkStarted: false, sessionStarted: false, browserStarted: false, fixtureWriteStarted: false,
        responseBodiesRetained: false, publicAssets: [], actionReferences: [],actionCandidates:[], telemetryBindings: [] };
    try {
        const login=env.ISSUE118_DIAGNOSTIC_MODE===loginAssetMode,documentPath=login?'/admin/login':'/';
        assertRedirectDiagnosticEnvironment(env, login?loginAssetMode:assetMode);
        if(login&&typeof loginReader!=='function')held();
        result.stage = 'RECEIPT'; assertIdentityReceipt(receipt);
        result.stage='SOURCE_LOCK';if(!sourceLockMatches(readFileSync(new URL('../package-lock.json',import.meta.url))))held();
        result.sourceLockMatched=true;
        result.stage = 'OIDC_TARGET'; const oidcUrl = oidcRequestUrl(env.ACTIONS_ID_TOKEN_REQUEST_URL);
        if (!env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) held();
        result.stage = 'OIDC_REQUEST'; result.oidcRequestSent = true;
        const response = await fetcher(oidcUrl, { method: 'GET', redirect: 'error',
            headers: { Authorization: `bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` }, signal: AbortSignal.timeout(20000) });
        if (!response.ok) held();
        result.stage = 'OIDC_CLAIMS'; const token = assertOidcClaims((await response.json()).value);
        const queue = [documentPath], seen = new Set(); let totalBytes = 0;
        for (let i = 0; i < queue.length; i++) {
            const path = queue[i]; if (seen.has(path)) continue;
            result.stage = 'APP_TARGET'; if (path !== documentPath) assertPublicAssetPath(path);
            if (seen.size >= maxAssets + 1) held();
            assertIdentityReceipt(receipt); assertOidcClaims(token); seen.add(path);
            let asset;
            if(login&&path===documentPath) {
                result.stage='LOGIN_DOCUMENT';if(typeof loginReader!=='function')held();
                const read=await loginReader(()=>{assertIdentityReceipt(receipt);return assertOidcClaims(token);});
                result.loginDocument=read.diagnostics;const h=read.diagnostics.handshake;
                result.clerkHandshakeGetCount=h?.handshakeUsed&&h.requests>=2?1:0;result.clerkStarted=result.clerkHandshakeGetCount>0;
                result.clerkAuthenticationStarted=false;result.appGetCount+=(h?.requests||0)-result.clerkHandshakeGetCount;
                if(read.diagnostics.held||!read.diagnostics.allLocalClosed||!read.response)held();asset=read.response;
            }else {result.stage = 'APP_GET'; result.appGetCount++;
            asset = await fetcher(target.origin + path, { method: 'GET', redirect: 'error',
                credentials: 'omit', cache: 'no-store', headers: {
                    'x-vercel-trusted-oidc-idp-token': token,
                    Accept: path === documentPath ? 'text/html' : 'application/javascript',
                }, signal: AbortSignal.timeout(20000) });}
            result.stage = 'APP_RESPONSE'; if (asset.status !== 200) held();
            const type = asset.headers.get('content-type') || '';
            if (path === documentPath ? !/^text\/html(?:;|$)/i.test(type) : !/^(?:text|application)\/(?:javascript|x-javascript)(?:;|$)/i.test(type)) held();
            result.stage = 'APP_BODY';
            const remainingBytes = maxTotalBytes - totalBytes; if (remainingBytes <= 0) held();
            const body = await readLimited(asset, Math.min(remainingBytes, path === documentPath ? 1024 * 1024 : 2 * 1024 * 1024));
            totalBytes += body.bytes; if (totalBytes > maxTotalBytes) held();
            const observation = inspectPublicCode(body.text, path === documentPath);
            result.publicAssets.push({ path, bytes: body.bytes, sha256: login&&path===documentPath?null:createHash('sha256').update(body.text).digest('hex'),
                referenceCounts:observation.referenceCounts,
                ...(path===documentPath?{documentIdentity:observation.documentIdentity}:{}),
                namedActionMarkerPresent: observation.namedActionMarkerPresent,
                legacyTelemetryScriptLiteral: observation.legacyTelemetryScriptLiteral,
                legacyTelemetryViewLiteral: observation.legacyTelemetryViewLiteral,
                legacyTelemetryEventLiteral: observation.legacyTelemetryEventLiteral });
            result.stage='APP_REFERENCES';
            if(observation.referenceCounts.otherQueryRefused||observation.referenceCounts.unsafeReferenceRefused||observation.referenceCounts.htmlMalformed)held();
            if(path===documentPath) {result.stage='APP_DOCUMENT_IDENTITY';if(observation.documentIdentity?.titleCount!==1||!observation.documentIdentity?.expectedTitle||!observation.documentIdentity?.appIcon)held();}
            for (const reference of observation.actionReferences) result.actionReferences.push({ path, reference, export: 'invalidateCacheAction' });
            for (const candidate of observation.actionCandidates)result.actionCandidates.push({path,...candidate});
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
        const login=process.argv.slice(2).join(' ')==='--login-public-assets-only';
        if ((!login&&(process.argv.slice(2).join(' ') !== '--public-assets-only'||process.env.ISSUE118_DIAGNOSTIC_MODE!==assetMode)) ||
            (login&&process.env.ISSUE118_DIAGNOSTIC_MODE!==loginAssetMode)||!process.env.RUNNER_TEMP ||
            !process.env.CLEARALLERGY_ISSUE118_IDENTITY_RECEIPT) held();
        const receipt = JSON.parse(readFileSync(process.env.CLEARALLERGY_ISSUE118_IDENTITY_RECEIPT, 'utf8'));
        const reader=login?token=>readLoginAssetDocument(token,async()=>{
            const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
            return chromium.launch({headless:true,channel:'chromium'});
        }):undefined;
        const result = await inspectDeploymentAssets(process.env, receipt,fetch,reader);
        const directory = join(process.env.RUNNER_TEMP, login?'issue118-login-public-assets':'issue118-public-assets'); mkdirSync(directory, { recursive: false });
        writeFileSync(join(directory, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
        console.log(JSON.stringify(result)); if (!result.completed) process.exitCode = 1;
    } catch { console.error('PUBLIC_ASSETS_REFUSED_NO_RAW_ERROR'); process.exitCode = 1; }
}
