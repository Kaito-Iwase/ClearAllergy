# Issue #118：実Preview T1の再現runnerと運用記録

対象は固定Preview `dpl_7Ea2jsXwwf3kvcwftyiZNDd83PgX`、ソース`6293d5a02758f72a7cf00201fec239afc6b699eb`。実行先はその不変URLだけで、main・Production・別Previewへ切り替える引数はない。実行前に同DeploymentのReady/Preview/SHAとalias対応を別途読み取り照合する。

既存の`browser-runner.mjs`／Playwright 1.61.0を使う。アプリ依存やlockfileへ新しいpackageは追加しない。

```powershell
node scripts/browser-runner.mjs issue118-live-t1 --apply
```

このコマンドは実サービスへ接続し、新規架空メニューを作る。認証済みBraveからcookie・storageState・profileを取り出さない。使い捨てのheaded Chromiumで、本人が通常のVercel保護ログインと店舗Aログインを行う。sessionは一時browser contextだけに保持し、終了時にcloseする。認証情報ファイル、testing token、新規credential、HAR、trace、video、画面保存は使わない。通常の手動ログイン以外の権限・保護変更が求められたら止める。

実行と各書込みには、`CLEARALLERGY_ISSUE118_IDENTITY_RECEIPT`が指す外部確認receiptが必須。ブラウザmetadataの別確認者または本人が、今回のimmutable origin / Deployment ID / full source SHA / alias / Preview / Ready、確認UTC時刻、確認者区分と証拠参照を記録する。receiptの値は`target`と完全一致し、確認から60分以内であること。runnerが自分でreceiptを生成したり、計画書や過去のReadyだけを現在確認へ読み替えたりしない。未指定・不一致・期限切れでは起動／書込みを拒否する。今回の実行前には新規照合したreceiptを使った。保存済みの時刻は将来の実行には流用しない。

最初の15分は`/admin/shop`到達待ち。次に店舗IDと今回専用の非公開anchor `cmvuiodx30001jg08xmr6nexe`の名前・価格1000・食品版87・乳CONTAINSを通常APIで照合する。不一致なら書込み前に停止する。これは既存の隔離根拠を補強する識別照合であり、DB接続URLを取得する診断ではない。

T1は毎回新しい架空メニューで実行。架空の完全仕様で初期allergen FREEを登録し、架空の新ドレッシングラベルで乳が加わった条件を記録する。実食品の安全判断ではない。初回別公開→編集画面STOP→乳訂正を非公開保存→保存済み食品版確認→別公開→公開API/画面確認。STOPのconfirm handlerをクリック前に登録し、対象名・confirm種別・停止文言を照合してacceptする。作成は201、保存／公開／STOPは200と各応答shapeを検証。作成201の有効IDは、付加フィールドの検証や後続UI待ちより先に追跡する。

現行`NewMenuForm.tsx:295-307`は作成後も`/admin/menus/new`に留まり、保存済みIDへの編集リンクを表示する。runnerは自動遷移を期待せず、201で確定したIDに完全一致する可視リンクを押して編集画面へ進む。これにより後のSTOP後reloadも同じ保存済みメニューを指す。リンク到達は局所DOM navigation検査であり、実React・実APIのT1成功に読み替えない。

メニュー書込みはCREATE1回、INITIAL_PUBLISH1回、REPUBLISH1回、CORRECT1回、STOP1回、cleanup STOP最大1回に限定する。DELETEや既存anchor・他メニュー・店舗への書込みは遮断する。

write操作はARMED→IN_FLIGHT→応答とbody検証・クリック完了→CONFIRMED_SUCCESSとする。timeout・応答parse失敗・不正応答・クリック未完はINDETERMINATEとなり、run全体をHOLDへ固定する。直後のGETが非公開でも、元requestの遅延commitがない証明にしない。HOLD後は新たなwriteをすべて遮断し、**自動cleanupもしない**。後からresponse headers／transport完了が観測されても自動再開しない。成功応答とクリック完了の両方を確定できた操作だけで進み、すべて確定済みの場合に限り、通常一覧STOPによる最後の非公開化を最大1回行う。

