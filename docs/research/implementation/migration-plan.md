# Vertical-slice migration plan

Big Bang rewriteなし。phase順はdependencyで決め、実装許可を本research runに含めない。各phase完了時にcode/test/docs/traceability/safety-caseを更新する。

<a id="proposed-milestones"></a>
## 提案Milestone（GitHub未設定）

2026-09-28にGitHubの既存Milestoneを読み取り確認した結果は**0件**。次のM0–M3は研究上の作業ゲートであり、GitHub Milestoneの作成・Issueへの割当・期限設定は行っていない。日付ではなく証拠と人の判断で進める。対応する詳細手順は下のP0–P8を正本とする。

| 段階 | 成果物 / 完了条件 | 対応Issue | 進行条件 |
| --- | --- | --- | --- |
| M0 局所安全境界と再現可能な基準 | 未知状態の公開抑止と最終writeの店舗条件はlocal commit済。同一SHAの実DB制約・CI/配備証拠を確認するまでは完了としない | [#37 I01](https://github.com/Kaito-Iwase/ClearAllergy/issues/37)、[#38 I02](https://github.com/Kaito-Iwase/ClearAllergy/issues/38)、[#54 I09](https://github.com/Kaito-Iwase/ClearAllergy/issues/54) | P0–P2、T01/T09/T02とrelease ledger |
| M1 実測・利用者検証・製品判断 | 公開鮮度の時間系列、状態理解とaccessibility、incident手順の隔離計画。HD-01–HD-09は証拠を踏まえて人が決定するか、未決と理由を維持 | [#49 I04](https://github.com/Kaito-Iwase/ClearAllergy/issues/49)の測定、[#52 I07](https://github.com/Kaito-Iwase/ClearAllergy/issues/52)、[#53 I08](https://github.com/Kaito-Iwase/ClearAllergy/issues/53)の計画、[判断Issue HD-01–HD-09](../open-questions.md) | P3、T04/T08/UX01/OPS01の実施範囲と倫理・環境条件 |
| M2 判断後の縦切り実装 | 競合、招待identity、確認根拠、画像、0件表示、commit後結果、必要な鮮度対策を各Issue単位で実装・検証。各BLOCKED依存を先に解除 | [#48 I03](https://github.com/Kaito-Iwase/ClearAllergy/issues/48)、[#50 I05](https://github.com/Kaito-Iwase/ClearAllergy/issues/50)、[#51 I06](https://github.com/Kaito-Iwase/ClearAllergy/issues/51)、[#55 I10](https://github.com/Kaito-Iwase/ClearAllergy/issues/55)、[#56 I11](https://github.com/Kaito-Iwase/ClearAllergy/issues/56)、[#57 I12](https://github.com/Kaito-Iwase/ClearAllergy/issues/57)、I04の承認後変更 | P4–P7、HDごとの承認、必要なschema/API互換・real DB/provider/UX検証 |
| M3 限定的なrelease evidence | 同一release SHAのCI・Preview・実サービス・復旧訓練を照合し、claimの範囲と残存riskを人が判断 | [#53 I08](https://github.com/Kaito-Iwase/ClearAllergy/issues/53)、[#54 I09](https://github.com/Kaito-Iwase/ClearAllergy/issues/54)と対象slice | P8、REL01/OPS01。一般公開の自動承認ではない |

| Phase / goal | Scope / files | Preconditions | Steps | Required tests | Compatibility | Risk / rollback | Completion criterion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P0 reproducible baseline | I09、docs/CI結果、baseline | frozen working tree/対象Issue | SHA/dirty hash/runtime/envを固定→本日の証拠を記録→差を列挙 | RUN01、REL01 | code変更なし | 別checkout結果を混ぜない、docs訂正 | targetとevidenceが一致 |
| P1 no false-negative normalization | I01、lib/allergens+既存tests+rules説明 | implementation依頼、既存変更保全 | T01 RED→最小正常化→有効値回帰→public projection確認 | T01+既存124等を再実行、lint/type/build | valid契約保持、schemaなし | invalidread非公開増。rollbackでbug復活に注意 | unknownがFREEにならない、API404確認 |
| P2 final write scope | I02、adminMenuRoute+tests/DB regression | P1必須ではない、専用DB | T09 RED→scoped write→links rollback→guard全経路 | auth/API+realDB | URI/response/schema同一 | exception mapping/tx順序、局所revert | 他shopに移った対象を変更しない |
| P3 measure before policy | I04/I07/I08研究・運用 | 募集/隔離環境/対象scope合意 | cache測定、UX、incident tabletop→HD記録 | T04/T08/UX01/OPS01 | prototype/本番code変更なし | small N/local外挿。データ収集停止 | decisionに必要な証拠/不明が分離 |
| P4 menu concurrency | I03、schema/menu route/UI/DB tests | HD-02+trigger spike+P2 | additive revision→current writer対応→clients token→enforce→旧writer廃止 | T03+T02/T09+2tab | optional期間は保証なし。cutover明記 | mixedversion、旧版は保証なし。column残す/readOnly | 同revision成功最大1、DB副作用なし、旧client対応終了 |
| P5 verified invitation | I05、identity/accept/tests | HD-06・専用Clerk | verified対照RED→identity境界→signup/OAuth実確認 | T05+既存inviteDB回帰 | 許可対象の条件変更を周知 | signup拒否、受諾停止をrollback候補 | 正当verified成功/他不変、tenant証拠 |
| P6 review provenance | I06、schema/application/UI/public | HD-03、P4、retention/rollback承認 | expand nullable→新review tx→対象writer対応→公開rule適用 | T11+T02/T03+店舗UX | legacyは未確認、勝手にreviewbackfill不可 | 公開減少/記録漏れ/機密保持、record残しwrite停止 | current revisionとreview一致、rollback確認 |
| P7 freshness/outcome/assets | I04実装後続/I10/I12（別Issue） | HD-05/07/09、必要spike | policyごと独立slice、feature flagは必要な時のみ | T04/T06/T07+Preview | API/URL変更は契約合意後 | 古いtab/URL/不可逆削除、holdまたは前設定 | 承認範囲のverificationとoperating runbook |
| P8 release evidence | I09/I08 | 各対象critical gate | CIの同SHA→Preview→manual/provider→incident/restore→人の公開判断 | REL01/OPS01、実サービス | 既存workflowを使用 | 本番evidence不足ならrelease hold | 未確認を承認した責任者/残riskまで記録 |

P4–P7を先行させるために全routeをapplication layerへ移さない。use case extractionはT03が必要なsliceのみ。schema rollbackとapplication rollbackは別。各phaseの継続判断は前phaseのpassing testsだけでなく新規unknownを評価する。
