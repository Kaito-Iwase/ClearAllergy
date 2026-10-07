# Alternatives evaluated after requirements

Criteriaは [00-protocol](../00-protocol.md)で候補生成前に定義。数値scoreは測定なしに作らない。以下の比較はE7/INF01であり、費用・性能の実測ではない。

A0 現行構成を保ちtests/docsだけ追加。A1 現行構成+状態正規化/所有権writeの局所改善、必要なuse caseだけtransaction境界抽出。A2 featureごとにapplication/persistence/provider adaptersを全面整備。A3 public/adminとは別deployのAPI backendと共有contract package。

| Criterion | A0 | A1 | A2 | A3 |
| --- | --- | --- | --- | --- |
| Safety rule locality | 既存policyは良いがEX01残る | policyを維持して反例修正 | 全layerへ再配置が必要 | policy二重version化risk |
| Invariant enforceability | known gap維持 | 実問題のboundaryに限定 | 強制可能だが構造だけでは不足 | network越境ではDB/人要件は同じ |
| Testability | pure/mock/DB harness既存 | existing harness +必要DB/UX | interface mock容易、real DBは依然必要 | contract/deploy E2Eも増加 |
| Auditability | 補助logのみ | 必要なら同tx reviewを局所追加 | adapterだけでは履歴増えない | 分散correlation必要 |
| Change impact | 修正なしだがrisk残る | 小さいsliceごと | broad imports/mapping更新 | API/client/auth全面変更 |
| Security boundary | guard既存、write gap | server actor/resource明確化 | 同様、委譲時context漏れ注意 | token forwarding/CORS等増加 |
| Framework coupling | Next/Prisma直接 | I/O入口に残す | 独立core化、mapper負担 | client/backend双方へ依存 |
| Cognitive complexity | 既知構成、長いroute | 必要時だけuse case抽出 | 多数interface/type | deploy/network/debug負担 |
| Development velocity | 短期速い、gap蓄積 | 既存知識活用 | 基盤整備の先行費用 | 最も先行費用大 |
| Migration risk | 変更なし | 小さい、戻せる | 大きい | 最大、互換期間必須 |
| Operational complexity | 現行 | 原則現行 | 同一deployなら同程度 | 多環境/monitor/障害境界 |
| Performance | 現行、未測定 | validation微小推測、OCC追加query測定 | mapping増/差未測定 | RTT増の可能性、cache別管理 |
| Cost | 現行運用+未修正risk | 追加service費なし、DB測定必要 | 主に開発cost | deploy/service/monitor費増候補 |
| Overengineering | 低いが対処不足 | 低い | 未確認variationにinterface増加 | 独立scale/team要件なし |

## Critical invariant/test placement by alternative

| Alternative | Enforcement | Lowest adequate tests | Integration boundary / external failure |
| --- | --- | --- | --- |
| A0 | lib policy+route+DB | 既存pure/API、実DB未実行 | Clerk/Blob/Nextをmockとrealで別々に。gapは残る |
| A1 | 同じpolicy、resource-scoped use case、DB tx | INV01 pure+API、INV03 auth+DB、INV04 real DB、INV08 human | provider既存helperをcontrolled stub、release前real integration。cacheはproduction build |
| A2 | domain policy/application/adapters/DB | pure/domain+application+real adapter | adapter mockだけではtx保証不能。全featureのtest移動必要 |
| A3 | backend policy/auth/DB +frontend projection | contract+DB+cross-service E2E+human | 外部失敗にnetwork/token/version mismatchが追加 |

選択: **A1**。A0はEX01と更新境界に対処しない。A2/A3は複数DB/provider実装や独立deployment/scale/teamの証拠がなく移行費を正当化できない。A1が食品根拠・人の誤解を自動解決するとは評価しない。HD-03/05/06/07等は別decision。
