# 専用stagingのCI後配備候補 — 2026-11-06

状態は **未採用・未有効・実配備未検証**。baseはmainの `bc7dfa9`（#131）、作業branchは `ci/staging-actions-20261106`、独立worktreeは `/workspace/ClearAllergy-staging`。2026-11-06の初回委任は実装・テスト・PR準備までで、当時はcommit/pushを行っていません。2026-11-07に検証branchのpushとDraft PR作成が承認され、配備抑止を確認してGitHub CIへ進む方針になりました。外部Vercel設定、資格情報の作成・権限拡大、実deploy、main mergeは引き続き範囲外です。最新のGitHub CI run・対象SHA・結果はDraft PR本文に記録します。

## 実装範囲

- 通常CIのpush対象へ `test/staging` を追加。既存のDB・UI回帰やunitの範囲を削減しない。
- 公式Actionsの `workflow_run` / checkout / setup-node と、固定Vercel CLI 65.12.1のpull/build/prebuilt deploy/aliasを利用するworkflowを追加。初期状態はrepository variableで無効。
- 実行コードは `scripts/staging-actions.mjs`。正規CI・exact SHA/run/attempt・最新head・保護branch・設定blob・Preview・専用project・固定aliasをread-only APIで検査する。状態DB・独自retry controller・lock serviceを追加しない。
- `vercel.json` に `test/staging` と準備branchのfalseを追加。default branch等の従来配備は維持。
- [運用手順](../guide/staging-actions.md)、開発手順、変更対応表、旧dry-runの位置付け、検証索引を更新。README/AGENTSの入口・作業規則・製品仕様は変わらないため更新不要。

## 実行した検証

クラウドLinux、Node **22.23.4**（一時ディレクトリに隔離したNode配布）、実npm **11.9.0**。workflowの予定npmは既存CIと同じ11.18.0。通常依存の `npm ci --cache /tmp/clearallergy-npm-cache` は成功。アプリのpackage/lockfileは変更していない。

| 検査 | 結果 |
| --- | --- |
| `node --import tsx --test tests/staging-actions.test.ts` | PASS、32/32、skip0。API代用品だけ。外部書込なし |
| `npm run lint` | PASS |
| actionlint 1.7.11、変更した2workflow（shellcheck無効） | PASS。初回にjob envでrunner contextを参照した問題を検出・修正し、再実行成功 |
| Python YAML構文読取、JSON読取、`git diff --check` | PASS。YAML読取だけではActions expressionの検査にならないためactionlintも実施 |
| CLI 65.12.1 `deploy/pull/build --help` | PASS。`--environment`、Preview pullのgit-branch、buildのstandalone、prebuilt/meta/aliasとURL stdout契約を照合。認証・実build・実deploy試験ではない |
| `prisma generate` | BLOCKED、binaries.prisma.shへのchecksum取得が403。通信設定の変更・checksum検証の迂回なし |
| `prisma generate --no-engine` | 同じ配布先へのchecksum取得でBLOCKED。生成済みClientは得られず |
| `npm run typecheck` | FAIL、未生成Prisma Client由来の型エラー。初回に追加テストのliteral型エラー4件もあり修正済み。最終実行の追加テストエラーは0件 |
| `npm test` | FAIL、Prisma Client未生成により11ファイルが読込失敗。失敗名はbaseと同一。最終結果は下記 |
| `npm run build` | FAIL、prebuildのPrisma生成が403で停止。Next buildの成功は未検証 |
| GitHubでの通常CI、staging workflow実行 | UNVERIFIED。push/PR/mergeを実行していない |
| 固定URLの新SHAへの反映、HTTP/SSO後の画面、Clerk/Blob/保存公開 | UNVERIFIED。実deployやアプリ操作は委任範囲外 |

通常unitの環境差切分けではbase `bc7dfa9` の独立checkoutで同じ依存とNodeを使い、265件中254PASS・11FAIL・skip0を確認した。candidateは297件中286PASS・11FAIL・skip0で、失敗ファイル名11件はbaseと同一だった。Prisma未生成で全体のtest定義が読み込めていないため、この件数を完全な回帰件数と扱わない。最終typecheckは209件のPrisma関連エラーで、追加したstagingテストを指すエラーは0件。

## live read-only metadata

2026-11-06、Vercel接続ツールの `get_project` / `get_alias` / `get_deployment` / `filter_project_envs(decrypt=false)` を実行。秘密値は出力・保存文書へ転記しない。

