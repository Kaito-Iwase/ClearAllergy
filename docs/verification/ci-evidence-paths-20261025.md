# 既存CI経路・証跡の確認と再開条件

2026-10-25 UTC。対象コード `e70d037052242fbc6d0f78860e3a42d2405b681e`、main基点 `0b6ed291b2fd853230c7efdeeb1e061815404a81`。独立branch `codex/ci-evidence-paths-20261025`。#102成果branch `codex/utc-migration-boundaries-20261025` / `abffb13d2c987b2482bdfcdfbc8dfca3f17d6534` はそのまま保持。本作業は既存経路の利用・作者による説明訂正であり、#105の4回目独立レビューではない。最終人間レビュー待ちを維持する。

## 結果

既存コードの参照先・照合経路には今回修正すべき実行不具合を再現していない。`docs/agentic-development.md` に、追加版で実装済みのserver補助JSON/scope/snapshot照合を「未実装・未接続」とする旧説明が1段落残っていたため、現コードへ整合させた。旧段落は同文書の前後と矛盾していた。実装・テスト・workflow権限・credentials・環境変数設定・UIは変更しない。新branchの `git.deploymentEnabled: false` だけを追加する。

## 実イベントと実行経路

| 入口 | 設定されたイベント | 実際に呼ぶもの |
| --- | --- | --- |
| `.github/workflows/ci.yml` | main/developをbaseとする `pull_request`、main/developへの `push`、`workflow_dispatch`。同一refの古い実行はcancel | 依存配置、Prisma generate/validate、unit/lint/typecheck、別空DBのpublication upgrade、架空fixture、DB制約/公開/一覧/所有者/店舗回帰、build、隔離browser導入、保存公開fixture、起動したappの公開browser。GitHub-hosted Ubuntu、一時PostgreSQL、固定架空キー、`contents: read`。deployなし |
| `.github/workflows/dependency-audit.yml` | main/develop向けでpackage/lock/同workflow変更の `pull_request`、毎週月曜03:27 UTC、`workflow_dispatch`。pushなし | `npm audit --ignore-scripts --audit-level=high`。自動修正・deploy・専用artifact uploadなし |
| `agent-harness.mjs queue` | 手動CLI、workflowからの呼出なし | 正規取得した最新完全inventoryから候補を提案。GitHubへ接続・claim・PR作成はしない |
| `agent-harness.mjs verify/phase/summarize` | 手動CLI、workflowからの呼出なし | 明示base、編集plan、15分以内の完全inventoryとowner/依存/既存PR head/scopeを照合。verify/phaseの実行はさらに実GitHub-hosted `ci.yml` identity条件を要求。summarizeは保存済みreceiptの照合であり、現在ホストを実CIへ変える機能ではない |

任意候補branchへの通常pushでは上のCIは起動しない。別候補branchをbaseにしたPRもmain/develop向けPR条件を満たさない。今回のbranch公開を実CI実行済みと扱わない。APIが拒否されているため、現在のremote run/チェック/PR状態自体は未確認である。

## 生成・保存する証跡

| 経路 | 生成する内容・保存先 | 限界 |
| --- | --- | --- |
| 通常CI | Actions stepのexit/log、保存公開fixtureの `saved-publication-browser-result.json` と画像、公開browserの画像。失敗時 `collect-ci-diagnostics.ts` が `app-log-summary.json` を生成 | unit/DBの成功はstep log。専用の候補receipt/DB snapshot/build hash JSONを自動生成する構成ではない。公開browserは `check-first-use-browser.mjs` であり、別担当の `check-public-ui-browser.mjs` をこのstepは呼ばない |
| CI upload | `if: always()` で `$RUNNER_TEMP/clearallergy-browser-results` を `prototype-browser-${github.sha}` として7日保存。fileなしはignore | `.agent-runs/` はupload対象でない。失敗前の到達段階で画像/結果JSONがない場合もある。artifact名のSHAと実runのevent/checkout SHAを照合する必要がある |
| CI失敗診断 | serverReady/DB/認証/schema/競合/例外等の固定カテゴリ件数、sourcePresent/truncated、`rawLogIncluded:false` | 生server log・接続値・自由文はuploadしない。要約だけでは失敗原因や全実行成功を確定しない |
| verify | `.agent-runs/<新規名>.json`：HEAD/base/source/lock/runner hash、Node/npm、command定義hash・exit・output hash・固定診断・test件数、diff/必要gate/手動未確認 | 前提拒否では `kind:preflight`、`commands:[]`、`codeChecksStatus:NOT_RUN`。基本検査だけ成功しても必須DB/browser/手動が不足すればUNVERIFIED |
| phase | `.agent-runs/<新規名>.json`：candidate前後、run ID、実exit/時間/checkpoint、build前後hash、固定診断 | source/lock/runnerとbuildが違うreceiptを流用しない。失敗/未実行はPASSにならない |
| owned public phase | `server-public-<run ID>.json` / `server-propagation-<run ID>.json`：候補/build/run結合、固定server log分類、check exit・所有server停止結果 | 現buildを自分のloopback portで起動・停止。既存appは流用しない。直接fixture試験のcandidateId=nullを実候補の証跡として集約できない |
| summarize | 参照receiptとserver補助JSONを実読込しhash/run/phase/candidate/build/終了結果を照合、必要phaseを実Git差分から追加 | missingはUNVERIFIED、不一致/失敗はFAIL。manual/independentReview/remoteChecksは別の未確認。署名付きattestationではない |

