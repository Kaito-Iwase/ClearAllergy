# Semantics research

現行状態の正本は [guide/rules](../../guide/rules.md#allergens)。ここでは重複した仕様表を作らず意味のgapを扱う。

Positive information（含む登録）、negative information（原材料に含まない登録）、uncertainty（可能性あり）、unknown（判断未登録）は異なる。unverified（根拠を確認していない）は別の証拠軸であり、現行enumに独立表現がない。`FREE`も実物を検証した事実ではなく入力値。statusへ「確認済み」フラグの意味を暗黙追加しない。

`STORE_HANDLED`は他の公開可能menuのCONTAINSから導く補足。falseは厨房で取扱なしを意味しない。他menuを非公開にしただけで補足が消えるが厨房が変わるわけではない。したがって厨房リスクprofile tableを自動作成する案はREJECT、必要性は人の調査へ。

EX01: unknown string→createStatusBySlug型assert→publication通過→effectiveRisk FREE。一方summaryはunknown。改善案D01は有効値allowlistによる正規化とnegative branchの明示。通常APIのvalidationは厳格なまま、不正値を保存時に黙ってUNKNOWNへ変える仕様にはしない。

別の分類notice helperは空rowsでnegative textになり得るが、app/featuresで現行callsiteが見つからない。reachable公開bugと同列にしない。D01の回帰にはempty/missing/unknownを含め、現行未使用helperを取り除くかは依頼scope内の局所判断とする。

対象集合の変更はcode/master/SQL/tests/利用者設定に波及する。現29/9+20分類から全食物を網羅しているとは言えない。X16は古い8/28前提の反証であって法適合認定ではない。
