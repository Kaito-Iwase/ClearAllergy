# 2026-10-25 UTC migration試験の原本保全

[元の検証記録](../../utc-migration-recovery-20261025.md)の一時スクリプトがGit管理外だったため、残存原本と合成出力を[ZIP](utc-recovery-originals.zip)へ未変更で保存した。[manifest](manifest.json)に全memberのsize/hash、検証対象20 migrationのhash、保全時点の限界を記録している。製品コード・migration・既存ハーネスには変更がなく、これは新しい検証実装・新しい試験成功ではない。

## 同一性と収録物

- スクリプト：ZIP直下の `utc-recovery-20261025.py`、14,313 bytes、SHA-256 `d9ea42ea36faeb728137db9e622ec5fac855cf939606c881173903a3655fdaa8`。保全前の `.agent-runs/utc-recovery-20261025.py` とZIPから取り出したbytesが完全一致する。実行ロジック・改行・空白も変更していない。
- `recorded-outputs/`：移行前後の全10テーブルのrow JSON、catalog JSON、custom-format backup、当時のresult JSON、SQL本体と復元再開の実行log。すべて今回の使い捨てDBで作成した合成データで、元記録のbackup/snapshot hashと一致する。
- fixture SQLはスクリプト内蔵。Userのメールは `example.invalid`、店舗/食品/actorは架空、passwordHash/Clerk identityは未設定。実DB・実auth・Blobの出力を含まない。固定の `local_ci_only` は既存CIと同じ使い捨てDB用placeholderで、実credentialではない。backupにはcluster role/passwordを取得する操作を用いていない。
- 対象は `e70d037052242fbc6d0f78860e3a42d2405b681e` の旧19 migrationと `20261024000000_utc_timestamp_contract`。保全時の各SQL bytesをそのGit objectへ照合した。新しい保全commitのHEADを当時の検証対象SHAに置き換えない。

当時はスクリプト自身の実行時hashを記録していなかった。上記は**今回の保全前後の一致**で、実行時hashの後付け証明ではない。残存版は、前半5境界を実行した後、復元先の起動競合に対応して `--restore-only` 再開とTCP readiness待機を加えた最終版である。実際に後半2復元を成功させた再開コマンドの版をそのまま保存した。前半実行時ファイルとのbyte同一性は未確認で、別版を再構成して「当時の原本」とはしていない。7境界の観測結果は当時の各logと元記録に基づく。

## 安全性の制約

これは**履歴の付属資料であり、そのまま実行できる推奨手順として配布しない**。現在の環境で再実行・復元・既存containerの再起動をしていない。

元スクリプトは `docker exec`、固定のCI DB名/role、所有label、空public schema、復元先の固定imageと空schemaを確認する。任意のDB接続URLや本番サービスAPIを引数として受け取らず、reset/clean/dropで既存DBを初期化しない。ただし次の限界がある。

1. ガードがPythonの `assert` に依存し、最適化実行では除去される。汎用CLIとして安全な起動条件を強制する実装ではない。
2. container名とlabelは作成者・専用環境を証明しない。sourceにはimage一致検査の例外があり、Docker contextやcontainer内の接続環境まで検証しない。固定名の既存containerを専用fixtureと決め付けてはいけない。当夜は作成・image・loopback/非公開port・空DBを外側でも確認した。
3. `--restore-only` は保存済み出力を信頼して読み、前半5 checkpointを再検証せず結果配列へ追加する。復元成功だけで7試験を新規に成功させたとは扱えない。過去5境界の実logと入力/出力の同一性が別途必要である。
4. 失敗時の全container停止や後始末を保証せず、既存出力/既存containerが残った状態での一般的な再開機能ではない。空schema拒否を避けるためにresetしたり、別名・別接続先へ勝手に切り替えたりしない。

## 将来の再現に必要な準備

環境削除後も原本・内蔵fixture・元出力・入力SQLのhashを再取得できるようにした。再現を実施する場合は、次を担当者が確認した後の別の許可済み作業とする。現状の原本について、任意環境での安全な再実行を保証したものではない。

1. ZIP/全memberとmanifestを照合し、内容を実行せずに読む。source scriptを変更した場合は別版として保存し、過去の7境界証拠へ差し替えない。
2. 対象SHA `e70d037` の専用worktreeを用意し、20 SQLのbytes/hashをmanifestと照合する。元スクリプトの `ROOT` はファイルの親の親なので、元と同じ `.agent-runs/utc-recovery-20261025.py` という配置が必要。保全ZIPからのコピーならhashを再確認し、引用/保存パスの違いを実行ロジック変更と混同しない。
3. 固定名 `ca-utc-boundaries-r2-20261025`、`ca-utc-restore-20261025-before`、`-after` に既存資源がない、許可された使い捨てDocker環境だけを使用する。衝突したら停止し、今夜の原本containerを削除・起動・上書きしない。Docker context、container内の接続設定、role/DB、image、空schema、assert有効性を外側で確認する必要がある。
4. 元sourceはPostgreSQL 17.11、JST。image digestはmanifest/result記載の `sha256:858bb5e98eed02eb8cafbcdc007f9a65d1b613972028944a8ec2133ccaf80d27`。復元先はLAの別空clusterである。固定のCI名/role/placeholder以外へ接続しない。fixture・バックアップを実環境へ投入しない。
5. 元の通常モードは旧19 migrationと内蔵fixtureから前半5境界・新backupを作り、その後に別空clusterで2復元を検査する。保存済みbackupを使う再開は前半の再実行ではない。将来の実行は新しいHEAD・原本hash・環境・各exit/checkpointを記録し、7境界の過去結果と分ける。起動競合を含む未保証挙動やガードを修正する場合は、その新しい版に必要な限定回帰を行う。

今回行った確認は、Python AST構文解析、ZIP CRC、原本/保存版のbytes/hash、入力SQLのGit object照合、既存出力hash、合成identity・秘密値/接続文字列の検査、参照/diff確認のみ。DB試験や独立レビューは再実行していない。
