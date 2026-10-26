# 公開UI検査の終了時例外とReact #419（2026-10-25）

[確認範囲](../guide/verification.md) · [実行手順](../guide/development.md#browser) · [変更対応表](../guide/change-map.md)

## 2026-10-26の単一候補による再検証（push前の記録）

以下の2026-10-25の実行結果は過去の証拠であり、新しい候補の結果ではない。集約の基点は `e70d037052242fbc6d0f78860e3a42d2405b681e`、候補枝は `codex/combined-validation-20261026`。その後、deploy抑止と実効設定を確認できた場合に限り、同候補と必要な非秘密証跡の通常push・既存CIの同枝指定による手動実行が承認された。以下の確認時点ではpush・CI起動とも保留中。全変更の正式採用、PR作成・更新、merge、deploy、本番・共有DBやサービス設定の変更は含まない。

| 集約元 | 採り込む差分 |
| --- | --- |
| UI `0cae37dc9b4d8d8551c433e415957f14b3161b63`（親e70d037） | 終了時までの未知例外観測、限定した404 digest照合、unitと関連説明 |
| CI説明 `860489b066e7a3d81ec49b2e4f1a4c17224b1489`（親e70d037） | 現存するscope/snapshot/server証跡検査と、実Actionsへの未接続を区別する説明・既存結果 |
| UTC証跡 `abffb13d2c987b2482bdfcdfbc8dfca3f17d6534`（親e70d037）、その子 `c2b74839700c942ef3b7cb78ae3af822df562cd5` | 限定した失敗・復元試験の説明、元スクリプト・合成出力の保存。migration自体の変更なし |

元コミットは既存公開枝に保持し、その差分を新しい作者・コミッター `Kaito-Iwase <175584093+Kaito-Iwase@users.noreply.github.com>` の集約コミットへ記録する。元作者の履歴を書き換えず、今回すべてを新規実装したとも扱わない。各差分はvercel.json以外を順に適用し、UIとUTCのdevelopment.mdの別々の説明を保持する。vercel.jsonはe70の7項目とUI・CI説明・UTC各枝のfalseを合併し、この検証枝のfalseだけを追加する。

元PRを再適用しない。mainとの競合が報告された4件の対応は次のとおり。

| 元PR | e70系統の対応・差異 |
| --- | --- |
| #96 | `8b689b6`。公開取得の5コード・テストblobが元PRと一致。実測速度改善の証明ではない |
| #101 | `009f299`。HTML障害の案内helperを保持し、回帰を現mainへ適応した候補。元PR全体と同一ではない |
| #102 | `c1ceb47`。4つの本体・schema・migration blobが元PRと一致。今回のUTC証跡追加は、このmigrationの本番採用・適用承認ではない |
| #105 | `6840180`、`a4d6c00`、`26b255d`。追加の範囲・証跡検査とLinux終了処理を含み、元PR単体とは同一ではない |

#95の文書は `940d2ae` と `b237c8f` で既に適応済み。#108（確認HEAD `0d8b3944385c163c640c6351eac849cc65e8001e`）は別扱いとし、その文書・Dependabot関連設定を取り込まない。共有パスは `docs/guide/change-map.md`、`docs/guide/development.md`、`vercel.json`。#108の枝・PRとそのdeploy guardは変更しない。後に#108と統合する場合は、双方の文書とguardを明示的に照合する必要がある。

検証対象は `2a3b4ea66b221e6f6add3bd69d93ff9d4ecb4487`、tree `1a4f50cab2dc6099d7733b53e557a0f53f4277b9`。以下はこのSHAの直接実行結果であり、この報告だけを追加する後続コミットや将来のCIの成功証明ではない。

| コマンド／検証 | 2026-10-26 UTCの結果 |
| --- | --- |
| `npm run build` | PASS、exit 0、03:42:50–03:43:13。実行前に`.next`なし。Prisma Client 6.19.3、Next 16.4.1 |
| `npm run lint` | PASS、exit 0、03:43:37–03:43:50 |
| `npm test` / `npm run typecheck` | UNVERIFIED。初回の出力・receiptがENOSPCで空になり、結果を復元できない。再試行はDocker起動時exit 125で検査開始前に停止。成功件数は不明 |
| 使い捨てDB・公開版・UTC回帰 | NOT_RUN。新規PostgreSQLのinitdbが`pg_wal`作成時ENOSPCで停止。fixture/schema作成前 |
| `node scripts/browser-runner.mjs ui` | NOT_RUN。新buildのUI検証に必要な合成DBを開始できなかった |
| 実GitHub Actions / phase・summarize | 未実行／未検証。直接実行を同一SHAの実CIやphase receiptに読み替えない |

新BUILD_IDは `hTNoqSRE_vA6HZE8w1Ct9`、保存済みbuild fingerprintは `2b930ed49bd168c32678d1adb6060da858a9ec638f1051f4d15875dfee38ef84`。520追跡ファイルの前後一致を確認したsource manifest SHA-256は `6599abfe22a2bbcb7ce08dbb91c544d2003cf0c94bb864024278ce07f753c93f`。build log SHA-256は `97aa299bc61568c8d4327d35054478207fb868fd72b4dd314fa6e667fa044748`。原本のbuild/lint receiptとlogは作業環境内に保持し、資格情報やraw logはこの文書へ転記しない。

Node 22.23.4 / npm 11.18.0、既存同一lockfile依存を使い、Dockerのread-only root・UID 1000・capabilityなし・home/資格情報/socketのmountなしで実行。buildのみ通常bridge、lintはnetwork none。Fonts通信は通常経路で成功したが、依存のclean installやPrisma配布先403の解消を証明しない。以前の通信可否が変わった主体も不明。root/workspace/Docker側の利用可能容量0が継続し、別volumeの`/tmp`の空きだけではDockerを起動できない。容量のある許可済み隔離環境で未完了検査を再開する必要がある。古いUI結果・test件数はこの候補の結果に加えない。

push前のリポジトリ検査では、`git.deploymentEnabled`は11個の完全一致`false`のみで、候補名に一致するのは候補自身の1項目。競合する`true`やwildcardはない。CI workflowはe70と同一で、push対象はmain/developのみ。既存2 workflowにdeploy処理、reusable workflow呼出、`repository_dispatch`・`deployment_status`・`workflow_run`の連鎖はない。既存CIの手動実行は使い捨てPostgreSQLサービスと固定架空認証を使い、実Secrets参照・実Clerk/Blob操作はない。公開ページはClerk middleware対象外、公開browserは外部通信を遮断し、公開操作のcomponent検査は全APIを架空応答へ差し替える。npm/Prisma/Chromium/Fonts取得の外部通信は必要であり、ジョブ全体のnetwork denyを意味しない。

既存CIはunit/lint/type/build、公開版移行・DB制約・所有権・店舗保存、架空保存公開component、公開prototype browserを実行する。一方、追加UI observer、専用UTC境界検査、全P0 phase/summarizeを完走させる構成ではない。CI成功とそれらの未達を分けて扱う。Vercel実効設定の読取はPingu側の別証拠であり、この文書はpush後のdeployment不発生の実観測ではない。

実CI、最新inventoryに基づくphase/summarize、人間確認は別gate。GitHub-hosted情報を偽装せず、通常の直接実行をphase receiptへ読み替えない。#101/#102/#105は各3回、旧P1は引継ぎ上2回のレビュー上限を保持し、この集約では独立レビューを追加しない。旧P1の未取得差分を再構成せず、旧hash不一致も解消済みとしない。

## 同一候補の実CIと別環境UI検証（2026-10-26追記）

検証した候補は `cda3fef880ddc96f632dc06d7bdf9005f8f4bab0`、tree `34464851551c9232ace9949404a7b9591c302ce7`。これは上記2a3b4eaに結果報告だけを追加したコミットで、04:26 UTCに同名リモートへの通常pushとHEAD一致を確認した。この追記を保存する後続コミットも文書変更だけであり、以下の成功・失敗を後続HEADの実行結果へ読み替えない。

### 本人が起動したGitHub Actions

この実装担当の `gh workflow run ci.yml --repo Kaito-Iwase/ClearAllergy --ref codex/combined-validation-20261026` は、事前の `GET /repos/Kaito-Iwase/ClearAllergy/actions/workflows/ci.yml` が `Forbidden`、exit 1となり、dispatch POSTに到達しなかった。再試行や別資格情報による迂回はしていない。これだけでworkflow書込み権限の不足とは断定しない。その後、本人が起動した実行をPinguがGitHub metadata・jobs・全job logから独立に確認し、次の結果を提供した。この担当が再実行・再取得した結果ではない。

- [CI run 40270068119](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/40270068119)、attempt 1、event `workflow_dispatch`、actor `Kaito-Iwase`。
- 作成 `2026-10-26T04:37:59Z`、完了 `04:40:54Z`、conclusion `success`。job `121400755718` は `Test, lint, typecheck, and build`。
- checkout後の`git log`で上記cda3fefを確認。PR用merge SHAではない。

| 既存workflowの検証 | Pinguが確認した結果 |
| --- | --- |
| `npx prisma generate` / `npx prisma validate` | PASS |
| `npm test` | 287件PASS、失敗0 |
| `npm run lint` / `npm run typecheck` | PASS |
| 空の使い捨てDBでの二段階公開upgrade | PASS |
| PostgreSQL制約・rollback・公開版・所有者のメニュー書込み・店舗保存 | PASS |
| `npm run build` | Next 16.4.1の新規build PASS。既存build cacheの流用なし |
| `node scripts/browser-runner.mjs publication` | 架空API応答へ差し替えた保存・公開component検査PASS |
| `node scripts/browser-runner.mjs public` | 公開prototypeのChromium検査PASS |
| 失敗時summary / artifact upload | 失敗時summaryは条件によりskip、artifact upload成功 |

artifact IDは `12628370679`、名前は `prototype-browser-cda3fef880ddc96f632dc06d7bdf9005f8f4bab0`、サイズは4,521,128 bytes、GitHub metadataのdigestは `sha256:55f0d2cf18c65f68767055e9a8df51a02b96cfc73d3a39126d13106cdbfe27c0`、期限は `2026-11-02T04:40:47Z`。ZIP内容は再取得・展開しておらず、このdigestは独自再計算値ではない。CIのBUILD_ID／build fingerprint receiptも未取得で、raw artifactをこのリポジトリへ保存したとは扱わない。既存通常CIの成功であり、追加UIモードや全P0 phase/summarizeの成功ではない。

### 別の隔離環境で行った追加UI検証の試行

別タスク `01a17679-e260-7688-8be8-4e2f951fa033` の完了報告をPinguから受領した。対象は同じcda3fef/treeで、520追跡ファイルの前後一致・cleanを確認したという報告である。この担当自身の実行や、上記CIと同じ環境の結果として記載しない。

| 実行・確認 | 別タスクから提供された結果 |
| --- | --- |
| Node / npm | 22.23.4 / 11.18.0 |
| clean install / lint / 文書リンク | PASS / PASS / 239件PASS |
| unit | 173件PASS、生成済みPrisma Client不足で9ファイル失敗。観測器の9ケースはPASS。全unit成功ではない |
| typecheck | FAIL：Prismaの生成型不足 |
| Prisma engine checksum取得 | 公式`binaries.prisma.sh`でHTTP 403、exit 1 |
| Chromium取得 | HTTP 403 |
| 新build・BUILD_ID・fingerprint、DB回帰、`browser-runner.mjs ui` | NOT_RUN |

通信拒否の迂回・再試行は行わず終了。利用可能ディスクは開始時約30GB、終了時約12GB。runtimeはloopbackのみ、実資格情報・home・Docker socketを持ち込まず、使い捨てDBは0テーブル、作成したcontainerは全停止という報告である。証跡は別途本人へ提供済みだが、非公開保存先のリンクや内容はこのリポジトリへ転載していない。GitHub CIの成功によって、この別環境の403や追加UI未実行が解消したとは扱わない。

### deploy観測と残条件

PinguによるVercelの読取では、04:32:29 UTC時点でcda3fefのSHA検索は`No Results`、候補ブランチ検索も該当なし。04:32:46 UTC時点のProduction deployment `AAyye7c49YsNypAkqpZaA6VMWaa7` はmain `0b6ed291b2fd853230c7efdeeb1e061815404a81` のReadyのまま変更なしだった。これは特定時点の観測で、抑止理由のreceiptはなく、将来やこの追記の後続HEADまでdeploymentがないという保証ではない。候補の11個の完全一致falseは変更しない。

残る追加UI検証には、容量のある許可済み隔離環境で公式Prisma engine/checksum・Chromiumを取得できる条件、生成済みPrisma Clientと使い捨て合成DBが必要。正規の環境条件が整ってから対象SHA/treeと新buildの対応を保存し、既存の未知例外観測を含むUIモードを実行する。取得拒否を無視したbuild、旧buildの代用、検査緩和は行わない。この文書追記を理由とするCIの再起動やテストの反復は行わない。

人間の最終確認、UTC migrationの正式採用・本番適用判断、未取得の旧P1 source、P0の残条件、旧hash不一致は引き続き未解決。独立レビューは追加せず、既存回数上限を保持する。#108は別扱いのままで、元PR・main/develop・サービス設定・製品コードを変更しない。

## 対象と判断

基点は統合候補 `e70d037052242fbc6d0f78860e3a42d2405b681e`、独立ブランチは `codex/ui-error-observation-20261025`。比較したmainは `0b6ed291b2fd853230c7efdeeb1e061815404a81`。検査中のHEADは基点のままで、当該ブランチの作業差分を実行した。実行コードのSHA-256は保存した `tested-source-files.json`、最終コミットはPR・引継ぎ報告で特定する。

`/shops/ui-audit-does-not-exist` を開き「店舗一覧を見る」で `/shops` に戻ると、mainと統合候補の両方でReact #419が2件発生した。通常画面の事前観測は0件、その他の例外は0件。両方ともHTTP 200、404案内、`NEXT_HTTP_ERROR_FALLBACK;404`、noindex、一覧の見出しへの復旧を確認した。

windowのerrorイベントを変更せず観測すると、発生時のURLは `/shops` でも、初期documentは存在しない店舗URLで、例外自身の `digest` は2件とも `NEXT_HTTP_ERROR_FALLBACK;404` だった。URLだけでは元のdocumentを特定できない。

- [React #419の公式説明](https://react.dev/errors/419)は、サーバーがSuspense境界を完了できずクライアント描画へ切り替えた状態を指す。
- [Next.js not-foundの公式説明](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)は、streaming前は404、開始後は200のままnot-found UIを返し、noindexを付与する。司令塔が確認した更新日は2026-10-06。Context7はこの実行環境では利用できなかった。
- 実装の `PublicShopDetailPage` はDB取得後の店舗欠損で `notFound()`、ルートの `loading.tsx` はSuspense境界になる。Next 16.4.1同梱Reactの `react-dom-client.production.js` は境界の `dataset.dgst` を#419例外に保存し、Nextの `onRecoverableError` → `reportGlobalError` がブラウザへ報告する。実際のdigestと一致した。

したがって、今回再現した事象は既存のstreamed not-found描画切替と判断した。HTTP 200や番号だけから全#419を正常とは判断しない。製品コード・表示・食品仕様・認可・schema・依存は変更していない。これは実サービスや全ルートの無欠陥を示す結果ではない。

## 修正した検査の欠陥

以前は例外配列のassertionと404のPASS表示の後でcontextを閉じ、その間に届いた例外を判定し直さなかった。font fallbackにも同じ順序の欠陥があった。旧404許容はメッセージの#419 prefixと応答本文だけで、例外自身のdigestを照合していなかった。

既存 `browser-runner.mjs ui` の内部を修正した。新しい自律ハーネスや実行モードは作っていない。

1. 通常・font fallback・404復旧を別contextで観測する。page作成前からcontextの `weberror` を収集し、popupも含める。
2. `context.close()` が完了してから例外を判定する。個別assertionの表示は `CHECK`、全context判定とbrowser終了の後だけ `Completed` を表示する。
3. 404の例外許容には、確認済み応答のpage・URL・HTTP 200/404・404 digest・noindexに加え、例外自身の404 digest、初期document URL、発生時URL（元404または復旧先一覧）、同じpageのmain frameを要求する。受信したdigest記録1件を例外1件と対応させ、同じメッセージの別例外をまとめて許容しない。
4. `addInitScript` のerrorリスナーと `exposeBinding` は証拠を収集するだけで、`preventDefault` やアプリの例外ハンドラー変更は行わない。digest記録が欠けた例外は失敗する。
5. 件数とcontext終了状態を `client-error-checks.json` に保存する。未知の例外本文は出力しない。正常・fallbackの#419、未知の復旧例外、異なるdigest/document/page/frameは失敗する。

観測境界は各contextの作成から終了完了まで。無制限の待機・固定sleepの追加はしていない。復旧後は一覧の見出しと店舗リンクを待ってから終了する。閉じたページで将来実行されるはずだったタイマーや、未操作の経路まで検証したとは扱わない。

## RED / GREENと実行結果

Node 22.23.4、Next 16.4.1、React/React DOM 19.2.7、Prisma Client 6.19.3、既存Playwright 1.61.0とシステムChromium。ブラウザの外部リクエストは遮断、アプリはloopbackのみ。CI同様の架空認証と既存synthetic PostgreSQLだけを使用した。process環境の固定をOS隔離の証明とは扱わない。

| 実行・観測 | 結果 |
| --- | --- |
| main / 統合候補の404復旧診断 | 各#419 2件、例外自身の404 digest一致、その他0件、復旧成功 |
| 旧検査のcontext.close直前に実Chromiumで未知の `reportError` を注入 | RED：未知例外をログに出しながらexit 0、`Completed: 12 UI groups passed`。誤った成功を再現 |
| 修正後、通常 / fallback / 404復旧の各context終了時に同じ未知例外を注入 | GREEN：3ケースすべてexit 1、`Completed` なし。404復旧は既知2件と未知1件を区別 |
| `npm test` | 287件PASS、失敗0、skip 0。観測器の追加unit 9件を含む |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | FAIL（環境）。初回は作業ディスク容量不足、worktree移動後はGoogle FontsのNoto Sans JP取得に接続失敗。ネットワーク制限の迂回・さらなる再試行なし |
| `node scripts/browser-runner.mjs ui` | PASS：12群。通常0、fallback 0、404復旧のdigest一致#419 2、未知0。全context終了後に判定 |
| `node scripts/agent-harness.mjs verify --base e70d037052242fbc6d0f78860e3a42d2405b681e --output ui-error-observation-preflight.json` | UNVERIFIED、exit 1。scope/最新snapshot未準備・信頼できる一時実行環境の証拠不足。ハーネスの内部検査はNOT_RUN |

型検査の初回失敗は補助関数のJSDocが分割引数に対応せず、optional引数を必須と推論したため。名前付きoptions引数で修正した。ブラウザ検証ラッパーのポート事前確認はTIME_WAITを占有と誤認したため、実待受がないことを確認してSO_REUSEADDRを設定した。検査本体のassertionを緩和していない。

新規build未達のため、UIは製品ソースが一致する既存統合候補のビルド（BUILD_ID `GRjz0HMGgbDmbai_diP6j`）に対して、今回の検査スクリプトで実行した。新しい候補全体のbuild成功とは扱わない。アプリ・依存・schemaが変わらず、この修正のための新規DB migration/write試験は不要。既存のloopback DBで公開画面を読む検証は実施した。

生ログ・コマンドJSON・注入ラッパー・画像・digest診断は、作業環境の `/workspace/.cloud-setup/ui-error-observation-20261025/` に保存している。これは利用者が直接取得できる外部保存先ではない。主な記録名は `main-digest/`、`final-digest/`、`red-inject-normal/`、`green-inject-normal/`、`green-inject-fallback-v2/`、`green-inject-recovery-v2/`、`full-ui/`、`unit-final.log`、`lint-final.log`、`typecheck-final.log`、`build-fixed.log`。初回ハーネス実行は容量不足で報告保存前に失敗し、容量確保後の `.agent-runs/ui-error-observation-preflight.json` が上表の正式な停止記録。

注入は検証専用のPlaywright module wrapperで `browser.newContext()` の戻り値の `close` を包み、指定contextの既存pageで `await page.evaluate(() => reportError(new Error('synthetic-late-client-error')))` を実行してから元の `close` を呼ぶ。通常1番・fallback2番・修正後404復旧3番を個別実行した。製品コードには注入経路を追加していない。unitは非同期の終了時例外、digest欠落・取り違え・重複message・他page/frame、終了失敗と診断の秘密値非出力も確認する。

## 残る確認と公開境界

- 新規build、実CI/phase receipt、最新GitHub snapshot、実Clerk/Blob、本番・Preview、実機、人間レビューはUNVERIFIED。direct unit/UIの成功をハーネスやremote CI成功へ読み替えない。
- #101/#102/#105の独立レビューは各3回到達のまま。この差分で既存修正のレビューを反復・リセットしていない。今回の観測器の独立レビューも未実施で、Draftからの採用前に人間確認が必要。
- push対象の正確なブランチ名だけを `vercel.json` の `git.deploymentEnabled` にfalseで追加し、既存7項目を保持。既存workflowはpushとPR baseがmain/developの条件であり、このブランチと統合候補baseのDraftではCIが起動しない。設定上の自動deploy抑止と、サービス側の実観測は別。
- Draftのbaseは `codex/font-portability-local-20261025` とする。mainへの単独修正として扱わない。統合候補の採用状態・残レビューと新規buildを確認してから、人間が統合順序を判断する。既存PR・main・Productionは変更しない。
- 元候補、古いZIP、旧hash不一致、実CI証拠不足は保持する。この作業で解消していない。復旧時は基点e70d037を取得し、今回のpatch/bundleを独立枝で適用する。自動deploy抑止を確認せず別名の枝をpushしない。
