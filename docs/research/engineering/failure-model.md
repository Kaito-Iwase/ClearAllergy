# Failure model

Fail closedは“不確実な状態で許可/negative情報を出さない”。すべての読み取りを停止することと同義ではない。現行と設計案を分ける。

| Failure | Current evidence | Desired behavior / reason | Verification / readiness |
| --- | --- | --- | --- |
| DB unavailable fresh read | public-dbは識別済み接続障害のみfallback、public UI unavailable。APIは500またはauth解決503 | 情報なしをFREE/店舗0件へ変換しない。認可writeはclosed | T10、mock済み箇所とreal outageを区別 |
| DB error/schema mismatch | unexpectedを再throw/一般化500 | fail closed、内部SQL非漏出、fixed error category | RUN01 observability、migration検査はI09 |
| Clerk outage | auth/currentUser例外→500系 | write closed、public readが不要なauthに依存しないことを実測 | I05/I09、実tenant未確認 |
| Blob unavailable | upload500、成功URLなし | 古いDB参照を維持、再試行。既存text閲覧はdegraded | T06、image UI error実確認 |
| Timeout after commit | R04後処理例外/response loss | 保存結果不明を未保存と断定しない、readback後再操作 | T07/HD-09 |
| Invalid enum / unknown value | EX01 | unknownに正規化、publication拒否、FREE fallback不可 | T01 READY |
| Missing relation/リンク | status補完UNKNOWN、notFound | 未確認を露出/公開対象から除外 | 既存tests、T02 |
| Stale cache / offline tab | 60 ISRとpath invalidation | 最大許容stalenessを人が決める。offline/古いreadをfreshと説明しない | T04/HD-05 |
| Migration mismatch | TS集合とDB trigger条件に差 | master mismatchはpublic閉鎖、deployed schema証跡 | T02/I09 |
| Partial DB write | tx rollback、deferred trigger | field+links原子的、失敗時旧stateを保持 | real DB T02/T03 |
| Partial provider write | invite補償とrevoke retryあり | local deny優先、external outcomeを明示、照合経路 | OPS01/real provider |
| Audit write failure | best effortでbusiness維持 | 現行運用auditには妥当。必須review証跡を追加するなら同tx必須 | HD-03、T11 |
| Post-save invalidation failure | catch500可能 | mutation結果と配信状態の区別、警告/再検証方式はHD-09 | I12 |
| Google Places timeout | fetch no explicit signal | 入力補助だけdegraded、登録済み店舗検索を壊さない | I09記録、timeout値は未決 |

Fail-openを認めるのはoptional observability失敗など、食品情報や認可の真偽を変えない箇所。既存cacheを障害時にも見せるかはHD-05で決める。食品dataが失敗したときに空の成功responseを返す案は採用しない。
