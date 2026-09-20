# 起動・確認・変更の進め方

[READMEへ](../../README.md) · [内部処理](architecture.md) · [変更対応表](change-map.md) · [文書の保守](maintenance.md)

ここに載せるコマンドはリポジトリの設定から整理した手順です。今回すべてを実行した記録ではありません。[確認範囲](verification.md)に実施と未実施を分けています。以下のコードブロックは**PowerShellで実行する手順**で、アプリのソース抜粋ではありません。

<a id="environment"></a>
## 1. どの環境を使うか決める

作業フォルダは `C:\Users\kaito\Documents\Github\ClearAllergy`。Node.jsは `.node-version` の22.23.1、Dockerfile・CIのnpmは11.18.0です。Windowsでは `npm.cmd` / `npx.cmd` を使います。既に準備済みの環境は、最初に再インストールせず状態を確認します。

| 実行方法 | アプリ | DB | 外部サービス・用途 |
| --- | --- | --- | --- |
| ホストの `npm.cmd run dev` | 通常3000番 | 環境変数で指定。ローカルDBを自動作成しない | 開発者が用意した接続。実データの接続を安易に流用しない |
| `compose.yaml` | localhost:3100 | **DBサービスなし**。`.env` / `.env.local` の接続先 | Linuxコンテナ内でアプリを動かす通常開発 |
| `compose.test.yaml` | localhost:3101 | Compose内部の `test-db`、PostgreSQL 17、DB名 `clearallergy_test`。ホストへDBポートを出さない | 保存・所有権・公開の検証用。Clerk開発環境とBlobは外部接続が残る |
| GitHub Actions | ジョブ内3000番 | そのジョブだけのPostgreSQL 17 | CI（変更ごとの自動検査）。公開画面だけを架空データで検証。実Clerk認証・Blob更新なし |

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
| `ENABLE_CLERK_ADMIN_AUTH` | Google / Clerk SSO導線の表示判定に使う。全認証の無効化スイッチではない |
| `NEXT_PUBLIC_APP_URL` | 公開URL・QR等の基準URL |
| `BLOB_READ_WRITE_TOKEN` / `ALLOWED_IMAGE_URL_PREFIXES` | アップロードと許可する画像ストア。未設定なら画像機能を無理に試さない |
| `GOOGLE_MAPS_SERVER_API_KEY` | 管理画面のGoogle店舗候補検索用 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` / `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | 旧地図用設定。現在の公開画面は動く地図を提供しない |
| `ADMIN_REGISTRATION_MODE` / `ADMIN_REGISTRATION_INVITE_TOKEN` | 旧登録方式の設定。現行の自己登録停止を解除しない |

`NEXT_PUBLIC_` が付いた値はブラウザへ届き得ます。秘密鍵やDB URLには使いません。ローカルで不足したキーを、CI用の非実在値や本番値で埋めればよいという手順ではありません。

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

初回取得で依存がない場合だけ `npm.cmd ci`（lockfile通りに依存を配置）、続けて `npx.cmd prisma generate`（DB構造定義からアクセス用コードを生成）を行います。後者はDBのマイグレーションではありません。未初期化DBに対する既存マイグレーション適用は別の書込作業です。接続先と権限を確認せず `migrate dev`、`db push`、`seed` を起動のついでに実行しないでください。

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

通常のコード変更はlint・型・テスト・buildが最低限です。文書だけならリンク・実装照合・差分確認で省略でき、理由を報告します。Docker内では `npm.cmd` ではなく `npm` を使い、たとえば `docker compose -f compose.test.yaml exec app npm test` とします。

開発サーバーとbuildが同じ `.next` を使う構成では競合を避けます。次の各行は、テストアプリ停止、一時コンテナでbuild、開発アプリ再起動です。DBは起動したままにします。

```powershell
docker compose -f compose.test.yaml stop app
docker compose -f compose.test.yaml run --rm --no-deps app npm run build
docker compose -f compose.test.yaml up -d app
```

