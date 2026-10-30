# Issue #118：実Preview T1の再現runner（準備中）

対象は固定Preview `dpl_7Ea2jsXwwf3kvcwftyiZNDd83PgX`、ソース`6293d5a02758f72a7cf00201fec239afc6b699eb`。実行先はその不変URLだけで、main・Production・別Previewへ切り替える引数はない。実行前に同DeploymentのReady/Preview/SHAとalias対応を別途読み取り照合する。

既存の`browser-runner.mjs`／Playwright 1.61.0を使う。アプリ依存やlockfileへ新しいpackageは追加しない。

```powershell
node scripts/browser-runner.mjs issue118-live-t1 --apply
```

このコマンドは実サービスへ接続し、新規架空メニューを作る。認証済みBraveからcookie・storageState・profileを取り出さない。使い捨てのheaded Chromiumで、本人が通常のVercel保護ログインと店舗Aログインを行う。sessionは一時browser contextだけに保持し、終了時にcloseする。認証情報ファイル、testing token、新規credential、HAR、trace、video、画面保存は使わない。通常の手動ログイン以外の権限・保護変更が求められたら止める。

実行と各書込みには、`CLEARALLERGY_ISSUE118_IDENTITY_RECEIPT`が指す外部確認receiptが必須。ブラウザmetadataの別確認者または本人が、今回のimmutable origin / Deployment ID / full source SHA / alias / Preview / Ready、確認UTC時刻、確認者区分と証拠参照を記録する。receiptの値は`target`と完全一致し、確認から60分以内であること。runnerが自分でreceiptを生成したり、計画書や過去のReadyだけを現在確認へ読み替えたりしない。未指定・不一致・期限切れでは起動／書込みを拒否する。現時点ではこの新しいreceiptは未作成で、実行拒否も未解除。

最初の15分は`/admin/shop`到達待ち。次に店舗IDと今回専用の非公開anchor `cmvuiodx30001jg08xmr6nexe`の名前・価格1000・食品版87・乳CONTAINSを通常APIで照合する。不一致なら書込み前に停止する。これは既存の隔離根拠を補強する識別照合であり、DB接続URLを取得する診断ではない。

T1は毎回新しい架空メニューで実行。架空の完全仕様で初期allergen FREEを登録し、架空の新ドレッシングラベルで乳が加わった条件を記録する。実食品の安全判断ではない。初回別公開→編集画面STOP→乳訂正を非公開保存→保存済み食品版確認→別公開→公開API/画面確認。STOPのconfirm handlerをクリック前に登録し、対象名・confirm種別・停止文言を照合してacceptする。作成は201、保存／公開／STOPは200と各応答shapeを検証。作成201の有効IDは、付加フィールドの検証や後続UI待ちより先に追跡する。

現行`NewMenuForm.tsx:295-307`は作成後も`/admin/menus/new`に留まり、保存済みIDへの編集リンクを表示する。runnerは自動遷移を期待せず、201で確定したIDに完全一致する可視リンクを押して編集画面へ進む。これにより後のSTOP後reloadも同じ保存済みメニューを指す。リンク到達は局所DOM navigation検査であり、実React・実APIのT1成功に読み替えない。

メニュー書込みはCREATE1回、INITIAL_PUBLISH1回、REPUBLISH1回、CORRECT1回、STOP1回、cleanup STOP最大1回に限定する。DELETEや既存anchor・他メニュー・店舗への書込みは遮断する。

write操作はARMED→IN_FLIGHT→応答とbody検証・クリック完了→CONFIRMED_SUCCESSとする。timeout・応答parse失敗・不正応答・クリック未完はINDETERMINATEとなり、run全体をHOLDへ固定する。直後のGETが非公開でも、元requestの遅延commitがない証明にしない。HOLD後は新たなwriteをすべて遮断し、**自動cleanupもしない**。後からresponse headers／transport完了が観測されても自動再開しない。成功応答とクリック完了の両方を確定できた操作だけで進み、すべて確定済みの場合に限り、通常一覧STOPによる最後の非公開化を最大1回行う。

結果不明の場合は専用名、取得済みID、既存フォームのcreationOperationId、未確定phaseと固定codeを残す。本人・担当者が、元requestの終端結果、専用DB/APIの現在値、作成operationId／専用名、監査・公開確認履歴を読み取りで照合する。遅延成功なら実際にcommitした内容を特定し、遅延失敗でもDB非変更を別に照合する。確定できなければHOLDを維持し、再作成・再送・cleanupを行わない。browserをcloseしてもserver transactionの取消し証明にはならない。新たなwriteを行う場合の判断と承認は別途必要。

保護対象3メニューの比較は、所有者GETが返した全JSON表現をcanonical hashで比較し、値自体を保存しない。項目一覧も記録する。これはそのAPIが返さないDB列・関連表まで不変と保証する検査ではない。

`result.json`には固定stage/error分類、専用fixtureの版・公開状態、書込要求の種類と回数、操作の確定状態のみを出す。URL credentials、headers、body全体、ログイン情報、raw exceptionは出さない。flow、cleanup、protection、overallを分ける。flow成功でもcleanup未確認・保護比較失敗を総合成功にしない。単独DB接続は持たないため、全アプリ側確認が通ってもoverallは`INCOMPLETE_INDEPENDENT_DB`／exit2とし、実T1総合PASSにしない。実DBの状態と公開確認・監査履歴は、既存の安全なREAD ONLY手段で別に照合する。不明writeは`HOLD_UNCERTAIN_WRITE`／exit2、その他の失敗・未完はexit1。

現時点では通常ログイン待ちの実Preview実行は未実施。通信なしの本物のChromiumでconfirm accept/dismiss/不明dialog拒否と対象ガードを検査した結果は、製品STOPや実T1の代替成功ではない。既存BraveでのSTOP操作timeoutは基盤側の観測として保持し、根因を断定しない。T2/T3/無信号対照は店舗Bの通常認証が必要で別扱い。

このbranch `test/issue118-live-t1-20261030` はexact deploymentEnabled=false。既存17ルールを保持し、branch固有envの自動継承を仮定しない。このrunnerを配備する必要はなく、pushやPRも実E2E成功を意味しない。
