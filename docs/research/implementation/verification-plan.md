# Verification-first plan

この節は研究run時点の計画。本研究runはtest code未変更、production code未変更。**REDは設計であり研究runではT01以外の不具合再現を実施済みとしない。** EX01もfailing test実装ではなく既存pure関数への合成入力実験。後続runのT01 RED/GREENは[I01結果](i01-result.md)、T09 API RED/GREENと2026-09-30の隔離DB・実ハンドラ結果は[I02結果](i02-result.md)へ記録。

## Current execution evidence

- RUN01 `npm.cmd test`: exit0、124 tests PASS、0 FAIL/skip、約27.95秒。25 test files、Node22.15.1、repository指定22.23.1との差あり。既存unit/API mock等を実行。DB/Clerk/Blob/cache実結合ではない。
- RUN02 `npm.cmd audit --ignore-scripts --audit-level=high --json`: 初回sandbox内のregistry通信失敗でexit1、読み取り専用network再実行はexit0、known vulnerabilities 0。npm依存集計696。fix/installは実行していない。
- EX01 Node stdin + `node --import tsx`で既存 `lib/allergens.ts` とmasterをrequire。全29linksをFREE、eggのみUNRECOGNIZED、name=fictional、storeHandlesAllergen=false。観察: map.egg=UNRECOGNIZED、publishable=true、effectiveRisk=FREE、label=原材料に含まない登録、selected summary.badge=unknown。通常API/schema enumは別の遮断境界。最初のESM named import試行はmodule解決エラー、CommonJSで再実行した。環境エラーをsemantic REDに数えない。

EX01の再現手順は上記入力でcreateStatusBySlug→isMenuPublishable→getAllergenEffectiveRisk/statusLabelJa→buildSelectedAllergenSummaryを呼ぶだけ。外部I/Oなし。新test codeは作成しない。

## Expected tests

