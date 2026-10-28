# F3: 公開読取4入口の transaction client 回帰

以下はPR #111作成時の実装・測定記録です。後続mainへの追従、文書同期、採用とProductionの状態は[検証・採用状況](../guide/verification.md#adoption-status)と[PR #111](https://github.com/Kaito-Iwase/ClearAllergy/pull/111)の対象SHA別の結果を参照してください。「今回」「行わない」「README/AGENTSは編集しない」も作成時点の範囲を表し、後続の承認・実績は上書きしません。

基準は main `e09b29c4b272623f41904e81c7842650412f43a1`（snapshot pilot #109 統合後）。branch は `test/public-caller-transactions-20261028`。Refs #100。候補全体・PR #96/#105/#110 は取り込まず、製品コード・公開条件・schema・依存・CI workflow は変更しない。

## 検査対象と既存検査との差

`tests/public-menu-api.test.ts` の既存 fixture は transaction callback に元の `prisma` を渡すため、実 caller が同じ client に戻る誤りを区別できない。既存の公開条件・DTO・障害契約の検査は保持し、`tests/public-read-callers.test.ts` に client の分離だけを追加する。

| 実行入口 | 実 caller | 同じ transaction 内の読取 |
| --- | --- | --- |
| `app/(public)/shops/page.tsx` | `PublicShopListPage` | `shop.findMany`、`allergen.findMany` |
| `app/(public)/shops/[shopId]/page.tsx` | `PublicShopDetailPage` | `shop.findFirst`、`allergen.findMany` |
| `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx` | `PublicMenuDetailPage` | `menuItem.findFirst`、`allergen.findMany`、補足の `menuItem.findMany` |
| `app/api/menus/[menuId]/route.ts` の `GET` | `publicMenuRoute`（observability wrapper を含む） | `menuItem.findFirst`、`allergen.findMany`、補足の `menuItem.findMany` |

実 route export を呼び、実 `readPublicSnapshot`・公開判定・店舗内補足を通す。DB の境界だけを代用品にし、元の Prisma client の読取5メソッドを例外にする。transaction callback には別オブジェクトを渡し、RepeatableRead、1要求につき1 transaction、各読取の回数と transaction 完了前の呼出を確認する。各入口を2回呼び、2回目も新しい transaction が必要であることを確認する。成功応答の fixture データを検査し、メニュー詳細とAPIでは元の FREE と補足 STORE_HANDLED が両方到達することも確認する。

ページは Server Component 関数の返す React 要素・client props を検査する。実ブラウザ描画、Next HTTP server、実 SQL の並行更新・分離性を実測する検査ではない。実 SQL の割込みは既存 `scripts/check-public-read-snapshot.ts`（#109）を利用し、helper の例外分類は既存 `tests/public-read-snapshot.test.ts` に残す。

## 再現方法と負例

生成済み Prisma Client と lockfile 通りの依存が必要。実サービスの環境ファイル・DB は不要。

```powershell
node --import tsx --test tests/public-read-callers.test.ts
node scripts/check-public-caller-mutations.mjs
```

mutation command はOSの一時ディレクトリへ必要なソースだけを複製し、依存ディレクトリへのlinkを作る。元 checkout の製品コードは書き換えない。コピー上で上表の10読取境界を1か所ずつ `tx` から元の `prisma` に変更し、該当入口だけを別プロセスで試験する。各置換は1か所に一致する必要があり、終了1・該当テスト1件の失敗・固定診断 `ROOT_CLIENT_READ` のすべてを要求する。APIの例外は製品コードが500へ変換するため、固定診断はテスト側で記録する。構文エラーや未導入依存による失敗を検出成功と数えない。

変更前と全変更復元後の4入口が終了0であることも要求する。DB URL は接続不能な架空loopbackへ上書きし、通常終了・例外時とも自分の一時コピーを削除する。Windows sandbox ではjunctionの作成がEPERMになり得る。この実行環境では通常ホストの承認済み実行で測定した。検査は `npm test` / 通常CIの既存 Test step に自動で含まれ、mutation command 自体のCI stepは追加していない。

## 今回の結果

- Windows / Node 22.15.1 / npm 10.9.2 / Prisma 6.19.3。repo指定Node 22.23.4 / CI npm 11.18.0との差はCIで別途確認する。
- PASS: lockfile通りの隔離 `npm.cmd ci --ignore-scripts --no-audit --no-fund`、`npm.cmd run prebuild`（Prisma Client生成）。Prisma 403なし。実DBへの接続・migrationなし。
- PASS: caller正例4/4（8要求）。負例10/10で終了1・固定診断・対象1件の失敗を確認し、復元後4/4成功。[測定JSON](public-read-callers-20261028.json) にNode版・ソースSHA256・各負例の終了状態を保存する。
- PASS: 通常ホストで `npm.cmd test` 256/256、`npm.cmd run lint`、`npm.cmd run typecheck`、`npm.cmd run build`（Next 16.4.1 / Turbopack、prebuildを含む）。buildは架空Clerkキーと接続不能なloopback DB URLを明示し、公開3ページはdynamicとして出力された。
- sandbox内の全体試験は再現確認でも252成功・4失敗。既存 `agent-harness.test.ts` のlink作成EPERMが1件、`next-root-glob.test.ts` のsandbox固有の `{...}` を含む絶対一時パスに対する探索/内部リンク検知が3件。今回のcaller単独試験はsandbox内でも4/4成功。既存検査をskip・変更せず、上記の通常ホスト実行と区別する。
- GitHub CIの結果・checkout SHA・artifact はPRのEvidence欄で対象HEADと結び付ける。ここに過去のCI成功を今回の成功として転記しない。

## push と残る境界

push前に `vercel.json` の既存7個のfalseを保持し、今回のbranch完全一致だけをfalseへ追加した。公式の [git.deploymentEnabled](https://vercel.com/docs/project-configuration/git-configuration) と照合し、trueの競合patternがないことを検査する。Vercel UIで対象repo `Kaito-Iwase/ClearAllergy` の連携、Root Directoryが空、Build/Install/Outputのoverrideなし、Deploy Hooksなしを読取確認した。GitHub workflowにdeploy stepがないことも照合した。Vercel設定の保存、Preview要求、main merge、本番配備は行わない。

実callerの分岐全体、実DB分離性、全閲覧者への訂正到達、実認証や外部サービスをこの回帰だけで保証しない。独立レビューは親の調整対象で、自己レビューと区別する。既存HOLDとreview上限は維持する。

現行mainには `.agents/skills` が存在しない。AGENTS.md・関連guide・既存実装を照合し、このテスト追加で作業規則や製品仕様は変わらないためREADME/AGENTSは編集しない。
