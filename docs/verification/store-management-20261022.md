# 店舗管理・公開メニュー表示の変更と検証

2026-10-22 UTC。[前日の二段階公開・明示解除](two-step-publication-20261021.md)に続く、承認済みの店舗管理改善の記録。ローカル検証と本番で観測した事実を分ける。本番へのアプリ反映・DB変更・実メニューの公開停止は行っていない。

## 対象版と変更理由

実装ブランチは `feat/two-step-menu-publication-20261021`、比較開始点は `d1e155b30d6cc2034ac2a007a59623e1b213303a`。確認時の最新 `origin/main` は `b57cc5139180e9951e856a80d84f12ab6474c5e7`（PR #91）。両者の差は `.node-version`、`Dockerfile`、`docs/guide/development.md` のNode更新で、店舗画面の実装は同じだった。

店舗編集でプレビュー・QR・ヒントを折りたたみにした変更は `1dbc5fc9405622c348c02987fab88db5df7f35df`（2026-10-20 10:38:02 JST）、PR #89で取り込まれた。[当時の検証記録](store-review-20261019.md)には編集フォームを先に置き、補助欄を閉じて文書スクロールを使う意図がある。操作対象を見つけるための追加操作と発見しにくさが代償になる。ユーザー調査で効果を確認したという記録ではない。

今回はユーザーが改善画像の方向を承認したため、公開停止を一覧から直接操作できるようにし、繰り返す説明を短くする。プレビューとQRも名前のある直接ボタンにする。画像の装飾や架空写真を製品へ転用していない。店舗全体の一括停止は含めない。

## 実装と安全上の境界

| 対象 | 変更と保持した条件 |
| --- | --- |
| 管理メニュー一覧 | 公開中の品目の編集隣に「公開停止」を追加し、削除と分離。確認状態は短い表示にし、履歴は編集画面に保持する |
| 停止API | 既存の所有権・Origin・readonly制御を通す。古いフォームや公開条件の充足を要求せず、停止したID・公開状態・版を返す。未設定があっても停止可能 |
| 停止の応答 | 応答成功前は公開中の表示を維持。二重操作を抑止し、通信断・拒否・不正応答では成功と断定しない。保存成功と公開cache更新未確認を分ける |
| 停止後の競合 | 一覧が持つ古い内容の削除用版を、停止応答の新しい版へ差し替えない。別タブの変更を見ていない削除は409を維持する |
| 店舗編集 | プレビュー・QRを直接ボタンからnative dialogで開き、Escape・閉じるボタンとフォーカス復帰を確認。未保存プレビューである旨を表示。入力のヒント・画像調整は必要時の補助欄として残す |
| 管理画面の背景 | `AdminDashboardShell`のmarkerと`body:has(...)`で管理画面のcanvas背景を全高に連続させる。元の白余白の原因確定とは区別する |
| 公開メニュー | 各カードの品目別「含む／含む可能性あり・要確認」を残し、重複する上段badgeを除く。確認対象とそれ以外、特定原材料9／その他20、UNKNOWN、MAY_CONTAINの意味は維持する |
| 店舗共通の補足 | 他の公開メニューのCONTAINS登録の和集合を店舗共通の一か所に表示。検索・利用者の除外でカードが隠れても、この範囲を縮めない。個々の料理の原材料・実厨房の取扱い・交差接触を示す証拠と区別する |

再公開は、前日の「非公開で保存→保存済み最新食品版に別の公開操作」の条件を通る。UNKNOWNや未解決を解除する操作ではない。旧未解決は内容を表示して明示解除し、別に公開する。食品変更時の自動非公開と古い食品版・解除の流用拒否を維持し、旧記録を削除しない。

主な変更先は `features/admin/menus/components/MenuListPageClient.tsx`、`features/admin/menus/server/adminMenuRoute.ts`、`features/admin/shop/components/ShopEditClient.tsx`、`features/public/shops/components/ShopMenuListClient.tsx`、`components/layout/AdminDashboardShell.tsx`、`app/globals.css`。本日の表示改善による追加migrationはない。前日の新規migration2本は別途アプリとDBの切替準備を要し、本番には適用していない。

## 本番の注意書きと表示不具合の観測

