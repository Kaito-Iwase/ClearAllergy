# Requirements and invariants

[Hazards](losses-hazards.md) / [Traceability](../traceability-matrix.md)

SC01 不確実/不正値を否定へ変えない。SC02 完全性確認なしで公開しない。SC03 actorとresourceの許可を独立検証する。SC04 競合・結果不明で正しい内容を黙って失わない。SC05 確認事実と単なる更新を区別する。SC06 情報/配信/表示の経過を混同しない。SC07 認知・対象・支援技術で誤認を招かない。SC08 assetの公開範囲を説明する。SC09 検知/特定/封じ込め/復旧を証拠で示す。SC10 配備と検証対象の一致を確認する。

## Requirements

“候補”は未承認であり現行仕様として実装しない。ownerは責任を担う役割で、実在担当者への割当ではない。

| ID / class | Normative statement / scope | Hazard / Evidence | Decision state |
| --- | --- | --- | --- |
| PR-SCOPE-001 Product | prototype/登録情報提供の範囲を示し、摂取可否/厨房検証/全原因食物を保証しない | H07,R01,X01 | 既存scopeを維持。実運用HD-01 |
| SR-SEM-001 Safety | 明示的に有効なFREEだけnegative表示にし、不明・欠損・不正値をUNKNOWNへ倒す | H01,R02,EX01 | 既存制約の防御を補う |
| SR-PUB-001 Safety | active shop・公開flag・name・code master完全一致・全有効status確認後だけ新しいpublic projectionへ渡す | H02,R03,R12 | 既存制約、cache含む即時性は別 |
| SEC-OWN-001 Security | server actor由来のshopに属するresourceだけread/writeし、対象ID改変を許可しない | H03,R05 | 既存制約。権限取消即時性はHD-04 |
| DR-CON-001 Data | 同じbase revisionからの競合更新で一方を黙って上書きしない | H04,R04,X13 | 候補、HD-02 |
| SR-REV-001 Safety | 原材料/対象品目の変更後の公開確認を変更revisionに結び付ける | H05,R11,X01/X02 | 候補、HD-03 |
| DR-PROV-001 Data | 根拠種別・確認者・確認時刻・対象revisionを復元し、過去未知情報を推定補完しない | H05,R08 | 候補、HD-03/retention |
| SR-FRESH-001 Safety | 食品確認時点と配信/閲覧時点を区別し、人が選んだ鮮度条件を検証する | H06,R07,X12 | 最大秒数未決HD-05 |
| UX-COMP-001 UX | 利用者がFREE/UNKNOWN/MAY_CONTAIN/STORE_HANDLED/対象外を正しく説明し、必要情報を見つけられる | H07,R11,X01/X05/X06 | acceptance閾値HD-01、UX01 |
| UX-A11Y-001 UX | critical確認・保存・警告を色以外/keyboard/支援技術で利用可能にする | H07,X07 | 維持/検証、未測定 |
| SEC-ID-001 Security | 招待email所有の信頼根拠を明示し、未検証emailへ所有権を付与しない | H03,R05,X14 | 候補、HD-06 |
| SEC-ASSET-001 Security/Data | draft/deleted assetのアクセスと保持を承認したscopeへ一致させる | H08,R09,X15 | HD-07 |
| OR-INC-001 Operations | 対象特定・非公開・外部照合・復旧手順を担当/証拠と結ぶ | H09,R08 | HD-04 |
| OR-REL-001 Operations | release SHA/runtime/schema/configと重要検証を照合しunknownを残す | H10,R10/R13,X09 | 手順維持、実環境未確認 |
| DR-OUT-001 Data/API | mutationのcommitとresponse/cache outcomeを区別し、結果不明時に無条件再送しない | H04/H09,R04 | HD-09 |
| AR-BOUND-001 Architecture | 共通semantic policyをI/Oから独立維持し、tx/resource境界をcall flowから追跡可能にする | H01–H06,R02–R12 | 技術推奨、ADR-001 |

## Invariant register

| ID | Statement / Why | Evidence | Owner / Enforcement | Possible bypass | Verification / classification | Failure behavior |
| --- | --- | --- | --- | --- | --- | --- |
| INV01 | negativeならvalueは有効FREE。不明は非negative | R02/EX01 | semantic maintainer / lib/allergens各入口 | cast、不正DB-adapter値、直接label call | T01 unit+API / machine | UNKNOWN、public拒否 |
| INV02 | 新規public projectionは全publication条件を満たす | R03/R12 | public/menu maintainers / policy+query+DB | cache/DB direct/master mutation | T02 pure/API/DB/E2E / machine | 400または非公開/404。DB障害は取得不能 |
| INV03 | mutation対象shopはserver actorの所有shop | R05 | auth/use case / guard+resource where | id-onlywrite、DB operator、owner change race | T09 auth+DB / machine | 401/403/404、writeなし |
| INV04 | 1 base revisionへ受理される更新は最大1（候補） | R04/X13 | menu use case / conditional write+tx | old clients、direct DB writer、別update path | T03 real DB+2client / machine | 409、入力保持、再読込 |
| INV05 | review済みと表示するrevisionは実際のreview対象と同一（候補） | R08/R11 | product/data / app policy+DB | confirmation UIだけ、priceでupdatedAt変更 | T11 / both | stale reviewを無効として公開制限はHD-03 |
| INV06 | 保存済みreviewのactor/time/basis/revisionを辿れる（候補） | R08 | data/operations / business record same tx | best effort audit、削除cascade、虚偽入力 | T11 DB+manual / both | review書込失敗なら対象更新rollback |
| INV07 | 鮮度保証は承認条件を超えて主張しない | R07/X12 | product/public / cache+UI+ops | ISR、tab、offline、直接SQL | T04/T08 / both、SLA currently unverifiable | 明示的unknown/degraded、HD-05 |
| INV08 | 状態・補足・対象外・注意が利用者に識別される | R11/X01/X07 | UX/product / UI projection | screen reader、色/情報量、代理設定 | UX01+manual/component / both | 承認閾値未達なら文言公開判断へ戻る |
| INV09 | invite owner付与のemailは承認したverified identity（候補） | R05/X14 | auth / identity adapter+accept use case | email fallback、provider config変更 | T05 auth+real provider / machine | 拒否、owner不変 |
| INV10 | assetアクセス/保持が承認scopeと一致 | R09/X15 | storage/product / upload+reference+ops | public URL/CDN/orphan | T06 / both | unsafe削除しない、access policy HD-07 |
| INV11 | incidentは特定/封じ込め/照合/復旧の証跡を残す | R08 | operations / runbook+provider tools | audit失敗、担当不在、権限なし | OPS01 / human、時間保証currently unverifiable | escalation/公開範囲縮小、HD-04 |
| INV12 | deployed stateとverified stateの差を隠さない | R10/R13 | release owner / CI+checklist | migration未適用、別SHA、Node差 | REL01 / both | release判定保留 |
| INV13 | HTTP failureだけで未commitと推定しない | R04 | menu/API/client / outcome boundary | response loss、cache例外、auto retry | T07 / machine | readback/unknown outcome、HD-09 |
| INV14 | critical policyの意味はtransport変更で変わらない | R02–R12 | architecture reviewer / import boundary | UIだけ別policy、汎用repositoryがtxを隠す | T01/T02/T03+diff review / machine | architecture変更中止、semantic review |

currently unverifiableな数値SLA/人の理解は、I04 timing measurement、I07 UX01、I08 OPS01のinstrumentation/実験を実施しない限りPASSにしない。
