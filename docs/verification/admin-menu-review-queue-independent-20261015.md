# Issue #74 独立レビュー

レビュー時点: 2026-10-15 05:51 UTC。対象は `clearallergy-issue-74`、branch `agent/issue-74-review-queue`、base/HEAD `e29d24aae0ceec55ff744117f4b58723c1fe2b71` の未commit差分。実装履歴を引き継がず、Issue全文snapshot、指示、現在のコード、テスト定義、既存検証ログから独立に確認した。

## 結論

初回でP2を1件指摘し、修正後のround 2再読で解消を確認した。現在のレビュー対象コードに未解決のP0/P1/P2/P3、追加のmust-fixは見つからなかった。公開条件・認可・schema・保存処理を広げずに、食品確認待ちの発見に必要な表示DTO、理由、件数、絞り込み、編集入口を追加できている。

これはコードレビュー結果であり、最終差分の全検証完了を意味しない。最終テスト、build/browser、検証記録の同期は統合担当の確認事項。作成中の `scripts/ingredient-change-trial.mjs` は依頼に従って今回のレビュー対象から明示的に除外した。同スクリプトの完成後レビューはrootが別に行う。

## 指摘と修正確認

### 解消済み P2: 版一致による早期returnが最新未解決事項を隠す

初回の `features/admin/menus/menu-list.ts:25` は、最新記録を確認する前に `isFoodReviewCurrent(menu)` だけで `current` を返していた。具体的な入力は次のとおり。

```ts
{ foodVersion: 2, reviewedFoodVersion: 2,
  foodReviews: [{ foodVersion: 2, unresolvedIssues: "新しい未解決事項" }] }
```

この入力を `current` と分類すると、一覧は「現行の食品確認記録あり」と表示し、再確認待ち件数・filter・強調した編集入口から落とす。今回明示された「版一致だけでunresolvedを落とさない」に反する。通常の記録追加ではDBが `reviewedFoodVersion=null` とすることは確認したが、その通常経路の前提で明示的な最新未解決データを無視するべきではない。公開ゲート突破を示す指摘ではない。

修正後の `menu-list.ts:25–29` は、最新記録が現行食品版かつ非空未解決なら先に `unresolved` とし、その後に既存の版一致判定を使う。`tests/admin-menu-list.test.ts:17–24` には上記入力と「旧版の未解決は現行確認を妨げない」のcontrolが追加された。既存ログ `issue74-red-latest-unresolved.log` の `current != unresolved` による1件FAIL、`issue74-green-latest-unresolved.log` の4/4 PASSを読んだ。独立レビュー側はテストを再実行していない。

## 受入条件との照合

| 条件 | 判定と根拠 |
| --- | --- |
| 全品目設定済みでも未対応・旧確認・最新未解決を発見 | 静的PASS。`menu-list.ts:20–36` が4状態を導出・説明し、`MenuListPageClient.tsx:71–111,198–202,258–275,373–405` が独立件数・filter・理由・編集URLへ接続する。状態/SSRテストとfixture定義あり |
| 全品目設定だけで公開準備完了と案内しない | 静的PASS。旧文言を除去し、`MenuListPageClient.tsx:191,368` に現行食品確認の条件を併記。未設定品目表示も維持 |
| 通常STOPと再確認待ちを分離 | 静的PASS。導出関数は `isPublished` や経過日数を参照しない。非公開を「非公開」と表示し、同ファイル251行で独立性を説明。通常STOP/currentのunit・SSR・fixture定義あり |
| 最新記録と理由を推測で補わない | 静的PASS。`server/menu-list-data.ts:10–12` は `reviewSequence DESC, take:1`。checkedAt/updatedAt順や旧recordの復活を使わず、食品変更・期限切れ・操作者等の詳細理由を創作しない。上記P2は解消済み |
| 通常ページ・一覧GET・demoの一致 | 静的PASS。`AdminMenusPage.tsx:9,25,30`、`adminMenusRoute.ts:42,69,88`、`app/admin/demo/menus/page.tsx:5,23,39` が同じselectionとmapperを使用。GETは既存画像表示項目と画像URL検証を保持し、Dateは既存JSONと同じISO文字列になる |
| 根拠本文・actorを不要転送しない | 静的PASS。根拠・actor・snapshotをselectionに含めず、未解決本文はサーバーで状態化。`menu-list-data.ts:19–26` の明示DTOはfoodReviews/allergenLinks/版の内部データをそのままspreadしない。未解決本文の非転送をAPI/unitで検査 |
| 検索・空表示・削除・失敗の整合 | 静的PASS。既存の名前/カテゴリ/未設定品目検索を維持し、新filterと併用。削除は従来どおりexpectedVersion、確認、送信中抑止、確認できた成功後だけ除去、失敗時の入力/行保持。統計はmenusから再計算。fixtureに検索・0件・削除後件数の検査あり。既存実認証回帰の `check-test-browser.mjs:158` のfilter文言も同期済み |
| 未認証・他店舗の取得拒否 | 静的PASS。ページは既存requireCurrentAdminContextOrRedirect、GETはrequireShopIdの後にサーバーで解決したshopIdをwhereへ使用。APIテストは401、店舗なし403、自店舗whereを検査。demoは既存の専用demo店舗条件・readOnly・demo編集URLを維持 |
| CAS/STOP/食品版/公開ゲート/未保存保護の維持 | 静的PASS。adminMenuRoute、food-review-save、入力/応答スキーマ、フォーム、未保存guard、lib/allergens、schema/migrationに差分なし。GET変更は書込を追加しない。既存APIテストの関連定義と公開/食品確認helperを照合 |
| product/change-map/検証文書同期 | 主要説明は静的PASS。product、architecture、change-map、development、verification入口、新規検証記録を更新。最新修正後の件数・分岐説明・build/browser結果は最終同期が必要（下記） |

