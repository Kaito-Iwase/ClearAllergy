# 起動・確認・変更の進め方

[READMEへ](../../README.md) · [内部処理](architecture.md) · [変更対応表](change-map.md) · [文書の保守](maintenance.md) · [コミット・PRの書き方](#commit-pr-conventions)

ここに載せるコマンドはリポジトリの設定から整理した手順です。今回すべてを実行した記録ではありません。[確認範囲](verification.md)に実施と未実施を分けています。起動・検証・運用のコマンドブロックは**PowerShellで実行する手順**で、アプリのソース抜粋ではありません。コミットメッセージのコードブロックは書式例です。

過去の依存更新と公開判断に関する記録：

2026-10-07公開前の依存更新・残存指摘・公開保留の決定は[依存更新記録](../verification/security-release-20261007.md)に記録する。通常CIの成功と依存監査の成功を区別し、監査FAILのまま公開を完了扱いにしない。

<a id="environment"></a>
## 1. どの環境を使うか決める

作業フォルダは `C:\Users\kaito\Documents\Github\ClearAllergy`。Node.jsは `.node-version` の22.23.4、Dockerfile・CIのグローバルnpmは11.18.0です。npmはアプリ依存へ同梱しません。

ハーネスとブラウザ導入は `scripts/npm-cli.mjs` でnpmのスクリプト実行時に渡される `npm_execpath` またはNode配布の標準位置を検証し、NodeからCLI（コマンドライン実行用プログラム）を引数配列で呼び出します。ホストの実npm版はハーネス結果の `runtime.actualNpm` へ記録します。npmが見つからない場合は暗黙に導入せず停止するため、Node配布を調べるか `npm.cmd exec -- node scripts/agent-harness.mjs verify --base origin/main` で既存npmから起動してください。

Windowsでは `npm.cmd` / `npx.cmd` を使います。既に準備済みの環境は、最初に再インストールせず状態を確認します。

| 実行方法 | アプリ | DB（データベース） | 外部サービス・用途 |
| --- | --- | --- | --- |
| ホストの `npm.cmd run dev` | 通常3000番 | 環境変数で指定。ローカルDBを自動作成しない | 開発者が用意した接続。実データの接続を安易に流用しない |
| `compose.yaml` | localhost:3100 | **DBサービスなし**。`.env` / `.env.local` の接続先 | Linuxコンテナ内でアプリを動かす通常開発 |
| `compose.test.yaml` | localhost:3101 | Compose内部の `test-db`、PostgreSQL 17、DB名 `clearallergy_test`。ホストへDBポートを出さない | 保存・所有権・公開の検証用。Clerk開発環境とBlobは外部接続が残る |
| GitHub Actions | ジョブ内3000番 | そのジョブだけのPostgreSQL 17 | CI（変更ごとの自動検査）。DB制約と公開画面を架空データで検証。実Clerk認証・Blob更新なし |

Dockerはアプリを決まった実行環境に包む仕組み、Composeは複数のサービスを設定ファイルでまとめて起動する仕組みです。通常構成ではDBも隔離される、という意味ではありません。Docker DesktopのLinuxコンテナ機能が必要です。

Composeは `.env` の後に `.env.local` を読み、同じ変数は後の値を使います。テスト構成はさらに `environment` でDB接続先・テストフラグ・ポートフォリオモードを上書きします。ClerkやBlobはその上書き対象ではありません。`docker compose config` や環境変数の全出力は秘密情報を含み得るため、ログへ貼り付けないでください。

DBデータ・コンテナ内依存・`.next`（Next.jsの生成物）はそれぞれ名前付きボリュームに残ります。ホストの `node_modules` と別です。通常の停止に `down -v` を使わないでください。DBのボリュームも失います。

### 環境変数の用意

新規の作業環境だけ、`.env.example` を参照してローカルの環境ファイルを用意します。既存ファイルを上書きしません。値は担当者から安全に取得し、Git・文書・チャットに載せません。Next.jsと単独Nodeスクリプトでは環境ファイルの読込が同じとは限らないため、スクリプト本体と実行方法も確認します。

| 変数 | 用途・条件 |
| --- | --- |
| `DATABASE_URL` / `DIRECT_URL` | DBの通常接続／Prismaの直接接続。両方の接続先を確認する |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Clerkの公開用／サーバー専用キー。テスト初期化には開発用が必要 |
| `PORTFOLIO_MODE` / `PORTFOLIO_EDITOR_APP_USER_IDS` | 更新制限と許可対象。[権限ルール](rules.md#ownership)を参照 |
| `ENABLE_CLERK_ADMIN_AUTH` | Google / Clerk SSO（外部アカウントによるログイン）導線の表示判定に使う。全認証の無効化スイッチではない |
| `NEXT_PUBLIC_APP_URL` | 公開URL・QR等の基準URL |
| `BLOB_READ_WRITE_TOKEN` / `ALLOWED_IMAGE_URL_PREFIXES` | アップロードと許可する画像ストア。未設定なら画像機能を無理に試さない |
| `GOOGLE_MAPS_SERVER_API_KEY` | 管理画面のGoogle店舗候補検索用 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` / `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | 旧地図用設定。現在の公開画面は動く地図を提供しない |
| `ADMIN_REGISTRATION_MODE` / `ADMIN_REGISTRATION_INVITE_TOKEN` | 旧登録方式の設定。現行の自己登録停止を解除しない |

`NEXT_PUBLIC_` が付いた値はブラウザへ届き得ます。秘密鍵やDB URLには使いません。ローカルで不足したキーを、CI用の非実在値や本番値で埋めればよいという手順ではありません。

IP制限では、Vercelが自動で設定する `VERCEL=1` の環境だけ転送IPを使います。他の配備先でこの値を手動設定して信頼判定を迂回しないでください。Vercel以外ではIPが不明な共通枠を使うため、複数利用者で制限枠を共有します。[同一オリジンと回数制限](rules.md#request-security)を読み、別のプロキシを使う場合は公開Host・プロトコルと信頼するIP取得経路を検証します。

<a id="startup"></a>
## 2. 起動する

まず作業場所と履歴を確認します。各行は順に、フォルダ移動、ブランチ表示、変更一覧、最新コミット表示です。想定外でも勝手に切り替えません。

```powershell
Set-Location 'C:\Users\kaito\Documents\Github\ClearAllergy'
git branch --show-current
git status --short
git log -1 --oneline
```

**既存の開発環境をホストで起動：** 接続先が許可された開発用であること、依存とPrisma Clientが準備済みであることを確認してから実行します。

```powershell
node --version
npm.cmd --version
npm.cmd run dev
```

1行目はNode.js、2行目はnpmのバージョン確認、3行目は開発サーバー起動です。起動ログのURL（通常 `http://localhost:3000`）を開きます。成功判定はプロセス起動だけでなく、`/shops` にデータまたは正しい空表示が出ることです。DB障害の案内は接続成功ではありません。

初回取得で依存がない場合だけ `npm.cmd ci`（ロックファイル通りに依存を配置）、続けて `npx.cmd prisma generate`（DB構造定義からアクセス用コードを生成）を行います。後者はDBのマイグレーションではありません。未初期化DBに対する既存マイグレーション適用は別の書込作業です。接続先と権限を確認せず `migrate dev`、`db push`、`seed` を起動のついでに実行しないでください。

**通常Dockerで起動：** 上と同じ接続先確認に加え、Docker Desktopを起動してから実行します。

```powershell
docker info
docker compose up --build -d
docker compose ps
```

1行目はDockerエンジンへの接続確認、2行目はイメージ作成とバックグラウンド起動、3行目は状態確認です。`http://localhost:3100/shops` を開きます。停止は `docker compose stop app`。DBはこの構成で新設されません。

<a id="test-environment"></a>
## 3. 保存を試す専用テスト環境

前提は、Docker、開発用Clerkの利用権限、架空のアカウント作成・専用DB初期化の許可です。Blobの書込まで行う場合はその保存先の許可も必要です。**DBだけが独立しています。** 閲覧確認しか必要ない作業では初期化しません。

新規準備時にだけ、内容を読んでから以下を順に実行します。既存環境なら初期化を繰り返さず、まず状態を確認してください。

```powershell
docker compose -f compose.test.yaml build app
docker compose -f compose.test.yaml up -d test-db
docker compose -f compose.test.yaml run --rm --no-deps app node --import tsx scripts/setup-test-env.ts
docker compose -f compose.test.yaml up -d app
docker compose -f compose.test.yaml ps
```

| 行 | 意味・成功時に確認すること |
| --- | --- |
| 1 | テスト用アプリのイメージを作成。ビルドが成功する |
| 2 | 専用DBを起動。`ps` で健康状態が `healthy` になるまで待つ |
| 3 | 専用DBと開発用Clerkであることを検査し、既存migrationを適用。管理者2名・その店舗2件とデモ店舗、各3メニューを準備する |
| 4 | テストアプリ起動。`http://localhost:3101/shops` と `/admin/demo` を確認する |
| 5 | アプリとDBの起動状態を確認する |

初期化はデータ更新を伴います。既存の同名メニューは作り直しませんが、ユーザー・店舗・品目マスタのupsert（存在すれば更新、なければ追加）はあります。「再実行しても一切変更なし」ではありません。接続ガードを外して他DBに実行しないでください。

認証情報は `.clerk/clearallergy-test-accounts.json` に保存されます。店舗A/Bのログインに使いますが、中身を共有・ログ出力しません。このディレクトリはGitとDockerイメージの対象外です。管理デモは保存しないため、保存確認には専用管理者で `/admin/login` から入ります。

<a id="checks"></a>
## 4. 検証方法を選ぶ

| コマンド／入口 | 何を検査するか・前提 | 成功の判断 |
| --- | --- | --- |
| `npm.cmd test` | `tests/*.test.ts` の単体・APIモックテスト。モックは外部処理の代用品。現在のAPIテストはDBと認証を置き換えるが、変更後も安全とは決めつけず読む | 今回の出力の成功・失敗件数を記録。実DB・実Clerkの成功とはしない |
| `npm.cmd run lint` | ESLintによるコードの規則確認 | 終了コード0。自動修正は付けない |
| `npm.cmd run typecheck` | TypeScriptの型整合性 | 終了コード0。DBへの反映ではない |
| `npm.cmd run build` | `prebuild` のPrisma生成後、本番向けのNext.js成果物を作る | 終了コード0と生成結果。静的生成時にDB読取や外部取得があり得るため接続先を事前確認 |
| `npx.cmd prisma validate` | DB構造定義の妥当性 | 検証成功。実DBとの一致までは保証しない |
| `npx.cmd prisma generate` | 定義からPrisma Clientを生成 | 生成成功。DBを初期化するコマンドではない |
| `npm.cmd audit --ignore-scripts --audit-level=high` | lockfileの依存関係について既知の脆弱性を照会。ネットワークを使うが自動修正しない | 終了コードと各重大度の件数を記録。通信失敗を脆弱性なしと扱わず、コード全体の安全性とも区別する |

通常のコード変更はlint・型・テスト・buildが最低限です。文書だけならリンク・実装照合・差分確認で省略でき、理由を報告します。Docker内では `npm.cmd` ではなく `npm` を使い、たとえば `docker compose -f compose.test.yaml exec app npm test` とします。

開発サーバーとbuildが同じ `.next` を使う構成では競合を避けます。次の各行は、テストアプリ停止、一時コンテナでbuild、開発アプリ再起動です。DBは起動したままにします。

```powershell
docker compose -f compose.test.yaml stop app
docker compose -f compose.test.yaml run --rm --no-deps app npm run build
docker compose -f compose.test.yaml up -d app
```

<a id="browser"></a>
### ブラウザ・実DB検証

以下でいうfixtureは検証用の環境と架空データ、loopbackは自分のPCだけに接続する通信先、DTOは画面やAPIへ受け渡すデータです。

店舗保存の局所回帰は `node --import tsx --test tests/admin-shop-api.test.ts tests/shop-response.test.ts`。DB・Clerk・キャッシュは代用品であり、実DBの競合確認は別です。`node --import tsx scripts/check-shop-database.ts` は既存の専用ComposeまたはCI接続ガードを最初に通し、架空のUser/Shopの作成・条件付き保存・同時読取・所有状態変更・キャッシュ失敗・後始末を行います。通常環境では接続ガードで停止します。CIは架空データ準備後にこのスクリプトを実行し、マイグレーション・リセット・本番接続は追加しません。

`node scripts/check-shop-save-browser.mjs` は、実際の `ShopEditClient` をまとめた一時コード（bundle）をloopback専用fixtureで動かし、不正200・競合・結果不明時の入力/画像保持、保存済み/反映未確認、送信中抑止、390/1440px・キーボード操作を検査し、JSONと画像を保存します。アプリ・DB・Clerk・Blobの起動は不要で、Nextとfetchは代用品です。既に準備した隔離Playwrightを `PLAYWRIGHT_MODULE_PATH`、必要なら対応ブラウザを `BROWSER_EXECUTABLE` / `PLAYWRIGHT_BROWSERS_PATH` に指定してください。アプリ依存へPlaywrightを追加しません。たとえば既存ランナーを使うPowerShellの指定は次のとおりです。

```powershell
$env:PLAYWRIGHT_MODULE_PATH = Join-Path $env:TEMP 'clearallergy-browser-1.61.0\node_modules\playwright'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:TEMP 'clearallergy-browser-1.61.0\browsers'
$env:CLEARALLERGY_BROWSER_OUTPUT = Join-Path $env:TEMP 'clearallergy-shop-save-results'
node scripts/check-shop-save-browser.mjs
```

同じ作業ツリー（worktree）のビルド済みCSS（画面の見た目を指定するスタイル）が必要です。Webpackの `.next/static/css` と既定の `.next/static/chunks` を読めます。既存Windows依存をジャンクション（ディレクトリの参照リンク）で共有してTurbopackが作業ルートの外として拒否する環境では、同じスキーマの生成済みClientを確認したうえで `npm.cmd --ignore-scripts run build -- --webpack` を使い、共有Clientの再生成を省略したことを記録します。通常の独立環境・CIは従来の `npm run build` とPrisma生成を使います。[今回の結果と限界](../verification/shop-save-contract-20261015.md)を参照してください。

ブラウザ回帰は `scripts/browser-runner.mjs` でPlaywright 1.61.0とChromiumを隔離して用意します。アプリの依存とlockfileは変更しません。既定の保存先はOSの一時ディレクトリ内の `clearallergy-browser-1.61.0` で、`CLEARALLERGY_BROWSER_RUNNER_DIR` で変更できます。初回の `install` はネットワークから検証ツールを取得するため、利用可能な環境で実行します。アプリの既存依存が必要です。

```powershell
node scripts/browser-runner.mjs install
node scripts/browser-runner.mjs public
node scripts/browser-runner.mjs ui
```

1行目は初回準備、2行目は公開画面の回帰、3行目は表示・設定のUI回帰です。アプリとDBは別途起動しておきます。既定の接続先はlocalhost:3101で、公開済みの架空メニュー（豆乳ベジカレーなど）が必要です。`ui` は既存CI fixtureの架空1店舗・3メニューを前提とし、HTTPのlocalhost／127.0.0.1だけを許可します。実店舗データには実行しません。LinuxのCIなどでブラウザ用のOSライブラリも必要な場合だけ `install --with-deps` を使います。Windowsの通常準備には付けません。

`node scripts/browser-runner.mjs demo` は公開画面と保存しない管理デモ、`node scripts/browser-runner.mjs admin` は専用環境の管理操作を確認します。後者はDB・開発用Clerk・Blobへの書込を伴い、専用アカウントと保存先の許可が必要です。ランナーの準備だけで認証情報やテストデータが作られるわけではありません。

`node scripts/browser-runner.mjs allergens` は実 `ShopMenuListClient` と新規・編集フォーム、管理メニュー一覧を、架空データの隔離loopback fixtureで検査します。アプリ・DB・Clerkの起動は不要ですが、事前にアプリのビルド済みCSSと隔離ブラウザランナーが必要です。

320／390／768／1440pxの品目名・状態別件数・対象範囲・注意書き全文、個人設定とMAY_CONTAIN除外、補足元の非公開化、混在するUNKNOWN、新規・編集ガイドと注意書きによる状態の非変更、カードと注意書き欄のキーボードフォーカスを確認します。

食品確認の必須欄・履歴、保存競合時の入力保持、保存成功と公開反映失敗の表示、不正な成功DTO・作成IDと通信断、送信中の独自の画像ジェスチャーによる変更拒否も確認します。管理一覧では品目未設定・現行確認・旧確認・最新未解決・記録なし・通常STOPを分け、件数・検索／filter・編集入口・版付き削除後の件数・空表示・保存しないデモを検査します。

既存TypeScriptとNext同梱webpackを使用し、依存を追加しません。Nextのリンク・画像・navigationと保存APIの応答をfixture用に置き換えるため、実ルート・公開データ取得・認証・DB保存・アップロードの確認とは区別します。ブラウザの外部通信を遮断し、保存操作で実DBやBlobへ書き込みません。

`node scripts/browser-runner.mjs composition` は画像構図の実コンポーネントを一時ディレクトリでコンパイルし、使い捨てのloopbackサーバーで検証します。事前にアプリのビルド済みCSS（`.next/static/chunks`）と隔離ブラウザランナーが必要です。アプリ・DBの起動やClerk／Blobのキーは不要。新規依存は導入せず、既存TypeScript・Next同梱webpack・sharpを使用します。写真の目印の画素が指／マウスの方向に動くこと、拡大・余白・両プレビュー・端・元画像比較・390pxのタッチ／ピンチを確認し、終了時にブラウザとサーバーを閉じます。実管理画面での画像アップロードや保存の検証とは別です。

| 確認スクリプト | 対象・副作用・成功時の確認 |
| --- | --- |
| `scripts/check-first-use-browser.mjs` | 公開検索、スマホ表示、個人設定の追加・解除・競合・保存失敗、詳細遷移、デモの未保存保護等。ブラウザ内設定を操作しDB更新はしない。PASS出力とスクリーンショットを確認 |
| `scripts/check-public-ui-browser.mjs` | `ui` で実行。320・390・768・1024・1440pxのトップ／一覧／店舗／詳細／規約、日本語Webフォントの実読込と入力欄との統一、ロゴ、横幅、注目＝黄色／除外＝赤色の文字・枠コントラスト、適用前後、MAY_CONTAIN除外ON/OFF、FREEの対象・保証の限界、別メニュー補足、キーボード詳細遷移、404を検査。ブラウザ内設定だけを変更しDB・認証・Blobには書き込まない。PASS出力とスクリーンショットを確認 |
| `scripts/check-image-composition-browser.mjs` | `composition` で実行。架空SVG画像と実編集部品で、描画した画素の移動・範囲・ズームとタッチを検査。ブラウザの外部通信を遮断し、DB・認証・画像保存は使わない。変更前後のスクリーンショットとPASS出力を確認 |
| `scripts/check-shop-qr-browser.mjs` | `qr` で実行。実QR部品と架空URLで、4幅の正方形・サイズ比率・入力、印刷mm指定・説明の非印刷・afterprint解除を検査。JSON・スクリーンショットとA4／100%のPDFを出力。外部通信・DB・実印刷は使わない |
| `scripts/check-saved-publication-browser.mjs` | `node scripts/browser-runner.mjs publication` で実行。実新規・編集・公開確認部品と同じworktreeのビルド済みCSSを使い、全通信を架空応答へ置換。保存と公開の失敗・版不一致・二重クリック・新規再読込・UNKNOWNの修正再保存・320/390/768/1536px・キーボードを検査。DB・Clerk・Blob・本番・利用者の既存ブラウザは使わない。JSON・画像を `CLEARALLERGY_BROWSER_OUTPUT` へ出力。CIでも実行 |
| `scripts/check-test-browser.mjs` | 固定localhost:3101、専用アカウントファイル、Dockerのテストアプリを使う。実Clerkログイン、店舗説明更新、メニュー作成・公開・編集・削除、Blob画像追加、別店舗拒否。許可した専用環境だけでランナーの `admin` を実行 |
| `scripts/check-test-database.ts` | 専用DBガード後、共通の `scripts/database-regression.ts` で公開条件、リンク置換、メニュー移転後の店舗条件付き更新・削除と巻戻し、実ハンドラの移転/消失後404・両店舗fields/links不変・正常操作、pending招待の一意性、行ロック、受諾済み行への取消防止、招待置換失敗の巻戻しを確認。当該実行の一時店舗・監査記録だけを最後に削除。`docker compose -f compose.test.yaml exec app node --import tsx scripts/check-test-database.ts` |
| `scripts/check-ci-database.ts` | CI専用接続先のガード後、同じ実DB回帰を実行。CIのfixture準備後に `node --import tsx scripts/check-ci-database.ts`。通常の開発DBや共有DBに接続先を差し替えて実行しない |
| `scripts/check-admin-menu-list-database.ts` | CI/専用テストDBの既存接続ガードを通し、共有一覧select/DTOで未記録・現行公開・通常STOP・食品変更・最新未解決・UNKNOWNの6状態と私的記録の非転送を検査。今回作成した店舗と配下データだけを後始末。`node --import tsx scripts/check-admin-menu-list-database.ts`。CIは上の制約検証の直後、owned-menu検証の前に実行する。migration/reset/実Clerk/Blobはこのscriptの対象外 |
| `scripts/cleanup-test-images.ts` | 記録ファイルのURLが専用店舗の画像か検証し、Blobから削除する。削除の許可があるときだけ `docker compose -f compose.test.yaml exec app node --import tsx scripts/cleanup-test-images.ts`。失敗時は記録ファイルを保持 |

`public` / `demo` / `ui` は `CLEARALLERGY_BROWSER_BASE_URL` で接続先、`CLEARALLERGY_BROWSER_OUTPUT` で画像出力先を変更でき、ブラウザの外部通信を遮断します。これはアプリサーバーの外部通信まで止めるものではありません。`admin` の接続先はlocalhost:3101固定です。既存ブラウザを使う場合は `BROWSER_EXECUTABLE` に実在する実行ファイルを指定できます。既存スクリプトを直接起動する場合は従来どおり `PLAYWRIGHT_MODULE_PATH` 等の解決が必要です。

実DB回帰はClerkやBlobへ外部通信しません。`scripts/admin-menu-database-regression.ts`は実ハンドラを実PostgreSQLへ接続し、ClerkセッションとNext cacheだけをそのスクリプトプロセス内で置き換えます。DBの認可照会・transaction・監査は実行し、当該runの一時ユーザーも削除します。DB制約の成功と実セッションによる別店舗拒否は別の確認です。招待の外部サービス失敗・補償はAPIモックテストでも確認しますが、実Clerkとの通信結果が不明な場合の運用まで実証したことにはなりません。

`node scripts/check-store-review-browser.mjs` は実店舗フォーム・メニュー編集・管理Shellを、同じworktreeのビルド済みCSSと架空データで検査します。上記と同じ隔離Playwright指定を使います。390／768／1536pxでフォームの初期位置、文書全体スクロール、補助情報の開閉、下部ナビとの余白、フォーカスを確認し、公開origin＋古いlocalhost設定のQR、統合A4印刷、食品変更と価格変更の公開予定、成功応答による確定表示、409時の入力保持を検査します。Nextの遷移・画像・ログアウトは代用品、APIはブラウザ内で代替応答にします。実DB・Clerk・Blob・Vercelへ接続しません。Material Symbolsの外部フォントは読み込まないため、画像のアイコン表示は実配備と一致しません。`--serve` は目視用の読み取り専用loopbackサーバーで、GET以外を拒否します。[結果と限界](../verification/store-review-20261019.md)を参照してください。

`node scripts/browser-runner.mjs qr` は実 `ShopQrCard` と実 `qrcode.react` のSVGを、架空URLの隔離loopback fixtureで検査します。`composition` と同じ隔離ブラウザ・ビルド済みCSSが必要で、アプリ・DB・Clerkの起動は不要です。320／390／1024／1440pxで正方形・選択サイズ比率・横はみ出し、プリセット・キーボード、印刷メディアのmm寸法と印刷後の解除を確認します。OSの印刷ダイアログだけを置き換え、A4・倍率100%のPDFを35／45／50／60mmで出力します。JSON寸法とスクリーンショット・PDFを確認してください。紙への印刷、カメラでの読取、実管理ルートでの操作は別確認です。

### 自動テストで置き換えられない手動確認

一料理の材料変更を試すローカル演習は、[台本](../research/product/ingredient-change-trial-20261015.md)・[起動手順と架空資料](../research/product/ingredient-change-trial-fixture-20261015.md)・[匿名空票](../research/product/ingredient-change-trial-record-sheet-20261015.md)を一組で使います。build済みCSSがあるworktreeで `node scripts/ingredient-change-trial.mjs --serve --minutes 30` を実行すると127.0.0.1だけで起動し、時間終了またはCtrl+Cでメモリ内の架空保存を破棄します。実Clerk/DB/Blobへ接続しません。管理一覧・編集・公開表示は実部品、保存応答とNextのnavigationは代用品です。

起動時に出るtoken（進行役用の識別値）付き進行役URLは初回回答者へ渡さず、回答者には条件別の資料だけを渡します。進行役の全資料・期待結果は別PCまたは専用の紙で管理し、PC・ブラウザ履歴・ターミナルを共有しません。tokenはこのfixture内の表示・制御の分離であり、同じOS利用者からの秘密保護を保証する仕組みではありません。

`--check` は既存隔離Playwrightを `PLAYWRIGHT_MODULE_PATH`、必要なら対応するブラウザを `BROWSER_EXECUTABLE` / `PLAYWRIGHT_BROWSERS_PATH` に指定して、操作・状態・画像を自動確認し終了します。実Material Symbolsのローカルcacheを使う場合は `--icons-root` で既に取得したCSS/woff2のディレクトリを指定し、ブラウザの外部通信は遮断します。アプリ依存へ追加しません。[準備結果](../verification/ingredient-change-trial-preparation-20261015.md)は補助試験の範囲で、台本全分岐・実店舗の工数/理解度を合格にしません。

- 公開側：スマホとPCで、検索→設定を1つ適用→後から2つ追加→一部解除→キャンセル→一覧→詳細をたどり、全確認対象の表示を比較する。TabキーとEnterでも操作する。
- 登録側：専用環境で下書き保存→再読込→未設定の公開拒否→全品目を入力して公開→原材料変更時の確認→公開側への反映を確かめる。
- 権限：未ログイン、別店舗、閲覧専用の各条件で拒否を確認する。運営招待は外部メール送信を伴うため別途許可された試験対象が必要。
- 失敗時：DB障害と0件、設定の保存失敗、画像失敗、未保存移動の違いを確認する。実データを壊して障害を作らない。

<a id="commit-pr-conventions"></a>
### コミット・PRの書き方

コミットメッセージとPRタイトルは、変更の意図と影響を後から追えるよう、英語のtypeと日本語の説明で書きます。基本構文は [Conventional Commits 1.0.0](https://www.conventionalcommits.org/ja/v1.0.0/) に従います。日本語、小文字のtype、以下の分類と長さの目安はClearAllergyの運用規約です。

```text
<type>[任意の(scope)][互換性破壊時の!]: <日本語の説明>

<必要に応じて、理由・影響・検証を日本語で記載>

<必要なIssue参照・互換性破壊の説明>
```

#### typeは変更の目的で選ぶ

| type | 選ぶ基準 |
| --- | --- |
| `feat` | 利用者や呼び出し元が使える機能・能力を追加する |
| `fix` | 利用者に表れる誤動作、契約違反、脆弱性を修正する。関連テストや文書も同じ目的なら含める |
| `docs` | 文書・説明だけを変更する |
| `test` | 回帰テスト、テスト用データ、評価・検証手順を追加・修正する。製品の振る舞いの修正が主目的なら `fix` を使う |
| `refactor` | 外部から見た振る舞いを変えず、コードの構造を整理する |
| `perf` | 性能を改善する。本文やPRに測定条件・結果、または未測定の範囲を示す |
| `build` | ビルド・パッケージング・開発用ツールチェーンや依存関係を変更する |
| `ci` | GitHub Actionsなど継続的な検証・自動実行の手順や実行環境を変更する |
| `chore` | 上記に当てはまらない保守・運用準備を行う。内容が曖昧な変更をまとめるためには使わない |

整形だけの変更には `style`、既存変更を戻すコミットには `revert` も使えます。`style` は画面デザイン変更の意味ではありません。`revert` の本文には戻すコミットのSHA、理由、影響を記載します。日本語の `設定:`、`修正:`、`検証:`、`テスト:` をtypeとして使いません。

拡張子や「設定ファイルを編集した」という理由だけではtypeを決めません。たとえば、誤った本番URLによるリンク不具合の是正は `fix`、通常のビルド用Node更新は `build`、CIジョブのNode更新は `ci`、自動デプロイ抑止の導入準備は `chore` です。依存更新でも脆弱性の解消が主目的なら `fix` を選びます。機能追加とそのテスト・文書のように同じ目的に必要な変更はまとめ、独立した目的は別コミットにします。

#### scopeと件名

scopeは任意です。対象を絞ると読みやすい場合に、既存の機能名・モジュール名など短い英語の識別子を使います（例: `public`、`admin`、`api`、`deps`）。複数領域にまたがる場合や説明だけで明らかな場合は省略します。担当者名・一時的な作業番号・長いファイルパスをscopeにせず、新しい分類表を増やす必要もありません。

コロンの後に半角スペースを1つ置き、何をどう変えるかを日本語で1行にまとめます。「修正した」「対応しました」という作業報告より、「保存競合時に入力内容を保持する」のように結果が分かる説明を優先します。「修正」「更新」「各種対応」「WIP」だけで終えません。末尾の句点は付けません。

件名はtype・scopeを含めておおむね50文字を目安とします。これは機械的な上限ではありません。意味を削らないと収まらない場合は、長い背景を本文へ移し、必要な識別子は保持します。日本語の表示幅と英字の文字数は同じではないため、英語資料の50/72文字規則をそのまま失敗条件にしません。

説明・本文は日本語にし、API名、コード識別子、ファイル名、コマンド、SHA、URL、`BREAKING CHANGE` などの固定語は翻訳しません。

#### 本文・Issue参照・互換性破壊

件名だけでは判断理由・影響が分からない変更には、空行を挟んで本文を付けます。従来の問題、選んだ対応の理由、利用者・呼び出し元・運用への影響、実施した検証と未実施の範囲を書きます。小さい誤字修正のように件名で十分な変更に定型文の水増しは不要です。本文の文字数下限は設けず、段落や箇条書きで読みやすくします。

関連Issueがある場合は末尾に `Refs: #番号` を記載します。存在しないIssueを作り上げず、表記のためだけのIssue作成も不要です。`Closes` / `Fixes` / `Resolves` は、対象Issue全体の完了とクローズの意図が確認できる場合に限ります。部分対応・検証候補では自動クローズの語を使いません。

互換性を壊す変更は、typeまたはscopeの直後、コロンの直前に `!` を付け、本文末尾に `BREAKING CHANGE: 日本語の説明` を記載します。Conventional Commits自体は片方の表記でも認めていますが、CAでは一覧での発見と移行説明の両方を残すため、両方を使います。何が互換でなくなるか、影響を受ける利用者・呼び出し元、必要な移行手順を具体的に示します。変更量の大きさや内部整理だけでは `!` を付けません。安全仕様変更・DB migration等の承認境界は別に維持します。

#### PRタイトル・本文とマージ時の確認

PRタイトルも同じ形式にし、最終差分全体の主目的を表します。調査の途中経過や最後のコミットだけを要約せず、範囲が変わったらタイトルと本文を実際の変更へ合わせます。F1/F3等の作業番号は必要なら補足に留め、変更内容が分かる説明を省略しません。

PR本文は既存テンプレートに従い、日本語で問題・判断・検証・独立レビュー・リスク・文書更新を説明します。base/head SHA、実コマンド、実行環境、件数、CI run・checkout SHA・成果物への参照を対象の証跡と結び付けます。未確認を成功へ言い換えず、古いSHAの検証結果を現在のHEADの結果として扱いません。自己レビューと独立レビューは区別し、既存のレビュー回数上限を増やしません。

squashを使うことが別途承認された場合は、マージ画面の最終コミット件名と本文を確認します。PRタイトルと同じ意味の英語type・日本語説明にし、必要な理由、Issue参照、互換性破壊の説明を残します。GitHubの既定値はリポジトリ設定とコミット数に依存するため、PRタイトルがそのまま採用されると決めつけません。この規約はマージ方式の変更やmerge・配備の承認を与えるものではありません。

新しく作成するメッセージに適用し、過去の表記統一だけを目的としたamend・reword・rebase・force-pushは行いません。GitHub等が生成する既存のmergeメッセージや過去コミットは保持します。`[skip ci]` 等で必要な検証を省略せず、秘密情報、未確認の結果を成功とする記載、実施していないレビューを実施済みとする記載はメッセージへ含めません。

#### 例

| 避ける例 | 推奨例 | 理由 |
| --- | --- | --- |
| `設定: Vercelを設定` | `chore: Dependabot導入前のVercel自動デプロイ抑止を準備` | typeは英語にし、準備の目的を示す |
| `test: テスト追加` | `test: 公開4入口のトランザクションクライアント利用を検証する` | 検査対象と狙いが分かる |
| `chore: 設定変更` | `fix: 公開QRコードのリンク先に残るlocalhostを除く` | ファイル種別より修正目的を示す |
| `style: 保存ボタンを追加` | `feat: メニュー編集画面に保存ボタンを追加する` | 画面の機能追加を整形扱いしない |
| `fix: update` | `fix: 保存競合時に編集中の入力を保持する` | 日本語で変更後の振る舞いを示す |
| `docs: 文書更新` | `docs: 開発用DBと本番DBの使い分けを説明する` | 文書の内容が分かる |

本文を含む例（[PR #111](https://github.com/Kaito-Iwase/ClearAllergy/pull/111)のF3実測内容を用いた表記例であり、このガイドへの記載は同PRの統合や既存コミットの書換えを意味しません）:

```text
test: 公開4入口のトランザクションクライアント利用を検証する

既存のAPIテストは元のPrismaクライアントをコールバックへ渡すため、
呼び出し元が誤って元のクライアントへ戻っても検出できない。
実際のルートを呼び、別のトランザクションクライアントによる読取を検査する。

正例4件と、10境界を個別に戻した負例の失敗を確認した。
製品コードは変更しない。実SQLの分離性は既存の専用DB回帰で別に確認する。

Refs: #100
```

互換性破壊の構文例（架空の例であり、変更の提案・承認ではありません）:

```text
feat(api)!: 公開APIのページ指定をカーソル方式へ変更する

BREAKING CHANGE: pageパラメータの受付を終了する。
呼び出し元はnextCursorを保存し、次の要求のcursorへ渡す必要がある。
```

#### 参考にした一次資料とCAでの選択

2026-10-28に確認した公開資料です。仕様の構文とCA固有の運用判断を分けます。

以下は各公開リポジトリ・チーム文書の規則または実設定であり、Google・Microsoft・OpenAIの全社規約とは扱わない。履歴だけを規約の証拠にしていない。

| 対象と一次資料 | 確認できた内容 | CAへ採る点／採らない点 |
| --- | --- | --- |
| [Conventional Commits 1.0.0](https://www.conventionalcommits.org/ja/v1.0.0/) | typeと説明、任意scope・本文・footer、feat/fix、互換性破壊の `!` または `BREAKING CHANGE`。それ以外のtypeも許容する | 構文の基礎を採る。日本語、type小文字、長さ、本文の書き分けはCAの選択と明記する。形式採用を自動リリース導入と結び付けない |
| [Angularのコミット規約](https://github.com/angular/angular/blob/b81b37d58b966882c6cea7cf1f76e990bb2059e9/contributing-docs/commit-message-guidelines.md)（Google系公開OSS、angular/angular） | typeの用途、任意scope、動機・前後の挙動、breaking時の移行説明を定める。docs以外は本文必須・20文字以上。scopeにパッケージ名を使う | typeの意味、whyと影響、移行説明を採る。Angular固有のscope一覧、本文20文字の下限、docs以外への一律本文必須はCAへ移植しない |
| [Microsoft ISE Engineering PlaybookのGit guidance](https://github.com/microsoft/code-with-engineering-playbook/blob/main/docs/source-control/git-guidance/README.md#commit-best-practices) | 論理単位の小さい変更、必要性・影響の説明、件名50文字・本文72文字、任意本文・trailers。Conventional Commitsは選べる例として紹介する | 意図と副作用を残すことを採る。英語中心の文字幅を日本語へ機械的に適用せず、CAは50文字を目安にする。これはISE向け公開playbookで、Microsoft全社の強制規約ではない |
| [Microsoft FASTのCONTRIBUTING](https://github.com/microsoft/fast/blob/1d0ba188764c422101fb21141d36eb8addf654b4/CONTRIBUTING.md#merging-a-pull-request) | マージ時のコミットタイトルにPRタイトルを使い、Conventional Commitsへ合わせる。互換性破壊の移行文書も要求する。リリース用change fileは別に管理する | PRタイトルを変更全体の意図へ合わせ、最終squashメッセージを確認する運用を採る。CAのマージ方法を勝手に固定しない。Beachballやchange fileは導入しない |
| [OpenAI Python SDKのrelease-please設定](https://github.com/openai/openai-python/blob/fa67521e1c59f11fb5cba7ef8b9b35b5fcac2ae4/release-please-config.json)、[CONTRIBUTING](https://github.com/openai/openai-python/blob/fa67521e1c59f11fb5cba7ef8b9b35b5fcac2ae4/CONTRIBUTING.md)、[AGENTS](https://github.com/openai/openai-python/blob/fa67521e1c59f11fb5cba7ef8b9b35b5fcac2ae4/AGENTS.md) | 実設定にfeat/fix/perf/revert/chore/docs/style/refactor/test/build/ciの分類があり、test・ciはchangelogで非表示。確認した2文書には件名長・scope・言語を一律に定めるコミット規約はない | typeがリリース用途に使われる実例として参照する。設定の存在を全コミットへの強制規約・OpenAI全社規約と呼ばない。CAにrelease-please、自動version付与、非表示分類を導入しない |
| [OpenAI Codexのcontributing](https://github.com/openai/codex/blob/main/docs/contributing.md) | 読取時点の文書にはコミットメッセージ規約がない | 「OpenAIのコミット規約」として引用できる根拠にはしない。非公開の内部規約は不明 |
| [GitのSubmittingPatches](https://github.com/git/git/blob/37b3475fb530c14109211faca33716a173db61ed/Documentation/SubmittingPatches) | 変更のwhy、従来の問題、選択理由・代替案を残す。件名50文字はsoft limit、areaを付ける慣行、論理単位の変更を勧める | 将来の保守に必要な理由を採る。Git固有のarea-prefixでCAのtype-prefixを置き換えない。メール投稿・署名等の別運用は持ち込まない |

Microsoft VS Codeの `CONTRIBUTING.md` と公式 `How to Contribute` Wiki、TypeScriptの `CONTRIBUTING.md` も確認したが、その確認範囲には件名のtype・言語を統一する規則を見つけなかった。これらを「Microsoftは規約を持たない」という主張には広げない。補助比較として [microsoft/awesome-rayfin](https://github.com/microsoft/awesome-rayfin/blob/main/CONTRIBUTING.md#commit-messages) にはConventional Commitsと任意scopeが明記され、CIをchoreへ分類する。Angularのci分類と異なるため、typeの細分化は各repoの決定であることも確認できる。

GitHubの既定squashメッセージと変更可能な項目は[公式説明](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests)で照合した。

<a id="operations"></a>
## 5. 運用スクリプトとCI/CD

CDは配備・公開の自動化のことです。

`auth:create:test-user` は廃止しました。旧コマンド名を実行しても、環境ファイル・DB・Clerkを読み込まず、終了コード1で停止します。既存アカウントのパスワードを上書きする機能はありません。テストアカウントが必要な場合は、接続先を検査する[専用テスト環境](#test-environment)の手順を使います。

`seed` は起動コマンドではありません。既存デモの更新、同名メニューと品目リンクの再作成、古いマスタの削除、条件付きClerk同期を含みます。`auth:migrate:clerk` はClerk・DB更新、`allergens:backfill:pistachio`、`repair:published-menus` はDB補正を伴います。これらの既存運用コマンドが廃止コマンドと同じく自動拒否されるわけではありません。`allergens:check` も実DBを読むので接続先を確認します。名前だけで安全と判断せず、変更対応表から本体を読んでください。

CI定義は `.github/workflows/ci.yml`。main/develop向けPR、両ブランチへのpush、手動実行で動きます。同じ参照の古い実行をキャンセルし、`Test, lint, typecheck, and build` のジョブで次を順に行います。

依存配置 → Prisma生成・validate → 単体テスト → lint → 型確認 → CI専用DB準備 → 実DB回帰 → build → ブラウザランナー準備 → 起動 → 公開ブラウザ回帰 → 成果物保存。

実DB回帰は `check-ci-database.ts` による制約・ロールバック、`check-owned-menu-database.ts` による実メニュー更新・削除の所有店舗条件、`check-shop-database.ts` による店舗保存の競合・最終所有状態・保存後反映失敗を順に検査します。いずれも接続先ガードを通った一時PostgreSQLに限定し、実Clerk認証は置き換えます。CIの公開画面回帰には実Clerk・Blobへの書込を含みません。

専用DB準備は `scripts/setup-ci-env.ts` / `ci-environment.ts` が固定した一時DBへの両接続URLと有効化フラグを検査し、既存マイグレーションを適用します。その後、既存ユーザー・店舗・メニューがあればfixture投入を拒否します。架空1店舗3メニューを用意し、GitHub Secretsや実Clerk・Blobを使いません。実DB回帰はマイグレーション由来の部分一意インデックスと制約トリガーも対象です。既存環境のリセットや本番DBの適用状況確認ではありません。

ブラウザ用Playwrightはジョブの一時ディレクトリに用意します。失敗時は `scripts/collect-ci-diagnostics.ts` がCI用の接続設定と実行フラグを確認し、生のサーバーログから固定した分類・件数だけの要約を作ります。生ログ・認証情報・入力本文を成果物へ掲載する方式ではありません。スクリーンショットと存在する診断要約をSHA（コミットの識別値）付きで7日間保存します。

依存検査は別の `.github/workflows/dependency-audit.yml` が担当します。main/develop向けの依存ファイル・当該workflow変更PR、毎週月曜03:27 UTC（12:27 JST）、手動実行が入口です。`npm audit --ignore-scripts --audit-level=high` で既知の高・重大の問題を検出すると失敗します。自動修正やパッケージ更新はしません。通信障害の失敗と検出された脆弱性を区別して調べます。対象はdevを含むアプリlockfileで、Node配布のnpm CLI・OS・隔離Playwrightの脆弱性まで修正した証拠ではありません。

Next.jsのlint設定は全ルールを維持します。`@next/eslint-plugin-next@16.4.1` のルートディレクトリ検索だけ、`scripts/next-root-glob` のローカル互換層へoverrideします。既存tinyglobby 0.2.17を使い、ディレクトリの自動展開を無効にして絶対パス・末尾区切りを正規化します。パターンは65,536文字・入れ子128段までとし、超過と未対応の範囲brace（波括弧による範囲指定。`app{1..12}` 等）は検査失敗です。範囲は明示した配列か選択braceへ置き換えてください。`.npmrc` の `install-links=true` をinstall/ciで共有し、Dockerはローカルpackageをnpm ciの前にCOPYします。一般のfast-glob代替として使わず、Next plugin更新時には利用API・rootDir検索・内部リンク検知とclean install/auditを再確認してください。保守対象はこのリポジトリです。検証は `tests/next-root-glob.test.ts` と `tests/npm-cli.test.ts` から追えます。

### 要求IDから障害を調べる

API障害はレスポンスの `X-Request-Id` と時刻・操作を記録し、対応する `request_completed` / `operation_failed` の分類・処理時間を確認します。分類がDBなら接続状態、外部サービスならClerk・Blob等の当該操作を、許可された環境で確認します。秘密値、本文、セッション、生の例外を追加ログへ写す必要はありません。通常のAPI以外は同じ要求IDで追えるとは限りません。[記録範囲](architecture.md#observability)を参照してください。

招待取消が502ならローカルでは取消済みの可能性があるため、画面を再読込して取消再試行の表示を確認します。受諾と競合した409は確定済み状態を再確認し、受諾済みを取消扱いに上書きしません。補償取消の失敗や通信結果が不明な場合は、権限を持つ運営者がDBの対象招待とClerkを照合します。自動で解決済みと判断せず、外部データの修正は対象・副作用を確認して行います。

このCIにはVercelへのdeployや本番DB migrationはありません。VercelのGit連携、Production Branch、環境別のDB・Clerk・Blob設定は管理画面側の確認事項です。GitHubの必須チェックもYAMLだけでは強制されません。PRの成功SHAと公開するSHA、ブランチ保護の対象・バイパス、Vercelのmain/Node 22設定を確認します。現在のクラウド設定・稼働状態はこの文書だけで保証しません。

<a id="dependabot-deploy-guard"></a>
### Dependabot導入前の自動デプロイ抑止

`vercel.json` の `git.deploymentEnabled` は既存の抑止対象を保持し、`dependabot/**`、元の準備ブランチ `chore/ca-dependabot-deploy-guard-20261026`、main採用用ブランチ `chore/dependabot-guard-main-20261028` を `false` にします。[Vercel公式仕様](https://vercel.com/docs/project-configuration/git-configuration)はminimatch構文を使い、未指定ブランチは `true`、複数一致時は `true` が優先です。main/developや通常ブランチの自動デプロイ条件は変更しません。Git連携の自動デプロイを抑止するもので、手動deployを禁止する設定ではありません。

[元PR #108](https://github.com/Kaito-Iwase/ClearAllergy/pull/108)の必要差分をmainへ限定採用します。採用先PRのmerge SHA・必須CI・実配備/skip・Productionの読取確認を元PRから辿れる形で残します。ローカルのパターン検査と実Vercel上の抑止観測は区別し、未観測の対象branchまで確認済みと扱いません。Dependabot security updatesの有効化とversion updates設定は、このguardのmain反映と対象branchの抑止確認後に別承認で行います。今回のguard採用にDependabotの有効化、GitHub保護設定変更、手動deployは含みません。

### 公開前と障害時の確認

公開前には、対象SHAのCI結果、PreviewとProductionのDB・Clerk・Blobの分離、適用済みmigration、正規HTTPSでのOrigin検査、画像アップロード上限、ログ保管期間・閲覧権限・通知先を確認します。配備設定の名前や画面が存在するだけで、動作確認済みとはしません。秘密値は記録せず、確認した対象・日時・結果を残します。

API障害はレスポンスの `X-Request-Id` から `request_completed` / `operation_failed` を照合し、ルート、分類、HTTP状態、時間で切り分けます。要求本文・Cookie・認証ヘッダーを調査用ログに追加しません。ページ描画のエラーは `instrumentation.ts` の固定ルート名で調べますが、APIと同じ要求IDが付く保証はありません。

招待の外部処理が失敗した場合は、取消済みで外部IDが残る行の再試行を先に検討します。結果不明や補償取消失敗では対象のClerk招待とDBを運営者が照合し、受諾済み状態や店舗所有者を古い要求で戻しません。監査の成功は記録したDB操作の成功であり、メール配送やClerkとの完全一致の証明ではありません。

復旧では既知の正常SHAへのアプリの切戻しとDB復元を分けます。アプリを戻しても適用済みmigrationや変更データは戻りません。Neonのバックアップ保持・復元先・復元権限を確認し、復元訓練は許可された隔離DBで実施します。本番リセットや逆向きSQLを即席で実行しません。

### 二段階公開の移行と検証

新migrationは `20261021000000_two_step_publication` と `20261021010000_food_issue_resolution`。公開操作を旧食品確認から分離するため、schema・trigger・API・公開read・UIを一緒に変更します。旧migrationは書き換えません。既に公開中の有効な実在旧記録だけを保持し、非公開を自動公開しません。切替・rollback・新旧サーバー混在は本番適用前の別確認事項です。未解決解除は別の `20261021010000_food_issue_resolution` で追加します。旧確認記録は保持し、明示解除と別公開を検証します。本番切替は別承認です。

`node --import tsx scripts/check-publication-migration.ts` は `CLEARALLERGY_CI_FIXTURES=true` とloopback・固定CI DB名/利用者/テスト専用パスワード・同一のDATABASE_URL/DIRECT_URLを検査し、**空の使い捨てDB**で旧migration→架空の公開/下書き/未解決fixture→新migration→再適用を確認します。共有DB・既存開発DBでは実行しません。`check-ci-database.ts` は保存・公開・巻戻し・旧記録不変・競合の実DB回帰です。画面は `check-store-review-browser.mjs` / `browser-runner.mjs allergens`、合成演習は `ingredient-change-trial.mjs --check` で別に確認します。実Clerk/Blobは代用のため未検証です。[判断理由](../research/product/two-step-publication-decision-20261021.md)・[今回の結果](../verification/two-step-publication-20261021.md)を参照してください。

## 食品確認記録の移行と検証

以下は旧migrationの個別検証です。現在の公開条件は[二段階公開](#二段階公開の移行と検証)を参照し、旧フォームの運用を再導入しません。

`20261009000000_menu_food_review` は編集版・食品版・確認対応版・作成操作IDを `MenuItem` に追加し、`MenuFoodReview` とDBトリガーを作成します。記録をUIだけに持つ方式では別端末・直接DB更新・再読込に対応できないためDBに保存します。既存レコードは確認済みとして補完せず、公開中も一旦停止します。移行前に許可された環境のバックアップ、停止対象、再確認担当、停止告知と公開キャッシュの更新を準備してください。適用対象ごとに履歴を確認してください。2026-10-10の本番適用・32件の公開停止・架空デモ5店舗32件の承認付き再公開・バックアップと復旧確認は[公開店舗一覧の障害復旧記録](../verification/shops-recovery-20261010.md)を参照してください。

API/UIとmigrationを揃えて配備します。古いPUT/DELETEは版なしで428となります。切戻しで記録や新列を即座に削除せず、書込・公開を停止して証拠を保持し、適用済みトリガーとの互換性を確認します。旧公開フラグの一括復元や旧確認の自動復活は行わず、再確認したメニューだけを公開します。逆向きmigration・本番復元は別の承認済み作業として準備します。

`scripts/food-review-fixture.ts` はCI／専用テスト接続ガードを通る架空メニューだけに、実食品の証拠ではない旨を記した合成記録を作ります。通常seedや既存実データへは適用しません。通常seedの公開フラグだけでは新条件を満たさず、DBで停止されます。既存の専用テストデータも移行で停止するので、内容を照合して専用fixtureを準備してください。

`node --import tsx scripts/check-public-read-snapshot.ts` はCI専用接続ガード付きDBと架空fixtureを使い、一時loopback TCPプロキシで実Prismaの子SELECTを止め、別接続の食品訂正を確定してから解放します。通常CIでは `Prepare isolated fictional data` 直後の独立step `Check public read snapshot consistency` から実行し、既存PostgreSQL 17 serviceを使います。step上限は3分、既存job上限は25分で、失敗・timeoutを無視する設定は付けません。既存job/check名は変えず、P0のphase/summarizeや追加browser回帰は接続しません。

成功条件は、snapshotなしで旧食品＋新FREEが混ざる負例と、本番用 `readPublicSnapshot` のRepeatableReadで旧食品＋旧CONTAINSを維持する正例の両方が成立し、各variantで実際の子SELECTを割り込んだassertを通り、訂正後の新しい公開読取がnullになることです。SQLの結果や時刻をmockする検査ではありません。通常終了時はプロキシ・Prisma接続を閉じ、今回作った店舗だけを削除します。強制timeout時のcleanup完了までは保証せず、CI serviceはjob終了時に破棄します。schema/migration・通常seedは変更しません。単独実行も同じcommandを使いますが、生成済みPrisma ClientとCI専用の使い捨てDB・fixtureを先に用意し、実サービスの接続情報を渡しません。

このscriptは自身の読取callbackとsnapshot helperを検査します。実callerの接続は `tests/public-read-callers.test.ts` が `/shops`、`/shops/[shopId]`、`/shops/[shopId]/menus/[menuId]`、`GET /api/menus/:menuId` の実route exportから検査します。元のPrisma clientの読取を拒否し、別のtransaction clientで本体・マスタ・店舗補足を読むことを確認します。通常の `npm test` に含まれます。`node scripts/check-public-caller-mutations.mjs` は使い捨てソースコピーで10か所を個別に元clientへ戻し、各テストがclient逸脱により失敗することと復元後の成功を確認します。実DB・環境ファイルは不要ですが、生成済みPrisma Client・依存と一時ディレクトリへのlink作成権限が必要です。[再現手順と測定範囲](../verification/public-read-callers-20261028.md)を参照してください。これらはHTTP・画面描画・cache・既に開いた画面の更新の保証ではありません。`tests/public-read-snapshot.test.ts` はtransaction完了不能と通常処理エラーの区別、既存取得不能表示への受渡しを代用品で検査します。

対象head SHA・lockfile・実Node/npm・PostgreSQL版、負例/正例の固定PASS行、終了状態、step所要時間を同じ実行結果に結び付けます。3分は初期上限で、実測時間・反復再現性は実行後に記録します。選択した検査の成功と必要受入条件全体の充足を区別し、このstepを接続しただけでCI必須化や公開4入口・P0全phaseの保証済みとはしません。今回の実施・未実施は[確認範囲](verification.md#snapshot-ci-pilot)を参照してください。

`scripts/food-review-database-regression.ts` と `scripts/admin-menu-database-regression.ts` は、競合保存・古い全体フォーム・直接DB更新・記録失敗の巻戻し・マスタ変更・公開停止・キャッシュ例外・作成再送を検査します。確認記録の直接INSERTによる未解決事項の追加、過去／未来版の拒否、DB生成snapshotと日時、訂正ロック待ち後の古い確認拒否も検査します。入口は上記の `check-test-database.ts` / `check-ci-database.ts` です。独立の `check-owned-menu-database.ts` も最終版を送り、所有店舗条件を検査します。実認証の `check-test-browser.mjs` は非公開保存と別公開・版付きcleanupに対応していますが、実Clerk・Blobの書込を伴うので今回未実行です。合成記録と成功した検査は、実食品の正確性や現場運用を実証しません。今回の結果は[食品確認記録の検証](../verification/menu-food-review-20261009.md)に記録します。

`node --import tsx scripts/check-food-review-migration.ts` は空の使い捨てCI DBだけで、旧migration→架空の旧公開データ→新migration→再適用を検査します。既存DBをリセットせず、空でなければ停止します。接続ガードは `check-ci-database.ts` と同じです。実Clerk・Blobを使わず、実行先には合成データが残るため、専用コンテナ等を作業後に停止してください。

`node --import tsx scripts/check-publication-propagation.ts` は起動済みの本番buildと架空CI DBで、公開ページを取得した後の食品変更・停止をHTTPで検査します。`CLEARALLERGY_BROWSER_BASE_URL` はHTTPのlocalhost／127.0.0.1だけ（既定は127.0.0.1:3102）、DBはCI接続ガードが必須です。アプリのDBも同じ専用DBにしてください。作成する検査店舗だけを最後に削除し、`CLEARALLERGY_BROWSER_OUTPUT` に `propagation.json` を保存します。任意の `PLAYWRIGHT_MODULE_PATH` と `PLAYWRIGHT_BROWSERS_PATH` に準備済みの隔離ランナーを指定すると、390pxの実ブラウザで停止メニューがnot-found画面になることも検査し画像を保存します。外部通信は遮断します。Clerk・Blobは使わず、既に開いたブラウザへの訂正到達を保証する検査ではありません。

構造化ログは追加しましたが、通知先へのアラート配送やブラウザ例外収集は未導入です。既存配備ログの通知・保持で不足するかを確認してから、Sentry等の料金、担当人数、ソースマップの非公開管理、個人情報除去、通知試験を判断します。Replayや全要求トレースを一律に収集する構成ではありません。

<a id="staging"></a>
### stagingの準備と環境分離

変更は最新mainを基点に独立branchで準備し、`test/staging`のテスト環境で人間が確認してからmainへのPRで採用範囲を判断します。旧staging全体のmerge、未採用候補・UTCの20件目migration・追加harnessの一括取り込みはしません。mainへの採用とProduction配備は別の承認対象です。

`vercel.json`は準備branch `prepare/staging-main-v1-final-20261028` の自動配備をfalseに保ち、exact `test/staging`だけをtrueにします。このcommitをtest/staging先端へ反映した後のpushがPreview自動更新の対象です。設定・実効SHA・CI・Preview Readyを照合するまで切替完了とは扱いません。準備branchにはtest/staging専用の環境変数が適用されないため配備しません。最終切替前に最新mainの対象SHAを固定し、採用済み差分を保持したまま検証します。旧branch先端の置換が必要なら旧SHAを保持し、その操作について新しい承認を得ます。過去のforce-with-lease許可を再利用しません。

テスト帯を表示するのは、`CLEARALLERGY_TEST_PREVIEW=true`、`VERCEL=1`、`VERCEL_ENV=preview`、`VERCEL_GIT_COMMIT_REF=test/staging`がすべて一致する場合だけです。Production、main、他branch、ローカル、設定不足では表示しません。帯は実店舗ではない架空データの案内であり、公開条件・権限・アレルゲンの意味は変えません。

専用Previewの画像保存は `TEST_BLOB_READ_WRITE_TOKEN` と `EXPECTED_TEST_BLOB_STORE_ID` の対応を検査し、専用tokenをSDKへ明示します。対象branch・Preview条件や専用設定が不正なら共有Blobへfallbackせず停止します。通常のProduction環境では従来のSDK設定を維持します。token形式の検査は認証成功の確認ではありません。
`ALLOWED_IMAGE_URL_PREFIXES` はPreview/exact `test/staging`で専用storeのHTTPS prefixだけを許可することが配備前の必須条件です。書込tokenの分離とは別で、URL policyは `TEST_BLOB_READ_WRITE_TOKEN` を参照せず、明示prefixがない場合は共通 `BLOB_READ_WRITE_TOKEN` 由来の共有storeを許可し得ます。変数名・scopeの存在だけで完了とせず、専用storeとの一致と共有storeを含まないことを秘密値なしで確認するまでは、自動配備を有効化しません。

CIは既存job/check名・隔離PostgreSQL・権限を維持し、既存のpush/PR対象にexact `test/staging`だけを追加します。GitHub CIの成功だけでVercel配備・実Clerk・実Blob・外部DBを確認済みにしません。`prebuild`は従来どおりPrisma Client生成のみで、DB migrationやfixture作成を自動実行しません。

専用 `clearallergy_main19` はmainと同じ19件のmigrationとchecksum、master29、User2・Shop2・Menu6（全draft）、アレルゲンリンク174、各history0の初期化後検証が完了しています。再INIT・通常seed・降順migration・reset・削除は行いません。旧 `neondb` の20件環境は保持します。自宅回線での読み取り接続と今回1回の初期化成功は、追加の接続・書き込み・再実行を許可するものではありません。過去のP1001原因は未確定です。VercelのPreview/exact test/stagingへのDB接続設定反映と実アプリの確認は別工程で、完了を確認するまで自動配備の抑止を維持します。

自動更新を有効にする前に、VercelのGit連携・Production branch、対象SHA、exact branch guard、専用DB/Clerk/Blobの対応と変数scopeを秘密値なしで照合します。共通Preview値が残る場合、branch固有値が同名値を上書きすることと、専用branch以外へ適用されないことを確認します。配備抑止解除、環境設定の変更、push、merge、deployは対象・副作用・順序を確認した承認範囲で実行します。main採用とProduction配備は別承認です。

ローカルの帯・Blob回帰は `node --import tsx --test tests/test-environment-banner.test.ts tests/test-preview-blob.test.ts`。実認証・所有権分離・保存・公開・STOP・画像uploadは、対象SHAのテスト環境で別途確認します。単体テストをこれらのPASSとして扱いません。

<a id="troubleshooting"></a>
## よくある失敗：原因 → 修正箇所 → 再確認

| 症状 | 確認する原因・修正箇所 | 修正後の確認 |
| --- | --- | --- |
| Dockerへ接続できない | Docker Desktop未起動、Linuxエンジンが未準備。まずアプリ側を直す前に環境を確認 | `docker info`、対象Composeの `ps` |
| 3100/3101が使用中 | 別プロセス・別構成を重複起動していないか。無関係なプロセスを停止しない | 起動対象を整理し、正しいURLを開く |
| DBを読み込めない／P1001等 | `.env.local` の優先、接続先、ネットワーク、test-dbの健康状態。パスワードをログに出さない | 対象DB確認後、公開一覧と管理側を再確認 |
| テスト初期化のガードで停止 | 通常Composeで実行、接続URLの片方だけ違う、Clerkが本番用 | `compose.test.yaml` と開発用キーを確認。ガードは削除しない |
| ログインできるが編集できない | `User.clerkUserId`、所有稼働店舗、ポートフォリオ制限。認証成功だけでは不十分 | 許可された専用アカウントで確認。他店舗は拒否されることも確認 |
| 正規の管理要求が403になる | 公開URLのスキーム・Host・ポートとプロキシ設定。Origin制御を外さない | 正規HTTPS要求と異なるOriginの拒否を両方確認 |
| ログイン補助APIが429になる | `Retry-After`、Vercel以外で共有されるIP不明枠、プロセス内制限 | 待機後に再確認。転送ヘッダーの偽装で制限を避けない |
| 招待取消が502・再送が失敗する | DB上の状態とClerk側の処理結果。上記の再試行・照合手順 | 確定済み受諾を維持し、取消再試行または対象を限定した運営確認 |
| 公開できない | マスタ集合や未設定が不完全 | 入力の見直しと公開検証テスト。未設定を一括でFREEにしない |
| 画像が保存・表示できない | 形式・サイズ、Blob接続、許可URL、店舗パス | 専用画像のアップロードと保存後再読込。不要画像の自動削除を期待しない |
| Playwrightが見つからない | ランナー未準備、保存先の変更、指定ブラウザの不一致 | `node scripts/browser-runner.mjs install` と実在する `BROWSER_EXECUTABLE` を確認。アプリ依存へ追加しない |
| buildとdevで生成物が壊れる | 同じ `.next` の同時使用 | 対象dev停止後build。無関係なDBボリュームは削除しない |
| Dockerを再buildしても依存が古い | 既存の依存ボリュームが残っている | 依存更新が承認済みなら対象app停止後、同じComposeで `run --rm --no-deps app npm ci` と `run --rm --no-deps app npx prisma generate`、再起動。DBボリューム削除は不要 |

手順の根拠は現行設定とスクリプトです。補助的にContext7で[Composeのenv_file](https://docs.docker.com/reference/compose-file/services/#env_file)、[環境変数の優先順位](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/)、[Next.jsのrevalidatePath](https://nextjs.org/docs/app/api-reference/functions/revalidatePath)、PrismaのCLI資料を確認しました。取得したPrisma資料にはv7の例も混在していたため、v7移行手順をこのPrisma 6の環境へ採用していません。

認証境界の変更ではContext7で[Vercelの要求ヘッダー](https://vercel.com/docs/headers/request-headers)、[Next.jsのデータ保護](https://nextjs.org/docs/app/guides/data-security)、Clerkのサーバー認証とセッション有効化の資料を確認しています。資料の説明と、このリポジトリのカスタムAPIで実装した検査、実際の配備設定は分けて確認します。

未解決解除は `node --import tsx scripts/check-publication-database.ts` からも検証します。専用CI接続先のガード後に、その実行が所有する一時店舗で、旧履歴不変・現行版束縛・UNKNOWN維持・別公開・削除失効・並行訂正を確認し、後始末します。

### Runtime依存の限定override

`@vercel/cli-config@0.2.0` 配下のZodはroot4.6.6へ合わせます。旧exact pinの公式advisory対策であり、Vercel SDK・認証設定の更新ではありません。上流consumer/Zodを更新するときはoverride削除可否と純粋schemaのparse/encode互換性を `tests/runtime-dependency-compat.test.ts` で再確認してください。[範囲・隔離・残gate](../verification/runtime-dependency-security-20261024.md)を参照してください。
