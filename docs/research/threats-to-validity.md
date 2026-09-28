# Threats to validity

| Dimension | Threat | Mitigation in this run | Residual limitation |
| --- | --- | --- | --- |
| Internal validity | EX01は通常APIから到達しない合成入力 | API validator/SQL enumをcounter evidenceに記録 | production exploit/頻度は不明 |
| External validity | 海外研究を日本のCAに移転 | X01日本調査を追加、各region/design分離 | CA-specific human evidenceなし |
| Construct validity | “安全”“確認”“鮮度”を曖昧に測る | data/source/server/client age、auth/authz、state/effectiveRiskを分離 | UXの理解rubric/閾値は未承認 |
| Evidence selection bias | 単独検索者、検索rank/言語bias、支持資料の選択 | query/採否/反証、古い仮説の否定を記録 | exhaustive SR/二重screeningではない |
| Repository analysis | working tree未commit、全file逐語未読、履歴意図不明 | hashes+inventory、critical flow直接確認、文書相違記録 | HEADのみ再現不可、未読branchあり |
| Runtime uncertainty | mockはSDK/DB/cacheを再現しない | RUN01とT02/real provider/Previewを分離 | 本runで実DB/browser未実行 |
| Population applicability | 団体代表/UK成人/重症者などの偏り | sample単位を明記、患者確率へ換算しない | 小児/外国語/IT不慣れ/支援技術は未研究 |
| Temporal validity | source・advisory・cloud設定の変化 | 2026-09-28 access、lock/version、audit再実行 | 証拠は将来も有効とは限らない |
| Tooling validity | Context7 mixed version、PMC403、日本語find欠落 | v6を選別、代替公式source、abstract限定を明示 | CAA全図/有料ISO全文未確認 |
| Researcher bias | architecture preference、自己レビュー | criteriaを先に記録、A0含む比較、adversarial reassessment | 独立reviewerではない |
| Intervention validity | test計画を実行済みと誤る | READY/blockedとrun evidenceを分離 | 研究artifactの存在はrisk削減の実証でない |
| Operational validity | prototypeと実配備の差 | scope boundary/HD queue | 実データ・運用権限・通知/復旧不明 |

全体結論は“局所的な実装へ渡せる設計があるが、製品/運用の判断待ち領域を含む”。未知の頻度や費用を仮の数値で埋めず、実装成功を医学的安全性へ一般化しない。
