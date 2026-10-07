# ClearAllergy evidence-driven research

2026-09-28 / working tree `improve/prototype-usability-ci` / HEAD `64163cc` + 調査開始前からの未コミット変更。**判定: PARTIALLY_READY**。Production code・test code・schemaは変更していない。GitHub Issue作成・commit・pushは未実施。

後続の実装runでI01とI02をローカル修正し、[GitHub Issue #37](https://github.com/Kaito-Iwase/ClearAllergy/issues/37)と[GitHub Issue #38](https://github.com/Kaito-Iwase/ClearAllergy/issues/38)を起票した。2026-09-28の整理でI01を`111817e`、I02を`03d39d4`、関連するDB/CI回帰定義を`242a0c9`にlocal commitした。I03–I12とHD-01–HD-09もGitHub Issueへ起票済み。pushは未実施。2026-09-30にI01の境界ケースを補強し、I02の隔離PostgreSQL・実ハンドラ回帰18項目を確認した。追検証差分は未コミット。[I01結果](implementation/i01-result.md)と[I02結果](implementation/i02-result.md)を参照。上のfreezeと以下のExecutive Summaryは**研究run時点の記録**であり、後続のコード状態を説明する文ではない。全体の設計判定PARTIALLY_READYは継続。

本書は研究/設計案の入口。現行仕様は [guide/rules](../guide/rules.md)、[変更対応表](../guide/change-map.md)。ここでRECOMMENDED/OPENとした設計を現行仕様へ昇格しない。[Gate判定と検証結果](implementation/readiness.md) / [Issue台帳](implementation/backlog.md) / [提案Milestone](implementation/migration-plan.md#proposed-milestones) / [Traceability](traceability-matrix.md) / [人の判断待ち](open-questions.md)。

## Executive summary

1. **System boundary:** README/共通注意による現行scopeは架空データを用いるUI prototype。登録・公開情報の処理を調査し、食品の真実性、厨房の交差接触、摂取可否、医療判断は保証しない。missionの実サービス像との差をR01として記録。
2. **最重要loss/hazard:** L01は誤認した飲食判断への寄与、L02は不要な回避/機会損失、L03は権限/情報侵害、L04は影響長期化。H01未知値のnegative化、H04重要変更の上書き、H05古い根拠、H06古い表示、H07正しいdataでも誤解するUIを重点化。発生確率は未測定。
3. **現在確認できた重大risk:** EX01で未知statusがpublishable=true/effectiveRisk=FREEへ進む局所反例を再現。通常のAPI enum/SQL enumは遮断するためproduction incidentではない。最終writeのid-only条件、全status置換、根拠/revision欠如、public Blob設定は静的に確認した。実並行/外部障害の再現は未実施。
4. **否定された初期仮説:** 公開flagだけで公開、MAY設定offで安心表示、全ruleがUIだけ、transactionなし、全外部地図API撤去、60秒で必ず最新、という仮説はいずれも実コード/公式資料に合わない。大規模rewriteの必要性は支持されなかった。
5. **Remaining unknown:** deployed SHA/config、実DB trigger/index、実Clerkのemail verification、Blob実配信、ISRの実時間、alert/restore、人の理解、店舗入力負担。コード証拠だけで閉じない。
6. **Product decisions:** HD-01～09に使用目的、競合contract、再確認/履歴、incident権限、鮮度、verified email、画像機密性、0menu表示、commit後の応答意味を列挙。9件ともHUMAN_DECISION_REQUIRED。
7. **主要safety requirements:** SR-SEM-001不正値を否定へしない、SR-PUB-001完全性/active条件、SR-REV-001確認を変更revisionへ結ぶ候補、SR-FRESH-001鮮度の主張と測定。UX/認可/運用を別requirementとして接続。
8. **主要invariants:** INV01明示FREEだけnegative、INV02新規投影の公開条件、INV03server actor所有resourceだけwrite、INV04同base revision成功最大1（候補）、INV05/06reviewの時点/根拠、INV07鮮度限界、INV08理解。全14件にowner/enforcement/bypass/failure/testを定義。
9. **Current architectureの問題:** pure policy・共通認可・Blob helper・atomic writesは既にある。本質的gapはruntime変換、read→write間、古いclient、commit後処理、食品reviewの意味、配備/人の検証境界。ディレクトリ名だけでは解決しない。
10. **Alternatives:** A0現行+tests/docsのみ、A1局所policy/write境界補強、A2全feature application/adapters化、A3独立API backendの4案をcriteria先行で比較。
11. **Recommended target:** A1。既存Next/feature/lib/Prismaを維持。まずD01正規化/D02最終resource条件、承認後に必要sliceだけuse case/OCCを追加。
12. **採用Evidence:** R02/EX01が局所反例、R04が更新境界、R05/R09が既存adapter、RUN01とDB harnessが既存検証基盤。A1の効果はE7推論であり実装後に検証する。
13. **採用しない案:** A0は反例を残す。A2/A3は複数永続化実装・独立scale/team/deploymentの要求がなく、移行/運用costを正当化できない。将来要件が出れば再評価。
14. **避けた過設計:** 汎用repository、DDD Entity/Value Object、全面mapper、event store、queue、microservice、publication booleanのstate machine化、property-test依存追加を導入しない。条件付きuse case抽出も同じtestをroute内で満たせるなら不要。
15. **Target data model:** 即時候補I01/I02はschema不変。I03はrevision追加候補だがtrigger増分責任spikeが必要。I06はcurrent review metadata対履歴snapshotを比較し、HD-03前にDDL確定しない。過去updatedAtを確認事実へbackfillしない。
16. **Authorization/transaction/failure:** server session→active owned shop→resource predicate。fields/links/将来revision/reviewは同tx。外部providerはtx外で現行補償を維持。取得不能はFREE/正常0件へ変換しない。commit後cache failureと結果不明はHD-09で契約化。
17. **Verification:** 適切な最低層でT01～T11を設計し、実DB/provider/cache境界はreal integration、理解はUX01、アクセシビリティはA11Y01、運用はOPS01、配備はREL01。研究時点の124 tests PASSとaudit0、後続の[I01](implementation/i01-result.md)・[I02](implementation/i02-result.md)の局所結果はそれぞれ観察範囲内の証拠。全体安全性の証拠にしない。
18. **Migration sequence:** baseline→未知値防御→write条件→cache/UX/ops測定→承認後revision→verified identity→review履歴→鮮度/asset/outcome→release evidence。各phaseの互換性/rollbackを定義し、一括rewriteしない。
19. **Implementation epics/issues:** 5 Epic、[12実装/調査Issue](implementation/backlog.md)と[9判断Issue](open-questions.md)をGitHubに起票済み。I01/I02はlocal commit済み・未pushで、I02の専用DB確認は2026-09-30の後続runでPASS（実Clerk/配備は未確認）。I04/I07/I08/I09は調査/計画/証拠収集へ進められ、残りの実装は人の判断等に依存する。最初の局所実装としてI01を選定した理由はH01への直接性・EX01・依存の少なさ・public経路の学習価値。
20. **Residual risks:** 食品情報の虚偽/未報告変更、対象29品目外、厨房、配信済み画面、正当ownerの誤操作、provider停止、理解の個人差はarchitectureだけで除去不能。限定safety caseを維持。
21. **Threats to validity:** dirty working tree、mock/合成値、runtime差、限定文献選定、海外/団体回答/質的研究の適用差、abstract限定、選択bias、未配備/未実DB/未UX、時間経過を明記。
22. **人が次に確認する事項:** HD-01のprototype維持/実運用移行、HD-02/03/05の競合・確認根拠・鮮度、実provider/DB検証の対象、HD-08の文書不一致。I01/I02のローカル結果と未検証範囲をレビューし、[提案Milestone](implementation/migration-plan.md#proposed-milestones)のゲートを用いて次のsliceを選ぶ。GitHub上のMilestoneは2026-09-28時点で未設定。

## Navigation / artifact map

| Area | Documents |
| --- | --- |
| Protocol / boundary | [00 protocol](00-protocol.md)、[01 system boundary](01-system-boundary.md) |
| Research registers | [02 RQ](02-research-questions.md)、[03 evidence](03-evidence-register.md)、[04 claims](04-claim-register.md) |
| Literature | [search strategy / actual queries](literature/search-strategy.md)、[synthesis / counter evidence](literature/synthesis.md) |
| Safety | [losses/hazards](safety/losses-hazards.md)、[control structure](safety/system-control-structure.md)、[requirements/invariants](safety/safety-constraints.md)、[scoped safety case](safety/safety-case.md) |
| Product | [semantics](product/allergen-semantics.md)、[provenance/freshness](product/provenance-freshness.md)、[publication](product/publication-model.md)、[UX/experiments](product/ux-risk.md) |
| Repository | [evidence/anchors/smells](engineering/repository-evidence.md)、[222-file dependency inventory](engineering/inventory.md)、[baseline hashes](baseline-files.json) |
| Engineering | [authorization/mutation inventory](engineering/authorization.md)、[transactions/concurrency](engineering/transactions-concurrency.md)、[failure model](engineering/failure-model.md)、[cache/freshness](engineering/cache-freshness.md)、[audit/operations](engineering/audit-observability.md)、[security/quality check](engineering/security.md) |
| Architecture | [current / diagrams](architecture/current-architecture.md)、[alternatives / criteria](architecture/alternatives.md)、[adversarial review](architecture/adversarial-review.md)、[target / directories](architecture/target-architecture.md)、[ADR-001](architecture/decisions/ADR-001.md) |
| Implementation design | [D01–D12 recommendations](implementation/detailed-design.md)、[conditional schema](implementation/target-schema.md)、[expected tests/RED](implementation/verification-plan.md) |
| Handoff | [migration / milestone案](implementation/migration-plan.md)、[rollout/rollback](implementation/rollout-rollback.md)、[Epic/Issue台帳](implementation/backlog.md)、[readiness/gates](implementation/readiness.md)、[I01実装結果](implementation/i01-result.md)、[I02実装結果](implementation/i02-result.md)、[traceability](traceability-matrix.md) |
| Limits / decisions | [human decision queue](open-questions.md)、[threats to validity](threats-to-validity.md) |

Evidence statusとconfidence理由はregisterに集約。全sourceのsystematic review、STPAの完全適用、ASVS/ISO/WCAG適合、production readinessを主張しない。既存guideの説明を重複して正本化せず、研究固有の差分・反証・未決をここに保持する。
