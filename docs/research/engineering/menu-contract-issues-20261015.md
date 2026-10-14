# ClearAllergy メニュー・公開契約Issueの静的照合（2026-10-14）

対象: #38 / #40 / #41 / #43 / #46 / #47 / #48 / #49 / #51 / #56 / #57 の11件。アプリ基準は main `e26b6088b79a4a3eaa1812c171657581fb814b66`。GitHubのIssue・PRは親担当がread-onlyで取得した `issue-audit-records/issue-N.json` と `issue-audit-pr-records/pr-N.json` を使用した。現行実装、元の受入条件、判断記録、過去の検証報告を区別した。

## 主要な結論

- #38は元の局所的な所有店舗条件修復がPR #62でmerge済みで、受入条件の実DB反例／修復・正常契約・CIの記録もある。**完了整理候補**。店舗owner/isActive自体の同時変更や本番の実Clerk検証を、元Issueの未実装項目へ足し戻さない。
- #40 / #48、#41 / #51、#43 / #49、#47 / #57にはPR #70の採用結果が反映されていない。版なし・確認記録なし・force-static・commit後cache例外で既知の保存を500とする、といった**旧前提を現在の実装欠落として数えない**。
- PR #70の本文は会話で合意した実装と明記し、PUT/DELETEの版、食品確認、STOP、公開snapshot、動的取得、保存応答と作成再送の採用範囲を示す。ただし、旧HDの全完了条件、保持期間、利用者／店舗理解、配信鮮度SLO、旧client・混在配備の全運用を承認したとは読めない。**採用結果の同期と、残る契約・運用・現場検証を分ける**。
- #46 / #56の文書とpageの不一致は既に訂正済み。現在も公開可能メニュー0件の店舗詳細はnot-foundになる。**文書訂正済みと、404を正式な製品方針に選んだ判断は別**。HTTP streamingでは200＋not-found/noindexになる場合があり、ページの受入をHTTP404だけで判定しない。
- 実食品の正確性、原資料の真偽、未申告の仕入れ・工程変更、既に開いた画面／戻る／offlineへの訂正到達、保持・通知運用は残る。新機能候補としてCAS・食品確認・STOP・snapshot・pending・作成IDを再提案する必要はない。

## 確認方法と証拠の限界

`AGENTS.md`、README入口、関連guide、Issue本文と全comments、関連PR本文・merge情報、アプリ／schema／migration／tests／回帰runnerを静的に読んだ。PowerShellは `Console.OutputEncoding=UTF8` と `Get-Content -Encoding UTF8` を明示。rgが見つからなかったため `git ls-files` と `Select-String` を使用した。

canonicalのHEADは `f5ec73b`、既存dirty文書を保持した。下記主要19ファイルについて `git show e26b6088...:path` と現ファイルのUTF-8行配列を比較し、行数一致・差分0を確認した。したがってここで引用する行は固定mainに対応する。主要API2、食品helper2、UI3、公開page2、snapshot1、schema／migration2、guide3、検証文書4。その他のアプリ／tests／scriptsは親担当のGit比較によるmain同一性を前提とする。

アプリ・文書原稿・設定編集、stage/commit/push、GitHub公開操作、DB接続、アプリ起動、依存install、テスト実行は一切行っていない。新規成果物は本レポートだけ。`git status --short` およびworktree diffの呼出しはこの実行環境で `this operation must be run in a work tree` となったが、Git objectの読取と行比較は成功した。今回のテストPASSを主張せず、既存テストの定義と、過去PR／検証文書の実行報告として記載する。

過去のmock・CI・専用DB・loopbackブラウザ結果は、本番DB／Clerk／実食品／現場運用の保証ではない。PR #70のローカル最終187/187・専用DB・ブラウザ・CIの報告と、PR #71の限定された本番migration／架空デモ復旧記録は、日時・対象を付けた過去の証拠である。今回本番を再確認したものではない。

## 現物の根拠索引

以下のパスは canonical `C:\Users\kaito\Documents\Github\ClearAllergy` からの相対パス。

