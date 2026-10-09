# 食品確認記録・訂正保全・公開停止の実装と検証

[検証の入口](../guide/verification.md) · [共通ルール](../guide/rules.md#publication) · [開発手順](../guide/development.md)

実装後の独立した敵対的レビューと追加修正は[レビュー記録](menu-food-review-adversarial-20261009.md)を参照してください。本書の初回結果と、その後の検証を区別します。

2026-10-09 JST。正規Windows作業先、ブランチ `improve/readable-public-ui`、開始HEAD `68cd41a88783c5c4d9d647ebc94239f54be3b434`。開始時の未コミット差分はなし。今回の変更は未コミット・未pushで、本番DBへのmigration、配備、実食品の確認は実施していない。

## 採用した範囲と理由

Pro精査の訂正上書き・食品と確認の対応・保存確定後の障害・訂正反映を優先した。食品内容の比較と記録保存を既存 `features/admin/menus` 内へ分け、危険な経路に局所テストと実DB回帰を追加した。全面的なDDD化、全EntityへのRepository、イベント基盤、全変更への二人確認、新たなテスト手法の一括導入は行っていない。

| 誤情報の経路 | 要求・今回の変更 | 実装の主な入口 | 今回の検証 |
| --- | --- | --- | --- |
| 古いFREEの全フォームが新しいCONTAINSを上書き | ID・所有店舗・期待編集版で更新／削除。競合409で入力を保持し、自動再送しない | `adminMenuRoute.ts`、`MenuEditClient.tsx`、migration | 実PUTを同時に読み込ませて200/409。新しい卵CONTAINSを古いフォーム・削除で壊さない |
| 食品変更後も以前の確認を流用 | 食品版・根拠・確認範囲・実確認日時・サーバー操作者・未解決事項・食品内容を記録。価格／構図と食品変更を分離 | `food-review.ts`、`food-review-save.ts`、`MenuFoodReviewFields.tsx` | 原材料変更・元の文字列への復帰・子レコード直接更新・マスタ名称変更で失効。価格変更は維持 |
| 未確認の食品を再公開 | 現行食品版の未解決事項なしの記録が必要。DBの確定時にもチェック | `lib/allergens.ts`、migration、公開の取得処理 | 確認済みCONTAINSは状態を保って公開可。未確認の直接公開は停止 |
| 保存済みなのに保存失敗と判断 | DB確定後のcache例外は成功DTOと `publicRefreshPending`。作成操作IDの同じ再送は同じメニューを返す | `adminMenusRoute.ts`、`adminMenuRoute.ts`、管理UI | 実DB＋cache例外注入、同一作成の再送、異なる入力の409 |
| フォーム不備が公開停止を妨げる | 自店舗に限定した専用STOP。編集版や確認欄の完成を要求しない | `/api/admin/menus/[menuId]/stop` | 状態・食品内容・記録を保存したまま公開停止。古い通常保存は競合 |
| DBでは停止したがページが古い食品を返す | 食品を載せる一覧・店舗詳細・メニュー詳細を各アクセスでDB取得 | 公開3ページと実ルート | 温めたページへ食品変更後に再アクセスし、応答と実ブラウザから停止食品が消える |
| 品目の取り違え／不確実性の消失 | マスタのslugと日本語名をコード定義と照合。UNKNOWN・MAY_CONTAIN・STORE_HANDLEDの区別を保持 | `lib/allergens.ts`、公開API／UI | 独立に指定した卵・乳の名称、誤名称の公開拒否、混在表示、補足元停止 |

食品変更後は再確認まで公開停止し、移行時の既存公開メニューも記録ができるまで停止する。この2点は利用者が明示的に選択した。旧 `updatedAt` や公開フラグから確認済み記録を作らない。

## 実行環境と証拠の区別

実Nodeは22.15.1、npmは10.9.2。repo基準のNode22.23.1／npm11.18.0と一致する環境、GitHub CIは今回未実行。ローカルのNextがlockfileの16.3.6に対して16.3.4だったため、実体と通常ディレクトリを確認し、今回のサーバーを停止して `npm.cmd ci --ignore-scripts --no-audit --no-fund` でlockfileに同期した。`package.json`・lockfileは変更していない。最終実体はNext16.3.6、Prisma／Client6.19.3。

DBは今回専用のPostgreSQL17.11コンテナ2個で、loopbackの55520／55521、tmpfs、永続volumeなし、今回のtask labelあり。CI接続ガードを通し、架空データだけを使った。1個は現行17 migrationの回帰用、1個は空DBから旧16 migrationと旧公開fixtureを作る移行用。共有DB・本番DB・実Clerk・Blobへの書込は行っていない。

終了時は今回起動した3102番のNextプロセスだけを停止した。DBも正確な名前・task label・tmpfs設定・loopback接続を確認して2個だけ停止し、AutoRemoveによる削除とtaskコンテナ0件を確認した。既存コンテナ・永続volumeを変更していない。

APIの実DB回帰は実ハンドラ・認可DB照会・transaction・監査を使うが、ClerkセッションとNext cacheはテストプロセス内の代用品。UI部品の回帰は実コンポーネントとビルド済みCSSを使うが、Next navigationと保存APIの応答を置き換える。公開UI／反映検証はloopbackの本番ビルドと実DB・実Chromiumを使い、ブラウザの外部通信を遮断した。

## 実際の結果

| コマンド／確認 | 結果 |
| --- | --- |
| `npx.cmd prisma validate`、`npx.cmd prisma generate` | PASS、6.19.3 |
| `npm.cmd test` | PASS、185/185件、失敗・skipなし |
| `npm.cmd run lint` | PASS、終了コード0 |
| `npm.cmd run typecheck` | PASS、終了コード0 |
| `npm.cmd run build` | PASS、Next16.3.6。公開3ルートは動的生成 |
| `node --import tsx scripts/check-ci-database.ts` | PASS、31グループ。DB制約・競合・巻戻しと既存の招待回帰を含む |
| `node --import tsx scripts/check-owned-menu-database.ts` | PASS、5グループ。read後の移転／削除で404、無関係なデータ不変、版付きの正常PUT／DELETE |
| `node --import tsx scripts/check-food-review-migration.ts` | PASS、旧公開メニューが記録なしで停止。品目状態は維持。再適用でpendingなし |
| `node scripts/browser-runner.mjs allergens` | PASS、8グループ。320／390／768／1440pxの公開カード、新規／編集の確認欄・必須項目・履歴・キーボード・競合入力保持・保存済み表示。保存通信断、削除通信断／不明JSONでも結果確認を促し、入力／一覧行を保持 |
| `node --import tsx scripts/check-publication-propagation.ts` | PASS、温めたページ／APIの再取得と390px実ブラウザ。STOP後の食品情報を返さず、店舗一覧から全停止店舗が消える |
| `node scripts/browser-runner.mjs ui` | PASS、11グループ。320／390／768／1024／1440px、公開各画面、個人設定・除外・FREEと補足、キーボード・404からの復帰 |
| `node scripts/browser-runner.mjs public` | PASS、8グループ。既存CIと同じ公開回帰。設定の複数追加／取消・別タブ同期・保存失敗時の入力保持・検索／除外の解除・共有、client例外なし |

食品内容の比較の局所テストは、実装前に追加してmodule未実装で失敗し、実装後に成功した。全変更がTDDで進んだと評価するものではない。初回検証時点はself reviewのみ。その後に実装履歴を渡さない読取専用reviewer 2名による精査を実施した。結果は上記レビュー記録に分けている。Proによる再精査は実施していない。

検証中の失敗とその扱い：

- 旧静的ページでは食品変更後のAPIが404でも、温めた詳細がHTTP 200・cache HITで古い食品を返した。店舗詳細にも停止食品が残り、全停止店舗も一覧に残った。動的取得へ変更して再検証した。
- 動的取得後は停止食品が消えたが、「ページは必ずHTTP 404」という検証の期待が失敗した。NextのstreamingではHTTP 200のままnot-found画面とnoindexを返す。公式資料と実応答を照合し、食品情報の不在・not-found・noindex・実画面を検証対象にした。公開メニューAPIは404を確認した。
- 公開UIの初回は404回復時の内部識別が `data-dgst` から `$RX` に変わり失敗。初回ログを保持し、両形式とnoindexを照合するよう検査を更新した。通常画面のclient例外は許容していない。最終11グループは成功した。

ローカル成果物はこのチャットの `food-review-tests.log`、`food-review-build.log`、`food-review-database.log`、`food-review-owned-database.log`、`food-review-migration.log`、`food-review-browser.log`、`food-review-public-ui.log`、`food-review-public.log`、`food-review-propagation.log` と画面画像、`propagation-static/propagation.json`、`propagation-dynamic/propagation.json`。失敗ログと最終成功を区別する。これらはrepo外にあり、新規cloneに同梱される資料ではない。

## 文書と確認のみの範囲

README、AGENTS、共通ルール、操作仕様、内部処理、変更対応表、開発手順、検証入口と構成図を同じ作業で更新した。構成図のSVGに埋め込んだXMLとdraw.io原本を照合し、SVGの描画で変更ラベルも目視した。draw.ioアプリでの編集往復は未確認。

最終文書照合は11文書の相対リンク203件・コードファイル参照313件を確認し、欠損なし。構成図の埋込XMLは改行とXML宣言を正規化して原本と一致した。外部リンクの全到達性やdraw.ioアプリの表示を検査したものではない。

公開店舗詳細の「0件表示あり」という旧説明は、変更前ソースにも存在するnot-found処理と不一致だったため訂正した。0件画面へ製品仕様を変更したものではない。過去の監査・提案・日付付き結果は履歴として残す。認証基盤、画像アップロード、検索条件、公開URL、外部設定、依存バージョン、CI定義は変更せず、これらの変更手順文書を広げていない。

## 残る限界と未確認

- **実食品の事実と理解はUNVERIFIED**。根拠参照・識別・資料版・確認範囲は入力者の申告を固定する。資料取得・添付の改変防止・全材料の自動照合・未申告の仕入れ／工程変更検知はない。店舗の実物と資料の照合、担当者手順、専門家の内容レビューと利用者理解の確認が別途必要。
- **既に開いた画面・戻る／オフライン・配備cache／負荷はUNVERIFIED**。新しいHTTPアクセスでは確認したが、自動通知や再取得を実装していない。動的取得でDB読取が増える。Vercel環境と実負荷は別に確認する。
- 補足は他の公開可能メニューだけから導出する既存の意味を維持した。補足元の停止でSTORE_HANDLEDが消えることを再現した。補足の不在から厨房内の不在を推定できず、店舗内情報の独立モデルは未導入。
- 記録のUPDATEは禁止するが、メニュー／店舗削除でcascadeする。永久保存の監査・保持期限の運用ではない。直近5記録をUI／管理GETに返し、公開レスポンスへ根拠や操作者を返さない。
- 作成操作IDはメニューが存在する間だけ重複を抑止し、旧クライアントのIDなし作成、メニュー削除後の再作成、意味が同じでもJSONの品目順等が違う入力まで統合しない。削除応答を失った後の再送は存在しなければ404で、永久の操作履歴はない。
- 実Clerkログイン・Blob・店舗の登録全工程・本番migration／配備・GitHub CIは未実施。独立reviewは後続のレビュー記録に記載する。権限のないAPI操作は自動テストで確認したが、実セッションのブラウザ検証とは分ける。
- 旧分類別要約関数の空入力／混在状態の問題は今回変更していない。現在の `app`／`features`／`components` に呼出しは見つからず、テストとマスタ確認スクリプトの利用のみ。将来の誤利用防止は別課題で、修正済みとは扱わない。

ソフトウェア実装と上記ローカル検証は完了しても、食品の正確性や本番での運用準備が完了したことにはならない。