CIのcheckoutがPR merge commitなら `${github.sha}` / checkout HEADはPR branch headと異なる。対象runのevent・head/merge SHA・checkout実体を区別する。uploadがあることだけでcandidate hashやremoteChecksまで照合済みとは扱わない。

## 今回利用できたものと不足

- PASS：配置済みコードとworkflow/文書のread-only照合、既存の局所テスト39件（固定fixture/純粋関数/小さな所有processのみ）。GitHub API・Prisma engine・本番DBへ接続しない。
- UNVERIFIED：現在のIssue/PR/head/dependencies/comments/filesの完全なlive inventory、実Actionsのrun/jobs/checks/artifact取得。先行API/GraphQL Forbiddenを再試行していない。新PR作成・workflow dispatchも行っていない。
- UNVERIFIED：通常のgenerate/validate/unit/typecheck/build/実DB/実browserの今回の再検証。先行の公式Prisma engine CONNECT 403は未解消で、再試行・checksum回避・別配布先は使わない。新worktreeでは既存lockと一致する先行worktreeの依存をsymlinkで共有し、局所テストだけを実行。再生成・インストールなし。
- UNVERIFIED：P0 phase pipeline全経路。最新完全snapshotと実CI identityがなく、保存済みpreflightはNOT_RUN。手書きsnapshotやCI flagsで通さない。通常CIはP0 runnerを自動呼出せず、既存docsがP1別差分としているsnapshot/propagation/追加の別空DB移行jobも未接続。新しいworkflowやハーネスは作らない。
- UNVERIFIED：実Clerk/Blob/Preview分離/production、required-check policy、運用backup/実データ。CIローカル成功から昇格しない。

## 実コマンドと証跡

対象HEAD `e70d037052242fbc6d0f78860e3a42d2405b681e` で次を1回実行した。

`node --import tsx --test --test-reporter=tap tests/agent-harness.test.ts tests/harness-context.test.ts tests/verification-evidence.test.ts tests/ci-log-summary.test.ts`

PASS：39成功、失敗/skip/cancelled 0、exit 0。scope外/rename/untracked、live inventory不足、server補助JSONの欠落/改変/別run/build/candidate、所有server停止、公開失敗、秘密marker非出力、保存先置換拒否を既存テストで検査した。合成fixtureの成功であり、実GitHub CIのreceiptではない。既存のfixture test内snapshotをlive inventoryとして使用していない。文書訂正後の `node scripts/check-context-links.mjs` は237参照PASS、JSON/branch guard、`git diff --check` もPASS。実結果とsource/output hashは[判定JSON](ci-evidence-paths-20261025.json)に記録する。

局所TAPは `.agent-runs/ci-evidence-existing-tests.tap` に保存。前回の#102の7境界と失敗理由は元branchの `docs/verification/utc-migration-recovery-20261025.md` / `.json` と `.agent-runs/utc-boundaries-harness-preflight.json` に保存された記録を読み、再実行しなかった。Prisma障害の根拠は公式engine CONNECT 403、未生成 `.prisma/client/default.js` の例外、test9ファイルとDB検証が `lib/db/index.ts` のmodule初期化で停止したlogである。製品コードの回帰を除外した証明ではなく、今回の失敗箇所を初期化制約として特定したもの。

## 有限の再開手順

1. 正規のGitHub APIアクセスが復旧した環境で、既存PRの有無・番号・head/base・review/checksを先に確認する。先行PR作成はForbiddenで成功確認なしのため、重複PRを作らない。#102/#105の人間レビュー待ち・3回上限を維持する。
2. 既存Actionsだけの実証跡を得るなら、許可された既存 `CI` の候補refに対するworkflow_dispatch、またはmain/develop向けの既存PRイベントを使う。既存PRの変更・main push・merge・deployを回避のために行わない。候補branchのPreview抑止と対象refを確認し、workflow権限・credentialsは変更しない。現在のタスクではdispatchしない。
3. 対象runのevent、run ID/attempt、workflow commit、head SHA/merge SHA、job/step結論、runtime、artifact名/保持期限を取得する。artifactを正規downloadして内容とhashを照合し、今回候補と一致するものだけを記録する。現在の7日保持外のartifactは存在を推測せず未確認とする。
4. P0 receiptが必要なら、既存手順どおり同じcandidate/baseの正規取得inventoryと許可planを用意し、実際の信頼できる一時CI内で `phase ... --phase <既存ID> --output <新規名>.json`、同じ条件で `summarize ...` を使う。inventoryは各呼出時に15分以内の完全な実情報が必要で、長い実行の後は正規再取得する。新規名を使い既存証跡を上書きしない。現workflowがその呼出/保存を接続していない以上、dispatchだけでP0 receiptも生成されるとは説明しない。接続変更が別途必要なら現在は保留し、ホストのCI flags偽装で代用しない。
5. Prisma公式配布への正規アクセスが必要なgateは取得可能な環境で再開する。DB書込は新しい空の隔離DB/合成fixtureのみ。P0全経路/remoteChecks/手動/reviewの未確認を、単体テストや通常CI artifactで解消済みにしない。
