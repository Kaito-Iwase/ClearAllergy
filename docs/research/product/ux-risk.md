# UX risk and CA-specific experiments

コードの値が正しくても理解は保証されない。現在は警告文/文字label/選択品目要約があり（R11）、“注意文なし”という仮説は否定される。実画面/支援技術/当事者理解は未検証。

## UX01（計画のみ、TDD_NOT_APPROPRIATE）

RQ-08/18。仮説: FREEを厨房まで安全と読み替える人がいる、STORE_HANDLEDの欠如を取扱なしと誤る、更新日時を確認日時と誤る。反対仮説: 既存注意で十分理解される/追加説明が負荷を増す。

Participants: 初期探索は日本語利用者の当事者6–8人、保護者4–6人、店舗担当4–6人を目安に募集計画。支援技術/低視力/高齢・低IT習熟を意図的に含める。これはpower計算済みsampleではなく、募集可能性確認後に確定。未成年直接参加は初期対象外。数値をpopulationへ一般化しない。

Task: 架空menuで確認品目を選び、FREE+別menu補足、MAY_CONTAIN、未確認、対象品目外、原材料変更、同伴者設定の違いを読み、何が分かり何が分からないか自分の言葉で説明する。店舗側は仕入先変更のscenarioで保存/公開/再確認を行う。実物の摂食やmedical adviceは一切行わない。

Conditions: 現行UIをbaseline、未公開prototypeの説明案を比較。順序counterbalanceと別menuで学習効果を抑える。注意文を消す危険条件を実店舗で試さない。mobile/desktop、keyboard/screen readerは対象者の通常環境で分けて観察。

Measures: 危険な誤解の種類/件数、対象取り違え、説明の正確さ、見つけられなかった情報、店舗確認に進む意図と理由、時間・主観的負荷。自己申告の“分かった”だけでは判断しない。実際の店舗確認行動とscenario意図は区別。

Analysis: 事前にcoding rubricを定義（例: FREEから交差接触なしを推論→critical misunderstanding）。可能なら独立2名が分類し不一致を検討。参加者単位/条件単位で事例を報告、small Nで有意差・母集団risk reductionを主張しない。critical誤認が1件でもあれば原因を検討し再設計候補へ戻すが、0件を安全証明にしない。最終acceptance thresholdはHD-01で人が決める。

Ethics/privacy: 同意、途中辞退、任意の録画、匿名ID、保存期間とアクセス範囲を募集前に確定。診断書・病歴詳細・実店舗の機密レシピを集めない。謝礼は回答内容と無関係。刺激による不安や責任帰属に配慮しdebriefする。

## A11Y01 manual plan

対象: /shops、店詳細、menu詳細、設定panel、menu編集/公開/エラー。320CSS px相当/通常desktop/200% zoom、Tab/Shift+Tab/Enter/Escape、focus visibility/order、文字label、error/status読み上げ、contrast/色以外、警告のDOM順を確認。WCAG2.2の1.4.1/1.4.3/1.4.10/2.1.1/2.4.7/2.4.11/3.3.1/3.3.2/4.1.3を選別referenceとする（X07）。自動axe等の追加依存を先に入れない。

Alternative verificationとresidual risk: component/E2Eは警告や対象が存在すること、manualは操作可能性、UX01は理解を調べる。どれも個々の医療判断の正しさを証明しない。UI文言の変更は人の承認・必要な専門家レビュー後。
