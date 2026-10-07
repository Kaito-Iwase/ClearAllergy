# Cache and freshness

R07/R12/X12。現在のapp routesは `force-static` + `revalidate=60`、feature側にも同定数がある。管理menu mutationは一覧・店・自身・他menu補足のpath再検証、shop更新は自店と公開menuを再検証。公開APIに同じISR宣言は見つからず、ページの設定をAPIのTTLとして記載しない。

3種類の時間差を分ける。

1. **食品情報の経過**: 仕入れ/recipe変更から登録まで。cache設定では解決不能。
2. **server配信の経過**: DB commitからpage再生成まで。DB直接更新/triggerはアプリのrevalidateを呼ばない。60秒は厳密な失効時刻ではない。
3. **client表示の経過**: 既に開いたtab、browser history、offline、印刷/スクリーンショット。server invalidationだけでは回収不能。

公開menu本体/master/店補足は別queryで、同一snapshotではない。主menuの真偽を変えるか、補足の一時的差だけかをT08で切り分け、実際のfailureなしに全read transaction化しない。

HD-05までの設計: 現在のcacheを保持し、鮮度保証を追加しない。I04は production build/隔離DB/2browser で通常更新、別menu変更、非公開、直接DB修正、再生成中DB障害、tab復帰を測定するspike。request開始/commit/応答bodyのversionまたはfixture状態/response headers/URL/経路を記録し、実配備をlocal結果で代替しない。

条件付きtarget: 人が“fresh requestはDB最新検証を必須”を選ぶならcritical public routeをdynamicへ局所変更し、負荷とfailureを測る。open tabについてfocus再取得/経過表示/定期pollのいずれかをUX/運用で選ぶ。最大許容秒数はUNKNOWN、医学的根拠なく60/300等を採用しない。既存ISRを全部禁止するarchitecture判断も未確定。
