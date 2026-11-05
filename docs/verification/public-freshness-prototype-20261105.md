# 公開画面の再取得・旧情報表示のローカル試作（2026-11-05）

[操作候補](../guide/product.md#freshness-prototype) · [内部処理](../guide/architecture.md#freshness-prototype) · [E2E](../guide/e2e.md#freshness-prototype) · [検証状況](../guide/verification.md#freshness-prototype-status)

## 状態と対象

PR #128のhead `bcc4c0cdd888ecef55e65279d4e4dbd370b0d315` を基点とした、独立branch `test/public-freshness-prototype-20261105` のDraft公開候補です。PR #128やmainにこの試作を反映していません。製品方針・表示文言・本番採用の承認とは分けます。既存PR用worktree、元の食品E2E候補、canonicalの別作業を保護します。

公開先は[Draft PR #129](https://github.com/Kaito-Iwase/ClearAllergy/pull/129)です。baseは未mergeの#128のbranch `test/practical-e2e-main-20261105` とし、そのE2E基盤を重複差分にしません。自動CI／依存監査のpull_request対象へこのbaseだけを追加し、headのVercel Git配備をexact falseにします。main/developの従来trigger・既存guard・監査基準は維持します。[公開準備の敵対的セルフレビュー](public-freshness-pr-review-20261105.md)に依存関係と未確認を記録します。

対象は店舗一覧・店舗詳細・メニュー詳細です。初期SSRと手動／復帰時の再取得に同じserver loaderを使い、食品本文・店舗情報・マスタ・店舗内補足を完全なsnapshotとしてReactへ渡します。3 loaderのRepeatableRead、公開条件、同一transaction内の補足取得を維持します。価格や本体更新日時だけで別メニュー由来の補足を検出する方式ではありません。

## 実装したもの

| 対象 | 実装と境界 |
| --- | --- |
| 初期表示・再取得 | 3 server pageから共有loaderへ分離。server pageと初期SSRは保持し、snapshot依存の本文だけclient viewが所有。静的な共通ヘッダー等はそのまま |
| JSON入口 | `GET /api/public-snapshot`。kind・ID・UUID相関IDを検証し、任意URL入力・重複queryを拒否。公開項目のwhitelistを完全schemaで検証。owner／食品版／確認履歴／照合用master DB IDは返さない |
| 結果の意味 | 一覧の正常0件はlist結果。詳細の非公開・削除・非稼働・公開条件不成立は同じtyped404のnot-found。存在oracleを増やす照会は追加しない。取得不能は503であり、正常な対象なしやFREEではない |
| 完全snapshot | master・各状態・別メニュー補足・原材料・注意書き・表示対象の店舗／メニュー情報を同時に置換。API／client fetchはno-store。現行の公開メニューAPIの契約は変更しない |
| 取得の契機 | 手動、visibleへの復帰、focus、persisted pageshow、SPA popstate。初期SSRと重複する定期取得は追加しない。短い重複イベントは一描画frameへ集約。進行中の復帰は後続一要求へまとめる |
| 順序と取消 | 要求ID・resource key・要求世代を照合。中止・unmount後の結果や旧要求の後着を捨てる。clientの中止はserver側SQL処理の停止を保証しない。遅い要求は画面の「取得を中止」から止め、手動再取得できる。安全上の期限や根拠のない秒数は設定しない |
| 適用の確認 | 応答200・関数呼出・transition終了だけで成功にしない。list／menuの実内容、shopのmenu部分と検索要約の両方がDOM commitしたeffectを待つ。Suspense fallbackやrender失敗では確認済みにしない |
| 状態表示 | 通常・取得中・反映中・失敗・中止を表示。時刻は「取得開始（UTC）」であり、食品確認日時やその時点の最新性保証にしない |

順序逆転は、abortを無視して旧promiseが遅れて解決するtransportをunitで与え、新しい結果や対象なしを上書きできないことを検査します。実ブラウザーの通信失敗は指定APIの503を明示注入します。実DB障害の再現はAPI unitの取得不能条件と分けています。

## 表示方針の比較候補

既定の参照候補は、旧snapshot全体を「以前取得した登録・現在は未再確認」と明示して保持します。CONTAINS・MAY_CONTAIN・STORE_HANDLEDの注意を残し、肯定的なFREE／条件一致要約は未再確認案内へ置換します。原状態を書き換えません。長い画面でも文脈を失わないよう、詳細の各品目行にも以前の登録であることを表示します。

比較用の遮蔽候補は旧内容をhiddenにしてキーボード・読み上げ対象から外し、既知の含有・混入注意も見えなくなると明示します。非表示化前に内容内のfocusを取得状態へ戻し、正常な対象なしでは旧内容を表示treeから除去して結果見出しへfocusします。取得済みデータ・RSC payload・印刷・スクリーンショット・ブラウザ履歴の回収を意味しません。

参照は既知の注意と閲覧可能性を維持できますが、旧FREEの誤読リスクが残ります。遮蔽は旧食品への接触を減らす一方、注意や店舗情報も失います。「安全側だから保持／隠す」と一意に断定しません。既存の検索・除外設定は維持します。既定候補の採用、文言・配置・理解度は製品判断・利用者確認を残します。正常な対象なしでは本文内のフォームも終了します。保存済み端末設定は保持しますが、その時点の未適用設定案の継続方法は未確定です。

## 実行結果と証拠

実行環境はWindows、Node22.15.1、Next16.4.1、既存Prisma Client/engine6.19.3、PostgreSQL17.11、Playwright1.61.0と既存Chromium1228です。同じlock/schemaの生成物を再利用し、依存・Prisma・browserの取得は行いません。Clerk境界だけを試験コピーで模擬し、実Next・実保存API・所有権・架空DB・ブラウザーを使います。実Clerk認証・外部サービス書込の検証ではありません。

最初の実行 `ci-c0b96314-e59d-4110-9450-70c155d44d6e` は17 PASS・native BFCache1 SKIPでした。既存11件を維持し、三画面の手動取得、旧FREE要約抑制と注意保持、遮蔽・回復、実STOPの三画面反映、他メニュー停止による補足変更、合成復帰イベント集約、実SPA履歴を通過しました。監査58行を限定削除し、既存4modelのfingerprintと外側の前後件数 `1|1|3|1` を維持。所有Next／一時領域と、外側の所有DBを停止・削除しました。

最終差分のrun `ci-9f927481-4e8c-4143-9ef0-5d95ca19d2cf` も17 PASS・native BFCache1 SKIPでした。入力保持の検査を必須にし、各品目の以前登録ラベル、中止・再取得、遮蔽前のfocus移動と正常な対象なしの見出しfocusも確認しています。監査58行削除・既存fingerprint・外側件数保持・所有Next/Temp/DB終了削除を再確認しました。

| 検査 | 結果・限界 |
| --- | --- |
| 新protocol／APIと既存caller | focused22件成功。応答相関、正常404／失敗の分離、後着、中止、unmount、適用失敗、補足更新、公開条件・whitelistを検査 |
| 広いunit/API | 316 PASS、fail0。所有TEMP/TMP指定と、既知EPERMの指定1件除外。除外なしの全unit／今回Linux CI成功ではない |
| 既存caller負例 | `node scripts/check-public-caller-mutations.mjs`：baseline0、10箇所すべてROOT_CLIENT_READ＋対象test fail1で検出、復元0。検出条件は弱めていない |
| lint・型検査 | 初回と最終の全体lint・型検査が成功 |
| build | Clerk境界差替えcopy buildと、aliasなしの通常Next設定buildが成功。後者は `node node_modules/next/dist/bin/next build`、38.234秒。生成済みClient再利用でnpm prebuild生成は省略し、通常npm全pipeline成功と区別 |
| 実DB制約 | 専用新規PostgreSQLの既存回帰37グループ成功。実アプリ＋DBと、unitの代用品を区別 |
| 既存部品のbrowser回帰 | `node scripts/browser-runner.mjs allergens` の17グループ成功（模擬API・実部品）。icon-fontは対応stylesheet/font cache不足で未確認。許可外フォントを取得していない |
| UI証拠 | 通常・取得中・失敗mobile・遮蔽mobile・SPA後の画像。匿名の架空公開画面だけを保存し、認証値・ログイン・traceは保存しない |
| 独立レビュー | 履歴を共有しない読取専用reviewで初期コードの確定P1/P2なし。最終ソースhash・実行ログ・画像・文書の照合も完了し、確定P1/P2・重大不一致なし |

ローカル補助ログはworkspaceの `public-freshness-prototype-20261105/` と `test-results/ci-<run>/` に保存します。初回からの修正・実行を混同せず、ローカル測定時の未commit差分とsource manifestに結び付けます。Draft公開準備ではこの測定対象の製品コード・specを維持し、公開用のCI対象・branch配備guard・状態文書を追加します。測定後の文書・設定差分まで既測定と扱いません。

[Next.jsのrefresh資料](https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/04-functions/use-router.mdx)は16.2.9、実依存は16.4.1です。`router.refresh()`呼出を成功証拠にしない設計の参考にし、対象版の実ブラウザ結果とは区別します。

## BFCacheと履歴の判定

合成focus／visibility／persisted pageshowの同時発火は一要求に集約し、停止後の対象なしを反映しました。これはhandler統合の確認であり、OSの実background復帰の証拠ではありません。

実Next Link遷移から戻るSPA履歴は同一documentのpopstate1回を観測し、停止した旧食品を表示し続けないことを確認しました。native BFCacheは別にdocument移動・戻るを実行し、`pageshow.persisted=false`でした。ChromeのnotRestoredReasonsは `masked`、`response-cache-control-no-store`、`response-cache-control-no-store-with-js-network-request` です。no-storeを取り除いて成功にせず、native復元は未実証としてSKIPします。この環境の結果を全ブラウザーで復元されない保証にもしません。

freshness projectだけ、Playwright既定の `--disable-back-forward-cache` がある場合にその一引数を外して復元を試みます。ブラウザーのsandbox等を変更する設定ではありません。資料はPlaywright1.61.1、実依存は1.61.0で、実行結果を分けます。[launchOptions／ignoreDefaultArgs](https://github.com/microsoft/playwright/blob/v1.61.1/docs/src/test-api/class-testoptions.md)

<a id="linux-ci-7feb5c1"></a>
## 公開後のLinux CI（測定対象head 7feb5c1）

公開head `7feb5c136e52dd29afa54a7c9387c35ab910b7d4` の[CI 42129411078](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/42129411078)は全4job成功しました。実checkoutは#128へのPR merge候補 `b7bfa54abb2f73aecd2181af8c853ad2e6cdcc85` です。mainへのmergeではありません。単体317/317・skip0、lint・型検査・Prisma生成/validate・実DB・通常のnpm build（prebuildを含む）・既存の公開回帰が成功しました。

Linuxの実Next・使い捨てDB・既存CIブラウザとClerk境界模擬のrun `ci-b6e6e2bb-68ba-4ae0-890e-2af89dd8f1a7` は17 PASS・native BFCache1 SKIP、54.2秒でした。既存11件の本文は保持しています。nativeは実復元されずpersisted=falseで、Windowsと同じ未実証の扱いです。監査58行除去、既存4model fingerprint保持、共有service DB保持、所有process group停止・一時領域削除をlifecycleで確認し、job終了時のcontainer停止も成功しました。

[artifact 13462607696](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/42129411078/artifacts/13462607696)の6,574,608 bytesとSHA256 `f1131d321e1da749eb895c5b5a29d405bf012479a55d60380bdda839937f0760`をGitHub digestへ照合し、spec log・lifecycleを読みました。[依存監査 42129411082](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/42129411082)も既存high閾値で成功しましたが、minimatch起点の開発依存moderate8件が報告されており、脆弱性ゼロではありません。依存版は変更していません。

2026-11-05 23:34:32 UTCのVercel読み取りでは、`clear-allergy`と`clear-allergy-e2e`の本branch配備は両方0件でした。Productionは従前と同じmain `51adcb23945b80bb34b110d2d0f263d29629a821`、Readyで、IDはそれぞれ `dpl_BwzZHdde7UuMnctfrU4CtAnPW2oS` と `dpl_GcKXLERckVxBp1VHvySdf9oxnM6B` です。観測範囲の事実で、mainや手動配備まで抑止する保証ではありません。

この記録の追補は文書だけで、測定済みの製品コード・テスト・CI設定は変更しません。後続headのChecksはPRの対象SHAと照合し、上記runを別headで実行したことにはしません。

## 採用判断・未確認

- 表示保持と遮蔽、文言、対象範囲、取得中の操作、利用者理解は候補のままです。友人テスト・専門レビューは未実施。
- visibleのままの継続閲覧、JS未実行、停止されたプロセス、オフライン、復帰イベント前の旧画面paint、他端末・印刷等への配送は保証しません。
- polling・push・数値TTL・最大許容遅延は実装していません。一要求は同じDB snapshot内で複数SQLを伴い得ます。要求数をDB負荷と同一視せず、本番の閲覧数・接続保持・遅延分布・負荷上限は未測定です。
- HTML404やログインHTMLだけでは正常な対象なしとしません。取得結果のDOM commitは、paint完了・利用者の認知・食品の正しさの証拠ではありません。
- native BFCache、全ブラウザー／OSの復帰、実Clerk／Preview／Blob、実サービス・本番は未確認です。Linux CIの確認範囲は上の特定head・runに限定します。
- 新しい公開snapshot API・本文client view化・候補文言の製品採用は別判断です。後続のユーザー指示でDraft PR公開とCI確認のみ承認されました。merge／本番操作／配備は行いません。

既存構成図は初期表示と主要処理の概要で、公開APIを省略対象として明記しています。初期SSR→同じsnapshot→共通公開判定の経路を照合し、図の既存説明を維持します。再取得候補は[内部処理](../guide/architecture.md#freshness-prototype)で別に説明します。schema・migration・依存版・認証規則・共通公開条件は変更しておらず、rules／AGENTSの本文変更は不要です。