| 根拠ID | 現物・行 | 確認できること |
| --- | --- | --- |
| E01 | `features/admin/menus/server/adminMenuRoute.ts:244-246,437-498,525-547,593-647` | PUT/DELETEの期待版必須428、古い版409。最終writeはid＋server shopId＋version。所有対象が消失／移転すれば404。fields・links・reviewはtransaction、制約確定後に最終版を返す。 |
| E02 | 同 `adminMenuRoute.ts:651-670`、`app/api/admin/menus/[menuId]/stop/route.ts`、`MenuEditClient.tsx:459-473` | 独立STOP。同一Origin・認証・所有店舗・portfolioを確認し、版／フォーム／新reviewなしで公開フラグを下げる。古い全フォームを新しい版へ自動接続しない。 |
| E03 | `prisma/schema.prisma:101-149`、`prisma/migrations/20261009000000_menu_food_review/migration.sql:26-135` | 編集版・食品版・確認版、作成ID／hash、MenuFoodReview。親・子・マスタの変更で版／公開を失効。現在食品版への記録のみ、DB生成snapshot／順／recordedAt、UPDATE禁止、現行記録DELETE／全TRUNCATE失効、最新記録で公開判定、旧公開停止。 |
| E04 | `features/admin/menus/food-review.ts:6-17`、`server/food-review-save.ts:6-33`、`schemas/menu-input.ts:14-26`、`lib/allergens.ts` の `isFoodReviewCurrent` | 価格／構図と食品変更を区別。根拠・範囲・実確認日時・未解決事項を検証。checkedAtは入力者申告、recordedAtとactorはサーバー／DB側。直近5件の管理projection。 |
| E05 | `adminMenuRoute.ts:519-524,620-625,663-665`、`adminMenusRoute.ts:40-47,135-141,263-264,312-326`、`MenuItem` のshopId＋creationOperationId一意制約 | 既知commit後cache失敗は成功DTO＋publicRefreshPending。作成ID＋同一request hashは同じmenuを返し、違う入力は409。operationIdは任意で永久操作履歴ではない。 |
| E06 | `schemas/menu-response.ts:11-23`、`MenuEditClient.tsx:338-403,429-453`、`NewMenuForm.tsx:257-303`、`MenuListPageClient.tsx:142-161` | 成功ID／版／review／画像の検証後に保存済みへ移る。409で旧版と入力を保持。通信断・不明JSONで結果確認を促す。pendingは保存失敗と区別。組込みcreateはUUIDを使う。 |
| E07 | `features/public/shops/server/public-read-snapshot.ts:7-15`、`PublicMenuDetailPage.tsx:24,42-99,115-131`、`PublicShopDetailPage.tsx:33,50-127,148-167`、`storeAllergenSupplement.ts:4-9` | 公開読取はRepeatableRead。menu／links／master／補足に同じtxを使用。食品pageはforce-dynamic。DB利用不能は既存取得不能表示、schema／queryエラーを存在なしへ変換しない。 |
| E08 | `PublicShopDetailPage.tsx:59-68,148-167`、`docs/guide/rules.md:41,61`、`docs/verification/menu-food-review-20261009.md:68` | 稼働店舗でも公開メニューなし、または公開可能メニューなしならnot-found。旧「0件表示あり」を訂正。not-foundのHTTP200＋noindexの場合を説明。 |
| E09 | `docs/guide/architecture.md:74-88`、`docs/guide/rules.md:47-61`、`docs/guide/development.md:215-229` | 現行のAPI契約、編集版の不透明性、食品確認対象、migration／rollback、公開鮮度の限界、アラート配送未導入。 |
| E10 | `docs/verification/menu-food-review-20261009.md:23,70-80`、`menu-food-review-adversarial-20261009.md:13-40,44-72` | 明示承認範囲、7反例の修復、3周reviewと最終検証の報告。実食品、保持、作成ID寿命、混在配備／既存tabの限界を明記。 |
| E11 | `docs/verification/shops-recovery-20261010.md:7-16,24-36,40-64,82-86` | PR #70配備後のDB不整合に対し、承認された本番migration2件／32件停止／架空デモ32件再公開。これで本番migrationが常に未実施という10/9時点の前提も古い。実Clerk管理保存・Blob・全画面／全端末・実食品は未確認。 |

