# ClearAllergy：27件のIssueと現行コードの照合

2026-10-15 JST。固定main `e26b6088b79a4a3eaa1812c171657581fb814b66` を基準とする。27件のIssue本文・全コメント、関連PR #62/#63/#66–#71/#75/#77、コード・schema・既存テスト定義・公開文書を照合した。今回の安全な隔離実行は #73/#74 の7ケースのみ。実DB・Clerk・Blob・ブラウザ・本番・実食品・店舗運用は今回検証していない。

## 結論と読む順序

27件のopenを27件の未実装と数えない。メニューのCAS、食品版への確認snapshot、STOP、単一DB時点での公開読取、保存確定後のpublicRefreshPending、作成操作IDは既存実装である。旧Issueへ現在の成果と未達条件を対応付ける整理が先になる。

#73の店舗保存は別経路で、古い全量フォームによる後着上書き、更新完了後のcache例外による500、不正200でも保存済みに進む条件を実処理＋メモリ代用で確認した。#74は全品目設定済み・食品確認旧版の対象行が「下書き」「アレルゲン設定済み」と出る一方、食品確認の状態が一覧projectionに存在しないことを確認した。公開ゲート突破や本番事故の報告ではない。改修方式・API契約・schema・実装はこの調査で採用していない。

- [メニュー・公開契約の11件詳細](menu-contract-issues-20261015.md)：元条件、現物・テスト、残り、次手、利点・副作用・検証。
- [identity・画像・理解度・運用・文書の14件詳細](identity-operations-issues-20261015.md)：元条件、caller境界、正式判断・環境の残り。
- [全27件の文書参照照合](issue-document-references-20261015.md)：固定mainとPR-only、文書カテゴリ表現、歴史記録の区別。
- [#73/#74の実行と方法レビュー](../../verification/shop-menu-isolated-probe-20261015.md)：7ケース、実ソースhash、代用・遮断構造、全結果、未実施。
- [別担当によるIssue棚卸し原稿（Library）](https://chatgpt.com/api/library/files/libfile_92bf9b64a8688191b8dbe573f09a06a9/download)：15:12–15:15 UTCの静的な補助記録。Libraryへのアクセスが必要で、GitHub閲覧の必須根拠にはしない。後続の隔離実行と承認の変化は本稿で区別し、27件の受入・次手は本稿と上の2詳細に収録する。

## 証拠の時点・範囲

| 証拠 | 時点・確認方法 | 確認できること | 確認できないこと |
| --- | --- | --- | --- |
| GitHub metadata | 2026-10-14 15:25 UTC頃、全27件個別取得。#77とmainは15:42 UTCに再取得 | 取得時点で27件OPEN・assignee空。#70/#71/#75はmerged。#77はDraft/open、head10945eb、CI success | owner確保、実店舗実施、公開機能採用の全判断 |
| 現行ソース | main e26b608固定。canonical app/features/lib/components/prisma/tests/scripts/package/lockをmainへ比較。別担当は同内容のPR77 checkoutを読取 | このSHAの実装と既存テスト定義。主要19ファイルの独立行比較、probe使用23ファイルのSHA256一致 | テスト定義が今回全て実行されたこと、配備も同内容であること |
| 過去の検証記録 | Issue/PR/verificationに日付・対象付きの実DB、CI、復旧報告 | その日時・環境・限定ケースの報告 | 今回の新しい実行、本番の現在状態、実食品の正確性 |
| #73/#74隔離実行 | 2026-10-14 15:42 UTC頃、Node22.15.1、実TSをVMで実行。7ケース、exit0 | 実処理の分岐、メモリ状態、synthetic React/JSXの対象行・保存state | PostgreSQL同時実行・durability、Next/Clerk/browser/deployed cache |
| 方法レビュー | 履歴を共有しない別担当による静的読取。最小補強後も再読 | 重大な誤接続を見出していない。sourceHashes全23一致、#74の正の描画対照を確認 | 再実行、本番・ブラウザ・全mock正当性の網羅証明 |
| 5研究稿・統合・反証レビュー | 公開資料／研究設計原稿を全文保存 | 出典・適用限界、提案の条件、比較方法 | 店舗導入効果、医療・食品安全、実装欠落、採用・公開承認 |

canonicalは `docs/shops-recovery-20261010` / HEAD `f5ec73b69c91f3c19d516f131a14c7f644fe8f32`、開始時の既存変更9項目を保持する。新文書は独立worktreeで作る。#77は未mergeのため新PRの基点は `agent/research-followup-20261014` / `10945eb830d36171a2712ced306d36e5662fa6be`。この依存と、アプリコードがmainと同内容であることを分ける。

## 全27件の次手と優先度

P1は実店舗用途・招待拡大・機密入力等の対象用途へ進む前の判断／限定改善候補、P2は計画的検証や契約追跡、P3は完了成果の台帳整理。事故頻度・攻撃成立・全Issueの深刻度を測った順位ではない。現在のIssue/label/assigneeは変更しておらず、closeは案のみ。

| Issue | 現在の条件・残り | 次手と受入 | 依存・優先度 |
| --- | --- | --- | --- |
| [#38](https://github.com/Kaito-Iwase/ClearAllergy/issues/38) | PR62最終所有店舗条件修復、移転・消失・rollback実DBの過去記録あり。完了整理候補 | 元scopeを現write/既存記録へ対応付け、人が完了判断。即時owner取消等へscopeを広げない | PR62/70、P3 |
| [#39](https://github.com/Kaito-Iwase/ClearAllergy/issues/39) | 架空prototypeの利用境界と注意表示は既存。対象・用途・重大誤認受入の正式判断が残る | 署名・日付付き用途/対象/claim/非保証/停止条件を既存U01–U08へ対応付ける | #52、P1 |
| [#40](https://github.com/Kaito-Iwase/ClearAllergy/issues/40) | メニューversion CAS、428/409、入力保持あり。採用範囲・旧client/mixed writerの追跡が残る | PR70の具体契約・承認範囲と残移行条件を同期。店舗へ自動拡大しない | #48/PR70、P2（実移行P1） |
| [#41](https://github.com/Kaito-Iwase/ClearAllergy/issues/41) | 食品版別snapshot、根拠/範囲/申告確認時刻/DB記録時刻/actor/未解決あり | 保持・cascade削除・復元・privacy・営業秘密・現場確認の契約を決める | #51/#39、P1 |
| [#42](https://github.com/Kaito-Iwase/ClearAllergy/issues/42) | owner/運営の権限境界、STOP、限定復旧は既存。責任・不在時・目標は未決 | 実行可能な停止/再開/連絡表と時刻を決定。常時二人・24時間体制を要求しない | #53、P1 |
| [#43](https://github.com/Kaito-Iwase/ClearAllergy/issues/43) | dynamic/RepeatableRead/取得不能表示あり。既存tab/offline/数値目標は残る | 新規取得と配信済画面の契約を分け、測定から許容範囲を判断 | #49/#47/#57、P1 |
| [#44](https://github.com/Kaito-Iwase/ClearAllergy/issues/44) | primary→first fallback、verified未強制、auth/currentUser ID一致未強制。provider到達性不明 | 専用tenant条件と既存caller影響を調べ、拒否contractを選ぶ。攻撃成立とはしない | #50、P1 |
| [#45](https://github.com/Kaito-Iwase/ClearAllergy/issues/45) | public Blobとdraft flagは独立。形式検査・owner URL guardは機密保護ではない | 公開写真のみで足りるか、機密保持/削除/復元の対象を判断 | #55、P1 |
| [#46](https://github.com/Kaito-Iwase/ClearAllergy/issues/46) | 0公開可能menuのnot-foundとguideは一致。製品方針の記名記録は別 | 既存境界を正式化する目的/理由、または別の必要を判断。B/C自動採用なし | #56、P2 |
| [#47](https://github.com/Kaito-Iwase/ClearAllergy/issues/47) | メニュー保存後pending/unknown/作成IDあり。旧一律500前提は古い | 現outcomeと通知責任/配送/ID寿命/再確認の残りを追跡 | #43/#57、P2（実運用P1） |
| [#48](https://github.com/Kaito-Iwase/ClearAllergy/issues/48) | メニューCAS/trigger/atomic fields-links-review実装済み | 元missing400→現428、DELETE除外→現対象など採用差を対応付け、未検証のmixed配備を分ける | #40/PR70、P2 |
| [#49](https://github.com/Kaito-Iwase/ClearAllergy/issues/49) | F01–F08設計、後続fresh read/snapshotの過去記録あり。全測定未完 | 専用Preview/2tab/back/focus/offline/負荷/障害の残りを現SHAで測る計画へ更新 | #43、P1 |
| [#50](https://github.com/Kaito-Iwase/ClearAllergy/issues/50) | verified/ID一致の明示強制は未実装。受諾前に期限切れ書込もある | 全callerとno-write境界を固定後、承認された条件だけ実装・正常回帰 | #44、P1 |
| [#51](https://github.com/Kaito-Iwase/ClearAllergy/issues/51) | 食品版・最新snapshot・DB公開失効・原子性あり。保持と現場証拠は残る | 技術受入をPR70へ対応、運用受入を#41へ区分。#74で本体再実装しない | #41/#40/#48、P1 |
| [#52](https://github.com/Kaito-Iwase/ClearAllergy/issues/52) | U01–U08、同意/匿名票は設計済み。参加者実施はなし | 現UIへbaseline更新し、対象/採点/中止条件/募集の承認後に実施 | #39、P1 |
| [#53](https://github.com/Kaito-Iwase/ClearAllergy/issues/53) | O01–O07台本済み。取消の順序など旧手順が現コードと違う | STOP/食品確認/ローカル取消先行へ台本を合わせ、承認した隔離drillを実施 | #42/#54、P1 |
| [#54](https://github.com/Kaito-Iwase/ClearAllergy/issues/54) | dated ledgerは成果化。PR71に限定本番migration/架空デモ32件/隔離restore | ledger完了と現在releaseの未知を分ける。全本番・alerts/backup確認済みにしない | #43/#53、P2 |
| [#55](https://github.com/Kaito-Iwase/ClearAllergy/issues/55) | owner prefix guardあり。機密性/保持/自動回収・参照raceは未決 | #45後に専用storeで配信・差替え・保存失敗・猶予後再照合を検証 | #45、P1 |
| [#56](https://github.com/Kaito-Iwase/ClearAllergy/issues/56) | 0件pageの文書不一致は訂正済み。正式判断追跡は残る | #46と対応し、streaming not-foundの200/noindexをHTTP404と混同しない | #46、P3 |
| [#57](https://github.com/Kaito-Iwase/ClearAllergy/issues/57) | メニューcommit前/後/unknown、pending、create重複抑止あり | 既存結果と実セッション/network/通知/寿命/画面鮮度の未確認を分ける | #47/#43、P1 |
| [#60](https://github.com/Kaito-Iwase/ClearAllergy/issues/60) | 今回27件の118字句組を分類。具体/dir参照87組はmain83/PR77のみ4 | 必須根拠の意味とowner/過去削除意図を対応付け、別承認後にIssue参照を更新 | PR67/75/77、P2 |
| [#64](https://github.com/Kaito-Iwase/ClearAllergy/issues/64) | 検証npm同梱は撤去、既存CLI解決・actualNpm記録あり | 代替方針・許容版差をPR67と現CI/Docker/runtimeへ対応付ける | PR67、P2 |
| [#65](https://github.com/Kaito-Iwase/ClearAllergy/issues/65) | 空画像拒否・後続署名検査あり。限定完了整理候補 | PR66の5MIME等受入と現testsを対応。実Blob/画像全体の安全保証へ広げない | PR66/67、P3 |
| [#72](https://github.com/Kaito-Iwase/ClearAllergy/issues/72) | PR75の9文書merged。完了整理候補 | mainと全文・索引・保全・hardbreak診断を受入へ対応 | PR75、P3 |
| [#73](https://github.com/Kaito-Iwase/ClearAllergy/issues/73) | 本稿の隔離6ケースで3条件を確認。実DB/browser/発生頻度は不明 | 以下の選択・互換・原子的最終判定を決めてから限定改修 | メニュー契約は参考、P1改修候補 |
| [#74](https://github.com/Kaito-Iwase/ClearAllergy/issues/74) | 隔離1ケースで食品確認状態を一覧へ投影していないことを確認 | 最小状態/件数/非色理由/編集入口を設計し公開ゲート維持 | 現#41/#51の理解、P1改修候補 |
| [#76](https://github.com/Kaito-Iwase/ClearAllergy/issues/76) | PR77の5文書、CI success、まだDraft/open | 文書・限界を人がレビューしmerge判断。新稿はその依存を明記 | PR77、P2 |

## #73：店舗保存の3条件と具体的改善候補

### 今回確認した分岐

固定ソース：[店舗PUT](https://github.com/Kaito-Iwase/ClearAllergy/blob/e26b6088b79a4a3eaa1812c171657581fb814b66/features/admin/shop/server/adminShopRoute.ts)、[店舗フォーム](https://github.com/Kaito-Iwase/ClearAllergy/blob/e26b6088b79a4a3eaa1812c171657581fb814b66/features/admin/shop/components/ShopEditClient.tsx)、[Shop schema](https://github.com/Kaito-Iwase/ClearAllergy/blob/e26b6088b79a4a3eaa1812c171657581fb814b66/prisma/schema.prisma)。

F1：実clientは全量を送り、実PUT最終whereはidのみ。訂正→古い電話編集は両方200で備考訂正が旧値へ戻り、逆順でも両方200で電話変更が初期値へ戻った。直列実行した古いフォームの反例であり、実PostgreSQLの同時実行を測ったものではない。どちらの順序でも後着全量上書きである。

F2：メモリupdateが完了してから公開再検証だけをthrowさせると500、メモリの変更は残り、成功監査の後に失敗監査も記録された。`lib/audit-log.ts`はbest effortであり、「監査は通常throwする」という主張ではない。実DBcommit durability・本番cache障害の証明ではない。

F3：実ShopEditClientのsubmit/save処理に空本文200・`{}`200・別shop IDのDTO200を返すと、3件とも成功文とsavedForm基準の更新へ進んだ。正常APIはshop DTOを返すため、実配信で不正200が起きている証拠はない。synthetic React hooks/JSXによる分岐確認で、ブラウザ操作・DOMの証明ではない。HTTPエラー等の失敗対照を今回新規実行していない点も残す。

### 選ぶべき契約と副作用

| 改善候補 | 利点 | 副作用・未確定条件 | 受入・検証 |
| --- | --- | --- | --- |
| 成功DTOの形式・対象shop・結果tokenを検証 | 不正200を保存済みへ昇格させず、入力保護を保てる。メニューの既存validatorを参考に局所化可能 | 厳格化すると旧server/client混在で応答拒否。parse不能時に「未保存」と断定すると既に保存済みを誤認させる | 正常/empty/{} /wrong ID/missing token/HTTP errorを分け、unknownは入力・画像状態を保持して現状確認へ |
| update後の公開再検証失敗を成功＋反映未確認へ分離 | 既知保存と配信未確認を区別し、盲目的再送を減らす | UIだけ成功とすると反映失敗が見逃される。通知配送・担当・再確認が必要。真にDB結果不明の例外は成功扱い不可 | update前失敗/既知update後cache例外/通信断のmatrix。実DB状態・HTTP/UI・運用eventを別にassert |
| updatedAtを期待tokenとして原子的最終writeに含める | 専用columnなしの候補。古い全フォームの無言上書きを拒否できる可能性 | 精度、同一時刻更新、serialization、全writerの更新責任、trigger・手動更新、ABAに注意。読取後に比較するだけでは競合防止にならない | 採用対象writer・tokenの一致性を固定し、両順序・同項目・異項目・更新なし・削除/移転/owner条件・legacy clientを実DBで検証 |
| 専用versionによるCAS | メニューと類似した明確な最終判定・入力保持を構築しやすい | schema/migrationと全writer更新、backfill、rollback、旧client拒否が必要。今回は未承認 | all writers/SQL/trigger/混在配備を棚卸し、同一base成功最大1と失敗時no partial writeを実DBで証明 |
| 内容比較・hashによる期待状態 | column追加を避ける案。比較対象の変化を検知できる可能性 | 正規化/null/JSON順/比較範囲/同内容復帰ABA/画像stateの扱い。hash衝突だけでなく対象を落とす問題 | 最終writeの原子性・全重要field・同値復帰・正規化差を検証。事前read比較のみでは不足 |
| 差分PATCHと自動merge | 異項目の不要な全量上書きを減らす可能性 | 同項目競合は残る。相互依存fieldや画像・備考の訂正を善意で誤mergeする。PATCHだけをCAS修復にしない | CAS/人が差分を見る契約と分けて評価。勝者へ古いtokenを自動接続しない |

受入案：最終writeがserver所有店舗と選んだ期待状態を同時に判定する。競合敗者の入力を保持し、最新との比較・再確認を選べる。認証・Origin・portfolio・画像URL・busy・未保存保護を維持する。画像アップロードと店舗保存は二段階であり、競合/unknown後の孤立画像や再送を別に扱う。競合方式・応答契約・互換/rollbackを決定した後、店舗経路だけの変更としてRED→GREENと独立reviewを行う。今回のdocs PRでその実装を始めない。

## #74：再確認待ち一覧を既存条件から導く

固定ソース：[一覧page](https://github.com/Kaito-Iwase/ClearAllergy/blob/e26b6088b79a4a3eaa1812c171657581fb814b66/features/admin/menus/server/AdminMenusPage.tsx#L30-L72)、[一覧client](https://github.com/Kaito-Iwase/ClearAllergy/blob/e26b6088b79a4a3eaa1812c171657581fb814b66/features/admin/menus/components/MenuListPageClient.tsx)、[既存公開条件](https://github.com/Kaito-Iwase/ClearAllergy/blob/e26b6088b79a4a3eaa1812c171657581fb814b66/lib/allergens.ts)。

全品目FREE、foodVersion2/reviewedFoodVersion1、isPublished=falseの架空料理を用意した。実isFoodReviewCurrentはfalse、実pageのselectとrowには食品版/確認版がなく、unknownAllergenNamesは0。対象article1件の名前・「下書き」「アレルゲン設定済み」を正にassertしたうえで、食品確認理由を表示していない分岐を確認した。本文の二語不在だけで判定していない。公開ルートやDB triggerを迂回していない。

改善案は、既存食品確認の意味に沿う最小projection、再確認待ちの件数・filter・非色理由・編集入口、案内文の整合に限定する。利点は一覧から作業を見つけやすくすること。時短や見落とし低減は未実測である。副作用はDTO過収集、通常STOPを確認失効と誤分類、データ不明時に原因を作ること、件数filterの重複・見落としである。

共有callerには通常AdminMenusPageだけでなく、`app/admin/demo/menus/page.tsx`のreadOnly一覧（独自select/DTO）もある。`adminMenusRoute.ts`の一覧GETも食品確認projectionを持たない。新しい状態を必須化する前に、通常取得・再取得・demoと既存テストの対象を照合する。demoへ非公開根拠・actorを追加せず、取得に失敗したときも失効理由を推測しない。

受入案：未設定、現行確認済み、旧確認、最新未解決、記録なし、通常STOP、0件、検索/削除後、取得失敗を分ける。normal STOPのisPublished=falseだけで食品確認失効と呼ばない。最新記録の意味は食品版一致だけで簡略化しない。原本・actor等の不要情報を公開projectionへ足さない。mobile/desktop、keyboard、非色表現は承認後の実ブラウザで検証する。担当割当・期限・通知・新schema・公開条件緩和は本候補へ追加しない。#73とは別の限定改修が適切。

## 原稿の「未確認」を現行欠落へ変えない対応表

| 原稿の論点 | 今回の静的確認 | 実行・本番・現場の残り |
| --- | --- | --- |
| メニューCAS/食品確認/STOP/保存後outcome | 既存。11件詳細でsource/trigger/tests/PRに対応 | 全writer/mixed配備・通知運用・実食品・実Clerk・現場確認は別 |
| 公開snapshot/古い画面 | 新規readはdynamic/RepeatableRead。既存tabを自動更新する一般保証はない | back/focus/offline/bfcache/外部紙・画像・実配信測定 |
| 個人アレルゲン設定 | `lib/public-allergen-preferences.ts`に検証・localStorage・削除・読取失敗・storage/focus通知があり、UserAllergenPreferenceClientに未適用/競合・保存直前再取得がある。ログイン不要というUI記載あり | root layoutにVercel Analyticsあり。選択値が解析SDK/URL/通信/ログへ送られないことを今回測定していない。localStorage存在からhealth情報の法的分類・非送信を断定しない |
| 画像・原本 | 既存画像uploadはpublic、形式・signature・owner prefix guardあり | 機密原本upload機能が存在/不在との全監査はしていない。再配布権限、保持・private化・自動回収は未決 |
| 料理構成/未申告変更/同一料理AND/将来日/過信 | 原稿のT18–T25、D01–D06は研究上の候補。今回はそれらの実アプリ試験なし | 原稿の「全実装不明」は執筆担当の証拠範囲。今回確認しなかった事項を未実装としない |
| 停止後の訂正経路 | 通常STOPと公開ゲートは既存。0公開可能menuではshop not-found | R6/D06の訂正表示/侵害時の別経路は未採用比較。常に全消去/常に全表示へ決めない |

個人設定のsource：[preferences](https://github.com/Kaito-Iwase/ClearAllergy/blob/e26b6088b79a4a3eaa1812c171657581fb814b66/lib/public-allergen-preferences.ts)、[client](https://github.com/Kaito-Iwase/ClearAllergy/blob/e26b6088b79a4a3eaa1812c171657581fb814b66/features/public/shops/components/UserAllergenPreferenceClient.tsx)、[Analytics配置](https://github.com/Kaito-Iwase/ClearAllergy/blob/e26b6088b79a4a3eaa1812c171657581fb814b66/app/layout.tsx#L47)。SDK固有挙動や法律は本稿で追加判定していない。

## 次に判断する順序と停止条件

まず#38/#65/#72の完了整理、#60/#64の追跡、#40/48・#41/51・#47/57・#43/49・#46/56の対応を確認する。これは技術修復の件数を増やす作業ではない。既存Issueの更新・closeは別の明示依頼後である。

限定改修を選ぶなら#73の競合/応答/移行を判断し、#74の最小projectionを別に具体化する。#44→#50は招待対象を広げる前、#45→#55は機密入力を扱う前の条件である。#39→#52、#42→#53、#43↔#49、#54の現場・責任・配備証拠はCIやデスク研究で埋めない。

実店舗利用については、別に観察した未申告変更、料理構成欠落、複数条件と適用版、将来日、表示自体の信用付与、通常停止と訂正/侵害を分ける試験候補を残す。研究者票をすべて店舗入力へ移さない。紙/Excel/電話/未導入も同品質の比較対象で、採用しない判断・募集できない結果・対象縮小・離脱も成果に含む。試験数が増えたこと、7ケースやCIが成功したことを公開可・安全性の承認へ昇格しない。

アプリ・schema/DB・公開設定・既存Issueの編集/close・既存PRのmerge/ready化・店舗連絡・募集・実食は本作業では行っていない。新しい文書のDraft PRだけが現在の承認範囲である。
