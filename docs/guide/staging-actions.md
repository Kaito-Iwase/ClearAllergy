# 専用 staging の CI 後配備（初期状態は無効）

[開発手順](development.md#staging-dry-run) · [変更対応表](change-map.md) · [検証記録](../verification/staging-actions-20261106.md)

`.github/workflows/ci.yml` は `test/staging` push に通常の使い捨てDB・架空認証の検査を実行します。別の `staging-deploy.yml` は成功した push run の終了を受け、専用 project の Preview を作り、固定 URL へ割り当てます。`STAGING_ACTIONS_ENABLED` が文字列 `true` でなければ配備 job は動きません。設定・認証情報の登録や実配備は、このコード変更だけでは完了しません。

## 処理と責務

1. default branch の workflow SHA を `control` に checkout し、その判定コードを使う。元 run をIDで再取得し、同一repository ID、push、`test/staging`、completed/success、正規CIのworkflow ID/path、完全SHA、attemptを照合する。branch headと最新run（失敗・実行中も含む）が一致し、source branchがprotectedであることも確認する。
2. candidate の CI 定義と `vercel.json` のblob SHAをcontrolと比較する。candidateがテストを削除したCIや配備設定を使う場合は停止する。承認済み設定の変更はdefault branchとsourceを揃えてから新しいpush CIで検査する。
3. Vercel RESTで固定team/project、Git連携なし、固定aliasのproject・redirectなし・現在destinationのREADY/Previewを確認する。API失敗や項目不足は停止する。
4. CIの `head_sha` をdetached checkoutし、`git rev-parse HEAD` と照合する。Vercel CLI **65.12.1**を候補外の一時フォルダーへ導入し、`pull --environment=preview --git-branch=test/staging` → `build --environment=preview --standalone` を実行する。通常CIのfixture buildを再利用しない。
5. standalone出力と固定org/projectだけのproject.jsonをGitのない一時フォルダーへコピーし、`deploy --prebuilt --environment=preview` を実行する。候補のvercel.json、Git情報、branch alias用metadataを配備入力に持ち込まない。SHA/run/attemptは独自metadataに記録する。
6. 新deploymentのteam/project・READY・Preview・metadata・個別URLをRESTで検査する。固定aliasがすでに新deploymentへ動いていたら異常として停止する。最新sourceを再取得してからCLI `alias set` で固定URLを切り替え、RESTでも同じdeployment IDへの割当を照合する。

固定先は既存dry-run policyと同じteam `team_2Y9pPeo8w16CVx1U7ToVuKFq`、専用project `prj_0i0cPZtGyoPYXnnB1XaC17DmLXBK` です。本番 `prj_7gertmNpQ1EfYEoQ9rgFP466ahJq` を拒否します。固定URLは https://clear-allergy-e2e-git-test-staging-kaitoexe00-9350s-projects.vercel.app です。これらは今回再取得した外部設定の証明ではありません。

REST v13の `target: null` はPreviewを表すため、この明示値のみ許可します。target欠損・production・custom environmentは拒否します。[旧dry-run](staging-dry-run.md)の正規化evidenceの `environment: preview` とは入力契約が異なり、旧evaluatorを実配備の権限判定に使いません。

## 有効化前の設定と判断（今回未実施）

| 対象 | 必要な確認・設定 |
| --- | --- |
| `test/staging` | 必須CI・PRレビュー・push権限・bypass/管理者/force-push制限を設定し、**信頼できるレビュー済みコードだけ**を入れる。APIのprotected booleanだけではレビュー内容やbypass除外まで証明しない。任意コードを試すbranchにはこのjobを有効化しない |
| GitHub Environment `staging` | default branchのレビュー済みworkflowに限定する。`workflow_run` のrefは元の `test/staging` ではなくdefault branchになるため、Environmentをsource branchだけに制限するとjobが起動できない。sourceの保護は別途必要 |
| Environment secret `STAGING_VERCEL_TOKEN` | 専用projectに必要なPreview設定読取・配備・alias操作を持つ既存資格情報を使用できるか確認。利用可能なVercelプランでproject制限ができるか確認し、本番権限を持つ広いtokenを便宜上流用しない。未用意なら別承認で認証を準備する。GitHub tokenはcontents/actions readのみ |
| 専用Vercel project | Git連携を切り離す。main・PRからこのprojectへの自動配備を残さない。CLI用projectはGit連携なしで運用する。既存配備・aliasは削除せず、SSO保護も維持する |
| 本番projectのGit経路 | sourceの `vercel.json` に `test/staging: false` があることを確認してからpushする。今回の準備branchもfalse。main/developは従来の挙動を維持するため、この変更をmainへmergeすると従来通り本番再配備が起こり得る |
| Preview変数 | 専用DB・Clerk test instance・Blob・公開URLとcallback/originの分離を確認。Production/Developmentの値を補完しない。test/staging専用overrideだけではGit情報なしuploadのruntime変数に引き継がれない可能性があるため、**専用projectのPreview既定値を正本とし、branch overrideを使わない**。system git変数をアプリの契約にしない |
| Node/build | 専用projectも `.node-version` と同じ22系へ揃える。通常CIのnpmは11.18.0。CLI buildはPreview変数を使用し、DB migration/reset/fixture作成は追加しない |
| 固定alias | 現destinationが専用projectのREADY/Previewであること、他workflow・Deploy Hook・手動担当者が並行更新しないことを確認する。現在のaliasにGit連携由来の残ジョブがあれば完了・停止状態を確認する |
| 有効化 | 以上の確認と実配備試験の承認後にrepository variable `STAGING_ACTIONS_ENABLED=true` を設定。workflowはdefault branchへ登録する必要がある。merge・設定変更・実配備はそれぞれ別操作 |

`pull` はPreviewのアプリ秘密値をrunnerへ保存し、candidateのinstall/buildがそれを読めます。配備tokenとGitHub tokenはbuild stepの環境へ渡しませんが、同じrunnerでコードを実行するため、悪意あるコードに対するsandboxではありません。branchの信頼性が有効化の前提です。キャッシュ・CI artifactを実行せず、出力/秘密値のartifactアップロードも行いません。終了時にpulled設定と出力を削除します。runtime秘密値は専用projectのPreview設定が正本です。

新しいtokenを発行しなくても、既存tokenをGitHub Environmentへ新たに登録するなら、GitHub runnerへのアクセス追加になります。コードの固定project IDはtoken自体の権限を狭めません。project/環境単位の資格情報制限が現在のaccount/planで可能かは未確認であり、teamに対するtokenを「Preview専用token」と呼び替えません。接続ツールの認証を取り出してrunnerへ移す処理もありません。

現在の12件のbranch限定Preview変数をPreview既定値へ移すと、同じ専用project内の別branchや手動Previewも対象になります。Git切離しとwriter管理でその配備経路を限定する必要があります。移す場合も対象は既存の12件だけで、値とSecret/sensitive分類を保持し、既存Production変数8件や本番projectには変更を加えない計画です。値の読出し・SecretからConfigへの変換・自動rotationは不要な操作として追加しません。`pull` とローカルbuildでSecret値がどう扱われるか、必要な値をエクスポートせずbuildできるかは実環境で未確認です。必要な秘密値が取得できない場合は停止し、Secret分類の緩和で解決しません。[公式のSecret仕様](https://vercel.com/docs/environment-variables/sensitive-environment-variables)も確認してください。

## 排他・失敗・復旧

固定aliasに対してconcurrency groupを一つだけ使い、`cancel-in-progress: false` で実行中writerを維持します。CI自体はbranch単位で古いrunをキャンセルします。GitHubはpendingの順序を保証しないため、配備前とalias更新直前にもhead/run/attemptを再照合します。旧runの再実行も、より新しいrunがあれば停止します。

検査・build・deploy失敗では後続alias stepを実行しません。build中にsourceが進んだ場合も固定URLを更新しません。Preview作成後に古くなった場合、未割当のPreviewが残ることがあります。APIの取得失敗を成功に補完しません。

GitHub ref変更とVercel alias更新を単一transactionにできないため、最終照合の直後に新pushが来る短い競合窓は残ります。後続の成功runが新SHAへ進める一方、新pushが失敗した場合は最後に成功した版が残ります。「更新瞬間のheadとの原子的な一致」はこの小さい構成では保証しません。古いwriterが新しいwriterの配備を上書きする通常経路は直列化で防ぎます。

手動キャンセル・timeout・ネットワーク断では外部APIの書込結果が不明な場合があります。alias書込後の検査失敗は「旧版のまま」と保証できません。自動rollback/再試行を行わず、先に同じteam/project/aliasのREST状態を照合します。疑わしい場合はvariableをfalseにして新規jobを止め、実行中job・Vercelのin-flight処理・aliasの確定状態を確認してから、承認された新runまたは手動復旧へ進みます。variable変更だけでは実行中jobは止まりません。

## 検証と成功の意味

`node --import tsx --test tests/staging-actions.test.ts` はAPI代用品だけでsource・拒否・alias照合を検査します。ネットワークや配備を行いません。通常CIが成功しても、外部projectの資格情報や設定は検証できません。

workflowの成功は「配備metadataと固定aliasのdestination照合」の成功です。HTTP応答・SSO後の画面・実Clerk管理操作・保存/公開・Blobアップロードは別途確認し、CI run、SHA、deployment ID、固定URL、確認日時を結び付けて記録します。初回はGit pushによる先行配備が両projectで発生しないことも観測します。

公式資料は [workflow_runのrefと秘密値](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)、[concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)、[Vercel Git抑止](https://vercel.com/docs/project-configuration/git-configuration)、[pull](https://vercel.com/docs/cli/pull)、[deploy](https://vercel.com/docs/cli/deploy)、[alias](https://vercel.com/docs/cli/alias)、[REST deployment](https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url)、[REST alias](https://vercel.com/docs/rest-api/aliases/get-an-alias)です。2026-11-06の調査ではContext7が環境にないため、公式資料とCLI 65.12.1のローカルhelpを照合しました。現行CLIの環境指定は `--environment`、移動可能な出力には `build --standalone` を使います。
