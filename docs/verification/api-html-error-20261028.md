# HTML障害応答修復のmain向け限定採用

2026-10-28 UTC。[確認範囲](../guide/verification.md) · [変更対応表](../guide/change-map.md)

基準mainは `36e25ddb8b2b163dcbcc214555887083ef53b900`（PR #114採用後）。元[PR #101](https://github.com/Kaito-Iwase/ClearAllergy/pull/101)のHEADは `4b4b16985654a3a71386843d4353c6dc8b3f9ab0`。統合候補全体、UTC migration、追加ハーネス、F1/F4を取り込まず、必要差分だけを独立branchへ移します。

## 対応する差分

- `lib/utils/api-error-message.ts` は元PRと候補 `009f2992fec6bf7f5b0ecbf1ec21a30eff6beb0a` で同じblobです。HTML/XHTMLのmedia type、大小文字を問わない先頭タグ・doctype・コメントを既存の操作別fallbackへ戻します。JSONのerror/messageと通常テキストの既存扱いは維持します。
- `tests/api-error-message.test.ts` は候補009f299の4ケースを保持し、元PR以降のXHTML・不正JSON・JSON文字列内のタグ表記も含みます。
- `scripts/check-saved-publication-browser.mjs` は元PRのblobを保持します。HTML保存／公開エラーと入力保持に加え、先行候補が適用対象外にした**空白名・負価格は送信なし、0円と空価格は0/nullで区別**する独立ケースも今回採用します。ケースを削除・未採用扱いにして元PRを閉じません。
- 新branch `fix/html-error-main-20261028` の完全一致deployment falseを追加し、既存10件を保持します。

呼出元は新規・編集・一覧・画像アップロード・保存済み内容の取得です。操作文言、保存結果不明、入力保持、競合、公開条件、食品安全文言、認可、DB schema、依存は変更しません。README・AGENTS・product・rulesの仕様や手順も変わらないため更新不要です。既存F3とコミット／PR規約を保持します。

## 今回のローカル測定

Windows、Node 22.15.1 / npm 10.9.2。依存は同じlockfileを持つ既存worktreeの配置をjunctionで参照し、新規導入・Prisma再生成はしていません。全体unitのDB接続値には到達不能なloopbackの架空値だけを指定しました。

| 検証 | 結果 |
| --- | --- |
| 修正前helper＋追加4ケース | 1成功・3失敗、exit 1。HTML本文・JSON風HTML応答がfallbackにならない負例を実測 |
| 修正後helper＋同じ4ケース | 4/4成功、exit 0 |
| `npm test` | 260件中256成功・4失敗、exit 1。未変更の`agent-harness.test.ts`でhard link作成EPERMが1件、`next-root-glob.test.ts`でWindows隔離一時パス上の期待値不一致が3件。全体成功とは扱わず、権限迂回・再試行・範囲外修正なし |
| `npm run lint` / `npm run typecheck` | ともにexit 0 |
| build／保存公開browser | ローカル未実行。共有依存のPrisma生成物を書き換えず、最終HEADの通常CIで新規buildと既存browserを確認する |

ローカルruntimeはrepo指定のNode 22.23.4 / npm 11.18.0と異なります。Linux CIの成功はローカル4失敗の解消を意味しません。通常CI、実checkout SHA、artifact、名前／価格を含むbrowser結果は採用先PRに記録します。

## 採用と検証の境界

既存の独立レビュー回数上限を引き継ぎ、担当変更や置換PR作成でリセットしません。親が必要な追従差分確認を調整します。実Clerk・Blob・管理者操作・実データでの発生頻度・XSS成立は今回未検証です。公開4入口のGET確認を管理操作の検証に読み替えません。

ユーザーは必要差分の採用、通常CI、main mergeと伴うProduction自動再配備、採用済み元PRのcloseを承認しています。採用先がopenの間はmain未採用です。merged後のmain CI・実Production／skip・公開4入口確認を記録してから元PR #101を閉じます。DB migration、手動deploy、rollback、他のHOLD解除は含みません。
