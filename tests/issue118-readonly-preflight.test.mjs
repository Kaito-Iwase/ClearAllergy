import assert from 'node:assert/strict';
import test from 'node:test';
import { runManagedReadonlyPreflight } from '../scripts/issue118-readonly-preflight.mjs';

test('preflight with absent or invalid receipt is HOLD before browser, auth or writes; unchecked progress stays false',async()=>{
    let touched=0;const actor=new Proxy({}, {get:()=>{touched++;throw Error('SYNTHETIC_PRIVATE');}});
    for(const identityReceipt of [undefined,{}, {origin:'https://other.invalid'}]) {
        const r=await runManagedReadonlyPreflight({actor,identityReceipt});
        assert.equal(r.status,'HOLD_READONLY_PREFLIGHT');assert.equal(r.firstFailure,'INPUT');
        assert.equal(r.livePass,false);assert.equal(r.createsSession,false);assert.equal(r.barrierInstalled,false);
        assert.equal(r.existingSessionVerified,false);assert.ok(Object.values(r.authProgress).every(x=>x===false));
        assert.doesNotMatch(JSON.stringify(r),/SYNTHETIC_PRIVATE|https:|sess_|user_|Bearer/);
    }
    assert.equal(touched,0);
});