## 範囲と読んだ経路

追跡済みdiffは12ファイル、新規の一覧helper/DTO mapper/unit test/検証記録は全体を読んだ。後から追加された `scripts/check-test-browser.mjs` の1行変更、隔離fixtureのCSS所在の両形式対応と任意のloopback iconfont asset対応も確認した。全caller検索で、実一覧UIの入口は通常管理ページと保存しない管理デモの2か所であること、一覧GETのアプリ側利用はPOSTや個別GETと混同しないことを確認した。新規スクリプト1件は上記のとおり除外。

指示・説明はAGENTS、READMEの読む順序、rulesの公開/所有権、maintenance、productの管理メニュー/未保存入力、architectureの保存処理、developmentのbrowser、change-mapの該当経路、verificationを照合した。保護処理としてadmin-auth/admin-api-utils/demo-shop、食品確認helper・保存処理・schema・既存DBトリガー、一覧を開くページと新規/編集のAPI利用・遷移を確認した。

`rg` が環境にないためPowerShellのSelect-String/Get-Contentとgit検索を使用した。実行した確認はGit状態/base、全diff/新規ファイル/呼出箇所の読取、`git diff --check`（出力なし）、既存ログの読取、主要ファイルhash取得のみ。コード編集、テスト・build・browser・DB実行、network、commit/pushは行っていない。この報告ファイルだけを新規作成した。

## 検証証拠と限界

| 証拠 | このレビューが確認した範囲 |
| --- | --- |
| `issue74-tests-unsandboxed.log` | 修正前の全191件PASS、fail/cancel/skip 0を本文で確認。修正後最終差分の全件結果への読み替えはしない |
| `issue74-focused-final.log` | 修正前の関連29件PASSを確認 |
| `issue74-red-latest-unresolved.log` / `issue74-green-latest-unresolved.log` | 上記P2のRED1件と、修正後状態/SSR/mapperのGREEN4件を確認 |
| `issue74-tests.log` | 最初の187/191を確認。1件はhardlinkのEPERM、3件は既存next-root-globテストの失敗。通常環境の191/191と区別して保持 |
| `issue74-typecheck.log` / `issue74-lint.log` | ファイルは空。終了0は担当の実行報告・検証文書に基づく。空ログだけで独立に終了コードを証明したとは扱わない |
| `issue74-doc-links.json` | 6文書・136 local links・failures空の既存結果を確認。新たな変更後も同結果と断定しない |
| build/browser | 今回の担当範囲では実行・結果の認定・スクリーンショット目視を行っていない。統合担当が最終結果を確認する。fixtureコード定義のレビューと実行成功は別 |

