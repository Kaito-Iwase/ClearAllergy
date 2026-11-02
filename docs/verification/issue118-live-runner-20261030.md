# Issue #118：実Preview T1の再現runnerと運用記録

現在のrunner準備対象は専用Project `clear-allergy-e2e` / `prj_0i0cPZtGyoPYXnnB1XaC17DmLXBK`、固定Preview `dpl_FCdWVUy7Zo1GQd2xXdbDiFUD2wz3`、ソース`6293d5a02758f72a7cf00201fec239afc6b699eb`。実行先は `https://clear-allergy-e2e-kzfhilgul-kaitoexe00-9350s-projects.vercel.app` だけで、main・Production・別Previewへ切り替える引数はない。実行前に同DeploymentのReady/Preview/SHA、Project IDとalias対応を別途読み取り照合する。**新Projectでの実T1・無人認証は未実行**。外部確認receiptはProject名/IDも必須で、旧Projectやbootstrap Productionのreceiptを拒否する。過去の実測は旧Preview `dpl_7Ea2jsXwwf3kvcwftyiZNDd83PgX` の結果であり、新対象の成功へ読み替えない。

## 無人認証前の準備境界

`scripts/issue118-preview-transport.mjs`はまだlive runnerへ有効接続していない。OIDC取得・Clerk Testing Token発行・Secret保存・Trusted Sources設定も行わない。以下の実行コマンドは書込みを伴うため、現在は起動しない。旧ローカルlauncherのhash pinと旧receiptは維持しており、新runnerの起動用として流用しない。

将来承認されたOIDCを送る場合も、global `extraHTTPHeaders` は使わず固定Preview originだけに限定する。browser側は `route.fetch({maxRedirects:0,maxRetries:0})` を使い、全3xxをabortして固定code `PROTECTED_REDIRECT_BLOCKED` で停止する。token付き`route.continue`や自動redirect追跡は使わない。直接API helperはGET/HEADだけで、書込みmethodと別originを接続前に拒否する。失敗時の再試行0、provider raw errorを返さない。

このtransportを将来統合するときも、既存の許可対象・phase・重複write・unknown ledgerガードを先に通した末端の転送だけに使う。汎用routeを後から追加して既存guardを短絡させない。POST後のredirect/transport失敗はcommitなしを意味しないため、unknown HOLDとcleanup禁止を維持する。Clerk認証の自動化は別途承認後の局所統合・回帰が必要で、このmodule単独では無人T1を実行できない。

## 既存T1の操作・安全条件と過去の実測

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

## 秘密を使わないCI guard配線

後続変更で`node scripts/browser-runner.mjs issue118-live-guards`を追加した。既存の`.github/workflows/ci.yml`でbrowser install直後の独立stepから呼び、通常の`npm test`・DB検査・build・既存ブラウザ検査は残す。現在のローカル差分ではCLI guard 2件、runner固有13件、transport9件の計24件をNode Test runnerへ渡す。従来14件のCI成功とは別の検証対象。transportにはproviderのallHeaders/非対象originのcontinueが非同期に失敗する負例も含み、両処理をawaitする固定エラー境界を検査する。`--apply`や他の引数は拒否し、実T1 entrypointを呼ばない。実サービス、Clerkの通常ログイン、DB接続、fixture作成をCIへ持ち込まない。

transport試験はsynthetic tokenと自作loopback serverだけを使う。実Playwright HTTPエンジンで301/302/303/307/308を各1回送り、転送先serverへの到達0を検査する。browser route interfaceにも同じHTTPエンジンを注入するが、実Preview・実Clerk・browser navigationの試験ではない。既存2つのChromium DOM検査は `channel:'chromium'` の公式new-headlessを明示し、既存の完全な通常Chromiumを利用する。新browserのdownloadやOS保護変更は不要。

runtimeのmodule/browserパスは既存browser runnerの`node:os`の`tmpdir()`と`node:path`の`join()`で解決し、Windows絶対パスやLinux固定`/tmp`をworkflowへ埋め込まない。CIは既存installで完全なLinux Chromiumを準備する。ローカルでは同版の既存・完全なheadless runtimeを明示し、この新しい一括コマンドで14/14 PASS、typecheck/lint PASSを確認した。通常testのglobに`.mjs`が入らなくても、この独立stepで12件を実行する。イベント・権限・env・他の既存stepが不変であることもYAML構造比較で確認した。

これはローカルWindowsでの配線検証であり、新HEADのLinux CIはpush前のため未実行。実T1の6293d5a／ed39657という実測対象も変更しない。配備抑止済み専用branchへのpush、新SHAでのCI実行、Draft PR作成は、対象を具体化した承認と直前gate照合の後に進める。自動authやlive T1のCI化は別の判断・承認事項。

## 2026-10-31：限定承認後の無人認証・workflow準備（live未実行）

以下は後続のローカル実装で、前節の過去実測を更新するものではない。アプリ・認可・schema・4状態・公開条件は変更していない。

本人の具体承認後、新Project `clear-allergy-e2e` にGitHub issuerのTrusted Sourceを保存し、保存後にaud／sub／repository／repository_id／ref／workflow_ref／environmentの7条件とPreviewだけの対象scopeを再読した。GitHub Environment `clearallergy-e2e-test` は専用branch `test/issue118-live-t1-20261030` だけのbranch policyを持つ。Secret `ISSUE118_TEST_CLERK_SECRET_KEY` は本人入力待ちで、この実装・負例検査は保存値を読まない。

Vercelの信頼は同ProjectのPreview配備群への権限であり、一つのURLやSHAだけのサービス側ACLではない。固定URL・Deployment・アプリSHA `6293d5a02758f72a7cf00201fec239afc6b699eb` と外部receiptの期限はrunner側で制限する。GitHub EnvironmentのSecretもworkflowファイル単独のACLではなく、Environment／branchポリシーとコードレビューで保護する。OIDCのworkflow_ref完全一致はVercel側、job単位の `id-token: write` は専用workflow側の条件である。

### 今回変更した入口と認証方式

