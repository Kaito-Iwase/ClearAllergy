# 食品確認実装の敵対的レビューと改善

[初回実装・検証](menu-food-review-20261009.md) · [検証の入口](../guide/verification.md) · [公開ルール](../guide/rules.md#publication)

2026-10-09 JST。ブランチ `improve/readable-public-ui`、基準HEAD `68cd41a88783c5c4d9d647ebc94239f54be3b434`。対象は初回実装を含む全未コミット差分。commit・push・PR承認・merge・本番DB適用・配備は行っていない。

## レビュー方法と指摘

実装履歴を渡さず、基準HEAD、差分、公開・確認・競合・所有権のInvariantを2名の読取専用reviewerへ渡した。DB／APIの整合性とUI／公開取得を分担し、指摘の反例を主担当が専用DBと実部品で検証した。reviewer自身の静的検証と、主担当のDB／ブラウザ実行を区別する。

| 周回・重要度 | 問題と影響 | 改善・理由 |
| --- | --- | --- |
| R1 / P1 | 同じ食品版へ未解決事項を記した確認を直接INSERTしても公開が続く。古い正常記録が1件あれば再公開できた | INSERTで親をロックし確認状態を反映。DB生成の `reviewSequence` で最新記録だけを公開判定し、古い正常記録の流用を防ぐ |
| R1 / P1 | 未来の食品版と任意snapshotを事前INSERTし、食品変更後に確認版を合わせると未確認食品を公開できた | 現在版以外の記録を拒否。食品snapshotと記録日時をDBで生成し、記録と保存済み内容の対応を保証する |
| R1 / P2 | 成功応答の `foodReviews: [null]` を取り込むと、新しい履歴表示がクラッシュ | 履歴全行・ID・食品版・確認版・編集版・画像URLを、state変更前に検証する。不正応答では入力と旧編集版を保持 |
| R1 / P2、既存の穴 | 新規作成応答のIDがnull／object／空でも成功として入力保護を解除し、無効URLへ遷移する | 作成IDのCUIDと反映フラグの型を検証してから成功とする。編集画面の追加作成も同じ検証を使う |
| R1 / P2、既存の穴 | native fieldset無効化で画像divの独自gestureは止まらず、新規送信中の構図変更が遷移で失われる | new／editの構図更新を送信・upload中に拒否し、送信した入力を固定する |
| R2 / P1 | 確認記録のTRUNCATEは行DELETE triggerを通らず、記録0件でも確認版・公開が残る | 文単位のTRUNCATE triggerで全親の食品版を進め、公開を停止。大規模削除でも派生状態だけを残さない |
| R3 / P1、既存の読取構造の穴 | Prismaの親・子・マスタ読取が別SQLで、訂正が途中で確定すると旧食品名・旧確認版と新未確認FREEが混ざる | 公開全4入口をRepeatableReadで取得。店舗内補足も同じtransaction clientを必須にし、単一のDB時点から表示を組み立てる |

R1のDB反例はrollback付きSQLで公開がtrueのまま残ることを確認した。回帰テストも修正前に失敗した。R2のTRUNCATE反例では、記録0件のまま架空メニュー3件が公開状態を保った。いずれも本番データは使っていない。

現行版の記録DELETEでも食品版を進める。未解決記録だけを削除して古い正常記録を復活させる経路を閉じた。順序は呼出し側の日時・IDや同一時刻に依存しない。実物／原資料が正しいという証明をDBが行うわけではない。

## 再レビューと判定

R1は両reviewerがREQUEST_CHANGES。修正後のR2で追加のTRUNCATE経路を発見して修正し、最新差分を再確認した。両reviewerは未修正のP1／P2を見つけず、ローカルコード範囲でAPPROVE。UI reviewerは独立したDTO検証15件とdiff確認、DB reviewerは更新・削除・記録・マスタ・子更新の経路とdiff確認を行った。主担当の実行結果を、reviewerが独立に再実行した結果として扱わない。

最終migrationのSHA-256は `9E5526E53F718DEDDE70F028EA93EFE8C60FA3F3E614F3E3D6BBE7E35D85BCAB`。レビュー後のソース変更があれば、この判定を新しい差分へ流用しない。

R2承認後、主担当が最終確認で実SQLの分割を発見し、実Prismaのwireをloopback TCPプロキシで止めて別接続の訂正をcommitする反例を再現した。これはmockがエラーを返す検査ではない。旧食品＋新FREEの混在を確認し、RepeatableRead補強後は旧食品＋旧CONTAINSが一貫して返り、次の取得では公開停止としてnullになることを確認した。R2の承認を変更後ソースへ流用せず、R3独立レビューを依頼した。

R3では両reviewerが最新ソースを再確認し、ローカル差分にAPPROVEを出した。両者がそれぞれ公開API／読取失敗の12テストとdiff確認を独立に実行してPASS。実DB、wire反例、全テスト、ブラウザは主担当の実行証拠であり、reviewerによる独立再実行ではない。R3後に実装ソースは変更していない。確認したSHA-256は次のとおり。

| ファイル | SHA-256 |
| --- | --- |
| `features/public/shops/server/public-read-snapshot.ts` | `D1E7A4EC650A518E340AC8D1E0E9C8A15D93A0F574DE7F3B7E7D5D9ADBB7B146` |
| `features/public/shops/server/publicMenuRoute.ts` | `5708C3BD2B016C704D5B815CB30B053FFC7D66C5620A60424E4EA719D8D61A66` |

最終判定は **APPROVE（今回のローカル未コミット差分）**。食品確認・公開停止・同時更新・応答検証について、再現した7件を修正し、3周で未修正のP1／P2は見つからなかった。無欠陥や実食品の正確性を保証する判定ではない。

## 最終検証

本番運用・実食品の正確性・混在配備・既に開いた画面への訂正到達は承認対象外。

| コマンド・対象 | 最終結果 |
| --- | --- |
| `npx.cmd prisma validate` / `npx.cmd prisma generate` | PASS、6.19.3 |
| `npm.cmd test` | PASS、R3最終187/187、失敗・skipなし |
| `npm.cmd run lint` / `npm.cmd run typecheck` | PASS、いずれもexit 0 |
| `npm.cmd run build` | PASS、Next16.3.6。公開3ルートは動的生成 |
| `node --import tsx scripts/check-ci-database.ts` | PASS、36グループ。最新記録・未来版・snapshot・実ロック競合・DELETE復活・TRUNCATEと巻戻しを含む |
| `node --import tsx scripts/check-owned-menu-database.ts` | PASS、5グループ。所有店舗移転／削除の競合と通常操作 |
| `node --import tsx scripts/check-food-review-migration.ts` | PASS、最終SQLを旧16 migrationから適用。旧公開が停止、状態維持、再適用でpendingなし |
| `node scripts/browser-runner.mjs allergens` | PASS、10グループ。実部品の不正履歴・ID・版・URL、送信遅延・通信断・入力保持を含む |
| `node --import tsx scripts/check-public-read-snapshot.ts` | PASS、2グループ。実Prismaの分割読取で訂正混在を再現し、同じwire競合で公開snapshotの一貫性と次回取得の停止を確認 |
| `node --import tsx scripts/check-publication-propagation.ts` | PASS、未解決記録追加後API404・ページから食品不在、明示的な新確認で再公開、食品変更とSTOPの反映。390px実Chromiumの停止画面もPASS |
| `node scripts/browser-runner.mjs ui` | PASS、R3ビルドで11グループ。320／390／768／1024／1440px、注意表示、キーボード、店舗内補足、404を確認 |
| `node scripts/browser-runner.mjs public` | PASS、R3ビルドで8グループ。検索、設定、別タブ競合、入力保持、一覧／詳細、共有、クライアント例外なしを確認 |
| 文書・図・差分照合 | PASS。12文書・213相対リンク・329コード参照、SVG埋込XMLとdraw.io源の一致を確認。図を描画して目視し、`git diff --check` もPASS |

UNVERIFIED：実Clerk／Blobの管理ブラウザ、本番migration／配備、混在配備・本番のDB接続負荷、GitHub CI、repo指定Node/npm版、既に開いた画面への訂正到達、実物・資料の専門家レビュー、draw.ioでの往復編集。これらはローカル承認とは別に残る。

証拠はこのチャットのローカル成果物 `review-loop-r1-db-counterexamples.log`、`review-loop-r1-db-red.log`、`review-loop-r2-truncate-red.log`、`review-loop-r3-tests-final.log`、`review-loop-r3-lint.log`、`review-loop-r3-typecheck.log`、`review-loop-r3-build.log`、`review-loop-final-database.log`、`review-loop-final-owned.log`、`review-loop-final-migration-green.log`、`review-loop-final-browser-green.log`、`review-loop-r3-snapshot.log`、`review-loop-r3-propagation.log`、`review-loop-r3-ui.log`、`review-loop-r3-public.log` と、画面画像・`propagation.json`。新しいcloneに同梱される資料ではない。

実行環境はNode22.15.1、npm10.9.2、Next16.3.6、Prisma6.19.3、専用PostgreSQL17.11。DBはloopback 55522〜55524の今回専用tmpfs、永続volumeなし、接続ガード付き架空データだけ。UI部品は実React部品＋ビルド済みCSS＋隔離Chromiumだが保存応答とnavigationは代用品。公開反映は本番ビルド＋専用実DBの新しいHTTPアクセスで確認する。

検証後は今回のPID・起動コマンドと、コンテナ3個のタスクラベル・loopbackポート・tmpfs・永続volumeなしを再確認して停止した。PID16432と3102の待受はなく、今回のラベルが付いたコンテナも0個。結果はローカル成果物 `review-loop-cleanup.json` に保持する。コード／文書は未コミットのまま残す。

初回の全テストは181/185で、sandboxのhardlink／realpath制約により既存4件が失敗した。ソースを変えず適切な実行権限で再実行して185/185を確認した。Prisma生成も同じrealpath制約で一度失敗し、再実行した。ブラウザ追加ケースは既存の状態表示を誤って成功表示と数えた期待値と、ボタン名の末尾記号を含まない選択子で失敗した。それぞれ検査側を訂正し、最終成功と失敗ログを分けて保持する。

ルール・内部処理・変更対応表・検証入口・初回記録と、構成図の公開読取ラベルを更新した。AGENTS、READMEは今回の補強で作業ルール・起動コマンド・製品概要は変わらず、追加変更は不要。
