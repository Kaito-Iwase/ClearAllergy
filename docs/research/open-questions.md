# Human decision queue / open questions

これらはAIが価値判断を代行しないためのqueue。推奨は実験/小さな次手であり製品承認ではない。statusは全件 **HUMAN_DECISION_REQUIRED**。2026-09-28にHD-01–HD-09をGitHubの判断専用Issueとして起票したが、選択肢は未決定であり、blocked implementationを開始しない。

GitHub判断Issue: [HD-01 #39](https://github.com/Kaito-Iwase/ClearAllergy/issues/39) · [HD-02 #40](https://github.com/Kaito-Iwase/ClearAllergy/issues/40) · [HD-03 #41](https://github.com/Kaito-Iwase/ClearAllergy/issues/41) · [HD-04 #42](https://github.com/Kaito-Iwase/ClearAllergy/issues/42) · [HD-05 #43](https://github.com/Kaito-Iwase/ClearAllergy/issues/43) · [HD-06 #44](https://github.com/Kaito-Iwase/ClearAllergy/issues/44) · [HD-07 #45](https://github.com/Kaito-Iwase/ClearAllergy/issues/45) · [HD-08 #46](https://github.com/Kaito-Iwase/ClearAllergy/issues/46) · [HD-09 #47](https://github.com/Kaito-Iwase/ClearAllergy/issues/47)。

| ID / Decision | Why human decision / evidence | Option A | Option B | Option C | Consequences / reversibility | Recommended next evidence |
| --- | --- | --- | --- | --- | --- | --- |
| HD-01 使用目的と公開claim、理解度acceptance | R01/X01/X05。許容risk・対象populationを開発者が代決不能 | 架空UI prototype維持 | 閉じた実店舗pilot | 一般実店舗提供 | B/Cは運用/専門家/責任境界が必要。注意だけ消すのは不可 | UX01、店舗workflow、責任分担review |
| HD-02 同時編集時のcontract | R04/INV04。409・必須revision・旧client期限は契約変更 | last-write-wins維持し制限を説明 | updatedAt条件を精度検証 | integer revision CAS | C推奨候補、schema/API変更、旧writer保証喪失。expandは可逆、データ競合は自動復元不可 | T03、全writer/trigger spike |
| HD-03 確認の根拠・再確認・保持 | R08/R11/X01/X02。負担/責任/privacy | 現行dialog（prototypeのみ） | current review metadata | revision別review snapshot | Cは履歴復元可能だが営業秘密・retentionコスト。全更新/安全関連更新の選択も必要 | 店舗UX01、収集根拠/保存期間review |
| HD-04 incident責任者・停止権限・許容時間 | R05/R08。運営とownerの権限が異なる | ownerへの停止依頼 | scope限定operator手順 | 新運営停止権限 | Cはauthz変更、Bは強権credential管理。誤停止でL02も | OPS01、権限表と通知責任者 |
| HD-05 許容鮮度と障害時表示 | R07/X12。availability対stale誤認 | 現ISRで保証しない | critical read dynamic | B+tab更新/経過表示 | 負荷/通信/UX増加、既存配信物回収不能。秒数は未決 | T04/T08 Preview測定、UX01 |
| HD-06 招待identityの保証 | R05/X14。auth条件を変更するため | tenant設定証拠に依存 | primary verifiedをserverで明示 | serverが全verified emailsから招待選択 | Bはfallback廃止と既存flow影響、Cは選択契約が広がる | 専用tenant signup/OAuth/primary変更試験 |
| HD-07 draft画像の機密性と保持 | R09/X15。public URLはflag独立 | 公開写真のみ、限界説明 | private draft asset | upload後の短期暫定保持/回収 | Bはstorage/API/費用、Cでもpublicアクセス問題は残る。削除不可逆 | T06/機密画像の利用実態 |
| HD-08 menu0件時の店舗ページ | R14。現コードとguideが矛盾 | 404を正式化してdocs修正 | 稼働店の0件pageを実装 | 公開準備中の専用表示 | Aはdocs-only、B/CはUI/公開方針判断。いずれも可逆 | 既存product判断の確認、0件task review |
| HD-09 commit後失敗のAPI意味 | R04/R07。success/cache failure/再送契約 | 保存成功+別途cache運用event | saved/outcomeフィールド追加 | operation ID/idempotency store | Aが最小だがstale検知必須、B/C契約/複雑性増 | T07と保存結果不明のUX確認 |

## Non-product unknowns

- U01 実DBのmigration/trigger/index適用、データ内容、owner移転運用。
- U02 実Clerk verified設定とpending session/OAuth挙動、Blobのaccess/cache/deleteの実結果。
- U03 Vercelの配備SHA、Node、Origin正規化、ISR/preview、環境分離/secret rotation。
- U04 反応時間・通信量・DB query負荷・利用数。小規模だから速い/安いと断定しない。
- U05 人間の理解度と店舗入力負担、非参加者への一般化。
- U06 法的適用/責任分担・medical文言の専門家review。
- U07 全git historyの製品意図、未コミット変更の配備状況。
- U08 schema revisionの責任者をapplication/DBどちらに置くか、triggerとの二重加算防止。
- U09 external invite補償失敗で対象を確実に照合できるか。安全logが外部IDを削るためprovider側記録との経路をOPS01で確認。

Unknownを埋めるために本番DB/外部招待/画像削除を無断実行しない。本run内に外部操作の最終承認を求める必要はない。実行対象を決めるのは後続Issue。