- `.github/workflows/issue118-live-e2e.yml` は手動 `workflow_dispatch` だけ。通常CIのイベント・権限・Secretを増やさない。job `live-t1` だけが `contents: read` と `id-token: write` を持ち、Secretは実行stepだけへ渡す。app DB／Blob／Vercel CLIの資格情報はGitHubへ保存しない。workflowの `github.run_attempt == 1` とadapterの `GITHUB_RUN_ATTEMPT === '1'` の両方で同一runの再実行を認証前に拒否する。別dispatchの承認・前run結果照合の代替にはならない。main19共用fixture群のworkflow concurrencyは1、進行中jobを自動cancelしない。ただし他の手動操作や別workflowをサービス側で排他化するものではなく、開始前の調整は必要。
- `scripts/issue118-ci-auth.mjs` はimport時のI/Oなし。GitHub repo／ID／ref／workflow_ref／Environment／イベント／完全runner SHA／明示実行と、debug・DB URL・Clerk overrideの不存在を先に検査する。OIDC取得先はGitHub ActionsのHTTPS idtoken endpointだけ、audience固定、1回・20秒・redirect拒否。JWTのローカル照合は追加の拒否guardであり、署名検証の代替ではない。Vercelが署名とclaimsを検証する。
- `check-issue118-live-t1-browser.mjs --ci-apply` はheadlessの一時contextを使う。Clerkを読む `/admin/login` へ進み、公開鍵から期待Development domainを確認後、固定ユーザーAのBackend API GETでIDとテストメールを照合する。その後だけTesting Tokenを1回、120秒のsign-in ticketを1回発行し、公式Clerk JSの `signIn.create({strategy:'ticket'})` と `setActive` を使う。通常password/MFAの試験ではない。Bの認証・T2〜T4は今回の実装対象外。
- `@clerk/testing@2.2.52` は既存の隔離配置で内容を照合したが、helper内部にTesting Token取得の再試行とFAPI失敗時のURL／本文出力があるため、live経路からは呼ばない。Clerk公式が許容する手動Testing Token付与と公式Backend API／Clerk JSを小さなadapterで使い、アプリ依存・lockfileを変更しない。`dotenv`読取、keyの自動探索、新account作成、auth bypass endpointを追加しない。
- OIDC headerは固定Previewへだけ付与する。ClerkのTesting Tokenは期待FAPIの `/v1/` だけ。Clerkと専用Blobへの要求からVercel headerを除去し、それ以外のoriginはbrowser routeで遮断する。全転送はredirect0／retry0／20秒。ticket作成POSTは一度だけ。providerの例外・本文・URL・token・sessionは記録せず固定codeへ変換する。
- 既存の201応答ID追跡、phase別1要求、結果不明HOLDと後続write／cleanup禁止を保持する。routeエラーは未加工のunhandled rejectionにせず状態へ記録し、実行中writeがあればHOLD、既知fixtureなら追加writeなしの未確認cleanupとして残す。全フロー後のsign-outも別に判定する。session作成／activationの応答が不明なら、local sessionがnullでも `SIGNOUT_UNVERIFIED` とし、provider session終了の証明へ読み替えない。認証が確定したsessionへのsign-outと、local session消失の確認が揃う場合だけ終了確認とする。未確認を総合PASSにしない。

### 入力後の実行条件と停止条件

1. 本人がClerk Test Developmentの既存キーを上記EnvironmentのSecretへ直接保存する。値はchat・ファイル・trace・browser profile・artifactへ載せない。保存後も実認証成功やinstance対応を推測しない。
2. この差分の独立レビュー、最終runner SHAとdeploy抑止、外部observerによる新Project／Deployment／Preview／6293／aliasのfresh receipt（60分以内）、残存run・不明writeなし、他のbackend操作との衝突なしを確認する。キー入力だけで必ず完了できるとはしない。
3. **workflowの初回起動は未成立条件がある。** [GitHub公式のworkflow_dispatch条件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch)ではworkflowファイルがdefault branchに存在する必要がある。現在のmainにはこの新ファイルがなく、今回main変更・mergeは禁止。専用branchへのpushだけで手動起動可能と扱わず、dispatchは未実施のまま止める。既存workflowへ権限を付け替えたり、trusted workflow_refを緩めたり、別triggerへ切り替えて回避しない。default branchへの最小導入等が必要なら別途具体判断を求める。
4. 起動可能になった場合も `confirmation=APPROVE_NEW_FIXTURE_T1`、レビュー済み完全 `expected_runner_sha` と非秘密の `identity_receipt` JSONが必要。入力をshellへ直接展開せず、環境経由でJSON解析・固定照合してから一時receiptを書き、依存導入とSecret利用へ進む。任意targetの入力はない。
5. liveは1回だけ。未知例外、書込みtimeout、transport不明なら再送・自動cleanupなし。routeの固定停止後も元の要求がcommitした可能性を否定しない。今回新fixtureのAPI結果と監査をREAD ONLYで照合し、元receiptは書き換えず別追補にする。

このworkflowはDB資格情報を持たず、独立SQL確認を実施しない。アプリ／browser／APIが通っても `INCOMPLETE_INDEPENDENT_DB`、子exit2のままjobは非成功になる。artifactは固定スキーマの `result.json` 1本のみ、trace／HTML／スクリーンショット／profile／raw stderrをuploadしない。手動READ ONLY追補後の総合判定とCI jobの終了結果を混同しない。新実行のfixtureは今回の具体承認範囲で照合できるが、既存パンケーキ等は対象外。

### オフライン検査の範囲

`tests/issue118-ci-auth.test.mjs` は15グループ。合成GitHub claims／偽fetch／VMのClerk代替で、誤target・誤owner・本番key区分・期限切れ後の再発行なし・redirect・重複auth・token発行失敗・signout未確認・秘密を含む例外と、実CLIの未準備停止を検査する。レビュー指摘後、同一run再実行の事前拒否と、provider session作成後のcreate応答喪失／setActive失敗／activation応答喪失を追加した。実Clerk、OIDC発行、browser認証、DBの成功ではない。workflow YAMLも既存 `js-yaml` で構造検査する。既存 `issue118-live-guards` に追加し、通常CIから同じ負例を実行する。全体test／lint／typecheckの今回の実行結果はレビュー用証跡に記録し、過去の270や24を新差分へ転用しない。アプリbuildは製品・依存が不変のため、この検証adapter差分では再実行していない。

