// Prepared callable seam, deliberately absent from the live workflow/CLI.
// Uses an already admitted, tracked A actor; never opens/authenticates/finalizes one.
import assert from 'node:assert/strict';
import { assertIdentityReceipt, target, verifyManagedOwnedPage } from './check-issue118-live-t1-browser.mjs';
import { managedActorIdentity, assertClerkPublishableKey } from './issue118-ci-auth.mjs';
import { observeT2RuntimePhase, t2Commands } from './issue118-t2-reobserve.mjs';

const progressKeys = ['loginNavigationStarted','loginNavigationCompleted','clerkLoaded','frontendMatched',
    'ownerLookupStarted','ownerMatched','testingTokenRequestStarted','testingTokenReceived',
    'signInTokenRequestStarted','signInTokenReceived','sessionCreationAttempted','activationAcknowledged',
    'adminNavigationStarted','adminNavigationCompleted'];

export async function runManagedReadonlyPreflight({ actor, identityReceipt, snapshot, fixtures, record = () => {} } = {}) {
    const report = { status:'HOLD_READONLY_PREFLIGHT', livePass:false, stage:'INPUT', firstFailure:null,
        createsSession:false, automaticRetry:false, applicationWriteAttempts:0, nonGetRequestsBlocked:0,
        authProgress:Object.fromEntries(progressKeys.map(k=>[k,false])), existingSessionVerified:false,frontendSessionMatched:false,
        ownerPageGate:null, observationSteps:[], readPhaseComplete:false, barrierInstalled:false,
        barrierRemoved:false, routeDrainComplete:false, evidenceComplete:true };
    let barrier, tracker, verify;
    const save = () => { try { record(structuredClone(report)); } catch { report.evidenceComplete=false; throw Error('PREFLIGHT_EVIDENCE_HELD'); } };
    const stage = value => { report.stage=value;save(); };
    const fail = () => { report.firstFailure ??= report.stage; };
    try {
        assertIdentityReceipt(identityReceipt);
        const expected=managedActorIdentity.S1;
        assert.equal(actor?.owner,'S1');assert.equal(actor.expectedUserId,expected.ownerId);
        assert.equal(actor.binding?.shopId,expected.shopId);assert.equal(actor.page.context(),actor.context);
        assert.equal(actor.access.sessionLifecycleMode(),'TRACKED_OWNER_SESSION');assert.equal(actor.access.isAuthenticated(),true);
        stage('AUTHENTICATION_BASIS');
        const progress=actor.access.authenticationProgress();
        report.authProgress=Object.fromEntries(progressKeys.map(k=>[k,progress?.[k]===true]));
        assert.ok(Object.values(report.authProgress).every(Boolean));
        const session=actor.access.sessionObservation();
        report.existingSessionVerified=session?.ownerId===expected.ownerId && session.ownerVerified===true &&
            session.eligibleForCleanup===true && session.providerStatus==='active' && /^sess_[A-Za-z0-9]+$/.test(session.id||'');
        assert.equal(report.existingSessionVerified,true);
        assert.equal(actor.routeFailed(),false);
        const admitted=new Map(t2Commands(snapshot,true).filter(c=>c.owner==='S1').map(c=>[c.id,c.key]));
        assert.ok(Array.isArray(fixtures)&&fixtures.length>=1&&fixtures.length<=4&&new Set(fixtures.map(f=>f.id)).size===fixtures.length);
        for(const f of fixtures)assert.ok(admitted.get(f.id)===f.key&&f.owner==='S1'&&f.menu?.id===f.id&&f.menu.isPublished===false);
        tracker=actor.lifecycle?.tracker;assert.equal(typeof tracker?.wrap,'function');
        barrier=tracker.wrap(async route=>{
            try {
                const request=route.request();
                if(request.method()==='GET')return await route.fallback();
                report.nonGetRequestsBlocked++;
                if(new URL(request.url()).origin===target.origin)report.applicationWriteAttempts++;
                report.firstFailure ??= 'READONLY_NON_GET_BLOCKED';save();
            } catch { report.firstFailure ??= 'READONLY_BARRIER_HELD'; }
            await route.abort('blockedbyclient');
        });
        stage('INSTALL_READONLY_BARRIER');await actor.context.route('**/*',barrier);report.barrierInstalled=true;
        stage('TRACKED_FRONTEND_SESSION');
        report.frontendSessionMatched=await actor.page.evaluate(()=>window.Clerk?.session?.id)===session.id;
        assert.equal(report.frontendSessionMatched,true);
        stage('OWNER_PAGE');
        report.ownerPageGate=await verifyManagedOwnedPage({ role:'S1', page:actor.page, context:actor.context, access:actor.access,
            routeFailed:()=>actor.routeFailed()||report.firstFailure!==null });
        assert.equal(report.ownerPageGate.verified,true);
        verify=async owner=>{
            assertIdentityReceipt(identityReceipt);
            assert.equal(owner,'S1');assert.equal(actor.routeFailed(),false);assert.equal(report.firstFailure,null);
            const identity=await actor.page.evaluate(()=>({id:window.Clerk?.user?.id,pk:window.Clerk?.publishableKey,sessionId:window.Clerk?.session?.id}));
            report.frontendSessionMatched=identity?.sessionId===session.id;assert.equal(report.frontendSessionMatched,true);
            assert.equal(identity?.id,expected.ownerId);assertClerkPublishableKey(identity.pk);
            const r=await actor.access.read(actor.context.request,target.origin+'/api/admin/shop');
            assert.equal(r.status(),200);assert.equal((await r.json())?.shop?.id,expected.shopId);
            assert.equal(actor.routeFailed(),false);assertIdentityReceipt(identityReceipt);
        };
        const readOwner=async(id,owner)=>{
            await verify(owner);assert.ok(fixtures.some(f=>f.id===id));
            const r=await actor.access.read(actor.context.request,target.origin+'/api/admin/menus/'+id);
            assert.equal(r.status(),200);const menu=(await r.json())?.menu;assert.equal(menu?.id,id);return menu;
        };
        stage('READ_PRIVATE_FIXTURES');
        const observed=await observeT2RuntimePhase({phase:'PRE_WRITE_PRIVATE',fixtures,evidenceIds:[],
            actors:new Map([['S1',actor]]),readOwner,verify,recordStep:step=>{
                report.observationSteps.push(step);if(step.failed)report.firstFailure ??= step.step;save();
            }});
        for(const row of observed.rows)assert.ok(row.ownerFoodMatched&&row.ownerRevisionMatched&&row.adminFieldsMatched&&
            row.adminPublicationMatched&&row.publicApiStatus===404&&row.publicFieldsMatched&&row.publicDomMatched&&
            row.shopMembershipMatched&&row.savedPanelMatched);
        assert.equal(observed.rows.length,fixtures.length);assert.equal(report.firstFailure,null);
        stage('FINAL_OWNER_BASIS');await verify('S1');
        report.readPhaseComplete=true;
    } catch { fail(); }
    finally {
        if(report.barrierInstalled) {
            try {
                const drained=await tracker.drain(),s=tracker.snapshot();
                report.routeDrainComplete=drained.status==='QUIET_CONFIRMED'&&s.pending===0&&s.started===s.settled;
                assert.equal(report.routeDrainComplete,true);
                await actor.context.unroute('**/*',barrier);report.barrierRemoved=true;
                if(report.readPhaseComplete){stage('FINAL_READINESS');await verify('S1');}
            } catch { report.firstFailure ??= report.stage==='FINAL_READINESS'?'FINAL_READINESS':'PREFLIGHT_TEARDOWN_HELD'; }
        }
        if(report.readPhaseComplete&&report.routeDrainComplete&&report.barrierRemoved&&report.firstFailure===null&&report.evidenceComplete)
            report.status='READONLY_PREFLIGHT_COMPLETED_NOT_LIVE_SUITE_PASS';
        report.stage='FINISHED';try{save();}catch{report.firstFailure ??= 'PREFLIGHT_EVIDENCE_HELD';report.status='HOLD_READONLY_PREFLIGHT';}
    }
    return report;
}
