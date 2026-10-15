# 公開画面の再取得導線・一料理の材料変更E2E 最小案（草案）

[今回の結論](../engineering/material-change-followup-20261016.md) · [確認文の反証・再現](../../verification/material-change-confirmation-20261016.md) · [計画の照合JSON](../../verification/evidence/20261016-material-change/refresh-e2e-scope.json)

> 配置注記：以下は担当者の計画草案全文です。「作業差分なし」「PRを変更していない」は草案作成時点の記録で、後続の文書取り込み状態はPR #81で確認します。既存本文を省略せず、閲覧用リンクを追加しました。

読取確認: 2026-10-16 00:23 JST（2026-10-15 15:23 UTC）。以下は静的照合と計画草案であり、この日時の実行試験結果ではない。

対象: `clearallergy-docs-main-integration` の `521c7fd05ff757c8366ff0f12b448a7b9249cd5c`。照合したcode mainは `cd502b2404f518975dc4243ab6c41a702e7aa226`。両者の `app/features/lib/scripts/tests/prisma/package.json/package-lock.json` に差分はなく、`.github` の差分もIssue/PRテンプレートだけだった。対象repoは調査開始・終了とも作業差分なし。

**結論: Aは既存の公開取得を呼び直す明示操作、Bは既存の実認証ブラウザ回帰への一連の操作追加とする。dynamic・snapshot・CAS・食品確認・STOP・pendingの作り直しは不要。** この文書は計画だけであり、コード・DB・provider・Issue・PRは変更していない。実行試験は今回行っていない。

## 現在の実装を前提にする

| 既存機構 | 現物の根拠 | 今回の不足との関係 |
| --- | --- | --- |
| 新規公開取得はdynamic | `app/(public)/shops/` の3つの `page.tsx`、`features/public/shops/server/PublicShopListPage.tsx:7`、`PublicShopDetailPage.tsx:33`、`PublicMenuDetailPage.tsx:24` の `force-dynamic` | 開いてある画面への自動配信は別。TTL変更やdynamic追加をAに含めない |
| 公開情報を同じDB時点で読む | `features/public/shops/server/public-read-snapshot.ts:7` のRepeatableRead。公開3ページと公開API、補足が同じtxを使う | Aは同じ読取経路を再実行する。別の公開JSON取得器を作らない |
| 保存の競合検査 | `features/admin/menus/server/adminMenuRoute.ts:244` の428/409、`:440` の所有店舗＋version条件 | Bはフォームが渡す既存expectedVersionを使う。DBトリガー由来の版増分は固定値にせず増加を検査 |
| 食品変更で旧確認を失効 | `features/admin/menus/food-review.ts:7`、`server/adminMenuRoute.ts:390`、`server/food-review-save.ts:16`。DB側でも版・記録・公開条件を検査 | 全アレルゲン設定済みでも食品確認が旧版なら公開しないケースをBでつなぐ |
| 管理一覧に再確認待ち | `features/admin/menus/server/menu-list-data.ts:5`、`menu-list.ts:20`、`components/MenuListPageClient.tsx:81` | missing/outdated/unresolvedを表示し、通常STOPはcurrentを維持。新しいキューは作らない |
| フォームと独立したSTOP | `features/admin/menus/server/adminMenuRoute.ts:652`、`components/MenuEditClient.tsx:459` | 不完全なフォームを送らず停止できる。権限拡張・新停止APIは不要 |
| commit済みと反映未完了を区別 | `server/adminMenuRoute.ts:520`、`:621`、`:663` と `components/MenuEditClient.tsx:397`。createも既存operation ID再送を扱う | pendingを新規実装しない。B正常系の成功を公開反映成功の証明にせず、公開側を実際に読む |
| 取得不能の表示 | `lib/public-db.ts`、`PublicDataUnavailable.tsx`、`PublicShopListClient.tsx`、`app/error.tsx` | Aで障害時の成功表示を新設しない。既存fallback/not-foundの意味を維持 |

