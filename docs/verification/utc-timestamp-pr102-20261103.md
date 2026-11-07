# PR #102 UTC日時契約のmain統合検証（2026-11-03）

対象は PR #102 head `794961b6cbfaf0ae76c84e081fd2cda0eae247b7` と main `9c7262ce3cdf05cabdb04bf311a07f490e75130f`。専用ローカルworktreeへ未commitで統合した候補であり、GitHub上のPR・main・配備環境は変更していません。当初の結果は[2026-10-24の記録](utc-timestamp-contract-20261024.md)と区別します。

## 修正と独立レビュー

- 競合した `vercel.json` はmainと同一に解消しました。mainの全branch guardと `dependabot/**` を保持し、対応文書の古い「wildcardなし」という説明を修正しました。
- 通常の `npm test` は `tests/*.test.ts` だけを実行します。UTC migration回帰は通常buildと独立したCI jobへ追加し、空のPostgreSQL 17をUTC・Asia/Tokyo・America/Los_Angelesで作成します。最初の接続のtimezoneも検査します。
- migrationにtransaction内だけの `lock_timeout = '5s'` を追加しました。2番目のALTER対象を読み取りlockで保持し、実際のACCESS EXCLUSIVE待機、時間制限による失敗、先行ALTERを含む全体のrollbackを検査します。Prisma 6は元の55P03を失敗記録時の25P02で包むことがあるため、エラー文だけを根拠にしません。
- 読取専用の独立レビューで、`dbgenerated` の式とDBが返す `'UTC'::text` の違いを指摘しました。隔離DBの `prisma migrate diff` で10default全てのALTER再生成を再現し、schemaをDBの正規化表記へ修正しました。この再発検査も回帰へ追加しています。
- 8関数の直前定義と候補を独立に機械照合し、UTC変換を除いた本文・signatureは8/8一致しました。公開条件・食品版・行lock・追記履歴・認可ルールは変更していません。

## 検証範囲

検証実行環境は既存のNode 22.23.4、npm 11.18.0、Prisma 6.19.3、WindowsネイティブPostgreSQL 18.4です。依存の初期準備はホストNode 22.15.1/npm 10.9.2の `npm ci` で行い、検証コマンドは固定runtimeで実行しました。Docker daemonは停止しており、GitHub CIのLinux/PostgreSQL 17実行は今回未実施です。アプリ依存定義・lockfileはmainと同じです。

DBドライバーは実DB・認証・providerの継承変数を除去し、タスク内の新規cluster・loopbackの空きportだけを使います。data_directory、PID、address、role、portを確認してからCI接続guardを通します。架空データだけを書き込み、各clusterは停止して自分のdata directoryだけを削除します。

新回帰は全10アプリテーブルの既存行を比較し、誤ったJST値も一律補正せず維持します。春のDST切替、秋の重複時間、うるう日、未来値、null期限を含めます。全列定義・制約・index・trigger binding・関数属性・明示ACL・所有者・物理テーブル識別子を比較し、変更が10defaultと8関数のUTC式に限られることを検査します。現在の3timezoneで記録時刻、偽装日時の上書き、未来5分CHECK、招待の有効/失効、運用writerのUNKNOWN・既存link不変も検査します。

## 今回の結果

| 検証 | 結果 |
| --- | --- |
| Prisma generate / validate、lint、型検査 | PASS |
| 単体テスト | 263/263 PASS（fail/skip/cancelled 0） |
| npm run build（DB終了後の単独再実行） | PASS |
| 最終UTC migration / DST / DDL / ACL / 期限 / writer回帰 | UTC・JST・LAの3/3構成 PASS |
| 既存DB回帰と旧migration upgrade | 4/4 cluster、15回のscript実行 PASS |
| 保存・公開Chromium fixture | 13/13 groups PASS、例外・外部通信0 |
| 公開画面Chromium回帰 | 8/8 groups PASS、専用loopbackアプリと架空DBのみ、外部通信遮断 |
| 独立レビュー | 発見P2を修正、未解消指摘0 |
| mainの配備guard全保持、CI空DB分離、diff --check | PASS |
| GitHub CI Linux / PostgreSQL 17、実サービス | UNVERIFIED |

タスクルートの証拠：

- `checks-final/results.json` と同ディレクトリの各ログ。初回は `checks/` に保持。
- `ca-utc-db-320ccf47-84dd-45a7-bece-57ef1d7de15c/result.json`：最終版の3TZ回帰。
- `ca-utc-db-e1492ab7-88a5-4017-8bff-e6d20f1dd4eb/result.json`：UTC/JSTの公開・競合・所有者・rollbackと旧publication/food-review移行。
- `ca-utc-db-9912f4d7-ccb1-4dd1-98dd-f0eed2d4870b/result.json`、`browser-public/result.json`：公開画面と自分のアプリ停止確認。
- `browser-publication/saved-publication-browser-result.json`：全13ケースと例外・外部通信の検査。
- `candidate-validation.json`：mainの全guard・依存定義・通常build jobの不変、独立CI job構造、競合解消。
- `cleanup-summary.json`：失敗分を含む全21clusterの停止確認・data directory不在。
- `candidate-manifest.json` と `pr102-main-candidate.patch`：最終treeとmainからの差分。commit・pushは未実施。

最終照合時のGitHub mainは同じbase SHA、PR #102は同じoriginal headのDraft・競合ありのままです。ローカル候補の成功をGitHub CI成功や本番適用済みとは扱いません。

## 失敗の記録と限界

初回DB起動はClient生成完了前に実行したため未初期化Clientで失敗しました。次の追加fixtureは既存の招待メール一意制約で拒否され、架空メールを一意に修正しました。ロックテストの初版はPrismaのラップされたエラーを認識できず失敗し、pg_locks観測を追加しました。続いてdefault再生成の実不整合を再現しました。各失敗ログを保持します。

最初のbuildはDB回帰がWindowsのPrisma DLLを保持していたためprebuildのrenameがEPERMで失敗しました。DB終了後の単独実行結果と区別します。

本番DB、過去値の正否、実Clerk/Blob、共有E2E、preview・Production・利用者端末での手動操作は未確認です。過去の誤った未来値を維持するため、移行前後の日時の大小だけから履歴順序を推定しません。本番適用・履歴補正・切戻しは[別途の運用判断](../guide/development.md#utc-timestamps)です。push・PR更新・merge・approve・配備・本番migrationは行っていません。
