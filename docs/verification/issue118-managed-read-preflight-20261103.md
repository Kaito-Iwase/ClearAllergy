# Issue #118: 編集タブの限定読取と書き込みゼロ preflight 候補

2026-11-03 UTC、クラウド環境のローカル候補。commit・push・PR更新・配備・設定変更はしていない。製品コード、schema、認可規則、workflow、実行予算を変更していない。実認証・T2〜T4・画像・独立SQLの総合PASSではない。

## 対象と重複確認

起動時の `/workspace/ClearAllergy` は `work` / `9e22cc237d00cb4f33d6740855db55f60128a0c0`、変更なし。本体runnerがなかったため、既存の専用branchだけを `/workspace/issue118-runner` へ隔離cloneした。

| 既存branch | 読取確認したHEAD | 今回の扱い |
| --- | --- | --- |
| `test/issue118-live-t1-20261030` | `b5a3c2c76bb0c5153f8cd09171124be22049b8e2` | 修正のbase。既存managed/T2/controllerを再利用 |
| `prepare/issue118-integrated-preview-20261102` | `8bf5bea476d5cf5a8dd6ac38713a2d393d7460b1` | 別担当のapp候補。取り込まない |
| `fix/issue118-image-upload-response` | `3605dd7b3237f80b6a13c351f9bae2b1987513c9` | 別担当の画像修正。重複実装しない |
| `test/issue118-ci-coverage-20261030` | `0ca5a48758b19434c45cbbd592c686478363d520` | 別の検証branch。取り込まない |
| `ci/issue118-workflow-registration` | `0a0e2e652a1cd33992d8df84c25bc2f263c0ceda` | 登録用workflow。実行しない |

Issue本文・commentと既存[managed記録](issue118-managed-suite-20261102.md)を読み、過去の合成PASS・古い103更新/7session枠を現在の実サービス成功へ読み替えていない。依頼元の最新台帳は66更新/14session、承認上限153更新/23session。この作業の実サービス更新・新規sessionはともに0で、台帳の消費を増やしていない。

## 原因として確認したことと未確認

1. `issue118-ci-auth.mjs` のSDK canonical転送は、元の `initialPage.mainFrame()` に限定されていた。T2が `context.newPage()` で開く編集タブはその条件を満たさない。許可されたClerk SDK major URLが307を返しても、二度目のGET前で拒否されることを合成試験と実Chromiumのloopbackで再現した。
2. `openManagedOwnedActor` のcontext guardはread-close用policyを再利用していた。ブラウザのAPI GETの許可対象は所有店舗と古い固定fixture 1件だけで、T2の「保存済み内容の確認」が行う `/api/admin/menus/:id` を拒否する。Node側 `access.read()` は別経路なので、所有API読取の成功だけではブラウザGETの成功にならない。
3. 元の実Preview障害のresourceType・Location全条件・最初の拒否記録は、このクラウド環境では取得できていない。上の欠陥は再現済みだが、元runの唯一の原因と断定しない。documentやAPI自体の307は今回も拒否する。新しいhandshake例外は追加していない。

## 変更と境界

`issue118-managed-read-page.mjs` は、所有API照合を終えた呼出側が作ったタブを一つずつ登録する。元と同じcontext・main frame・対象fixture・所有店舗の固定ページ・生URLが一致したGETだけが対象。query、fragment、別fixture、一覧API、子frame、未登録/閉鎖/release済みタブを拒否する。

登録済み編集タブの公開SDKスクリプトだけに、既存URL builderが検証する同じClerk・package・majorのcanonical版への1 GETを適用する。二度目のredirectは追わない。手動Cookie・Authorization・OIDC・testing token・Origin・Refererは二度目のGETへコピーしない。元contextのAPIRequestContextを使い、Cookie値を読出・保存しない。

登録と転送直前・転送応答後・fulfill前、対象APIの送信直前に、追跡済みowner、APP_FLOW、fresh receipt、transport状態、タブの登録/所在を再検査する。独立レビューで見つかったphase/receipt変化の欠落を修正し、source応答後・canonical応答後の両方に負例を追加した。

T2の観測とUI操作は、所有API読取後に対象タブを登録し、成功・失敗の両方で登録を解放する。元のwrite許可、単発送信、予算、unknown時HOLD、一般redirect禁止、固定signout条件は保持する。

## 準備したpreflight

