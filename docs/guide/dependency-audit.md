# Dependency audit gate

Scope: issue #153. This is a proposed code change until reviewed and merged by an explicitly authorized human. No deployment or repository protection setting is changed here.

## Required CI versus scheduled discovery

The existing `Test, lint, typecheck, and build` job runs `npm audit --ignore-scripts --audit-level=high` after `npm ci`, before tests/build. The command audits locked production and development dependencies. There is no path filter, conditional step, `continue-on-error`, production-only omission, or fallback that treats an unavailable registry as clean. A three-minute timeout fails the job rather than waiting indefinitely. This uses the existing required check; do not add the path-filtered standalone audit as a required check.

The standalone dependency-audit workflow remains supplementary weekly/manual discovery and dependency-PR feedback. Ordinary, docs-only, Node-only and dependency PRs targeting the CI branches all run the build gate. Staging's existing CI-success prerequisite includes this command only when the tested test/staging revision also contains this change and that CI succeeds. Merging to main alone does not establish that condition. No staging run is authorized by this change alone.

## Failure and recovery

- High/critical advisory: keep the PR blocked, inspect the advisory, dependency path and fix; do not weaken tests or use `npm audit fix --force` blindly.
- Registry/network failure or timeout: blocked/unknown, not zero vulnerabilities. Retry the unchanged check only after the service recovers.
- Moderate/low findings: the command may exit zero. Record reachability, exploitation conditions, available fixes and review date separately.
- Workflow disabled, missing or cancelled: no successful evidence. Confirm the required check applies to the exact head and base before merge.
- Workflow edits can remove the gate or make a job skip successfully. These source-level contract tests help detect accidental drift but are not a tamper-proof policy boundary. Review workflow changes; any external ruleset/security changes require separate approval.
- Vercel Git production deployment can precede post-merge CI. This PR does not establish CI-controlled production deployment, enable auto-merge, or authorize any deployment.

## Baseline observation (2026-11-12)

Main `7b9933af23c1fb834a6b0ad1b169484995040795`, Node 22.23.5, npm 11.18.0: live audit exited zero with high 0 / critical 0 / moderate 8. These are affected-package counts, not eight distinct advisories. The reported advisory was [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), minimatch globparts amplification, through the development ESLint/typescript-eslint toolchain. Public-request runtime reachability has not been demonstrated; hostile patterns during development/build still require evaluation. The suggested eslint-config-next downgrade must not be applied automatically. Recheck upstream compatible fixes by 2026-11-19, or sooner on severity/exploit changes. Passing high-threshold audit is not vulnerability-free certification.

Node/Docker runtime advisories, GitHub Actions advisories and the actual Vercel Function runtime are outside npm's package audit. Node and Docker pins currently agree at 22.23.5; Vercel project version selectors are not proof of deployed patch versions. Dependabot alerts/security-update enablement remains unverified where the connector cannot read the endpoint.

## Verification boundaries

`tests/ci-dependency-gate.test.ts` checks the repository's current text contract; it is not a complete GitHub workflow interpreter or a live ruleset test. Real GitHub event, cancellation, required-check and deployment behavior needs separate observed evidence. DB, authorization, ownership, allergen and publication checks remain unchanged in the existing CI. Do not report unexecuted checks as successful.

Local verification on Node 22.23.5 / npm 11.18.0: 589 tests passed; lint, typecheck and production build passed. Synthetic npm registry tests confirm clean exit 0, high finding exit 1 with high-count 1, malformed JSON exit 1, and HTTP 503 exit 1. No vulnerable package was installed. The Docker daemon was unavailable, so real PostgreSQL and browser E2E were not rerun. GitHub CI and deployment inhibition have not been verified for this candidate; no push or deployment was performed.
