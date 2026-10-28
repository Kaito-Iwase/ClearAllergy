# 公開店舗読取の重複取得削減をmainへ限定採用する検証

2026-10-28。初回baseは `471e409f03686273c692a730225e43c4304b9638`、追従先mainは `45d5ee8d9599c9739e8e7df3b107e957b91c03cc`、作業branchは `perf/public-read-main-20261028`。[元PR #96](https://github.com/Kaito-Iwase/ClearAllergy/pull/96)のHEAD `72ae4f108b43f1f5aef7aab48e59eac7f86a85d3` と、独立採用候補 `8b689b6f9c0c3a52e20bff123a6d51098c1c8925` の必要差分を採用します。最終HEAD・CI実checkout・merge・Productionの実績は[採用先PR #116](https://github.com/Kaito-Iwase/ClearAllergy/pull/116)へ記録し、完了前に採用済みと扱いません。

## 採用範囲と維持する契約

元PR/候補と同一の5ファイルは、`PublicShopListPage.tsx`、`PublicShopDetailPage.tsx`、`public-allergen-links.ts`、`scripts/check-public-read-snapshot.ts`、`tests/public-allergen-links.test.ts` です。店舗一覧・店舗詳細が同snapshotで取得したマスタのIDからslugを解決し、リンクに対する品目取得の重複を減らします。公開DTOの形を維持し、照合用IDや要求をまたぐMapを公開しません。

`RepeatableRead`、`force-dynamic`、公開/稼働条件、食品版・公開対応版、UNKNOWNと店舗内補足は維持します。欠損をFREEで埋めず、マスタ外IDはエラーです。メニュー詳細/APIの製品実装、公開条件、認可、schema/migration、依存/lock、CI workflowは変更しません。統合候補全体・#102/#105/#110/#112は採用せず、既存HOLDと独立レビュー上限を引き継ぎます。

main採用済みF3の `tests/public-read-callers.test.ts` ではfixtureに `allergenId` を追加し、元の `allergen.slug` も残します。実route4入口、別transaction client、元client禁止のassert、10か所のmutationは減らしません。実SQL snapshotは同じresolverを使う取得形に同期します。architecture・change-map・verificationを局所更新し、製品仕様や作業規則を変えないためproduct・rules・AGENTSは更新不要です。

## 旧候補の証跡と今回の測定

[2026-10-25の候補記録](https://github.com/Kaito-Iwase/ClearAllergy/blob/8b689b6f9c0c3a52e20bff123a6d51098c1c8925/docs/verification/public-shop-read-performance-20261025.md)では、架空データの隔離PostgreSQLで実ページのquery指定を比較し、9組のDTO一致とSELECT 5→4を記録しています。上記5ファイルの内容を照合して再利用しますが、これは当時の測定です。今回のbaseでの本数・p95・負荷やProduction遅延の改善を測った結果ではありません。

今回の検証入口は次のとおりです。先行HEAD `7d8a553a327271ecbd2d569950ca571be6743c77` の結果と、main追従後の最終HEADの結果を採用先PRで分け、未実行をPASSにしません。

| 検証 | 目的・現状 |
| --- | --- |
| `tests/public-allergen-links.test.ts` 3件 | 状態保持、欠損/未知ID、要求ごとの対応。先行HEADで3/3 PASS |
| `tests/public-read-callers.test.ts` 4件 | 公開3ページ/APIの実routeがtxを使う。先行HEADで4/4 PASS |
| `node scripts/check-public-caller-mutations.mjs` | 受入条件は4正例→10か所を元clientへ戻した失敗→復元4正例。最終HEADの実測結果とsource hashをPR #116へ記録する |
| 通常CI | 先行HEADは263/263・lint/型/build・隔離実DB snapshot・保存公開13群/公開8群PASS。追従後は新SHAの通常CIを別確認する |
| Production公開4入口 | merge後の新SHA・Readyとreadonly GETを別確認し、PR #116へ記録する。先行CIの成功で代用しない |

初回の依存参照用junctionはPowerShell New-Itemのアクセス拒否となり、未作成を確認しました。後続caller試験の `tsx` 未解決による開始前exit1はclient境界の負例ではありません。同操作は再試行せず、承認範囲で独立worktreeへ通常npm ciを実行しました。公式checksum照合済みNode22.23.4・専用prefixのnpm11.18.0で424 packages、audit 0、manifest/lock不変、依存実体を作成しました。Prisma Client6.19.3の通常生成と上記7試験は成功しています。実DBには接続していません。

先行CIは[40684187810](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/40684187810)、実checkout `63e49473772dc5a9001df07d6708be6299b1f98b` は先行HEADと同treeです。snapshotの旧食品＋新FREEの実SQL負例と一貫性を保つ正例、通常cleanupの成功を確認しました。artifactは `12814740913`。これはmain追従後のCI結果ではありません。

12:12 UTCのmutation script実行は、使い捨てコピーの依存linkを作る `symlinkSync` がsandbox内でEPERMとなり、baseline前に停止しました。baseline/restoredはnull、mutationsは空で、10負例成功とは扱いません。通常実行環境で既存scriptを1回実行する明示承認後、保護・OS設定を変えず正規の実行承認手続きを使います。結果と対象HEADはPR #116に記録し、失敗/拒否時は再試行せず停止します。canonical checkoutのstatus読取もPermission deniedで未確認のまま保持し、そこへは変更していません。

## 配備範囲・限界

`vercel.json` はPR #117採用後の既存14件のfalseを保持し、今回の正確なbranch名だけfalseを追加します。mainの自動Production配備は抑止せず、承認されたmergeに伴う配備と手動deployを区別します。Dependabot有効化・管理設定変更・branch削除は含みません。

実Clerk/Blob・本番書込、接続pool/負荷、すでに開いた画面やオフラインへの自動反映は未検証です。大学回線のNeonには接続せず、実DB回帰は既存CIの使い捨て環境のみを使います。readonly HTTP成功は食品安全性や全利用者のcache反映を保証しません。
