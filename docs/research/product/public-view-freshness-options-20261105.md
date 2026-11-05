# 開いた公開画面の鮮度対策の比較案（未採用）

2026-11-05。調査対象は HEAD `1a8fa04699b0472b43ba930138055c5c3bde0b95`、文書作業branchは `test/e2e-food-states-20261105`。製品挙動を変更しない比較・技術検証案です。TTL、表示方針、通知文言、オフライン時の扱い、最大許容遅延は決定していません。本稿の追加は機能採用・実装・本番反映を意味しません。

現時点の提案は、**復帰時再検証を優先して比較・技術検証し、表示方針等の製品判断後に実装案を確定する**ことです。明示的な再読み込みを比較基準に置き、経過表示や定期取得との組合せを評価します。以下の試験候補は未実行です。

現行仕様の正本は[共通ルール](../../guide/rules.md#publication)、取得処理は[内部処理](../../guide/architecture.md#public)、入口と検証層は[変更対応表](../../guide/change-map.md#cross-cutting)です。研究資料の時点・状態は[研究索引](../README.md)に従って区別します。

## 現行コードで確認した境界

| 確認した事実 | 根拠（対象HEADの行番号） |
| --- | --- |
| 食品情報を載せる公開3ページは `force-dynamic`。公開ページの初期取得はServer ComponentからDBを読む | [PublicShopListPage.tsx:8](../../../features/public/shops/server/PublicShopListPage.tsx#L8)、[PublicShopDetailPage.tsx:34](../../../features/public/shops/server/PublicShopDetailPage.tsx#L34)、[PublicMenuDetailPage.tsx:24](../../../features/public/shops/server/PublicMenuDetailPage.tsx#L24) |
| 食品・状態・マスタ・補足を `RepeatableRead` transactionで読む。取得完了不能の一部を既存の取得不能案内へ渡す | [public-read-snapshot.ts:7](../../../features/public/shops/server/public-read-snapshot.ts#L7)、[lib/public-db.ts:15](../../../lib/public-db.ts#L15) |
| 公開APIは稼働・公開フラグと、食品版・公開条件を検査する。対象なし・条件不成立は404、取得中の例外は500 | [publicMenuRoute.ts:48](../../../features/public/shops/server/publicMenuRoute.ts#L48)、同ファイル:110、170 |
| 公開詳細は取得不能を対象なしと分ける。正常に取得した対象なし・公開条件不成立にはnot-foundを使う | [PublicMenuDetailPage.tsx:102](../../../features/public/shops/server/PublicMenuDetailPage.tsx#L102)、同ファイル:115、123。ストリーミング後はHTTP 200の場合もあるため、状態コードだけで食品の表示継続を判断しない。[共通ルール:74](../../guide/rules.md#publication) |
| STOPは古い編集フォームや新しい確認の完了に依存せず、所有店舗の対象を `isPublished:false` に保存後、関連pathの再検証を要求する。後処理失敗は `publicRefreshPending` として区別する | [adminMenuRoute.ts:663](../../../features/admin/menus/server/adminMenuRoute.ts#L663)。管理画面側の結果不明の扱いは [MenuEditClient.tsx:515](../../../features/admin/menus/components/MenuEditClient.tsx#L515)、[MenuListPageClient.tsx:158](../../../features/admin/menus/components/MenuListPageClient.tsx#L158) |
| 無効化は `revalidatePath`。tag invalidationや他の閲覧者への配送処理はない | [lib/public-cache.ts:1](../../../lib/public-cache.ts#L1)。既に開いた画面・戻る・オフラインへの自動配送なしは[内部処理:62](../../guide/architecture.md#public)にも明記 |
| 公開側のfocus購読は個人設定のlocalStorage再読込であり、食品情報の再取得ではない。食品取得用のpageshow・visibilitychange購読もない | [lib/public-allergen-preferences.ts:51](../../../lib/public-allergen-preferences.ts#L51)、同ファイル:83。公開側・共通libの呼出元検索と照合 |
| 公開画面の「更新」はメニューの `updatedAt`。食品確認日時や取得成功日時ではない。店舗内補足は別メニューの公開登録から変化する | [PublicMenuDetailPage.tsx:181](../../../features/public/shops/server/PublicMenuDetailPage.tsx#L181)、[PublicMenuDetailBodyClient.tsx:176](../../../features/public/shops/components/PublicMenuDetailBodyClient.tsx#L176)、[storeAllergenSupplement.ts:4](../../../features/public/shops/server/storeAllergenSupplement.ts#L4)、[共通ルール:70](../../guide/rules.md#publication) |
| 公開画面の利用者設定には保存済み値とは別の編集案・競合状態がある。検索入力もclient stateを持つ | [UserAllergenPreferenceClient.tsx:34](../../../features/public/shops/components/UserAllergenPreferenceClient.tsx#L34)、[PublicShopListClient.tsx:106](../../../features/public/shops/components/PublicShopListClient.tsx#L106)。管理フォームの未保存保護は [useUnsavedMenuChanges.ts:7](../../../features/admin/menus/components/useUnsavedMenuChanges.ts#L7) |
| 既存の伝播確認は新規要求で停止等を反映する試験定義であり、開いた画面への自動反映をassertしない | [check-publication-propagation.ts:78](../../../scripts/check-publication-propagation.ts#L78)、同ファイル:105 |

以上は静的な実装照合です。本稿の鮮度機能候補の実装・復帰試験・実サービス接続・配備設定の調査は行っていません。別の[食品訂正E2E追補](../../verification/e2e-food-states-20261105.md)は実DBを使った新規取得と保持中DOMの一時点の観察を含みますが、現在の本番での反映時間、接続pool、負荷、全利用者への到達を確認した証拠にはしません。

[過去のcache/freshness研究](../engineering/cache-freshness.md)にある `force-static` / `revalidate=60`、snapshotなしの説明は研究時点の記録です。後続の現行実装と区別し、60秒を現在の保証や新しい期限の根拠にしません。

## 比較する問題と到達段階

食品そのものの変更から店舗の登録までの遅れ、登録済みDBから新しい要求への配信、配信済み画面に残る表示は別の問題です。画面の再取得では、未申告の材料・工程変更や登録内容の正しさを保証できません。

画面更新でも次を分けます。

1. 対象URLについて取得を開始した。
2. サーバーで一貫したDB snapshotを取得した。
3. その結果をクライアントが受領した。
4. 現在の対象URL・画面世代に対応する結果をDOMへ適用した。
5. 利用者が変更に気付き、意味を理解した。

取得開始・HTTP成功・snapshot受領・DOM適用は同じ事実ではありません。snapshot取得後に訂正が確定する場合もあるため、受領時刻や表示適用時刻を「その瞬間のDB最新」や「食品安全確認済み」に読み替えません。表示上の取得状態と `AllergenStatus.UNKNOWN` は別軸に保ちます。

## 選択肢の比較

| 案 | 期待できること | 残る範囲・通信失敗時 | 負荷・遅延・操作への影響 |
| --- | --- | --- | --- |
| 明示的な再読み込み（比較基準） | 利用者が更新の契機を選べる。通常の新規要求で現行の公開条件を検査する | 操作しなければ古い表示は残る。通信失敗時の表示は経路依存。全閲覧者への到達は保証しない | 自動要求を増やさない。ページ全体のreloadは未適用設定や検索入力・スクロール・フォーカスへの影響を確認する必要がある。画面内の更新操作を追加する場合の方式・文言も未決 |
| 復帰時再検証 | タブ復帰等で新snapshotを取得する機会を増やす。明示操作の負担を減らせる候補 | 復帰イベントのない継続閲覧、通信断、履歴復元の一部は残る。取得中・失敗中に旧内容をどう扱うかは製品判断 | 現行取得はDB transactionを伴う。重複イベントの集約、同時取得の制御、古い応答の排除が必要。自動更新でカードやフォーカス対象が消える場合がある |
| 取得時点・経過・未確認の表示 | 再取得していない事実や失敗状態を伝える候補。食品情報の正しさと混同しない説明を比較できる | 表示内容の更新・STOP到達自体は実現しない。警告が読み飛ばされる可能性も残る | 表示だけならDB要求を増やさない。時刻更新の頻度、読み上げ、視認性を確認する。「更新日時」を取得日時へ流用しない |
| 期限切れ時の表示制限 | 一定条件を過ぎた旧表示への依存を制限する候補 | 期限内の正確性は保証しない。期限・遮蔽範囲・解除条件に根拠が必要。通信失敗で情報へアクセスできなくなる場合がある | 閲覧中の内容消失や操作中断を伴い得る。食品本体・要約・補足・リンクのどこまで制限するかは未決 |
| 定期取得（poll） | visibleのまま読み続ける場合にも再取得の機会を作れる | 取得間の変更、ネットワーク不通、ブラウザ休止は残る。周期どおりの実行・表示適用は保証しない | 閲覧数に応じた要求、SQL、接続保持、通信量が増える。失敗時の再試行集中やバッテリー影響も測る |

復帰時再検証と取得状態の表示は併用候補です。期限による非表示や定期取得まで同時に採用すると、製品判断と負荷評価の範囲が広がります。本稿はそれらの採用順や表示仕様を確定しません。

## 復帰時再検証を技術検証する場合

### 契機と未保証範囲

| 契機・状況 | 検証する候補と限界 |
| --- | --- |
| windowのfocus | 復帰の候補だが、focusは可視性そのものではない。visibilitychangeと重複する場合がある。[MDN Page Visibility API](https://github.com/mdn/content/blob/main/files/en-us/web/api/page_visibility_api/index.md) |
| visibilityがvisibleへ変化 | タブ復帰等の候補。visibleのまま継続閲覧する間の変更を検知するものではない。同上 |
| pageshow / `event.persisted` | 初期ロードでも発火し、BFCache（戻る・進む用に画面とJavaScript状態を保持する仕組み）からの復元も扱う。`persisted`と初期取得の重複を検証する。復元直後の旧画面表示を防げるとは未確認。[MDN pageshow](https://github.com/mdn/content/blob/main/files/en-us/web/api/window/pageshow_event/index.md)、[persisted](https://github.com/mdn/content/blob/main/files/en-us/web/api/pagetransitionevent/persisted/index.md) |
| SPAの戻る・進む | 同一document内の履歴移動をpageshowだけで網羅した扱いにしない。現在のURL・ルート遷移との連携を別に検証する。独自popstate処理とNext Routerの順序・競合も未確認。[MDN popstate](https://github.com/mdn/content/blob/main/files/en-us/web/api/window/popstate_event/index.md)、[Next.jsの履歴時キャッシュ説明](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/upgrading/version-15.mdx) |
| JS未実行・無効・初期化前、プロセス停止、オフライン | clientのhookが動く保証はない。印刷・スクリーンショットも回収できない。初期HTMLが表示できることと、その後に訂正が届くことを分ける |

### 成功・正常な対象なし・取得失敗

Next.jsの `router.refresh()` は新しい要求でServer Componentを再取得し、影響を受けないclient stateやscrollを保持しながら結果をマージする説明があります。ただし戻り値は `void` です。呼出直後、transition終了、単なるタイマー経過を取得成功の証拠にしません。[公式useRouter資料](https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/04-functions/use-router.mdx)

技術検証では、対象URL、画面の世代、要求の世代、受領結果、表示適用の対応を観察できる必要があります。server由来の受領識別情報などは候補ですが、具体的な型・API追加・時刻の生成場所・公開範囲は未決です。同じ食品内容を再取得しても識別でき、別メニュー由来の補足変更も含む必要があります。`updatedAt`が不変であることだけでは再取得成功を否定できず、変わったことだけでも今回の要求の成功を証明できません。

正常に取得した非公開・削除・公開条件不成立は、通信失敗とは区別します。将来の更新方式でも、**現在のURL・世代に対応する正常な結果が対象なしを示したら、その食品を表示対象から除く**という現行公開条件を維持する必要があります。旧食品を「最後に取得できた内容」として復活させる成功処理にはしません。正常な0件と取得不能も分けます。

通信失敗、処理のタイムアウト、正常な結果を適用できなかった場合は成功時刻を更新しません。旧内容の保持・警告・遮蔽の選択は下記の製品判断です。`navigator.onLine`やonlineイベントは接続のヒントであり、対象サービスへの到達・DB取得成功の証明にはしません。[MDN navigator.onLine](https://github.com/mdn/content/blob/main/files/en-us/web/api/navigator/online/index.md)

### 重複・競合・古い応答

一要求ずつ処理するsingleflight（同時進行を一つに絞る方式）やイベント集約を使う場合も、次を定義してから試験します。

- 取得中に再び非表示→表示へ戻った場合、その契機を捨てるか、終了後に再取得するか、実行中の取得を置換するか。開始済みsnapshotが古い可能性があるため、単に「取得中なので無視」だけで復帰後確認済みとしない。
- 短時間のfocus・visibility・pageshowをどの範囲で同じ契機と数えるか。集約待ち時間や最小間隔の数値は、安全上の期限とは別に根拠と測定を用意する。
- URL移動後の旧要求、同じURLへ戻った別世代、タイムアウト後の後着、再試行より前の後着が、新しい食品表示や取得状態を上書きしない条件。
- cancellationの有無と、破棄された要求がサーバー側で実行を続ける場合の負荷。clientで無視したことをDB処理中止と同一視しない。
- 正常な対象なしが適用された後、先行する旧食品応答が届いても復活させない条件。

これらは候補実装の正しさを比較する条件です。現在その仕組みが実装・検証済みという意味ではありません。

## 製品判断として残す項目

| 判断項目 | 決める必要がある内容・現在の状態 |
| --- | --- |
| 対象と用途 | 店舗一覧・店舗詳細・メニュー詳細のどこに適用するか。検索結果、要約、店舗内補足、公開ヘッダー、API利用者まで含むか。管理フォームへ拡張するか。未決 |
| 取得中・失敗時の旧内容 | そのまま保持、明示警告付き保持、一部制限、全面遮蔽の比較。どの情報と操作を対象にし、再試行・復旧後にどう戻すか。未決 |
| 期限の意味 | 「最後の取得からの経過」「再検証を要する時点」「表示を制限する時点」「店舗の食品確認期限」を区別する。食品の安全期限を作らない。TTLや最大許容遅延の根拠は未確認 |
| 表示文言と通知 | 取得・適用・未確認を利用者へどう説明するか。食品安全や常時最新の保証に見えないか。安全に関わる文言は既存の承認規則に従う。確定文案なし |
| オフライン・復旧 | 接続ヒントと実失敗を分け、旧情報へのアクセスをどこまで認めるか。復旧時の自動再試行・回数・待機間隔を含め未決 |
| 編集中の入力・操作 | 未適用の個人設定、検索入力、表示中の選択肢、スクロールの保持。正常な停止結果で画面が消える場合の説明・フォーカス移動も未決 |
| アクセシビリティ | 状態を文字でも伝える。自動更新時の読み上げ頻度、警告の強さ、フォーカス対象消失、キーボード再試行を比較する。毎秒の経過を逐次読み上げる方針は採用していない |
| 運用・性能 | 許容HTTP遅延、DB待機・接続保持、要求集中、通信量、計測対象環境・閲覧数。実測値・合格基準とも未決 |

取得失敗をアレルゲンの `UNKNOWN` や正常なFREEへ変換せず、取得状態と登録状態を分けることは比較の前提です。食品本体の保持・警告・遮蔽の仕様は、この前提だけから自動的に選びません。

## 負荷と遅延の測り方の候補

定期取得について、`N`を同時に取得対象となるタブ数、`I`を秒単位の周期とした `N / I` は、一タブ一HTTP要求・理想的な均等実行を仮定した追加HTTP要求/秒の目安です。SQL本数、transaction数、poolの占有時間、DB接続数そのものを表す式ではありません。複数タブ、初回取得との重複、復帰集中、再試行、cancellationも別に測ります。

現行の公開取得は入れ子の取得や補足を含み、複数SQLが同一transaction内で実行され得ます。HTTP要求数と合わせて、SQL本数、pool待機、transaction・接続保持時間、応答量、HTTP遅延の分布、受領からDOM適用までの遅延を測る案です。[内部処理の取得・負荷の限界](../../guide/architecture.md#public)と[過去の読取削減の適用限界](../../verification/public-shop-read-performance-20261028.md)を参照し、過去のSELECT本数やlocal値を現在のProduction値へ流用しません。

ブラウザはbackgroundのtimerを抑制するため、poll周期を訂正到達の上限にしません。復帰時取得にもネットワーク・DB・DOM適用の遅延があります。[MDNのbackground timer制御説明](https://github.com/mdn/content/blob/main/files/en-us/web/api/page_visibility_api/index.md)

## 今後の検証候補（全項目未実行）

表示方針・対象範囲を決定した後、その仕様に対応する最低限の試験を選びます。既存の新規要求の試験を維持し、復帰・表示適用の試験を追加する案です。実行環境・架空データ・接続先・副作用の許可は実施時に別確認します。

| 条件 | 残す証拠・比較する点 |
| --- | --- |
| 公開中の画面を開き、別セッションでSTOP・削除・食品変更により非公開化し、復帰する | 更新確定、要求開始、対象URL、受領・DOM適用の順序。正常結果で旧食品が除かれ、古い後着で復活しないか |
| 要求開始後に訂正が確定する | 一貫した旧snapshotが返る可能性と、次の復帰・再試行の扱い。受領時刻だけで訂正後確認済みとしないか |
| 価格のみの変更、同じ内容の再取得、別メニュー停止による補足変更 | 食品更新日時や本体だけの版に依存せず、新しい結果を表示へ適用できるか |
| focus・visibility・pageshowの連続、取得中の再復帰 | 要求数、集約・再取得の選択、終了条件、取りこぼし、古い世代の上書き |
| URL移動、同一URLへ再訪、SPAの戻る・進む、BFCache復元 | 世代とURLの対応、復元直後の旧表示、表示適用、検索条件・入力・scrollの保持。ブラウザ別に範囲を明記 |
| API/HTMLエラー、DB取得不能、通信断、遅延、タイムアウト、復旧 | 正常な404/0件との区別、成功状態を誤表示しないか、採用した旧表示方針・手動再試行との整合 |
| visibleのまま継続閲覧、JS未実行・初期化前、background休止 | 対応しない条件を明示できるか。対応範囲に含める場合の追加策と負荷 |
| 個人設定の未適用編集、別タブ競合、検索入力中の更新 | 編集案や競合検出の保持、意図しないreloadや入力消失、対象消失後の説明 |
| キーボード・読み上げ・拡大表示で更新/失敗/対象消失 | フォーカスの所在、通知の重複、再試行可能性、登録状態と取得状態の区別 |
| 想定閲覧数・復帰集中・失敗時再試行 | HTTP要求、SQL、pool待機、接続保持、遅延分布、通信量。製品判断で定めた基準との比較 |

この文書は静的調査と独立批評を反映した未採用案です。本稿に記した機能の実装・表の試験・実サービスの操作は行っておらず、表の項目をPASS扱いにしません。

## 一次資料と適用限界

2026-11-05にContext7でNext.jsとMDNの公式資料を確認しました。Next.jsの対象依存は [package.json:34](../../../package.json#L34) の16.4.1です。取得できたNext.js資料はcanaryの公式文書であり、対象版での動作試験の代替にはしません。MDNの資料もブラウザ別・OS別の全動作を保証するものではありません。

- [Next.js useRouter / router.refresh](https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/04-functions/use-router.mdx)：新しい要求、RSCのマージ、影響を受けないclient state・scroll、戻り値voidの説明。
- [Next.js revalidatePath](https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/04-functions/revalidatePath.mdx)：Route Handlerからの無効化は次回訪問時の再検証。現在のpath無効化だけで開いた他画面へ配送できるという根拠にはしない。
- [Next.js version 15 guide](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/upgrading/version-15.mdx)：戻る・進むでpage segmentを再利用する説明。16.4.1の全履歴経路に対する実測結果ではない。
- [MDN Page Visibility API](https://github.com/mdn/content/blob/main/files/en-us/web/api/page_visibility_api/index.md)：focusと可視性の違い、backgroundのtimer抑制。
- [MDN pageshow](https://github.com/mdn/content/blob/main/files/en-us/web/api/window/pageshow_event/index.md)、[PageTransitionEvent.persisted](https://github.com/mdn/content/blob/main/files/en-us/web/api/pagetransitionevent/persisted/index.md)、[popstate](https://github.com/mdn/content/blob/main/files/en-us/web/api/window/popstate_event/index.md)：documentの復元・履歴契機の区別。
- [MDN navigator.onLine](https://github.com/mdn/content/blob/main/files/en-us/web/api/navigator/online/index.md)：接続ヒントの不確実性。対象サービスへ到達できる証明にしない。
