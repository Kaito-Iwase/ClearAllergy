# Auditability and operational evidence

R08。requestId/route/result/duration/error categoryは記録できる。管理auditにはactor/targetがあるがbest effort、metadataは許可項目のみ。一般loggerに原材料本文やメールを追加する提案はしない。trigger生成auditは通常APIのbest-effortとは異なりDB transaction内。

現在できること: API responseのX-Request-Idから同じ要求を追う、対象menu/shopをauditから探索、ownerによる非公開操作、Clerk取消再試行、運用guideで分岐を案内する。
現在証明できないこと: 全変更の欠落なし記録、食品確認根拠、正確な旧revision復元、通知配送、retention/アクセス制限、隔離restore所要時間、運営者の緊急非公開権限。

OPS01（I08）: 架空menuで“誤登録の申告→対象特定→ownerが非公開→新規read確認→既存tab/画像の残存確認→正常状態へ復元”を机上/隔離環境で実施。誰が何分で対応するかはHD-04で役割と目標を決め、実測を残す。実通知を他者へ送る/クラウド設定変更はこのrunでは行わない。

review証跡が要求される場合はbusiness dataと同txのreview recordにする（HD-03）。observabilityへの任意payload追加で履歴を作らない。historical dataから根拠や確認日時を推定backfillしない。

運用残課題: target範囲を絞ったincident記録、mutation結果不明時の照合、外部orphanの手動対応、backup/restore訓練。新SaaS/queue/event sourcingの導入は、現行運用で満たせない要件が確認されるまでOPEN。
