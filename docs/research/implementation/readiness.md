# Research gates and implementation readiness

判定日2026-09-28。**PARTIALLY_READY**。研究・設計文書を完成させたことと、製品保証・実装・実配備の検証完了は別。

後続runのI01は[局所実装・検証結果](i01-result.md)、I02は[局所実装・API検証結果](i02-result.md)を参照。I02の専用DB回帰は2026-09-30のRUN05で18項目PASS。実Clerk・配備は未確認。この文書のfreeze/実行記録は研究run時点に限定する。残るIssueを含む全体判定はPARTIALLY_READYのまま。

| Gate | Result | Evidence / condition |
| --- | --- | --- |
| G1 Research protocol | PASS | RQ、E1–E7、初期仮定とcritical unknown、machine/human境界を00-protocol/02-registerに定義 |
| G2 Evidence | PASS within declared scope | 重大claimのrepository/外部source、counter evidence、反証方法をregisterへ記録。UX/provider/runtimeのunknownを閉じたという意味ではない |
| G3 Safety/requirements | PASS as proposed specification | Loss/Hazard/SC/requirement/INVを接続、machine/human/both/currently unverifiableを分類。未承認product policyはhuman queueへ |
| G4 Architecture | PASS as recommendation | Criteria先行、current含む4案、adversarial KEEP/MODIFY/REJECT/OPEN。ADR-001はRECOMMENDED |
| G5 Detailed design | PARTIAL | I01/I02はcode owner/behavior/test/API/tx/rollbackまで具体化。I03/05/06/10/11/12は契約・spike・承認待ち |
| G6 Implementation | PARTIAL | I01/I02は追加architecture researchなしにRED設計へ進める。研究Issue I04/07/08/09は着手可能。全critical issuesの保証は未完成 |

## Verification-first handoff

- TDD_REQUIRED: I01/I02（READY）、I03/I05/I06/I12（BLOCKED）、I10の削除/認可branch（BLOCKED）。
- TDD_RECOMMENDED: I11で空状態pageの動作変更を選んだ場合（BLOCKED）。数合わせの独立Issueは作らない。
- TDD_OPTIONAL: I09文書/evidence、I11 docs-only branch、I10 public-only説明branch。
- TDD_NOT_APPROPRIATE: I04環境測定/鮮度の製品判断、I07理解度/A11Y manual、I08運用訓練。理由・代替・残存riskは各Issueに記録。
- Non-automated verification: UX01/A11Y01、OPS01、REL01配備証跡、実Clerk/Blob確認。CI成功で代替しない。
- Missing capability/evidence: 現review revision/basisがないため確認現在性のtest対象未実装、配備cache/停止反映の時間系列計測未実施、実provider fixture/target未確定、DB constraints適用実体未確認、参加者/合意rubric未確保、incident/restore測定未実施。

**First implementation issue: I01。** H01のnegative projectionに直接対応し、EX01という反証があり、schema/外部設定に依存せずpublic表示まで追跡できる。単純さだけで選んでいない。I02を次に、I04/I07/I09で未決領域の学習を進め、I03以降を承認条件が整った順に縦の経路で移行する。

## Current verification record

| Verification | Actual result | Limit |
| --- | --- | --- |
| npm.cmd test | PASS、124件/0fail/0skip、25files、約27.95秒 | 既存test。実DB/provider/cache/humanの証明ではない |
| npm.cmd audit --ignore-scripts --audit-level=high --json | 再実行PASS、known vulnerabilities 0、696 dependencies | 初回network失敗。読取のみ、時点依存、設定/未知脆弱性を保証しない |
| EX01 existing pure helpers | 未知stringでpublishable=true/effectiveRisk=FREEを観察 | 合成入力、通常API/SQL enumは遮断。production到達性未実証 |
| Documentation links / ID cross-reference | PASS、39 Markdown文書の相対リンク321件は全対象存在。16requirements/14invariants/12issuesのmatrix対応を照合 | HTTP sourceの永久可用性・意味的完全性は別。Mermaidはsourceを確認、描画未検証 |
| Production/test/schema freeze | PASS、baseline264ファイルとSHA-256比較。変更はREADME/change-map/.gitignoreの予定3件だけ、欠損/研究外追加なし | 3ファイルも今回の追加を除くと元hashと一致。開始前からのdirty変更を保持 |
| lint/typecheck/build | NOT RUN | docs-only。buildはPrisma生成も伴う |
| real DB / browser / provider / restore / comprehension | UNVERIFIED | 接続先・権限・実施scope・人の参加/判断が必要 |

実行環境Node22.15.1はrepository指定22.23.1と異なる。RUN01の成立範囲を固定し、指定runtimeのCI/production同等証拠としない。

`git diff --check`はexit0。GitのLF→CRLF予告は既存working treeにも多数あり、内容エラーではない。新規researchはuntrackedのため別途UTF-8・末尾空白・リンク・ID対応を検査し、すべてPASS。READMEとchange-mapは研究入口の追加、.gitignoreはresearch例外2行だけと元hashから確認した。その他guide/AGENTSはルールや実挙動を変更しないため更新不要。HD-08不一致は製品判断まで本文を書き換えない。

## Closure boundary

Production code/test code/schema/migrationを変更せず、GitHub Issue/commit/push/deployを行わず停止する。変更文書はresearch一式、README入口、guide/change-map入口、研究文書をGit追跡対象へ含める.gitignore例外のみ。既存guide本文の不一致はHD-08へ残す。

実装後にEvidence registerへE5/E6を追加し、該当Claimを再判定する。RED/GREEN結果・higher-level run・remaining riskがないままsafety caseを強めない。
