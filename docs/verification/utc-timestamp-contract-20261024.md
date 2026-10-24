# UTC 日時契約のローカル検証（2026-10-24）

基準は `27a119672b7c0c27e743e152749c81a3176dae8c`、専用 branch は `fix/utc-db-timestamps-20261024`。内部 UTC・表示 JST、新しい migration と隔離 DB 回帰までの承認に基づく未 commit の変更です。既存 HTML エラー修正とは別 worktree です。

## 問題と修正

既存 `TIMESTAMP(3)` に `clock_timestamp()` 等の timestamptz を代入するとセッション時差が保存値へ入り、Prisma が UTC の Date として返す値がずれます。旧 migration の fresh DB で UTC は正常、Asia/Tokyo では `recordedAt`・`resolvedAt`・`confirmedAt` の全てが実時刻より 9 時間先になることをアサーションで再現しました。

新 migration `20261024000000_utc_timestamp_contract` は 10 default と 8 関数の日時式を明示 UTC に変換します。列型・精度・既存行・公開条件・ロック・履歴制約を維持します。Prisma default、招待の期限比較、運用 backfill の新規リンク日時も同じ契約へ合わせました。表示 formatter は既存の `Asia/Tokyo` を維持し、時差補正を UI へ追加しません。

## 成功した検証

- Prisma Client generate・validate、lint、型確認、単体テスト **249/249**（失敗・skip・cancelled 0）。
- Next 16.3.8 の本番 build：webpack と既定 Turbopack の両方が成功。
- 新規 migration 回帰：空 DB → 旧 migration → UTC/JST 反例 → 新 migration → 再適用。全 10 アプリテーブルの既存行を JSON 比較し、日時・旧証拠・解除・公開状態を含め完全不変。全 20 日時列の型/精度を維持。
- UTC/JST/America/Los_Angeles で、同一トランザクションの default と同一入力 Date が同じ ISO Z を返す。3 種類のイベントが DB 実時刻を保存し、2099 年の偽入力を上書き。checkedAt の未来 5 分の前後を許可/拒否。
- 停止処理の updatedAt/監査日時、実招待受諾関数の未来期限の受諾と期限切れの拒否を 3 タイムゾーンで確認。実 Clerk は呼ばない。
- JST を既定にした fresh DB で実 backfill を起動し、createdAt/updatedAt の UTC、既存リンク不変、新規 UNKNOWN、非公開維持を確認。
- UTC/JST それぞれ別 fresh DB で `check-ci-database.ts`、`check-public-read-snapshot.ts`、`check-publication-database.ts`、`check-shop-database.ts`、`check-owned-menu-database.ts` が成功。食品版・公開制約・UNKNOWN/CONTAINS/MAY_CONTAIN・旧証拠・ロールバック・所有店舗条件・同時更新・訂正ロック待ち・実読取スナップショットを既存回帰で確認。
- 別々の空 DB で旧公開移行 `check-publication-migration.ts` と旧食品確認移行 `check-food-review-migration.ts` が成功。
- 読取専用の独立レビューで、8 関数を旧定義と機械照合し、日時式以外の本体・引数・ロック・条件が完全一致。具体的な修正指摘なし。最終回帰追加分は追補レビュー対象。

## 環境と証跡

KaitoLaptop、既存 Node 22.23.4、Prisma 6.19.3、既存ネイティブ PostgreSQL 18.4 を使用。CI の PostgreSQL 17 での実行は今回未実施です。新規ソフトや依存は導入せず、Docker の起動/設定変更もありません。

一回限りの実行ドライバーはリポジトリ外に置きました。継承する DB/認証/provider 変数を除き、loopback の新規クラスタ・一時ポート・架空専用 DB を使用。data_directory・PID・アドレス・port・role を照合し、既存 CI 接続先ガード後に書込みます。各クラスタは停止・自分の新規 data directory の範囲検証後に削除し、結果とログだけを保持しました。

作業 root の結果 JSON：

- `ca-utc-db-88e5c28e-56dc-4b25-bbb3-c7a0c5e4ca7d/result.json`：最終の新移行/3 TZ/実 backfill 回帰 PASS。サーバー既定 Asia/Tokyo。
- `ca-utc-db-3fa99705-e087-4b25-be27-9ec3d93a6d9f/result.json`：既存回帰 UTC/JST、旧移行 2 本が全て PASS。
- `ca-utc-db-a8a51c22-80d8-45d1-99f4-e0031527d23b/result.json`：実 backfill 追加前の新移行回帰 PASS。サーバー既定 UTC。
- worktree 内 `.agent-runs/utc-final-checks.json` と `utc-final-{lint,typecheck,test}.log`、`utc-build-webpack.log`、`utc-build-default.log`。

初期の新規クラスタ起動引数ミス、default の SQL 表示形式アサーション、架空メールの大文字不一致による失敗ログも削除しません。いずれも既存 DB へ接続せず、自分のクラスタを停止/削除して修正後は fresh DB で成功しました。初期ハーネスは途中の差分変更により候補不変性 FAIL、build も FAIL を記録しています。最終の単体/型/lint と両 build、独立 DB 証跡を別に保存し、初期 FAIL を PASS へ上書きしません。

## 限界と適用前の確認

本番 DB・過去値の由来・当時のセッション時差は未確認です。一律の時差補正はせず、過去値の修正要否を断定しません。実 Clerk/Blob、配備環境、実画面の履歴表示は未検証。日時表示の単体回帰と本番 build は成功しています。GitHub CI は起動していません。GitHub の書込み 403 は再試行せず、Issue/PR 作成・push・merge・deploy はありません。

本番前の対象 SHA・migration 履歴・復元可能なバックアップ・DDL ロック・新旧アプリ/直接 SQL writer の互換確認、適用/切戻し判断は別作業です。[手順と切戻し方針](../guide/development.md#utc-timestamps)を参照してください。