根拠： [Clerk Testing Tokens](https://clerk.com/docs/guides/development/testing/overview#testing-tokens)、[公式Playwright helperの認証方式](https://clerk.com/docs/guides/development/testing/playwright/test-helpers)、[sign-in token](https://clerk.com/docs/reference/backend/sign-in-tokens/create-sign-in-token)、[GitHub OIDC](https://docs.github.com/en/actions/reference/security/oidc)。ライブ認証・発行／受入れ・新fixture操作・新Previewでの実T1は未実行。

今回の通常全体testは269/270、既存 `agent-harness.test.ts` の `report preflight preserves existing files/links and rejects directory junctions` がhardlink作成の `EPERM` でFAIL。この差分で当該テストやOS保護を修正せず、既存の品質調査結果で今回の失敗をPASSへ読み替えない。新差分の最終guard／lint／typecheck結果はレビュー用manifestに記録する。新workflowのremote CI、default branch導入、OIDC実受入れ、実auth、DBは未実行。


## 2026-10-31：CI_ACCESS失敗後のoffline診断修正（live再実行なし）

run 41221986209（runner 6d9bb467）はCI_ACCESS / UNCLASSIFIED_ERROR、write台帳0・fixtureなしで終了。元のresult.jsonは保持する。CI_ACCESSはOIDC準備とブラウザ生成を包含していたため、過去runの原因やOIDC発行有無は遡及確定できない。Clerk認証開始には未到達。

後続ローカル差分はCI_ENV_VALIDATE、OIDC_TARGET_VALIDATE、OIDC_REQUEST、OIDC_CLAIMS_VALIDATE、CI_ACCESS_READY、BROWSER_LAUNCH、BROWSER_CONTEXT、BROWSER_PAGEに分離し、固定コードだけ記録する。providerのmessage/stack/cause/token/URLは残さない。既存のtarget・claims・認証・再試行禁止・結果不明HOLD・cleanup条件は不変。mock負例は分類器と段階通知の検査であり、live auth/T1の成功ではない。新しいlive実行・設定・credential変更は行わない。


## OIDC要求先だけの停止診断

run 41223541368 は OIDC_TARGET_VALIDATE / OIDC_REQUEST_TARGET_REFUSED、要求前・認証前・write0で終了。元のresultは保持する。後続の DIAGNOSE_OIDC_TARGET_ONLY は同workflow/ref/Environment/attempt1/SHA制約で、要求先の存在・parse・HTTPS・host/path・userinfo/port/fragment条件をbooleanと固定コードだけで記録して終了する。OIDC要求tokenは参照せず、Clerk Secretはstepへ渡さない。依存install・ブラウザ・アプリ接続・fixture処理はskipする。診断codeのMATCHは通常ガードとの一致だけで、provider信頼や認証・T1成功ではない。通常APPROVE_NEW_FIXTURE_T1経路のガード条件は不変更。

診断dispatchは confirmation=DIAGNOSE_OIDC_TARGET_ONLY、expected_runner_sha=レビュー済み完全SHA、identity_receipt=OIDC_TARGET_ONLY_NO_APP_ACCESS を指定する。最後の値は診断時には読まれず、通常liveには有効なfresh JSON receiptが引き続き必要。HOLDは何も起動しない。出力はissue118-oidc-target-<run id>のresult.jsonのみ。取得先の生URL、hostname/path/query、token、例外は保存しない。条件を緩める判断は診断結果を基に別途行う。

公式GitHub Actions OIDC referenceはrunner提供ACTIONS_ID_TOKEN_REQUEST_URLの利用を記載するが固定host/path形状を保証していない。公式actions/toolkitのoidc-utils.tsもその値を取得して用いる。現行targetガードが実行環境の値を拒否したことは判明したが、存在・parse・protocol・host/path・userinfo・port・fragmentのどの条件かは診断前に断定しない。参照: https://docs.github.com/en/actions/reference/security/oidc / https://github.com/actions/toolkit/blob/main/packages/core/src/oidc-utils.ts


## 2026-11-01：認証route診断のローカル候補（実行承認待ち）

run41267624371はOIDC/claimsとブラウザ生成後、CI_AUTHENTICATION / CI_ROUTE_FAILED、menu台帳0・fixtureなし・SESSION_CREATION_NOT_ATTEMPTEDで終了した。旧resultにはrouteのrole/statusや認証substageがなく、Vercel/Clerkのredirect拒否・通常fetch障害・headers/fulfill異常の区別は未確定。一時testing/sign-in tokenはsession作成より前に要求するため、発行有無も旧記録から断定しない。

候補はAPP/CLERK/OTHER、許可method、HTTPstatusまたは固定例外、段階booleanだけを最大64件と最初の異常として保存する。意図したOTHERのPOLICY_REFUSEDは最初の異常には数えない。URL/path/query/header/body/token/生例外は出力しない。認証進行もbooleanだけで、要求開始true/応答受領falseはprovider側発行の可能性が残る。SESSION_CREATION_NOT_ATTEMPTEDをtoken未発行の証明へ読み替えない。既存host/redirect/単発要求/claims/認可/cleanup/unknownwrite条件は不変更。旧runへの遡及証明にはならず、追加live/認証/token/DBを起動しない。

PR CI41266929488 attempt1のfocus即時比較FAILとattempt2PASSは別記録。部品はrequestAnimationFrame内でfocusし、当時の検査はクリック直後のactiveElementを照合する。旧証跡にはframe traceがなく当該runの根本原因を断定しない。後続PR CI41269610914も同じUNKNOWN訂正groupのfalse !== trueで失敗し、同treeのhead CI41269608150は成功した。再実行だけでは解消せず、測定器の該当2箇所をPlaywright標準toBeFocused（8秒期限）に変更する。対象は変えず、focusしない・別対象へfocusした場合はFAILを維持する。製品のfocus処理・公開条件・APIは変更しない。

局所about:blank検査は遅延focus成功、focusなし拒否、別対象focus拒否の3件PASS・通信0。これはassertionの性質だけの検査であり、React全groupの代替ではない。ローカルcheckoutにbuilt CSSがないため全groupは新SHAの通常CIで確認し、その成功前には実T1を起動しない。41269610914の架空artifactと過去失敗は保持する。

認証Backend APIも同じ固定CLERK role/method/status分類を使い、backendRequest booleanでbrowser側FAPIと区別する。失敗応答の本文は読まず、fetch例外のmessage/causeも保持しない。FETCH_EXCEPTIONはfetch呼出しがthrowしたことだけを示し、DNS/TLS等の原因確定ではない。

## 初回Preview転送の分類だけを行う停止診断

`DIAGNOSE_PREVIEW_REDIRECT_ONLY` は同じ専用workflow/ref/Environment/attempt1/期待SHAとfresh配備receiptを要求する。既存runner提供OIDC URLのguardとclaims検証後、Nodeのfetchで固定Previewの`/admin/login`へGETを1回だけ送る。HTML/document要求、Cookieや保存sessionなし、redirect:manual・20秒期限。browser/Clerk API/testing token/session/fixtureは開始しない。通常live経路・redirect禁止・host・権限は変更しない。

Secretはこのstepへ渡さず、Clerk Secret/DB資格情報やAPPLYが渡された場合も接続前に拒否する。依存installと通常T1 stepは診断modeではskip。入力はconfirmation=DIAGNOSE_PREVIEW_REDIRECT_ONLY、expected_runner_sha=レビュー済み完全SHA、identity_receipt=同じfresh JSON。停止診断専用のresult.jsonだけを7日保存する。

3xxの場合だけLocationを一時parseし、同じapp/configured Clerk/既知Vercel/otherとparse・HTTPS・userinfoなし・default port・fragmentなし等のbooleanへ変換する。configured Clerkは固定期待instance origin、既知Vercelはhttps://vercel.com完全一致。近似hostを含めない。全結果stopBeforeFollow=trueで、origin一致でも追従許可にはしない。URL/path/query/header/body/token/生例外は出力しない。Locationの値を取得するのはこの承認済みruntime処理内だけで、手元へ原文を回収しない。

非3xxでも本文やClerkを読まず停止する。completed/exit0は分類処理の完了だけを表し、HTTP200・Vercel信頼・認証・T1成功の保証ではない。Node fetchは先のbrowser route.fetchとクライアントが異なるため、その診断GETでの観測として区別する。転送先originだけでも、307を発行した主体や正当なhandshakeまで確定したことにはならない。追加followや実T1は別の判断を必要とする。

## callback送信前で止まる2 GET診断

`DIAGNOSE_HANDSHAKE_CALLBACK_ONLY` は同じref・Environment・attempt1・完全SHA・fresh配備receiptのガードを使用する。Secret配達と通常T1はskipし、OIDCの要求・claims検査後、新規nonpersistent Chromium contextの `context.request` で固定app/login GETと既存の厳格なSDK契約を通ったClerk handshake GETだけを行う。各GETは自動redirect/retry0、20秒、OIDCはappだけ。page navigation・ClerkJS・Backend API・testing/sign-in token・session作成・fixtureへ進まない。最初の応答や外向き契約が不一致なら2 GET未満で止まる。

Clerk応答のLocationはメモリ内だけでparseし、headerの個数/型/長さ、absolute/relative、scheme/userinfo/port/fragment、固定return origin/path、既知queryの存在/空値/重複、追加query有無をbooleanだけへ変換する。未知query名・値・URL・path・nonce・header/body・生例外は出力しない。`callbackContractMatches` は現在の通常callback guardとの一致を表すだけで、全trueでも第三GETは絶対に送らない。任意db_jwtの不在booleanは契約失敗とは別。診断完了exit0は観測処理の完了であり、認証/T1成功ではない。

contextのCookie jarはorigin単位で通常の送受信を行うが、読取/export/importしない。Clerk側でclient/nonce等が作られ得る。localCloseConfirmedはローカルcontext/browserを閉じた確認で、provider状態の削除/失効ではない。記録先は専用result.json、固定キーのbooleanのみ。通常live経路とcallback許可条件は変更しない。

検査: `node --test tests/issue118-handshake-callback.test.mjs`。合成Location全条件・通常callback guardとの照合・最大2 GET・全条件でcallback停止・例外/Secret不配達を検証する。実サービスのcallback値は保存せず、実実行の結果と合成PASSを区別する。

## 初回documentだけのhandshake例外

分類後に別途承認した[限定handshake](issue118-initial-handshake-candidate-20261101.md)を通常CI認証の最初のdocumentにだけ適用する。既存の新規nonpersistent context・global headerなし・claims検証済みtoken()を維持し、OIDCはappだけへ送る。固定SDKの順序で最大3転送/4 GET、各fetchの自動redirect/retryは0。API writeや後続navigationのredirect禁止は変更しない。initialHandshakeの固定stage/HTTP status/count/booleanを結果へ保存し、HOLD/証跡保存不明ではClerk Backend API前に停止する。document-readyを認証やsession失効確認に読み替えない。

## 原本T2/T3/T4の呼出し接続（未有効化のmanaged候補）

既存入口の`prepareOriginalBatchRun(input)`は、原本から投影する`prepareOriginalScenario`へ既存の4つの純粋ledger関数を直接注入する。新規のCLIや認証経路は持たず、`runLive`、`--ci-apply`、workflow、従来のT1一件用承認は変えない。TS読込みは既存依存`tsx/cjs/api`を使い、この関数を呼ぶときだけ行う。

純粋adapterを注入する従来形に加え、`input.managed`を渡すと、一度だけのT2→独立T3→独立T4を準備する。`mode: PREPARATION_ONLY`、親run UUID、別のT2/T3/T4 run UUID、17個の異なるoperation UUID（T2/T3各8とT4のM02）、freshな固定配備receipt、A/B別のowner evidence・context/page/access、T4 evidence level、task/CI所有の永続claimDirectoryが必要。既存`runLive`・CLI・workflowはmanaged入口を呼ばない。

Bの期待Clerk IDとAppUser IDの組は、既存ローカルの`main19-execution-readiness.json`、`main19-source-db-review.json`、`owner-readiness.json`から識別できた。2026-10-28のmain19初期化receiptもVERIFIED/ownersMatchを記録しているため、期待Clerk IDを固定する。ただし現在のB店舗ID・認証済みcontext・freshなowner対応は未確認。雛形`readonly-expected-output.json`のshop欄はplaceholderで、実測値として使わない。CI authはA固定のままで、B認証・UI送信・無人live起動は未実装。新アカウント/鍵の作成や取得は行わない。

送信ごとに固定target、fresh owner evidence、context結合、管理画面URL、Clerk userと既存Development公開鍵guard、所有店舗GETを再照合する。GETは既存`protectedPreviewFetch`、唯一のwrite senderは固定API pathだけに既存OIDC header/claims guardを適用する。自動redirect/retryは0。T1の送信も行う`action()`は注入しない。取得した201 IDだけをowner/scenarioに結び、既存保護IDやscenario越境を拒否する。

同じclaimDirectoryを再利用し、親run、各scenario setup/STOP、各操作を`wx`作成+`fsync`で永続claimする。安全なJSONLを送信前にfsyncし、失敗はHOLD。claimやjournalは自動で消さず、新directoryへ移すことで再試行を回避しない。プロセス再起動後も既存claimがあれば拒否する。通常の合成testだけは自分が作成した一時fixture directoryを終了時に削除する。これは実fixture/監査履歴のcleanupとは別。

原本8件の非公開作成→初回公開→T2四件/T3二件STOPまでを一連で呼び、T2だけ原本E21/E23の乳CONTAINS非公開訂正→保存済み食品版の取得→別再公開へ進む。T3のロット割当HOLDを維持したまま、別run/別M02 fixtureのT4へ進む。T3の再公開は行わない。201実IDは後のreadback失敗前に保持し、unknown/不一致/中止で後続write・再送・自動cleanupをしない。独立SQL、既知状態の明示cleanupは別に必要で、結果は実サービス総合PASSを返さない。

`tests/issue118-original-entry.test.ts`はこの既存入口から原本投影/既存ledgerへ至るT2/T3の合成完遂と作成応答喪失を検査する。HTTP/Clerk/DB/Blob/秘密値は使わず、実認証やUI実行の証拠ではない。既存の`.test.ts` globに含め、workflowは変更しない。

T4は原本M02の800円/29状態を別fixtureへ投影し、非公開作成→初回公開→baseline→STOP→API readback→観測→終了を接続した。再利用元はPR119 `3e494a30766b054963fefd220846849e330206f4` の`prepareT4Observation({context,fixture,assertReadTarget,readPublicApi,evidenceLevel})`で、`scripts/issue118-t4-observer.mjs`と対応testをbyte不変で取り込む（実装blob `8a9859a40e7b9443342f95456e9c1e59dffaffb0`）。baselineはSTOP前、`afterExternalChange()`はSTOP確定・API readback後、最後に`close()`で所有ページの終了を別確認する。既存ページを閉じず、close不明は全体HOLD。page routeは非対象をfallbackし、既存context保護を通す。合成Page/HTTPモデルのイベントは実ブラウザ・cache・BFCache・実サービス障害の実証ではない。実試験は未実施。

## サービス応答観測の未有効化接続

同じmanaged objectの`execute()`が確定した後だけ、`prepareServiceObservation(config)`で1論理操作を準備できる。同時probeを許さず、unknownでrun全体をHOLDする。再利用元の`scripts/issue118-service-observer.ts`と対応testはPR119 `0ca5a48758b19434c45cbbd592c686478363d520` のbyte不変コピー（提供patch SHA256 `937f6e6075cbb1867d11e6448a74ebd78dab23ffaf69b5de80e26d5e83f4483d`）。新しい実行CLIやworkflow権限は追加しない。

current-run 201台帳とownerに結び、固定method/path/body hashと既存論理claimで通常配達/送信前遮断/上流応答後返却抑止を区別する。logical claimはfault modeをキーに含めない。routeのrequest frame→指定page→選択actor contextと、固定作成/編集URLを送信前に照合する。管理画面guard用pageと操作UI pageは同じactor context内で分ける。唯一の`route.fetch`はOIDCを固定appだけへ送り、redirect/retryは0。CREATE201の有効IDは相関header検査より先にledger・私有receiptへ残し、相関不明でも失わない。正常時もUI・所有APIを別照合し、上流200だけをDB成功にしない。サービス側のAPI照合範囲はID/版、STOP非公開、upload時の既存menu不変、CREATE名/非公開であり、全入力保存・独立SQL・画像表示の実証は別に必要。

Blobは既存の専用originだけを許可し、acknowledged objectのURLを私有claimDirectoryへ記録する。public log/artifactにはURLやheader/body/認証値を出さない。`observeKnownBlob`は1回だけ既知1URLのcredential-free読取adapterを使い、unknownを解除しない。wrapperは削除methodを公開せず既定RETAIN。新しいBlobキーは不要。現在runの新shop証跡がないためSHOP_SAVE/SHOP_UPLOADは拒否する。必要なら別途、明示承認されたshop対象・現在値・復元条件・所有対応を先に固定する。

画像修正の実証にはPR121 `3605dd7b3237f80b6a13c351f9bae2b1987513c9` を含む別の隔離candidate receiptが必要。最低限の製品差分候補は`NewMenuForm.tsx`、`MenuEditClient.tsx`、`ShopEditClient.tsx`、`lib/validators/upload-response.ts`と対応API/validator/browser tests・文書。依存/競合を確認した新SHA・環境・副作用を確定してから配備対象を決める。診断app `aa92dbb`へ移植も配備もしていない。現在の接続は合成のみで、normal image new/edit/shop、実Blob、実応答喪失、独立DB照合はいずれも未実施。
# 2026-11-02: corrected-Secret redeployment and one owner-A T1

The approved redeployment uses unchanged app source `ea9f28b14b7741276115abb8a33b331339526f5e`, Preview deployment `dpl_BQHQr4WYL9SVphQB1BpJZ8r2ad29`, immutable origin `https://clear-allergy-e2e-nv6akym6f-kaitoexe00-9350s-projects.vercel.app`. There is no deployment alias; `target.alias` is null. This is a new runtime after the user's Secret save, not a retrospective correction of earlier deployments. Ready/protection/source/scope must be observed again before dispatch.

The existing CI T1 entry performs one query-free marked GET to the same runtime before Clerk authentication. Only the existing 27 booleans are accepted. A complete observation is not enough: modern test classification, SDK Development classification, length condition, and absence of control/trim conditions must pass. Invalid/unknown observations HOLD before Clerk authentication or fixture creation. No Secret is extracted, trimmed, printed, hashed or transferred by this preflight. The GitHub-held Clerk key remains separately guarded by the existing CI adapter and owner lookup.

After preflight, the existing fixed Development handshake and official temporary owner-A ticket authentication run unchanged. Only a new owner-A fixture is used for initial publication, STOP, milk CONTAINS correction saved privately, food-version readback, separate republication, public API/page readback and final private cleanup. Initial publish and republish each have their own one-send ledger phase. Unknown writes or partial sessions HOLD; there is no write replay or cleanup of an unknown operation. SQL evidence is independent and not inferred from app API success. Previous receipts and fixtures remain untouched. T2/T3/T4/B/Blob observers stay disabled. No workflow permissions, credentials, main/Production settings or product semantics change.

The disabled T4 observer now imports the same pinned transport origin rather than retaining a duplicate old URL. This preserves its offline managed-run tests; no T4 entrypoint or call is enabled.
### Exact relative clean-return correction

Run 41366783027 passed the corrected runtime's key-class preflight but stopped at APP_CLEAN_TARGET_VALIDATE because the clean Location was relative. The driver accepts only the exact `/admin/login` literal on that third HTTP307 response and maps it to the same pinned absolute URL. No other relative target, host, path, query or permission is added. The failed run remains separate from a subsequent same-scope retry: its menu ledger was empty, no fixture existed, explicit session creation had not started, and both local context/browser closes were confirmed. Provider client/Cookie state may have existed; local disposal is not provider-state revocation. App redeployment or key changes are not needed for this driver fix.
### Frontend redirect observation and context HOLD latch

Run 41378398504 completed the four-GET initial document exchange with HTTP200, then failed before `Clerk.loaded` when a Clerk-origin GET returned 307. No owner lookup, Backend testing/ticket request, explicit session creation or menu write started. The original failed result remains unchanged. Its transport observations show eight same-class frontend redirects: maxRetries=0 limited each fetch, but did not stop SDK/browser retries across route callbacks.

The driver now latches a refused transport at route entry, aborting subsequent browser requests before header inspection or network send. The first Clerk GET redirect can be observed as 30 booleans only: request/resource/bundle shape, header-read completion, URL safety and comparisons to fixed origins. Named CDN comparisons are diagnostic categories, not permissions: every redirect still aborts. Unknown strings, URL/path/query/header values, cookies, tokens and provider exceptions are not retained. The observer neither follows a target nor changes workflow privileges or credentials. A new destination requires a separate decision before any follow; normal API write redirects remain prohibited.

The HOLD latch is rechecked after asynchronous header acquisition immediately before app/Clerk/Blob sends, and before every initial-handshake GET. This prevents a waiting route from sending after a concurrent route refused transport. Already in-flight network requests cannot be undone; this is not a claim of retroactive cancellation.
### Same-origin SDK script canonicalization

The fixed installed `@clerk/shared` URL builders generate the JS `clerk-js@6/dist/clerk.browser.js` and UI `ui@1/dist/ui.browser.js` sources on the configured Development frontend. The [official SDK source](https://github.com/clerk/javascript/blob/main/packages/shared/src/loadClerkJsScript.ts) was checked through Context7 and compared with the installed code. Explicit version options are used only in the driver's pure URL comparison, never configured on the product's Provider.

Only GET/script requests from the initial page's main frame, with an exact SDK-generated source URL, may handle one HTTP307 to a full numeric version of the same package and major. The raw destination must equal that same SDK builder's exact-version URL on the same fixed Clerk origin: no alternate host, userinfo, port, encoded/dot path, query or fragment. A single additional GET uses the existing context's URL-scoped Cookie jar and minimal Accept header; no explicit Cookie/Authorization/OIDC/Origin/Referer or testing-token headers are copied. The second response must be HTTP200 JavaScript with no Location; no third GET or retry occurs. All API/XHR/write/unknown-script redirects remain refused. Guards are rechecked before sending and fulfilling.

SDK imports are lazy so pre-install receipt checks remain dependency-free. Transfer observations are booleans, capped at64; SDK script URLs, versions, cookies and bodies are not recorded. Script response readiness is separate from `Clerk.loaded`, frontend identity, user authentication, menu flow and independent SQL. App ea9f28b/Preview are unchanged; no app deployment, credential or permission settings change.
For independent SQL correlation, the report includes run/operation UTC timestamps and the strictly validated UUID-only X-Request-Id response header when available. Header capture runs after created-ID/body outcome handling in a nonfatal finally block, bounded to one second; missing/failed metadata never releases an unknown write or replaces its original result. CREATE retains its separate creationOperationId. Expected audit action labels are expectations, not observations. reviewedFoodVersion is recorded only when the API actually supplies a safe integer or null; absence is explicit. Confirmation history must be checked against observed food versions and actors, not an unsupported uniqueness assumption. The parent owns independent read-only SQL; the driver does not obtain DB credentials.

### Transport failure during local termination: observation candidate

Run41386530452 completed authentication, the six acknowledged fixture writes, public API/page assertions, final private readback, and protected API comparisons. The parent independently confirmed the exact fixture and six audit events in read-only SQL at2026-11-02T04:12:52.883Z. The run remains FAIL_OR_INCOMPLETE because APP/GET/FETCH_EXCEPTION was observed. The original result is immutable. Its property insertion order, compared with the runner's assignment order, places the first failure observation after signOut returned and before closeIsolatedBrowser returned. This bounds observation to the local-close interval; it does not prove when that GET started or whether context cancellation, browser cancellation, or an independent network failure caused it. Terminal diagnostics had already reached the64-event cap, but firstTransportFailure was retained separately.

The local-only candidate records fixed lifecycle codes and UTC timestamps at authentication, app flow, cleanup, protected comparison, sign-out, context close, and browser close boundaries. The first failed route handler records its ordinal and start/completion lifecycle snapshots separately; it is not automatically equated with a concurrent route's first transport diagnostic. A first transport failure retains its lifecycle snapshot even after the bounded event buffer fills. No request URL/path/query/header/body/cookie/provider error is added. Close-observer failures do not prevent either close and independently invalidate observation completeness. No existing transport failure is ignored or downgraded, including one during closure; unknown writes and overall failure rules remain intact. Synthetic active-failure versus close-triggered rejection tests establish observation behavior only, not the real provider's cancellation cause. No new live run, fixture write, deployment, credential or permission change is part of this candidate.

The real Playwright1.61/Chromium loopback control lives in the existing preview-transport test. It uses real browser route/fetch/fulfill/abort calls, mapping only the guard's identity-reading seam to the pinned app; the actual network request remains on a local127.0.0.1 server and carries only a synthetic marker. No real OIDC, Clerk, app or DB request occurs. Normal HTTP200, a deliberately pending response interrupted by context.close, and a server-destroyed socket are distinct controlled cases, each requiring exactly one server hit and complete context/browser closure. Sandbox failure at LOOPBACK_GET with EACCES is kept separately from normal-permission success. The context-interruption failure may be delivered after context.close returns, during BROWSER_CLOSE_START: completion lifecycle is not proof of the causal operation. Both interrupted and independent failed GETs retain a transport failure. These controls validate the observer, not the retrospective cause or overall PASS of run41386530452. A later real read-only observation must retain request start/completion and both close boundaries, a fresh exact Preview receipt and existing owner guards; it must not create or modify a fixture, repeat T1, or loosen failure/redirect rules.

### Existing-fixture read/close mode

`DIAGNOSE_FIXTURE_READ_CLOSE_ONLY` selects `--ci-read-close` with the exact `FIXTURE_READ_CLOSE_ONLY` environment marker. It reuses the same branch/job/Environment, OIDC and official Clerk owner-A authentication; the shared `ISSUE118_APPLY` flag is required by the unchanged authentication guard and does not authorize menu writes in this mode. Secrets are delivered only to that dedicated step or the separately selected original T1 step. Receipt verification still precedes install/secret delivery; no workflow event/permission/trust changes occur.

After authentication, only the owned shop GET and fixed menu `cmvyqm8q30001jh07qly55qtw` GET are allowed under `/api/`. The snapshot must match the independently verified private/version96/food87/confirmation87/review-null/1000/milk-CONTAINS state; mismatch fails without changing anything. Non-GET app traffic is blocked before forwarding; other API reads are also blocked. Non-app browser traffic is restricted to the existing configured Clerk origin, with unrelated/Blob requests aborted locally. The existing adapter retains all Clerk/redirect/header guards. Direct app reads use the unchanged read-only API helper. The mode returns before any mutation-bearing T1 body, and action() separately refuses this mode; finally never writes cleanup. The ledger must remain empty. Sign-out and both local close stages remain observed, and any transport/closure/observation failure preserves FAIL. Diagnostic completion is not T1 success or a revision of an earlier run. Its fixed-schema artifact is named `issue118-read-close-<run id>`; no profile/session/trace/raw logs are retained.

### Held authentication-policy candidate after run41390901412

That run refused an APP request during authentication before fixture readback. Its owner lookup/ticket issuance completed and session creation was attempted, but activation was not acknowledged and SIGNOUT_UNVERIFIED remains. No provider session ID or provider creation timestamp was saved: createdSessionId existed only inside the activation evaluate. The owner and run window do not uniquely identify a provider session. No new login, session-list request, guessed termination or bulk termination has been performed. The original result is unchanged; this follow-up has sent no fixture mutation.

Compared with successful run41386530452, the Clerk adapter and base transport are unchanged; the new blanket APP non-GET policy is the relevant new restriction. Installed Clerk Next.js7.5.13 runs invalidateCacheAction before sign-in activation. Its server action deletes a Clerk cache-invalidation cookie, and installed Next.js16.4.1 invokes Server Actions by POST to the current page. The installed encoder produces empty arguments as `[]`. The actual refused request was not classified, so this does not establish whether that particular request was the cache action, telemetry or another request. The custom `/api/admin/auth/login` route writes auth audit/rate-limit data; it stays refused, not a read-equivalent exception.

The unenabled candidate allows a single cache-action POST only during AUTHENTICATION, to the exact clean fixed `/admin/login` URL, with an exact immutable-build action-reference pin, matching Origin/Referer, RSC Accept, UTF8 plain-text content type and empty arguments. Phase is rechecked after asynchronous header inspection, concurrent/repeated claims cannot both pass, and unknown inputs/errors refuse. Configured Clerk traffic still delegates to the unchanged CI adapter, including signout; other origins are not granted. No actual action pin has been obtained or wired. Current live-mode authorization remains unchanged; only an unpinned observation-only classifier is attached to the first APP refusal. It records fixed booleans and UTC, never action ID, header/body, URL/query or provider exception values.

Analytics is mounted by app/layout.tsx. Installed analytics2.0.1 has the legacy script fallback, while the [Vercel v2 documentation](https://vercel.com/docs/analytics/package) says build-time configuration can provide unique collection endpoints. Current deployment endpoints and actual telemetry occurrence are unverified. The legacy view/event shape is only a diagnostic category. Only exact reviewed endpoint pins could select local suppression without forwarding; the candidate's telemetry pin list is empty in live code. No wildcard collection routes or unknown paths are permitted. Synthetic pins in tests are not deployment evidence.

The network regression executes the installed ClerkProvider hook body in an isolated browser, uses the installed React/Next empty-argument encoder and real loopback HTTP requests, and covers activation cache POST, signout's Next16 no-POST branch, both refresh GETs, local telemetry suppression, refused audit/menu POSTs, and fixed direct shop/menu reads outside browser routing. Its RPC response and provider lifecycle are fixtures: it does not execute a real Server Action decoder, create a Clerk session, verify a deployed action ID, or prove real telemetry endpoints. The direct read-close API helper separately rejects every URL except the exact shop/fixture URLs before the existing no-redirect GET transport. No new dispatch is authorized by these local tests.

### Fixed deployment public asset inspection

`DIAGNOSE_PUBLIC_ASSETS_ONLY` uses the same reviewed branch/job/Environment OIDC trust and immutable app receipt. No Clerk key is delivered and no browser, Clerk API, login, session, fixture or DB operation runs. It GETs the public root HTML and only quoted same-origin `/_next/static/chunks/*.js` dependencies, at most 49 app GETs and 16 MiB total. Every request refuses redirects, uses no cookie jar, validates the receipt and OIDC lifetime, and sends OIDC only to the pinned app. Code is inspected as text, never executed. Unknown status/type/UTF8, limits or exceptions stop with a fixed stage code.

Only extracted public paths, content hashes, the exact named Next createServerReference binding for invalidateCacheAction, and literal telemetry bindings/categories are retained. No raw HTML/JS, headers, response cookies, OIDC or exception text is saved. Static references belong to that immutable deployment, not another build. A missing reference in the reachable public graph is UNOBSERVED, not permission to guess an ID or follow a Clerk redirect. Telemetry literals do not prove an actual collection request. This mode does not enable the held authentication POST candidate or revise earlier run results.

The later official Clerk Development dashboard follow-up identified one owner-A X11 candidate at the CI run creation minute, distinct from four Windows sessions. Only that candidate was revoked, and a normal reload confirmed it absent while all four other session IDs remained. This external cleanup is separately recorded in task evidence; the original run result remains SIGNOUT_UNVERIFIED/FAIL. No new login or dispatch was used for reconciliation.

The first public-asset run41400779428 fetched only root HTML; action and telemetry bindings remained unobserved. The corrected extractor tokenizes HTML start tags/attributes, skips comments and raw-text contents, decodes recognized HTML entities, and records fixed source-form counts. JS dependencies come from parsed string literals. A dpl suffix is accepted only when its single value equals the pinned deployment ID; unknown/duplicate queries, fragments, encodings, traversal and malformed selected tags cannot authorize requests. Accepted same-origin absolute/root-relative/Next-relative spellings deduplicate to a canonical query-free static path on the same immutable deployment. No new request host/path class or OIDC permission is added. Empty graphs are explicitly ROOT_ONLY/UNOBSERVED; a traversal completion is not proof the SDK is absent or that an auth POST is permitted.

Run41403072897 observed 12 script src and one script preload, all outside the original chunks-only recognizer; no raw source or query was retained. The follow-up therefore records document identity and broader source-shape counts before inferring a code graph. Root must structurally contain the exact ClearAllergy title and known app icon before any JS GET. Vercel/protection-title booleans are reported without title text. The permitted public namespace is Next.js `_next/static` JS (the installed router filesystem.js maps `.next/static` there), including build-id manifests; `_next/server`, other app routes, non-JS files and traversal remain refused. Only actual source references are followed. This is still a fixed immutable-origin, query-free, non-executing public-code read; no login or permission change.

### Login-document static inspection and compiled aliases

The clean local deploy checkout is ea9f28b14b7741276115abb8a33b331339526f5e. Its Windows CRLF package-lock SHA256 is 4ea5af215223cdf2759effb0ba4a61d68bfb5276a0ff6cb40aaf24788e9e9dd0 (Git LF SHA256 2efea34912a5c27d59c1675fa2cd3c6600a445ba2bd920de2a937258cb0a015c) and pins Next16.4.1, Clerk Next7.5.13/backend3.11.0, React19.2.7 and Analytics2.0.1; the runner lock was compared byte-for-byte, not assumed equivalent. No local `.next/static` or `.vercel/output/static` compiled deployment artifacts are present. These are source lock facts, not direct verification of remote installed package files. Asset modes normalize only CRLF to Git LF and refuse other source-lock content changes before OIDC. The first Linux CI (41420184741/41420192689) failed because the original byte pin used Windows CRLF; that failure is preserved. LF/CRLF positive controls and content/malformed UTF8 negatives cover the correction.

The locked SWC minifier produces a short imported factory alias from a synthetic createServerReference stub. Lexical import/const aliases are now resolved with the existing TypeScript binder; shadowed parameters and imports from another module are not trusted. Calls with the SDK export label and public reference-shaped argument but unresolved factory/signature are reported as UNCONFIRMED candidates, never a POST pin. HTML/comments/string contents are not action calls. Detector absence remains bounded by the inspected graph.

Run41422599211 inspected login HTML plus20 JS (825090bytes,23 app GET plus1 Clerk frontend handshake GET), with context/browser closure confirmed and no user authentication/session/action/fixture operation. It observed one unconfirmed bundled candidate; no confirmed factory binding. The candidate chunk is now byte-pinned to that observation. A follow-up records only callee/alias/declaration shapes, a numeric provider-module identifier and same-chunk module-like export booleans. Those structural observations never promote a candidate to a confirmed pin. No cross-chunk resolver or action permission is added; if local provenance does not close, it remains UNCONFIRMED. Raw HTML/JS and cookie contents are not retained.

The later parent-authorized module tracing needs reusable public JS bytes, which the earlier metadata-only runs deliberately discarded. DIAGNOSE_PINNED_PUBLIC_CODE_ONLY therefore reads only the20 already-observed static JS paths with exact recorded SHA256 pins. It does not GET root/login HTML, create a browser, invoke a Clerk handshake, deliver Clerk keys or execute code. Only verified public-code text/path/hash is retained in its separate artifact, never request headers, cookies, HTML or runtime credentials; stdout omits the code texts. Redirects/status/MIME/UTF8/size/hash mismatches hold, and unlisted dependencies are counted but never fetched. The committed manifest has no CLI/env override. This snapshot is for offline require/export tracing, not action execution or login authorization.

### Resolved client factory and initial offline candidate checkpoint

Run41428793406 (runner2270cff) succeeded with20 static app GETs, no HTML/browser/Clerk/session/fixture operation. Artifact13133426227 retains the byte-pinned public code for offline reuse; result SHA256 is037100328858def41cb93ebe67f5a4c16ff2404a63e55976629f642b9dc50548. Do not execute downloaded JS.

Offline binding/require/export inspection resolved caller41895 -> namespace95187 -> CommonJS35326 ->21413 -> React RSC64893. The original detector missed module95187's Object.defineProperty getters, not an absent factory. createServerReference's captured id/callServer, argument collection and WeakMap registration match the fixed Next16.4.1 RSC production source. callServer95187 ->32120 ->48658 matches Next's sequential ACTION_SERVER_ACTION dispatch. The actual Clerk before-hook calls the same factory-generated variable binding, and its Next15/16 sign-out branch skips the cache POST; the after-hook refreshes the router. These client associations passed independent static review. Historical UNCONFIRMED result JSON is retained, not rewritten. Server reference resolution, acceptance and side effects remain untested.

At checkpoint d10c822, createVerifiedReadCloseAuthPolicyCandidate bound only the observed reference002d5a40d57114e6b57c906dd03491ecf8c46419f0 to the same app source/deployment and a cloned fresh receipt. It preserved exact clean login target, Origin/Referer/RSC/type/empty args, authentication-phase recheck and one-claim semantics. That checkpoint's route integration was exercised only offline; the later approved read-close activation is described below. Its sole optional telemetry suppression is an empty local response to the exact observed insights script GET with script resource type, not a view/event POST grant or a general path exception.

The real Chromium regression uses the hash-pinned installed Clerk before/after hooks and actual Next RSC encodeReply([]), with all requests fulfilled or aborted locally. It observes one activation POST, the two fixed API reads, mocked Clerk signout transport and an app refresh GET, with no signout cache POST. Mutation/audit/signout-POST probes and policy/observer/identity errors remain refused. This is a network-shaped offline control, not real Clerk authentication, server action execution or E2E success. No new fixture or DB operation runs.

The refresh stub returns void, matching fixed Next sequential-router-queue.refresh. The fixture controller explicitly waits for its recorded refresh promises before closing; this is a test observation aid, not a claim that Clerk signout or the real runner drains refresh requests. The original close-time APP GET failure remains unresolved.

### Approved existing-fixture read-close activation

The subsequent parent instruction enables the verified policy only for --ci-read-close. The mutation-bearing T1 entry is unchanged. No workflow permissions, key settings, destinations, deployments or product authentication are changed. The same fixed Preview/owner is required; the existing fixture is read, never updated/stopped/cleaned up. Its two managed API GETs (SHOP and FIXTURE) are single-claim, status/timestamp recorded and required for a complete result. Browser document/static/RSC/auth traffic is separately observed; this is not a claim of two total HTTP requests.

In this diagnostic mode only, ticket session creation and activation are split. A validated non-secret session ID and acknowledgement time are saved before setActive; an exact GET to api.clerk.com/v1/sessions/{that ID} verifies owner and provider-created time within the creation window. No session lists, other session records, IP/activity data, JWTs or tokens are retained. Only a verified newly-created session is eligible for the one SDK signOut({sessionId}) attempt. A second exact read verifies an inactive provider status; local disappearance alone is insufficient. This one-session read-only reconciliation remains available after transport HOLD, without reopening writes or authentication. Unknown creation/identity/termination holds and cannot trigger another login, a retry, broad signout or Backend revoke. The prior T1 adapter behavior is unchanged outside this mode.

The report keeps frontend acknowledgement separate from provider termination and requires both, owner verification, the two managed successful reads and local closure before diagnostic success. Current session ID/owner/provider timestamp are explicitly authorized non-secret metadata, correlated by this run's report. Creation/activation/signout uncertainty remains FAIL or UNVERIFIED, even if later cleanup can be confirmed.

An approved request has a private one-use send permit. After the transport's separate asynchronous header lookup, its final pre-fetch callback rechecks phase, receipt and the same request's target/body without reacquiring a claim. Phase changes or expiry during that wait send nothing. The tracked SDK create/activate/signout evaluations have20-second deadlines; a timeout does not prove that a provider operation failed to commit, and cannot cause retry. Unknown creation latches transport HOLD. Only the already identified session can be reconciled.

Per-request sequence metadata joins route start, upstream fetch attempt/return/rejection, browser response/finish/failure, handler completion and close lifecycle timestamps. Only fixed origin-role/resource/kind/exception classes, status, timestamps and a query-present boolean are recorded, not URL/query/header/body/error values. Pending handlers after close prevent success. Close-phase failures are retained, not silently treated as expected cancellations; the original T1 result is not rewritten.

DIAGNOSE_LOGIN_PUBLIC_ASSETS_ONLY uses no Clerk Secret. A new nonpersistent browser context reuses the existing reviewed initial-handshake policy, exact app login/configured Clerk origin, SDK query contracts, app-only OIDC, max3 redirects/4 GETs and zero retries. It reads only the final login HTML and referenced public Next static JS. The real main-frame route is fulfilled with EMPTY text/plain and a default-src none CSP, so no remote HTML/JS/ClerkJS, login, session or Server Action executes. Other browser requests are aborted and hold the read. Cookie contents are never inspected/exported. The handshake may create temporary Development client/nonce/Cookie state; context/browser disposal is separately verified and does not claim provider client deletion.

Playwright buffers API replies internally. Final HTML is capped at1MiB before inspector parsing/copying; its body/hash is not retained. Static JS keeps streamed per-file/total limits, fixed immutable origin, canonical public static paths and redirect refusal. New fixtures, backend testing/sign-in token APIs, owner login, DB calls, auth POST permission, keys/trust/settings/deploy/main changes are absent. The root-only run41405423423 stays a separate observation (13 GET/637946bytes, no action references); this new mode does not retroactively change it or the failed T1.
