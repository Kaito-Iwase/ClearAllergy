# 専用 staging の旧ローカル事前判定（#130時点の記録）

[開発手順](development.md#staging-dry-run) · [変更対応表](change-map.md)

このページの以下の本文は#130時点の無配備dry-runと当時の残作業を記録します。後続の実行workflow・有効化条件は[専用 staging の CI 後配備](staging-actions.md)を参照してください。ローカルJSONに対するdry-runは現在も配備を行わず、`eligible=true` でも `deploymentAllowed=false` です。JSONは利用者が作成できるため、この結果は実サービスの認証や配備許可の証明ではありません。

## 今回の境界と確認時点

2026-11-06、継続作業開始時の live main は `7ac9a96cfbddfe801b48aa195cc59c520aa19658` で、PR #128（`a6dd7ad6f0c468ffceab8748645e7a6497cd4abc`）と #129（main と同じ SHA）は merge 済みでした。`test/staging` は `6293d5a02758f72a7cf00201fec239afc6b699eb` のままです。今回の dry-run 差分は統合後 main を基準にし、既存 CI・アプリ・依存・外部 Vercel project 設定は変更しません。リポジトリの `vercel.json` には、この PR の作業 branch `chore/staging-dry-run-main-20261106` だけを自動配備から除外する `false` を追加します。PR の merge は、この自動追従の有効化や実環境検証の完了を意味しません。

親担当が公式 `get_project` で確認した専用 project は `clear-allergy-e2e`（`prj_0i0cPZtGyoPYXnnB1XaC17DmLXBK`）、本番 project は `clear-allergy`（`prj_7gertmNpQ1EfYEoQ9rgFP466ahJq`）、両方の account は `team_2Y9pPeo8w16CVx1U7ToVuKFq` です。専用 project の Node は22.x、本番は24.x、SSO protection はそれぞれ all / all_except_custom_domains という観察でした。これらは設定変更の指示ではありません。

初回作業時（2026-11-06）の read-only `get_alias`（team/project を指定）では、固定 URL `https://clear-allergy-e2e-git-test-staging-kaitoexe00-9350s-projects.vercel.app` が専用 project の `dpl_2ccZ9M7vQTd1vyrnKfwbsnT6y6DR` を指し、redirect は null でした。`get_deployment` では READY、branch は `test/staging` でした。ただし commit SHA は返らず、target は null でした。継続作業でこの配備先を再確認した結果ではありません。**この実応答を成功 fixture へ補完しません。** 実環境の evidence は未完成であり、本 CLI へ渡して配備適格とすることはできません。

上記は時点付きの観察です。有効化前には ID・alias destination・commit・環境を再取得します。固定 alias と、配備ごとに変わる個別 URL を混同しません。アクセス保護の解除も今回の範囲外です。

統合後 main 上のローカル検証と、指定 Node 版による build 失敗の切り分けは[今回の検証記録](../verification/staging-dry-run-20261106.md)を参照してください。実サービス配備の検証とは区別します。

## ローカルで確認する

準備済みのリポジトリ依存（Node、tsx、Zod）を使用します。新規パッケージや token は不要です。PowerShell で隔離 checkout のルートから実行します。

```powershell
node --import tsx --test tests/staging-policy.test.ts
node --import tsx scripts/staging-dry-run.ts --policy scripts/staging-policy.example.json --evidence '<確認用JSONのパス>'
```

1行目は架空 ID・`.invalid` ホスト・架空 SHA のみを使う拒否テストです。CLI の子プロセスもローカル評価だけを行います。2行目はレビュー済みの policy と正規化した evidence を読みます。パスの説明部分は手元の JSON のパスへ置き換えます。ファイルは各256 KiBまで、UTF-8 JSON です。環境ファイルや環境変数を読み込まず、ネットワーク・DB・外部サービスへ接続しません。入力はログへ出力せず、固定の判定理由だけを出します。

終了コード0は dry-run 条件一致、1は拒否、2は引数・読込・JSON のエラーです。配備成功を表す終了コードはありません。`--deploy` 等の追加引数は拒否します。[policy のひな型](../../scripts/staging-policy.example.json)は未確認の repository ID、workflow ID、CI 定義の blob SHA、本番 URL を空に残しているため、常に `INVALID_POLICY` となります。自動推定や既定の本番値へのフォールバックはありません。

## policy と evidence の責務

正確な必須キー・型は `scripts/staging-policy.ts` の `stagingPolicySchema` / `stagingEvidenceSchema` を参照します。未知のキーも拒否します。架空の完全入力は `tests/staging-policy.test.ts` の `fixture` にあります。policy は候補コードやイベントとは独立してレビュー・管理する前提です。入力 JSON の自己申告で trust を確立しません。

| 判定する条件 | 将来の read-only collector が取得・照合する根拠 |
| --- | --- |
| 対象 repository の ID と fullName、head repository | GitHub の run を ID で再取得。fork と別 repository を拒否 |
| CI が completed/success、event が push、branch が test/staging | run 詳細。PR、PR target、手動 dispatch はこの方針では対象外 |
| workflow ID・path・定義 blob SHA | 正規 CI の workflow ID と、run の commit の tree にある CI 定義 blob。表示名 `CI` だけで照合しない |
| run.headSha = currentHeadSha = candidateSha = checkedOutSha = latestRun.headSha | branch ref、選択 commit、detached checkout の実 HEAD を別々に取得。PR merge SHA の成功を PR head に転用しない |
| 最新 run ID と attempt が一致 | 同じ repository/workflow/branch の**失敗・未完了を含む全状態**から最新 run を取得し、最新 attempt を再取得。成功 run だけを検索しない |
| GitHub environment が staging、branch 制限と保護を確認済み | Environment API と適用対象 job。`protectionVerified` は確認結果の表現であり、boolean を書くこと自体は検証ではない |
| team と専用 project が一致、本番 project と異なる | Vercel project の accountId と ID。本番 ID と既知の本番 URL 一覧も別途固定 |
| target.environment が preview、URL と alias が固定 URL 1件だけ | 将来の実行先計画。production/custom target、追加 alias、可変 URL を拒否 |
| alias の team/project、redirect なし、現在 destination の所属・READY・branch | alias と destination deployment の API を別々に取得。aliasDestination は現在の旧配備であり、候補 SHA の配備済み証拠ではない |

workflow 定義を承認変更した場合は、保護された policy の blob SHA の再レビューも必要です。新しい run/attempt があれば、同じ commit の過去の成功でも拒否します。未設定・欠損・不正形式・短縮 SHA・未知フィールドを許可へ補完しません。URL は末尾 `/`・path・query・fragment・userinfo のない正規 HTTPS origin に限定し、文字列を厳密比較します。

## 自動化を有効化する前の別作業

現行 `.github/workflows/ci.yml` の push 対象は main/develop で、test/staging では CI が自動実行されません。この変更でその対象は増やしていません。PR の CI 成功を転用せず、採用する CI 対象 branch・テスト範囲と運用方針を承認後に揃える必要があります。

`main` の `vercel.json` は列挙した branch の Git 自動配備だけを false にしています。全 branch を抑止する設定ではありません。main の Git 配備は CI 完了待ちと同義ではなく、test/staging への push も本体 project の Preview を作り得ます。この PR の送信前には作業 branch の完全一致キーを false にし、既存ルールを維持し、true に一致する別ルールがないことを確認します。これはこの branch の Git 自動配備を抑止するだけで、手動配備の禁止や staging 運用全体の分離を保証しません。main/test/staging や外部 project 設定は変更せず、staging 自動追従の有効化には両 project の経路を別途確認・承認します。

将来の workflow は次の順序を満たす必要があります。これは手順の設計であり、コピーして有効化できる配備 YAML ではありません。

1. 既定 branch 上のレビュー済み判定コードから開始する。`workflow_run` は `workflows: [CI]` / completed を入口にできるが、名前やイベントだけでは許可しない。PR/fork の checkout、キャッシュ、artifact 内コードを権限付きで実行しない。
2. GitHub と Vercel の公式 read-only API から上表の証拠を取得し、policy とは分離する。API の取得失敗・ページ不足・null target・不明な証拠は拒否する。現在 CLI には collector がない。
3. 候補は CI run の完全 SHA で detached checkout し、実 HEAD を照合する。インストール/build も候補コードを実行するため、未信頼コードに secret を渡さない。CI の fixture build を実 staging 用 build と同一 artifact だと見なさない。
4. GitHub `staging` environment の保護・branch 制限、専用 DB/Clerk/Blob の分離、Node/ビルド環境、固定 alias の所属を確認する。ひな型の未確定項目を埋め、変更と権限付与を別途承認する。
5. team/project/alias ごとの直列化を行い、head・最新 run/attempt・alias destination を書込直前に再取得する。GitHub concurrency は順序を保証しない。キャンセル済み run の外部書込も自動的には取り消せないため、古い run が新しい配備を上書きしない比較と排他が必要。現在の pure evaluator は一点の snapshot を比較するだけで、排他や TOCTOU 対策を実装していない。
6. 承認済みの専用 project のみへ反映する実行処理を別途設計し、戻り値の deployment ID/team/project/target/commit と、固定 alias の実 destination を再取得して照合する。固定 URL からの確認とアプリの機能確認を分けて記録する。今回それらの書込や token 作成は実装していない。

この手順を満たすまで自動追従・CI ゲート・実配備の成功は **UNVERIFIED** です。DB schema/migration、実データ、Clerk、Blob、Vercel/GitHub の設定・権限・secret はこの作業で変更しません。実認証の保存/公開・画像操作・本番反映は別担当/別承認の検証です。

## 公式資料

2026-11-06 に Context7 で `/websites/github_en_actions` と `/websites/vercel` を照合しました。Actions はホストサービス、Vercel CLI は本変更に導入していません。既存 CI の actions/checkout 等のバージョンや npm 依存も変更していません。

- [GitHub workflow_run と PR SHA の意味](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [未信頼 checkout と workflow_run の注意](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub concurrency の順序制限](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- [Vercel Git 自動配備の設定](https://vercel.com/docs/project-configuration/git-configuration)
- [Vercel alias の取得](https://vercel.com/docs/rest-api/aliases/get-an-alias)

ローカルの拒否テスト、実サービス metadata の観察、実認証/ブラウザの検証、配備成功を別々に記録します。
