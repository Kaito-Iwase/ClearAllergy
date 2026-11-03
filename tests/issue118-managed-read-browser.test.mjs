// Real Playwright/Chromium; every HTTP byte goes to this loopback server.
// Clerk, OIDC, auth/session and app data are synthetic and never contact a provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {ciIdentity,managedActorIdentity,createCiAccess} from '../scripts/issue118-ci-auth.mjs';
import {previewOrigin} from '../scripts/issue118-preview-transport.mjs';
import {createReadCloseAuthPolicyCandidate,guardReadCloseRoute} from '../scripts/check-issue118-live-t1-browser.mjs';

test('loopback Chromium: registered edit tab transfers one SDK redirect and reads only its bound API',async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
 const owner=managedActorIdentity.S1,clerkOrigin='https://'+ciIdentity.clerkDomain,id='cloopbackfixture',seen=[];
 const source='/npm/@clerk/clerk-js@6/dist/clerk.browser.js',canonical='/npm/@clerk/clerk-js@6.24.0/dist/clerk.browser.js';
 const pk='pk_test_'+Buffer.from(ciIdentity.clerkDomain+'$').toString('base64');
 const state=`window.Clerk={loaded:true,publishableKey:${JSON.stringify(pk)},user:{id:${JSON.stringify(owner.ownerId)}},session:{id:'sess_Loopback'},client:{signIn:{create:async()=>({status:'complete',createdSessionId:'sess_Loopback'})}},setActive:async()=>{},signOut:async()=>{}};`;
 const server=createServer((req,res)=>{
  seen.push({method:req.method,path:req.url,oidc:!!req.headers['x-vercel-trusted-oidc-idp-token']});
  if(req.url===source){res.writeHead(307,{location:clerkOrigin+canonical});res.end();return;}
  if(req.url===canonical){res.writeHead(200,{'content-type':'application/javascript'});
   res.end("window.sdkReady=true;fetch('/api/admin/menus/"+id+"').then(r=>{window.apiStatus=r.status;});");return;}
  if(req.url==='/api/admin/menus/'+id){res.writeHead(200,{'content-type':'application/json'});res.end('{}');return;}
  res.writeHead(200,{'content-type':'text/html'});
  res.end('<!doctype html><html><body><script>'+state+'</script>'+(req.url?.endsWith('/edit')?'<script src="'+clerkOrigin+source+'"></script>':'')+'</body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const local='http://127.0.0.1:'+server.address().port;
 let browser;
 try {
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'chromium'})});
  for(const registered of [false,true]){
   const real=await browser.newContext({serviceWorkers:'block'}),events=[];let held=false,release;
   try{
    const map=url=>{const u=new URL(url);assert.ok([previewOrigin,clerkOrigin].includes(u.origin));return local+u.pathname+u.search;};
    const api={fetch:(url,options)=>real.request.fetch(map(url),options)},context={request:api};
    const facade=p=>({context:()=>context,mainFrame:()=>p.mainFrame(),url:()=>p.url(),isClosed:()=>p.isClosed(),
     goto:(...a)=>p.goto(...a),evaluate:(...a)=>p.evaluate(...a),waitForFunction:(...a)=>p.waitForFunction(...a)});
    const now=()=>Math.floor(Date.now()/1000),claims={iss:'https://token.actions.githubusercontent.com',aud:ciIdentity.audience,
     sub:`repo:${ciIdentity.repository}:environment:${ciIdentity.environment}`,repository:ciIdentity.repository,repository_id:ciIdentity.repositoryId,
     ref:ciIdentity.ref,workflow_ref:ciIdentity.workflowRef,environment:ciIdentity.environment,iat:now(),exp:now()+600};
    const jwt='synthetic.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature';
    const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:ciIdentity.repository,
     GITHUB_REPOSITORY_ID:ciIdentity.repositoryId,GITHUB_REF:ciIdentity.ref,GITHUB_WORKFLOW_REF:ciIdentity.workflowRef,
     ISSUE118_GITHUB_ENVIRONMENT:ciIdentity.environment,ISSUE118_APPLY:'true',GITHUB_SHA:'a'.repeat(40),ISSUE118_EXPECTED_RUNNER_SHA:'a'.repeat(40),
     ISSUE118_TEST_CLERK_SECRET_KEY:'sk_test_SYNTHETIC_ONLY',ACTIONS_ID_TOKEN_REQUEST_URL:'https://synthetic.actions.githubusercontent.com/idtoken',
     ACTIONS_ID_TOKEN_REQUEST_TOKEN:'SYNTHETIC_ONLY',ISSUE118_SESSION_LIFECYCLE:'TRACKED_OWNER_SESSION'};
    const fetcher=async(url,options)=>{
     let body;
     if(url.includes('actions.githubusercontent.com'))body={value:jwt};
     else if(url.endsWith('/users/'+owner.ownerId))body={id:owner.ownerId,email_addresses:[{email_address:owner.ownerEmail}]};
     else if(url.endsWith('/testing_tokens')||url.endsWith('/sign_in_tokens'))body={token:'SYNTHETIC_ONLY'};
     else if(url.endsWith('/sessions/sess_Loopback')){assert.equal(options.method,'GET');body={id:'sess_Loopback',user_id:owner.ownerId,created_at:Date.now(),status:'active'};}
     else assert.fail('unknown synthetic backend path');
     return{ok:true,status:200,json:async()=>body};
    };
    let phase='AUTHENTICATION';
    const access=await createCiAccess(env,fetcher,()=>{},{managedReadReady:()=>{assert.equal(phase,'APP_FLOW');},scriptTransfer:p=>events.push(p)});
    const policy=createReadCloseAuthPolicyCandidate({managedReadAllowed:r=>access.allowsManagedRead(r)});
    await real.route('**/*',async route=>{
     const mapped={request:()=>route.request(),fetch:options=>route.fetch({...options,url:map(options.url||route.request().url())}),
      fulfill:options=>route.fulfill(options),abort:code=>route.abort(code)};
     try{if(await guardReadCloseRoute(mapped,()=>{held=true;},()=>{}, {policy,getPhase:()=>phase}))
      await access.route(mapped,undefined,()=>policy.assertBeforeSend(route.request(),()=>phase));}
     catch{held=true;}
    });
    const root=facade(await real.newPage());await access.authenticate(root);phase='APP_FLOW';
    const p=await real.newPage(),edit=facade(p);if(registered)release=access.registerManagedReadPage(edit,id);
    const begin=seen.length;await p.goto(previewOrigin+'/admin/menus/'+id+'/edit');
    if(registered){await p.waitForFunction(()=>window.sdkReady===true&&window.apiStatus===200);assert.equal(held,false);
     assert.equal(events.at(-1).responseReady,true);}
    else{assert.equal(await p.evaluate(()=>window.sdkReady===true),false);assert.equal(held,true);assert.equal(events.length,0);}
    const requests=seen.slice(begin);assert.equal(requests.filter(r=>r.path===source).length,1);
    assert.equal(requests.filter(r=>r.path===canonical).length,registered?1:0);
    assert.equal(requests.filter(r=>r.path==='/api/admin/menus/'+id).length,registered?1:0);
    assert.ok(requests.every(r=>r.method==='GET'));assert.ok(requests.filter(r=>r.path.startsWith('/npm/')).every(r=>!r.oidc));
    if(registered){release();const before=seen.length;await p.evaluate(()=>fetch('/api/admin/menus/cloopbackfixture').catch(()=>{}));
     assert.equal(seen.slice(before).filter(r=>r.path==='/api/admin/menus/'+id).length,0);assert.equal(held,true);}
   }finally{release?.();await real.close();}
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
