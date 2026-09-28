# Transactions, concurrency, retry

R04/R06/X13。Atomicityとlost updateは別の性質。

| Use case | Current atomic boundary | Non-atomic boundary / risk | Proposed verification |
| --- | --- | --- | --- |
| Menu create | MenuItem+全links tx | response喪失後POST再試行で重複。audit/cache外 | T07、idempotency必要性HD-09 |
| Menu update | base fields+links delete/create tx | read/mergeはtx外、同一ownerの2tabで全status上書き | T03 real DB+2client |
| Menu delete | links+menu tx | read認可との時間差、既存画像残存 | T09/T06 |
| Shop edit | single update | read→all fields write、stale client・auth revoked midflight | T09、I03の後続候補（対象拡大しない） |
| Invite accept | pending row NOWAIT lock+User/Shop/Invite tx | expireは別、provider email前提 | 既存DB regression + T05 |
| Invite resend | old pending→revoked+new invite tx | Clerk前後、補償失敗、response喪失 | provider実integration、OPS01 |
| Invite revoke | conditional pending update後provider | local停止成功・external失敗の502は意図的 | 既存race回帰、運用再試行 |
| Upload+menu save | 別操作 | orphan、DB未参照でもpublic | T06、HD-07 |
| DB auto-unpublish | deferred trigger+audit同tx | application response selectはtrigger前の場合あり | T02 commit後readback |

## 具体的interleaving（E7、未実DB再現）

A/Bがrevisionなしの同じ公開menu（egg FREE）を読む。Aがegg CONTAINSを保存。Bが古いform全statusと価格変更を保存するとegg FREEが戻る。各txはatomicでも内容の新旧を識別できない。部分更新APIでも、両server readがA commit前ならBのmergeが古い。仕様としてlast-write-winsを望む証拠はなく、H04候補。

最小案: transaction内でrow lockして最新状態へpatch merge（schema不要）はserver並行readを改善するが、古いclientの全値payloadを識別できない。既存updatedAtによる条件writeも候補だがtimestamp精度・同一ms・他writer/triggerの更新範囲を確認する必要がある。HD-02承認後の推奨候補はinteger revision+compare-and-swap。新table/queueは不要。

commit後のrevalidate例外は500になり得る。自動再送では成功/未保存を判別できない。I12ではまずfault injectionでDB状態とHTTPを対照し、現契約の変更判断をHD-09へ送る。全面的idempotency storeは頻度・要求が不明でOPEN。