`scripts/issue118-readonly-preflight.mjs` の `runManagedReadonlyPreflight({ actor, identityReceipt, snapshot, fixtures, record })` は、既に正規のadmissionを通って認証されたAのactorだけを受け取るcallable seam。新たなCLI/workflowモードやdispatchは追加していない。

1. fresh固定配備receipt、S1のowner/shop、追跡sessionと認証進捗14 booleanを検査。未確認の段階はfalseのままHOLD。
2. browserのnon-GET遮断を設置。想定外の更新要求は送信せずHOLD。
3. 現frontend session IDと追跡session IDの一致を値を出力せず検査。所有ページのHTTP/hydration/公開鍵/所有APIを照合。
4. checkpoint由来のS1/T2の最大4fixtureについて、非公開版・編集値・保存済み確認panel・公開API404・公開ページ・店舗一覧を既存の `observeT2RuntimePhase(PRE_WRITE_PRIVATE)` で照合。各owner読取でもsession一致を再検査。
5. 観測終了後と、最終route drain・登録解除・遮断解除の後に、route健全性・receipt鮮度・frontend session・所有APIを再照合。最初の失敗を保持し、最後の遅延route失敗・期限切れ・証拠保存失敗でもHOLD。

成功名は `READONLY_PREFLIGHT_COMPLETED_NOT_LIVE_SUITE_PASS`、`livePass` は常にfalse。新規session・token発行・保存・STOP・画像・claim・自動retry/cleanupを呼ばない。認証時の既存canonical session観測を使うため、preflightだけで新たなprovider独立確認を行ったとはしない。actorの正規finalizeと終了確認は呼出側の責務である。

## 今回の検証

Node 24.19.0 / npm 11.9.0、lockfileの既存依存を `npm ci --ignore-scripts --no-audit --no-fund` で準備。npm cacheは書込可能な一時ディレクトリを使用。依存定義・lockfile変更なし。Playwright 1.61.0、既存system Chromium 154.0.8037.57を使用し、通常指定のbundled Chromiumと版が異なる。

| 検査 | 今回の結果 |
| --- | --- |
| 対象6ファイルのoffline tests | PASS 81/81、skip 0。transport、認証adapter、登録scope、preflight、Chromium loopback、T2/controllerを含む |
| Issue118の追加offline回帰 | PASS 345/345、skip 0。`tests/issue118-*.test.mjs` から `issue118-live-browser.test.mjs` と `issue118-public-assets.test.mjs` を除いた範囲。両ファイルはbundled browser固定指定のため今回未実行。full `issue118-live-guards` 完了とはしない |
| Chromium loopback | PASS。未登録タブではsource307後のcanonical GETなし。登録タブではcanonical200→対象GET200。release後の対象GETはサーバー未到達。全HTTPをloopbackへ対応付け、実Clerk/OIDC/Previewへの接続なし |
| preflight/controllerの負例 | PASS。編集失敗、public500、panel不一致、close失敗、non-GET、認証段階欠落、同一ownerの別session、証拠保存失敗をHOLD。実サービスwriteなし |
| lint / diff whitespace | PASS |
| Prisma Client生成 | FAIL。Prisma配布先のchecksum GETが403。検査無効化や別経路取得はしない |
| typecheck | FAIL。生成ClientがないためPrisma export不足等。修正後の全体型検査完了とはしない |
| 通常 `npm test` | FAIL 220/230。10ファイルは未生成 `.prisma/client/default` の読込失敗。今回のrunner局所結果と区別 |
| `npm run build` | FAIL。prebuildのPrisma engine checksum GETが403で停止。Nextのcompile完了を確認していない |
| bundled Chromium導入 | FAIL。配布先403。既存system Chromiumで行ったloopbackと区別 |
| 実Preview認証・実T2〜T4・Blob・独立SQL | UNVERIFIED。この作業では実行なし |

局所再実行の例（既存system Chromiumを明示するクラウドBash環境）:

```bash
PLAYWRIGHT_MODULE_PATH=/tmp/clearallergy-browser-1.61.0/node_modules/playwright \
BROWSER_EXECUTABLE=/usr/bin/chromium \
node --test tests/issue118-preview-transport.test.mjs tests/issue118-ci-auth.test.mjs \
  tests/issue118-managed-read-page.test.mjs tests/issue118-readonly-preflight.test.mjs \
  tests/issue118-managed-read-browser.test.mjs tests/issue118-t2-reobserve.test.mjs
```

