import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,basename,sep} from 'node:path';
import {decodeManagedResumeBundle,claimManagedDispatch,target} from '../scripts/check-issue118-live-t1-browser.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const make=value=>{
    const bytes=Buffer.from(JSON.stringify(value));
    return {managedResumeBundle:gzipSync(bytes).toString('base64url'),managedCheckpointAttestation:{
        verifiedBy:'cli_metadata_observer',bundleSha256:hash(bytes),artifactSha256:'a'.repeat(64),githubRunId:'12345',
        evidenceReference:'https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/12345'}};
};
const body=()=>({initialSnapshot:{},preparationState:{},checkpointReceipt:{terminalMetadataReceipt:{artifactSha256:'a'.repeat(64),githubRunId:'12345'}},terminalProof:{},nextCellId:null});
test('bounded non-secret checkpoint bytes preserve prep/proof bindings; codec alone does not authorize a session',()=>{
    const value=body();assert.deepEqual(decodeManagedResumeBundle(make(value)),value);
});
test('changed artifact run/hash, payload, missing keys and unbounded gzip refuse without raw text',()=>{
    const value=body(),valid=make(value);
    for(const receipt of [{}, {...valid,managedResumeBundle:'bad+base64'},
        {...valid,managedCheckpointAttestation:{...valid.managedCheckpointAttestation,bundleSha256:'b'.repeat(64)}},
        make({...value,checkpointReceipt:{terminalMetadataReceipt:{artifactSha256:'b'.repeat(64),githubRunId:'12345'}}}),
        make({...value,checkpointReceipt:{terminalMetadataReceipt:{artifactSha256:'a'.repeat(64),githubRunId:'other'}}}),
        make({...value,unexpected:'SYNTHETIC_SECRET'}),make({...value,preparationState:{oversize:'x'.repeat(270000)}}),
        {...valid,managedCheckpointAttestation:{...valid.managedCheckpointAttestation,evidenceReference:'https://other.invalid/'}}]){
        assert.throws(()=>decodeManagedResumeBundle(receipt),error=>error.message==='MANAGED_RESUME_BUNDLE_REFUSED'&&!error.cause&&!error.stack.includes('SYNTHETIC_SECRET'));
    }
});
test('PC dispatcher durably consumes a checkpoint before sending; a second use remains refused after process restart',()=>{
    const directory=mkdtempSync(join(tmpdir(),'issue118-dispatch-'));
    try{
        const input={directory,checkpointKey:'a'.repeat(64),runnerSha:'b'.repeat(40)};
        const claim=claimManagedDispatch(input);assert.equal(claim.state,'PENDING_CONSUMED_NO_RETRY');
        assert.equal(claim.applicationSha,target.source);const bytes=readFileSync(join(directory,readdirSync(directory)[0]),'utf8');
        assert.deepEqual(JSON.parse(bytes),claim);
        assert.throws(()=>claimManagedDispatch({...input}),{message:'MANAGED_DISPATCH_CHECKPOINT_ALREADY_CLAIMED_OR_UNWRITABLE'});
        assert.equal(readFileSync(join(directory,readdirSync(directory)[0]),'utf8'),bytes);
        assert.throws(()=>claimManagedDispatch({...input,checkpointKey:'../other'}));assert.equal(readdirSync(directory).length,1);
    }finally{
        assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep)&&basename(directory).startsWith('issue118-dispatch-'));
        rmSync(directory,{recursive:true,force:true});
    }
});