単体APIのPrisma/Clerk/cacheはmockであり、実SQLのrelation順序、保存直後の実一覧再取得、実認証の別所有者、配備先の取得鮮度は実証しない。共通selectionを3入口が使うことは静的に確認したが、通常ページとdemoページを実行する統合testはない。API追加testは未解決1例で、空一覧、全4状態、画像表示の旧全項目、取得失敗をまとめて検証していない。これらは今の実装欠陥を示すものではなく、残る検証範囲である。

SSRテストは操作前のmarkupに限定され、filter/search/delete/keyboardの実操作は隔離fixture側の定義にある。fixtureのLink/Image/navigation/API応答は代用品であり、編集URLの文字列一致だけでは実ページ遷移・未保存guardまで証明しない。実DB保存や公開ゲートの正しさをfixtureの合格から推論しない。

一覧は読込時点の表示であり、自動再取得・他端末への通知はない。既存の `useState(initialMenus)` も変更されていない。実ルートを再表示したときの保存内容反映と、開いたままの画面の自動同期を同一視しない。

## 統合時に残る作業

1. 修正後最終差分でfull tests/typecheck/lintを確認し、191件の古い結果と新しい結果を区別する。
2. 最終buildと隔離browser、必要なスクリーンショットの目視結果を統合担当が確定する。
3. `docs/verification/admin-menu-review-queue-20261015.md` の版一致優先の表・「必要な場合だけ最新記録」・3件/191件・build/browser調整中を、最新未解決優先と最終実行証拠へ同期する。未実施項目はUNVERIFIEDのまま残す。
4. 除外した `scripts/ingredient-change-trial.mjs` はrootの別レビューとする。このレポートの承認範囲を拡張しない。

## 再読済み主要ソースのSHA256

2026-10-15T05:51:23Z取得。最終commit全体への署名ではなく、このレビューが読んだソースの同定用。

| ファイル | SHA256 |
| --- | --- |
| `features/admin/menus/menu-list.ts` | `b25291d08284c29c5b1fc2d5ee7a7622da304027dd86420b0c300f49e3d1c992` |
| `features/admin/menus/server/menu-list-data.ts` | `c1983308142f5f46a49c0d212ca39ac81ea6eeafcc5f010eaf590072ab31654e` |
| `features/admin/menus/components/MenuListPageClient.tsx` | `989493d014c0d8e116cfa5215d0b5561206e8e8030cab1ae5189c8baf44ffc86` |
| `tests/admin-menu-list.test.ts` | `760d6bd4ab1a04f7376c6f73d3c370729bfddfffe6d3773e0855324d6124aa11` |
| `scripts/check-allergen-cards-browser.mjs` | `a8b6aee9bd0caa030f269861e6cafb7fa0430dd6b54314f6131d5350d39b6099` |
| `scripts/check-test-browser.mjs` | `b91c01f9588d2cc397b03d8ffc93f7bde97dbb50258062e824b47b36ec5443da` |

## 最終追記: round 3、docs/artifacts同期の再照合

2026-10-15 05:56 UTC。統合前の文書・検証成果物をread-onlyで再照合した。この追記が上記の「統合時に残る作業」1〜3およびbuild/browser未確認という当時の状態を更新する。追加must-fixはなく、既存P2の解消判定も維持する。レビューは3 rounds以内で終了する。

`issue74-handoff.json` の `ownedFileCount=16`、branch/base、非staged・非commit状態、trialscript除外を確認し、全16ファイルを実ファイルのSHA256・byte数に照合した。16件一致、相違0。記録内 `manifestSha256` は `73682fdff0761aca82c39442c71eb024333242f83ea41f7f5bf341e708df9dc7`。manifestファイル自身のSHA256は別の値で、`1d12296a3a6a33ce8309e3ce807a2f62ce5238b987216150750a90ee71185bb8` である。両者を混同しない。

主要アプリソース、DTO mapper、状態test、実認証用scriptのhashは上表から変わっていない。差分が進んだ隔離browser scriptと検証文書は以下のhashを読んだ。

| ファイル | 最終SHA256 |
| --- | --- |
| `scripts/check-allergen-cards-browser.mjs` | `5ef49127652d5b206297a2fde81570eca6021964f7d571615831e8abbfd45599` |
| `docs/verification/admin-menu-review-queue-20261015.md` | `d057dac95b60f69f8199b414afa43f73d039a2a56c54f678f9b416df888fc6c7` |