独立reviewは実装履歴を共有しない読取専用担当に依頼した。phase/receipt再確認不足と終了時の遅延失敗の見落としを修正し、対応する負例を実行。最終の独立読取レビューはPASS・残る重大指摘なし。同担当が81/81・345/345の提供ログを確認し、独立に `git diff --check` を実行した。これは実Clerk/DBや全体buildの独立実行レビューではない。

Playwrightのcookie/contextとrouteの扱いは[APIRequestContext公式仕様](https://playwright.dev/docs/api/class-apirequestcontext)、[Route公式仕様](https://playwright.dev/docs/api/class-route)を確認。Context7はこの環境のtool一覧に存在せず、実行していない。

## 実行再開に必要なこと

ユーザーはDevelopmentの試験用AについてRevoke all devicesを実行したと報告した。本人の終了報告として記録し、provider APIによる独立確認済みとは区別する。画面証拠がないことだけで同じ操作を再要求せず、以前のClerk Dashboard安全停止を別経路の再revokeで回避しない。

23:09 UTCまでの追加確認では、run `41637959671` のattempt 1・run番号38・終端failureと、artifact `13231827089` のdigest・runner SHAをGitHubの読取toolで独立確認した。旧jobログの最終出力も `HOLD_MANAGED_RESUME_ENTRY` / `sessionConsumption:14` / checkpoint未出力だった。固定配備のProject・SHA・READY・aliasなし・All Deployments保護をVercelの読取toolで再確認し、fresh identity receiptのdata-only検査は成功した。現在のクラウド環境そのものは `CI_IDENTITY_REFUSED` であり、CI変数を偽装していない。

依頼元から23:05:09 UTCの専用DB `clearallergy_main19` に対するread-only照合（11/11非公開・artifactの版/食品版/owner一致、成功audit66件・以後0件）を受領した。この環境ではSQLを再実行しておらず、row単位のcomparisonファイルも存在しない。誤対象だった別DB `neondb` の0件は根拠にしない。artifact取得toolが返したファイルのローカルmaterializeはnetwork tunnel 403で失敗したため、GitHubのdigest metadata照合とZIP bytesの独立hash検査も区別する。

現在の正確な状態・依頼元のattestation・不足条件は[再開可否JSON](issue118-preflight-readiness-20261103.json)に保存した。消費済みclaim `86648b4ca9755294b73e1eeff6260b9c1d90f628e91e74cdee896bd6abdcc6d6` の再送はしない。既存FULL入口は歴史的な66更新/12sessionを基準にA/B認証と後続更新を行うため、14session消費済みのA限定・更新ゼロpreflightの代用にはならない。古いread-close入口の7session枠も使わない。

認証前に必要なのは、原本result/claimsと構造化された照合結果へのアクセス、14sessionまでの消費・終了台帳（A本人報告とB未照合を維持）、新しいA限定の単一claimと14→15の事前charge、修正版callableを正規CI内で実行する承認済み入口である。既存Environment名・contents/actions read・id-token writeという設定情報だけでは、現在のjob固有OIDCやCI内secretをこのローカルprocessに与えない。修正は未pushで、既存workflowにA限定の読取専用入口もない。外部push/PR更新/設定変更/永続credentials作成の禁止を保持し、実認証は未試行のまま引き渡す。

## 23:28 UTCの本人承認証拠の追加

依頼元から本人の具体的承認を受領した。提案 `Sentinel_55739085c014819190e6476618507501` は、同じ試験環境だけで既実施操作を再送せず、累計153メニュー更新・通常21ログイン＋復旧用2枠＝上限23ログインへ広げて残りの実試験を行うもの。本人は `Sentinel_6ed8010ed9fc8191bbd2f2c19d2215e5` で「いいよ」と承認した。受領時刻と本人の承認時刻は同一とみなさず、未提示の承認時刻は作らない。これにより上限承認の根拠不足は解消し、既存の `rebasedCompletionLimits` が153/23に一致することもdata-onlyで確認した。

Aの本人終了報告は承認済み範囲の会話証拠として受け入れ、provider独立確認済みへ変換しない。最初の7件の原本、旧Bの後続UI receipt、slot10 UI receipt、最新Aのprovider独立確認は未取得。前3件を取得済みとみなした全session終了証明は作らず、A本人報告だけを理由に同じrevokeを再要求しない。

A限定の再開では、認証前に新しいclaimと14→15のchargeを耐久記録し、失敗しても枠を返さない。最新run・artifact・SQL・review済みrunner SHAへ束縛し、global concurrencyと全run台帳を照合する。復旧用2枠を保持した場合、Aの1回を使った後の通常枠は6件（23−15−2）。残りメニュー枠は87回（153−66）。この算術は残り全試験の実行manifestや終了を保証しない。

23:28 UTCの再取得でもremote専用branchは `b5a3c2c`、workflowのblob SHAは `c519da2628a0d830834a5edf95b8217602073e0c` のままで、A限定読取入口は存在しなかった。FULL fallback・旧read-close代用・消費済みclaim再送はしない。依頼元が言及した「先の拒否」の対象操作・実行結果はこの環境のtool結果にはなく、拒否された操作を特定せずに再試行していない。本人の上限承認は、新規権限変更やClerk安全停止の迂回を許可するものには広げない。

その後、専用branchの `workflow_dispatch` run一覧をGitHub読取toolで89/89件取得し、対象workflowの38件を全件照合した。全38件がattempt 1・終端済み、実行中0件。消費済みclaimの一致はrun 38の1件だけだった。設定上のglobal concurrency `clearallergy-main19-live-fixtures` / `cancel-in-progress:false` も維持されている。[全run metadata記録](issue118-run-metadata-20261103.json)は操作/session台帳と区別する。runtime lockを取得した、新しいclaimを作った、各session終了を確認したという意味ではなく、実行直前には同じscopeでfresh再検査が必要である。

## A限定入口の追加承認と実装

本人は提案 `Sentinel_b783f51902548191a9667bb1e834bb54` に対し `Sentinel_3224f9754e248191b437d1cda6f6d180` で「はい」と回答し、同じ専用branchへA限定・メニュー等更新なしの入口を追加し、検査後に既存CIで最大1回の一時ログイン（累計14→15）と終了確認を行うことを承認した。この追加承認の範囲で専用branchへの反映とCI実行へ進む。main/PR本文/設定/新しい権限/credentialsの変更は含まない。

`APPROVE_READONLY_A_PREFLIGHT` は既存 `managed-full-resume` job、同じEnvironment、contents/actions read・id-token write、同じglobal concurrencyを使う別selectorである。FULLのdecode/download/admission/apply/exportはFULL selectorに限定し、A-onlyから呼ばない。共有の依存・browser準備は認証を行わない。

`scripts/issue118-readonly-entry.mjs` はsource run38・artifact ID/digest・app SHA・66更新/14sessionを固定し、実run metadataを全件再取得する。currentは正規jobのrunner SHA/attempt1/titleに一致する必要があり、同じA-only claimの過去run、別のactive run、sourceより後の別の完了runも拒否する。原本artifactはCI内で既存Actionsのdownload機能から取得する。metadataのdigestとActions取得結果を使う構成で、ローカルでZIPのbyte hashを独立再計算したとはしない。

認証より前に `charge.json` をwx/fsyncで14→15として記録し、別artifactへのupload成功後にだけ既存Clerk secretを専用stepへ配達する。失敗・結果不明もchargeを返さない。`auth-attempt.json` のwxにより同じjob内の再認証も拒否する。復旧用2枠は保持する。

新入口はS1のpermitしか発行せず、既存の所有ページ認証gateを通し、固定T2/M01のowner GET・編集タブ・保存済み確認panelのGETだけを検査する。「この内容で公開」は押さない。APP_FLOWのnon-GETは遮断し、既存の限定signoutとprovider session照合・個別local closeを行う。最初の失敗、終了時のroute失敗・receipt期限切れ・provider終了不明はHOLDで保持する。未取得の原本7件/B/slot10/Aの歴史的な終了根拠は出力に残し、新しいAの終了と混同しない。全試験PASSへの昇格は行わない。

追加後の局所検査は54/54 PASS、追加offline全体は350/350 PASS・skip0、lint・構文・workflow解析・diff checkがPASS。FULL以外の後続完了runを拒否する負例とfinalize中の遅延route失敗の負例を含む。追加部分も独立読取レビューで重大指摘なしを確認した。実サービス結果はこの検査件数に含めず、後続runの結果で別に報告する。
