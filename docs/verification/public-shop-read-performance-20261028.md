# 公開店舗読取の重複取得削減をmainへ限定採用する検証

2026-10-28。baseは `471e409f03686273c692a730225e43c4304b9638`、作業branchは `perf/public-read-main-20261028`。[元PR #96](https://github.com/Kaito-Iwase/ClearAllergy/pull/96)のHEAD `72ae4f108b43f1f5aef7aab48e59eac7f86a85d3` と、独立採用候補 `8b689b6f9c0c3a52e20bff123a6d51098c1c8925` の必要差分を採用します。最終HEAD・CI実checkout・merge・Productionの実績は採用先PRへ記録し、完了前に採用済みと扱いません。

## 採用範囲と維持する契約

元PR/候補と同一の5ファイルは、`PublicShopListPage.tsx`、`PublicShopDetailPage.tsx`、`public-allergen-links.ts`、`scripts/check-public-read-snapshot.ts`、`tests/public-allergen-links.test.ts` です。店舗一覧・店舗詳細が同snapshotで取得したマスタのIDからslugを解決し、リンクに対する品目取得の重複を減らします。公開DTOの形を維持し、照合用IDや要求をまたぐMapを公開しません。

`RepeatableRead`、`force-dynamic`、公開/稼働条件、食品版・公開対応版、UNKNOWNと店舗内補足は維持します。欠損をFREEで埋めず、マスタ外IDはエラーです。メニュー詳細/APIの製品実装、公開条件、認可、schema/migration、依存/lock、CI workflowは変更しません。統合候補全体・#102/#105/#110/#112は採用せず、既存HOLDと独立レビュー上限を引き継ぎます。

main採用済みF3の `tests/public-read-callers.test.ts` ではfixtureに `allergenId` を追加し、元の `allergen.slug` も残します。実route4入口、別transaction client、元client禁止のassert、10か所のmutationは減らしません。実SQL snapshotは同じresolverを使う取得形に同期します。architecture・change-map・verificationを局所更新し、製品仕様や作業規則を変えないためproduct・rules・AGENTSは更新不要です。

## 旧候補の証跡と今回の測定

[2026-10-25の候補記録](https://github.com/Kaito-Iwase/ClearAllergy/blob/8b689b6f9c0c3a52e20bff123a6d51098c1c8925/docs/verification/public-shop-read-performance-20261025.md)では、架空データの隔離PostgreSQLで実ページのquery指定を比較し、9組のDTO一致とSELECT 5→4を記録しています。上記5ファイルの内容を照合して再利用しますが、これは当時の測定です。今回のbaseでの本数・p95・負荷やProduction遅延の改善を測った結果ではありません。

今回の検証入口は次のとおりです。結果・対象HEAD・環境を採用先PRで結び付け、未実行をPASSにしません。

| 検証 | 目的・現状 |
| --- | --- |
| `tests/public-allergen-links.test.ts` 3件 | 状態保持、欠損/未知ID、要求ごとの対応。今回未実行 |
| `tests/public-read-callers.test.ts` 4件 | 公開3ページ/APIの実routeがtxを使う。今回未実行 |
| `node scripts/check-public-caller-mutations.mjs` | 4正例→10か所を元clientへ戻した失敗→復元4正例。今回未実行 |
| 通常CI | 全体test/lint/型/build、隔離実DB snapshot、保存公開/公開画面回帰。今回未実行 |
| Production公開4入口 | merge後の新SHA・Readyとreadonly GETを別確認。今回未実行 |

ローカル依存参照用junctionの作成はアクセス拒否となり、未作成を読み取り確認しました。後続のcaller試験は `tsx` を解決できず、試験本体に入る前にexit1でした。これはclient境界の負例ではありません。拒否操作を再試行せず、fixture・文書の準備と依存不要の静的照合を進めています。canonical checkoutのstatus読取もPermission deniedで未確認のまま保持し、そこへは変更していません。

## 配備範囲・限界

`vercel.json` は既存11件のfalseを保持し、今回の正確なbranch名だけfalseを追加します。mainの自動Production配備は抑止せず、承認されたmergeに伴う配備と手動deployを区別します。Dependabot有効化・設定変更・branch削除は含みません。

実Clerk/Blob・本番書込、接続pool/負荷、すでに開いた画面やオフラインへの自動反映は未検証です。大学回線のNeonには接続せず、実DB回帰は既存CIの使い捨て環境のみを使います。readonly HTTP成功は食品安全性や全利用者のcache反映を保証しません。
