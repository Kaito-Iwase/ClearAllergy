# 通常のPlaywright E2E

[開発手順](development.md#browser) · [状態・公開・権限](rules.md) · [検証・採用状況](verification.md)

`playwright.config.mjs` と `e2e/*.spec.mjs` を標準Playwright Testで実行します。既存の隔離Playwright 1.61.0を再利用するため、アプリの依存やlockfileは増やしません。`e2e/playwright.mjs` はインストール先を解決するだけで、独自のテスト実行機構ではありません。

| 入口 | アプリ・DBの準備 | 管理操作の認証 |
| --- | --- | --- |
| `test:e2e` | 呼出し側が既存アプリを起動。adminは専用Composeと既存A/Bを使用 | 実Clerkの開発用ログイン |
| `test:e2e:local` | Windowsの既存PG実行ファイルから所有する使い捨てDBを作成 | Clerk境界だけを模擬する新規A/B |
| `test:e2e:ci` | CIで準備済みのサービスDB・公開fixture・Client・ブラウザーを再利用 | Clerk境界だけを模擬する新規A/B |

## 実行

アプリ依存と既存ブラウザーランナーが準備済みであることを確認します。ランナー未準備時にテストが自動インストールすることはありません。必要な取得が許可された環境でのみ、既存の `node scripts/browser-runner.mjs install` を実行してください。

```powershell
# 列挙だけ。ブラウザー・DB・Clerk・Dockerの起動や初期化はしない。
npm.cmd run test:e2e -- --list

# 起動済みの架空DB付きアプリ（既定 http://localhost:3101）を確認する。
npm.cmd run test:e2e -- --project=public

# 既存の専用ComposeとA/Bアカウントが準備済みの場合だけ実行する。
npm.cmd run test:e2e -- --project=admin

# 標準Playwrightの絞り込み・デバッグ指定をそのまま使用できる。
npm.cmd run test:e2e -- --project=admin --grep '古い編集'
npm.cmd run test:e2e -- --project=public --headed
```

`E2E_BASE_URL`（既存CIでは `CLEARALLERGY_BROWSER_BASE_URL` も可）で公開試験のローカルURLを指定できます。HTTPの `localhost` / `127.0.0.1` のみ受け付けます。既定の実Clerk版管理試験は既存 `compose.test.yaml` の3101番に限定します。この通常コマンドはアプリの自動起動・migrate・seed・アカウント作成・DBリセットを行いません。

引数なしの `npm.cmd run test:e2e` はpublicとadminの全件を実行し、専用DBへの書き込みを伴います。対象URL・架空アカウントの前提を検査する単体テストだけなら `npm.cmd run test:e2e:guards` を使います。

## 実Clerkを使わないローカル実行

Windows上でPostgreSQLの実行ファイル、同じlockfileに対応する生成済みPrisma Client/engine、既存Playwright 1.61.0とChromiumが揃っている場合は、9件を新規の使い捨てDBで実行できます。Dockerや実Clerkアカウントは使いません。依存・Prisma・ブラウザー・PostgreSQLの自動取得は行いません。

```powershell
$env:E2E_PG_BIN = 'C:\tools\pgsql\bin' # 既存のinitdb/pg_ctl/createdb
# 既存ランナー/ブラウザーの場所を変更する場合だけ指定する。
# $env:CLEARALLERGY_BROWSER_RUNNER_DIR = 'C:\tools\clearallergy-browser-1.61.0'
# $env:BROWSER_EXECUTABLE = 'C:\tools\chromium\chrome.exe'
# buildに必要な公式Googleフォント取得を許可した環境でのみ実行する。
npm.cmd run test:e2e:local -- --allow-font-download
```

`run-local.mjs` はWindows用の `local-postgres.mjs` adapterを共有 `run-fixture.mjs` に渡します。一時ディレクトリへアプリと依存をコピーし、127.0.0.1:55462の新規DBへ既存migrationと架空データを投入します。DBとアプリの両ポートが空いていることを確認し、既存DBやアプリを置き換えません。新コピー内のNext設定だけでClerkのserver/client境界とmiddlewareを試験用に差し替え、127.0.0.1:33162で実Nextを起動します。通常の製品設定・保存API・所有権解決・schemaは変更しません。

Nextのコンパイルには`next/font`の公式Googleフォント取得（Noto Sans JP、`fonts.googleapis.com`と`fonts.gstatic.com`）が必要な場合があります。local/ciの両bootstrapは `--allow-font-download` なしでは起動前に停止します。このフラグは取得許可の代わりにはならないため、取得が承認された環境だけで指定してください。パッケージ・Prisma engine・ブラウザーの取得を許すフラグではありません。

認証モックは、その実行だけの不透明なcookieを架空A/BのClerk IDへ対応させます。cookie未設定・未知値は匿名です。実User/Shop照会と保存APIはそのまま使い、spec開始前に実DBの接続先・run ID・各店舗を照合します。Clerkへのログイン、セッションの署名検証、SSO・招待・Blobは検証しません。保存失敗1件は従来どおり500応答を明示注入するため、DB障害の試験とも区別します。

`test-results/local-<run ID>/`にコマンド・結果・ログを保存します。終了時は自身のNext/ブラウザーprocess treeとDBを停止し、その一時領域だけを削除します。停止確認に失敗した場合は削除を保留し、`lifecycle.json`に残った対象と理由を記録します。他のDB・作業領域を手動で削除しないでください。認証モックの成功を、下記の実Clerk E2E成功へ読み替えないでください。

## 準備済みCIのDB・ブラウザーで実行する

既存workflowでPrisma Client生成、専用CI DBへのmigration・公開架空fixture準備、隔離Playwright/Chromiumの導入を済ませてから実行します。`CI=true`、`CLEARALLERGY_CI_FIXTURES=true` と、既存CI接続ガードに合う同一の `DATABASE_URL` / `DIRECT_URL` が必要です。対象は127.0.0.1上の `clearallergy_ci` DBと専用ユーザーです。準備済み公開fixtureがなければ停止します。

```bash
# 準備済みCI job内。新しい環境の初期化コマンドではない。
npm run test:e2e:ci -- --allow-font-download
```

`run-ci.mjs` は共有 `run-fixture.mjs` を使い、既存アプリ依存・実行platform用の生成済みClientとengine・隔離ブラウザーを新しいアプリコピーで再利用します。Windows用engineの固定指定、PGプロセスの起動・停止、migrate、`setup-ci-env.ts` の再実行は行いません。既存サービスの停止・削除やDBリセットも行いません。実Clerkへの接続やClerkアカウントの作成は不要です。

この実行の前後で既存User/Shop/MenuItem/AuditLog行のfingerprintを照合し、新しいrun IDのA/Bとそのテストデータだけを作成・削除します。User削除で匿名化される監査ログも、今回作ったUser IDに限って先に削除し、既存AuditLogのfingerprint一致と新規監査行の残留なしを要求します。他の同時書込みを検知した場合も成功にせず、共有fixtureの利用を止めて確認してください。公開4件は既存CIの架空公開店舗を使い、管理5件は新規A/Bを使います。spec前に `/e2e-fixture-check` でrun ID・baseURL・実DB identityを照合してから、所有者操作へ進みます。

`test-results/ci-<run ID>/`へ `lifecycle.json` と各コマンドのログ・結果を保存します。成功判定にはspec結果だけでなく、新規fixtureの後始末、既存行fingerprintの一致、所有Next/process groupと一時コピーの終了が必要です。サービスDBは保持します。後始末が不確定なら失敗として一時領域を残し、他のCIデータを手動削除しません。

CI定義には、通常の製品buildと従来の公開回帰を残したまま、この9件を認証境界差替えbuildの別stepとして追加しています。各経路の結果は、対象baseとrun IDに結び付いた記録で確認してください。head `5dbba923` のUbuntu／GitHub Actions実行は、通常製品build・単体299件・新E2E9件を含めて成功しています。対象headとrunを確認し、Windowsの実測とは分けて扱います。run ID・後始末・unitの制限を含む結果は[検証・採用状況](verification.md#practical-e2e-status)を参照してください。

## 検証対象

| project | 重要な利用操作 | 実際に通るもの |
| --- | --- | --- |
| public | 店舗→メニュー詳細のキーボード移動、モバイル検索0件からの復帰、アレルゲン設定の適用・再読込、未認証管理API拒否 | 実Nextアプリと架空DB。ClerkへのログインやDB更新は行わない |
| admin | 店舗説明の保存・再読込、メニュー新規非公開保存→別操作で公開、他店の取得・編集・削除・停止拒否 | 既定は実Clerkの開発用認証・実アプリ・専用DB。明示local/ci実行はClerk境界だけ模擬 |
| admin | A/B各店舗の旧画面の編集PUTを409拒否し入力保持。同じ旧画面からSTOPを200で受理し、匿名API404を確認 | 各店舗で別タブの価格保存を実行し、本物の版競合を作る。STOPには古い版の照合を要求しない |
| admin | 保存500でも編集中の入力が残り、DBは変わらない | この1ケースの失敗応答だけを明示的に注入する。DB障害の再現試験ではない |

新規公開は、架空メニューの全品目を入力して非公開保存し、サーバーから取得した保存済み版に別の公開操作を行います。実食品の安全確認を代用するものではありません。公開条件やAPIの期待値を緩めていません。競合2件とSTOP2件は独立した期待値です。

停止後は公開APIの404を要求し、HTMLではnot-found見出しを待ってから、公開前に表示した固有のメニュー名・架空原材料が本文に残らないことを検査します。[公開読取の仕様](rules.md#publication)と[Nextのnot-found規約](https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/03-file-conventions/not-found.mdx)では、ストリーミング後のnot-foundはHTTP200になる場合があります。HTML輸送statusだけで公開情報の残留を判定しません。

## 認証とデータの前提

既定の実Clerk版管理試験には、[既存の専用テスト環境手順](development.md#test-environment)で準備した `.clerk/clearallergy-test-accounts.json` のA/B既存アカウント・店舗が必要です。`setup-test-env.ts` はDB/Clerkへ書き込む初期化処理なので、specから自動実行しません。明示local/ci実行は、この認証情報ファイルを使わず、そのrunの新規A/Bを使います。

既存 `compose.test.yaml` のproject名は `clearallergy-test`、公開ポートは3101です。同じPCの複数checkoutから同名projectをbuild/upすると既存コンテナを置き換え得るため、既存環境を所有するcheckoutと利用者を確認してから実行します。この試験は他のcheckoutの停止・再作成やボリューム削除を行いません。

管理fixtureはDockerの対象app内で既存 `assertTestDatabaseTarget()` と開発用Clerkキーを確認してから、testing tokenを取得し、既存のメール/パスワードUIでログインします。対象店舗IDも認証後の実APIと照合します。本番キー、他アカウント、実サービスの接続先を渡さないでください。この手順の認証はClerkの開発用サービスへの通信・セッション作成を伴います。

作成するメニューはテストごとに一意名とし、そのテストが作ったIDだけを所有者APIと最新の版で削除します。既存メニューは削除せず、店舗説明はテスト自身の変更が残っている場合だけ元へ戻します。後始末が失敗した場合はテストも失敗とし、残ったIDを専用アカウントの画面で確認してください。A/Bは共有fixtureなのでworkerは1、mutationの自動retryは0です。他の試験・手作業と同時に動かさないでください。

認証情報・セッションを含む `.clerk/` はGit管理外です。管理projectではtrace・動画・自動スクリーンショットを無効にし、生の認証エラーも転送しません。既定reporterも標準のconsole一覧だけです。HTML/JSON/blob reporterやUI modeは認証の `fill()` の値・testing tokenを含むAPI stepを保存・表示し得るため、管理projectでは使わず、`DEBUG=pw:api` 等の認証値を出すデバッグ指定も避けてください。公開projectだけなら `--project=public --reporter=html` でレポートを作れます。`test-results/` と `playwright-report/` もGit管理外です。認証情報を含む記録を公開artifactへアップロードしないでください。

## 既存試験との関係と限界

公開specは既存 `check-first-use-browser.mjs` の代表操作を、小さく選択して実行・再実行できる形にしています。既存CIの広い公開回帰は追加coverageとして残します。新9件は別の認証境界モックbuildで実行し、通常の製品buildも維持します。CIのplaceholder Clerkで実Clerk版adminを動かすのではなく、`test:e2e:ci` が試験コピー内だけに認証doubleを配線します。

既存の `publication` / `allergens` / `composition` / `qr` は部品・模擬APIの検査を含みます。これらの成功やspecの列挙を、実アプリ＋認証＋DB E2Eの成功とは扱いません。Issue #118のPreview/OIDC/承認台帳・再開ランナーも別運用のままです。

画像/Blob upload、新規Clerkアカウント・店舗の初回登録、招待の作成・取消、実サービスでのキャッシュ伝播はこの初期suiteに含めません。管理specの開始時点でA/Bは店舗作成済みであり、UIからの店舗初回登録には別のfixtureと後始末が必要です。画像試験は既存 `admin` runner側に実Blob書込と別cleanupがあるため、無断で重複実行しません。

環境やブラウザーが準備できず実行できない場合はUNVERIFIEDです。`--list`、構文、単体テスト、lintの成功だけでブラウザーE2EをPASSにしません。Clerk境界を模擬する範囲、1件の500応答注入、実Clerk未検証を明記し、実行した環境・head・runごとに結果を記録します。E2E単独の成功を、実行していない別の検査の成功へ拡張しません。外部操作を禁止された作業では実Clerk版admin projectを実行しないでください。local/ci版も未準備の依存・フォントを取得してよい理由にはなりません。
