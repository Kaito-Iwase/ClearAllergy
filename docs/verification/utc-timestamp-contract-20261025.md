# PR #102：現 main への UTC 日時修正のローカル適用

2026-10-25。基点は `0b6ed291b2fd853230c7efdeeb1e061815404a81`、読み取った PR HEAD は `794961b6cbfaf0ae76c84e081fd2cda0eae247b7`。独立ローカル branch は `codex/pr102-main-local-20261025`。この記録を含む commit が候補で、最終 SHA・patch・bundle・生ログはタスクの引継ぎ成果に保存します。#101 の候補は別 branch に保持し、この変更には含めません。

## 変更と不変条件

- 新 migration の 10 default と 8 関数の日時式、Prisma default、招待受諾の期限比較、pistachio 運用 writer を明示 UTC に統一。これらの実装ファイルは元 PR と同一です。
- 新しい検証スクリプトは元 PR を基に、接続 DB/role/既定 TimeZone の確認、米国時間の旧挙動再現、全 10 テーブルに行が存在する状態での移行前後比較を補強しました。
- 既存 19 migration、列型・精度、制約、トリガー、インデックス、関数の引数・ロック・食品版・公開条件・所有権は変更しません。過去値の一括補正はありません。
- 現 main の依存、lockfile、`vercel.json`、配備抑止文書、`AGENTS.md` を維持。元 PR の配備設定・過去検証文書は取り込みません。

日時の意味は [共通ルール](../guide/rules.md#timestamps)、運用と復旧条件は [開発手順](../guide/development.md#utc-timestamps)へ反映しました。対応表と検証入口も更新。画面・APIの形・配備構成・作業ルールは変わらないため、product・architecture・README・AGENTS は更新不要です。

## 隔離条件と実行結果

既存のクラウド隔離環境で Node 22.23.4 / npm 11.18.0 / Prisma 6.19.3 / PostgreSQL 17.11 を使用。キャッシュ済み `postgres:17-bookworm` から今回専用の 3 コンテナを作成し、127.0.0.1 の 55434 / 55435 / 55436 のみへ公開しました。作成ラベル・port・DB名・role・空のpublic schemaを照合してから、既存CIガードを通しました。DB/roleは `clearallergy_ci`、全データは架空です。接続指定は検証プロセス内だけで、クラウド環境設定や `.env` は編集していません。

| 検証 | 今回の結果 |
| --- | --- |
| `node --import tsx scripts/check-utc-timestamp-migration.ts` | 既定 TimeZone が UTC / Asia/Tokyo / America/Los_Angeles の別々の空 DB で各1回成功 |
| 旧 migration の反例 | 各 DB で接続内 TimeZone 3種を検査。旧イベント時刻は UTC 0時間、東京 +9時間、米国 −7時間（実行日のDST）のずれを再現 |
| 新 migration と再 deploy | 全10テーブルに既存行を置き、全列のJSON比較で日時・食品履歴・解除・公開状態が完全不変。再 deploy は変更なし |
| 新規作成・更新 | 3接続設定で実時刻、同一transactionのISO Z、指定Dateの不変、偽装イベント時刻の上書き、未来5分境界（299秒許容・301秒拒否）、公開停止時のupdatedAt/監査を確認 |
| 招待・運用writer | 実招待受諾関数で未来期限を受諾、期限切れを拒否/expired化。実backfillを各既定TimeZoneで実行し、UTC日時・既存リンク不変・UNKNOWN・自動公開なしを確認。実Clerk呼出なし |
| DB定義の比較 | mainの19 migration適用済み隔離DBと候補3DBのcatalogを比較。10 default変更、8関数がUTC式以外完全一致。全列の型・nullability・順番、他default、制約・index・trigger・関数属性も一致 |
| 既存DB回帰 | 下記5本 × 3既定TimeZone = 15実行すべて exit 0。移行回帰後に各架空DBへ現行29品目masterを準備して実施 |
| Prisma | `node node_modules/prisma/build/index.js validate` / `generate` 成功 |
| 通常検証 | `npm run lint` / `npm run typecheck` / `npm run build` 成功。`npm test` は252成功、失敗・skip・cancelled 0 |

既存 DB 回帰のコマンドは、各使い捨て接続先に対する `node --import tsx scripts/<name>.ts` です。

- `check-ci-database`：食品版、公開停止、UNKNOWN、制約、既存食品確認回帰を含む。
- `check-publication-database`：別公開、未解決解除、旧記録不変、競合。
- `check-public-read-snapshot`：実Prisma接続の読取一貫性と旧反例。
- `check-shop-database`：訂正待ち、競合、店舗条件、保存後キャッシュ失敗。
- `check-owned-menu-database`：所有者変更・店舗停止との同時操作、他店舗不変。

新規 migration 回帰は架空データを残します。既存回帰にはその回帰で作った架空行の後始末やrollbackされるTRUNCATEがあり、接続先はすべて今回専用DBです。実行後はコンテナを停止して保持し、データ削除はしません。再現時は新しい空の隔離DBを使い、既存DBをリセットしません。

## レビューと未確認

引継ぎでは #102 の独立レビューは2回実施済みです。元 PR の記録には独立レビューと追補対象の記載がありますが、今回の GitHub GraphQL 403 により最新レビュー履歴は取得できず、過去2回を独自に確認済みとはしません。今回使えるのは最後の1回のみで、結果はタスクの引継ぎ成果に記録します。#101 / #105 の追加レビューは行いません。

GitHub CI、本番/Preview適用、本番データの時刻の正否、実Clerk/Blob、実運用規模のDDL待ち・負荷・新旧アプリ混在は未検証です。UI変更がないため今回の新規ブラウザ検証は省略し、日時formatterの既存単体とDB/招待の実処理で確認しました。実ログインは完了条件に含めません。Prisma/Fontsの初期ネットワーク拒否と後続成功の経緯はセットアップ・#101引継ぎに保持し、今回も正規通信/既存キャッシュを使い、設定変更・代替経路への切替はしていません。

本番適用前には本人が対象 SHA、既存 migration 履歴、バックアップ保持・復元先・復元権限、復旧訓練、DDLロックの許容時間、全writerのUTC互換性を確認する必要があります。アプリ切戻しではDB定義は戻りません。過去値は正誤を問わずそのまま残り、誤値の調査/補正・別forward migrationでの切戻しは別作業です。本記録は push / merge / deploy / 本番書込みの承認ではありません。
