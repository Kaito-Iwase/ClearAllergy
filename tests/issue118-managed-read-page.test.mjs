import assert from 'node:assert/strict';
import test from 'node:test';
import { createManagedReadPageScope } from '../scripts/issue118-managed-read-page.mjs';
import { previewOrigin } from '../scripts/issue118-preview-transport.mjs';
import { createReadCloseAuthPolicyCandidate, readCloseRequestAllowed } from '../scripts/check-issue118-live-t1-browser.mjs';

function fixture() {
    const context={},frame={};let ready=true,closed=false,url=previewOrigin+'/admin/menus/cfixture/edit';
    const page={context:()=>context,mainFrame:()=>frame,isClosed:()=>closed,url:()=>url};
    const scope=createManagedReadPageScope({context,shopId:'cshop',assertReady:()=>{if(!ready)throw Error('NOT_READY');}});
    const request=(extra={})=>({method:()=> 'GET',resourceType:()=> 'fetch',frame:()=>frame,
        url:()=>previewOrigin+'/api/admin/menus/cfixture',...extra});
    return{scope,page,request,setReady:v=>{ready=v;},setClosed:v=>{closed=v;},setUrl:v=>{url=v;}};
}
test('known fixture GET is scoped to one registered main frame, raw path and active owner state',()=>{
    const f=fixture(),r=f.request();assert.equal(readCloseRequestAllowed('GET',r.url()),false);
    assert.equal(f.scope.allowsRead(r),false);const release=f.scope.register(f.page,'cfixture');assert.equal(f.scope.allowsRead(r),true);
    for(const extra of [{method:()=> 'POST'},{method:()=> 'PUT'},{resourceType:()=> 'document'},{frame:()=>({})},
        ...['/api/admin/menus/cother','/api/admin/menus','/api/menus/cfixture','/api/admin/menus/cfixture?','/api/admin/menus/cfixture#',
            '/api/admin/menus/%63fixture','/api/admin/menus/cfixture/stop'].map(path=>({url:()=>previewOrigin+path})),
        {url:()=> 'https://other.invalid/api/admin/menus/cfixture'}])assert.equal(f.scope.allowsRead(f.request(extra)),false);
    f.setReady(false);assert.equal(f.scope.allowsRead(r),false);f.setReady(true);
    f.setUrl(previewOrigin+'/admin/login');assert.equal(f.scope.allowsRead(r),false);
    f.setUrl(previewOrigin+'/admin/menus/cfixture/edit');f.setClosed(true);assert.equal(f.scope.allowsRead(r),false);f.setClosed(false);
    release();release();assert.equal(f.scope.allowsRead(r),false);
});
test('script scope excludes unregistered tabs, subframes, moved pages and a second simultaneous tab',()=>{
    const f=fixture(),script=f.request({resourceType:()=> 'script'}),release=f.scope.register(f.page,'cfixture');
    assert.equal(f.scope.scriptPage(script),f.page);
    assert.equal(f.scope.scriptPage(f.request({resourceType:()=> 'script',frame:()=>({})})),undefined);
    assert.throws(()=>f.scope.register({...f.page},'cfixture'),/MANAGED_READ_PAGE_REFUSED/);
    f.setUrl(previewOrigin+'/admin/menus/cother/edit');assert.equal(f.scope.scriptPage(script),undefined);
    release();assert.throws(()=>f.scope.assertScriptPage(script,f.page),/MANAGED_READ_PAGE_REFUSED/);
});
test('managed GET permission is APP_FLOW only and is revalidated after asynchronous header work',async()=>{
    const f=fixture(),release=f.scope.register(f.page,'cfixture');let phase='APP_FLOW';
    const policy=createReadCloseAuthPolicyCandidate({managedReadAllowed:r=>f.scope.allowsRead(r)}),request=f.request();
    assert.equal((await policy(request,()=>phase)).decision,'USE_EXISTING_TRANSPORT');
    policy.assertBeforeSend(request,()=>phase);
    for(const next of ['AUTHENTICATION','SIGNOUT']){phase=next;assert.equal((await policy(request,()=>phase)).decision,'REFUSE');
        assert.throws(()=>policy.assertBeforeSend(request,()=>phase),/READ_CLOSE_PRE_SEND_REFUSED/);}
    phase='APP_FLOW';release();assert.throws(()=>policy.assertBeforeSend(request,()=>phase),/READ_CLOSE_PRE_SEND_REFUSED/);
    for(const method of ['POST','PUT','DELETE'])assert.equal((await policy(f.request({method:()=>method}),()=>phase)).decision,'REFUSE');
});