- 専用projectは `clear-allergy-e2e`、ID `prj_0i0cPZtGyoPYXnnB1XaC17DmLXBK`、account `team_2Y9pPeo8w16CVx1U7ToVuKFq`、Node22.x。
- 固定aliasは専用projectの `dpl_2ccZ9M7vQTd1vyrnKfwbsnT6y6DR` を指し、redirectはnull。deploymentはREADY、targetはnull（Preview）、metadataは `githubCommitRef=test/staging` のみ。commit SHAは取得できず、今回候補が反映済みという証拠にはならない。
- `get_project` の接続ツール応答はGit linkと環境変数を省略するため、リンクがないことの証明に使えない。workflowはraw RESTのprojectとenv一覧を読むが、その認証を伴う実行は未検証。
- env一覧は20件。**12件がtest/stagingに限定されたPreview設定で、Preview既定値は0件**。残り8件はProduction対象。変数名・scopeのみ確認し、内容・DB分離・Clerk/Blobの実接続は確認していない。この構成は新workflowの `PREVIEW_BRANCH_OVERRIDE_NOT_SUPPORTED` で停止する。Preview既定値への移行は外部設定変更なので今回行わない。

## 独立レビューと限界

実装履歴を共有しない読取専用subagent `staging_review` へ、base/diff/Invariant/検証結果を渡して確認。初回P1はjob-level envのrunner contextだけで、setup stepのGITHUB_ENVへ移して修正した。最終差分の再レビューはP1/P2なし。担当者も32/32テストとCLI helpを独立確認し、複雑さは安全条件に対して妥当と評価。raw API統合と実配備が未検証であることも確認した。

初期無効・source branchの信頼性・環境資格情報・Git切離し・Preview既定値への移行・固定aliasの専用writerが有効化の前提。同じrunnerのcandidate buildは秘密値を読めるため、任意コードのsandboxとして使えない。concurrencyはwriter同士を直列化するが、GitHub head変更とVercel aliasは原子的に比較更新できない。キャンセル・timeout・書込応答不明時は実destination確認が必要。これらを「保証済み」に読み替えず、[手順と復旧](../guide/staging-actions.md)に従って別途検証する。

## 追補：既存キャッシュ・別環境・無設定で進める範囲

同日、継続依頼により最新mainを `git fetch origin main` で再取得し、`bc7dfa908e9e287923084d2b91bb303ac695173b` のままであることを確認した。candidate差分のbase更新は不要。設定・実装コードはこの追補で変更していない。

- selected cloud environmentはrunning、観測はcurrent、network policyはenforced。package manager向け宛先は許可されるが、binaries.prisma.shは許可一覧にない。外向きidentity・runtime variable・secretの追加設定もない。
- `/workspace`、`/tmp`、`/home/agent/.cache`、`/opt`、`/usr/local/lib` の利用可能な作業領域・依存・既存キャッシュをファイル名で検索したが、適合するquery/schema engineは見つからなかった。hidden/ignoredファイルも含む作業領域の再検索でも該当なし。秘密ファイルは調べていない。
- 公式Vercelツール `list_sessions` を専用project/teamに限定して読み取り実行し、sessionsは0件、next=null。新規sandbox作成・停止済みsessionの起動・課金resourceの作成は行っていない。他の選択済み実行環境やWindows実行ツールは今回提供されていない。
- よって別環境/既存正規キャッシュで通常Prisma生成を追加検証する経路は見つからず、先の403が既知の宛先への再試行、mirror/別host、proxy回避、checksum無効化、偽engine、schema/engineTypeの変更は行っていない。通常test/typecheck/buildの結果は上記のFAIL/BLOCKEDのまま。
- 変更のない通常suiteを再実行して成功扱いにはせず、新しいhelperの32/32テスト、actionlint、diff checkだけ再確認してPASS。raw API・実deploy・実認証の検証へ置き換えていない。

| 条件を変えない場合 | 到達できる範囲・停止位置 |
| --- | --- |
| 外部設定・資格情報・scope・Git連携をすべて維持 | ローカル判定テスト、workflow静的検査、文書/PR草案まで。repository variableがtrueでなければ配備jobはskip。今回push/PR/mergeも行っていない |
| 正規ネットワーク/正規キャッシュがある既存の検証環境を今後利用 | アプリの通常テスト/typecheck/buildはCI用架空認証と隔離DBで検証可能。Vercel資格情報・外部設定変更は不要。今回その環境は見つかっていない |
| variableのみtrueにしたと仮定 | sourceの正規run/config/protected条件が揃って初めてVercel事前判定へ進む。適切な既存Environment secretがなければMISSING_API_TOKENで停止。Environment secretの現在の存在・scopeは未確認 |
| 既存の適切なtokenだけが利用できると仮定 | projectにGit linkが残っていればDISCONNECT_STAGING_GIT_FIRSTで停止。Git切離しが確認済みでも、現状の12件のbranch overrideがある限りPREVIEW_BRANCH_OVERRIDE_NOT_SUPPORTEDで停止。いずれもbuild/deploy/alias前 |
| Git切離し・scope変更だけを行うと仮定 | それだけで有効にはならない。source/Environment保護、tokenの権限・有効化variable、通常検証、実Previewと固定URL試験も必要 |

