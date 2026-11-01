# Issue #118: 現行仕様とCI検査の対応

基準はmain `524ccdc2380a0854b9ec3ab3d2e3c4764bd514b5`。[公開ルール](../guide/rules.md#publication)と[Issue #118](https://github.com/Kaito-Iwase/ClearAllergy/issues/118)を優先し、研究上の未決事項を実装済み契約にしない。下表は検査の所在と境界であり、特定の実行が成功した証拠ではない。main CIはPRのbaseがmain/developの場合に起動する。`test/staging`の `6293d5a` は2コミット先で、同CIに同branchのpush/PR trigger、Preview表示・Blob分離・配備guard等を追加している。staging固有コードの検証結果はmainの証拠に流用しない。

| 現行の性質 | 既存検査・レベル | 不足と次の優先度 |
| --- | --- | --- |
| 4状態とUNKNOWN、不完全なマスタをFREEにしない | `tests/allergen-display.test.ts`、`tests/menu-publication.test.ts`、`tests/public-menu-api.test.ts` | P0: 境界値と欠損の負例を維持。実食品の安全性は検証外 |
| 保存と別公開、保存済み版との結合 | `tests/saved-menu.test.ts`、`tests/admin-menu-api.test.ts`、`scripts/check-saved-publication-browser.mjs`、`scripts/check-publication-database.ts` | P0: 実画面とAPI/DBを同じ試行でつなぐ検査は未実装。画面検査は架空HTTP、DB検査は別実行 |
| 内容変更は非公開保存し、公開確認は別操作 | `tests/menu-save-plan.test.ts`、`tests/admin-menu-api.test.ts`、`scripts/publication-database-regression.ts` | 今回のAPI負例は、乳状態の変更または既存APIの変更申告と公開要求を同時に送っても確認記録を作らないことを検査。UIの変更申告機能を復活させない。DB triggerの実行は別検査 |
| STOP・旧版・結果不明 | `tests/admin-menu-api.test.ts`、`scripts/check-saved-publication-browser.mjs`、`scripts/admin-menu-database-regression.ts` | 今回、APIスタブでSTOP後の旧版保存409と食品版不変を連続確認。実React＋架空HTTPではSTOP取消、公開反映未完了、旧フォーム入力保持・409、確定後に応答喪失した場合の結果不明を確認する。使い捨て実DB回帰にはSTOP後の旧版409・履歴不変と最新版の価格保存を追加。P0: 実app/DBとブラウザをまたぐ一連検査は不足。通常STOPだけでは食品版を進めない |
| 一貫した公開読取と停止後の新規取得 | `tests/public-read-callers.test.ts`、`scripts/check-public-read-snapshot.ts`、`tests/public-menu-api.test.ts` | P0: 既存の実DB競合とcaller検査を再利用。P1: 既開タブ・戻る・通信断を新規GETと別々に測る。既開画面の自動訂正は現行保証ではない |
| 店舗所有・Origin・招待・店舗保存 | `tests/admin-menu-api.test.ts`、`tests/admin-shop-api.test.ts`、`tests/admin-invitation-api.test.ts`、`scripts/check-owned-menu-database.ts`、`scripts/check-shop-database.ts` | P0: 未認証・他店舗・同時更新を既存レベルで維持。Clerkはテストダブルであり、実セッションの検証ではない |
| 画像の入力・保存先・失敗 | `tests/admin-upload-api.test.ts`、`tests/image-url-policy.test.ts`、`tests/upload-image-validation.test.ts` | P1: 実Blobの認証・uploadは別途隔離確認後の少数smoke。mainにstaging専用Blobテストはない |
| 公開検索・設定・レスポンシブ | `scripts/check-first-use-browser.mjs` の `public`、`tests/public-allergen-preferences.test.ts` | P1: 主要導線を保持し、利用者の理解や実店舗での有用性は別途人が評価 |
| 共通食材・旧新在庫・無信号 | #118 T2/T3/対照の架空台帳 | P1: CSVの正解集合は対応辺が欠落したM06を含む4件。無信号を検知成功とせず、混在在庫の対応を新仕様として決めない |

P0の残りは、実appと画面をつなぐ保存/公開、書込み確定後の通信断の一連観測である。追加した実DB route検査も実Clerk/画面を使わず、追加画面検査はHTTPを模擬する。P1はT4既開タブ・戻ると別owner、実Clerk/Blob、T2/T3・無信号の観測であり、架空データでも実サービス隔離・所有者・cleanupの確認が必要。各層に未検証が残ることは、単体test件数の増加で消えない。

## CIを二段に分ける

1. PRごと: 既存CIの架空データ・使い捨てPostgreSQL・Linux上の固定Playwright/Chromium・lint/typecheck/test/buildを維持。Secretsを使わず、forkやDependabotも同じ検査を受ける。`check-owned-menu-database.ts` は単独Node内でClerk呼出しを差し替え、実DBに対して既存route/所有権を検査する。これは実ClerkセッションやHTTP server全体の検証ではない。
2. 隔離Preview: 確認済みの専用DB・Development Clerk・専用Blob・架空fixtureについて少数の実認証/保存/公開/画像smokeを別途実施する。対象Deployment/source SHA・環境・所有者・cleanupと接続先を先に確定し、実行の可否と結果をPRの無秘密CIとは別に記録する。本人PCの一時セッションへの依存を完成形にしない。

一つの実Next serverに認証テストダブルを注入する方法は未確定。既存のModule loader差し替えはテストプロセスでの証拠であり、ビルド済みNextのmiddlewareとserverに安全に通る証拠ではない。本番認可を弱めるflagやbypassを前提にせず、安全なテスト専用手段が証明できなければ模擬HTTP画面検査と実DB route検査を分離する。

限定小試作: 既存の `6293d5a` のローカルwebpack成果物（模擬フォントで生成）を別Nodeプロセスから読み、Clerk module要求の監視を付けて管理GET関数を直接呼んだ。Clerk moduleへの通常のNode loader要求は観測0件、レスポンスは500で、Nextの実リクエスト文脈がない直接呼出しは実サーバー試験の代替にならなかった。DB設定は架空loopbackで、fetchは遮断した。この結果は他の注入手段の不可能性を証明しない。mainの実サーバー・middleware・実認証は未検証であり、現段階では層別検査を選ぶ。

CI結果にはPR head/base、checkoutされた実SHA（PR merge検証ならmerge SHA）、workflow・lockfile・run IDと検査の実行/未実行を残す。実サービスへの秘密をfork/Dependabotや未検証PRに渡さず、`pull_request_target`で未信頼コードを実行しない。runごとのfixtureを隔離し、未確定writeを盲目的に再送しない。raw credential・cookie・response bodyや実店舗情報を成果物に含めず、CI画面出力は架空データに限定する。

PR毎のtimeoutは現行CIの25分を基準とし、追加検査の時間・失敗率を実測して調整する。再試行で初回失敗を隠さず、環境や接続不足は未確認とする。実CIの所要時間・安定性はこの文書からは主張しない。配備guard、必須check化、実サービスの資格情報とcleanup、食品根拠や鮮度の製品契約はそれぞれ別の承認・判断事項。未採用PR #102/#105/#110/#112やharnessを前提にしない。

## 今回の追加範囲と残条件

| 項目 | 確認した層 | 残条件 |
| --- | --- | --- |
| STOP後の旧版・公開確認版 | 既存routeの架空HTTP、使い捨てPostgreSQL、架空HTTPの実React。正の不一致版も公開APIで拒否 | 実認証・実Previewを通す一連操作と、別タブ/戻るの実測は別途 |
| 画像API | 未認証、別Origin、他店舗、サイズ/形式、Blob例外、不正multipartをテストダブルで確認 | 実Blob・実配信・切断後の状態と掃除は専用環境で確認 |
| メニュー画像応答 | 新規/編集それぞれで500、空JSON、空URL、不正JSON、架空通信断は保存前に停止、入力を保持。正常応答は別の保存へ進む正の対照。後続の局所検査ではupload成功後の保存拒否・結果不明と、400後の明示的訂正を区別 | 数値等の応答拒否修正と回帰は別PR #121。実通信断・実Blobの残存は未実証 |
| 店舗画像応答 | `check-shop-save-browser.mjs` はupload後の400/409/428/500・不正200・通信失敗時の入力/選択画像保持を検査。PR #121が不正upload応答の拒否回帰と`shop-save`の秘密なしCI接続を追加 | PR #121の候補上の検証でありmain採用や実Blob成功ではない。店舗保存応答自体は #73 を参照 |
| 検索設定 | 保存、消去、別タブ通知、可能性ON/OFFと店舗内補足の条件を既存unitで確認 | 実利用者の理解や実環境の閲覧鮮度は対象外 |
| T2/T3とC | 正解台帳は別途維持。対応欠落のM06を含む4件が真値 | 人による操作負担・発見率は未承認の参加者検証、実サービス結果とは別に扱う |

### 画像応答の数値URL：探索FAILと別PRの修正を区別

2026-10-30の探索で、実Reactの新規メニュー画面へ架空のupload成功応答 `{ "url": 42 }` を返すと、画面は数値を拒否して停止する前に、次の架空POSTへ `imageUrl: 42` を渡した。期待した「保存要求を送らない」はFAIL。実Blobや実DBには接続していない。現行routeは `toTrimmedNullableString` より先に `menuInputSchema` で非文字列を拒否し400を返す設計である。数値がnullに変換され画像なしで保存されるという以前の推測は、通常routeについては根拠がない。後続PR #121は実route＋Clerk/Prismaダブルで数値400と空白の既存正規化を確認し、新規/編集/店舗の画面検証を修正した。元の探索FAILを削除したり、mainや実サービスで解決済みと扱ったりしない。

再現は `check-saved-publication-browser.mjs` の新規画面に架空upload 200 `{url: 42}` を与え、後続メニューPOSTが無いことを期待する負例で行った。仮定した架空応答による結果であり、変更後にPASSした他の空/不正JSONの検査と区別する。画面の型検証修正はこのテスト専用PRに含めず、別PR #121のSHAに対応した回帰結果で判断する。保存APIの非文字列拒否は変更しない。画像の公開範囲とorphan保持は #45/#55 の人間判断を維持する。

## 2026-11-01：残項目の照合と局所追加

この差分のbaseはPR #119の`1d1006e2531f1b35c5d8b410f9ab54f9c07dcd31`。PR #121の製品修正やPR #120の実サービスrunnerは取り込まない。以下は現行テストとの対応と追加理由であり、実行結果は別のpatch hash付き記録で確認する。

| 対象 | 再利用する検査と今回の差分 | ここでは証明しないこと |
| --- | --- | --- |
| STOP前後の通信失敗 | 既存のモデル更新後abortに加え、モデルを更新する前のabortを1グループ追加。同じ結果不明表示・入力保持・成功表示なし・自動再送なしを、モデル状態の相違と分けて検査 | 実APIへの未送信、DB確定、実応答取得後の返却抑止。`f.state`の変更は架空モデルのみ |
| upload成功後のメニュー保存失敗 | 新規/編集×400/409/500/モデル更新前後abortを1グループ追加。uploadと保存の2要求を区別し、File/入力保持・保存済み公開欄なし・後続の公開/自動再送なしを確認 | 実Blobの残存・回収、実DBの失敗、結果不明後の手動再送の安全保証 |
| 既知400後の訂正 | 新規/編集の正の対照を1グループ追加。明示的な訂正保存で同じupload URLを使い、同じFileを再uploadしない。新規作成は同じoperationIdを保持 | 500/通信不明後の再送承認、サーバ側idempotencyやDBの証明 |
| 店舗画像の入力保持 | PR #121の店舗画面19グループにupload成功後の保存拒否・結果不明が既にあるため追加しない | 実Clerk/Blob・画像公開範囲・orphan保持方針 |
| cross-shop API拒否 | 既存`admin-menu-api.test.ts`のGET/PUT/DELETE/STOP/別公開、`admin-shop-api.test.ts`のowner条件、`admin-upload-api.test.ts`の本人パス限定を再利用し、重複負例を追加しない | 実A/Bセッションのcookie・middleware・サービス上の所有者対応 |
| T4の既開タブ/戻る/取得失敗 | 既存の公開API500/404、snapshot整合、旧Phase 2の低忠実度viewer、旧Previewでの実タブ観測を分離して再利用。モデルの旧表示を再びPASSさせるだけのテストは増やさない | 現Preview/Nextのcache・bfcache・戻る時のGET有無・訂正到達。実request記録と障害注入が必要 |

既存`publication` browserモードが同じscriptを呼ぶため追加CI workflowは不要。実Nextへauth doubleを通したE2Eや、サービス全体の通信断を追加したという意味ではない。独立したT2/T3/無信号・B店舗と、M06を含む4件のCSV比較も残る。ownerの最終runner SHA・対象アプリSHA・新fixture・独立SQLの結果を照合してから合流し、模擬検査の成功でこれらを埋めない。追加した負例が失敗した場合は製品仕様を緩めず、FAILを保持して判断する。

## 2026-11-01：別ownerのDB境界と元設計の採点集合

基点はPR #119の`87db3bc8d5f7ccca3f01263ce45cefef75dee084`。最新mainを直接照合した値は`7d7d3ceb02dc58cc45b2daa3784855be70e882f7`で、食品・認可の製品コードを取り込む変更ではない。認証担当のPR #120と画像修正PR #121のファイル・workflowは編集しない。

### 今回追加する検査

- `scripts/check-owned-menu-database.ts`の既存使い捨てPostgreSQL検査へ、別々のUser/Shopを持つA/Bを追加する。Clerkの本人IDだけをテスト内で切り替え、双方の自店舗GETが200になる正例と、相手メニューへのGET/PUT/DELETE/STOP/別公開が404になる負例を同じ実DBで検査する。公開済みの架空2件・品目・食品確認/公開記録・成功監査・無関係sentinelの不変を照合する。過去の「他店への移動/削除との競合」検査は残す。これは実Clerk cookie・middleware・別ブラウザsessionの証明ではない。
- `scripts/issue118-stop-oracle.ts`と`tests/issue118-stop-oracle.test.ts`は、元のPhase 1の集合採点だけをコード化する。M06を含むT2の4件、T3の2件、別owner分担、結果不明を成功集合から除く処理、分母0のN/A、無信号と通常STOPの分離、全停止の過剰分を固定する。採点関数は観測の真正性を認定せず、総合PASS・実サービス検証済みという値を返さない。

出典は2026-10-29作成の`ClearAllergy-Issue118-検証設計.md`の「台本と期待行動」「採点、分子・分母」「比較上の追加制約」をLibraryから再読したもの。初回にはこのworkerの公式転送helperがmaterialize機能を利用できずCSV原本照合を保留した。後続の親側の公式Library取得・全17ファイル監査で、元ZIP（36,920 bytes、SHA256 `caf9556f660bff6516b8da6413fd323b0da794ba91c1269247f18a904a31b027`）とCSV実バイトの照合を確認した。expected-setsの7条件、physical-goldの56行と全分母は今回の集合と7/7一致する。M06はメニュー未登録ではなく、P-SAUCEの4辺のうちC対応表の辺だけが欠ける。個別CSV hashと確認元は`scripts/issue118-fixture-map.ts`の`phase1Source`に固定した。このworker自身のZIP取得成功、カード全文のローカル復元、Cの実行成功という意味ではなく、設計原本の全statusはNOT_RUNである。採点者専用のgoldを操作者へ渡してはいけない。

既存CIは`npm test`で新しい`.test.ts`を、既存owned-menu DB stepで追加DB検査を呼ぶ。workflowの追加・権限変更は不要。ローカルDocker CLIはあるがdaemon未起動のため、ローカル実DBの実行は未実施。ローカルの合成/単体結果と、同SHAで後続CIが実行するPostgreSQL結果を別に記録する。

### 実試験へ合流するときに残る条件

| 対象 | 元設計に対応するfixtureと観測 | 実行前に必要なもの・未証明の境界 |
| --- | --- | --- |
| B店舗の権限 | S1/S2の別owner・別context。本人の自店取得と相手の対象拒否を分け、各fixtureの前後を比較 | 既存Development ClerkのB本人IDと所有shopの照合receipt。今回のIDダブルDB検査で実sessionを代用しない。新account/keyを自動作成しない |
| T2 | S1のM01/M02、S2のM05/M06を担当別にSTOPし、他4件を維持。4件を真値分母にする | 元レシピ・E21/E23・初期CSVのhashは親側の原本実バイト照合済み。実fixtureへの内容取込み・実ID対応表・両ownerの実認証は別途必要。gold既知のAIによる指定4件停止と、操作者の影響発見を別集計 |
| T3 | S1 M01・S2 M05。新ロットの乳含有は既知、各皿の旧新割当は不明。STOP後に保留し、再公開しない | E31/E32と旧新在庫の元fixture。単一切替日・一律MAYへの置換・ロットモデル追加を正解にしない。食品判定を製品側で変更しない |
| T4 | M02。新規API、fresh page、既開tab、戻る、再取得失敗を別々に記録。後述の4ページ観測器を準備 | 実Previewへの配線・実行は未実施。各request開始/完了と表示を対応付け、API404とpageのnotFound（streamingでは200の場合あり）を分離。戻るのGET有無とbfcacheを区別し、戻る試験だけでbfcache実証としない |
| 画像 | 専用架空画像、uploadと後続menu/shop保存、失敗時のFile/入力保持とBlob残存を分ける | 実Clerk/専用Blobの確認と対象アプリSHA。現在の固定Preview `6293d5a`はPR #121の修正検証対象ではない。失敗/結果不明で再upload・削除・cleanupを自動再送しない |
| 通信失敗 | 送信前の遮断と、応答取得後にブラウザへの返却を抑止する条件を区別。原要求・API・独立DBを対応付ける | 1対象/1要求の注入許可と観測方法。模擬HTTPのabortを実サービスの未送信/確定後喪失へ読み替えず、unknownのまま再送しない |
| 対照 | C_PRICE=M04、食品不変C_STOP=M07、C_SILENTの現物影響M08と観測必要STOPなし | ケースごとに独立初期値を使う。通常完遂2機会と有信号8件・無信号1件を分離。人の初見理解・所要時間・A/B/Cの優位性は未承認の人試験へ昇格しない |

いずれも初期fixtureを既存stagingのメニューへ上書きしない。新専用fixtureの所有・target/source SHA・現在値を確定し、履歴を残した非公開化と独立SQLの結果を揃えてから実試験の完了を判定する。今回の変更は実サービスでのfixture実行を開始するものではない。

### 実Clerkへ置き換える前の準備状況

この棚卸しはPR #119の`4f9019b`と、読み取ったPR #120 checkoutの`6d1b6d505504608774e6f352209a1e51ad821618`に対するもの。後者のファイルは変更しない。CIの`check-owned-menu-database.ts`は接続前の使い捨てDBガード・専用User/Shopの作成削除を含むため、Clerkダブルだけを替えて共有Previewで実行してはいけない。既存`check-test-browser.mjs`もlocalhost専用・アカウントファイル・店舗更新・削除cleanupを前提とし、今回の共有Preview向けの入口ではない。

| 対象 | 既に利用できる部分 | 未配線・開始前に必要な部分 |
| --- | --- | --- |
| 別owner | CIのA/B実DB拒否と、T1の対象receipt・保護hash・unknown ledger | 実A/Bの別contextと自店正例、所有shop照合。T1の固定A/1メニューを単にBへ置換して全検査としない |
| T2/T3 | 元CSVの親側hash照合、既存採点、今回の`prepareFixtureStops`で8件の対応とowner別STOP前版を局所検査 | 元カード本文からの実fixture作成・保存/公開、実A/B認証、各メニューに独立した既存write ledger。T1のphase一回制限を緩めて同じSTOPを反復しない。計画を作れても実行許可・実成功ではない |
| T4 | M02と通常STOPの期待値、CIのfresh公開読取、T1の公開API/画面観測、後述の4ページ観測器 | 実T1 runnerへのguard付き接続と同一実fixtureでの実行は未実施。bfcacheの有無を未観測のまま断定しない |
| 実画像 | PR #121の3画面の局所修正・模擬回帰、既存の専用架空PNG例 | #121を含む確認済み対象アプリ、実Blob成功と後続保存/配信の同一run観測。共有Blobの削除/列挙・orphan政策を前提にせず、対象URLと所有fixtureだけを記録 |
| 実通信失敗 | 模擬画面の送信前/モデル更新後abortと入力保持、T1のunknown停止 | 1要求だけの送信前遮断、実応答取得後の返却抑止を既存保護transportと衝突せず配線。応答200だけで独立DB確定とせず、不明write後の再送/cleanupを禁止 |

`scripts/issue118-fixture-map.ts`は認証・DB・Blob・browserをimportしない純粋な準備関数で、CLIや自動実行入口を持たない。今回runの8件の一意なメニューID/作成operationId、S1/S2別shop/context、201確定作成、名前、公開中の保存済み版を入力上で照合する。既存保護3件、anchor、既知の旧T1 fixtureを拒否する。T2のM06欠落を拒否し、T3の次段をロット割当HOLD、T4を4観測待ちとして返す。各STOP後の食品版不変を期待し、現在版の再取得やledgerを代替しない。元レシピ/29品目の内容照合、contextの実認証、receiptの真正性はこの関数の保証外で、`PREPARATION_ONLY`を返す。採点者だけが使い、初見操作者の発見率/操作時間と混ぜない。

### T4の4ページ観測器と合成HTTP回帰

`scripts/issue118-t4-observer.mjs`は、呼出し側の既存context・対象再確認callback・保護済み公開GET callbackを受け、同一メニューを既開/戻る用/fresh/再取得失敗用の4ページで観測する。認証・STOP・DB接続・Secret取得・セッション出力・実行CLIは持たない。対象はloopbackまたは現在の固定Preview originだけ。既存T1 guard/transport/ledgerを取り込まず、呼出し側が各読取前に照合する。新Previewや別アプリへ自動追従しない。

baseline公開APIの対象IDと4画面の架空名を確認してから、呼出し側が別途外部STOPを行う。`afterExternalChange()`は1回だけ、既開画面、新API/fresh画面、履歴の戻る、1document GETの送信前遮断を別々に記録する。対象requestの開始/応答status/完了/失敗、画面の食品名/notFound、`pageshow.persisted`を値の絞られたJSONへ残す。戻る応答nullだけでbfcacheを判断しない。fresh API404だけやDOM取得不能は成功相当にならず、食品表示残存・未確認を区別する。STOP/独立DBは常に`NOT_ATTESTED`で総合PASSを返さない。

再取得失敗用のpage routeは該当URLのdocument GETだけをabortし、他要求には`fallback()`を使う。`continue()`/`fetch()`で既存context保護を短絡せず、headers/cookieを取得・付加しない。複数の自動試行やabort未確定は注入未確認になる。これはブラウザによる送信前GET遮断であり、実サービス停止・書込み応答喪失ではない。routeを使うとHTTP cacheへ影響するため、呼出し側のtransport条件も別記する。[Playwright 1.61のroute仕様](https://github.com/microsoft/playwright/blob/v1.61.0/docs/src/api/class-route.md)と[pageshow](https://developer.mozilla.org/en-US/docs/Web/API/Window/pageshow_event)を参照。

`check-issue118-t4-offline.mjs`は自作loopback HTTPと実Chromiumでこの観測器を呼ぶ。架空公開→非公開、変更なし、fresh API例外、fresh HTTP500/notFound、baseline HTTP500の5条件を比較する。baseline画面はHTTP200、fresh画面はHTTP200/404を要求し、500が同じDOMを返しても未確認とする。streamingを模したHTTP200/notFound、既開食品表示、戻るのrequest/イベント、対象GET遮断、1回制限と所有4ページの後片付けを確認する。ClearAllergy/Next/実DB/Clerk/Blobの結果ではない。既存`publication` browser入口へ1群を接続し、`.test.ts`は既存`npm test`へ含めるためworkflow変更は不要。実Previewの四観測、T2/T3の複数店舗実行、画像・実通信失敗の残条件は維持する。

### T2/T3の注入可能なSTOP操作器（原本payload投影と実接続は別）

`scripts/issue118-batch-stop.ts`は、201で作成済み・初期公開済みの今回8件を`prepareFixtureStops`で照合し、T2の4件/T3の2件へSTOPだけを実行する。CREATE、食品訂正、公開、retry、cleanup、再公開のメソッドはない。HTTP/auth/DB/Blob/ファイルの実装を持たず、target/actor照合、所有者GET、唯一の`dispatchStop`、証跡保存とrun claimを注入する。読取callbackへはmethod/path/bodyを渡さず、STOP送信は`expectedVersion`だけの固定bodyと固定menu pathを1回渡す。

PR #120の`newWriteLedger/beginWrite/holdWrite/confirmWrite`の純粋な状態管理を読み取り確認した。main基準branchから未採用live/auth moduleをimportしないため同じ状態管理だけを局所化し、既存4関数をそのまま注入できるportを用意した。**送信も行うT1の`action()`/click wrapperは注入しない。** 各menuに異なるledgerを1個持ち、phaseはSTOP一回のみ、唯一の送信callback以外から送らない。portを共有して2メニューへ使う入力は拒否する。

run claimは、8件の作成ID/operationId/版を持つmanifestを原子的に保存し、同じrunの再instance/別processを拒否する呼出し側の責務。単なる常にtrueのcallbackではこの保証にならない。既存の専用出力receiptと排他を使い、pending/unknownを自動解除しない。モジュールのinstanceも一回制限を持つが、永続排他の代替ではない。dispatch intentを保存してからactorを再照合し、元の版で一回だけ送る。原例外・headers・本文・食品テキストは証跡に出さない。

結果はdispatcher未呼出、既知HTTP非成功、未確定応答、既知応答/readback保留、確定応答＋所有者GET照合を区別する。送信callback開始後の例外/本文喪失/中止はunknownへ固定し、GETによる推定・後続送信・再送・cleanupをしない。中止はserver rollbackではなく、遅延commitもあり得る。全件確定後も他4件を含む8件のGET表現を再照合する。通常STOPで食品版/確認版/食品内容を変えず、公開反映pendingはfalseへ丸めず記録する。公開ページ・監査/全DB・実Clerkは`NOT_ATTESTED`で、総合live PASSを返さない。T3の次段は常にロット割当HOLDである。

`PayloadPack.expectedByMenu`は、**原本CSVから独立に投影した初期payload**を呼出し側が供給する。`fixturePayload()`は既存SavedMenu DTOから比較形を作る関数であり、実GETを期待値にコピーして原本一致と呼んではいけない。`CALLER_PROJECTED_ORIGINAL`では既知のZIP/recipe/physical-gold hashとのメタデータ一致を要求するが、CSV本文/投影自体を認定しない。今回workspaceに原本本文がなく、原本CSV→初期payload生成は未実装・共有待ち。架空の値で補っていない。

`tests/issue118-batch-stop.test.ts`は明示的なSYNTHETIC payloadとメモリ内adapterだけを使い、確定成功、送信前拒否、合成commit後の応答本文喪失、中止と遅延成功、別instance再送拒否、版競合、payload/所有者/品目差異、証跡失敗、非対象変化を確認する。実HTTP・実fixture・原本payloadの実行ではない。既存`.test.ts` globでCIへ入り、workflow変更は不要。
