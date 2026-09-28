# Rollout and rollback design

本runではdeploy/commit/migration/provider writeをしていない。

実装共通手順: Issue scope→現在branch/status→変更前characterization→意図したRED→最小GREEN→必要なrefactor→lint/typecheck/test/build→実DB/provider/browserの必要階層→docs/traceability更新→review→明示依頼された場合のみcommit/push。

Rollout gate: prototype限定か実店舗かを混ぜず、対象SHA/runtime/config/schemaの一致を確認。候補修正はPreview/架空fixtureから始める。公開claim/状態語義/auth/schema/API変更はHD解決記録を添える。

Rollback:
- D01/D02: code局所revertは可能だが既知gapを再導入する。UI誤認が再発する条件では公開scope縮小を判断する。
- Revision: additive columnを残す。古いwriterへ戻すと競合保証が失われる。互換期間のfeature detection/required tokenを含め、旧clientのsilent write再開を避ける。
- Review: evidence recordを即時drop/backfillしない。write停止/旧readへの切戻しで保証の範囲が変わることを記録。情報保持義務と削除要求はHD-03。
- Cache: TTL/dynamicの切戻しは既存payload/tabを回収しない。新規readと古いtabを別々に確認する。
- Blob: 削除はcode rollbackで戻らない。参照再照合・猶予・必要なbackupが未決ならdelete禁止。
- Invite: accepted/owner状態を古いpendingで戻さない。既存補償/revoke retryを利用し、provider outcome不明は運用照合へ。

Monitoring候補: error category/rate、conflict件数、public freshness違反、invalid status発見、review未充足、補償残件。loggingはboundedコード/ID/件数に限定。原材料全文やメールを一般loggerへ加えない。alert destination/threshold/retentionは実運用のHD-04で確定。

Stop criteria: valid statusが誤って非公開になる、他shopの変更、lost update、public stale policy違反、verification観測不能、schemaとアプリ不一致。発生時は新規移行を止めて再現→risk判断→局所rollback、production resetや即席SQLで直さない。