PR証拠: [#62](https://github.com/Kaito-Iwase/ClearAllergy/pull/62) merge `0e4303845a56370ff79239a77e2036e443192efa`（2026-10-06T15:58:06Z）。[#70](https://github.com/Kaito-Iwase/ClearAllergy/pull/70) merge `01137f3ca1236595b125f3831564d93c4cf967fa`（2026-10-09T15:56:26Z）、head `63ce4e69bf24af12d2338c1199b30785e7b49b93`。#70本文に「合意した実装依頼」「既存Issueを自動closeしません」とある。GitHub review配列に承認レビューは見当たらず、本文の独立subagent reviewとは別である。PR #71の本番復旧文書はmainへmerge済み。

取得時点のassigneesは11件とも空。#38は `human-review,risk-high`、#40/#41/#43/#46/#47は `agent-blocked,human-review`、#48/#51/#56/#57は `agent-blocked,risk-high`、#49は `agent-blocked`。commentsのハーネスowner記録とGitHubのassigneeを混同しない。labelは10/4評価を残しており、現在の採用結果やReady判断をlabelだけから確定しない。

## 11件の状態一覧

優先度は今の残作業に対する提案。P1＝実店舗用途や公開運用の前に扱う、P2＝採用結果・契約の整理または計画的な検証、P3＝旧前提の整理。自動close／label変更の指示ではない。

| Issue | 現在満たす条件・根拠 | 残る条件／判定 | 次手・依存・優先度 |
| --- | --- | --- | --- |
| #38 最終write所有店舗条件 | E01。PR #62 merge、移転／消失404・no partial mutationの実DB／CI報告。現在のDELETEは親の版付き削除＋FK cascade。 | 元scopeは完了整理候補。即時owner取消や実食品は元scope外。現在版の回帰結果は親担当が別に確認。 | #62／#70結果を受入チェックへ同期し、人間がclose判断。新ACL／全所有権モデルへ広げない。P3。 |
| #40 同時編集contract | E01/E03/E06/E09。integer `version` CAS、PUT/DELETE必須428・競合409、入力保持。#70で採用記録。 | 旧Issueの「revisionなし」は古い。旧client期限・混在writer／rollback対象・保証populationをHD記録へ対応付ける整理が残る。 | #70採用契約を#40へ追跡可能にし、実際に残る移行検証を#48と分ける。P2（実店舗移行条件はP1）。 |
| #41 確認根拠・再確認・保持 | E03/E04/E10。食品版別追記snapshot、根拠／範囲／checkedAt／recordedAt／actor／未解決、価格と構図除外、食品変更失効。 | 「dialogのみ」は古い。保持期間、削除／復元、秘密／privacy、現場確認負担・資料の真偽は未確定／未検証。 | 採用済みsnapshot範囲をHDへ同期し、保持・削除と店舗taskを具体的な判断対象へ。#40/#51、実店舗用途は#39と責任境界。P1。 |
| #43 許容鮮度・障害表示 | E07/E09。新規read dynamic＋単一DB時点、利用不能表示、既存tab自動配送なしの説明。 | ISR前提は古い。許容age、offline／戻る／既存tab、負荷、障害時の契約・数値SLOと配備測定は残る。 | #49の測定設計を現在のdynamic/snapshotへ更新。新規取得と既存画面の契約を決める。#47/#57にも反映。P1。 |
| #46 0件店舗page判断 | E08。0件not-found、guide訂正済み。 | 旧「guide矛盾」は解消。Aを正式方針にした決定者／理由／対象の記録はこのIssueにない。B/Cは未採用。 | 既存境界を正式化するか、別の製品目的があるかを決定記録へ。#56。P2。 |
| #47 commit後失敗API意味 | E05/E06/E09。success＋pending、運用log、unknown保持、create ID／hashの限定重複抑止。#70に採用範囲。 | 「既知commitがcache例外で500」は修復済み。通知責任者・配送、operationId寿命／旧client／削除後、unknownの回復手順は残る。 | Aのみ／B／Cの旧選択肢を現行の具体契約へ更新し、運用検知を#43/#57へ対応付ける。P2（未検知の実運用はP1）。 |
| #48 CAS実装 | E01/E03/E06。CAS、triggerによる版増分、食品失効、fields／links／review atomic、409入力保持、実DB同時PUT報告。 | CAS未実装前提は古い。元本文missing400→現428、DELETE非対象→現対象、revision候補→version採用。全順序・混在配備・旧writer移行証跡は同義で完了とはしない。 | #70採用差を受入へ同期。現在のDB実証と未確認の配備互換を分けて完了判断。#40。P2。 |
| #49 実配信鮮度測定 | E07/E10。旧static反例・修正後のlocal production fresh取得、補足停止・snapshot実DB反例／修復報告がある。 | F01–F08全測定は未完。Preview・2tab/back/focus/offline・障害／負荷・観測分布の証拠なし。設計のみの完了も不可。 | 10/4測定設計を現在SHAへ更新し、専用fixture／URL／副作用範囲を指定して観測。数値閾値は#43。P1。 |
| #51 食品版への根拠対応 | E03/E04/E06。DBが現行版／snapshot／順／時刻を固定、最新記録のみ、未解決で停止、原材料・復帰・子／master変更で失効、rollback回帰。 | model未実装前提は古い。retention/privacy、実店舗task、移行完了条件の対象差、実物と根拠の対応は残る。公開根拠projectionは採用されていない。 | 技術部分を#70結果へ同期し、運用受入を#41へ分離したうえでscopeを再定義。#40/#48/#41。P1。 |
| #56 0件pageと文書の一致 | E08/E10。文書訂正済み、正常公開／inactive／全停止の回帰定義と過去報告。 | 不一致の修復は済み。HD-08決定記録とpage受入の対応は未整理。HTTP404と画面not-foundの区別が必要。 | docs branchの完了整理候補として#46判断と照合。B/Cの画面新規実装を勝手に追加しない。P3。 |
| #57 commit前／後／unknown区別 | E05/E06。後段cacheだけの例外捕捉、既知saved/pending、create重複抑止、通信断／不正JSON入力保持、削除行保持。 | 旧500前提は修復。専用DB＋代用Clerk/cache、UI応答simulationを実認証E2Eと混同しない。通知運用・unknown再確認・操作ID寿命・既存tab鮮度が残る。 | 現行outcome matrixを#47に同期し、未確認の実セッション/network/運用検知と#43契約を別gateへ。P1。 |

## Issueごとの受入条件と改善案

### #38 メニュー更新・削除の最終書き込みを所有店舗で制限する

元の要求は事前read後のshop移転／消失で404を返し、双方のfields・links・他menuを変えず、正常契約・origin/auth/portfolio/publish/audit/cacheを維持すること。Issue本文の9/28環境不足、10/4のawaiting-reviewは現在のmerge状態より古い。10/4完了commentはPR #62／同一HEAD CIと専用PGの5組を報告し、PRは10/6merge済み。

静的に満たす: E01の最終条件、P2025の所有対象再確認による409/404分岐、DELETEのFK cascade。`tests/admin-menu-api.test.ts:94,153,296,307,325,351` は他店404、版なし／旧版、移転／消失を定義。`scripts/check-owned-menu-database.ts:62-98` は実PGの4競合＋正常CRUD、`scripts/admin-menu-database-regression.ts:70-146` は保存結果・links・成功監査／cache抑止をassertする。`docs/verification/issue-38.md:15-23` とPR #62に過去実行範囲がある。

次手は元チェック項目を現在の証拠へ同期する整理。利点は修復済み認可Issueを再実装しないこと。副作用は誤ったcloseで実運用の限界まで保証したように見えるため、owner/isActive即時取消や実Clerkは元の対象外として明記する。検証は親担当の現在の静的／通常テスト結果と既存PG証拠を照合し、過去結果を今回実行した扱いにしない。新ACLの導入は本Issueの残条件ではない。

### #40 同時編集時のcontractを決める

元完了条件は選択・理由・反証・決定者／日付、保証population／環境、I03の受入・移行／rollbackへの反映。10/4commentの「schemaにrevisionがない」は現在成立しない。#70本文はinteger編集版、PUT/DELETEの必須428・競合409・対象なし404を採用済みと記録し、E09も説明する。`version` は編集回数ではなく不透明tokenで、trigger／link更新で1保存に複数進む。

残りは技術案Cの再選択ではなく、#70の意思決定に追跡をつけ、旧clientの扱い・mixed writer・rollback範囲を元HDの条件へ照合すること。PR #71の移行・公開復旧は対象DBの過去証拠だが、全旧端末・全運用writer・混在配備試験の証拠ではない。改善案はAPI契約表（GET token、PUT/DELETE428/409/404、STOP例外、再読込、旧writer拒否、切戻し）を採用結果として整理すること。利点は仕様理解の揺れを減らす。副作用は古いclientを復活させる互換期間を設けるとCAS保証を失うため、文書のためにenforceを緩めない。検証は実ルート／旧clientfixture／triggerによる版更新を合わせ、現在の428を400へ直す提案にはしない。

### #41 確認の根拠・再確認・保持を決める

採用済みなのは食品版に結び付く追記snapshot。`checkedAt` は店舗が原資料を確認したと申告する日時、`recordedAt` はDB記録日時、actorはserver由来であり、すべての日時をserverが観測した事実とはしない。食品の変更対象と価格／構図の除外はE04/E09に具体化済み。旧updatedAt・AuditLogから確認記録をbackfillしていない。

残受入は保持期間・アクセス／privacy・削除と復元、営業秘密の収集範囲、再確認の店舗負担、資料と実物の対応。`MenuFoodReview` はメニュー削除でcascade、直近5件表示は保管上限ではない（DBには過去記録が残る）。公開に根拠／actorは出さない。自動日数失効はなく、未申告変更の自動検知もない。

改善案は保持／削除／復元と確認担当の運用契約を決め、根拠参照に必要な製品・資料版・範囲を店舗taskで確認すること。利点はsnapshotを「資料の真正性保証」へ誤解させず、収集過多も減らす。副作用は保存延長の営業秘密／privacy／費用、短縮・cascadeによる事故時復元不能、確認負担による入力遅延。検証は架空の仕入れ変更・同文字列・未解決・価格のみ・削除／復元を店員taskと隔離DBへ分ける。保持期間や実店舗の保証をAIだけで決定しない。

### #43 許容鮮度と障害時表示を決める

現在の選択に近いのはB（critical read dynamic）で、食品本体・品目・master・補足はRepeatableRead。旧「force-static/revalidate60＋別読取」は既に修復されている。snapshotは訂正前に開始した要求へ旧食品＋旧CONTAINSを一貫して返す場合があり、訂正確定後の新規取得と同義ではない。タイムアウトP2028は取得不能へ渡し、schema/programming failureをnotFoundとして隠さない。

残受入は許容age、停止の到達範囲、offline／戻る／既存tab、障害時表示と負荷の判断。動的取得だけで「全利用者へ即時反映」を保証しない。改善案は新規HTTP取得と既に保持された画面に別々の受入条件を定め、#49の結果から必要なtab更新／経過表示を比較すること。利点は到達保証の誤認を減らす。副作用はpolling等による通信・DB負荷、offline機能／可用性、状態切替で操作中の画面が変わるUX。実装を追加する前に製品判断・対象端末・測定を揃える。現行dynamicを新規提案として再導入しない。

### #46 menu0件時の店舗ページを決める

旧根拠「guideとコードが矛盾」はE08で解消済み。現物はactive＋published flagのsomeを初期条件とし、さらにcurrent food review／master／全品目の公開可能性をfilterし、0件ならnotFound。停止メニューだけ／不完全だけの店舗も店舗情報を公開しない。

元HDの完了は単なる動作確認ではなくA/B/Cの理由と保証範囲を決めること。現在A相当の境界が維持され、docs訂正は0件画面の承認ではないと明記する。改善案は既存の境界を採用方針に位置付ける判断を記録し、B/Cを選ぶ場合のみ店舗情報公開・準備中文言・URL／検索遷移の受入を新たに定めること。Aの利点は既存公開範囲を維持する最小整理、副作用は利用者が停止理由を知りにくいこと。B/Cの利点は状況説明、副作用はメニューが公開されない店舗情報を新たに露出し、状態を誤解させる可能性。コードの存在だけでAを承認済みにしない。

### #47 commit後失敗のAPI意味を決める

実際の採用契約は「正常成功DTO＋optional publicRefreshPending＋運用log」と「MenuItemに結び付く任意operationId／hash」であり、旧A/B/Cのどれか1個と単純対応しない。永久idempotency storeはない。#70本文はDB確定後cache例外を保存失敗へ変換しない採用結果を示す。E05でCREATE201、PUT200、DELETE／STOP200の各pendingがあり、E06で保存後の表示を区別する。

元条件の採用理由・責任者／通知・保証範囲はIssueへ同期されていない。改善案は「保存確定」「公開更新処理未完」「応答を確認できず結果不明」の契約を表で整理し、固定operation名の運用eventを担当者の調査手順へ接続すること。利点はblind retryや重複作成と、保存成功を公開到達保証とする誤認を減らす。副作用はアラート過多・通知先／保持の責任と費用、operation履歴を延長するならschema／retentionの拡大。既存logの存在を通知配送済みとはしない。`docs/guide/development.md:229` は配送未導入を明記する。

### #48 [I03][Blocked] メニューrevisionによる競合検知

元期待は同版から1成功・他409、敗者入力保持、勝者のfields／linksだけ保存しtrigger自動停止と整合すること。現在はE01/E03で実装済み。`tests/admin-menu-api.test.ts:153` はPUT/DELETE428・古い版409の書込なし、`scripts/admin-menu-database-regression.ts:148-176` は古い全フォームとDELETEがCONTAINS訂正を壊さず、同版を読んだ2実PUTで200/409になる検査。`scripts/food-review-database-regression.ts:17-44` はstale writerと食品変更／子変更の版対応を検査。`scripts/check-allergen-cards-browser.mjs:187-211` は409後に版を自動rebaseせず入力を保持する実コンポーネントfixture検査。

差異は仕様更新対象: missing revision400という旧案に対し428採用、DELETEを非対象とした旧scopeに対し追加済み、revision名／backfill1案に対しversion0開始。0は過去編集数ではない。単にコードと旧本文が違うから不具合とはしない。

残受入は元T03の両順序・異menu対照・全writer/trigger spike・旧client／混在配備・rollbackの証跡の網羅性を、現在の検査一覧へ対応付けること。改善案は元T03ケース表に実証済み／未実証を埋める。利点は既存実装を再作業せず残穴だけ確認できる。副作用は局所200/409だけで全配備raceを保証したようにまとめる危険がある。新スキーマ導入を再提案せず、必要なら未確認の専用環境試験だけを分ける。

### #49 [I04][Research] 公開情報の実配信鮮度を測定し契約を決める

10/4最後のcommentはF01–F08を具体化し「測定値空欄」と記録。現在はE10の旧static反例と新規local production取得の反映検証、E07のsnapshotが追加済みである。E11の実配備ページ復旧は対象画面の限定確認で、F01–F08の実配信鮮度分布測定ではない。

元受入は再現手順・時間系列・環境・limitsを提出しHD-05判断材料にすること。Preview URL、専用fixture、時計同期／観測間隔、2tab/back/focus/offline、DB障害／負荷／配信環境差は未完。旧F07の「主情報／補足別read」をそのまま現コードの穴と扱わず、同txの一貫性と新しい要求の境界を測る設計へ直す。

改善案はsourceSHA付き測定計画を現在版へ更新し、local・Preview・本番の証拠を分けた時間系列を作ること。利点は#43を想定秒数から決めないこと。副作用は操作・障害注入による負荷／データ変化、計装が時刻を変えること。専用対象・副作用範囲を確定し、SQL／障害注入は別に許可された環境だけ。観測最大値を保証上限にしない。本担当は実測をしていない。

### #51 メニューrevisionに確認根拠を結び付ける

「review model／現在性が未実装」は古い。E03/E04の食品版とsnapshotは編集tokenとは別。最新recordの未解決で停止、過去／未来版INSERT拒否、DBが保存済み内容と順・日時を生成、記録UPDATE禁止、現行record DELETE／TRUNCATEで古いclean record復活を遮断する。`tests/menu-food-review.test.ts:9,18,27,32`、`tests/public-menu-api.test.ts:97`、`scripts/food-review-database-regression.ts:54-160` にrollback・master失効・未解決直接INSERT・旧版／未来版・lock待ち・TRUNCATEを定義。E10には実DB反例／修復の報告がある。

元受入のretention/privacy・店員task・復元／migration範囲は別。価格のみは保持、imageUrlは食品変更、構図は保持という採用結果へ旧open questionを更新する。根拠公開projectionはしておらず、原資料の真正性や食品検査は機能外。E11の本番架空デモ記録を実食品のreview達成としない。

改善案は技術対応表を#70へ結び、#41に残る保持・現場task・実物照合を受入として分離すること。利点はシステムが守る時点対応と、人が確かめる資料／食品を混同しないこと。副作用は技術部分だけcloseすると現場責任が消えたように見えるため、残運用のowner／依存を先に付ける。必要なら独立した運用受入へ分けるが、新しいIssue作成・公開操作は今回行わない。

### #56 公開メニュー0件の店舗ページ仕様を一致させる

元本文は404ならdocs訂正だけ、空表示なら先にempty contract決定としていた。現在はE08の文書訂正が済み、動作変更なし。`scripts/check-publication-propagation.ts:82-105` は全停止後の新規not-foundと食品情報不在を検査し、E10はstreaming200をHTTP404期待から区別した経緯を残す。`tests/public-menu-api.test.ts:133,148,160` はAPI側のinactive／非公開／不完全を検査するが、page独自0件分岐を直接実証する同じ証拠とはしない。

次手は#46の採用判断を照合し、docs branchの受入として完了整理すること。利点は修正済みのguideを再訂正しないこと。副作用は「404を製品判断済み」と過大記載しやすい。検証はactive＋0menu、active＋全非公開／不完全／未review、inactive、正常公開について、pageの食品・店舗情報不在／not-found／noindexとAPI404を別に記録する。B/C新規pageは承認後の別scope。

### #57 Commit後failureと保存結果不明を区別する

現行matrix: 入力／公開条件／版拒否は書込前400/428/409等、write前の制約拒否やrollbackが確認できた保存失敗は保存未成立、DBcommit既知＋cache失敗は成功DTO＋pending、通信断／不正成功DTOはUIが結果不明として入力／一覧行を保持。一般DB例外をすべて「commitなし」とは判定できず、DB応答喪失等でcommitを確認できない場合はunknownとして扱うべき検証条件で、今回未検証である。現routeは一般例外を500へ返しており、全DB例外のcommit有無を個別に観測する実装とは説明しない。作成ID＋同hash再送は同menu、異入力409、IDなし／menu削除後は永続重複保証なし。削除応答を失って再送し対象がなければ404で、永久操作履歴はない。

`tests/admin-menu-api.test.ts:220` はDB保存失敗で成功IDを返さない。`scripts/admin-menu-database-regression.ts:178-222` は実DBreview failure rollback、cache代用throw、create再送、STOPの保存内容／record保持。`scripts/check-allergen-cards-browser.mjs:219-300` は不正DTO／作成ID、通信断、削除不明JSON／通信断、保存入力保持、saved/pendingの実コンポーネント検査。ただしClerk／cacheは代用、browser保存responseはsimulationであり、実管理E2Eや運用event配送ではない。

残受入は#47の採用契約同期、運用eventの調査／通知試験、実セッション＋network lossの確認、#43のfreshness契約。改善案はこのmatrixをUI／API／専用DB／運用の証拠と1対1で整理し、unknownを最新GET・一覧確認へつなぐ担当手順を実施すること。利点は保存済みを未保存と断定する誤認と二重createを減らす。副作用は再読込で入力を失うUX、GETの一時障害、操作IDのretention拡大。現UIは入力保持済みなのでそれを新規開発要求にしない。店舗保存後のcache例外（#73）は別経路であり、本Issueのメニュー改善を店舗にも実装済みと一般化しない。

## 親担当へ渡す確認事項

1. #38のclose提案は元受入の完了整理として扱う。#40/#47の選択は#70の採用結果へ同期し、旧HUMAN_DECISION_REQUIREDを単純に「何も決まっていない」と報告しない。
2. #41/#51の実食品／retention／店員task、#43/#49の既存画面・配信測定、#47/#57の通知・unknown回復を、明確な残scope・owner・環境・受入へ分ける。
3. #46/#56は既に文書訂正済み。製品判断記録が見つからない点と現在not-foundを区別し、HTTP404だけをpage成功基準にしない。
4. #48は採用済みCASを再提案せず、旧案との差（428、DELETE、version0、triggerの増分責任）と、未実証のmixed versionsを照合する。
5. 現在の通常テストは親担当の実行結果に接続する。本担当は静的照合のみであり、DB・アプリ・ブラウザ・実サービス・外部調査を実施していない。

統合時の独立コードレビューにより、#57の一般DB例外をrollback確定と読める説明を訂正した。既存review insert failureのrollback実証を、その限定ケースの証拠として保持し、DB応答喪失の結果不明を既存試験済みへ昇格していない。今回、親担当も通常テストは新規実行せず、#73/#74の隔離7ケースだけを別記録にしている。

本レポートはIssue修正／closeの提案材料。GitHubの本文／label／stateは変更していない。
