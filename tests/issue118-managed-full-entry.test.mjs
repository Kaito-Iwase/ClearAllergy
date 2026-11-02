import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {decodeManagedFullInput,encodeManagedFullInput} from '../scripts/issue118-managed-full-entry.mjs';
test('bounded FULL codec refuses malformed/oversize/unknown fields with fixed errors',()=>{
    for(const value of ['', 'https://SYNTHETIC_PRIVATE', 'a'.repeat(50001),encodeManagedFullInput({token:'SYNTHETIC_PRIVATE'}),encodeManagedFullInput({x:'a'.repeat(450001)})])
        assert.throws(()=>decodeManagedFullInput(value),e=>e.message==='MANAGED_FULL_ENTRY_REFUSED'&&!e.cause);
});
test('actual CLI with no new approval fails before authentication and never prints input',()=>{
    const child=spawnSync(process.execPath,['scripts/issue118-managed-full-entry.mjs','--apply'],{cwd:process.cwd(),encoding:'utf8',
        env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,ISSUE118_FULL_INPUT:encodeManagedFullInput({authorization:{status:'PENDING'}})}});
    assert.equal(child.status,1);assert.equal(child.stdout,'');assert.equal(child.stderr.trim(),'MANAGED_FULL_ENTRY_REFUSED_NO_RAW_ERROR');
});
test('workflow candidate stays manual fixed-ref, same global mutex, first attempt, independent source artifact and pre-secret admission',()=>{
    const text=readFileSync(new URL('../.github/workflows/issue118-live-e2e.yml',import.meta.url),'utf8');
    const job=text.slice(text.indexOf('  managed-full-resume:'));
    assert.match(text,/default: HOLD/);assert.match(text,/group: clearallergy-main19-live-fixtures/);assert.match(job,/github.run_attempt == 1/);
    assert.match(job,/inputs.expected_runner_sha == github.sha/);assert.match(job,/refs\/heads\/test\/issue118-live-t1-20261030/);
    assert.match(job,/actions: read/);assert.doesNotMatch(job,/actions: write|contents: write|continue-on-error|workflow_call/);
    assert.ok(job.indexOf('--preflight')<job.indexOf('secrets.ISSUE118_TEST_CLERK_SECRET_KEY'));
    assert.ok(job.indexOf('actions/download-artifact@v4')<job.indexOf('--preflight'));
    assert.match(job,/run-id: \$\{\{ steps.source.outputs.source_run \}\}/);assert.match(job,/--apply/);
    const guards=readFileSync(new URL('../scripts/browser-runner.mjs',import.meta.url),'utf8');assert.match(guards,/tests\/issue118-managed-full-entry.test.mjs/);
});
