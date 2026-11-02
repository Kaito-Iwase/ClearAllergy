import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createManagedRuntimePorts,target} from '../scripts/check-issue118-live-t1-browser.mjs';
import {ciIdentity,managedActorIdentity} from '../scripts/issue118-ci-auth.mjs';
import {ALLERGEN_MASTER} from '../lib/constants/allergen-master';

// Stateful HTTP seam only. It does not authenticate or contact an app/DB/Clerk.
function fixture(fault='NONE'){
    const directory=mkdtempSync(join(tmpdir(),'issue118-managed-runtime-'));
    const store=new Map<string,{owner:string;menu:Record<string,unknown>}>(),writes:unknown[]=[],created:unknown[]=[],claims:unknown[]=[];
    const now=Math.floor(Date.now()/1000),c={iss:'https://token.actions.githubusercontent.com',aud:ciIdentity.audience,
        sub:`repo:${ciIdentity.repository}:environment:${ciIdentity.environment}`,repository:ciIdentity.repository,repository_id:ciIdentity.repositoryId,
        ref:ciIdentity.ref,workflow_ref:ciIdentity.workflowRef,environment:ciIdentity.environment,iat:now,exp:now+3600};
    const token='e30.'+Buffer.from(JSON.stringify(c)).toString('base64url')+'.SYNTHETIC';
    const pk='pk_test_'+Buffer.from(ciIdentity.clerkDomain+'$').toString('base64');
    let sequence=0;
    const actors=Object.entries(managedActorIdentity).map(([owner,identity])=>{
        const api={fetch:async(raw:string,options:{method?:string;data?:Record<string,unknown>}={})=>{
            const url=new URL(raw);assert.equal(url.origin,target.origin);const method=options.method||'GET';
            const reply=(status:number,body:unknown)=>({status:()=>status,json:async()=>structuredClone(body),headers:()=>({'x-request-id':randomUUID()})});
            if(url.pathname==='/api/admin/shop')return reply(200,{shop:{id:identity.shopId}});
            if(method==='POST'&&url.pathname==='/api/admin/menus'){
                writes.push({owner,method,data:structuredClone(options.data)});if(fault==='CREATE_UNKNOWN')throw Error('SYNTHETIC_PRIVATE_ERROR');
                const id='c'+String(++sequence).padStart(24,'0'),d=options.data!;
                const menu={...d,id,name:fault==='NAME_MISMATCH'?'wrong-name':d.name,version:29,foodVersion:29,reviewedFoodVersion:null,
                    publicationConfirmedFoodVersion:null,foodReviews:[],isPublished:false,
                    allergens:ALLERGEN_MASTER.map(a=>({...a,status:(d.allergenStatusBySlug as Record<string,string>)[a.slug]}))};
                store.set(id,{owner,menu});return reply(201,{id});
            }
            const id=url.pathname.split('/').filter(Boolean).filter(x=>x!=='stop').at(-1)!,entry=store.get(id);
            if(!entry||entry.owner!==owner)return reply(404,{error:'NOT_FOUND'});
            if(method==='GET')return reply(200,{menu:entry.menu});
            writes.push({owner,method,data:structuredClone(options.data)});const d=options.data!,m=entry.menu;
            assert.equal(d.__menuId,undefined);if(d.expectedVersion!==m.version)return reply(409,{error:'VERSION_CONFLICT'});
            m.version=(m.version as number)+1;
            if(url.pathname.endsWith('/stop'))m.isPublished=false;
            else if(d.publicationAction==='publish'){m.isPublished=true;m.publicationConfirmedFoodVersion=m.foodVersion;}
            else if(typeof d.priceYen==='number')m.priceYen=d.priceYen;
            return reply(200,{ok:true,menu:m});
        }};
        return {binding:{owner,shopId:identity.shopId,contextRef:owner},expectedUserId:identity.ownerId,
            page:{evaluate:async()=>({id:fault==='WRONG_OWNER'?'user_other':identity.ownerId,pk})},
            context:{request:api},access:{token:()=>token,read:async(request:typeof api,url:string)=>request.fetch(url)}};
    });
    const runtime=createManagedRuntimePorts({actors,batchInput:{managed:{}},claimDirectory:directory,t1FixtureId:'ct1fixture',record:()=>{}});
    const install=async()=>runtime.ports.installSendGuard({authorize:async(value:unknown)=>{claims.push(value);return {...value as object,allowedForward:true};},consumeSendPermission:()=>{},recordCreated:(value:unknown)=>created.push(value)});
    return {runtime,install,store,writes,created,claims,directory};
}

test('real runtime adapter sends three distinct controls, ten bounded writes and retains private fixtures',async()=>{
    const f=fixture();try{await f.install();const r=await f.runtime.ports.runControls();
        assert.equal(r.priceFoodVersionUnchanged,true);assert.equal(r.stopFoodVersionUnchanged,true);
        assert.equal(r.noSignalAutomaticStops,0);assert.equal(r.noSignalRequiredStopDenominator,0);
        assert.equal(f.created.length,3);assert.equal(f.claims.length,10);assert.equal(f.writes.length,10);
        assert.ok([...f.store.values()].every(x=>x.menu.isPublished===false));
        assert.equal(f.runtime.snapshot().held,false);
    }finally{rmSync(f.directory,{recursive:true,force:true});}
});
test('runtime unknown creation stops after one send; acknowledgement ID survives later readback mismatch',async()=>{
    for(const fault of ['CREATE_UNKNOWN','NAME_MISMATCH']){const f=fixture(fault);try{await f.install();
        await assert.rejects(f.runtime.ports.runControls());assert.equal(f.writes.length,1);assert.equal(f.runtime.snapshot().held,true);
        assert.equal(f.created.length,fault==='NAME_MISMATCH'?1:0);assert.doesNotMatch(JSON.stringify(f.runtime.snapshot()),/SYNTHETIC_PRIVATE_ERROR/);
        await assert.rejects(f.runtime.ports.runControls());assert.equal(f.writes.length,1);
    }finally{rmSync(f.directory,{recursive:true,force:true});}}
});
test('runtime owner mismatch or refused send permit cannot reach a mutating request',async()=>{
    for(const fault of ['WRONG_OWNER','REFUSE_PERMIT']){const f=fixture(fault);try{
        if(fault==='REFUSE_PERMIT')await f.runtime.ports.installSendGuard({authorize:async()=>({allowedForward:false}),recordCreated:()=>assert.fail('No creation')});else await f.install();
        await assert.rejects(f.runtime.ports.runControls());assert.equal(f.writes.length,0);assert.equal(f.created.length,0);
    }finally{rmSync(f.directory,{recursive:true,force:true});}}
});
