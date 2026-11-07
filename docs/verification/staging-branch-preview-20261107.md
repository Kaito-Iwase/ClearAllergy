# branch限定 Preview: 完全checkoutでの検証（2026-11-07）

Base: `c8ef34554263166405d9e80f4a21f2e2ca6d7e8d`。元候補patchのSHA256は
`760bb92e0264690792fcded7d89200651b3ac5b9925d13dd6263896387fee073`。
部分snapshotの結果を全体検証と混同せず、独立した完全cloneで適用・検証した。

## 今回の結果

- Node **22.23.4**: 公式Linux配布と公式SHA256を照合。npm **10.9.9**。
  CIはnpm11.18.0のため、同一npm版でのLinux CI結果はPRで別途確認する。
- `npm ci --no-audit --no-fund`: PASS、433 packages。依存定義・lockfile変更なし。
- `npx --no-install prisma generate`: PASS。DB migrationではない。
- `npm test`: **540/540 PASS**、skip0。adapter/source/model 160件を含む。
- `npm run lint`: PASS、unused importを除去して再実行、warning0。
- `npm run typecheck`: PASS。
- `npm run build`: PASS。CIと同じ架空Clerk値・loopback DB指定を使用し、実資格情報は使っていない。
- `npm audit --ignore-scripts --audit-level=high`: PASS（exit0）、既存moderate8件は残る。
  fixや依存更新は実施していない。
- `git diff --check`: PASS。
- 公式actionlint **1.7.12**をchecksum照合して実行。無条件実行はFAIL：既存から維持する
  `concurrency.queue`をschemaが認識しない1件だけ。
  そのexact診断だけをCLIでignoreするとPASS。他の診断なし。repoにignore設定は追加していない。
  これを無条件actionlint成功やGitHubサービス上の新workflow検証済みとは扱わない。

実PostgreSQL・ブラウザE2E・GitHubのrequired CI・Vercel初回配備・SSO/Clerk/Blob/固定URLは
このローカル検証の対象外。postgres/dockerがこのcloudにないため、実DB回帰とE2EはPR CIへ残す。
配備workflowはactivation flagが無い限り無効であり、今回有効化・token操作・設定変更・配備はしない。

## 元patchからの追加変更

- unusedなtest importを1件除去。runtime adapterは元160-test候補から変更なし。
- 最初のpush commitに `ci/staging-branch-preview-20261107:false` と
  後続同期用の `ci/staging-sync-20261107:false` を含める。
  baseだけのremote branchを先行作成しない。未指定mainと通常Productionの動作は変えない。
- 過去の部分snapshot検証をこの文書の後半へ移し、完全checkout結果と区別する。
  製品UI/API/DB schemaやapp依存/lockは変更しない。

## レビュー・残るgate

独立read-onlyレビューは最新完全checkoutとの差分を確認し、新P1/P2を検出していない。
runtimeが元候補と同一であること、追加false ruleがexact指定のみであることを確認した。
PR CI・最新base/head・採用判断はこのローカル結果とは別に記録する。
merge、staging branch同期、DB migration整合、token・security設定、初回配備は担当者の別gate。
[導入・復旧チェックリスト](../guide/staging-actions.md)の未確認事項は残る。

## 初期の部分snapshot検証記録（以下は過去時点）

以下の「未実施」「変更なし」は完全checkout検証前の記録であり、今回の結果は上記を優先する。

# Local integration verification, 2026-11-07

