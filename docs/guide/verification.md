# 検証・採用状況と確認範囲

[READMEへ](../../README.md) · [変更対応表](change-map.md) · [保守ルール](maintenance.md)

<a id="adoption-status"></a>
## 開発基盤v1の採用範囲と証跡

この節を採用状態の案内の正本とし、製品の状態・公開・権限の仕様は[共通ルール](rules.md)に置きます。コードがあること、対象SHAの検証が成功したこと、mainへの統合、Productionへの反映は別の状態です。日付付きの検証記録は当時の証拠であり、現在の配備版を示すものではありません。

2026-10-28のユーザー合意では、F3をmainへ独立採用し、F1/F4は検証済み候補として保持します。開発基盤v1の正式な完成条件原本は先行作業の有限探索で特定できなかったため、公開4入口のtx回帰・既存snapshot回帰・mainのPR/必須CI・文書と対象SHAの対応という合意済み条件で判定します。候補全体の採用、#105のHOLD解除、DB migration、保護設定変更は含みません。

### main採用範囲

| 対象 | この版の内容と統合状態 | 検証の根拠・境界 |
| --- | --- | --- |
| 公開読取snapshot回帰 | [PR #109](https://github.com/Kaito-Iwase/ClearAllergy/pull/109)でmain採用済み。既存CIの独立stepで実行 | `scripts/check-public-read-snapshot.ts`。実SQLの負例・snapshotの正例を検査。実callerのtx利用とは別の検証層 |
| F2: main保護 | ruleset `26009324`の読取確認。PR必須、required check `Test, lint, typecheck, and build`、strict有効、approval 0、force/delete禁止 | [main ruleset](https://github.com/Kaito-Iwase/ClearAllergy/rules/26009324)。本PRで設定変更せず、merge直前にも実効状態を確認する |
| コミット・PR規約 | [PR #113](https://github.com/Kaito-Iwase/ClearAllergy/pull/113)でmain採用済み、merge `12d61d01837f81072864408cf0b2c5b168e6f36e` | [規約の正本](development.md#commit-pr-conventions)。英語type・日本語説明、過去SHA保持。commitlint・新CI・設定変更は含まない |
| F3: 公開4入口のtx利用 | この版で追加するmain独立採用対象。[PR #111](https://github.com/Kaito-Iwase/ClearAllergy/pull/111)がopenの間はmain未採用、merged後は同PRのmerge SHA以降が採用版 | `tests/public-read-callers.test.ts`は実route exportを通す4件。`scripts/check-public-caller-mutations.mjs`は10境界を1か所ずつ元clientへ戻して失敗を要求。[初回測定](../verification/public-read-callers-20261028.md)と追従後のPR証跡を区別 |

PR #111の初回HEAD `9c459656f591de4f260b428bdab04d893509dd23`は[CI 40635474303](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/40635474303)で256/256、lint・型検査・build・既存DB/browserがPASS、独立レビュー1回PASS・重大指摘0でした。これは最新mainへの追従後のCI結果ではありません。追従後のHEAD・CI run・実checkout SHA・artifact、変更した追従/文書差分の確認はPR #111本文に結び付け、古い結果で代用しません。製品コード・schema・依存を変えず、既存のレビュー上限を維持します。

この版のmain採用範囲を完成と判定する条件は、PR #111の当該HEADに対する必須CIと差分確認の成功、承認済みsquash merge、merge SHAのmain CI成功、同SHAのProduction Readyと公開4入口の読取確認です。merge前のCI成功だけで完成扱いにせず、最終実績は同PRの「統合後の確認結果」へ記録します。

### 別ブランチで検証済み・main未採用

| 対象 | 固定HEADと確認済み結果 | 未採用の理由・限界 |
| --- | --- | --- |
| F1 [PR #110](https://github.com/Kaito-Iwase/ClearAllergy/pull/110) | `8fcd810e98ac5cead1786449b503631decd100bd`、[CI 40632251353](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/40632251353)、294/294・lint/typecheck/build・既存DB/browser PASS、限定独立レビューPASS | 未採用の統合候補に対する受入判定の修正。ユーザーの最終採用方針で候補として保持する。mainへ同機能を導入した結果ではなく、候補全体の採用根拠にも広げない |
| F4 [PR #112](https://github.com/Kaito-Iwase/ClearAllergy/pull/112) | `01f7c2e80648836c6347ff19ce37f9b123f96851`、[CI 40640388044](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/40640388044)、299/299・通常gate・既存DB/browser PASS。独立レビューと同一枠の修正差分確認PASS | F1を前提とする候補側評価。固定3課題×2条件の6試行は両条件とも期待結果3/3、通常完遂1/1、誤停止0/1、検証漏れ0/2。差は観測せず、一般的改善・因果効果は主張しない。Skills要因は未評価。ユーザー方針でmain未採用 |

### 未検証・HOLDを維持する範囲

- [PR #105](https://github.com/Kaito-Iwase/ClearAllergy/pull/105)と統合候補全体は未採用・HOLDのままです。既存review上限、追加UIの403、P0未確認をF1/F4の限定PASSで解消済みにしません。拒否されたworkflow送信の別経路実行や権限拡大も行いません。
- 大学回線からのNeon接続は既存HOLDを維持し、再接続・INITを行いません。CIの使い捨てPostgreSQLでの成功は外部DB接続の確認ではありません。
- 公開HTTPの読取確認は、実Clerk・Blob書込、管理者操作、食品の安全性、すべての閲覧者へのキャッシュ反映、利用者の理解度を検証するものではありません。これらの未検証範囲と、明示的なHOLDを区別します。

### Productionの確認実績

PR #111追従開始時の確認済みProductionは、PR #113の自動配備 `EoepJefp4mGi8HK4ZnRdxAT8baDv` / SHA `12d61d01837f81072864408cf0b2c5b168e6f36e`、Readyです。[main CI 40643203526](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/40643203526)は同SHAで252/252・通常gate・隔離DB/browserが成功しました。2026-10-28 06:25 UTCに公開店舗一覧・店舗詳細・メニュー詳細・公開メニューAPIの認証なしGETがすべてHTTP 200で、対応する内容も確認済みです。詳細は[PR #113のマージ後の結果](https://github.com/Kaito-Iwase/ClearAllergy/pull/113)を参照してください。このProduction実績はF3採用前です。

F3採用後は、PR #111にbefore/afterのProduction ID・SHA、merge/main CIのSHA、公開4入口の結果を記録し、上記の規約導入時点の結果と分けます。main更新は自動Production配備を起動するため、ユーザーの個別承認範囲を確認し、異常時は追加変更を止めます。rollbackは別承認です。ブランチ固有の配備抑止をmainの配備抑止と解釈しません。

## 日付付きの検証記録

以下は各作業時点の結果です。「今回」「未実施」「本番未適用」などの記述は記録した時点に対応し、現在の採用状態は上の案内と対象PRの最終SHA・実績で確認します。

PR #96の公開店舗読取の重複取得削減を最新mainへ限定採用する差分とF3 fixtureの追従は、[2026-10-28の検証記録](../verification/public-shop-read-performance-20261028.md)を参照してください。過去候補のSELECT本数比較を今回の測定や本番速度の保証に読み替えません。採用先PRのmerge SHA・最終CI・Production結果は元PR #96から辿る証跡に結び付け、未採用の統合候補全体とは区別します。

PR #101のHTML障害応答修復を最新mainへ限定採用する差分と、元PRの名前・価格ブラウザケースの保持は、[2026-10-28の検証記録](../verification/api-html-error-20261028.md)を参照してください。統合候補全体の採用ではありません。採用先PRのmerge SHA・最終CI・Production結果は元PR #101から辿る最終証跡を正本とし、過去候補の結果で代用しません。

公開4入口のtransaction client接続を検査するF3回帰は、[実callerの検証記録](../verification/public-read-callers-20261028.md)を参照してください。実route exportからDB境界の代用品までを通し、10種類の元clientへの誤置換を検出します。以下のsnapshot pilotによる実SQL回帰とは検証層を分けます。

<a id="snapshot-ci-pilot"></a>
## 2026-10-28 公開読取snapshot回帰のCI接続パイロット

main `0b6ed291b2fd853230c7efdeeb1e061815404a81` を基準に、既存 `scripts/check-public-read-snapshot.ts` を通常CIのfixture準備直後へ独立stepとして接続しました。PR #109の変更は `.github/workflows/ci.yml`、本ガイド、`docs/guide/development.md`、`vercel.json` の4ファイルです。製品コード、schema、script、依存、job/check名、公開条件は変更せず、PR #96/#105や未公開の広いP1 workflow差分・統合候補を取り込んだものではありません。

初回実測の対象headは `d636d20f2130186b016c4efed33ff18d5a735dfc`、CI実checkoutはmainとの一時merge `40ddf5bea94b63a64f778bbfc953496301209f9b` で、両者のtreeは `ae7868585d1ee7f1b33ceb64c480c8937c78e7bf` と一致しました。[通常CI run 40618362779](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/40618362779) は2026-10-28の `pull_request` event、attempt 1でSUCCESSです。既存job `Test, lint, typecheck, and build` は2分10秒で完了し、単体テスト252件、lint/typecheck/build、既存DB・browser検査も成功しました。CIはNode 22.23.4、PostgreSQL 17.11の使い捨てserviceを使用し、npm 11.18.0への整合stepも成功しました。Neon・Clerk・Blobや本番共有DBへ接続した結果ではありません。

snapshot独立stepは02:01:33–02:01:34 UTC（API記録で約1秒、上限3分）に成功しました。実SQLへの割込みによる負例（旧食品＋新FREE）と正例（snapshot内の旧食品＋旧CONTAINS）のPASS行、両variantの実子SELECT割込み成立assert、訂正後の新規公開読取がnullになることを確認しました。通常finallyの完了はawaitされたcleanupとstep成功から確認し、job最後のcontainer削除も成功しました。削除後の個別残存SQL監査と、強制timeout時のcleanupは未検証です。artifact `12786650112` は `prototype-browser-40ddf5bea94b63a64f778bbfc953496301209f9b`（4,525,766 bytes）として保存されました。artifact内容は別途取得・精査していません。

この初回記録は1回の実測で、反復再現性を保証しません。後続の文書同期commitはそのcommitのCI結果を別に照合し、この初回head/runの記録を上書きしません。実行条件・保証範囲は[開発手順](development.md#checks)を参照してください。公開前のローカル準備ではNode 24.19.0/npm 11.9.0を使用し、workflowのYAML解析・既存定義との照合、文書リンク51件、`git diff --check`、`npm run lint` がPASSでした。生成済みPrisma ClientとPG17がなくローカルの実DB・全体typecheck/test/buildは未実行でしたが、上記CI結果とは区別します。既知403の取得再試行や接続guardの迂回は行っていません。

Vercelは2026-10-28 02:13 UTCのユーザー提供一覧の表示範囲で、従来の `ee117a` Previewと `0b6ed291` Productionが維持され、`d636d20` の新配備は見られませんでした。Skippedイベント・branch別全履歴は未確認であり、この一覧だけで全配備履歴を保証しません。`vercel.json` はpilot branch `ci/public-read-snapshot-pilot-20261028` の `deploymentEnabled: false` を追加し、既存6件のfalseと他設定を保持しています。このguardはbranch廃止後に別途整理します。削除すると当該branchが自動配備対象へ戻り得るため、現時点では保持します。mainへのmerge可否と、既存Production連携による配備の実行許可は別判断です。

このstepだけでは公開3ページ・公開メニューAPIの実callerすべてのtx利用、HTTP・画面・cache、P0全phaseを保証しません。選択検査の成功と必要受入条件全体の充足を分離する判定は統合候補採用前の別gate、CI必須化は別の設定承認です。公開読取変更前の実caller検証と、正常な小変更が範囲内の受入条件を満たして完了できるcontrolを区別して残します。既存のHOLD・review上限は解除しません。

2026-10-23の保存後の同じページでの公開確認は、[実装・検証記録](../verification/saved-menu-publication-20261023.md)を参照してください。保存済み版の読取・公開、未設定時の修正、二重送信・競合・失敗時の表示を対象にし、公開条件やDB契約は変更しません。隔離画面・CIと本番の読取確認を区別します。

2026-10-24のZod/Undici/Honoの追加更新は[対象条件・限定override・検証境界](../verification/runtime-dependency-security-20261024.md)を参照してください。Next更新の別差分です。

2026-10-24のNext.js16.4.1更新は[対象条件・検証記録](../verification/next-security-20261024.md)を参照してください。旧記録の成功を今回の検証へ流用しません。

2026-10-19のNext.js依存脆弱性のローカル修正は、[独立checkoutでの更新・検証記録](../verification/next-security-20261019.md)を参照してください。main `b3613a1` から16.3.8へ最小更新した結果で、本番配備版・侵害の有無・実認証の確認ではありません。

日付付きの各段落は、その時点のコード・環境・試験結果です。2026-10-15の後続main `cd502b` は[27 Issueの固定監査](../research/engineering/current-main-issue-audit-20261015.md)、文書全体の読み取りは[精査記録](document-audit-20261015.md)から確認してください。以下の `e26b6088` は#79/#80より前の記録で、修復後の未解決一覧ではありません。

2026-10-15 JSTの固定main `e26b6088` に対する店舗保存・再確認待ち一覧の限定確認は、[#73/#74の隔離実行記録](../verification/shop-menu-isolated-probe-20261015.md)を参照してください。実処理＋メモリPrisma／synthetic Reactの7ケースであり、実DB・実ブラウザ・Clerk・本番・実食品は今回未確認です。修復・公開条件変更・実店舗利用の承認ではありません。

同時点の[27件のIssueと現行コードの照合](../research/engineering/open-issues-current-code-20261015.md)は研究記録です。古い未実装前提、実装済み、過去の実行報告、残る判断・運用・環境を区別しており、既存Issueのcloseや現在releaseの合格を決めるものではありません。

2026-10-15の店舗保存（#73）の競合・保存後の公開反映・不正応答と入力保持は、[店舗保存の検証記録](../verification/shop-save-contract-20261015.md)へ分けて記録します。実コンポーネントの隔離ブラウザと、実DB・実Clerk・本番の確認範囲を混同しません。

2026-10-10の本番店舗一覧のDB不整合・migration適用・架空デモの再公開と復旧は[障害復旧記録](../verification/shops-recovery-20261010.md)を参照してください。

2026-10-09の食品確認記録・保存競合・公開停止と取得鮮度は[今回の検証記録](../verification/menu-food-review-20261009.md)を参照してください。以下の日付付き結果は過去の実行記録として保持します。

その後の独立した敵対的レビュー・反例再現・修正・再レビューは[レビュー記録](../verification/menu-food-review-adversarial-20261009.md)に記録します。ローカル差分の承認と本番／実食品の確認を区別します。


2026-10-07公開前の依存更新・残存指摘・公開保留の決定は[依存更新記録](../verification/security-release-20261007.md)に記録する。通常CIの成功と依存監査の成功を区別し、監査FAILのまま公開を完了扱いにしない。
[READMEへ](../../README.md) · [変更対応表](change-map.md) · [保守ルール](maintenance.md)

2026-10-21の[二段階公開の検証記録](../verification/two-step-publication-20261021.md)には長文フォーム廃止・保存後の別公開・移行と、暫定承認された未解決の明示解除の結果を記録します。本番反映済みとは扱いません。理由と承認範囲は[判断ログ](../research/product/two-step-publication-decision-20261021.md)を参照してください。

## 2026-09-30 Issue #37 / #38 追検証

HEAD `f1f209c`、開始時差分なしの正規Windows作業先で既存実装をレビューし、[I01結果](../research/implementation/i01-result.md)・[I02結果](../research/implementation/i02-result.md)へ今回結果を記録した。未知・空・null・undefined・欠損の表示/404回帰を補強し、全テスト133/133、lint・typecheck・build・diff確認が成功。

Dockerは通常起動で復旧し、今回専用PostgreSQL17へ既存16 migrationと架空fixtureのみを適用した。既存CI接続ガード下のDB回帰18項目がPASS。実PUT/DELETEでread直後の移転/消失→404、両店舗の全fields/links不変、DELETEのリンク巻戻し、正常所有者操作を確認した。Clerkとcacheはテストプロセス内の代用品であり、実セッションや配備cacheを検証した結果ではない。固定監査理由`menu_not_found`の脱落も局所修正し、RED/GREENと実DB保存を確認。

今回差分は未コミット・未push。Node22.15.1/npm10.9.2とrepo基準22.23.1/11.18.0との差、実browser・Clerk/Blob・GitHub CI・配備・owner取消race・理解度は未確認のまま。以下の日付付き記録は当時の結果として保持する。

## 2026-09-28 I01 局所回帰

未知のアレルゲン状態を否定表示と公開可能判定へ通さない変更の結果は [I01実装・検証結果](../research/implementation/i01-result.md) に記録した。先に追加した回帰テストは27件中4件が意味上の理由で失敗し、実装後は27/27件成功。`npm.cmd test` は128/128件成功、`npm.cmd run lint`・`npm.cmd run typecheck`・`npm.cmd run build` も成功した。build初回はGoogle Fontsへの接続失敗で、接続を許可した再実行が成功した。build中のDB fallbackログがあるため、実DB・ブラウザ・実Clerk/Blob・ユーザー理解度は未確認のまま扱う。

## 2026-09-28 I02 最終書き込みの店舗条件

事前取得後にメニューが別店舗へ移る場合のPUT/DELETEは、[I02実装・検証結果](../research/implementation/i02-result.md)に記録した。REDは対象12件中2件で期待404に対して実際200、条件付きwriteの実装後は12/12件成功。正常DELETEの回帰を加えた最終対象は13/13件、全テストは131/131件成功した。`npm.cmd run lint`・`npm.cmd run typecheck`・`npm.cmd run build`も成功した。build中に公開店舗一覧のDB fallbackログがある。

専用PostgreSQL回帰は定義を追加したが、Docker Desktopを起動してもLinuxエンジンに接続できず**未実行**。APIの状態付きmockは実DBでのトランザクション・競合検証の代わりではない。実Clerk、owner取消race、配備先も未確認。

以下の2026-09-20の記録は当時の基準であり、今回の結果で置き換えない。

## 2026-09-20 文書整備時の基準

対象はWindowsの正規作業フォルダ、ブランチ `improve/prototype-usability-ci`、コミット `58cd72a`。開始時の未コミット変更はありません。ブランチ・履歴は変更せず、この時点のコード・テスト・設定を読みました。以後の変更ではこの記録を最新の実行結果と扱わず、仕様本文と対応表を同じ作業内で更新してください。

| 根拠の種類 | 確認できたこと・限界 |
| --- | --- |
| 今回の明示要件 | 初心者とAIが同じ資料を使える入口・全ページ棚卸し・変更対応表・継続更新ルール。アプリ仕様変更やDB書込はしない |
| 既存の製品方針 | AGENTS.mdと依頼の目的にある、誤った安心を防ぐ、未入力と不確実を分ける、実運用前のプロトタイプという方針を維持。安全・法的文言を新しく承認したものではない |
| 現行実装 | 20個の `page.tsx`、17個のAPIルート、レイアウト・読込・404、機能処理、DB定義・トリガー、権限、入力、画像、設定、CIを棚卸し。詳細なJSON全項目・全分岐の形式仕様化ではない |
| テスト定義 | 14個の `tests/*.test.ts` と、専用DB・ブラウザスクリプトの対象・副作用を確認。モックと実サービスの検証を分けて対応表に記載 |
| 今回の実行・操作 | Git状態、ファイル・参照・ルート対応、差分の確認。アプリ起動、画面操作、DB接続、lint・型・単体テスト・build・CI再実行はしていない。文書のみの作業のため |
| 外部資料 | Context7でDocker・Next.js・Prisma資料を参照。最新資料の例を依存バージョンへ無条件適用しない |
| 未確認 | 本番・Previewの接続先とデータ、DB migration適用状況、GitHub保護、Vercel設定、実Clerk・Google・Blob連携、全画面の実表示、利用者の理解度 |

この作業でソース・DBスキーマ・認証・依存関係・CIは変更しません。`.gitignore` は現行ガイドをGit管理できるよう、文書ディレクトリの例外だけを変更します。新しい文書サービスや自動化は導入しません。

### 今回の文書検査

- **PASS**：一時的なNode.js検査で、README・AGENTS.md・現行ガイドの相対リンク124件（明示アンカーを含む）と、コードファイル参照193件の存在を照合。外部サイトの到達性を網羅検査したものではない。
- **PASS**：20ページ、17 APIルートとその実装転送先、14テストファイルが変更対応表に掲載されていることを実ファイルの列挙と比較。
- **PASS**：個人設定追加、公開条件変更、店舗担当者追加、CI障害の4例を対応表から追い、仕様・実装・テストまたは未整備の記載・更新対象文書へ到達できることを机上確認。アプリ操作試験ではない。
- **PASS**：`git diff --check` と変更範囲を確認。既存の監査4文書は変更せず、履歴として保持。PRテンプレートは存在しないため、既存テンプレートへの追記は対象なし。
- **UNVERIFIED**：アプリの再起動・ブラウザ操作・実DB／外部サービス接続・コード用の検証コマンド。文書と文書管理の変更に限定し、実行環境やデータを変更していない。

<a id="issues"></a>
## 制約・不一致・未確認の記録

2026-10-16 JST、main `cd502b` の隔離された実UIで、原材料変更または変更申告のみを保存する2条件について、公開する旨の確認文とPUTの公開設定falseの不一致を再現しました。先に疑ったUNKNOWN追加の条件は実際の状態遷移で反証しました。コードは未修正で、公開漏れ・実DB・実認証の再現ではありません。[6条件の実行記録と修復時の受入条件](../verification/material-change-confirmation-20261016.md)を参照してください。

2026-09-20に記録した懸念を、2026-09-22の改善結果と照合しています。過去の懸念・修正済み・外部未確認を区別します。

| 区分 | 内容・根拠 | 扱い／次に確認すること |
| --- | --- | --- |
| 旧文書と実装の不一致（本文を訂正） | README末尾に `ADMIN_REGISTRATION_MODE=open` の推奨設定説明があったが、`lib/auth/admin-registration.ts` は常にdisabled | 現行ガイドは停止中と記載。再開を承認したものではない |
| 旧文書と実装の不一致（本文を訂正） | READMEは初期表示もAPI経由と読めたが、公開・管理ページはPrismaを直接呼ぶ。スクリーンショットの `document/` 参照先も存在しなかった | 実処理順へ書き直し、存在しない画像参照を外した |
| 旧手順の過大な説明（本文を訂正） | テスト初期化は再実行で一切上書きしない旨の記述があったが、`scripts/setup-test-env.ts` にユーザー・店舗・マスタのupsertがある | 既存メニューをスキップする範囲と、更新する範囲を区別 |
| 確認できた実装上の制約 | `useUnsavedMenuChanges` はブラウザ履歴の戻る／進むによるアプリ内移動までは保護しない | 全移動を保護する仕様と記載しない。必要性とUXは操作レビューで確認 |
| 修正済み・実認証ブラウザは未確認 | `MenuListPageClient` の削除で通信例外を捕捉し、同期的な処理中フラグで重複送信を防ぐ | `scripts/check-test-browser.mjs` に通信断・HTTP失敗・重複操作・キャンセルの回帰を追加。実Clerk環境での実行は別途必要 |
| 修正済み・障害画面の全経路は未確認 | `app/admin/demo/page.tsx` の例外をnullへ変換する処理を削除し、共通error/global-errorを追加 | データなしと描画障害を区別。実Clerkを伴う管理デモのブラウザ確認は未実施 |
| 修正済み・配備先は未確認 | 同一Originをscheme・host・portで比較し、転送ヘッダーで許可元を増やさない | 正常・偽装・scheme違い等の回帰あり。公開Hostとprotocolのプロキシ前提を実Vercel Previewで確認する |
| 実装上の制約／承認範囲未確認 | 品目マスタ検証と既存SQLに固定件数29の判定がある | 現行29品目に対する動作。将来の品目変更では件数だけ変更せず集合・全層を再確認 |
| 実装上の制約 | Shopの所有者が一意、メンバー表なし。画像削除・保存失敗後の未参照Blob自動回収なし | 複数担当者運用・画像ライフサイクルは既成機能にしない。別途要件判断 |
| 検証の不足 | 招待競合はAPIモックとローカルPostgreSQLで検証。QRは隔離部品で画面比率・印刷CSS／PDF寸法を検査済み（[UI/UX記録](ui-ux-review.md#qr-size)）。実招待全工程・Googleログイン・QRの紙への印刷／カメラ読取・実配備でのキャッシュ反映時間は未確認 | 対応表の手動確認へ。公開CIやAPIモックだけで実認証の成功を保証しない |
| 配備容量の不一致候補 | アプリの画像上限5MiBとVercel Functionの要求サイズ上限4.5MBは同じではない。multipartの分も必要 | MIME・署名・5MiB境界はローカル検証。実Previewで容量境界を確認し、必要ならUI/API上限の統一かclient upload移行を別途設計する |
| 運用の残課題 | 通知先へのアラート、監査の保持・削除方針、分散回数制限、未参照Blob回収は未導入 | 構造化ログとプロセス内制限を運用全体の保証にしない。現規模と費用から採否判断する |
| DBの残課題 | 価格・予算・座標・画像調整の範囲は主にアプリ側で検証。DBへの直接書込すべてを防ぐCHECK制約はない | 既存データを確認せず制約を大量追加しない。公開トリガー・一意制約の回帰とは分ける |
| 外部状態未確認 | リポジトリ内の初期fixtureと本番DB内容は同じとは限らない | 過去のデータ投入やチャットの件数を現在の初期データ仕様に転記しない |

コードや既存文書に書かれた設計意図と、現在の利用者に必要かどうかは別です。特に「非表示」と「強調」の理解、後から品目を追加したときの予測、店舗側の公開前確認の負担、FREEと同店舗補足の理解は、人に触ってもらう検証が必要です。

## 過去の監査の位置づけ

ローカルの `docs/audits/` には次の資料があり、今回参照しました。Git管理対象外なので、新規取得したリポジトリに必ずある資料としてリンクしません。ファイルは削除・上書きせず残しています。

- `clearallergy-user-centered-audit.md`、`clearallergy-product-ux-audit.md`：当時の課題候補と検証方針。
- `clearallergy-v1-remediation-status.md`：2026-09-06時点の修正・専用環境・検証結果。承認済みだった旨の記録は過去記録として扱う。
- `clearallergy-first-use-improvements-20260912.md`：当時の初回利用改善と制約。

過去の「個人設定の追加操作」「店舗フォームの未保存保護」「CI不足」などの記述は、現在の設定UI・保護処理・CI定義と照合しました。未解決のままとは転記していません。過去のテスト件数・audit 0件・ブラウザPASSを今回の結果として採用していません。現行の説明はこのガイド一式を入口にしてください。

## この文書を保守するとき

仕様本文は最新へ直し、この日付付き記録は過去の基準として残します。新しい問題は実装根拠と未確認理由を添え、解決時は解決した根拠に更新します。必要のない全文監査ログや個人情報を追記する場所にはしません。

## 2026-10-15 管理一覧の食品再確認待ち

2026-10-15の管理メニュー一覧の食品再確認待ち（Issue #74）は[実装・検証記録](../verification/admin-menu-review-queue-20261015.md)を参照してください。実コンポーネントの架空データ回帰と、実店舗での工数・理解の検証を区別します。

## 2026-10-19 店舗側レビュー①〜③

QRのURL解決、メニュー保存予定と確定結果の区別、店舗フォームの順序とスクロールは[実装・検証記録](../verification/store-review-20261019.md)を参照してください。既存画面の読み取り監査と架空fixtureの回帰検査を、実店舗の利用実証から区別します。

2026-10-22の[店舗管理・公開カードの整理と検証](../verification/store-management-20261022.md)は、直接操作・一覧の公開停止・店舗共通補足、本番レスポンスの注意書きの由来、元の白余白の再現限界を記録します。実装と本番適用を区別します。