<a id="browser"></a>
### ブラウザ・実DB検証

ブラウザ回帰は、既に利用できるPlaywright（ブラウザ操作の自動化ツール）とChromiumを指定します。アプリの依存として追加されている前提ではありません。Windowsホスト用の実在パスを確認し、次のプレースホルダーを置き換えてください。

```powershell
$env:PLAYWRIGHT_MODULE_PATH = 'C:\実在する場所\playwright'
$env:BROWSER_EXECUTABLE = 'C:\実在する場所\chrome.exe'
node scripts/check-first-use-browser.mjs
```

1行目はモジュールの場所、2行目は実行するブラウザ、3行目は回帰の実行です。先の2行はそのままでは実行可能な例ではありません。既に解決できる環境なら指定を省略できます。既定の接続先はlocalhost:3101。公開済みの架空メニュー（豆乳ベジカレーなど）と管理デモが必要です。

| 確認スクリプト | 対象・副作用・成功時の確認 |
| --- | --- |
| `scripts/check-first-use-browser.mjs` | 公開検索、スマホ表示、個人設定の追加・解除・競合・保存失敗、詳細遷移、デモの未保存保護等。ブラウザ内設定を操作しDB更新はしない。PASS出力とスクリーンショットを確認 |
| `scripts/check-test-browser.mjs` | 固定localhost:3101、専用アカウントファイル、Dockerのテストアプリを使う。実Clerkログイン、店舗説明更新、メニュー作成・公開・編集・削除、Blob画像追加、別店舗拒否。許可した専用環境だけで `node scripts/check-test-browser.mjs` を実行 |
| `scripts/check-test-database.ts` | 専用DBガード後、一時店舗等を書き込み、欠損・UNKNOWNの自動非公開、MAY_CONTAINの公開維持、ロールバックを確認。自分が作った店舗を最後に削除。`docker compose -f compose.test.yaml exec app node --import tsx scripts/check-test-database.ts` |
| `scripts/cleanup-test-images.ts` | 記録ファイルのURLが専用店舗の画像か検証し、Blobから削除する。削除の許可があるときだけ `docker compose -f compose.test.yaml exec app node --import tsx scripts/cleanup-test-images.ts`。失敗時は記録ファイルを保持 |

最初の回帰だけ、`CLEARALLERGY_BROWSER_BASE_URL` で接続先、`CLEARALLERGY_BROWSER_OUTPUT` で画像出力先、`CLEARALLERGY_BROWSER_PUBLIC_ONLY=true` で公開側のみ、`CLEARALLERGY_BROWSER_BLOCK_EXTERNAL=true` でブラウザ外部通信遮断を指定できます。後者はアプリサーバーの外部通信まで止めるものではありません。`check-test-browser.mjs` の接続先を同じ変数で変えられると推測しないでください。

### 自動テストで置き換えられない手動確認

- 公開側：スマホとPCで、検索→設定を1つ適用→後から2つ追加→一部解除→キャンセル→一覧→詳細をたどり、全確認対象の表示を比較する。TabキーとEnterでも操作する。
- 登録側：専用環境で下書き保存→再読込→未設定の公開拒否→全品目を入力して公開→原材料変更時の確認→公開側への反映を確かめる。
- 権限：未ログイン、別店舗、閲覧専用の各条件で拒否を確認する。運営招待は外部メール送信を伴うため別途許可された試験対象が必要。
- 失敗時：DB障害と0件、設定の保存失敗、画像失敗、未保存移動の違いを確認する。実データを壊して障害を作らない。

<a id="operations"></a>
## 5. 運用スクリプトとCI/CD

`seed` は起動コマンドではありません。既存デモの更新、同名メニューと品目リンクの再作成、古いマスタの削除、条件付きClerk同期を含みます。`auth:create:test-user`、`auth:migrate:clerk` はClerk・DB更新、`allergens:backfill:pistachio`、`repair:published-menus` はDB補正を伴います。`allergens:check` も実DBを読むので接続先を確認します。名前だけで安全と判断せず、変更対応表から本体を読んでください。

