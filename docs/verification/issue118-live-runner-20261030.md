# Issue #118：実Preview T1の再現runner（準備中）

対象は固定Preview `dpl_7Ea2jsXwwf3kvcwftyiZNDd83PgX`、ソース`6293d5a02758f72a7cf00201fec239afc6b699eb`。実行先はその不変URLだけで、main・Production・別Previewへ切り替える引数はない。実行前に同DeploymentのReady/Preview/SHAとalias対応を別途読み取り照合する。

既存の`browser-runner.mjs`／Playwright 1.61.0を使う。アプリ依存やlockfileへ新しいpackageは追加しない。

```powershell
node scripts/browser-runner.mjs issue118-live-t1 --apply
```

このコマンドは実サービスへ接続し、新規架空メニューを作る。認証済みBraveからcookie・storageState・profileを取り出さない。使い捨てのheaded Chromiumで、本人が通常のVercel保護ログインと店舗Aログインを行う。sessionは一時browser contextだけに保持し、終了時にcloseする。認証情報ファイル、testing token、新規credential、HAR、trace、video、画面保存は使わない。通常の手動ログイン以外の権限・保護変更が求められたら止める。

最初の15分は`/admin/shop`到達待ち。次に店舗IDと今回専用の非公開anchor `cmvuiodx30001jg08xmr6nexe`の名前・価格1000・食品版87・乳CONTAINSを通常APIで照合する。不一致なら書込み前に停止する。これは既存の隔離根拠を補強する識別照合であり、DB接続URLを取得する診断ではない。

T1は毎回新しい架空メニューで実行。架空の完全仕様で初期allergen FREEを登録し、架空の新ドレッシングラベルで乳が加わった条件を記録する。実食品の安全判断ではない。初回別公開→編集画面STOP→乳訂正を非公開保存→保存済み食品版確認→別公開→公開API/画面確認。STOPのconfirm handlerをクリック前に登録し、対象名・confirm種別・停止文言を照合してacceptする。予期しないdialog、timeout、非200、assertion失敗を成功にしない。

メニュー書込みはCREATE1回、対象IDのPUBLISH2回、CORRECT1回、STOP1回、cleanup STOP最大1回に限定する。DELETEや既存anchor・他メニュー・店舗への書込みは遮断する。失敗・結果不明では元の操作を自動再試行せず、判明した新fixture IDを読み直し、公開中と確認できた場合だけ通常一覧STOPで後片付けする。ID不明なら未確認として残し、盲目的に再作成しない。最後は新fixtureを非公開のまま履歴保持し、保護対象3メニューの読取り前後を比較する。

`result.json`には固定stage/error分類、専用fixtureの版・公開状態、書込要求の種類と回数のみを出す。URL credentials、headers、body全体、ログイン情報、raw exceptionは出さない。単独DB接続は持たないため、runner成功も`T1_APP_BROWSER_API_PASS_PENDING_INDEPENDENT_DB`まで。実DBの状態と公開確認・監査履歴は、既存の安全なREAD ONLY手段で別に照合する。

現時点では通常ログイン待ちの実Preview実行は未実施。通信なしの本物のChromiumでconfirm accept/dismiss/不明dialog拒否と対象ガードを検査した結果は、製品STOPや実T1の代替成功ではない。既存BraveでのSTOP操作timeoutは基盤側の観測として保持し、根因を断定しない。T2/T3/無信号対照は店舗Bの通常認証が必要で別扱い。

このbranch `test/issue118-live-t1-20261030` はexact deploymentEnabled=false。既存17ルールを保持し、branch固有envの自動継承を仮定しない。このrunnerを配備する必要はなく、pushやPRも実E2E成功を意味しない。
