# Issue #37: 未知アレルゲン状態の表示・公開境界

[Issue #37](https://github.com/Kaito-Iwase/ClearAllergy/issues/37)の2026-10-04 JSTのfresh検証記録。base main `27d3e96c166f21433a37f2d6b587eb6094482095`、branch `agent/issue-37-unknown-allergens`。Autonomous Harness #58の実証用に、未公開local切り出し`fd5028d`の限定差分を新worktreeで再評価した。以前のcheckout/worktreeは変更していない。

## Problem → Evidence → Cause → Decision

mainの状態castとdefault fallbackは、未認識文字列をUNKNOWNにせず、公開を許しFREE側の表示へ通す反例がある。通常のAPI validationとSQL enumは別の防御であり、enum外の値が実DBに保存できる証拠ではない。

入口だけの正規化と、入口・公開判定・表示fallbackの修復を比較し、後者を採用した。`createStatusBySlug`/display rowsは有効4状態だけを認識し、invalid/空/null/undefined/欠損はUNKNOWN。FREE/STORE_HANDLEDは明示FREEからのみ導出。label/badge/注意表示と公開判定にもUNKNOWN側のfallbackを適用した。

影響範囲は管理・公開が共有する`lib/allergens.ts`と呼出先。編集は同helper、対象3テスト、READMEの参照とこの記録のみ。API入力validation、認証/認可、schema/migration、既存の正常状態文言・色・公開URL/DTO・依存は維持。状態の意味や医学保証を追加しない。risk-high、auto merge対象外。

## Verification

| 今回の実行 | 結果 |
| --- | --- |
| main + 新回帰、対象3ファイル | RED 28件中4 FAIL。型/環境エラーではなくUNKNOWN/公開拒否/404の意味上の失敗 |
| helper修復後、同対象 | GREEN 28/28、fail0/skip0 |
| 独立read-only reviewerの対象実行 | 28/28、blocking指摘なし |
| Harness runnerのPrisma generate/validate | PASS（DB書込なし） |
| runner内のlint / typecheck | PASS |
| runner内の`npm run test` | 62/62、fail0/skip0 |
| runner内の`npm run build`（prebuild含む） | PASS |
| diff/check・文書/参照・scope | PR公開前に照合 |

実行コマンドは対象`node --import tsx --test tests/allergen-display.test.ts tests/menu-publication.test.ts tests/public-menu-api.test.ts`と、#58 worktreeの`node scripts/agent-harness.mjs verify --base origin/main --output issue37-initial.json`をこのIssue worktreeから実行。後者はPrisma CLIとpackage scriptsを検出し、secretを引き継がず、到達不能localhost DBと非実在Clerkキーで検証した。reportのcandidate前後hashは同一。アプリ差分はその後変更しておらず、この記録とREADME参照を追加した。reportはローカル実行証拠でGitHub成功の代用にしない。

ホストNode22.15.1は指定22.23.1と異なる。依存は既存lockどおり、local npm11.18.0/Prisma6.19.3。lock SHA256 `3bf7ffe3aa9117734a634ab523810cb29b204a6152791c8c915fd2a24f670170`。mainの56件と今回の62件、canonical branchの過去件数は混同していない。

## Review / Remaining gates

read-only独立reviewerへbase/diff/Issue/Invariantを渡し、実装履歴を共有せずレビューした。正常4状態、STORE_HANDLED、不正入力404、既存認可/schema維持にblocking指摘なし。self reviewも差分・呼出先・testを照合した。

最終HEADのGitHub CI（指定runtime/fictional DB/public browser）はPRで別に確認する。実PostgreSQL制約/race、実Clerk/Blob、利用者の理解、配備、本番適用状態はこのローカル試験ではUNVERIFIED。UI配置や正常表示を変えていないため、新しいブラウザ操作試験は追加せず、既存CIの公開回帰を確認する。schema変更がないためmigration作成/適用も行わない。

mainにguide/researchが存在しないため本記録で今回の規則・構造・証拠を限定して説明し、未公開研究文書を必要参照にしない。rollbackは局所差分の取消だが未知値がFREE側へ流れる回帰を戻すため、安全性の判断を伴う。PR作成はIssue close/merge/deployではない。
