# 食品訂正・状態表示のE2E追補（2026-11-05）

以下の既存節はWindowsローカル検証時点の記録です。公開後のLinux結果とmain取込前の状態は[末尾の追補](#linux-ci-bcc4c0cd)へ分け、当時の未実施事項を現在の全体未検証と読み替えません。

[実行手順](../guide/e2e.md) · [現行公開条件](../guide/rules.md#publication) · [検証状況](../guide/verification.md#food-state-e2e-status) · [未採用の鮮度比較案](../research/product/public-view-freshness-options-20261105.md)

## 対象と変更範囲

PR #128のhead `1a8fa04699b0472b43ba930138055c5c3bde0b95` を基点に、独立branch `test/e2e-food-states-20261105` で検証した追補です。既存PR branch `test/practical-e2e-main-20261105` へ追加2件と関連文書を反映する変更です。開始時のremote mainは `51adcb23945b80bb34b110d2d0f263d29629a821`、PRはDraft・未mergeでした。PRの初期9件と追加2件を区別します。本記録の数値はWindowsローカル実測で、公開後のCI・依存監査は[PR #128](https://github.com/Kaito-Iwase/ClearAllergy/pull/128)の最新head・run別の結果を参照します。main・Productionへの反映とは区別します。

実行コードの変更は `e2e/admin.spec.mjs`、`e2e/admin-fixtures.mjs`、`scripts/database-regression.ts` だけです。前2者は2件の追加と公開要求の版・本文検査、後者は既に非公開となったメニューへのUNKNOWN更新を説明するPASS文言の訂正です。DB回帰のassertionを緩めていません。製品UI/API、公開・認可条件、schema/migration、依存、CI定義、Vercel設定は変更していません。

影響を確認した範囲は管理フォーム・保存済み確認欄・管理保存/公開API・公開API/詳細表示・DB公開制約です。既存canonical checkoutの別作業9件を保持し、PR #128用のクリーンなworktreeに対する追補をこの9ファイルへ限定しています。既存の旧候補を混入させず、このheadからの追補だけを保存しています。

## 受入条件と検証層

| 条件 | 今回の検査 | 補完する既存の検査 |
| --- | --- | --- |
| 公開中の食品訂正は非公開となり、保存された食品版に別の公開操作が必要 | 公開済みからUIで原材料と品目状態を変更。保存200後に管理GETで食品版増加・公開対応null・非公開・保存内容を検査。公開API404とfresh詳細の対象なし・食品本文不在。確認欄の登録内容を見直した後、`{expectedVersion, publicationAction:"publish"}`だけを別PUTし、現行食品版に対応した公開を検査 | `tests/admin-menu-api.test.ts`、`tests/menu-publication.test.ts`、`scripts/food-review-database-regression.ts` |
| CONTAINS・MAY_CONTAIN・FREEの意味を保存から表示まで取り違えない | 卵CONTAINS・小麦MAY_CONTAIN・乳FREEを管理GETと公開APIのraw statusで照合。公開詳細の**同じ品目行**に対応する文字ラベルがあることを検査 | `tests/allergen-display.test.ts`の4状態分類・混在保持、`tests/public-menu-api.test.ts`のFREEとSTORE_HANDLED分離 |
| UNKNOWNをFREEとして公開しない | 既公開から卵UNKNOWNをUI保存。管理GETでUNKNOWN・非公開、確認欄の卵/未設定1品目/公開ボタン不在。最新の版で直接公開PUTして400、管理GET不変、公開API404とfresh詳細の対象なしを検査 | `tests/menu-publication.test.ts`、`tests/public-menu-api.test.ts`のUNKNOWN/欠損/不正値の拒否、`tests/allergen-display.test.ts`のUNKNOWN分類 |
| 既存の権限・競合・STOP・入力保持を維持 | 既存9件をそのまま含めて再実行。他店拒否、A/Bそれぞれ古い編集PUT409と同じ画面からのSTOP200、模擬500時の入力保持を維持 | 公開4入口のunit/API/実DB回帰はそれぞれ既存入口を保持 |

UNKNOWNを含むメニューは[現行仕様](../guide/rules.md#publication)で公開できません。UNKNOWNの公開画面を成立させるfixtureやgateの緩和は追加せず、通常経路の拒否と防御的な表示分類を別層で検査します。FREEのraw statusを導出値STORE_HANDLEDへ置換せず、食品確認履歴を新規生成して公開させることもありません。

管理GETは実APIを通した永続化の観測です。今回のE2E各メニューに対する独立した生SQL照合ではありません。DB制約の回帰は別途実PostgreSQLで実行します。すべて架空情報で、食品安全や実際の食品確認を検証するものではありません。

## ローカル実行と証拠

環境はWindows、Node22.15.1、Next16.4.1、Prisma Client/既存engine6.19.3、PostgreSQL17.11、Playwright1.61.0と既存Chromium1228です。依存は同一lockfileの既存コピーを再利用し、schema SHA `2a070e6ba596f61981e3294eb92e835348c8a86a11e22dde2a1b3797a9075729`、lock SHA `4ea5af215223cdf2759effb0ba4a61d68bfb5276a0ff6cb40aaf24788e9e9dd0` が一致しました。Prisma・npm package・ブラウザーの取得や再生成は行っていません。

外側の所有者スクリプトが127.0.0.1:55463に新規DBを作り、既存 `setup-ci-env.ts` でmigrationと架空公開fixtureを準備しました。そのDBへ `node --import tsx scripts/check-ci-database.ts` と `node e2e/run-ci.mjs --allow-font-download` を実行しました。共有runnerはサービスDBを借り、実Nextを127.0.0.1:33162で起動し、そのコピー内のClerk境界だけを模擬します。実User/Shop照会・所有権・保存API・DBは製品実装です。500失敗の1件だけは従来どおり明示注入です。

初回は新worktreeにGit管理外の `next-env.d.ts` がなく、source copyのENOENTで停止しました。DB回帰は成功しましたが、E2Eのbuild・ブラウザーは未起動です。所有DBの停止・削除を確認後、既存の同一版型宣言だけを再利用しました。この準備失敗をテスト成功へ含めません。

続くrun `ci-e372ff2b-3f49-4427-a80c-ed9092e8a1d8` は11/11 PASS（37.2秒）でした。後始末で今回の監査27行を除去し、既存User/Shop/MenuItem/AuditLogのfingerprint一致、外側の前後件数 `1|1|3|1`、共有runner終了後のDB稼働、所有Next停止・一時コピー削除、最後に外側の所有DB停止・削除まで確認しました。

最終差分のrun `ci-d4f749ea-f01a-4e6b-ac13-a8efc209e694` も11/11 PASS（37.0秒）でした。DB回帰37グループ・元データfingerprint/件数保持・監査27行の後始末・Next/一時コピーの終了・外側の所有DB停止/削除を再確認しています。`playwright.log` に食品保存後、再ナビゲーション前の旧原材料表示が `previousIngredientsVisible:true` と記録されました。これはheadless実行のその時点の観察で、実background復帰や遅延上限を検証したものではありません。

| 検査 | 結果と境界 |
| --- | --- |
| 通常設定のNext build | `node node_modules/next/dist/bin/next build` がexit0、26.469秒。製品の `next.config.ts` とClerkを使い、E2E aliasなし。型検査・静的生成も完了。生成済みClientを再利用したためnpmのprebuildは実行しておらず、通常の `npm run build` 全pipeline成功とは区別する |
| 全体lint | `node node_modules/eslint/bin/eslint.js` exit0。最終の実行コード3ファイルも限定再確認 |
| 型検査 | E2Eコピーの元sourceを `tsc --noEmit --incremental false` で検査しexit0。元worktreeの同じコマンドもexit0（18.344秒） |
| unit/API回帰 | 指定1件を除いた298件が、所有するTEMP/TMPを明示した実行で298 PASS、fail0。通常の除外なし `npm test` は未確認 |
| 標準Playwright列挙 | `node scripts/browser-runner.mjs e2e --list` exit0、2ファイル11件。列挙はブラウザー実行の成功とは別 |
| 実DB制約 | `scripts/check-ci-database.ts` exit0、37のPASSグループ。UNKNOWNの既存PASS文言も実際の既非公開の前提に合わせた |
| 独立レビュー | 実装履歴を渡さない読取専用reviewでコード3ファイルの重大指摘0。最終コード3ファイル・文書6件・保存済み結果の照合も完了し、重大指摘0。鮮度比較案は別担当が独立批評し、反映後の文書も重大指摘0 |

単体回帰の既知の除外名は `report preflight preserves existing files/links and rejects directory junctions` です。以前記録されたWindows hardlinkのEPERMを再試行・迂回していません。またsandbox既定TEMPが `sandbox.{…}` を含む実行では、既存 `next-root-glob.test.ts` のabsolute root/lint検査3件が失敗しました。変更前のclean head `1a8fa046` でも同じ3件が失敗（残り1件成功）し、今回候補だけの影響ではありません。メタ文字を含まない所有TEMP/TMPで全選択298件が成功しました。これは当該一時パス条件を変えた結果であり、任意のメタ文字入りroot pathへの対応を修正・証明したものではありません。既存のパス検査コードは変更していません。

通常設定buildとE2Eコピーbuildには承認済みのNoto Sans JP公式取得先 `fonts.googleapis.com` / `fonts.gstatic.com` を許可しました。依存・engine・browserを追加取得した結果ではありません。ホスト別の全通信captureは実施しておらず、取得範囲はソースと設定で確認しています。

ローカル補助証拠は作業領域の `e2e-coverage-followup-20261105/`、共有runnerの `test-results/ci-<run ID>/` に保持します。各 `lifecycle.json`、`playwright.log`、DB回帰、unit/default TEMPの失敗・clean baseline・TEMP指定後の結果、通常build、型検査、lintのログを区別しています。認証値・cookie・秘密ファイルを成果物へ含めません。

## 鮮度の判断と未確認

今回の公開停止/訂正後のDOM確認は新規ナビゲーションです。held-page観察は非assertの補助情報であり、古い表示の保持を正しい仕様として固定しません。OSの実background復帰、BFCache、SPA履歴復帰、RSC失敗時の表示、到達遅延・負荷を測った試験でもありません。

独立批評を反映した[比較案](../research/product/public-view-freshness-options-20261105.md)では、明示reloadを基準に復帰時再検証・取得状態表示・期限・poll等を比較します。復帰時再検証を優先比較・技術検証する候補とし、取得中/失敗時の旧内容保持・警告・遮蔽、時刻/期限の意味、継続閲覧や履歴復帰の対象範囲等は未決です。製品の鮮度挙動や安全文言を今回変更していません。最大許容遅延や全閲覧者への到達保証は設定しません。

このローカル実測を、追加2件を含むLinux CIの成功へ読み替えません。公開後のCI・監査の結果は上記PRの対象headに結び付けます。実Clerkの署名検証/ログイン、実Preview、Blob、実配備のcache伝播、利用者の理解は未確認です。上記ローカル検証の取得時点ではpush・PR更新・merge・配備・本番操作は行っていません。拒否されたActions・Prisma取得・Preview操作は再試行していません。追補の公開とmain merge・本番操作・意図的な配備は別判断です。

更新したのは本記録、E2E手順、変更対応表、検証状況、鮮度比較案と研究索引です。操作・公開条件・schema・アーキテクチャ・作業ルールを変えないため、product/rules/architecture/development/AGENTSは本文変更不要と判断しました。

<a id="linux-ci-bcc4c0cd"></a>
## 2026-11-06追補：公開後の固定headのLinux CI

PR #128 head `bcc4c0cdd888ecef55e65279d4e4dbd370b0d315`、base `51adcb23945b80bb34b110d2d0f263d29629a821` の[CI 42054864143](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/42054864143)は全4job成功、実checkoutはPR merge候補 `a4257172c7c34e0ab0e95a4cbb030fee2bcdb48a` です。無除外unit299/299、通常npm build、lint・型検査・実DB・既存browserと、E2E11/11（28.3秒、run `ci-d95df2fa-17d7-4c99-8ad1-e9c48f7ef45b`）が成功しました。run監査27行除去、既存4model fingerprint保持、所有process／TEMP終了、helper終了時のservice DB保持とjob終了時のcontainer停止を確認した記録です。

[artifact 13429131564](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/42054864143/artifacts/13429131564)は4,776,761 bytes、SHA256 `35ff9ddfeb8d1a896d8a40ab8efed494a4de83af63c6c2bda507d31a58d66916`。[依存監査 42054864250](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/42054864250)は既存high閾値で成功し、開発依存のmoderate8件は残っています。保存証拠はworktreeの親の `e2e-food-publication-20261105/result.json` です。

この追補時点でPR #128・#129は未mergeです。最終HEAD・CI・merge SHA・main CI・Production反映は未確定として、[現行の確認状態](../guide/verification.md#practical-e2e-status)と対象PRへ後続の実績を結び付けます。実Clerk／Blob書込、食品安全、継続閲覧への訂正到達をこのCIで実証したとは扱いません。

<a id="main-merge-a6dd7ad6"></a>
## 後続追補：PR #128のmain統合

PR #128は通常merge `a6dd7ad6f0c468ffceab8748645e7a6497cd4abc` でmainへ統合されました。統合後mainのtreeは、上記CIで確認したhead `bcc4c0cdd888ecef55e65279d4e4dbd370b0d315` と一致しています。以前の未merge記述は各記録時点の状態として保持します。tree一致をmerge SHA自身のmain CIやProduction確認の成功へ読み替えません。

依存するPR #129はmainへretarget済みです。[公開鮮度の固定head CI](public-freshness-prototype-20261105.md#linux-ci-cd18f209)と、main追従後の最終HEAD・CI・merge・Production実績を区別し、後者は未確定として残します。