| Test / linked requirement + invariant | Preconditions / input / scenario | Expected result | Expected failure before implementation / why it proves behavior | Level / higher-level |
| --- | --- | --- | --- | --- |
| T01 SR-SEM-001 INV01 | 正常master29、FREE baseline、各slugを未知string/empty/null相当/missingへ置換。public API mockで1未知link。直接effectiveRisk/labelも不正値を渡す | invalidはUNKNOWN扱い、publication false、publicAPI404、negative labelなし。有効FREEだけnegative、CONTAINS/MAY/STORE_HANDLED不変 | EX01でpublication true/effective FREEがREDになる。API input validationだけのtestでは不十分 | pure unit+API、既存display/publication回帰、public browser |
| T02 SR-PUB-001 INV02 | 専用PostgreSQL、全migration、完全master。tx内delete/recreate links、commit後missing/UNKNOWN、blank name。master0/extra/missingはAPI readでも試す | 完全txは公開維持、不完全commitは非公開+trigger audit、rollbackは全不変、public新readは404 | 多くは既にGREEN expected。新master parity case/trigger未適用ならRED。GREENを無理に壊さずcoverageを確認 | real DB+API、page E2E。fake tx不可 |
| T03 DR-CON-001 INV04 | 同ownerの2clientがrevision rを取得、A egg CONTAINSとB古い全FREE+priceをbarrierで同時PUT。順序双方。別menu並列対照 | 同revision成功は1件、他409、勝者fields/linksを維持、敗者入力を保持。異resourceは競合不要 | 現在expectedRevisionなし/全map置換なので両成功/上書き。schema後もtx rollbackとfinal DB内容で判定 | real Prisma/Postgres integration+API+2tab E2E |
| T04 SR-FRESH-001 INV07 | build/start+隔離DB、page/APIと2tab、publish→update→unpublish、直接SQL、別menu補足、DB outage、back/focus/offline | HD-05のfreshness contractに対し各経路の表示ageを測定。現段階は閾値なし、観察のみ | “60秒で必ず更新”仮説が反証され得る。契約未決なのでPASS thresholdを創作しない | HTTP/browser controlled experiment+Preview、TDD_NOT_APPROPRIATE |
| T05 SEC-ID-001 INV09 | mocked server identity: primary verified/unverified/null/failed、primary欠損+先頭email一致、currentUser.id不一致、pending inviteは同email | HD-06案ではverified+同一identityのみaccept。その他owner/user/invite不変、既存401/400等の承認contract | 現在verificationを捨ててemailだけ利用するためunverified pathが進む見込み。tenant到達性は別 | auth/API+real Clerk専用tenant、DB write結果assert |
| T06 SEC-ASSET-001 INV10 | 自店/他店URL、draftupload、save失敗、画像差替え、delete、参照復活race | 現行owner拒否維持。HD-07決定scope外に画像露出/誤削除しない。参照済みは回収しない | public draftURLが取得可能という仮説はrealBlobで確認。公開前提なら拒否を要求するtestは不適切 | API+realBlob+DB refs+manual、delete時TDD_REQUIRED |
| T07 DR-OUT-001 INV13 | fields/links commit後だけrevalidateがthrow、audit failure対照、ネットワーク応答遮断、create再試行 | HD-09契約に従いcommit/unknown outcomeを区別。DBは1回の確定内容、blind retryをしない | 現handlerは後処理throwを500へ扱う見込み。モックcall countでなくHTTP+DB+UI状態を確認 | API fault injection+realDB+client E2E |
| T08 SR-FRESH-001 INV07 | menu本体読取とsupplement読取の間に別txで公開/CONTAINS変更 | 許容snapshot条件HD-05を満たす。main semanticsとsupplement時点差を別記録 | 別queryで混在し得るが食品semantic誤りの再現は未確認 | integration timed read、spike |
| T09 SEC-OWN-001 INV03 | A owner→menu Aを事前read後、隔離DBでmenu.shopIdをBへ移してからPUT/DELETE継続。通常他店ID/unauth/portfolioも対照 | HTTP404（存在秘匿）、Bmenu/links不変、tx rollback。通常A成功 | 現id-onlywriteは移転後menuを変更し得る。API再割当機能はないので防御範囲を限定 | auth/API+realDB interleaving。owner失効raceは別HD-04 |
| T10 SR-SEM-001/SR-PUB-001 INV01/02 | DB connection error、unexpected enum decode error、missing relation、public supplement failure | 正常0件/FREEと混同せずunavailable/500/404等の現契約。秘密情報なし | 既存test GREEN expected、public page境界の不足は追加検証 | API+component/E2E、実DB切断は隔離 |
| T11 SR-REV-001/DR-PROV-001 INV05/06 | rのreview後にingredients変更でr+1、旧review再送、price/imageだけ変更、review insert失敗、rollback、legacy row | HD-03の対象集合/公開policyに従う。actor/time server、旧reviewをcurrent扱いしない、failureはatomic rollback | review schema/policy未実装なので欠如によるRED。最初に承認specを確定 | pure policy+application+realDB+店舗manual |
| UX01 PR-SCOPE-001/UX-COMP-001/UX-A11Y-001 INV08 | product/ux-riskに詳細、架空task/当事者/保護者/店舗 | 承認rubricで理解/操作を観察 | code testでは反証不能、現時点UNKNOWN | user experiment+manual、TDD_NOT_APPROPRIATE |
| OPS01 OR-INC-001 INV11 | 架空incident、同requestId/target、owner非公開、外部取消失敗、隔離restore | 対象・担当・実行・新規read・復旧を証跡化。時間目標HD-04 | runbookが実際に使えない/権限不足で失敗し得る | tabletop/operational drill |
| REL01 OR-REL-001 INV12 | release SHA/runtime/lock/migrations/settings、tests結果 | 差を見つけたらunknown/hold、secret値なし | 本日Node差のような不一致を検出 | manual+CI evidence review、TDD_OPTIONAL |

## Test double policy / practical execution

Pure semanticsは実関数へ合成入力。API testsのClerk/Prisma/Blob/cache stubは分岐とcontractの観察用。実DBのdeferred trigger/部分unique/row lock/isolation/rollbackは `scripts/check-ci-database.ts` または専用Composeの `scripts/check-test-database.ts` 接続guard下で確認。tenant招待/Blob/CDN/Next cacheは実サービスまたはproduction buildで別途確認。接続先・副作用の承認前に実行しない。

新property-basedライブラリは不要。4状態×欠損×不正×STORE_HANDLED×設定のtable-driven例で開始し、必要なら全slugに反例を反復。広いunicode/不正object入力空間の未検出が実証されたらproperty testを追加する理由をIssue化。snapshotだけではsemantic assertionの代用にしない。

RED→GREEN→REFACTOR: 正しいfailure reasonを確認し、最小実装、同invariantを維持した整理。compile failureや実DB未準備をRED成功に数えない。最初からGREENなら既存充足/weak assertion/読解/範囲を再確認。DB failをmock call countで“証明”しない。

Characterization: D01/D02/D03の有効現行contract（partial omission、explicit null、publish true invalid400、implicit UNKNOWN unpublish、401/403/404、画像owner、表示注意）を保持。EX01/lost update/誤った鮮度保証はbug候補として意図的変更側へ置く。

## 未実行

lint/typecheck/buildはdocs-only runのため省略（buildはPrisma生成も伴う）。実DB migration/seed/repair/schema validate/generate、browser/admin E2E、real Clerk/Blob/Google/Neon/Vercel、理解度研究、restore/通知は未実行。定義・計画の存在をPASSにしない。最終docs/link/freeze検査はreadinessに記録する。
