# Evidence-driven research protocol

調査日: 2026-09-28 (Asia/Tokyo)。対象: `improve/prototype-usability-ci`、HEAD `64163cc` **と調査開始時の未コミット変更**。HEAD単独の監査ではない。

この文書群は研究・設計案であり、現行仕様の正本は [guide/rules.md](../guide/rules.md)、機能入口は [guide/change-map.md](../guide/change-map.md)。既存仕様を研究上の推奨で上書きしない。Production code / test code / schema / migration / 外部サービスは変更しない。GitHub Issue作成・commit・pushは行わず、作成可能なローカルIssue仕様までとする。

## 手順と証拠

1. Current State、境界、RQを記録する。
2. E1 行政、E2 規格・framework、E3 evidence synthesis、E4 一次研究、E5 repository、E6 CA固有実験、E7 engineering inferenceを区別する。
3. Evidence → loss/hazard → requirement → invariant → verification → boundaryの順で設計する。
4. 下記criteriaでcurrentを含む3案以上を比較し、反対立場から再評価する。
5. 詳細設計・RED設計・migration・Issue・traceabilityを照合する。未承認製品判断を埋めず、領域別にgateを判定する。

CONFIRMED=観察範囲内の直接証拠、SUPPORTED=限定条件付き支持、HYPOTHESIS=検証予定、UNKNOWN=証拠不足、CONTRADICTED=反証あり、HUMAN_DECISION_REQUIRED=価値・許容リスクの判断待ち。Confidenceには範囲と理由を添える。

外部調査は目的別のstructured literature review。網羅検索・独立二重screeningを行うsystematic reviewではない。検索日・query・採否・population・design・N・limitationsを記録する。検索snippetのみで重大判断を確定しない。外部研究はCAの理解度・厨房の事実・臨床転帰を証明しない。証拠を再利用する場合も、Counter evidence / 適用限界 / 反証方法を併記する。

## 初期RQとcritical unknowns

- RQ-01: 実運用か架空データの試作か。公開責任と使用目的の境界は何か。
- RQ-02: 欠損・不正状態・選択なしがnegative informationへ変換される経路はあるか。
- RQ-03: 保存・公開・公開投影の条件はAPIとDBでどこまで一致するか。
- RQ-04: 全mutationのactor→resource→permissionはサーバーで強制されるか。
- RQ-05: 原材料変更、同時更新、再試行、外部障害で正しい登録が失われないか。
- RQ-06: 表示された情報の根拠・確認者・確認時刻を復元できるか。
- RQ-07: 非公開化後、配信済み情報をいつまで閲覧可能か。
- RQ-08: FREE、STORE_HANDLED、未確認、更新日時を利用者がどう解釈するか。
- RQ-09: 不整合を検知・封じ込め・復旧できる証拠があるか。
- RQ-10: 既存boundaryのまま重要制約を検証・修正できるか。
- RQ-11: dependency/configurationと実配備の差は何か。

Repositoryで確認可能: 制御フロー、型・検証、schema、migration定義、tests、CI設定。実DB制約・配備キャッシュ・Clerk/Blob動作は別のintegration evidence。人の理解・店内運用・許容鮮度はrepositoryから決定できずhuman study / product decisionが必要。

## Alternative生成前に定義する評価基準

重み付き合計で安全性を相殺しない。必須条件は、重要invariantの強制箇所が明確、他店舗アクセスを防ぐ、必要なintegration/human verificationを残す、段階移行可能、の4点。

比較軸: safety rule locality / invariant enforceability / auditability / change impact / security boundary / framework coupling / cognitive complexity / development velocity / migration risk / operational complexity / performance / cost / overengineering。

Testabilityは、pure policy、実認可、実DB制約、transaction、外部障害、public projection、invariant-test対応に分ける。Mockの容易さだけを評価しない。実測のない性能・費用比較はE7定性的推論と明記する。

## Verification-first policy

TDD_REQUIRED: safety/security/authorization/publication/concurrency/failure rules。TDD_RECOMMENDED: 非critical transformation/use case。TDD_OPTIONAL: 文書・機械的移動・styling。TDD_NOT_APPROPRIATE: 人の理解などtest-first codeで反証できないもの（理由・代替・残存risk必須）。

本runではREDの設計のみ。Scenario / preconditions / input / expected result / expected failure reason / verification level / higher-level evidenceを定義する。実装時、最初からGREENなら既存充足・弱いassertion・読解誤り・scope差を再調査する。意図した違反以外（compile、環境不足、mock不備）の失敗をREDと数えない。GREENは最小修正、REFACTORは同じ意味を保持。危険な現状をcharacterizationで正当化しない。

## 作業範囲とgate

影響調査: app/features/lib/prisma/tests/scripts/CI/configuration/guide全体。実変更: `docs/research/`、README・変更対応表の研究入口、研究文書だけを追跡対象へ含める.gitignore例外。確認のみ: production/test/schema/runtime設定/既存ガイド仕様本文。

G1=RQ・strategy・unknown・human boundary。G2=主要claimの支持/反証・証拠種別。G3=hazard→requirement→invariantとmachine/human分類。G4=criteria→alternatives→adversarial review。G5=設計とverificationの粒度。G6=Issueから追加architecture researchなしにREDへ入れること。未決事項を含む領域を全体PASSに混ぜない。

結果・入口は [README](README.md)、詳細gateは [readiness](implementation/readiness.md) に集約する。
