# 専用 staging の remote Preview 配備候補（初期状態は無効）

[開発手順](development.md#staging-dry-run) · [変更対応表](change-map.md)

このローカル候補は main c8ef34554263166405d9e80f4a21f2e2ca6d7e8d の
既存 workflow/helper を置き換えます。外部設定、資格情報、配備は変更していません。
旧方式の Git 切離し、branch override の撤去、vercel pull、runner上のアプリ build、
明示的 alias set は使用しません。Git接続と12件の test/staging 限定 Preview変数を保持し、
Vercelでremote buildを行います。新しい依存パッケージはありません。

## 実行契約

`STAGING_ACTIONS_ENABLED` が文字列 `true` の時だけ動きます。
GitHub Environment は `staging`、権限は contents/actions read、control checkout は
workflow_run の default branch SHAです。candidate/CI artifactをrunnerで実行しません。
既存の `queue: max` / `cancel-in-progress: false` で参加Actions writerだけを直列化します。
Git連携・手動Vercel・他workflowのwriterはこのlockに参加しません。

1. 元CIは同一repository ID/name、正規workflow、push、completed/success、同じrun ID/attempt、
   現branch head、最新push runであることを再取得します。protected booleanに加え、レビューや
   bypassの実際の保護設定は導入時に別途確認します。CI/vercel.jsonのblobはcontrolと一致必須。
2. 専用project/team/Git link、raw `link.productionBranch=main`、SSO `deploymentType=all`を確認。
   GitHub default branchからproductionBranchを推測しません。欠損・不一致は停止します。
3. env一覧は `decrypt=false` で取得し、Previewを含む全entryを抽出します。正確な12キー、
   encrypted 8件/sensitive 4件、Previewだけ、gitBranch=test/staging、custom scopeなしを要求します。
   raw visibilityはencrypted→config 8件、sensitive→secret 4件、decrypted=falseを厳密に要求します。復号状態はPreview以外も含め受信した全entryでboolean false必須です。旧形式の項目欠損・未知値・分類矛盾は拒否します。この対応は既取得の非秘密metadata観察に基づきます。Production entryは書き換えません。値・IDの更新APIはありません。
4. 固定hostのaliasがredirectなしで専用projectのREADY/Previewを指すことを確認します。
   最初は `STAGING_APPROVED_ALIAS_ID` の承認済みdeployment、以後はmetadataとGitHub APIで
   成功済みの同workflow writerに対応するdeploymentを許可します。bootstrap IDの毎回更新は不要。
   これは他writerが変更できない証明ではなく、metadataも自己認証的な証明ではありません。
5. 全deployment履歴をページ取得し、専用projectの非terminal buildがあれば停止。
   不明な状態・重複・欠けたcursor・100ページ超過は停止。時刻cursorの完全性、削除、API整合性の
   限界は残り、同時writer不在を原子的に保証しません。source/project/env/aliasを再確認します。
6. POST `/v13/deployments?teamId=...` は固定専用project、GitHub repo ID `1144262510`、
   ref `test/staging`、成功CIの40桁SHA、CIとwriterのrun/attempt metadataだけを送ります。
   targetは省略（Preview既定）。files/env/deploymentId/withLatestCommitは送りません。
7. IDが判明したbuildは45分までterminalを観測し続けます。SIGTERM/SIGINTでも可能な範囲で待ちます。
   GitHub job timeoutは60分。ただし強制終了・runner障害はremote buildを停止しません。
8. full deploymentのowner/project、targetが明示null、custom環境なし、gitSourceとproviderの
   githubCommitSha、CI/writer metadata、READYを照合します。その後の別alias readでhost/project/ID、
   nested ID、redirect明示null、microfrontendsなし、aliasAssigned=true、aliasErrorなしを要求します。
   redirect省略は公式schemaで許容されますが、この候補では保守的に拒否します。

## 成功の意味と残る競合

identity/READYだけでは固定URL成功ではありません。別alias照合の成功も、その時点のAPI routing
mappingだけです。HTTP、SSO、Clerk、DB、Blob、画面の正常性や将来のrouting維持は未確認です。
VercelはREADY付近で**postcheck前に固定branch URLを変更できます**。build中のbranch進行で
旧SHAが一時公開される可能性は残ります。事後拒否は既に起きた変更を取り消しません。
`--skip-domain`はProduction用で、このPreviewの解決策ではありません。

`test/staging:false`と全設定rule falseでも、未指定mainは通常通り自動配備可能です。
Gitを保持すると、main変更は専用e2eと実Productionの両projectでProduction buildを起動し得ます。
e2eのProduction変数8件の値・接続先は未調査です。全project隔離を主張しません。
共有vercel.jsonへglobal Git falseは追加しません。必要なら別の承認済みproject別抑止が必要です。

## 不確実なPOST・後続run・復旧

1 runの1 attemptにつきPOSTは最大1回。attempt 2以降は拒否します。POST失敗/応答喪失では
読み取りだけでreconcileし、候補が一覧に見えなくても再POSTしません。ID不明もincidentです。
既知IDのread失敗はdeadlineまで再readします。alias/delete/rollback/promotionは行いません。

別run Bも、過去writer Aのfailure/cancelled/未完了があればVercel一覧が空でも停止します。
GitHub workflow履歴を全ページ読み、total_countの変動、重複、欠落、上限超過も拒否。
後続のqueued/waiting等は通常の待機として許可し、後続の実行中writerは拒否します。
POST前の正常なsource supersededは `noDeploymentCreated:true` として成功終了し、後続を妨げません。
これを固定URL成功と扱いません。他のpreflightエラーは保守的にincidentとして止めます。

復旧時はactivationをfalseにし、参加jobと外部writer、未知POST、既知/未完了remote build、
固定aliasを人が照合します。全件がterminalで結果・副作用が判明するまでresetしません。
必要な復旧操作は別途承認。照合済みの最後の旧writer run IDだけを
`STAGING_RECONCILED_THROUGH_RUN_ID` に設定し、bootstrap alias/現在sourceを再承認した後、
新しい正規CIイベントで再開します。これは過去のincidentを無視する権限を持つ安全上重要な設定です。
現在/未来のrun ID、単に空だった一覧、blind rerunをreset根拠にしません。
履歴を削除/期限切れにしないこと、workflow名/pathを変えないこと、履歴保持期間内で運用することも前提。
この小さいadapterは消えた履歴やVercelの不可視の書込みを証明できません。

## 値・資格情報の境界

この開発では資格情報やlive envを読み取っていません。fixtureは架空値のみです。
将来のenv API応答には`decrypt=false`でもvalue fieldが含まれるため、metadata-only APIとは呼べません。
adapterはそのfieldを直ちに捨て、保存/ログ/POST/アプリbuildへ渡しません。暗号化値を含む応答を
runnerが受け取る点と、sensitive変数の実際の応答挙動は導入前確認事項です。plaintext秘密値が
返るなら停止し、この方式を有効化しません。4つのアプリ秘密値をGitHub secretsへ移しません。
STAGING_VERCEL_TOKEN自体の権限は固定project IDによって狭まりません。既存tokenの新しい保存や
継続アクセス追加、新規token、SSO変更は別の明示承認が必要です。

## 導入前の一括確認・承認チェックリスト

- [ ] ローカル候補のレビュー、完全checkoutでlint/typecheck/test/build、GitHub YAML検証。
- [ ] repo変更のpush/PR/merge範囲と、それによる両projectの通常main Production配備の影響を承認。
- [ ] test/stagingをレビュー済みCI/configと一致させ、PR/CI/force-push/bypass保護を確認・承認。
- [ ] 専用projectのproductionBranch、Git接続、SSO all、既存alias、12変数のscope/type/値の維持を確認。
- [ ] env APIの値非復号、remote ref+SHAの実checkout/branch変数選択、raw API shapeを確認。
- [ ] writer履歴を保持し、bootstrap alias ID、初期reconciliation watermark、外部writer管理を確認。
- [ ] Preview作成と自動固定URL変更、early/stale SHA露出、他writer/main Production残存を承認。
- [ ] 最小権限の資格情報利用/保存・Environment設定・security設定の変更を必要な時点で明示承認。
- [ ] 不明結果の停止/reconcile/reset責任者と範囲を承認。自動delete/alias/rollbackは追加しない。
- [ ] 許可された初回実試験でCI SHA/deployment/aliasとSSO/Clerk/DB/Blob/画面を別々に記録してから有効化。

2026-11-07の既知blocker: live test/stagingは古い6293d5a、unprotected、Git rule true。
main mergeでは解消していません。この候補だけで有効化可能とは報告しません。

## ローカル検証と公式資料

`node --test tests/staging-actions.test.mjs tests/staging-adapter.test.mjs`（Node 24）でfake transport/clockを使用。
既存npm testへ2つの明示的な.mjsパスを追加し、依存/lock変更なし。Node22の通常CIはtsx loaderを使用。
完全checkoutのNode22.23.4では全体540テスト、lint/typecheck/buildが成功しました。[今回の検証](../verification/staging-branch-preview-20261107.md)を参照してください。Actions実行、実DB/E2E、live API/固定URLは別gateです。

Context7はこの環境では利用不可でした。公式schemaは
[Vercel SDK pinned commit](https://github.com/vercel/sdk/tree/b2f99500bd164d528aad07dd4830b0ea4d1abd6f/src/models)
のgetprojectfrompreset.ts、filterprojectenvsop.ts、getdeploymentsop.ts、pagination.ts、
getdeploymentresponsebody.ts、getdeploymentserviceshttpget.ts、getaliasop.tsに照合しました。
[create API](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment)、
[Git抑止](https://vercel.com/docs/project-configuration/git-configuration)、
[GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
も参照。schema適合はlive挙動の実証ではありません。



## 初回停止後の読み取り専用診断（未公開候補）

固定した既存 deployment だけを `scripts/staging-inspect.mjs` で取得する。
既定 GET、`withGitRepoInfo=true` GET、固定 alias GET を比較し、期待値との一致を boolean と固定 enum のみで表示する。
資格情報・レスポンス全文・任意 metadata・URL・環境変数は出力しない。POST、alias 更新、再配備は実装しない。
`.github/workflows/staging-inspect.yml` 候補は main ref、activation flag が文字列 false、既存 staging Environment に限定する。
実行するには別途レビュー済み変更の公開が必要。main push は診断 workflow/entry の変更がある場合のみ実行し、manual dispatch も保持する。本候補の作成はその操作を行った意味ではない。

writer は既知 guard code・段階・検証済み deployment ID のみを失敗時に表示する。未知 error は固定 UNCLASSIFIED_FAILURE。
READY 後は identity、source、writer 履歴を再確認し、期限内に元 alias または対象 deployment へ向く場合だけ読み取りを続ける。
競合、型不明、aliasError、source 不一致は停止する。成功条件は従来の全 identity/meta/alias 照合を保持する。
待機は API GitSource 作成による branch alias 自動更新を保証しない。今回の根本原因も raw 診断前には確定しない。

公開時の別 gate: 新 branch 初回 commit に exact Git 配備抑止が必要。main merge は通常 Production 再配備を起こし得る。
vercel.json を変更する場合は staging source/control blob 一致を再検証する。診断実行は再配備・再有効化・固定URL変更の許可にはならない。