必要な設定変更とリスクは次のように限定する。これは変更計画であり、承認や実行結果ではない。

1. 専用project **だけ** のGit接続を外し、既存in-flight job・Deploy Hook・手動writerを確認する。既存URLを維持する計画だが、以後そのprojectのmain/PR/branchのGit自動更新は止まる。接続ツールのproject応答ではlink自体が省略され、現在切離し済みかは未確認。
2. 専用projectの既存Preview変数12件を、targetはPreviewのままgitBranch限定からPreview既定値へ変更する。値・Secret/sensitive分類を保持し、Production8件と本番projectは対象外。別branch・手動Previewにも適用される範囲拡大になる。Secretの読出し/分類緩和/rotationは計画に含めない。local buildへのSecret提供の可否は追加検証が必要。
3. GitHub Environment stagingとsource branchに必要な保護を設定し、既存の適切なtokenを利用できるか確認する。新規発行をしなくてもGitHub runnerへ登録すればアクセス追加。tokenのproject/環境限定は未確認で、コード上の固定IDではtoken権限を縮小できない。Vercel接続ツールの認証をexport/転用しない。
4. 通常検証と設定照合後、承認された時点でSTAGING_ACTIONS_ENABLED=true。default branchへのworkflow登録にはmain反映が必要で、従来の本番Git配備も誘発し得る。固定URLの実配備は別途許可された試験として行う。

公式資料: [環境変数のPreview/branch適用](https://vercel.com/docs/environment-variables)、[Secretの分類・編集制約](https://vercel.com/docs/environment-variables/sensitive-environment-variables)、[APIのtoken認証](https://vercel.com/docs/rest-api#authentication)、[project roleとplan](https://vercel.com/docs/rbac/access-roles)。公式仕様の一般説明を、現在accountにproject限定tokenがある証拠として扱わない。

## 2026-11-07：検証branchをpushする前の配備抑止確認

最新mainを再取得し、baseは引き続き `bc7dfa908e9e287923084d2b91bb303ac695173b`。remote上に `ci/staging-actions-20261106` はなく、同branchの既存PRもありませんでした。

- root `vercel.json` に `ci/staging-actions-20261106: false` があり、既存の全ルールもfalseで、複数一致時に優先されるtrueルールはありません。2026-11-07に[公式Git設定](https://vercel.com/docs/project-configuration/git-configuration)を再確認しました。main/developの既存配備条件は変更しません。
- `staging-deploy.yml` はdefault/mainにまだ存在せず、入口は `CI` / `workflow_run` / completed / `test/staging` のみです。検証branchのpush/PR/手動dispatchでdeployする入口はありません。jobにも `STAGING_ACTIONS_ENABLED == true` が必要で、source判定はpush/test/stagingを再照合します。repository variableの実値は取得しておらず、falseと断言する根拠には使いません。今回のbranchでは値にかかわらず配備経路へ入りません。
- `.github/workflows/ci.yml` のPR検査はmainを対象に実行できますが、Vercel deploy stepや本番secret参照はありません。fixture DBと架空認証の通常CIです。pushのみでは検証branchはCI対象外のため、Draft PRの作成で検証を開始します。
- 公式Vercel `list_deployments` をteamとproject IDとbranchで絞り、本番 `prj_7gertmNpQ1EfYEoQ9rgFP466ahJq`・専用 `prj_0i0cPZtGyoPYXnnB1XaC17DmLXBK` の両方で配備0件でした。push/PR後にもbranch/SHAで再取得します。手動deployや外部hookの禁止設定を変更したという意味ではありません。
- 同時点のproject最新配備は、本番 `dpl_GHUinTxQAZGReD77VQ5Euw3A6jhU`、専用 `dpl_pe4tYNqHRu9X4hERUf2nFY7RTtGZ`。両方READY/productionで、この検証branchの配備ではありません。今回のpush後に新たな配備ができていないかの比較基点として記録します。
- pre-pushでhelper32/32・skip0、actionlint（shellcheck無効）、diff checkを再確認してPASS。実配備workflowの実行成功とは扱いません。

この確認を前提に、承認された検証branchのcommit/pushとDraft PRだけを行います。staging自動追従の有効化・実deploy・main merge・Vercel/GitHub設定・権限変更は行いません。