結果不明の場合は専用名、取得済みID、既存フォームのcreationOperationId、未確定phaseと固定codeを残す。本人・担当者が、元requestの終端結果、専用DB/APIの現在値、作成operationId／専用名、監査・公開確認履歴を読み取りで照合する。遅延成功なら実際にcommitした内容を特定し、遅延失敗でもDB非変更を別に照合する。確定できなければHOLDを維持し、再作成・再送・cleanupを行わない。browserをcloseしてもserver transactionの取消し証明にはならない。新たなwriteを行う場合の判断と承認は別途必要。

保護対象3メニューの比較は、所有者GETが返した全JSON表現をcanonical hashで比較し、値自体を保存しない。項目一覧も記録する。これはそのAPIが返さないDB列・関連表まで不変と保証する検査ではない。

`result.json`には固定stage/error分類、専用fixtureの版・公開状態、書込要求の種類と回数、操作の確定状態のみを出す。URL credentials、headers、body全体、ログイン情報、raw exceptionは出さない。flow、cleanup、protection、overallを分ける。flow成功でもcleanup未確認・保護比較失敗を総合成功にしない。単独DB接続は持たないため、全アプリ側確認が通ってもoverallは`INCOMPLETE_INDEPENDENT_DB`／exit2とし、実T1総合PASSにしない。実DBの状態と公開確認・監査履歴は、既存の安全なREAD ONLY手段で別に照合する。不明writeは`HOLD_UNCERTAIN_WRITE`／exit2、その他の失敗・未完はexit1。

通信なしのChromium検査と実Preview試験を区別する。2026-10-30の実行では本人の通常ログイン後、編集STOPのconfirmを処理して非公開化を確認した。以前のBrave操作timeoutは保持し、この成功だけでその根因まで断定しない。T2/T3/無信号対照は店舗Bの通常認証が必要で別扱い。

このbranch `test/issue118-live-t1-20261030` はexact deploymentEnabled=false。既存17ルールを保持し、branch固有envの自動継承を仮定しない。このrunnerを配備する必要はなく、pushやPRも実E2E成功を意味しない。

## 今回の実測と残る境界

無秘密の[機械可読証拠](issue118-live-t1-evidence-20261030.json)に、失敗試行・成功試行・独立DB追補の識別子とhashを記録した。実行アプリは上記6293d5a、runnerは`ed39657a391f6efd2fbaafbf5d7129df2f7e877b`。後続の文書追加を、実行済みrunnerやアプリのSHAに読み替えない。

- 先行試行は作成POST 201を1回確定後、runnerが実UIにない自動遷移を待ちtimeout。専用fixture `cmvuy8d4z0003jw07e9fobsdm`は非公開のまま保持し、独立DBでも価格1000・食品版29・公開確認0・作成監査1を確認した。失敗receiptは保持する。
- 修正版のrun `f6c348cd-414d-4f3d-97d7-d2fb70710231`は新fixture `cmvuzlqhf0003l308lem3uwck`を使い、CREATE／初回公開／編集STOP／乳訂正保存／別再公開／cleanup STOPの6要求がすべて確定。公開APIは乳CONTAINS、公開ページは専用名の見出しを確認した。
- 最終APIと後続の独立READ ONLY照合は、1000円・非公開・version96・食品版87・公開確認版87、乳CONTAINS・他28品目FREE・UNKNOWN0で一致。監査6件は作成→公開→停止→更新→公開→停止の順で全件成功。公開確認は食品版29と87の2件、食品確認記録0。店舗Aの所有者・操作者が一致し、ROLLBACK成功を確認した。
- flowは`PASS_APP_BROWSER_API`、cleanupはAPI/DBとも非公開確認、保護対象3件はAPI全JSON表現のhash一致。独立DB追補を合わせた**今回T1の定義範囲はPASS**。実SQLで各中間時点のsnapshotを取得した試験ではない。
- 元の`result.json`は`INCOMPLETE_INDEPENDENT_DB`のまま変更しない。子runnerはこの状態をexit2にするが、`browser-runner.mjs:18-20,76`は非zeroを例外としてwrapper exit1へ変換する。今回のlauncher exit1を成功へ書換えず、後続DB追補と合わせて判定する。
- 新旧の専用fixtureは履歴を保持して非公開。古い981円公開パンケーキを修復・削除した記録ではない。T2〜T4全体、店舗B、upload、全認可、人の理解・負担、実食品の安全性は今回の成功範囲に含めない。既存HOLDは維持する。

