# ClearAllergy evidence-driven research

## 2026-10-15 一料理の材料変更を使う検証準備

[進行台本](product/ingredient-change-trial-20261015.md)、[ローカル操作画面・架空資料](product/ingredient-change-trial-fixture-20261015.md)、[匿名の空記録票](product/ingredient-change-trial-record-sheet-20261015.md)を一組で使います。[準備の実行記録](../verification/ingredient-change-trial-preparation-20261015.md)は実コンポーネントの隔離ブラウザと起動・終了を扱い、参加者観察・店舗工数・理解度測定の実施記録ではありません。

通常STOP、食品変更後の旧確認、最新未解決、未申告変更、旧新在庫、複合材料の抜けと既存画面の限界を分けて観察する計画です。材料・在庫モデルやゲスト申告・グループ適合判定をアプリへ追加する仕様ではありません。

2026-09-28 / working tree `improve/prototype-usability-ci` / HEAD `64163cc` + 調査開始前からの未コミット変更。**判定: PARTIALLY_READY**。Production code・test code・schemaは変更していない。GitHub Issue作成・commit・pushは未実施。

後続の実装runでI01とI02をローカル修正し、[GitHub Issue #37](https://github.com/Kaito-Iwase/ClearAllergy/issues/37)と[GitHub Issue #38](https://github.com/Kaito-Iwase/ClearAllergy/issues/38)を起票した。2026-09-28の整理でI01を`111817e`、I02を`03d39d4`、関連するDB/CI回帰定義を`242a0c9`にlocal commitした。I03–I12とHD-01–HD-09もGitHub Issueへ起票済み。pushは未実施。2026-09-30にI01の境界ケースを補強し、I02の隔離PostgreSQL・実ハンドラ回帰18項目を確認した。追検証差分は未コミット。[I01結果](implementation/i01-result.md)と[I02結果](implementation/i02-result.md)を参照。上のfreezeと以下のExecutive Summaryは**研究run時点の記録**であり、後続のコード状態を説明する文ではない。全体の設計判定PARTIALLY_READYは継続。

本書は研究/設計案の入口。現行仕様は [guide/rules](../guide/rules.md)、[変更対応表](../guide/change-map.md)。ここでRECOMMENDED/OPENとした設計を現行仕様へ昇格しない。[Gate判定と検証結果](implementation/readiness.md) / [Issue台帳](implementation/backlog.md) / [提案Milestone](implementation/migration-plan.md#proposed-milestones) / [Traceability](traceability-matrix.md) / [人の判断待ち](open-questions.md)。

## 2026-10-15 の調査5稿・統合メモと現行Issue照合

[次の開発・現場検証を決める統合メモ](product/ca-overnight-decision-memo.md)は公開資料からの研究入口です。続けて[27件のIssueと現行コードの照合](engineering/open-issues-current-code-20261015.md)を読み、原稿担当が未確認だった機能と、今回確認した固定mainの実装・限定実行を区別してください。前者を後者で省略せず、両方を残しています。

| 原稿・記録 | 役割と残す詳細 |
| --- | --- |
| [競争比較](literature/ca-overnight-competition.md) | CAN EAT MAP等の発表時点、現在の未確認範囲、同じ3ケース、差別化を否定する条件、一次資料S1–S10 |
| [小規模店の導入・継続](literature/ca-overnight-adoption.md) | 店のA〜D分類、非誘導20問、同じ情報品質での人・分と待ち時間、拒否・離脱・支払主体・支援原価 |
| [発見・絞り込みと理解度](literature/ca-overnight-discovery.md) | 架空S1–S6、文言比較、自由回答、採点・分母・重大誤認・アクセシビリティ・未完了 |
| [情報整合性](literature/ca-overnight-integrity.md) | 出典・対象・時点、11シナリオ、T01–T25、未申告変更・材料欠落・同一料理AND・将来日・表示への過信 |
| [権限・公開範囲・個人情報・障害運用](literature/ca-overnight-security-operations.md) | 公開DTOと原本、健康情報最小化、保持/削除/復元、権限、停止・訂正、PPC/RFC/Chromeと適用限界 |
| [統合メモ全文](product/ca-overnight-decision-memo.md) | 比較・採否、掲載継続/保留/訂正表、D01–D06、役割別負担、店舗側でのみ得られる証拠 |
| [研究5稿の独立・反証レビュー全文](product/ca-overnight-independent-review.md) | R1–R11、一次資料スポット監査の限界、17試験初版と25試験版の区別、最終4修正の反映確認 |
| [別担当のIssue棚卸し原稿（Library）](https://chatgpt.com/api/library/files/libfile_92bf9b64a8688191b8dbe573f09a06a9/download) | アクセス権が必要な補助記録。15:12–15:15 UTCの27件/PR/SHA対応で、GitHub閲覧の必須根拠にしない。後続の受入・実行・承認状態は今回照合に収録 |
| [今回の27件コード照合](engineering/open-issues-current-code-20261015.md) | 全Issueの現在地、受入・次手・依存・優先度、#73/#74の具体案と副作用、11件/14件詳細・全参照表への入口 |
| [#73/#74の隔離実行と方法レビュー](../verification/shop-menu-isolated-probe-20261015.md) | 実処理＋メモリ/React代用7ケース、全コード・全JSON・23source hashes、安全値の固定/実測区別と未実施 |

Library原稿は全文を保持しています。各稿の「最小」「P0」等は研究上の提案・対象用途前の判断順であり、既存製品の欠陥、現在の必須実装、法的義務、採用決定ではありません。原稿担当の「現行実装は不明」を「ない機能」に変換しません。メニューCAS・食品確認・STOP・snapshot・pending等は現行実装の証拠と対応付けましたが、実食品・理解度・店舗負担・全本番の証拠とは別です。

10:00 JSTは報告時刻であり作業打切り期限ではありません。T01–T25、D01–D06の増補・修正は試験の実施/合格ではありません。今回の7ケース、過去CI/実DB/復旧記録、原稿の公的資料、将来の店舗/利用者調査を混ぜず、実装・Issue close・merge・公開・外部連絡は別の承認範囲として扱います。現行仕様の正本は[共通ルール](../guide/rules.md)、作業文書の更新先は[保守](../guide/maintenance.md#update-map)です。


[取得・Library identity・全文byte保持の記録](product/overnight-source-provenance-20261015.md)を参照してください。

## 2026-10-14 の追加調査（訂正統合版）

[読む入口と検証計画](product/clearallergy-followup-20261014.md)から、導入・更新負担、誤表示等の防止策、情報の継続管理の3文書へ進めます。提供された独立レビューの訂正を本文へ統合した追補です。

出典・日付・母集団・限界を保持し、初期/継続負担、低負担・最小性・事故低減は未実証のまま扱います。注文・厨房・配膳は周辺リスクであり、現行製品への追加仕様・必須測定ではありません。

## 2026-10-14 の調査記録と更新運用案

本日作成された出典付き原稿を、要約せず全文で収録しています。外部資料の確認事実、設計上の提案、適用限界、未確認事項は原稿の区分を保持しています。原稿の保存は、機能採用・実装・実店舗での実証や公開状態の変更を意味しません。現行仕様の正本は [状態・公開・権限](../guide/rules.md)、実装と検証の入口は [変更対応表](../guide/change-map.md) です。

| 読む順番 | 文書 | 役割と収録範囲 |
| --- | --- | --- |
| 1 | [ClearAllergy 調査記録（2026-10-14）](literature/clearallergy-research-20261014.md) | 根拠の読み方、店舗負担・コスト・利用者需要、誤食事例・ヒューマンエラー・制度、データ資源・既存サービス・追加研究、非機能要件と検証課題 |
| 2 | [ClearAllergy 更新運用の検討（2026-10-14）](product/clearallergy-update-workflow-20261014.md) | 変更検知、根拠・影響範囲の確認、保留・再公開・訂正、担当不在・代替材料・日替わり・オフライン・復旧、一人営業とチェーン、検索への状態反映、受入試験候補 |
| 3 | [情報の正確性を保つための他組織の設計例（2026-10-14、未採用研究）](literature/information-integrity-patterns-20261014.md) | GS1、SAP/Akeneo、Contentful、Google SRE、Meta/Uber、GitHubの一次資料からの示唆。根拠の所有、変更と承認、版・訂正・伝播と限界 |
| 4 | [Big Tech一次資料によるコンテキスト整備案（2026-10-14、未採用研究）](literature/big-tech-context-practices-20261014.md) | Google、Microsoft/VS Code、Meta/Docusaurus等の公開一次資料。正本・同時更新・必要な文脈・検証・リンク確認・出典の提案と限界 |
| 5 | [日本企業の一次資料による開発コンテキスト整備案（2026-10-14、未採用研究）](literature/japan-context-practices-20261014.md) | LINEヤフー、SmartHR、CyberAgent、リクルート、DeNA、追加のメルカリ資料。小規模適用の候補・移さない機構・費用概算・評価方法 |

調査記録は根拠、更新運用はその根拠を踏まえた設計案として読みます。実店舗での負担・効果・支払意思、外部データの利用条件、法的・医療的判断、保留権限・対象範囲・鮮度や復旧目標は、各原稿に記載した未確認・合意待ちのまま保持しています。

追加研究は、リポジトリを調査していない外部の設計批評です。本文の “Adopt” / “defer” / “reject” は製品への推奨であり、ClearAllergyでの採用決定・実装計画・現行機能の説明ではありません。企業向け仕組みをそのまま導入する方針にはせず、適用限界も含めて保存しています。

Big Tech版・国内事例版も、公開資料からの未採用提案として保存しています。本文の「採用」「今やる」や工数・成功条件は調査上の推奨・概算であり、CAでの採用決定・実行結果・効果保証ではありません。各社の手順やコマンドをCAの指示として扱わず、現行の文書更新ルールは別の明示依頼に基づく最小変更として管理します。

以下の Executive summary、Navigation と冒頭のブランチ・HEAD・判定は、2026-09-28 の研究と記載済み後続作業の履歴です。2026-10-14 の原稿や現在のコード状態へ読み替えません。


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
