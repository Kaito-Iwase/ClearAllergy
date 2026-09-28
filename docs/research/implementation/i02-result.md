# I02 実装・検証結果（2026-09-28）

**Status: LOCAL_IMPLEMENTED / local commit `03d39d4`（実DB回帰定義は`242a0c9`）/ 専用DB検証未実行 / 未push。** 追跡先は [GitHub Issue #38](https://github.com/Kaito-Iwase/ClearAllergy/issues/38)。この結果は既存の他店舗拒否に加え、事前取得後に対象メニューの所属店舗が変わる場合の最終書き込み条件を扱う。owner権限そのものの同時取消や実Clerkでの認可完了を主張しない。

## 変更と理由

- [adminMenuRoute.ts](../../../features/admin/menus/server/adminMenuRoute.ts) のPUT/DELETEで、トランザクション内の `menuItem.update` / `menuItem.delete` を `id + server解決shopId` で限定した。一致しないときのPrisma `P2025` は既存の `404 { error: "menu not found" }` へ対応させる。DELETEのリンク削除と本体削除は従来どおり同じトランザクションで、後者が失敗すれば前者も巻き戻る。
- [管理APIテスト](../../../tests/admin-menu-api.test.ts) に、事前read後の店舗移動を模擬するPUT/DELETEの回帰と、通常の自店舗DELETEの成功形を追加した。既存の公開メニューPUTテストでも最終 `where` を検査する。
- [専用DB回帰](../../../scripts/database-regression.ts) に、架空の一時店舗で事前read→所属変更→条件付き更新/削除を行い、`P2025`、menu/link不変、トランザクション巻戻しを検査する組を追加した。接続ガードと一時fixtureの後片付けは既存入口を使う。schema・migration・API形状・UI・依存関係は変更していない。

| 検証 | 今回の結果 | 限界 |
| --- | --- | --- |
| T09 RED | 対象API 12件中10件成功・2件失敗。追加PUT/DELETEは期待404に対し現行200 | 状態付きDB mockによる意味のある反例。実PostgreSQLではない |
| T09 GREEN | 同じ対象12/12件成功。通常DELETEを追加した最終対象13/13件成功 | API response、条件付きwhere、mock transaction巻戻し |
| 全テスト | `npm.cmd test` 131/131件成功、失敗・skip 0 | DB/Clerkはmock |
| 静的検査 | `npm.cmd run lint`、`npm.cmd run typecheck` 成功 | 実行時DB競合の証拠ではない |
| Build | `npm.cmd run build` 成功 | Prisma Client生成とNext.js 16.3.4 build。公開店舗一覧にDB fallbackログが出た |
| 専用DB | **UNVERIFIED** | Docker Desktopを起動したがLinuxエンジンに接続できず、`scripts/check-test-database.ts` は実行していない |

実DB回帰の**定義が追加されたことと、PASSしたことは別**。CIまたは接続ガード付き専用PostgreSQLで `scripts/check-ci-database.ts` / `scripts/check-test-database.ts` を実行し、追加2組のPASSと既存DB制約のPASSを確認するまで、Issue #38の実DB受け入れ条件は未達。共有・本番DBへ代替実行しない。ブラウザの実Clerk操作、owner/isActive自体の変更race、配備先は未確認。

## 追跡と残存リスク

対応は R04/R05、H03、SEC-OWN-001/AR-BOUND-001、INV03/INV14、D02/T09。今回の観察をRUN04として [Evidence Register](../03-evidence-register.md) に、現在の部分的な保証を [Traceability Matrix](../traceability-matrix.md) に記録した。研究時点のid-only write観察は履歴として保持し、修正後のコードと混同しない。

この変更は、read後に同じmenuが別店舗へ移る場合の最終書き込みを限定する。古いフォームによるlost update、店舗owner取消の即時性、DB外サービスの補償、実配備経路は別の問題。局所コードは戻せるが、戻すと最終write条件が弱まるため、公開運用中のロールバック判断は認可上の残存リスクを明示して行う。