ユーザーが示した画面は本番と申告された。既存Braveのアドレス欄では `https://clear-allergy.vercel.app/admin/menus` と、公開店舗 `/shops/cmu9wuoju0013wnv8cneuuz4h` を確認した。ただし管理タブは読込中の表示で、安定した画面操作やそのタブの実行SHAは未確認。ブラウザ設定・cookie・認証を変更していない。

GitHubのProduction deployment `7232176257` は2026-10-21 17:03:21 UTC作成、SHA `b57cc5139180e9951e856a80d84f12ab6474c5e7`、successだった。これは配備記録であり、既存タブのcache版まで証明しない。

公開店舗への読み取り専用HTTP GETは200で、店舗名は `[デモ店舗]Atelier Minori（アトリエ ミノリ）`。該当する「バナナとりんごのクレープ」（ID `cmu9wupea001bwnv8cy6lowsm`）のレスポンスには、次が `precaution` として含まれていた。

> UI検証用の架空データです。実際の食事判断には使用できません。要確認の表示対象：オレンジ・キウイフルーツ。

表示元は公開メニューの保存済み注意書きで、UI fixtureの固定文字列を製品bundleから挿入したものではない。実サーバーの読取コードとレスポンスの項目を照合した。現行seed・scripts・検索したGit履歴に同一文言は見つからなかった。既存の2026-10-10デモ復旧計画にこのメニューIDが含まれることも確認したが、最初の投入がseedか手入力かは未特定。本番DBへの直接接続・変更はしていない。

注意書き全文と既存の共通プロトタイプ警告を保持する。データ訂正はアプリPRとは別の対応であり、警告だけ消して実食品に見せない。実データとして運用する場合の内容確認・修正とその権限は、今回の実装承認から広げない。

元の画像は親タスクの確認では1900×693pxの切り抜きで、折りたたみカードの下から白余白が大きく続く。元画像のLibrary取得はWindowsヘルパーの`os.setxattr`非対応で完了せず、ローカルで原本の画素を照合できなかった。記述された症状と、こちらが実際に再現した状態は区別する。

変更前の実コンポーネント・ビルド済みCSSの隔離fixtureで、幅1900/1536/768/390px、初期・末尾・プレビュー/QR/ヒントの開閉の計32状態を確認したが、白余白や開閉不良は再現しなかった。既存`min-h-dvh`・`h-dvh`と背景CSSも生成されていた。元画像の正確なルート、ブラウザ寸法・倍率、表示時の版と状態を揃えた再確認が残る。背景の連続性は今回のfixtureで検証したが、元症状の根因を直したという結論にはしない。

## ローカル検証

Windows、Node22.15.1、npm10.9.2、Next16.3.8、React19.2.7、TypeScript6.0.3、Prisma6.19.3、隔離Chromium。現行main/CIのNode22.23.4・npm11.18.0との完全一致は未検証。package/lockの変更なし。DBは前日所有したDocker PostgreSQL17の架空データだけを使い、CI用の接続先検査を通した。認証・cache等の代用品を使った範囲は区別する。

| 検証 | 結果 | 証拠・限界 |
| --- | --- | --- |
| 全単体/APIモック | 227/227 PASS | `unit-host.log`。実Clerk・配備cacheではない |
| 最終build | PASS | `build-final.log`。`npm.cmd run build -- --webpack`、Prisma生成・型検査・静的生成を完了 |
| build後の型検査・lint | PASS、lint警告0 | `typecheck-lint.log`。`npm.cmd run typecheck`→`npm.cmd run lint` |
| 管理・公開の実DB/API回帰 | 37 PASS項目 | `database-final.log`。`node --import tsx scripts/check-ci-database.ts`。実PGの所有行更新、UNKNOWN・食品変更・履歴保全、停止応答と公開GET404等。Clerk・cacheは代用品 |
| 店舗/メニュー画面 | 8/8グループ PASS | `store-ui-final/store-review-browser-result.json`。320/390/768/1536/1900px、dialogとキーボード、背景・footer、QR URL/PDF1ページ、二段階公開・明示解除・409 |
| 品目/一覧/編集画面 | 14グループ PASS | `allergen-ui-final.log`。対象scope、共通補足、全文注意書き、UNKNOWN/MAY、停止の保留/二重押下/通信断/拒否/不正応答/cache警告、停止後の古い版削除409、readonly停止不可 |
| 材料変更演習 | 14/14グループ PASS | `trial-final/trial-check.json`。実コンポーネントとメモリ保存。実食品・参加者研究・DBの並行制御の証明ではない |
| QR画像の目視 | PASS | `store-ui-final/shop-qr-print-media.png`にタイトル・QR・URLを確認。実プリンター・カメラによる読取は未確認 |

