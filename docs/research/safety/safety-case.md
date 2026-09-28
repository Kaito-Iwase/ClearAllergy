# Scoped safety case (GSN-inspired)

Goal G0: **prototypeの情報処理が重大な誤認に寄与する経路を特定し、重要条件を反証可能にする**。食品安全や摂取可否、一般公開の適法性は主張しない。

Strategy S0: 登録意味の保全、対象権限、更新整合性、公開鮮度、理解、運用/配備証拠へ分解し、各scopeのassumptionとresidual riskを示す。

| Sub-goal / claim | Scope / evidence | Assumption | Limitation | Residual risk / status |
| --- | --- | --- | --- | --- |
| G1 有効4状態・欠損・不正値を意味通りに区別する | 研究反例R02/EX01、後続RUN03/T01 | 通常入力はenum/validatorを通る | mock/pureで対象経路を検証。実DB/配備cache未確認 | 研究時C02 CONTRADICTED、現C19は対象経路に限りSUPPORTED |
| G2 不完全menuを新規公開投影から除外する | R03/R12、既存tests | 該当server codeが稼働、master query正常 | cache・実DB適用は別 | この限定claimはSUPPORTED。C04のflag単独十分という主張は反証、T02/T04未実行 |
| G3 他店舗の通常要求を拒否する | R05/R06、RUN04/T09 API mock | server session正当、DB所有関係正しい | provider実設定/専用DBの最終write race未実行、owner取消別 | SUPPORTED（通常入力・I02対象mock）、I02 DB/I05残 |
| G4 同時更新で重要情報を失わない | R04/X13、T03設計 | revision enforcementが全writerに及ぶ | まだ未実装/未承認 | NOT SUPPORTED、HD-02 |
| G5 根拠と確認時点を説明できる | R08/R11、X01 | 店舗が真の情報を申告 | review記録なし、履歴だけでも真実保証不可 | NOT SUPPORTED、HD-03 |
| G6 freshness限界を説明・検証する | R07/X12、T04計画 | 配備条件と閲覧経路を測定 | 最大許容age未決、配信済み画面 | OPEN HD-05 |
| G7 誤認を減らす表示である | R11、X01/X05/X07、UX01計画 | 対象participantが利用者をある程度代表 | CA実験0、注意文の存在だけ | UNKNOWN I07 |
| G8 問題を発見/封じ込め/復旧できる | R08/R10、OPS01/REL01計画 | 担当・権限・環境が準備される | notification/restore未実施 | PARTIAL HD-04/I08/I09 |

Counter argument: 124testsとaudit0があっても、unknown enumをnegativeにするEX01、stale form、厨房変更未通知、人の過信は残る。したがって“ClearAllergyは安全である”とは結論しない。

Context: 現行prototype、単一所有者/店、4状態/29対象品目、外部Clerk/DB/Blob、未コミットsnapshot。実運用へのscope変更、multi-owner、allergen master変更、cache/provider/version変更時はclaimを再開する。

Evidence advancement rule: IssueがGREENでも対応するDB/provider/UX/operational verification未実施ならそのsub-goalをcompleteにしない。新しいpassing testはtraceability closure欄とClaim registerへリンクする。
