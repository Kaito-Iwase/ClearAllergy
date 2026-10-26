# #102 UTC migration：限定した失敗・復元試験

2026-10-25 UTC。対象コードは統合候補 `e70d037052242fbc6d0f78860e3a42d2405b681e`、main は `0b6ed291b2fd853230c7efdeeb1e061815404a81`。通常の Git fetch / ls-remote で両SHAを照合し、候補はローカル `preserve/font-portability-e70d037` にも保存した。独立branchは `codex/utc-migration-boundaries-20261025`。本記録を含むcommitは文書と当該branchのPreview抑止だけで、migration・schema・アプリ・既存UTC検証スクリプト・UI・ハーネス本体は変更していない。

これは作者の限定再現試験であり、4回目の独立レビューではない。#102の独立レビューは依頼で示された3回上限のまま、人間の最終レビューを待つ。[先行3×3 TimeZone・15回の既存DB回帰](utc-timestamp-contract-20261025.md)を今回の成功として再計上せず、未検証だったDDL途中失敗・backup復元に絞った。再現できた製品コードの欠陥はなく、migrationの意味を変える修正は行わなかった。

## 実行対象と隔離

AGENTS、README、変更対応表、日時仕様、開発手順、既存 `check-utc-timestamp-migration.ts`、`agent-harness.mjs` / `harness-policy.mjs`、Actions両workflowを読んだ。このクラウドcheckoutと `/workspace/.agents` には `.agents/skills` がなかった。Context7ツールも利用できなかったため、[PostgreSQL 17日時型](https://www.postgresql.org/docs/17/datatype-datetime.html)と[pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)の公式資料を補助参照した。

Node 24.19.0 / npm 11.9.0（repo指定の22.23.4 / 11.18.0とは異なる）、Prisma package 6.19.3、PostgreSQL 17.11。公式 `postgres:17-bookworm` を取得し、以降はdigest `sha256:858bb5e98eed02eb8cafbcdc007f9a65d1b613972028944a8ec2133ccaf80d27` に固定。今回作成したcontainerの所有label・接続DB名/role・空public schemaを確認した。データは `example.invalid` と架空店舗・食品だけ。新しいcredentials、クラウド設定、環境ファイルは作成していない。

最初のDB `ca-utc-boundaries-20261025` はfixtureで既存pistachio masterへのlinkを取りこぼし、既存公開guardが非公開へ戻したため停止して保持。fixtureを全master対応に直し、別の空DB `ca-utc-boundaries-r2-20261025`（JST、127.0.0.1:55438）で試験した。これは製品修正ではない。復元先は `ca-utc-restore-20261025-before` / `-after`（LA、host port公開なし）の別々の空cluster。復元先起動時に一時server終了と重なった最初の接続は失敗し、空schemaを再確認して復元部分だけ再開した。全4containerは終了時に停止し、volumeと合成backupは保持した。既存DBのreset/cleanは行っていない。

## 限定SQL試験の結果

`docker exec -i <今回のcontainer> psql -X -qAt -v ON_ERROR_STOP=1 -U clearallergy_ci -d clearallergy_ci` でrepoの旧19 migrationを順に適用し、全10アプリテーブルが埋まった合成fixtureを作成した。Prismaを使用しないSQLレベルの試験である。

| 境界 | 判定・観測 |
| --- | --- |
| 過去timestampの由来 | PASS：同一transactionで旧DB defaultは明示UTC入力より9時間進み、異なる入力経路が同じ保存値にもなった。型は `timestamp without time zone` のため値だけからwriter/接続zoneを復元できない。実データの由来・正誤は未確認 |
| 全DDL完了後の失敗 | PASS：実migrationの一時コピーだけに、最後のCOMMIT直前へ `SELECT 1 / 0;` を挿入。division by zeroで非0終了し、全行・全列定義・関数・制約・index・trigger・enumが適用前と完全一致 |
| 途中のロックtimeout | PASS：別接続で10番目のALTER対象 `MenuFoodIssueResolution` を一時lock。一時コピーのBEGIN直後に `SET LOCAL lock_timeout='250ms';` を追加し、先行9 default変更後のtimeoutで全行・catalogが適用前と完全一致。実migrationにtimeout設定は追加していない |
| 正常適用のschema契約 | PASS：全10テーブルの全列JSON・公開true・旧確認/解除/公開履歴が不変。catalog比較で10 defaultと8関数の日時式だけが差分。列順・型・精度・nullability、他default、制約、index、trigger、enum、日時以外の関数本文は一致 |
| SQL直接再実行 | PASS：同じSQLを再実行し全行・catalogが不変。Prisma deployの再実行やchecksum照合の試験ではない |
| 移行前backup | PASS：`pg_dump -Fc` → 空LA clusterへ `pg_restore --exit-on-error`。全行とcatalogが一致し、実migrationを再適用して正常適用後と同じ行・定義になった |
| 移行後backup | PASS：別の空LA clusterへ同様に復元し、全行とcatalogが一致。移行後backupはUTC定義を保持し、旧定義へ戻す操作にはならない |

snapshotは全10テーブルの `to_jsonb` を固定順で比較。catalogはinformation_schema.columns、pg_get_functiondef、pg_get_constraintdef（遅延/有効属性も含む）、pg_indexes、pg_get_triggerdef/tgenabled、enumを比較した。backup前後のrow JSONは同一、schema差分は上表の限定変更だけ。旧backupへの復元はbackup以降の書込みを含まないため、本番の無損失切戻しや復旧先への切替許可を意味しない。roles/ACL・Neon固有機能・実運用負荷は再現していない。

## 既存コマンドの実結果と停止理由

以下は対象HEAD `e70d037` での今回の結果。成功した過去の件数を流用しない。

| コマンド | 判定・生成証跡 |
| --- | --- |
| `npm ci --cache /tmp/clearallergy-utc-npm-cache --no-audit --no-fund` | PASS、433 packages。先行する通常cacheでの導入は `/home/agent/.npm/_cacache` の書込不可で失敗。依存/lockは不変 |
| `node node_modules/prisma/build/index.js generate` | BLOCKED：公式binaries.prisma.shへのCONNECTが403。正規の承認付き実行も同じ403。checksum/TLS検証の無効化・別配布先は使用していない |
| `node --import tsx scripts/check-utc-timestamp-migration.ts` | BLOCKED：生成済みPrisma Clientがなく、DB操作前のmodule初期化で停止。今回のPrisma経由DB回帰は未実行 |
| `npm test` | FAIL、173件中164成功/9失敗、skip/cancelled 0。9件はPrisma Client未生成によるtest file初期化失敗。全suite成功とは扱わない |
| `npm run typecheck` | FAIL、Prisma Client未生成に由来する型/export不足。製品の回帰とは未判定 |
| `npm run lint` | PASS、exit 0 |
| `node scripts/agent-harness.mjs verify --base origin/main --output utc-boundaries-harness-preflight.json` | UNVERIFIED、exit 1。declared plan欠落・live inventory未取得・実GitHub-hosted CI identity条件不成立。`.agent-runs/utc-boundaries-harness-preflight.json` は `commands: []` / `codeChecksStatus: NOT_RUN`。plan/snapshot/CI flagsを捏造して先へ進めていない |
| `node scripts/check-context-links.mjs` | PASS、入口7ファイル236参照（新文書リンク追加後に照合）。外部URL/仕様の正否を保証しない |
| build / Prisma validate / 既存15 DB回帰 / 公開UI9状態 | 未実行。公式engine取得が止まるためbuildの同じprebuild取得を反復しない。UIは別担当・今回変更なし |

ハーネスの停止を手動SQL成功で上書きしない。最新GitHub Issue/PR/review/checksはAPI Forbiddenで未取得。本番適用の可否、人間レビュー待ち、既存PRの状態は変更していない。Actionsのpush対象はmain/developのみ、auditにpush triggerはなく、CIはplaceholder専用DB/鍵で `contents: read`、deploy step/Secrets参照はない。新branchへpushする際はこのbranchだけ `git.deploymentEnabled: false` を含める。

## 証跡と再開

この試験の実行用一時probe・詳細log・合成backupは作業worktreeの `.agent-runs/utc-recovery-20261025.py`、`.agent-runs/utc-recovery-evidence-r2/` と `/tmp/clearallergy-utc-*.log` に保存した。probeは既存ハーネスへの追加機能ではなく今回の再現用で、通常回帰の代わりにしない。Git管理した本記録と[判定JSON](utc-migration-recovery-20261025.json)が判定の要約で、ローカル一時ファイルは補助証跡である。

後続の成果物保全で、残存スクリプト・内蔵合成fixture・元出力/backup/logを[未変更の原本ZIPとmanifest](evidence/20261025-utc-recovery/README.md)へ保存した。保全前後のscript hashは一致するが、当時の実行時hashは未記録。残存版は復元再開時の最終版で、前半5試験実行時ファイルとのbyte一致は未確認である。assert依存・container所有確認・再開時の旧checkpoint扱いに限界があるため、履歴資料として保存し、そのまま実行できる推奨手順とはしない。新しいDB試験・独立レビュー・migration変更は行っていない。

- `before.dump` SHA-256：`13160ddea55775af8de3175076fdc95c070e346fa7b85148e89d155e9f60b3a3`
- `after.dump` SHA-256：`8ab03d9f9e67267498541e0b71e5fc328dfbca78ed0ab3df6c9a3c809aadf03d`

再開時は本branchとremote SHA、候補依存・現在のGitHub記録を再確認する。公式Prisma engineを正規経路で取得可能な環境で既存generate/validate、unit/typecheck/buildと既存UTC検証を実行する。DBは必ず新しい空の使い捨てDBを使い、既存DBへ再現用probeを流用しない。Prismaの失敗履歴・P3018/P3009・`migrate resolve`復旧、COMMIT前後のプロセス停止/応答喪失は今回未検証。DDL rollbackの観測だけでPrisma履歴も自動復旧すると推測しない。人間による最終レビュー、対象実データの由来、backup/復元権限と保持、全writer互換性、DDL許容停止時間は本番適用前の保留条件である。
