# Research question register

2026-09-28。E5の「High」はコード観察の確度であり、食品安全や配備済み動作の確度ではない。RQ-12以降は調査中に追加した質問。

| RQ | Question | Why it matters | Evidence needed | Status / Finding | Confidence and reason | Gap |
| --- | --- | --- | --- | --- | --- | --- |
| RQ-01 | 何を保証する製品か | 過信と運用scope | R01,X01 | CONFIRMED: prototype / 実飲食判断対象外 | High: READMEと共通注意が一致 | 実配備データは未確認、HD-01 |
| RQ-02 | 欠損・不正値がFREEにならないか | H01 | R02,EX01,T01,RUN03 | 研究時CONTRADICTED→I01後SUPPORTED（対象helper/APIでUNKNOWN/404） | High: RED/GREEN+API mock、実DB/配備未検証 | I01結果、real DB/ブラウザは別 |
| RQ-03 | 保存と公開は別か | H02 | R03,R04,R12 | CONFIRMED: 下書きUNKNOWN可、公開は拒否/自動非公開 | High: codeと既存tests | 実DB適用、T02 |
| RQ-04 | 全mutationは対象認可されるか | H03 | R05,R06,RUN04,mutation表 | SUPPORTED（I02対象PUT/DELETEの最終条件を追加、API mockで確認） | Medium: request-time guardとT09 API結果。実DB/Clerk未確認 | I02実DB、I05、owner失効race |
| RQ-05 | 同時編集で修正が消えるか | H04 | R04,X13,T03 | SUPPORTED: 外部readと全状態置換にlost-update経路 | Medium: static interleaving、実DB未再現 | HD-02,I03 |
| RQ-06 | 食品情報の根拠を復元できるか | H05 | schema,R08 | CONTRADICTED: updatedAt/AuditLogだけでは不可 | High:根拠/確認revisionフィールドなし | HD-03,I06 |
| RQ-07 | 60秒で必ず最新になるか | H06 | R07,X12,T04 | CONTRADICTED: revalidateは鮮度上限ではない | High:config/docs、実時間UNKNOWN | HD-05,I04 |
| RQ-08 | 表示意味が利用者に伝わるか | H07 | X01-X07,UX01 | UNKNOWN: CA人間実験なし | Low:海外/一般研究の移転限界 | I07 |
| RQ-09 | 事故検知・封じ込め・復旧できるか | H09 | R08,R10,OPS01 | SUPPORTED:安全なログ/手順あり、通知/復元証拠なし | Medium:実装とdocsのみ | I08 |
| RQ-10 | 新backend/layerが必要か | 保守費用 | R02-R12,criteria | SUPPORTED:局所改善で主要gapへ対処可能 | Medium:E7、実装効果未測定 | ADR-001 |
| RQ-11 | 依存・配備のriskは | H10 | R13,RUN02,運用確認 | CONFIRMED:本日のaudit 0、cloud状態UNKNOWN | Highはaudit時点のみ | I09 |
| RQ-12 | 未確認メールで招待を受諾できるか | H03 | R05,R06,X14,T05 | HYPOTHESIS:local verificationチェックなし | Medium:codeは確認、Clerk設定/到達性不明 | HD-06,I05 |
| RQ-13 | 非公開画像も公開URLで届くか | H08 | R09,X15,T06 | SUPPORTED:uploadはpublic、DB公開flagと独立 | High:設定、URL実取得は未実施 | HD-07,I10 |
| RQ-14 | 現行guideとコードの相違は | 誤ったspec固定 | R14 | CONFIRMED:店舗の公開可能メニュー0件は404、guideに0件表示記載 | High:分岐と本文照合 | HD-08,I11 |
| RQ-15 | commit後の失敗を未保存と誤認しないか | H04/H09 | R04,R07,T07 | SUPPORTED:revalidate例外がcommit後の500へ届く | Medium:static control flow | I12、再現/contract判断 |
| RQ-16 | DB triggerはcode master集合を保証するか | H02/H10 | R03 | CONTRADICTED:DBの現行masterに対する完全性のみ | High:SQL条件比較 | T02,I09 |
| RQ-17 | 補足データと本体は同一時点か | H06/H07 | R12,T08 | HYPOTHESIS:複数readにsnapshot保証なし | Medium:query境界観察 | HD-05、I04測定 |
| RQ-18 | 29品目外の食物/料理変更を扱えるか | H05/H07 | R02,X01,X16 | CONFIRMED:構造化対象は29、仕入れ連動なし | High:master/schema | HD-01/03、UX01 |
| RQ-19 | API abstractionが本当のvariation pointか | 過設計 | R04,R09,tests | SUPPORTED:provider helpersあり、複数DB実装なし | Medium:E7 | 不必要なrepository層を却下 |
| RQ-20 | master品目変更時に集合・件数・DBが同時に追随するか | H02/H10 | R02/R03、T02 | CONFIRMED:slug集合は導出、件数比較はliteral29。現master29との相違はない | High:静的比較、将来変更は未実施 | I09で照合、将来master変更Issueで固定件数の更新漏れを防ぐ |