## A: 公開画面から明示的に読み直す

| 項目 | 最小案 |
| --- | --- |
| 操作 | 小さな共通Client Component `PublicDataReloadButton.tsx` を追加し、ボタン「画面を再読み込み」で現在のURLをdocument reloadする。既存の動的SSRを使う。自動polling・focus更新・経過時間表示・取得成功時刻は追加しない |
| 変更ファイル | 新規 `features/public/shops/components/PublicDataReloadButton.tsx`。配置は `PublicShopListClient.tsx`、`server/PublicShopDetailPage.tsx`、`server/PublicMenuDetailPage.tsx` の見つけやすい上部と、取得不能時の `PublicDataUnavailable.tsx`。一覧の取得不能分岐にも同じ操作を残す。`scripts/check-publication-propagation.ts` の既存任意Playwright枝を拡張 |
| 文書 | `docs/guide/product.md` の公開操作、`rules.md` の既存表示の限界、`development.md` の検査範囲、`change-map.md` の該当行。実装時だけ当該説明を同期。AGENTS/schema/API/cache utilityの変更は不要 |
| Issue対応 | 主に[#43](https://github.com/Kaito-Iwase/ClearAllergy/issues/43)の既存tabと障害時表示の候補、[#49](https://github.com/Kaito-Iwase/ClearAllergy/issues/49)のF03/F04観察。ボタン追加だけで許容鮮度契約・Preview実測を完了にしない |
| 受入条件 | ①公開3画面と取得不能表示で操作でき、390/1440pxとキーボードで到達可能。②同じ公開URLを保持し、明示操作が新しいdocument取得を起こす。③停止前から開いた詳細でボタンを押した後、停止した料理本文が消えnot-foundになる。HTMLはstreamingにより200/404の両方を許し、本文・noindex・公開API404を分けて確認。④別メニュー由来の補足も既存snapshot経路の結果に置き換わる。⑤保存APIを呼ばず、「最新・確認済み・安全」などの成功断定を追加しない |
| 最小の検査追加 | `check-publication-propagation.ts` は現在、変更後に新規pageを開く。任意Playwrightを変更前に開いて保持し、既存の食品変更・公開停止の後に当該ボタンを押してDOMを検査する。従来のfresh HTTP検査は維持。CSS/キーボード/取得不能表示の局所確認を既存ブラウザfixtureへ追加する場合だけ対象scriptを変更 |
| 副作用・前提 | 各操作で新しい公開DB読取が増える。document reloadのため未確定の検索入力、現在地の並べ替え、開いている個人設定の未保存入力等は初期化され得る。URL queryと保存済みlocalStorage設定を確認する。公開メニューがなくなった店舗詳細は既存どおりnot-found。既存ロード/エラー表示を使う |
| 不採用案 | `router.refresh()` はlocal state保持が必須になった場合の次候補。最小案ではdocumentの読み直しを選び、ネットワーク失敗時の再取得完了通知やlocal state保持の追加設計を持ち込まない。polling/SSE・focus自動更新・最終取得時刻・新JSON endpoint・キャッシュ契約変更は別案 |
| 未確認・留保 | この操作でも、操作しない既存tab・戻る履歴・offline・既に読まれた情報への訂正到達は保証できない。Browser/Next/Vercelの実動作と負荷、再読込の発見しやすさ、障害時の理解は未実測。文言や「表示保持を捨てるか」の選択は既存の人間判断を尊重し、#43の数値SLOを創作しない |

Aはdocument reloadを使う候補として具体化した。local state保持が既存合意の必須条件であれば、親セッションでその条件を優先し、router.refresh案へ置き換える。その場合も、pending終了だけで「再取得成功」と表示せず、同じ停止・取得不能・local state保持の実画面検査を先に定義する。

## B: 一料理の材料変更を実HTTP・PG・Clerkで接続する

| 項目 | 最小案 |
| --- | --- |
| 変更ファイル | `scripts/check-test-browser.mjs` の既存の一料理に、全品目設定済みの材料変更→確認失効→一覧→除外→新確認→再公開→匿名表示を追加する。既存 `browser-runner.mjs admin` を入口とし、新runner/endpoint/schema/依存は追加しない |
| 文書 | `docs/guide/development.md` のadmin回帰範囲、`docs/guide/change-map.md` の対象行。新しい実施記録を `docs/verification/` に作るのは実際に実行した後。既存演習準備記録を今回の実行証拠へ流用しない |
| Issue対応 | [#41](https://github.com/Kaito-Iwase/ClearAllergy/issues/41)/[#51](https://github.com/Kaito-Iwase/ClearAllergy/issues/51)のrevisionと確認対応の既存実装を接続。公開除外は[#43](https://github.com/Kaito-Iwase/ClearAllergy/issues/43)/[#49](https://github.com/Kaito-Iwase/ClearAllergy/issues/49)への限定証拠。保存/反映区別は[#47](https://github.com/Kaito-Iwase/ClearAllergy/issues/47)/[#57](https://github.com/Kaito-Iwase/ClearAllergy/issues/57)の既存機構を前提とする |
| 前提・副作用 | 許可済み専用Compose DB、開発Clerk、既存専用2アカウント、対応するapp、隔離Playwrightが必要。DB初期化・provider書込は今回の計画で開始しない。既存admin回帰全体は店舗説明更新・架空料理作成/削除・実Blob画像追加を伴う。B追加自体は同じ料理を再利用し、画像の再upload/アカウント追加を増やさない。既存の版付きcleanupと別途のBlob cleanupを維持 |
| 成果物 | 同じrun ID/料理IDに対応するHTTP status、版の前後関係、一覧分類、公開DOM結果と必要な匿名画面画像。秘密値・認証情報・確認根拠の自由本文・actor識別子をログに出さない。HTTP成功・DOM・保存後GET・cleanupを別々に記録 |
| 不採用案 | SQLで目的状態を直接作ってフォーム保存成功の証拠にすること、route.fulfillで正常保存を置換すること、デモを保存可能にすること、新しいrevision/確認schema、実DBの競合・rollback行列の再実装。既存回帰のUNKNOWNケースは残す |
| 未確認 | 新しい一連の実行、実Clerk・proxy・専用PG・公開ブラウザの同一runでの接続。成功しても実食品の正確性、現物切替、資料入手、実店舗負担・継続・支払・営業中の遂行、利用者理解を実証しない |

| 段階 | 実操作と受入条件 | 既存との違い |
| --- | --- | --- |
| B0 初期状態 | 既存scriptが作る固有名の架空一料理をそのまま使う。全マスター状態を設定し、根拠・範囲・日時を入力して公開。保存後の管理GETからversion/foodVersion/確認対応版を控え、匿名tabで同じ料理を開く | 新しいfixture作成機構を増やさない |
| B1 材料変更を保存 | 実編集フォームでソースA→B相当の原材料欄を変更し、乳をFREE→CONTAINSへ。全品目は設定済みのまま、新確認記録は入力せず保存。実PUT応答・保存成功表示・再読込後の内容が一致し、版が増え、旧確認が現行扱いされず、isPublished=falseになる | 現 `check-test-browser.mjs:139` は原材料変更と卵UNKNOWNを同時に行うため、食品確認失効だけによる除外を分離できていない |
| B2 管理一覧へ | 通常の `/admin/menus` を開き、固有名検索＋「食品確認の再確認待ち」で同じ料理を表示。アレルゲン設定済みとoutdatedの理由、既存の見直しリンクを確認。実一覧GET DTOの同じIDもoutdatedで、私的確認情報は返さない | メモリfixture/実DB projectionを、実ページ・実セッションに接続 |
| B3 公開除外 | fresh匿名APIは404。fresh公開詳細のDOMに料理が残らずnot-found。他の公開料理がある店舗詳細のメニュー一覧では対象料理だけを除外。保持した旧tabは別に観察し、Aが実装済みならAの明示操作で読み直して同じ除外を確認 | 既存表示を自動訂正したと数えない。Aなしでもfresh readによるBは独立に検査可能 |
| B4 新確認・再公開 | B2の既存リンクから同じ料理の編集へ。保存済みBの原材料と乳CONTAINSを確認し、架空B資料の識別/版・確認範囲・確認日時を新入力。公開toggleで公開を選び実保存する | `menuFoodReview`の新規実装ではない。UIのon/offラベルに従い、状態を確認してからクリックする |
| B5 再取得・利用者表示 | 保存後GETの最新記録が現在foodVersionへ対応し、旧記録も履歴として残り、isPublished=true。実一覧はcurrent、対象は再確認待ちから外れる。fresh匿名API/詳細/店舗メニューはBと乳CONTAINSを表示。アレルゲン設定と注意表示を維持し、確認記録をFREEや安全保証へ変換しない | 保存応答だけを再公開の成功判定にしない。公開食品本文・品目表示を実際に読む |
| B6 終了 | 同じ料理を既存cleanup配列へ登録したまま、最新version付きDELETEと既存画像台帳を扱う。cleanup失敗は失敗として残す。従来のUNKNOWN非公開回帰も引き続き実行 | shared/本番DB操作、他店舗データ削除、新provider設定は加えない |

最小Bは正常な連続経路を接続する。通常STOP・競合・記録insert失敗・commit後cache例外・operation ID再送の行列は既存DB回帰を使い、同じロジックをブラウザへ全重複させない。必要に応じて後続の別ケースへ分ける。

## 証拠の階層と既存回帰との重複

| 入口 | 実際に通すもの | 通さないもの／Bとの関係 |
| --- | --- | --- |
| `scripts/ingredient-change-trial.mjs` | 実MenuEdit/List/公開部品、共通pure policy、loopback HTTP、メモリ内adapter。`:354`付近に材料B保存→一覧→確認記録→再公開の操作が既にある | SQL trigger/行ロック/実CAS/本番server/Clerk/Blobなし。Next navigationも代用品。既存tabはreloadまで保持するケースもある。Bを既に実HTTPアプリE2E済みとしない |
| `scripts/check-allergen-cards-browser.mjs` | 実部品のフォーム・状態・不正応答等の局所ブラウザ確認 | DB/認証を代用。入力保護を実DB原子性へ数えない |
| `scripts/food-review-database-regression.ts` | 実PGの食品変更/巻戻し/記録追加・失敗/旧記録復活拒否/直接更新/マスタ変更/同時訂正 | ブラウザ/実Clerkなし。BでDB制約の行列を再作成する必要なし |
| `scripts/admin-menu-database-regression.ts` | 実route handler＋実PG、CAS・競合、記録失敗rollback、postcommit pending、create再送、STOP | ClerkセッションとNext cacheをプロセス内で置換。実HTTP server/Clerk UIを通すBと異なる |
| `scripts/check-admin-menu-list-database.ts` | 接続ガード付き実PG＋共通一覧select/DTO。missing/current/STOP/outdated/unresolved/UNKNOWN、私的記録の非転送 | 実一覧画面・Clerkなし。B2はこの分類を実画面から確認する追加 |
| `scripts/check-public-read-snapshot.ts` | 実PG/Prisma子SELECT競合、RepeatableRead、次回取得の停止 | BはこのSQL競合試験を置換しない |
| `scripts/check-publication-propagation.ts` | loopback production build＋guard済みCI PG、直接食品変更/未解決/停止後のfresh HTTP。任意Playwrightは停止後のfresh navigation | 実Clerk/管理フォームなし。Aは既存tabの明示reloadだけを追加。local結果をVercel鮮度保証へ一般化しない |
| `scripts/check-test-browser.mjs` / `browser-runner.mjs admin` | 実HTTP app・Clerkログイン・専用DB・Blob。作成/公開/別所有者拒否/原材料＋UNKNOWN非公開は既存 | Bの追加先。現在の成功件数や過去ログは今回の実行結果ではない |

## 指定Issueのlive照合

9件とも今回の取得時点でOPEN。本文と最終コメントは主に旧main `1830a98`（2026-10-04）基点であり、「force-static」「review未実装」「postcommit throwで500」の旧記述を現在の事実として使わない。現在の実装や文書にある既存承認と、Issue全体の受入・決定記録の充足は別に確認する。本草案だけでIssueをclose/Readyにせず、親セッションにある既存の人間承認を再要求する理由にも使わない。

| Issue | 現在の関係／今回残す境界 |
| --- | --- |
| [#43 HD-05](https://github.com/Kaito-Iwase/ClearAllergy/issues/43) | dynamicは現存。開いたtab・offline・障害時表示・許容ageの製品契約をAだけで確定しない |
| [#49 I04](https://github.com/Kaito-Iwase/ClearAllergy/issues/49) | F03の2tab/reload観察とF04のoffline区別にAが寄与。専用Preview測定・環境差・上限保証は未確認 |
| [#47 HD-09](https://github.com/Kaito-Iwase/ClearAllergy/issues/47) | pendingと保存済み表示は現存。保存結果不明全般の契約・運用event検知/責任をコードだけで完了扱いにしない |
| [#57 I12](https://github.com/Kaito-Iwase/ClearAllergy/issues/57) | postcommit pending/create再送は既存実DB回帰対象。B正常系はfault injection全体の代用ではない |
| [#41 HD-03](https://github.com/Kaito-Iwase/ClearAllergy/issues/41) | 版別記録/根拠/範囲/日時/食品変更時失効は現存。収集根拠・保持期間・privacy/復元範囲はBの成功と別 |
| [#51 I06](https://github.com/Kaito-Iwase/ClearAllergy/issues/51) | review model未実装という旧RED理由は現状に合わない。Bは既存版対応を実UIから接続し、移行/保持/現場作業の受入を満たしたとはしない |
| [#52 I07](https://github.com/Kaito-Iwase/ClearAllergy/issues/52) | label/focus/DOMは補助証拠。友人の初回回答・操作と、当事者一般の理解/安全を区別。自動E2Eではclose不可 |
| [#42 HD-04](https://github.com/Kaito-Iwase/ClearAllergy/issues/42) | ownerの既存STOPは現存。incident責任者・停止/復旧権限・通知・目標時間を新設しない |
| [#53 I08](https://github.com/Kaito-Iwase/ClearAllergy/issues/53) | 公開停止後read確認には寄与するが、backup restore・provider障害・人のtabletop・運用訓練は未実施のまま |

## 前提・検証状態

- **PASS（静的照合のみ）:** AGENTS、README/変更対応表/開発手順/公開ルール/現行調査方針、対象実装・既存試験、指定9Issueの本文とコメントを読取照合し、参照する既存29パスの存在を確認した。新しい商品仕様や実施結果は作っていない。
- **UNVERIFIED:** A/Bの実装と実行、現在のClerk/専用DB/Blob/Playwrightの準備状況、Vercel配備、性能、offline/focus/back、利用者理解。ローカルの認証情報ファイルや環境変数の値は取得していない。
- lint/typecheck/test/build/DB回帰/browserは未実行。コード・設定の変更がない計画草案のため、実装との照合とパス確認を行った。過去のPASSは今回の試験成功として報告しない。
- 未申告の現物変更は自動検知できない。材料名の入力だけで構成品網羅性・製品版・提供分との一致を判定したことにしない。アプリに変更が渡されないケースでは旧表示が残り得る。
- 実店舗への接触は行わない。友人による架空の操作者課題から実店舗の工数・資料入手・継続・支払・運用可能性を推論しない。食品の安全性/正確性や実食は対象外。
- repo内の文書更新・Issueへの反映・PRはこの草案の範囲外。次に実装する際はAのreload副作用と既存の合意、Bの専用環境・許可された書込範囲を親セッションで照合し、既存承認済みならその範囲で進める。
