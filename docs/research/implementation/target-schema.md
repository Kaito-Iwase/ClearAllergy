# Database design — conditional, no migration executed

現行schemaは [prisma/schema.prisma](../../../prisma/schema.prisma)。MenuItem、Allergen、MenuItemAllergen、User、Shop、AdminInvite、AuditLogを維持。boolean publicationをenumへ変えない。D01/D02はschema変更不要。

## S-01 Revision（D03 / HD-02承認後）

| Item | Design |
| --- | --- |
| Current | MenuItem updatedAtのみ、revisionなし |
| Target candidate | MenuItem.revision Int default(1)、increment on every application menu update。id+shop+revision条件write |
| Reason | timestamp/lockだけでは古いclient全payloadを確実に判別できない |
| Migration | additive column、隔離DBで既存triggerと同時更新を検証。大きいtableのlock時間を測定し計画 |
| Backfill | 既存row=1は競合tokenの開始値。過去revision数を示さない |
| Compatibility | phase expand optional受取→全first-party client送信→required enforced。旧writer/operatorは保証外と記録し終了条件を設定 |
| DB details | idはuniqueなので追加lookup indexを先行作成しない。全writer+triggerがrevisionへ影響するかT03/T02で確認 |
| Trigger issue | auto-unpublishがrevisionを増やさないとCASが変更を見逃す場合あり。trigger側incrementまたは対象writeに統一する設計を同時に確定 |
| Rollback | columnを急いでdropしない。旧writerへ戻すとOCC保証喪失。編集停止/旧client拒否などの運用gateを残す |

未解決: direct SQL/migration/triggerを含むrevision incrementの唯一の責任者。アプリだけincrementとDB triggerの二重加算を避ける。候補はDB BEFORE UPDATEでrevision=OLD+1を一元化（Prisma側incrementをしない）だが、既存deferred triggerとの相互作用/returning値を隔離試験して決める。このtechnical spikeが完了するまでI03はDesign Readyでない。rollback方針と旧writer期限もHD-02。

## S-02 Review record（D06 / HD-03承認後）

| Item | Minimal metadata alternative | History alternative（必要性が確認された場合のみ） |
| --- | --- | --- |
| Target | menuにreviewedRevision/verifiedAt/verifiedBy/basisKindを追加 | MenuReview(id,menuItemId,menuRevision,verifiedAt,actorClerkUserId,basisKind,basisReference?,snapshot Json) |
| Requirement coverage | 現在の確認状態のみ。以前の登録は復元不能 | revision別の根拠/入力snapshotを復元 |
| Constraints | reviewedRevision==current revisionをapp policyで検査、actor/time server由来 | unique(menuItemId,menuRevision)、menu FK、同tx insert。snapshot形状はschemaVersionを持ちvalidate |
| Why not AuditLog | best effort/privacy allowlistと用途が違う | 同左、監査loggerを全文履歴に流用しない |
| Schema impact | nullable additive columns、default verified不可 | 新tableはoptional、既存menu変更なしでexpand可 |
| Backfill | null（未確認） | 古いデータをreviewしたと偽る行を生成しない |
| Read compatibility | 古いclientはreviewを知らないのでenforce前に移行 | 同左、publicにはactor ID/snapshotを返さない |
| Delete / retention | 退会/削除時の保持・匿名化がHD-03 | cascade削除かretained tombstoneかHD-03。復元要件とprivacyを先に判断 |
| Rollback | columnを保持して旧readへ、確認保証を撤回 | recordsを即削除しない。表を残し新write停止、機密保持責任は残る |

History snapshot候補の最小対象: menu名・ingredients・precaution・品目slug/status集合・master集合fingerprint。画像binary/認証token/健康情報/任意request bodyは含めない。必要ならprice/imageは対象識別のため含めるか人が選ぶ。basisKindの用語/許容値、referenceへsupplier個人情報を入れない制約、retention期間は未決。未決を埋めたDDLは作らない。

## No-change decisions

User/Shop1対1、AdminInvite status/unique、MenuItemAllergen composite PK/enumは現行を維持。共同管理者table、食品taxonomy全面変更、event store、汎用repository mapperは追加しない。必要なら別product decisionと影響調査。

既存SQLは“migration applyだけで読取専用”ではない。publication migrationにbackfill writeがある。本runではschema validate/generate/migrate/seed/repairすべて未実行。
