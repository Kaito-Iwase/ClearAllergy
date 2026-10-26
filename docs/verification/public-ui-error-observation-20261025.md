# 公開UI検査の終了時例外とReact #419（2026-10-25）

[確認範囲](../guide/verification.md) · [実行手順](../guide/development.md#browser) · [変更対応表](../guide/change-map.md)

## 2026-10-26の単一候補による再検証

以下の2026-10-25の実行結果は過去の証拠であり、新しい候補の結果ではない。本人が承認した今回の範囲は、`e70d037052242fbc6d0f78860e3a42d2405b681e` を基点とする独立ローカル枝 `codex/combined-validation-20261026` への集約と検証まで。全変更の正式採用、push、PR更新、merge、deploy、本番・共有DBやサービス設定の変更は含まない。

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

新しい検証は確定した候補HEAD/treeを記録し、`npm test`、`npm run lint`、`npm run typecheck`、`npm run build`、既存の `browser-runner.mjs ui` と影響する使い捨てDBの確認を対象とする。古いBUILD_IDを再利用して新ビルド成功にしない。検証実施前に書いたこの節は成功証明ではなく、実際のコマンド・終了コード・候補と新buildの対応は別の実行記録で示す。Prisma/Fonts・隔離環境の不足があれば失敗または未実行として残す。

実CI、最新inventoryに基づくphase/summarize、人間確認は別gate。GitHub-hosted情報を偽装せず、通常の直接実行をphase receiptへ読み替えない。#101/#102/#105は各3回、旧P1は引継ぎ上2回のレビュー上限を保持し、この集約では独立レビューを追加しない。旧P1の未取得差分を再構成せず、旧hash不一致も解消済みとしない。

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
