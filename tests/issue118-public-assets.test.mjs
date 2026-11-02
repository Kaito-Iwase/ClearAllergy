import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { assertPublicAssetPath, assetMode, inspectDeploymentAssets, inspectPublicCode } from '../scripts/check-issue118-public-assets.mjs';
import { ciIdentity } from '../scripts/issue118-ci-auth.mjs';
import { target } from '../scripts/check-issue118-live-t1-browser.mjs';
const secret = 'SYNTHETIC_SECRET_NOT_REAL';
const env = () => ({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1',
    GITHUB_REPOSITORY: ciIdentity.repository, GITHUB_REPOSITORY_ID: ciIdentity.repositoryId,
    GITHUB_REF: ciIdentity.ref, GITHUB_WORKFLOW_REF: ciIdentity.workflowRef,
    ISSUE118_GITHUB_ENVIRONMENT: ciIdentity.environment, ISSUE118_DIAGNOSTIC_MODE: assetMode,
    GITHUB_SHA: 'a'.repeat(40), ISSUE118_EXPECTED_RUNNER_SHA: 'a'.repeat(40),
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://synthetic.actions.githubusercontent.com/opaque', ACTIONS_ID_TOKEN_REQUEST_TOKEN: secret });
const receipt = () => ({ ...target, environment: 'Preview', status: 'Ready', verifiedBy: 'human',
    observedUtc: new Date().toISOString(), evidenceReference: 'Synthetic offline receipt' });
const claims = () => ({ iss: 'https://token.actions.githubusercontent.com', aud: ciIdentity.audience,
    sub: `repo:${ciIdentity.repository}:environment:${ciIdentity.environment}`, repository: ciIdentity.repository,
    repository_id: ciIdentity.repositoryId, ref: ciIdentity.ref, workflow_ref: ciIdentity.workflowRef,
    environment: ciIdentity.environment, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 });
const jwt = data => 'eyJhbGciOiJub25lIn0.' + Buffer.from(JSON.stringify(data)).toString('base64url') + '.synthetic';
const issued = data => ({ ok: true, json: async () => ({ value: jwt(data || claims()) }) });
const identityHtml='<title>ClearAllergy</title><link rel="icon" href="/images/clearallergy-mark-small.svg">';
const response = (text, type = 'application/javascript', status = 200) => new Response((type==='text/html'?identityHtml:'')+text, { status, headers: { 'content-type': type } });
const action = '00' + 'a'.repeat(40);
function stopped(r) {
    for (const key of ['redirectFollowed','clerkStarted','sessionStarted','browserStarted','fixtureWriteStarted','responseBodiesRetained']) assert.equal(r[key], false);
    assert.doesNotMatch(JSON.stringify(r), /SYNTHETIC|Authorization|bearer|sk_test_|Cookie/);
}
test('asset paths reject origin, traversal, encoding, query, fragments, arbitrary app/API paths', () => {
    assert.equal(assertPublicAssetPath('/_next/static/chunks/abc.js'), '/_next/static/chunks/abc.js');
    assert.equal(assertPublicAssetPath('/_next/static/build-id/_buildManifest.js'),'/_next/static/build-id/_buildManifest.js');
    for (const path of ['//other.test/a.js', 'https://other.test/a.js', '/api/admin/shop', '/admin/login',
        '/_next/static/chunks/../a.js', '/_next/static/chunks/%2e%2e/a.js', '/_next/static/chunks/a.js?q=1',
        '/_next/static/chunks/a.js#x', '/_next/static/chunks/a\\b.js', '/_next/static/chunks/a.js\n',
        '/_next/server/server-reference-manifest.js','/_next/static/a.json','/_next/static/a.js.map']) assert.throws(() => assertPublicAssetPath(path));
});
test('extract only literal public chunk dependencies and exact named reference factory; do not execute code', () => {
    const text = `"static/chunks/a.js";"/_next/static/chunks/a.js";"https://other.test/evil.js";` +
        `(0,r.createServerReference)("${action}",r.callServer,void 0,r.findSourceMapURL,"invalidateCacheAction");` +
        `"${'b'.repeat(42)}";"invalidateCacheAction";throw "${secret}";`;
    const r = inspectPublicCode(text); assert.deepEqual(r.paths, ['/_next/static/chunks/a.js']);
    assert.deepEqual(r.actionReferences, [action]); assert.equal(r.namedActionMarkerPresent, true);
    assert.deepEqual(inspectPublicCode(`"${action}";"invalidateCacheAction"`).actionReferences, []);
    assert.deepEqual(inspectPublicCode(`createServerReference("${action}",null,"otherAction")`).actionReferences, []);
    for (const body of [`/* createServerReference("${action}",x,undefined,x,"invalidateCacheAction") */`,
        JSON.stringify(`createServerReference("${action}",x,undefined,x,"invalidateCacheAction")`),
        `const r=/createServerReference("${action}",x,undefined,x,"invalidateCacheAction")/;`])
        assert.deepEqual(inspectPublicCode(body).actionReferences, []);
    assert.deepEqual(inspectPublicCode(`<script>createServerReference("${action}",x,undefined,x,"invalidateCacheAction")</script>`, true).actionReferences, []);
    assert.deepEqual(inspectPublicCode('const x={scriptSrc:"/known/script.js",viewEndpoint:"/known/view"}').telemetryBindings,
        [{field:'scriptSrc',path:'/known/script.js'},{field:'viewEndpoint',path:'/known/view'}]);
});
test('one OIDC request then fixed app GET graph only, deduplicated and no cookies or redirects', async () => {
    const calls = []; const r = await inspectDeploymentAssets(env(), receipt(), async (url, options) => {
        calls.push({ url, options }); if (calls.length === 1) return issued();
        assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
        assert.equal(options.headers.Cookie, undefined); assert.equal(options.headers.Authorization, undefined);
        assert.ok(options.headers['x-vercel-trusted-oidc-idp-token']);
        if (url === target.origin + '/') return response('<script src="/_next/static/chunks/a.js"></script>', 'text/html');
        assert.equal(url, target.origin + '/_next/static/chunks/a.js');
        return response(`"static/chunks/a.js";(0,r.createServerReference)("${action}",r.callServer,void 0,r.findSourceMapURL,"invalidateCacheAction");`);
    });
    assert.equal(calls.length, 3); assert.equal(r.appGetCount, 2); assert.equal(r.completed, true);
    assert.equal(r.code, 'PUBLIC_ACTION_REFERENCE_OBSERVED'); assert.equal(r.publicAssets.length, 2);
    assert.deepEqual(r.actionReferences, [{ path:'/_next/static/chunks/a.js',reference:action,export:'invalidateCacheAction' }]); stopped(r);
});
test('no action in reachable graph is reported as unobserved rather than inferred', async () => {
    let calls = 0; const r = await inspectDeploymentAssets(env(), receipt(), async () => ++calls === 1 ? issued() : response('<html>No provider</html>', 'text/html'));
    assert.equal(r.completed, true); assert.equal(r.code, 'PUBLIC_ROOT_ONLY_ACTION_UNOBSERVED'); assert.equal(r.actionReferences.length, 0); stopped(r);
});
test('HTML structure accepts only pinned dpl, normalizes relative/absolute references and counts duplicates and escapes', () => {
    const path='/_next/static/chunks/a.js', dpl='?dpl='+target.deployment;
    const html=`<!doctype html><html><head><!-- <script src="/_next/static/chunks/comment.js"></script> -->`+
        `<script async src="${path+dpl}"></script><script src='${target.origin+path+dpl}'></script>`+
        `<link rel="preload" as="script" href="_next/static/chunks/a.js"><link rel="modulepreload" href="./_next/static/chunks/a.js">`+
        `<script src="&#x2f;_next/static/chunks/a.js${dpl}"></script>`+
        `<script>const s="<script src='/_next/static/chunks/inline.js'>";</script>`+
        `<textarea><script src="/_next/static/chunks/textarea.js"></script></textarea>`+
        `<script src="https://other.invalid/_next/static/chunks/a.js"></script>`+
        `<script src="/_vercel/insights/script.js"></script></head></html>`;
    const r=inspectPublicCode(html,true);assert.deepEqual(r.paths,[path]);
    assert.equal(r.referenceCounts.scriptSrc,5);assert.equal(r.referenceCounts.scriptPreload,2);
    assert.equal(r.referenceCounts.matchingDpl,3);assert.equal(r.referenceCounts.queryless,2);
    assert.equal(r.referenceCounts.sameOriginAbsolute,1);assert.equal(r.referenceCounts.dotRelative,1);
    assert.equal(r.referenceCounts.documentRelative,1);assert.equal(r.referenceCounts.htmlEscaped,1);
    assert.equal(r.referenceCounts.duplicate,4);assert.equal(r.referenceCounts.foreignOriginRefused,1);
    assert.equal(r.referenceCounts.nonStaticRefused,1);assert.equal(r.referenceCounts.htmlMalformed,0);
});
test('public static namespace, document identity and unknown source shapes are classified without raw values', async () => {
    const html=identityHtml+'<script src="/_next/static/build-id/client.js"></script>'+ '<script src="/unknown-script.js"></script>';
    const parsed=inspectPublicCode(html,true);assert.deepEqual(parsed.paths,['/_next/static/build-id/client.js']);
    assert.equal(parsed.documentIdentity.expectedTitle,true);assert.equal(parsed.documentIdentity.appIcon,true);
    assert.equal(parsed.referenceCounts.rootNextStatic,1);assert.equal(parsed.referenceCounts.rootOther,1);
    assert.equal(parsed.referenceCounts.pathHasChunksSegment,0);assert.equal(parsed.referenceCounts.nonStaticRefused,1);
    for(const body of ['<title>Authentication Required</title>','<title>Login - Vercel</title>','<title>ClearAllergy</title>']) {
        let calls=0;const r=await inspectDeploymentAssets(env(),receipt(),async()=>++calls===1?issued():new Response(body+'<script src="/_next/static/chunks/a.js"></script>',{headers:{'content-type':'text/html'}}));
        assert.equal(calls,2);assert.equal(r.completed,false);assert.equal(r.code,'APP_DOCUMENT_IDENTITY_HELD');
        assert.equal(r.publicAssets.length,1);stopped(r);
    }
    for(const link of ['<link rel="icon" href="/other.svg" href="/images/clearallergy-mark-small.svg">',
        '<link rel="icon" href="/images/clearallergy-mark-small.svg" href="/other.svg">',
        '<link rel="stylesheet" rel="icon" href="/images/clearallergy-mark-small.svg">',
        '<link rel="icon" rel="stylesheet" href="/images/clearallergy-mark-small.svg">']) {
        let calls=0;const r=await inspectDeploymentAssets(env(),receipt(),async()=>++calls===1?issued():new Response('<title>ClearAllergy</title>'+link+'<script src="/_next/static/chunks/a.js"></script>',{headers:{'content-type':'text/html'}}));
        assert.equal(calls,2);assert.equal(r.completed,false);assert.equal(r.code,'APP_REFERENCES_HELD');
        assert.equal(r.publicAssets[0].referenceCounts.htmlMalformed,1);stopped(r);
    }
    let calls=0;const duplicateTitle=await inspectDeploymentAssets(env(),receipt(),async()=>++calls===1?issued():response('<title>ClearAllergy</title><script src="/_next/static/chunks/a.js"></script>','text/html'));
    assert.equal(calls,2);assert.equal(duplicateTitle.code,'APP_DOCUMENT_IDENTITY_HELD');assert.equal(duplicateTitle.publicAssets[0].documentIdentity.titleCount,2);stopped(duplicateTitle);
});
test('HTML malformed or duplicate attributes and unsafe/mismatching query forms never authorize GETs', async () => {
    const path='/_next/static/chunks/a.js';
    for(const value of [path+'?dpl=dpl_OTHER',path+'?other='+secret,path+'?dpl='+target.deployment+'&amp;other='+secret,
        path+'?dpl='+target.deployment+'&amp;dpl='+target.deployment,path+'#fragment',path.replace('a.js','../a.js'),
        path.replace('a.js','%61.js'),target.origin+':444'+path,'//other.invalid'+path]) {
        const r=inspectPublicCode(`<script src="${value}"></script>`,true);assert.equal(r.paths.length,0);assert.doesNotMatch(JSON.stringify(r),/SYNTHETIC|OTHER|fragment/);
    }
    for(const html of [`<script src="${path}" src="/_next/static/chunks/b.js"></script>`,
        `<script src="${path}`,`<!-- unterminated`, `<script src="${path}">`,
        `<script src="&#x110000;${path}"></script>`]) assert.equal(inspectPublicCode(html,true).referenceCounts.htmlMalformed,1);
    for(const tag of ['script','style','textarea','title']) {
        const html=`<${tag}/><script src="${path}"></script>`;
        const parsed=inspectPublicCode(html,true);assert.equal(parsed.referenceCounts.htmlMalformed,1);assert.deepEqual(parsed.paths,[]);
        let sent=0;const stoppedRun=await inspectDeploymentAssets(env(),receipt(),async()=>++sent===1?issued():response(html,'text/html'));
        assert.equal(sent,2);assert.equal(stoppedRun.appGetCount,1);assert.equal(stoppedRun.code,'APP_REFERENCES_HELD');stopped(stoppedRun);
    }
    let calls=0;const r=await inspectDeploymentAssets(env(),receipt(),async()=>++calls===1?issued():response(`<script src="${path}?dpl=dpl_OTHER"></script>`,'text/html'));
    assert.equal(calls,2);assert.equal(r.appGetCount,1);assert.equal(r.code,'APP_REFERENCES_HELD');
    assert.equal(r.publicAssets[0].referenceCounts.otherQueryRefused,1);stopped(r);
});
test('matching dpl sources fetch only the canonical static path once with app-only OIDC', async () => {
    const path='/_next/static/chunks/a.js';let calls=0;
    const r=await inspectDeploymentAssets(env(),receipt(),async(url,options)=>{
        calls++;if(calls===1)return issued();if(calls===2)return response(`<script src="${path}?dpl=${target.deployment}"></script>`,'text/html');
        assert.equal(url,target.origin+path);assert.equal(new URL(url).search,'');assert.equal(options.redirect,'error');
        return response(`"${path}?dpl=${target.deployment}";`);
    });
    assert.equal(calls,3);assert.equal(r.completed,true);assert.equal(r.publicAssets.length,2);
    assert.equal(r.publicAssets[0].referenceCounts.matchingDpl,1);assert.equal(r.publicAssets[1].referenceCounts.matchingDpl,1);stopped(r);
});
test('redirect or non-200 response stops without reading or following it', async () => {
    for (const status of [301,302,307,308,401,403,404,500]) {
        let calls = 0, reads = 0; const r = await inspectDeploymentAssets(env(), receipt(), async () => ++calls === 1 ? issued() :
            {status,headers:{get:()=> 'text/html'},body:{getReader:()=>{reads++; throw Error(secret);}}});
        assert.equal(calls, 2); assert.equal(reads, 0); assert.equal(r.completed, false); assert.equal(r.code, 'APP_RESPONSE_HELD'); stopped(r);
    }
});
test('context, receipt, ambient credentials, rerun and claims mismatches stop before app GET', async () => {
    for (const change of [{GITHUB_RUN_ATTEMPT:'2'},{ISSUE118_TEST_CLERK_SECRET_KEY:secret},{CLERK_SECRET_KEY:secret},
        {DATABASE_URL:secret},{ISSUE118_APPLY:'true'},{GITHUB_REF:'refs/heads/main'},{ISSUE118_DIAGNOSTIC_MODE:'OTHER'}]) {
        let calls=0; const r=await inspectDeploymentAssets({...env(),...change},receipt(),async()=>{calls++;throw Error(secret);});
        assert.equal(calls,0); assert.equal(r.completed,false); stopped(r);
    }
    for (const change of [{origin:'https://other.test'},{source:'b'.repeat(40)},{observedUtc:'2000-01-01T00:00:00Z'}]) {
        let calls=0; const r=await inspectDeploymentAssets(env(),{...receipt(),...change},async()=>{calls++;throw Error(secret);});assert.equal(calls,0);stopped(r);
    }
    let calls=0;const r=await inspectDeploymentAssets(env(),receipt(),async()=>{calls++;return issued({...claims(),ref:'refs/heads/main'});});assert.equal(calls,1);stopped(r);
});
test('provider exceptions, wrong MIME, invalid UTF8, body and graph limits fail with fixed codes and no raw content', async () => {
    for (const produce of [()=>{throw Error(secret);},()=>response(secret,'application/json'),
        ()=>new Response(Uint8Array.of(255),{headers:{'content-type':'text/html'}}),
        ()=>response('x'.repeat(1024*1024+1),'text/html'),
        ()=>response(Array.from({length:49},(_,i)=>`<script src="/_next/static/chunks/${i}.js"></script>`).join(''),'text/html')]) {
        let calls=0; const r=await inspectDeploymentAssets(env(),receipt(),async()=>++calls===1?issued():produce());
        assert.equal(r.completed,false);assert.equal(calls,2);stopped(r);
    }
});
test('remaining total budget stops the stream before decoding or retaining the last oversized chunk', async () => {
    const links=Array.from({length:8},(_,i)=>`<script src="/_next/static/chunks/${i}.js"></script>`).join('');
    const html=links+' '.repeat(1024*1024-links.length-identityHtml.length), js='/*'+'x'.repeat(2*1024*1024-4)+'*/';
    let calls=0,cancelled=false,reads=0;
    const r=await inspectDeploymentAssets(env(),receipt(),async()=>{
        calls++;if(calls===1)return issued();if(calls===2)return response(html,'text/html');
        if(calls<10)return response(js);
        return {status:200,headers:{get:()=> 'application/javascript'},body:{getReader:()=>({
            async read(){reads++;return {value:new Uint8Array(600*1024),done:false};},
            async cancel(){cancelled=true;},
        })}};
    });
    assert.equal(calls,10);assert.equal(reads,2);assert.equal(cancelled,true);assert.equal(r.code,'APP_BODY_HELD');assert.equal(r.publicAssets.length,8);stopped(r);
});
test('workflow asset step delivers no Clerk key or browser and artifact retains only extracted metadata', () => {
    const workflow=readFileSync(new URL('../.github/workflows/issue118-live-e2e.yml',import.meta.url),'utf8');
    const block=workflow.split('- name: Fixed Preview public client assets only')[1]?.split('\n      - name:')[0];
    assert.ok(block);assert.match(block,/PUBLIC_ASSETS_ONLY/);assert.doesNotMatch(block,/secrets\.|PLAYWRIGHT|ISSUE118_APPLY/);
    assert.match(workflow,/issue118-public-assets\/result.json/);
    assert.match(readFileSync(new URL('../scripts/browser-runner.mjs',import.meta.url),'utf8'),/tests\/issue118-public-assets.test.mjs/);
});