追加されたfixture処理は、現行layoutのMaterial Symbols CSS/フォントを成果物cacheからloopback配信する。cacheなしはUNVERIFIEDと記録し、cacheあり時は `document.fonts.ready` の後に実フォントloadをassertする。さらに320/390/768/1440pxで編集リンク本文のRange矩形がリンク内に収まることを確認する。既存の外部通信遮断は保持され、アプリのstyleやコンポーネントへの追加変更はない。cacheのフォントhash `a98a4a072ebeb0928bb92ba6e1f6814b8f52168686ac2f03358e12a148264bf2` も文書と実ファイルで一致した。

| 最終証拠 | 今回の再照合 |
| --- | --- |
| `issue74-tests-final.log` | 192 tests、192 pass、fail/cancel/skip 0。修正前191件とは別の最終結果を確認 |
| `issue74-lint-full-final.log` / `issue74-typecheck-final.log` | ログは空。終了0は実行担当の報告とhandoffのexitCode=0に基づく。独立実行したとの主張はしない |
| `issue74-build-final.log` | Next 16.3.6 webpackのcompile、TypeScript、26静的ページ生成、trace、対象route出力まで確認。exitCode=0は実行報告/manifestで確認。dummy CI設定、既存Prisma Client、prebuild省略・Turbopack制約の説明を文書に保持 |
| `issue74-browser-after-final-build.log` | 13群PASSとDB/auth/save/Next routing未確認の明記を確認。Chrome 155.0.8059.40 / Playwright 1.62.1は実行報告/manifestの記録で、既定runner 1.61.0と区別されている |
| `review-queue-390.png` / `review-queue-1440.png` | 独立に画像を開き目視。実アイコン、4件のfilter、3種類の理由、編集/削除入口、編集リンクのfocus表示が見え、本文/操作の重なり・欠落を認めなかった。390pxでは編集文言が折り返されて枠内に表示される。これは保存済み画像の目視でありbrowserの再実行ではない |
| `issue74-doc-links.json` | 05:55:04Zの6文書・136リンク・failures空を確認 |

最終検証文書は、最新同版未解決の優先順、反例のRED/GREEN、最終192件、build成功、隔離browser13群、cacheあり/なしの範囲、6文書136linksを同期している。先の文書同期TODOは解消した。

実DBの6状態projection、新規の実Clerk/Blob操作、配備環境/GitHub CI、店舗工数・理解・実食品の正確性、研究25試験は引き続きUNVERIFIEDとして正確に残されている。`scripts/ingredient-change-trial.mjs` の別レビューという除外も維持する。独立レビュー側は追加の実行・network・コード編集を行わず、この報告への追記だけを行った。

## 追加反例による2回目修復の再レビュー

上記05:56時点の最終照合の後、rootの最終読取で「確認対応版が一致していても、取得した最新記録が存在しない／別食品版」という追加反例が示された。前回の独立レビューは、既存の版一致helperとDBの通常更新を前提に、この2入力を `current` とするtest/fixtureを受け入れていた。この見逃しを訂正し、前回のhash・192件・build/browser結果を新しいソースへ読み替えない。過去時点の記録は保持する。

これは初回を含む3回目の独立コードレビュー（2回目修復cycle）である。前項のdocs/artifactsのみの照合は別に実施したもので、追加の修復cycleを行ったという意味ではない。

### 解消済み P2: 記録の存在・最新版一致を確認せずcurrentとする

修復前の分岐では、`foodVersion=2, reviewedFoodVersion=2` に対し、`foodReviews=[]` と `foodReviews=[{foodVersion:1,unresolvedIssues:null}]` の両方をcurrentとしていた。前者は「記録あり」の裏付けが取得結果に存在せず、後者はlatestが現行食品版に対応していないため、一覧の理由・件数・filterから確認対象を落とす。

`issue74-red-projection-record.log` で期待missingに対するcurrent、期待outdatedに対するcurrentの2件FAILを確認した。修復後 `features/admin/menus/menu-list.ts:25–30` は、記録なし→missing、latest版不一致→outdated、latest同版の非空未解決→unresolved、既存の版一致判定→current、それ以外→outdatedの順になる。STOPフラグ・期限・公開gateを参照しない性質は維持される。