CI定義は `.github/workflows/ci.yml`。main/develop向けPR、両ブランチへのpush、手動実行で動きます。同じ参照の古い実行をキャンセルし、`Test, lint, typecheck, and build` のジョブで次を順に行います。

依存配置 → Prisma生成 → 単体テスト → lint → 型確認 → CI専用DB準備 → build → 起動 → 公開ブラウザ回帰 → スクリーンショット保存。

専用DB準備は `scripts/setup-ci-env.ts` / `ci-environment.ts` が固定した一時DBを確認し、既存ユーザー・店舗・メニューがあれば投入を拒否します。架空1店舗3メニューを用意し、GitHub Secretsや実Clerk・Blobを使いません。ブラウザ用Playwrightはジョブの一時ディレクトリに用意し、画像成果物はSHA（コミットの識別値）付きで7日間保存します。

CDは配備・公開の自動化のことです。このCIにはVercelへのdeployや本番DB migrationはありません。VercelのGit連携、Production Branch、環境別のDB・Clerk・Blob設定は管理画面側の確認事項です。GitHubの必須チェックもYAMLだけでは強制されません。PRの成功SHAと公開するSHA、ブランチ保護の対象・バイパス、Vercelのmain/Node 22設定を確認します。現在のクラウド設定・稼働状態はこの文書だけで保証しません。

<a id="troubleshooting"></a>
## よくある失敗：原因 → 修正箇所 → 再確認

| 症状 | 確認する原因・修正箇所 | 修正後の確認 |
| --- | --- | --- |
| Dockerへ接続できない | Docker Desktop未起動、Linuxエンジンが未準備。まずアプリ側を直す前に環境を確認 | `docker info`、対象Composeの `ps` |
| 3100/3101が使用中 | 別プロセス・別構成を重複起動していないか。無関係なプロセスを停止しない | 起動対象を整理し、正しいURLを開く |
| DBを読み込めない／P1001等 | `.env.local` の優先、接続先、ネットワーク、test-dbの健康状態。パスワードをログに出さない | 対象DB確認後、公開一覧と管理側を再確認 |
| テスト初期化のガードで停止 | 通常Composeで実行、接続URLの片方だけ違う、Clerkが本番用 | `compose.test.yaml` と開発用キーを確認。ガードは削除しない |
| ログインできるが編集できない | `User.clerkUserId`、所有稼働店舗、ポートフォリオ制限。認証成功だけでは不十分 | 許可された専用アカウントで確認。他店舗は拒否されることも確認 |
| 公開できない | マスタ集合や未設定が不完全 | 入力の見直しと公開検証テスト。未設定を一括でFREEにしない |
| 画像が保存・表示できない | 形式・サイズ、Blob接続、許可URL、店舗パス | 専用画像のアップロードと保存後再読込。不要画像の自動削除を期待しない |
| Playwrightが見つからない | 外部ランナーのパスかWindowsブラウザ実行ファイルが不一致 | 上記環境変数を実在パスへ修正し再実行。無断で依存追加しない |
| buildとdevで生成物が壊れる | 同じ `.next` の同時使用 | 対象dev停止後build。無関係なDBボリュームは削除しない |
| Dockerを再buildしても依存が古い | 既存の依存ボリュームが残っている | 依存更新が承認済みなら対象app停止後、同じComposeで `run --rm --no-deps app npm ci` と `run --rm --no-deps app npx prisma generate`、再起動。DBボリューム削除は不要 |

手順の根拠は現行設定とスクリプトです。補助的にContext7で[Composeのenv_file](https://docs.docker.com/reference/compose-file/services/#env_file)、[環境変数の優先順位](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/)、[Next.jsのrevalidatePath](https://nextjs.org/docs/app/api-reference/functions/revalidatePath)、PrismaのCLI資料を確認しました。取得したPrisma資料にはv7の例も混在していたため、v7移行手順をこのPrisma 6の環境へ採用していません。