This is a **partial source snapshot**, not a full checkout or published branch.
Base: c8ef34554263166405d9e80f4a21f2e2ca6d7e8d (merged PR #132).
The public GitHub connector materialized 15 necessary text files. All 15 original
Git blob SHA-1s were independently checked using Git's blob framing; see
SOURCE-MANIFEST.json. The recursive pinned tree contained no `.agents` skills or
additional AGENTS files. Root AGENTS and relevant guide/development/maintenance/
verification docs were read. The explicit task authorized this isolated cloud
location rather than changing the canonical Windows checkout.

No credentials, live Vercel variables, settings, deployments, aliases, commits,
pushes or PRs were read/created/changed. Only public GitHub source/ref reads and
local file/test operations were performed. Existing worktrees and the prototype
reference directory were not changed.

## Checks

- PASS: 160 local tests (100 guard/source/workflow/model tests plus 60 adapter tests),
  `node --test tests/staging-actions.test.mjs tests/staging-adapter.test.mjs`.
  All network responses and clock in these tests are injected fixtures.
- PASS: `node --check` for all three implementation .mjs files.
- PASS: YAML parsing and asserted workflow structure with installed PyYAML.
  This is not GitHub service validation or actionlint.
- PASS: exact 15 baseline blob hashes; generated patch applies cleanly against
  reconstructed baseline with `git apply --check`; whitespace check performed.
- NOT RUN: actionlint (not installed), full npm test, lint, typecheck, build,
  Node22 execution, live GitHub job/concurrency/Environment/API behavior,
  Vercel deployment, SSO/Clerk/DB/Blob/HTTP/browser checks.
  The full app source/dependencies are not materialized; no install was attempted.
- Environment: Node v24.22.1; npm 11.9.0. Existing CI uses Node22 and tsx for TS tests.
  Two new/replacement tests are .mjs and explicitly added to npm test; strict
  tsconfig was read, no TS implicit-any test files were introduced. Existing ESLint
  configuration was read but actual lint remains unverified without dependencies.

The patch replaces the existing workflow/helper, removes the old policy-specific
TS test, and installs its replacement guard suite plus adapter tests. No parallel
old deployment workflow or CLI pull/build/alias path remains. The pure older
staging-policy dry-run tools are not runtime deployment entrypoints and are unchanged.
Application source, dependencies, lockfile, CI workflow, vercel.json and AGENTS
are unchanged. Only package test command integration changes.

Workflow actions are pinned to official refs read on 2026-11-07:
- https://api.github.com/repos/actions/checkout/git/ref/tags/v7
  → 3d3c42e5aac5ba805825da76410c181273ba90b1 (commit)
- https://api.github.com/repos/actions/setup-node/git/ref/tags/v6
  → 249970729cb0ef3589644e2896645e5dc5ba9c38 (commit)
This pins the action source, not the hosted runner image or downloaded Node binary.

Independent read-only review reran the prior 131/131 suite and targeted negative
cases before this final coverage/mapping audit. The current 160-test run is reported
separately; do not infer independent review of the additions from that earlier count. No remaining P1/P2 issue was identified within this documented scope. This
is local code review, not live rollout approval or a full-repository verification.

## Readiness boundary

Local tests prove rejection and request behavior for fixtures, not actual platform
semantics. Raw SDK shapes are pinned in docs/guide/staging-actions.md. Environment
API responses include value fields even with decrypt=false. The adapter drops them
without logging; metadata-only network access is **not** established. The reviewed raw metadata mapping requires encrypted/config (8) and sensitive/secret
(4), with decrypted=false for every received entry, including Production. Missing legacy fields, unknown
visibility, conflicting types or decrypted=true fail closed. This mapping was supplied
from the earlier read-only metadata observation; no new live env request was made. Verify the actual encrypted/
sensitive response behavior before activation, without exporting app plaintext.

Outstanding remote builds are checked across all listed pages, but timestamps,
retention, deletion and eventual consistency cannot give a global writer lock.
A durable Actions-history failure barrier protects A-lost-response → B-new-run,
subject to retained, complete history. It never treats an empty Vercel list as proof
that an uncertain POST did not execute. Routine pre-create superseded runs are
successful no-ops; other preflight errors deliberately stop subsequent work.

The approved bootstrap alias ID is not a perpetual manual update. Later mappings
must belong to the dedicated Preview and have matching provider/source SHA plus
historical successful CI and writer records. Caller-controlled metadata is not
cryptographic proof that that writer created that ID; a fully capable external
writer can copy it. External writer control remains an activation prerequisite.

No guard undoes an already created wrong target or early/stale alias exposure.
No automatic alias/rollback/delete mutation exists. Full consolidated rollout and
incident-reset approval checklist is in docs/guide/staging-actions.md.

## PR #132 regression coverage audit

The old 267-line TS suite was compared case-by-case against both .mjs replacements.
The initial larger prototype count did not retain every old explicit case. Sixteen
source/workflow/model tests were added to preserve manual/cancelled CI, fork trigger,
fetched repo ID/name, false workflow path/ID, short SHA, CI blob drift, conflicting
wildcard enable, alias override, repeated fresh gates, checked config rules, staging
base-PR/push trigger filters and queue stale-arrival/100-entry overflow behavior.
The missing-token local-failure assertion is also retained in the adapter suite.
Queue tests are a documented-policy model, not actual scheduler validation. Their
capacity-recovery model does not override the adapter's no-rerun incident policy.

Intentional replacements: disconnected Git and branchless Preview assertions are
reversed to enforce retained Git and exact branch-scoped inventory. The old relaxed
project-object deployment fallback is replaced with mandatory full identity fields.
Old alias-before-verification prohibition and explicit alias-last step are replaced
by early-alias hazard tests and read-only mapping checks; this candidate cannot
promise verification before the URL switches. Response-body status-specific error
text is replaced with fixed redacted error classes and no redirects. These are
changed contracts, not claims that old assertions pass unchanged.