`tests/admin-menu-list.test.ts` は空history反例、latestの過去版/未来版反例を追加し、currentの対照をlatest同版clean付きに修正した。旧版未解決を無視するcontrolも、latest同版cleanの後に旧版未解決がある順序へ修正され、取得順の前提に整合する。`scripts/check-allergen-cards-browser.mjs:34` もcurrentとSTOPにlatest同版cleanを追加した。3ファイルをread-only再読し、`issue74-green-projection-record.log` の6/6 PASSを確認した。追加must-fixなし。新たなschema・認可・公開gate・保存処理の変更はない。

| 再読したファイル | 修復後SHA256 |
| --- | --- |
| `features/admin/menus/menu-list.ts` | `9a96cd2c5e8742fd92a36c81ec3706698d440151b736b09a2f9e18afaa56a67b` |
| `tests/admin-menu-list.test.ts` | `968d78b883eca07b73a61384cc17974f8688c529f382a145b2f4e3bc15d354fe` |
| `scripts/check-allergen-cards-browser.mjs` | `0e7e810ac316029dd55186b15ab37aba13a03ed251e1232ae2845b19a1c3d7f9` |

この追記時点では修復後のfull tests/typecheck/lint/browserと関連docs同期は担当が再実行・更新中。完了ログと新しいmanifestを受領後、読取照合の結果を追記する。192件・旧manifest・旧buildを最終修復後の証拠とは扱わない。rootが編集した他guide/研究資料と別trialscriptはこの再読の編集対象・追加承認範囲に含めない。

### 2回目修復後の最終証拠受領

2026-10-15 06:08 UTC。`issue74-projection-handoff.json` と最終ログ、同期済み検証文書を受領・read-only照合した。修復後の4ファイルは実SHA256/byte数に全件一致、差異0。記録内manifestSHAは `f48c9ca3a47cd0b3d882dedcaf3fcb453952872bac607dc1d420edf57e7a37e3`、JSONファイル自身のSHA256は `8b578d4a6b6931fabbd501ab0c856c3dbb910874b5e25ef1d46cb9d392dc4f5c`。旧handoff/192件は過去snapshotとして保持されている。

上のソース3件のhashは維持。最終検証文書 `docs/verification/admin-menu-review-queue-20261015.md` は `6b49aabb1e6ffe48afc6c4fb617ebd33c63aa9969d8414bd69c299e8e430302d` を確認した。最新記録の存在/版一致を要求する表、rootで追加された反例・RED2/GREEN6、194件、最終build、未確認事項を本文と照合した。追加入口によるリンク数増加も136から142へ同期されている。

| 修復後の証拠 | 読取確認結果 |
| --- | --- |
| `issue74-tests-projection-final.log` | 194/194 PASS、fail/cancel/skip 0 |
| `issue74-typecheck-projection-final.log` / `issue74-lint-projection-full-final.log` | 空ログ。終了0は担当のtool実行報告と新manifestに基づく。独立再実行はしていない |
| `issue74-build-projection-final.log` | Next 16.3.6 webpack、compile/TypeScript/26ページ生成/route出力まで完走を確認。終了0はtool実行報告と新manifestに基づく。既存Prisma Clientとdummy CI設定という境界を維持 |
| `issue74-browser-projection-final.log` | 修復後fixtureで13群PASS。外部通信遮断、DB/auth/save/Next routing未確認の明記あり。先の192件時のログと区別 |
| `issue74-doc-links.json` | 06:07:45Z、6文書142 local links、failures空。diffcheck終了0は担当報告/manifestで確認 |

追加must-fixなし。記録なし/別版/未解決をcurrentで補わない修復は承認条件と整合する。実DB、実Clerk/Blob、配備/GitHub CI、参加者観察等のUNVERIFIED、および別trialscript/統合担当の追加資料の範囲除外は継続する。この独立レビューの対象は#74本体と上記修復・証拠であり、rootが後から作成・更新した全成果物の承認ではない。

## 追加委任: PostgreSQL一覧projection回帰とCI配線

2026-10-15 06:12 UTC。追加委任を受け、新規 `scripts/check-admin-menu-list-database.ts` 全147行と `.github/workflows/ci.yml` の追加呼出・前後関係をread-onlyでレビューした。今回はDB回帰script/CI配線の別追加範囲であり、アプリ・他docs・trialscriptを編集/再承認しない。追加P0/P1/P2/P3およびmust-fixなし。

