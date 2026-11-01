# Issue118 callback signature/shape-only diagnostic

## Fixed deployment and existing modes

App source: `aa92dbba35088f807b8f54a7548556ab4009a37b`, based on 6293d5a. Existing test Project `clear-allergy-e2e` / `prj_0i0cPZtGyoPYXnnB1XaC17DmLXBK`, Preview / exact `test/staging`.

- Deployment: `dpl_3eX9TYFPF4JyCTTJoBpkwpy1hq3C`
- Immutable origin: `https://clear-allergy-e2e-96jt03000-kaitoexe00-9350s-projects.vercel.app`
- Clerk Development: `one-dolphin-7936.clerk.accounts.dev`

Dashboard and CLI metadata identify Ready / Preview / source SHA / branch. Existing 4 Secrets and 8 Configs remain Preview/test/staging scoped; All Deployments protection remains enabled. Metadata is not cryptographic source proof: retain the sent clean local tree and file manifest. A fresh non-secret receipt no older than 10 minutes must match target/source/owner/shop/protection before any request. Owner matching is receipt matching, not a fresh authenticated ownership proof.

`PREPARE_SERVER_CALLBACK_DISABLED` and its synthetic .invalid fixture stay disabled. Normal live/T1 targets, authentication and write guards are unchanged. The distinct entry is `DIAGNOSE_DEPLOYED_SERVER_CALLBACK_ONLY` / `--deployed-diagnostic-only`. Default HOLD, workflow_dispatch only, exact repository/ref/workflow/Environment, run_attempt=1, expected runner SHA, job-local OIDC and exclusive concurrency are retained. No Clerk Secret is delivered to this diagnostic job step.

## Requests and unconditional stop

1. One OIDC request using only the official runner-provided URL under the existing guard. Local claim checking is a deny guard, not signature verification; Vercel verifies the token.
2. A new temporary browser context request API sends GET to fixed app `/admin/login`.
3. GET to the configured Clerk Development initial handshake, using the existing pinned SDK contract.
4. GET containing exactly one legacy carrier back to the same fixed app `/admin/login`. Only this callback has the diagnostic marker header.

There are at most three app/Clerk GETs. OIDC headers go to the app only, never Clerk. No global context headers, personal profile, or imported session. Redirects/retries are zero. Callback and cookies may contain session-related information; values, URLs and hashes are not logged.

The app checks its guards before accessing the existing test Secret, then performs at most one GET to fixed `https://api.clerk.com/v1/jwks`. Public SDK crypto compares signature and directive shape only; normal callback application is skipped. No fourth GET, ClerkJS, Backend testing token, ticket/login/session API, menu API, DB or Blob operation. This diagnostic does not establish T1 success or retroactively prove the old deployment's root cause.

## Results, unknowns and closing

Only closed server schemas are accepted: fixed stage/code plus 17 booleans, or a fixed two-field GUARD. Valid HTTP409 diagnostic classifications are retained. Unknown strings/fields/types, contradictory success, Location, oversize or unknown exceptions produce HOLD without raw provider output. The 16KiB response bound is an acceptance limit after Playwright buffering, not a preallocation memory guarantee.

Diagnostic completion and signature/shape acceptance are separate. A completed HOLD observation is not signature success; CLI exits 1. Context and browser are closed in that order and confirmed independently. One close success cannot prove both; missing handles after attempted creation are unverified. Local closing does not prove provider state/cookie revocation. No automatic replay after uncertainty.

## Verification and execution boundary

`node --test tests/issue118-server-callback-candidate.test.mjs` and existing `node scripts/browser-runner.mjs issue118-live-guards` use synthetic claims/transport/server responses only. Cases cover fixed/new/old targets, branch/source/owner/protection, attempt2, ambient secrets, OIDC target/claims, redirects/queries, invalid signatures, fixed server HOLD, unknown sensitive extra fields, unknown errors, bounds/deadlines, closing failures and T1-only Secret delivery.

Only after limited review and both head/PR CI pass for the new runner SHA may the approved single diagnostic run occur with fresh receipt and no concurrent live run. Normal authentication, DB/Blob and full live coverage on this new app remain unverified.
