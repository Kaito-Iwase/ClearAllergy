# I01 実装・検証結果（2026-09-30追検証 / 2026-09-28実装）

**Status: LOCAL_IMPLEMENTED / local commit `111817e` / 未push。** [I01仕様](backlog.md) のうち、未知状態を否定情報や公開可能な状態に進めない局所的な防御を実装した。追跡先は [GitHub Issue #37](https://github.com/Kaito-Iwase/ClearAllergy/issues/37)。これは実環境での食品情報の正確性や利用者の理解を保証する結果ではない。

## 2026-09-30 追検証（RUN05）

開始時は正規Windows作業先、`improve/prototype-usability-ci`、HEAD `f1f209c`、未コミット差分なし。remoteの同名branchは`64163cc`で、既存7コミットは未push。`111817e`を再実装せず、null・空・undefined・リンク欠損の公開API 404と表示、全有効4状態の公開条件を既存テストで補強した。アレルゲンの意味・公開文言・UI・schema・依存の変更はない。

対象4ファイルの初回再実行は40/40件成功。補強後の`npm.cmd test`は133/133件成功（fail/skip 0）、`npm.cmd run lint`・`npm.cmd run typecheck`・`npm.cmd run build`も成功。buildは[I02と同じ隔離DB](i02-result.md)とCIの非実在Clerkキーをプロセス内で指定した。Node.jsは22.15.1、npmは10.9.2で、repo基準22.23.1/11.18.0との差がある。インストールや基準変更はしていない。

実PostgreSQLでは既存公開制約・欠損・UNKNOWN・リンク置換・巻戻しも確認したが、enum外の不正値を保存できるとは主張しない。不正値の表示/API試験はDB-likeの合成入力。実ブラウザ・Clerk/Blob・GitHub CI・配備・理解度は引き続きUNVERIFIED。今回の差分は未コミット・未push。

## 2026-09-28 対象と結果

- [lib/allergens.ts](../../../lib/allergens.ts) で有効な4状態だけを明示的に認識し、DB由来などの不正値、空文字、`null` を表示・公開判定の入口で `UNKNOWN` として扱う。`FREE` の表示・`STORE_HANDLED` の補足は明示的な `FREE` に限定する。外部入力の `validateAllergenStatusMap` は従来どおり不正値を拒否する。
- [tests/menu-publication.test.ts](../../../tests/menu-publication.test.ts) は不正値・空文字・`null` の非公開と、直接渡した不正なstatus mapの拒否を確認する。[tests/allergen-display.test.ts](../../../tests/allergen-display.test.ts) は表示・実効リスク・注意表示が `UNKNOWN` 側へ倒れることを確認する。[tests/public-menu-api.test.ts](../../../tests/public-menu-api.test.ts) は不正なDB-like状態を持つメニューがHTTP 404になることを確認する。
- スキーマ、migration、APIのJSON形状、公開文言、UI配置、依存パッケージは変更していない。既存の有効4状態と通常の公開条件は回帰テストで保持した。

| Gate | 実行結果 | 何を確認したか |
| --- | --- | --- |
| RED | 対象3ファイルで27件中23件成功・4件失敗 | 不正値が `FREE` / 公開可能 / HTTP 200へ進む既存挙動を意味のある失敗として観測。compile・mock準備エラーではない |
| GREEN | 同じ対象3ファイルで27/27件成功 | 正規化・非公開・HTTP 404と既存状態の回帰 |
| 全テスト | `npm.cmd test` 128/128件成功、失敗・skip 0 | リポジトリのローカル自動テスト |
| 静的検査 | `npm.cmd run lint`、`npm.cmd run typecheck` とも成功 | lint・TypeScript整合 |
| Build | `npm.cmd run build` 成功 | Prisma Client生成とNext.js production build。初回はGoogle Fonts取得不能で失敗し、ネットワーク接続を許可した同一コマンドの再実行で成功 |

Build中、公開店舗一覧の生成でDB fallbackログが1件出た。build成功を実DB接続、公開画面の鮮度、認証・Blob、ブラウザ表示の検証と解釈しない。2026-09-28時点では専用DB試験、実Clerk/Blob、ブラウザ、支援技術による確認、ユーザー理解度実験は**UNVERIFIED**。専用DBの後続確認は上記RUN05へ分離する。SQL enum外の値が通常のDB書込で保存可能だと示したものでもない。今回のテストは、異常値がアプリ境界に到達した場合の防御を検証する。

## 追跡と残存リスク

RUN03（この記録）を [Evidence Register](../03-evidence-register.md) に、I01の状態を [Traceability Matrix](../traceability-matrix.md) に反映した。対象は H01/H02、SR-SEM-001/SR-PUB-001、INV01/INV02/INV14、D01/T01。研究時点のEX01は修正前の再現結果として保持し、現在の実装状態とは区別する。

残存リスクは、店舗が誤った原材料情報を正規状態として登録すること、情報の古さ、厨房の交差接触、利用者が表示を誤解すること、および実配備経路の未検証。今回の変更はこれらを解決しない。ロールバックは局所差分の取り消しで可能だが、未知状態が否定表示へ流れる回帰を再導入するため、公開運用中の単純な巻き戻しは安全判断を要する。

関連する現行説明は [共通ルール](../../guide/rules.md#allergens)、[アーキテクチャ](../../guide/architecture.md)、[検証記録](../../guide/verification.md) を参照する。研究から残る製品判断・実環境の未確認は [Open Questions](../open-questions.md) に残す。