| 読んだファイル | SHA256 |
| --- | --- |
| `scripts/check-admin-menu-list-database.ts` | `9bb310f64b7125a7ce492955cd2da589c7fadbd4647bcbc104008e94b11f5645` |
| `.github/workflows/ci.yml` | `ed7f618d0346ef24de6fa47170d7b699455fc65f861698e5ee019c591697377b` |

ガードはscript 9–16行で、既存 `assertTestDatabaseTarget`（明示test flag時）または `assertCiDatabaseTarget` を通してから、18–23行でPrisma/mapper/fixtureを動的import・接続する。静的importした2つのguardモジュールにDB読込・書込の副作用はない。拒否時の出力は固定文で接続URL・生DBエラーを含めない。既存guardの条件も読んだ。CLI自体はmigration/seed/resetを行わず、CIでは既存の専用Postgres設定・setup-ci-envによる準備とcheck-ci-databaseの直後に実行される。

作成対象はUUID名の新規shop 1件とその配下menu 6件。既存Allergenはread-onlyで、全書込のmenu IDは自分のcreate結果から得る。通常readと一覧readはshopIdで限定される。`finally` のaudit削除は今回の `createdShopId`、shop削除はそのIDだけで、子menu/link/reviewは既存cascadeに任せる。初期作成前の失敗では削除しない。cleanupの成否にかかわらずdisconnectする二重finallyもある。全体の失敗はexitCode=1にし、生のDB例外をログへ流さない。

6状態とSQLfixtureの組合せを、既存 `publishReviewedFixture`、食品版/記録順/未解決・UNKNOWNの各DBトリガーへ照合した。nested link作成後の食品版はfixture helperが再取得し、その版で追記記録を作る。各transactionのcommit後に共通select/mapperを使い、次を検査する。

- 未記録のmissing、同版clean記録のcurrent＋公開中。
- 公開flagだけを下げた通常STOPで、foodVersion/reviewedFoodVersion/currentが保持される。
- ingredients変更で食品版が進み、対応版null・非公開・outdatedになる。
- 同版の後続未解決で対応版null・非公開・unresolvedになる。別history queryもreviewSequence降順で読み、旧cleanを選んでいないことを確認する。
- UNKNOWNを残した架空記録はcurrentでも非公開で、未設定品目を別軸で保持する。
- 明示DTOの全行から記録本文、根拠、actor、snapshot、内部の対応版を除き、private sentinelの値もserialize結果に出ない。

未解決recordは実DBに通常の追記操作で追加され、DBがsnapshot・recordedAt・reviewSequenceを生成するため、テスト用の `contentSnapshot:{}` を実内容の根拠として信頼する構成ではない。公開gate・schema・認可を変更せず、HTTP/authの試験とも称していない。CIは既存constraints/rollbackのstepをmultiline化し、先行checkが成功した後で新scriptを呼ぶ。既存のowned-menu回帰/buildとの順序も保持されている。

`issue74-list-db-guards.json` と3つの拒否ログ（隔離flagなし、foreign host、test flag＋CI URL）を読んだ。全てexitCode=1、固定REFUSED、DB module import interceptionの `dbImportAttempts:0`。probe自体も読んだ。`issue74-list-db-lint.log` / `issue74-list-db-typecheck.log` は空で、ログだけでは終了0を独立に確認できない。担当の最終tool実行報告で照合する。独立側はguardやtypecheckを再実行していない。

実PostgreSQL/Dockerは今回ローカル実行していないため、追加scriptの6状態＋DTOの7個のPASS出力、実SQLの実行、正常時/途中失敗時のcleanup、GitHub Actionsでの全step完走は引き続きUNVERIFIED。CIで新scriptが動き、これらが成功したログを最終確認する必要がある。今回のreviewとguard拒否の成功だけで、実DB projectionの合格と記載しない。

06:14 UTC追補: `issue74-list-db-handoff.json` と担当のtool完了報告を受領し、型検査・対象scriptのlintはいずれもexitCode=0と確認した。2ファイルhashは上表と同じ。`issue74-list-db-workflow.log` には既存js-yamlでのYAML parseと既存constraints回帰→新scriptの順序assertのPASSがあり、handoffもexit0。diffcheck0、guard拒否3件/import0の記録も一致する。実DB未実行の判定は変えず、最終docs同期とPR CIでの実PostgreSQL結果確認をrootへ引き継ぐ。