上表のログ・画像は作業フォルダ`ca-store-layout-20261022`に保持した。画面回帰は実コンポーネントと同じビルドCSSを使うが、Nextの一部機能・fetch・認証は隔離fixtureで代用する。実Clerkを通した管理ルート、Blob保存、本番のcache反映は未検証。アイコンfontのlocal cacheがない初回画面では装飾iconの描画を未確認と明記した。その後、現行`app/layout.tsx`が指定する公開CSS/fontだけをfixtureへ保存し、loopback配信で品目14グループを再実行して成功した（`allergen-ui-icons-final.log`）。一覧の画像も描画後に目視した。本番でfontを配信できることの確認とは分ける。

再実行には[開発手順](../guide/development.md#browser)の既存Playwright/Chromiumと同じworktreeのビルド済みCSSを使い、出力を作業フォルダへ指定する。コマンドは `node scripts/check-store-review-browser.mjs`、`node scripts/check-allergen-cards-browser.mjs`、`node scripts/ingredient-change-trial.mjs --check --output <作業用出力先>`。アプリや本番DBを必要とするadmin E2Eとは分ける。空DB専用の移行回帰を使用中DBへ向けない。

途中の失敗も保持した。sandbox下の全単体は一時ファイルのNTFS link/glob制約による4件失敗後、hostで全227件が成功した。初回sandbox buildはGoogle Fonts DNSと生成先の権限制約で失敗し、hostの最終buildは成功した。最終型検査をbuildと並行した試行は生成中`.next/types`の消失で失敗したため、build完了後に順番に実行して成功した。画面の初回停止待機セレクターと演習の旧長文セレクターも表示変更に合わせて修正し、各回帰全体を再実行して成功した。これらをアプリの失敗と混同しない。

## 独立レビュー・文書・残件

本日のUI変更は読取専用の独立レビューを行い、停止応答の最新版を古い内容の削除に流用する問題を修正した。停止で版6が返っても、古い一覧からの削除は版5を送って409になる画面回帰で確認し、再点検で新たな修正必須指摘なし。前日の基本変更3 roundsと明示解除のレビューを無意味に繰り返していない。

開発文書は一般的な技術説明・設計理由・判断根拠を残して用途を整理した。変更前7ファイルをリポジトリ外の私的バックアップへ保存し、技術30節・確認15項目を開発ガイドへ移した。別の読取専用レビューで本文とバックアップhashを確認し、残った個人向け話法の指摘を修正した。一般のユーザー調査の記述は保持した。公開する題名・説明は開発文書の用途整理に限り、私的原稿を転載しない。

現行の[操作ガイド](../guide/product.md)、[状態・公開条件](../guide/rules.md)、[内部処理](../guide/architecture.md)、[変更対応表](../guide/change-map.md)、[検証入口](../guide/verification.md)、[設計理由](../guide/design-decisions.md)へ反映し、索引から参照できるようにした。作業ルール自体は本日変えないためAGENTSと保守ルールには本日の追記をしない。前日のAGENTS等の変更とは区別する。

公開停止後に再読み込みした公開GETから対象を除く条件と、一覧/店舗/品目/検索のcache無効化呼出はテストしたが、既に開いているタブ・紙・画像の内容を消すものではない。実配備cache・実ブラウザによる認証操作と原画像の白余白の再現は残件。前日の新旧サーバー混在・逆migration・本番DB切替/復旧手順の未検証も引き継ぐ。これらを通過済みとして本番へ反映しない。

最終の文書照合は変更Markdown16件の相対リンク525件・アンカーと図2件のXMLがPASS、差分の空白検査もPASS。canonical checkoutの358ファイルhash・9変更・HEAD・branch・index/statusは開始時と一致した。元のmigrationとpackage/lockは不変。所有label・完全IDが一致する今回専用のテストDBを停止し、他のDBは操作していない。

commit/push/Draft PRは追加のユーザー承認に従って準備する範囲で、merge・本番適用・本番データの訂正/停止の許可には広げない。開発文書の用途整理とアプリの変更を別コミットにし、最終PR全体で参照と仕様を照合する。