## 次回実行のrunbook

1. **対象と承認を先に確定する。** このCLIは実DBへ書く。対象Project、上記Deployment・完全SHA・Preview・aliasと、専用Neon `patient-heart-55595249` / `br-flat-wildflower-aoeragrs` / `clearallergy_main19` / `neondb_owner`、Development Clerk、所有者Aの対応を確認する。未確認の接続先・別環境へ向けない。過去の実行許可やDB照合許可を別fixtureへ自動拡張しない。
2. **ローカル前提を確認する。** Node22.23.4、Playwright1.61.0と対応Chromium1228を使う。ブラウザ実体・node_modules・個人profile・session・SecretはGit/成果物へ入れない。今回の完全なheaded runtimeはrepo外のtask-local `portable-browser-1.61.0`で、既存の欠落したcacheとは別。OS保護、ACL、ExecutionPolicy、TLSは変更しない。
3. **新規metadata receiptと重複確認。** 元runの終端・未確定write・残存runnerを確認し、未解決なら起動しない。外部確認者が現在のReady/Preview/完全SHA/aliasを照合してreceiptを更新する。新しい出力先を使い、過去receiptを上書きしない。launcherは実行scriptのSHA256を固定照合する。
4. **承認済みの1本だけを起動。** 今回は既存のtask-local `Start-Issue118-LiveT1.ps1`をツール管理下PowerShellで直接実行して成功した。切り離した`powershell.exe -NoExit`の試行はPowerShell/conhostだけが残りrunner未起動だったため、確認後その自作processのみ終了した。起動結果不明のまま同じコマンドを重ねない。可視起動の成否は実windowと新receiptで確認する。
5. **本人の通常ログインを待つ。** 一時的なGoogle Chrome for TestingでVercel保護→テスト店舗A→`/admin/shop`へ進む。15分を超えたら未完了として終える。ログイン中の画面・値は取得しない。cookie/profile/storageStateの移送・永続保存、自動auth設定は今回の方式に含まず、別の具体承認が必要。同じ手動loginを新runごとに連発しない。
6. **実行結果を分けて読む。** flow／cleanup／protection／overall／write ledgerを見る。未知例外・timeout・parse失敗・結果不明はHOLDで再送も自動cleanupも禁止。専用名・ID・creationOperationId・phaseを残し、元requestの終端と現在値・履歴を読取り確認してから判断する。上記非zero exitの変換も踏まえ、終了コードだけで成功/不成功を推測しない。
7. **独立DB照合と終了記録。** そのrunのfixtureを明示したREAD ONLY許可の範囲で、DB/role一致とread_only=onを確認し、最終状態・所有者・公開確認食品版・監査順をSELECTしてROLLBACKする。元のrunner receiptは保持し、独立DB観測は別追補にする。非公開cleanupは履歴を消すDELETE/resetではない。追加操作が必要なら対象・副作用をまとめ、勝手に再開しない。

ローカルの関連検査は`node --test tests/issue118-live-browser.test.mjs`と`node --import tsx --test tests/browser-runner.test.ts`。Playwright moduleとbrowser cacheの明示先は検証者のtask-local配置に合わせ、ネットワーク不要のfixture検査として実サービスT1と分ける。通常の`npm run typecheck`／`npm run lint`も実施する。この成果物追加では製品・schema・公開条件・認可・依存・workflowを変更せず、追加のlive試験や配備は行わない。

今回の最終ローカル確認はrunner固有12/12、既存CLI guard 2/2、typecheck、lint、差分の空白検査がPASS。2つのテストコマンドを別々に実行した計14件であり、全体testやCIの件数ではない。Playwright APIは修復済みtask-local 1.61.0、通信不要のheadless fixture検査は既存の完全なheadless shellを読取り利用した。live T1のheaded Chromiumは別途修復済みの1228。今回の文書・証拠追加に全体test/buildは再実行していない。アプリ配備6293d5aのReadyや過去CIを、この文書追加HEADの新CI/build成功とは扱わない。
