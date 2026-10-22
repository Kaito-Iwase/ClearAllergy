# 文書全体の精査記録（2026-10-15）

> 対象はPR #81の `521c7fd` 時点の129件です。表とJSONのhashはその時点の保存状態を示します。[10/16の追加5資料と入口の再確認](../research/engineering/material-change-followup-20261016.md)は別の追補として記録しています。

**管理対象の人間向け文書129件を全文読了し、未読0件です。** 可読性の代表例だけを作った先行作業から対象を広げ、現行ガイド、研究、設計、検証履歴、作業指示、テンプレート、原稿コピーを棚卸ししました。全件を同じ文章へ書き換えたという意味ではありません。原稿の全文・出典・事実と提案・未確認を保持し、現行説明の読みにくさを直しています。

[研究索引](../research/README.md) · [現在の調査・友人テスト方針](../research/product/research-and-friend-testing-policy-20261015.md) · [用語と読む際の注意](../research/reading-guide.md) · [機械可読の全件所見](../verification/document-audit-20261015.json)

## 対象と「読了」の意味

基準mainは `cd502b2404f518975dc4243ab6c41a702e7aa226`。新しい独立作業領域で、Git管理ファイルと今回追加するMarkdown・MDX・RST・ADOC・TXTを列挙しました。作業指示はrootのAGENTS.mdが1件で、プロジェクト管理のSKILL.md・入れ子のAGENTS.mdはありません。`.agents` / `.codex` にこの作業領域のプロジェクト用指示はありません。canonical内のブラウザ依存に同梱されたPlaywrightのSKILL.mdや、Codexにインストールされた外部スキルは、製品文書ではないため対象外です。

| 区分 | 全文読了 |
| --- | ---: |
| 現行ガイド・入口・作業指示・テンプレート | 16件 |
| 研究・計画・索引 | 79件 |
| 原稿コピー | 18件 |
| 実行・検証記録 | 16件 |

Git管理外でcanonicalに残る `docs/audits/` の歴史資料は別枠4件を全文読了し、移動・編集・取り込みはしていません。この4件は新規cloneに存在する資料としてリンクしません。個別の記録はJSONの`local_history`に分けています。

各担当は本文を実際に全文読み、長文は分割しました。原稿コピー18件もhashだけではなく個別に読みました。並列の担当別精査と、実装履歴を渡さない担当による独立レビューは別です。執筆した新しい方針・索引・本記録は執筆担当が全文確認し、独立レビューは変更差分・原稿保持・意味・方針の矛盾を対象にします。

図のソース2件は補助資料として列挙しますが、今回の図の再描画・画像表示の監査は行っていません。JSON・ログは証拠・構成データとして扱い、人間向け文章の読了数へ含めません。外部の全引用元を再取得したという意味でもありません。

## 修正の基準と結果

- 現行ガイド6件は、操作する人、条件、結果を追えるよう段落を分け、略語の初出説明を補いました。見出し・アンカー・コマンド・値・条件・例外・未確認を保持しました。
- README・研究索引は目的から選べる入口にし、歴史資料の「現在」「未merge」と最新の固定main監査を区別しました。AGENTSには実店舗接触なし・公開資料精査・友人テストの方針を残しました。
- 安全分析の読みやすい解説はL01〜L04、H01〜H10、各SC・要件IDと反証条件を保持し、書換え前の原稿もそのまま保存しました。歴史資料・受領原稿を機械的に短縮していません。
- 元の調査全文、#78の13新規文書、当日の判断・技術照合・計画と固定証拠を取り込みました。#78が旧作業branchへmerge済みでmainに未反映だったことを区別し、全文取込・可読性・現在の方針を別コミットにしました。
- 友人テストは未実施の台本と空票を用意しました。友人の店員役を、店舗の実工数・継続・支払・運用可能性の証拠へ換算しません。

## 残る可読性上の注意・未確認

[用語・注意箇所](../research/reading-guide.md)に、歴史原稿の表列ずれ、T17/T18の表分断、資料IDと英語略語、店舗募集案の時点差を記載しました。調査記録の対照群割合30.0%と追加調査の30.5%（165/541）の差は、今回原典を再取得していないため訂正値を確定していません。原典を使う次の作業で照合する必要があります。

外部リンクの到達性・全引用の正確性、図・Mermaidの描画、スクリーンリーダーでの文書読取、人による文章理解、実店舗負担・食品の安全性は未検証です。全件読了は、これらの完了を意味しません。アプリ・DB・実行時の設定・公開契約は変更せず、文書のみのためローカルのlint・型検査・テスト・buildは省略しました。PRのCIは最終HEADに対応する結果を別途確認します。

