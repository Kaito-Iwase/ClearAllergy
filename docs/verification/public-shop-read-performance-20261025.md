# PR #96：公開店舗読取の重複 SELECT 削減

2026-10-25。baseは `0b6ed291b2fd853230c7efdeeb1e061815404a81`、元 PR HEAD は `72ae4f108b43f1f5aef7aab48e59eac7f86a85d3`。独立ローカルbranch `codex/pr96-main-local-20261025` の、この記録を含むcommitが候補です。最終SHA・ログ・比較script・patch・bundleはタスク成果へ保存します。#95/#101/#102とは組み合わせず、各候補を保持しています。

## 未適用差分と維持する契約

mainの店舗一覧・店舗詳細は、同じトランザクションで品目マスタ全体を読む一方、各リンクの `allergen.slug` を別SELECTでも取得します。元PRのresolverで既取得masterのIDからslugを解決し、この重複1本を削減しました。新規の速度最適化は追加していません。両ページ・resolver・既存snapshot回帰script・追加単体testは元PRと同一です。

`RepeatableRead`、`force-dynamic`、各要求の読取、公開/稼働条件、食品版、公開対応版、UNKNOWN、店舗内補足を維持。欠損リンクをFREEで補完せず、マスタにないIDは取得エラーにします。照合用IDは公開DTOから除き、対応Mapを要求間で保持しません。schema/migration・認可・食品仕様・現mainの依存/lock/vercelを変更しません。

現mainへ必要な説明だけを適用し、元PRの過去の本番測定JSONや2026-10-23の検証記録を今回の証拠として取り込んでいません。architecture・change-map・verification入口を更新。product・rules・AGENTSは契約や作業ルールを変えないため更新不要です。

## 実DB比較とRED/GREEN

既存の許可済み隔離環境を使用。Node 22.23.4、npm 11.18.0、Prisma 6.19.3、PostgreSQL 17.11。先行setupでこのタスクが作成した `codex-onboarding-clear-db` の所有label、127.0.0.1:55433、CI専用DB/roleと接続ガードを確認しました。データは架空のみ、mainの既存19migrationです。#102のUTC migrationは適用していません。

比較scriptはTypeScript ASTからbase/currentの実ページのquery引数を抽出します。許可した静的リテラルとshopIdだけを評価し、同じREAD ONLY / RepeatableRead内でbase/currentの順序を交互に切り替え、currentの実resolverでDTOを戻して全項目を比較しました。リンクだけは未指定順に依存しないようslug順に正規化し、店舗/メニュー順を維持します。SQL本文・parameter・接続秘密値は結果JSONに含めません。

- RED：適用前は一覧/詳細の各3組でSELECT 5本。4本を期待する回帰条件が失敗（exit1）。取得内容の機能障害を主張するものではありません。
- GREEN：適用後は同じ6組すべて全項目一致、SELECT 5→4。追加架空店舗を含む一覧3組・2店舗詳細各3組の9組も全一致、5→4。
- 経過時間・p95・負荷は測定していません。SELECT本数の削減を一定率の速度改善、本番HTTP遅延の解消とは扱いません。

## 今回の回帰結果

| コマンド/範囲 | 結果 |
| --- | --- |
| `npm run lint` / `npm run typecheck` | exit0 |
| `npm test` | 255成功、失敗/skip/cancelled 0。追加3testは4状態/不正値・欠損/未知ID・要求ごとの対応を検査 |
| `npm run build` | Prisma generateを含む標準Turbopack build成功 |
| `node --import tsx scripts/check-ci-database.ts` | 制約・食品版・所有対象・既存食品確認回帰が成功 |
| `node --import tsx scripts/check-publication-database.ts` | 公開・未解決解除・競合・旧記録の回帰成功 |
| `node --import tsx scripts/check-public-read-snapshot.ts` | snapshotなしの旧食品＋新FREEの反例を再現。変更後の同snapshotで旧CONTAINS維持、次の取得で停止を確認 |
| 本番buildをloopback:3102で起動したHTTP検査 | 9状態を一覧/店舗詳細/メニュー詳細/APIで確認。元からある全10テーブルの行hash不変 |
| `node --import tsx scripts/check-publication-propagation.ts` | 未解決追加・食品訂正・公開停止後の新要求と補足消失が成功 |

9状態は FREE / CONTAINS / MAY_CONTAIN / UNKNOWN / 未公開 / 食品版不一致 / 未解決事項 / リンク欠損 / 停止店舗です。最初の3状態だけを公開し、FREEは他の公開メニューのCONTAINSにより店舗内補足STORE_HANDLEDになることも確認しました。その他はAPI404、公開一覧/詳細に対象食品なし。ストリーム開始後のメニューページはHTTP200を維持してnot-found/noindexを返す場合があり、200だけで公開成功とは判定していません。

架空比較店舗と記録は保持し、HTTP確認後は今回の比較店舗だけを非稼働にしました。既存回帰には自分で作った架空行の後始末やrollbackされるTRUNCATEが含まれ、すべて同じ隔離DBだけで実施。本番/PreviewのDB・実Clerk/Blobへの接続はありません。`node scripts/browser-runner.mjs public` は、現行buildと既存架空fixtureで8群成功（390/1440px、検索・設定・共有・クライアント例外なし）。Chromiumは実行基盤の自動承認を通して起動し、外部要求を遮断しました。独立レビューはタスク成果へ記録します。

## レビュー・未確認

過去レビュー1回は引継ぎ情報で、元PRの記録にも独立レビュー実施の記載があります。最新GitHub API履歴は同タスクのGraphQL403により未取得。今回の独立批判的レビューは1回だけ実施し、結果をタスク成果へ保存します。#101/#102/#105の追加レビューは行いません。

GitHub CI、実Clerk/Blob、本番/Preview、接続poolや負荷、実測速度、他候補との組合せは未検証。既に開いた画面、戻る、オフラインへの自動反映も主張しません。環境設定・永続env変更、push/PR更新/merge/deployなし。Prisma/Fontsの通常経路での後続成功と、許可反映の主体/時刻未確認はセットアップ引継ぎに分けて保存しています。
