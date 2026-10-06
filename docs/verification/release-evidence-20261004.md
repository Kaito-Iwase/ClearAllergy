# 配備条件のEvidence ledger（2026-10-04）

[自律開発の検証](../agentic-development.md#検証) · [原典JSON](release-evidence-20261004.json) · [Issue #54](https://github.com/Kaito-Iwase/ClearAllergy/issues/54)

この記録は取得時点のrepository、同一main SHAのCI、架空データ専用の一時PostgreSQLを照合したもの。実配備SHA、production DB、backup、alerts、実Clerk/Blobの状態は未確認であり、release承認や食品の安全性を示す証拠として扱わない。次回は対象SHA・日時・環境を再取得する。

## 対象・出典・変更範囲

取得日2026-10-04 JST（原典の時刻はUTC）。基点mainは[`1830a98fd4f8b60e9621417a5b843a4e42e0d81a`](https://github.com/Kaito-Iwase/ClearAllergy/commit/1830a98fd4f8b60e9621417a5b843a4e42e0d81a)。GitHubのbranch/CIとローカルのschema/master/既存migration/lockを照合した。原典JSONに個別時刻、適用履歴、確認結果、入力ファイルのSHA-256、collector全文とhash、CIの成功行を保存している。外部環境やaccount fileから秘密値・個人データを取得していない。

| 対象 | 確認した値・範囲 | 判定 |
| --- | --- | --- |
| canonical checkout | branch `improve/prototype-usability-ci`、HEAD `f1f209cc4f6891f22ada0a4916244b2be2217e32`、dirty 22 paths | CONFIRMED。未公開変更はこのledger/PRに含めない |
| lock | Windows worktree生byte（CRLF）のSHA-256 `3bf7ffe3aa9117734a634ab523810cb29b204a6152791c8c915fd2a24f670170` | CONFIRMED。基点Git blob（LF）の別SHA-256はJSONに併記。production lockはUNKNOWN |
| package-lockの固定版 | Next.js16.3.4、Prisma Client/CLI6.19.3、bundled npm11.19.1。CI global npm指定は11.18.0。その他は原典JSON | CONFIRMED。範囲指定・CLI実行経路と区別 |
| Node | `.node-version`指定22.23.1 / collector・local検証22.15.1 | 差を確認。CIは指定fileを使用する定義とSetup成功を確認したが、独立した`node --version`の実行結果は未取得 |
| production | 配備SHA・runtime・lock・適用migration/trigger/index | UNKNOWN |

変更はこの文書・原典JSON・既存自律開発文書の検証入口のみ。schema/API/UI、設定、依存、既存migration、安全・法務文言は変更しない。未公開guide/researchの公開判断は[#60](https://github.com/Kaito-Iwase/ClearAllergy/issues/60)に残す。[PR #62](https://github.com/Kaito-Iwase/ClearAllergy/pull/62)の所有店舗write修復は別branchであり、上記mainの検証結果へ混ぜない。

## 同一main SHAのCI

[CI run37180557443](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/37180557443)は上記main SHAのpushに対し、2026-10-04T05:42:09Zにsuccess。Generate Prisma Client、tests80/80（fail0/skip0）、lint、typecheck、架空fixture準備、build、公開Chromium7組が成功している。390/1440px、検索・設定保存・別tab競合・解除・共有・client exceptionの確認範囲は原典の成功行を参照する。

これは外部通信を制限した公開画面のCI試験。実Clerk認証、管理画面、Blob書込、production配信cache、利用者の理解度はUNVERIFIED。画面Evidence artifactはCI定義で保存期間7日、後日のダウンロード可否は未確認。成功行の抜粋をJSONへ保存したが、画像そのものを永続保存したとは扱わない。

GitHub REST `branches/main`は同時点の`protected: false`、repository rulesetsは空配列を返した。取得元の範囲を越えた継承policyはUNKNOWN。CI成功はrequired-check設定やmerge許可を示さず、AGENTS.mdの通常PRをmergeしない方針を維持する。設定変更は実施していない。

## T02: 専用PostgreSQLの実証

一時PostgreSQL17.11（`postgres:17-bookworm`）をlocalhostの専用portに作成し、既存[`scripts/ci-environment.ts`](../../scripts/ci-environment.ts)の`assertCiDatabaseTarget`を通した。既存[`scripts/setup-ci-env.ts`](../../scripts/setup-ci-env.ts)が空の専用DBへ既存16 migrationと架空fixtureを準備した。実サービスの接続情報は使用しない。

collectorは#38の隔離worktree HEAD `6d41bf5f9d737ddc1c51c25cb1513407d11f51ff`で実行した。schema/master/CI guard/setup/全16 migrationは双方のWindows worktree生byteが一致し、双方のcommitのGit blobも一致した。原典JSONに生byteと基点Git blobのSHA-256を別々に記録した。Gitの改行変換によりCRLFのworktreeとLFのblobのhashは異なるが、改行正規化後の内容は一致する。collectorは実Prisma6.19.3/PGへ接続して次の9組をfresh検証し、exit0と作成fixtureのcleanup完了を確認した。

| 実証 | 結果・範囲 |
| --- | --- |
| code masterとDB master集合 | 29/29、slug集合一致。現版のsnapshot件数であり、将来の品目数を固定する仕様ではない |
| `AllergenStatus` enum | `UNKNOWN / FREE / MAY_CONTAIN / CONTAINS`の4状態一致 |
| 適用済み公開制御trigger | 3件、deferrable/initially deferredをDB catalogで確認 |
| 適用済みpending招待部分一意index | email/shopIdの2件、UNIQUE/WHERE pendingをDB catalogで確認 |
| allergen link欠損 | publishedで作成した架空menuが非公開になる |
| 全品目設定・一部MAY_CONTAIN | 架空menuの公開状態が保持される。安全性の保証とは区別する |
| UNKNOWNへの変更 | 架空menuが非公開になる |
| transaction失敗 | 作成した架空menuがrollbackされ、件数が不変 |
| pending一意性 | 同shop/同emailの重複はP2002、revokedとの併存は可能 |

16 migrationは`finished_at`あり・`rolled_back_at`なし。これは上記一時DBへの適用証拠であり、SQL fileの存在だけでappliedとしたものではない。productionの適用状態はUNKNOWN。

既存[`scripts/check-test-database.ts`](../../scripts/check-test-database.ts)の関連assertionをCI guard下のcollectorで確認した。Compose専用hostを要求する原コマンドそのもの、lock競合・並列招待race・master追加/削除によるtrigger動作、管理ブラウザの全suiteは未実施。9組を全DB回帰やproduction整合性の証明と呼ばない。

## 再取得方法・副作用

CIの再取得は同一対象SHAのrun metadata/logを読み、結果・件数・時刻・URLを更新する。repositoryは`git status --short`、HEAD、lock hash、固定版、`.node-version`、CI定義を別々に記録する。hashはNodeのcryptoでraw BufferへSHA-256を適用し、worktreeは`readFileSync`、Git blobは`git show <base>:<path>`のstdout byteを採取した。Linux/CIやGitHubのfileを検証する際はworktreeのCRLF hashを期待値にせず、基点Git blobのhashと比較する。未知の配備SHAへこの記録を転用しない。

DBの再取得には空の架空データ専用PostgreSQLとlocked依存が必要。保存済みcollectorは出力base SHAを固定し、自身ではHEAD/入力hashを検証しないため、**この基点の同一入力を再実証するときだけ**使用する。先に`git rev-parse HEAD`で記録のbaseまたはcollectorWorktreeHeadを確認し、schema/master/guard/setup/全migration/lockを原典のGit blob hashと照合する。1件でも一致しなければこのcollectorを実行せず、結果を旧baseの証拠へ追加しない。別release SHAの採取ではcollectorのbase記録と入力証跡を新しい対象へ更新・reviewし、新規ledgerとして保存する。

同一対象の確認後、既存CI guardの許容接続先・fixture opt-in・非実在credentialを確認してから既存setupを実行する。setupは既存migration/fixtureを書き込むため、shared/production DBへ向けない。原典JSONの`database.collectorSource`を隔離worktreeへ新規保存し、記録されたhashと照合してから、同guardを通す環境で次を実行する。

```powershell
node --import tsx <保存したcollector.mjs> <確認したworktreeの絶対path> <新規output.json>
```

collectorは架空shop/menu/inviteを作成し、rollbackを検証し、finallyで自分が作成したshop等を削除してdisconnectする。既存setupの副作用・対象DBを確認することが前提であり、この文書はproduction migrationの許可ではない。再実行していないコマンドを成功として記載しない。

## 未確認の配備条件・次の判断

| 未確認事項 | 必要なEvidence・関連Issue |
| --- | --- |
| 実配備SHA/runtime/lock、production migration/trigger/index | 許可された読取accessで、同じrelease対象の設定・履歴・catalogを取得 |
| backup/restore、alerts、incident担当/停止権限 | 対象・owner・時刻・復元結果・通知実績。[#42](https://github.com/Kaito-Iwase/ClearAllergy/issues/42) / [#53](https://github.com/Kaito-Iwase/ClearAllergy/issues/53)の判断/環境待ちを維持 |
| 実Clerk/Blob設定・専用管理試験 | 専用tenant/fixtureと許可scope。[#44](https://github.com/Kaito-Iwase/ClearAllergy/issues/44) / [#45](https://github.com/Kaito-Iwase/ClearAllergy/issues/45)の判断を維持 |
| 配信鮮度・利用者理解・責任/公開claim | 専用Preview測定と同意された実験。[#43](https://github.com/Kaito-Iwase/ClearAllergy/issues/43) / [#49](https://github.com/Kaito-Iwase/ClearAllergy/issues/49) / [#39](https://github.com/Kaito-Iwase/ClearAllergy/issues/39) / [#52](https://github.com/Kaito-Iwase/ClearAllergy/issues/52) |

この文書の検証は、原典JSONのparse/hash・repo入力の照合、CI同一SHA/件数、リンク・差分、独立read-only reviewで行う。文書のみの変更なのでlocal lint/typecheck/tests/build/Prisma再生成は省略可能。別Issueの成功件数をこの文書変更のlocal試験結果として流用しない。更新時の修正はledger訂正のみに限定し、未確認の配備条件を自動承認しない。
