# I02 実装・検証結果（2026-09-30追検証 / 2026-09-28実装）

**Status: LOCAL_IMPLEMENTED / local commit `03d39d4`（実DB回帰定義は`242a0c9`）/ 2026-09-30 LOCAL_DB_VERIFIED / 追検証差分は未コミット・未push。** 追跡先は [GitHub Issue #38](https://github.com/Kaito-Iwase/ClearAllergy/issues/38)。この結果は既存の他店舗拒否に加え、事前取得後に対象メニューの所属店舗が変わる場合の最終書き込み条件を扱う。owner権限そのものの同時取消や実Clerkでの認可完了を主張しない。

## 2026-09-30 追検証（RUN05）

既存実装`03d39d4`、DB回帰定義`242a0c9`をレビューし、最終writeの所有店舗条件を維持した。Docker Desktopは通常の`docker desktop start`で復旧し、Linuxエンジン29.6.1に接続できた。OS再起動、WSL/Docker強制終了、既存作業停止、特権設定変更、新規インストールはしていない。

今回専用の`clearallergy-issues-37-38-db-20260930`をキャッシュ済み`postgres:17-bookworm`から起動した。既存volumeは再利用せず、接続は127.0.0.1:65432の`clearallergy_ci`。既存CIガードで両URLと架空専用user/DB/有効化フラグを検査し、`scripts/setup-ci-env.ts`で既存16 migrationと架空1店舗3メニューを準備した。通常seed・開発Clerk初期化・Blobは呼ばない。既存の専用Compose環境を上書きしていない。

既存のDB操作単体試験に加え、[実ハンドラDB回帰](../../../scripts/admin-menu-database-regression.ts)を[共通DB回帰](../../../scripts/database-regression.ts)から実行する。ClerkセッションとNext cacheだけをテストプロセス内で置き換え、User/Shop認可照会・PUT/DELETE・監査・transactionは実PostgreSQLを使う。別clientが事前read直後に移転または削除をcommitしてから要求を続行する、sleepに依存しない順序である。

- 移転後PUT/DELETE、対象消失後PUT/DELETEは実`P2025`を経て既存404本文となる。A/B両店舗の全menu fields（日時・公開状態を含む）と全linksを比較し不変。DELETEは実リンク削除の後に失敗して巻き戻り、成功監査・cache無効化を残さない。
- 通常の自店舗PUT/DELETEは200と既存DTOを維持し、fields・links・成功監査・cache無効化を確認。
- テストプロセス内だけで最終update/deleteのshop条件を外したmutation probeは、両方とも実HTTP200対期待404の意味上のRED（各exit1）。製品コードを旧版へ戻した実行ではなく、条件を外した場合の感度確認として区別する。
- 既存実装の固定監査理由`menu_not_found`が共通サニタイズで落ちることを発見。`tests/observability.test.ts`のREDは9件中1件が期待理由対空objectで失敗。`lib/observability.ts`の許可リストへ固定値1件だけを追加し、GREEN9/9と実DBの保存理由を確認した。任意の秘密文字列は引き続き除去する。

| 今回のコマンド | 結果 |
| --- | --- |
| `node --import tsx scripts/setup-ci-env.ts` | guard通過、既存16 migration適用、架空fixture作成 |
| `node --import tsx scripts/check-ci-database.ts` | 18 PASS、exit0。既存13項目＋実ハンドラ5組 |
| `npm.cmd test` | 133/133 PASS、fail/skip 0 |
| `npm.cmd run lint` / `npm.cmd run typecheck` / `npm.cmd run build` | すべてexit0 |
| `git diff --check`（今回差分と既存7コミット） | PASS |

実行前に`DATABASE_URL`と`DIRECT_URL`を同じ今回専用URLへ、`CLEARALLERGY_CI_FIXTURES=true`をプロセス内だけで指定した。buildはCIの非実在Clerkキーと隔離DBを指定し、通常環境の設定ファイルは変更しない。Node22.15.1/npm10.9.2で実行し、repo基準22.23.1/11.18.0との差は未解消。実Clerk/Blob、browser、GitHub CI、配備、owner/isActive取消race、lost updateはUNVERIFIEDまたは別Issue。ローカル実DB受入条件の達成を、実provider・公開運用の保証へ広げない。

実行後のDBは架空fixtureのUser1 / Shop1 / Menu3 / Allergen29のみで、AuditLog・AdminInviteと今回の一時fixturesは0件。今回作成したDBコンテナは検証後に通常停止して保持し、既存Docker/WSLプロセスは止めない。HEADは`f1f209c`のまま、今回差分は未コミット。push・PR公開・merge・deploy・schema変更・新migration作成・公開文言変更はしていない。

## 2026-09-28 変更と理由

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

2026-09-28は実DB回帰の**定義追加だけでPASSではなく**、Issue #38の実DB受け入れ条件は未達だった。2026-09-30の隔離PostgreSQL結果は上記RUN05に記録した。共有・本番DBへ代替実行しない。ブラウザの実Clerk操作、owner/isActive自体の変更race、配備先は未確認。

## 追跡と残存リスク

対応は R04/R05、H03、SEC-OWN-001/AR-BOUND-001、INV03/INV14、D02/T09。今回の観察をRUN04として [Evidence Register](../03-evidence-register.md) に、現在の部分的な保証を [Traceability Matrix](../traceability-matrix.md) に記録した。研究時点のid-only write観察は履歴として保持し、修正後のコードと混同しない。

この変更は、read後に同じmenuが別店舗へ移る場合の最終書き込みを限定する。古いフォームによるlost update、店舗owner取消の即時性、DB外サービスの補償、実配備経路は別の問題。局所コードは戻せるが、戻すと最終write条件が弱まるため、公開運用中のロールバック判断は認可上の残存リスクを明示して行う。