## 検査と独立レビューの証拠

[静的検証結果](../verification/document-integration-validation-20261015.json)に、相対リンク・アンカー、元の29ファイル、証拠10件、保存済み候補、38の安全分析IDと索引の保持、文書以外の差分、canonical保全を記録します。原稿と取得ログの空白・改行を変えないため、保存先だけGitの文書用属性を指定しています。外部原典やアプリの再検証を成功としたものではありません。

[独立レビュー記録](../verification/document-integration-review-20261015.json)は、実装履歴を共有しない読取専用担当の所見と修正後の結論です。用語Xの誤説明と処置表の分類・表示を修正しました。並列の全文読了記録と区別して残します。

## 全件の処置

表の「現行」は現在の説明・計画、「履歴」は当時の観察・原稿です。全行が全文読了です。具体的な所見、担当、未確認、照合用hashはJSONに保持します。原稿コピー内の相対リンクは保存前の起点のままなので、[原稿保管の対応表](../research/originals/README.md)から閲覧版へ進みます。

| 文書 | 区分 | 処置 |
| --- | --- | --- |
| [.github/ISSUE_TEMPLATE/agent-task.md](../../.github/ISSUE_TEMPLATE/agent-task.md) | 現行 | 用語説明・段落・導線を修正。条件・例外・コマンド・過去の結果を保持。 |
| [.github/pull_request_template.md](../../.github/pull_request_template.md) | 現行 | 用語説明・段落・導線を修正。条件・例外・コマンド・過去の結果を保持。 |
| [AGENTS.md](../../AGENTS.md) | 現行 | 現在の調査方針を追記。その他の作業ルールを保持。 |
| [README.md](../../README.md) | 現行 | 読む目的の入口、用語、既存の競合拒否、現方針への案内を更新。 |
| [docs/agentic-audit.md](../agentic-audit.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/agentic-development.md](../agentic-development.md) | 現行 | 用語説明・段落・導線を修正。条件・例外・コマンド・過去の結果を保持。 |
| [docs/guide/architecture.md](architecture.md) | 現行 | 用語説明・段落・導線を修正。条件・例外・コマンド・過去の結果を保持。 |
| [docs/guide/change-map.md](change-map.md) | 現行 | 用語説明・段落・導線を修正。条件・例外・コマンド・過去の結果を保持。 |
| [docs/guide/development.md](development.md) | 現行 | 用語説明・段落・導線を修正。条件・例外・コマンド・過去の結果を保持。 |
| [docs/guide/document-audit-20261015.md](document-audit-20261015.md) | 現行 | 本棚卸しの説明。自身は執筆担当の全文確認であり独立した全件再監査ではない。 |
| [docs/guide/maintenance.md](maintenance.md) | 現行 | 用語説明・段落・導線を修正。条件・例外・コマンド・過去の結果を保持。 |
| [docs/guide/product.md](product.md) | 現行 | 用語説明・段落・導線を修正。条件・例外・コマンド・過去の結果を保持。 |
| [docs/guide/rules.md](rules.md) | 現行 | 用語説明・段落・導線を修正。条件・例外・コマンド・過去の結果を保持。 |
| [docs/guide/ui-ux-review.md](ui-ux-review.md) | 履歴・研究 | 対象時点と現行入口・用語を補足。過去の技術説明・実行結果を保持。 |
| [docs/guide/verification.md](verification.md) | 現行 | 過去e26bの結果と後続cd502監査を区別する入口を追加。当時の結果は保持。 |
| [docs/research/00-protocol.md](../research/00-protocol.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/01-system-boundary.md](../research/01-system-boundary.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/02-research-questions.md](../research/02-research-questions.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/03-evidence-register.md](../research/03-evidence-register.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/04-claim-register.md](../research/04-claim-register.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/README.md](../research/README.md) | 現行 | 代表例の日本語候補を保持して統合し、全原稿と現在の方針・検証・精査結果を接続。歴史部分は維持。 |
| [docs/research/architecture/adversarial-review.md](../research/architecture/adversarial-review.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/architecture/alternatives.md](../research/architecture/alternatives.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/architecture/current-architecture.md](../research/architecture/current-architecture.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/architecture/decisions/ADR-001.md](../research/architecture/decisions/ADR-001.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/architecture/target-architecture.md](../research/architecture/target-architecture.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/engineering/audit-observability.md](../research/engineering/audit-observability.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/engineering/authorization.md](../research/engineering/authorization.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/engineering/cache-freshness.md](../research/engineering/cache-freshness.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/engineering/current-main-issue-audit-20261015.md](../research/engineering/current-main-issue-audit-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/engineering/failure-model.md](../research/engineering/failure-model.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/engineering/identity-operations-issues-20261015.md](../research/engineering/identity-operations-issues-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/engineering/inventory.md](../research/engineering/inventory.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/engineering/issue-document-references-20261015.md](../research/engineering/issue-document-references-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/engineering/menu-contract-issues-20261015.md](../research/engineering/menu-contract-issues-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/engineering/open-issues-current-code-20261015.md](../research/engineering/open-issues-current-code-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/engineering/repository-evidence.md](../research/engineering/repository-evidence.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/engineering/security.md](../research/engineering/security.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/engineering/transactions-concurrency.md](../research/engineering/transactions-concurrency.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/implementation/backlog.md](../research/implementation/backlog.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/implementation/detailed-design.md](../research/implementation/detailed-design.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/implementation/i01-result.md](../research/implementation/i01-result.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/implementation/i02-result.md](../research/implementation/i02-result.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/implementation/migration-plan.md](../research/implementation/migration-plan.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/implementation/readiness.md](../research/implementation/readiness.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/implementation/rollout-rollback.md](../research/implementation/rollout-rollback.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/implementation/target-schema.md](../research/implementation/target-schema.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/implementation/verification-plan.md](../research/implementation/verification-plan.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/literature/allergen-information-controls-20261014.md](../research/literature/allergen-information-controls-20261014.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/literature/big-tech-context-practices-20261014.md](../research/literature/big-tech-context-practices-20261014.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/literature/ca-overnight-adoption.md](../research/literature/ca-overnight-adoption.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/literature/ca-overnight-competition.md](../research/literature/ca-overnight-competition.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/literature/ca-overnight-discovery.md](../research/literature/ca-overnight-discovery.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/literature/ca-overnight-integrity.md](../research/literature/ca-overnight-integrity.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/literature/ca-overnight-security-operations.md](../research/literature/ca-overnight-security-operations.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/literature/clearallergy-research-20261014.md](../research/literature/clearallergy-research-20261014.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/literature/information-integrity-patterns-20261014.md](../research/literature/information-integrity-patterns-20261014.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/literature/information-operations-followup-20261014.md](../research/literature/information-operations-followup-20261014.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/literature/japan-context-practices-20261014.md](../research/literature/japan-context-practices-20261014.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/literature/restaurant-burden-followup-20261014.md](../research/literature/restaurant-burden-followup-20261014.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/literature/safety-understanding-plan-20261015.md](../research/literature/safety-understanding-plan-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/literature/search-strategy.md](../research/literature/search-strategy.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/literature/shop-adoption-plan-20261015.md](../research/literature/shop-adoption-plan-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/literature/synthesis.md](../research/literature/synthesis.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/open-questions.md](../research/open-questions.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/originals/20261015-ja-readability/losses-hazards.md.txt](../research/originals/20261015-ja-readability/losses-hazards.md.txt) | 原稿 | 本文・改行・byteを保持。閲覧版への導線をoriginals/READMEへ追加。 |
| [docs/research/originals/20261015-ja-readability/research-index.md.txt](../research/originals/20261015-ja-readability/research-index.md.txt) | 原稿 | 本文・改行・byteを保持。閲覧版への導線をoriginals/READMEへ追加。 |
| [docs/research/originals/20261015-main-integration/ca-current-main-issue-audit-20261015.md.txt](../research/originals/20261015-main-integration/ca-current-main-issue-audit-20261015.md.txt) | 原稿 | 本文・改行・byteを保持。閲覧版への導線をoriginals/READMEへ追加。 |
| [docs/research/originals/20261015-main-integration/ca-next-direction-20261015.md.txt](../research/originals/20261015-main-integration/ca-next-direction-20261015.md.txt) | 原稿 | 本文・改行・byteを保持。閲覧版への導線をoriginals/READMEへ追加。 |
| [docs/research/originals/20261015-main-integration/ca-next-independent-review-20261015.md.txt](../research/originals/20261015-main-integration/ca-next-independent-review-20261015.md.txt) | 原稿 | 本文・改行・byteを保持。閲覧版への導線をoriginals/READMEへ追加。 |
| [docs/research/originals/20261015-main-integration/ca-next-result-20261015.md.txt](../research/originals/20261015-main-integration/ca-next-result-20261015.md.txt) | 原稿 | 本文・改行・byteを保持。閲覧版への導線をoriginals/READMEへ追加。 |
| [docs/research/originals/20261015-main-integration/ca-next-verification-plan-20261015.md.txt](../research/originals/20261015-main-integration/ca-next-verification-plan-20261015.md.txt) | 原稿 | 本文・改行・byteを保持。閲覧版への導線をoriginals/READMEへ追加。 |
| [docs/research/originals/20261015-main-integration/ca-one-dish-reconciliation-20261015.md.txt](../research/originals/20261015-main-integration/ca-one-dish-reconciliation-20261015.md.txt) | 原稿 | 本文・改行・byteを保持。閲覧版への導線をoriginals/READMEへ追加。 |
| [docs/research/originals/20261015-main-integration/ja-readability-content-map.md.txt](../research/originals/20261015-main-integration/ja-readability-content-map.md.txt) | 原稿 | 本文・改行・byteを保持。閲覧版への導線をoriginals/READMEへ追加。 |
| [docs/research/originals/20261015-main-integration/ja-readability-pr78-main-plan.md.txt](../research/originals/20261015-main-integration/ja-readability-pr78-main-plan.md.txt) | 原稿 | 本文・改行・byteを保持。閲覧版への導線をoriginals/READMEへ追加。 |
| [docs/research/originals/20261015-main-integration/ja-readability-result-20261015.md.txt](../research/originals/20261015-main-integration/ja-readability-result-20261015.md.txt) | 原稿 | 本文・改行・byteを保持。閲覧版への導線をoriginals/READMEへ追加。 |
| [docs/research/originals/20261015-main-integration/ja-readability-rollout-plan-20261015.md.txt](../research/originals/20261015-main-integration/ja-readability-rollout-plan-20261015.md.txt) | 原稿 | 本文・改行・byteを保持。閲覧版への導線をoriginals/READMEへ追加。 |
| [docs/research/originals/20261015-main-integration/received-plans-independent-review-20261015.md.txt](../research/originals/20261015-main-integration/received-plans-independent-review-20261015.md.txt) | 原稿 | 本文・改行・byteを保持。閲覧版への導線をoriginals/READMEへ追加。 |
| [docs/research/originals/20261015-main-integration/received-research-status-20261015.md.txt](../research/originals/20261015-main-integration/received-research-status-20261015.md.txt) | 原稿 | 本文・改行・byteを保持。閲覧版への導線をoriginals/READMEへ追加。 |
| [docs/research/originals/20261015-main-integration/received-safety-understanding-plan-20261015-v1.md.txt](../research/originals/20261015-main-integration/received-safety-understanding-plan-20261015-v1.md.txt) | 原稿 | 本文・改行・byteを保持。閲覧版への導線をoriginals/READMEへ追加。 |
| [docs/research/originals/20261015-main-integration/received-safety-understanding-plan-20261015-v2.md.txt](../research/originals/20261015-main-integration/received-safety-understanding-plan-20261015-v2.md.txt) | 原稿 | 本文・改行・byteを保持。閲覧版への導線をoriginals/READMEへ追加。 |
| [docs/research/originals/20261015-main-integration/received-shop-adoption-plan-20261015-v1.md.txt](../research/originals/20261015-main-integration/received-shop-adoption-plan-20261015-v1.md.txt) | 原稿 | 本文・改行・byteを保持。閲覧版への導線をoriginals/READMEへ追加。 |
| [docs/research/originals/20261015-main-integration/received-shop-adoption-plan-20261015-v2.md.txt](../research/originals/20261015-main-integration/received-shop-adoption-plan-20261015-v2.md.txt) | 原稿 | 本文・改行・byteを保持。閲覧版への導線をoriginals/READMEへ追加。 |
| [docs/research/originals/README.md](../research/originals/README.md) | 現行 | 原稿18件の保存目的、16件のhash、閲覧版対応、相対リンクが元起点のままである理由を記載。 |
| [docs/research/product/additional-plans-provenance-20261015.md](../research/product/additional-plans-provenance-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/product/allergen-semantics.md](../research/product/allergen-semantics.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/product/ca-overnight-decision-memo.md](../research/product/ca-overnight-decision-memo.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/product/ca-overnight-independent-review.md](../research/product/ca-overnight-independent-review.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/product/clearallergy-followup-20261014.md](../research/product/clearallergy-followup-20261014.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/product/clearallergy-next-direction-20261015.md](../research/product/clearallergy-next-direction-20261015.md) | 現行 | 元の全文を原稿に保存し、現在の次手を公開資料精査・友人テストへ本文更新。 |
| [docs/research/product/clearallergy-update-workflow-20261014.md](../research/product/clearallergy-update-workflow-20261014.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/product/friend-user-test-20261015.md](../research/product/friend-user-test-20261015.md) | 現行 | 既存小丼を使う未実施の手順。初回・標準質問・援助、真値分離、記録と削除の案を具体化。 |
| [docs/research/product/friend-user-test-record-sheet-20261015.md](../research/product/friend-user-test-record-sheet-20261015.md) | 現行 | 未実施の匿名空票。役割・版・初回・援助・判定不能を分離し、回答をGit管理しない。 |
| [docs/research/product/ingredient-change-trial-20261015.md](../research/product/ingredient-change-trial-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/product/ingredient-change-trial-fixture-20261015.md](../research/product/ingredient-change-trial-fixture-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/product/ingredient-change-trial-record-sheet-20261015.md](../research/product/ingredient-change-trial-record-sheet-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/product/next-direction-independent-review-20261015.md](../research/product/next-direction-independent-review-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/product/next-verification-plan-20261015.md](../research/product/next-verification-plan-20261015.md) | 現行 | 6領域の実装・未確認を保持し、実店舗探索を現在の必須次手から外した。 |
| [docs/research/product/one-dish-reconciliation-20261015.md](../research/product/one-dish-reconciliation-20261015.md) | 現行 | A〜Gの静的照合と実行済み小丼の区別を保持。次の証拠取得順序を現在方針へ更新。 |
| [docs/research/product/overnight-source-provenance-20261015.md](../research/product/overnight-source-provenance-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/product/provenance-freshness.md](../research/product/provenance-freshness.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/product/provided-plans-independent-review-20261015.md](../research/product/provided-plans-independent-review-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/product/publication-model.md](../research/product/publication-model.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/product/research-and-friend-testing-policy-20261015.md](../research/product/research-and-friend-testing-policy-20261015.md) | 現行 | 最新ユーザー制約と、実店舗でしか確認できない未検証事項を現行方針として明記。 |
| [docs/research/product/ux-risk.md](../research/product/ux-risk.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/reading-guide.md](../research/reading-guide.md) | 現行 | 略語・ID・時点と具体的な読み取り注意を説明。Xは外部出典であると独立レビューで修正。 |
| [docs/research/safety/losses-hazards.md](../research/safety/losses-hazards.md) | 履歴の解説 | 原稿を別保存し、全文の平易な解説へ改稿。L/H/SC/要件ID・対応・未確認・反証条件を保持。 |
| [docs/research/safety/safety-case.md](../research/safety/safety-case.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/safety/safety-constraints.md](../research/safety/safety-constraints.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/safety/system-control-structure.md](../research/safety/system-control-structure.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/threats-to-validity.md](../research/threats-to-validity.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/research/traceability-matrix.md](../research/traceability-matrix.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/verification/admin-menu-review-queue-20261015.md](../verification/admin-menu-review-queue-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/verification/admin-menu-review-queue-independent-20261015.md](../verification/admin-menu-review-queue-independent-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/verification/ingredient-change-trial-independent-20261015.md](../verification/ingredient-change-trial-independent-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/verification/ingredient-change-trial-preparation-20261015.md](../verification/ingredient-change-trial-preparation-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/verification/issue-37.md](../verification/issue-37.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/verification/issue-38.md](../verification/issue-38.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/verification/issue-65.md](../verification/issue-65.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/verification/menu-food-review-20261009.md](../verification/menu-food-review-20261009.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/verification/menu-food-review-adversarial-20261009.md](../verification/menu-food-review-adversarial-20261009.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/verification/next-direction-preparation-20261015.md](../verification/next-direction-preparation-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/verification/release-evidence-20261004.md](../verification/release-evidence-20261004.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/verification/security-release-20261007.md](../verification/security-release-20261007.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/verification/shop-menu-isolated-probe-20261015.md](../verification/shop-menu-isolated-probe-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/verification/shop-save-contract-20261015.md](../verification/shop-save-contract-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/verification/shop-save-independent-review-20261015.md](../verification/shop-save-independent-review-20261015.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
| [docs/verification/shops-recovery-20261010.md](../verification/shops-recovery-20261010.md) | 履歴・研究 | 原稿・履歴の本文を保持。時点・用語・注意箇所を索引と読むための案内へ記載。 |
