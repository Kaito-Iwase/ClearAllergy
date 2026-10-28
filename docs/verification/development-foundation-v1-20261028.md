# 開発基盤v1：今回の合意条件と到達範囲

2026-10-28。README/AGENTS/guideと既存harness/CI証跡を有限に照合した。正式な「v1完成条件」原本はこのcheckoutで特定できなかったため、探索を理由に停止せず、2026-10-28の本人指示に基づく以下の合意条件を作業上の基準とする。原本を発見した場合は相違を明示し、過去結果を上書きしない。

1. 目的・architecture・起動・test・変更方法を既存入口から追え、main/候補と検証対象SHAを区別する。
2. 選択成功と受入充足を分離し、未知/欠落/別SHAで完了せず、正常小変更を不要に止めない（F1）。
3. 必須CI設定と実際の成功を区別する（F2）。設定変更は別担当の承認範囲。
4. 公開4入口の実callerが正しいtransaction clientを使う回帰を確認する（F3、別担当）。
5. 少数の同条件Context EvalsでSTOPだけでなく承認済み小変更の必要検査・成果物までを測り、全試行/分母/限界を残す（F4）。
6. 日付・SHA・設計判断・review上限・検証済/未確認を整合させ、候補全体の採用や本番許可を自動付与しない。

## 固定した現状

| 対象 | 到達/根拠 | 維持する境界 |
| --- | --- | --- |
| main | `e09b29c4b272623f41904e81c7842650412f43a1`。#109のsnapshot独立stepを採用済み | 候補の追加harness/UTC等を採用した状態ではない |
| 統合候補 | `codex/combined-validation-20261026` / `72d7bd8e190c66f31b39c994ea995d552f22cb68` | 固定cda3fefからの後続は証跡MDだけ。全体HOLD・未採用機能を維持 |
| F1 | [PR #110](https://github.com/Kaito-Iwase/ClearAllergy/pull/110)、head `8fcd810e98ac5cead1786449b503631decd100bd`。CI [40632251353](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/40632251353)、workflow_dispatch/attempt1、実checkout同SHA、294/294 PASS、lint/typecheck/build/既存DB/browser成功。セルフ1＋親側独立1、blocking0 | F1差分技術PASS。PR未merge、main/候補全体の採用や既存HOLD解除ではない |
| F2 | ruleset `26009324`、親/本人によるPASS確定を受領 | この作業は設定を変更しない。CI成功だけで設定を証明したとは言わない |
| F3 | 親が現行mainから独立担当へ割当済み | 局所証跡・最終SHA/CIは受領待ち。合成snapshot callbackだけで4実callerを保証しない |
| F4 | [固定した評価手順](context-evals-20261028.md)と採点器controlを準備 | 実agent試行は別記。Skills要因未評価。fixture成功を実製品完遂にしない |

F4はF1 headからのstacked branch/候補向けDraft PRとし、F1 headを変更しない。F3はmain基点なので、F3の実装をこのbranchへ自動統合しない。共有guide/台帳は親からF3の局所証跡を受領してから整合する。

## 残る条件と依存

F1/F2のPASSからv1全体を完了にしない。F3はactual callerのtx利用と旧clientへ戻した負例、F4は実行主体を伴う全trialと正常完遂、文書はこれらの対象SHA/CI/保証範囲の整合が必要。F1の受入対応の意味やhuman permissionは機械証明ではない。

既存の[有限再開手順](ci-evidence-paths-20261025.md)どおり、通常CIとP0の`phase`/`summarize`全経路・`.agent-runs`の保存は別。候補workflowにはmain #109のsnapshot stepを自動移植しない。古い広いP1差分を一括採用しない。[追加harnessの境界](harness-context-main-20261025.md)にある#105の最終人間レビュー待ちと既存review上限、[追加UI観測](public-ui-error-observation-20261025.md)の403未達記録も維持する。既存CI browserの成功で追加UI/P0全phaseの未確認を消さない。

目的/architecture/起動の意味や製品codeは変更しないため、product/rules/architectureと図の全面改稿は不要。AGENTSの基本scope・認可・検証・review規則も維持する。READMEはこの台帳への入口、developmentは実在する有限evalコマンド、verificationは実施/未確認の入口を更新する。未確認の実Clerk/Blob/本番・食品の真実を、v1の技術CIで確認済みにしない。
