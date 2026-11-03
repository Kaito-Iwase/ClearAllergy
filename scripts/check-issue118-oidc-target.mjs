// One diagnostic only: no OIDC request, Clerk, browser or app API call.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ciIdentity, inspectOidcRequestTarget } from './issue118-ci-auth.mjs';

export function oidcTargetDiagnostic(env) {
    if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
        env.GITHUB_RUN_ATTEMPT !== '1' || env.GITHUB_REPOSITORY !== ciIdentity.repository ||
        env.GITHUB_REPOSITORY_ID !== ciIdentity.repositoryId || env.GITHUB_REF !== ciIdentity.ref ||
        env.GITHUB_WORKFLOW_REF !== ciIdentity.workflowRef || env.ISSUE118_GITHUB_ENVIRONMENT !== ciIdentity.environment ||
        env.ISSUE118_DIAGNOSTIC_MODE !== 'OIDC_TARGET_ONLY' || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') ||
        env.GITHUB_SHA !== env.ISSUE118_EXPECTED_RUNNER_SHA || env.ISSUE118_APPLY ||
        env.ISSUE118_TEST_CLERK_SECRET_KEY || env.DEBUG || env.PWDEBUG || env.NODE_OPTIONS ||
        env.NODE_DEBUG || env.ACTIONS_STEP_DEBUG === 'true' || env.ACTIONS_RUNNER_DEBUG === 'true')
        throw Error('OIDC_DIAGNOSTIC_CONTEXT_REFUSED');
    const predicates = inspectOidcRequestTarget(env.ACTIONS_ID_TOKEN_REQUEST_URL);
    return { stage: 'DIAGNOSTIC_STOP_BEFORE_REQUEST',
        code: predicates.guardAccepts ? 'OIDC_TARGET_GUARD_MATCH' : 'OIDC_REQUEST_TARGET_REFUSED',
        predicates, oidcRequestSent: false, clerkStarted: false, browserStarted: false, fixtureWriteStarted: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        if (process.argv.slice(2).join(' ') !== '--diagnose-only' || !process.env.RUNNER_TEMP)
            throw Error('OIDC_DIAGNOSTIC_CONTEXT_REFUSED');
        const result = oidcTargetDiagnostic(process.env);
        const directory = join(process.env.RUNNER_TEMP, 'issue118-oidc-target');
        mkdirSync(directory, { recursive: false }); // Never replace a previous diagnostic result.
        writeFileSync(join(directory, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
        console.log(JSON.stringify(result));
    } catch { console.error('OIDC_DIAGNOSTIC_REFUSED_NO_RAW_ERROR'); process.exitCode = 1; }
}
