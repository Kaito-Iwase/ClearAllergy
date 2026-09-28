# Design & Implementation Decisions Interview Q&A

## 使い方

就職活動の面接で「何を作ったか」より「なぜそう判断したか」を自分の言葉で話すための練習帳。まず20秒回答を声に出し、突っ込まれたら60秒回答と追加質問へ進む。**「本人が単独で決めた」「実環境で安全を証明した」とは、この資料だけを根拠に言わない。** 最終的な本人の動機は本人が確認する。

調査基準は2026-09-26の `improve/prototype-usability-ci`、HEAD `64163cc` と、その時点の未コミット変更を含む作業ツリー。README、`docs/guide/`、`AGENTS.md`、依存・lock、スキーマとmigration、画面・API・認証・テスト・CI・環境変数例、ローカルGit履歴とblameを確認した。`docs/audits/` のローカル監査も読んだがGit管理外なので、持ち運べる根拠にはしない。GitHub上のIssue/PR本文は取得できず、PR番号・表題はローカルmerge commitで分かる範囲に限る。ローカル履歴ではPR #26/#27がアレルゲンの公開条件、#29がCI、#34が可読性、#36がプロトタイプ改善に関連するが、**PR本文の設計議論を読めたという意味ではない**。ここでのPASSは資料とコードの照合を意味し、画面や本番サービスの動作確認ではない。

- **CONFIRMED**：README・文書・コメント・commit messageに理由が明記されている。ただし後年の説明を「初期選定時に比較した証拠」と読み替えない。
- **INFERRED**：構造からの解釈。回答に必ず「推測ですが」を入れる。
- **UNKNOWN**：採用時の比較理由や本人の動機を特定できない。現在あり得る改善案を歴史的事実として話さない。
- 「他の選択肢」は**今から比較する候補**で、当時実際に比較・却下した記録がない限り、その旨を明記する。
- 重要度 **S** は必ず、**A** は優先して、**B** は余裕があれば練習する。

### 最初に直すべき説明

「含む／含まない／要確認の**3値**」という説明は現行コードに合わない。保存状態は `CONTAINS`、`FREE`、`MAY_CONTAIN`、`UNKNOWN` の**4状態**。`MAY_CONTAIN` は「含む可能性あり・要確認」という**入力済みの不確実な判断**で公開可能。`UNKNOWN` は未設定・欠損の扱いで公開不可。`null` は `MenuItemAllergen.status` の合法値ではなく、**リンク行の欠損**や他の任意項目の `null` と混同しない。`FREE` は「原材料に含まない登録」であり、交差接触、提供時の実物、摂取可否の保証ではない。現在は架空データを使う実運用前プロトタイプである（`README.md`、`docs/guide/rules.md`、`prisma/schema.prisma`、`lib/allergens.ts`）。

---

## Q1. [S] なぜ利用者と店舗担当者の双方を対象にしたのですか？

### 20秒回答

自分の食物アレルギー経験から、外食前に情報を探す負担を感じました。店舗が更新し、利用者が事前に確認する流れを試すため、両方の画面を用意しました。需要が検証済みとは言いません。

### 60秒回答

課題は、利用者が来店前に情報を探しにくく、店舗も紙や口頭だけで更新を伝え続けにくいことです。そこで店舗入力と公開閲覧を分けました。更新元を明確にでき、利用者はログインせず閲覧できます。一方、店舗が正しく・継続して入力する負担は残り、今は架空データで価値を検証する段階です。

### 詳細

READMEの制作背景は作者の経験を明記する。`/shops` と `/admin` は異なる操作・権限を持ち、匿名管理デモもある。利用者調査で需要を確認した記録ではない。

### 他の選択肢

- 店舗を介さず利用者の投稿だけにする。
- 店舗内だけで使う管理ツールにする。
- 店舗情報へのリンク集に留める。

### なぜ他の選択肢ではなかったのか

READMEに「店舗側が更新し、利用者側が事前に確認」と明記される。上の各候補を当時比較・却下した記録は**UNKNOWN**。面接では現在の要件との適合として比較する。

### トレードオフ

二面のUIと権限管理が必要になり、店舗入力の継続性・正確性に依存する。

### 今ならどうする？

**一部変更する。** 二面構成は維持し、店舗担当者と利用者に操作テストを行い、入力負担と誤解を先に測る。

### 根拠

- Evidence level: **CONFIRMED**（制作背景・二面構成）。候補比較の実施は**UNKNOWN**。
- `README.md`「誰が何をするアプリか」「制作背景」、`docs/guide/product.md`、`app/(public)/shops/`、`app/admin/`。
- 関連commit: `d39bd32`（ポートフォリオ向けプロトタイプ整備）。

## 追加で聞かれそうな質問

- Q: 実ユーザーの需要は証明済み？ A: いいえ。READMEも未検証と明記しています。
- Q: 医療システム？ A: いいえ。架空データで情報確認の流れを試すプロトタイプです。

---

## Q2. [S] なぜアレルゲンを3値ではなく4状態で保存するのですか？

### 20秒回答

「含む」「原材料に含まない」「含む可能性あり」と、そもそも判断が入力されていない状態を分けるためです。不確実な登録と未入力を同じにすると、公開可否や利用者への説明が曖昧になります。

### 60秒回答

二値だと不確実・未入力が「含まない」に紛れる危険があります。現行DB enumは `CONTAINS/FREE/MAY_CONTAIN/UNKNOWN` の4状態で、TypeScriptも同じ文字列unionです。`MAY_CONTAIN` は不確実さを明示した登録として注意を付けて公開でき、`UNKNOWN` は未設定なので公開できません。状態が増えた分、UI、API、DB、テストの整合を保つ手間があります。

### 詳細

`MenuItemAllergen.status` は非nullableで既定値 `UNKNOWN`。`lib/allergens.ts` の `ALLERGEN_STATUS_VALUES as const` から `AllergenStatus` 型を作る。`effectiveRisk` の `STORE_HANDLED` は表示用導出値でDBの5番目の状態ではない。

### 他の選択肢

- Booleanで「含む／含まない」だけを保存する。
- 3状態にして `MAY_CONTAIN` と未入力を統合する。
- 状態を自由文字列にする。

### なぜ他の選択肢ではなかったのか

`ec42995` の「未設定アレルゲンを分離」、README旧版の「未設定と含まないを分けないと誤解」という記録がある。3状態案を正式に比較した記録は**UNKNOWN**。

### トレードオフ

各境界で4状態を扱う必要があり、品目・状態追加時の移行や表示確認が増える。

### 今ならどうする？

**同じ設計を維持する。** 言葉の理解度を利用者で検証し、状態の説明と入力根拠の記録を改善する。

### 根拠

- Evidence level: **CONFIRMED**。
- `prisma/schema.prisma` `AllergenStatus` / `MenuItemAllergen.status`、`lib/allergens.ts` `AllergenStatus`、`docs/guide/rules.md#allergens`。
- 関連commit: `ec42995`、`222331c`。`git blame` で enumの3値が初期から、`UNKNOWN` が後から追加された経緯を確認。

## 追加で聞かれそうな質問

- Q: 「要確認」と未入力は同じ？ A: 違います。前者は `MAY_CONTAIN` という登録済みの不確実な判断、後者は `UNKNOWN` です。
- Q: DBの `NULL` と `UNKNOWN` は？ A: `status` 自体はNOT NULL相当で既定値 `UNKNOWN`。リンク行の欠損は画面と公開判定で `UNKNOWN` に補完します。

---

## Q3. [S] なぜリンク欠損や未入力を `FREE` にしないのですか？

### 20秒回答

データがないことは「原材料に含まない」という確認結果ではないからです。欠損は `UNKNOWN` として表示し、公開条件も満たさないようにしています。

### 60秒回答

メニューに品目リンクがまだない場合、何も入力されていないだけです。`createStatusBySlug` は全品目をいったん `UNKNOWN` にし、保存済みの値だけ重ねます。こうすると一覧・詳細・APIで欠損を見落としにくい利点があります。ただし古い不完全データを公開できなくなるので、入力補助と移行が必要です。

### 詳細

`MAY_CONTAIN` は情報はあるが不確実、`UNKNOWN` は情報がない。`status` に `null` は格納しない設計で、欠損とは `MenuItemAllergen` 行が存在しないこと。任意の説明・価格の `null` とも意味が異なる。

### 他の選択肢

- 欠損を `FREE` として表示する。
- 欠損行を画面から消す。
- 欠損を独立の `null` 状態として各層へ渡す。

### なぜ他の選択肢ではなかったのか

`lib/allergens.ts` のコメントとREADME旧版に、未登録を表示し誤認を防ぐ意図が明記されている。`null` 案との当時の比較は**UNKNOWN**。

### トレードオフ

全品目の状態をそろえる処理と、旧データ・マスタ更新時の補正が必要。

### 今ならどうする？

**同じ設計を維持する。** 「未入力」と「含む可能性あり」の説明を入力画面でさらに明確にする。

### 根拠

- Evidence level: **CONFIRMED**。
- `lib/allergens.ts` `createStatusBySlug`、`prisma/schema.prisma` `MenuItemAllergen`、`docs/guide/rules.md#allergens`、`tests/menu-publication.test.ts`。
- 関連commit: `ec42995`。

## 追加で聞かれそうな質問

- Q: 行がないのに全品目を表示できる？ A: マスタを基準に配列を組み、ない品目は `UNKNOWN` にします。
- Q: `FREE` は何を保証する？ A: メニューの原材料に含まないという登録だけです。

---

## Q4. [S] なぜ「含まない」を安全判定と表現しないのですか？

### 20秒回答

`FREE` は店舗が原材料について登録した値で、厨房での交差接触や実際に提供される食品までは確認できないためです。画面でも「原材料に含まない登録」と限定して伝えています。

### 60秒回答

アレルギーの判断で誤った安心は重大です。過去の表示修正では断定的な安全表現を抑え、含む・可能性あり・未確認を隠さないようにしました。公開条件を満たしても情報の真実性までは機械的に証明できません。利用者に確認材料を見せるメリットはありますが、「食べられる」と判定する機能にはできません。

### 詳細

選択品目で `CONTAINS` や `MAY_CONTAIN` 等が混ざれば安心側の要約を抑える。内部の `safe` という表示分類名が残るため、面接では「安全保証の型」と説明しない。

### 他の選択肢

- `FREE` を「安全」と大きく表示する。
- リスクの高い状態だけを表示する。
- 安全判定機能を提供しない代わりに全情報を文章だけで出す。

### なぜ他の選択肢ではなかったのか

誤認防止はAGENTS・README・表示コメント・`222331c` のcommit messageで確認できる。各UI案の比較実験記録は**UNKNOWN**。

### トレードオフ

短い「OK/NG」表示より読解負担がある。文言が長く、スマートフォンでの理解度は別途確認が必要。

### 今ならどうする？

**同じ方針を維持する。** 専門家レビューと利用者テストを経て、説明文と店への確認導線を改善する。

### 根拠

- Evidence level: **CONFIRMED**。
- `README.md`、`AGENTS.md`、`docs/guide/rules.md#allergens`、`lib/allergens.ts` `buildSelectedAllergenSummary`、`features/public/shops/components/SelectedAllergenResultCardsClient.tsx`。
- 関連commit: `222331c`、`3bc0c09`。

## 追加で聞かれそうな質問

- Q: 29品目を入力したら食べられる？ A: いいえ。登録漏れを減らす公開条件と、食べられる保証は別です。
- Q: 「安全」の文言はコードから消えた？ A: 内部分類名 `safe` は残るので、UI文言と区別します。

---

## Q5. [S] なぜ公開前に全品目の入力を求めるのですか？

### 20秒回答

未入力の品目を見落としたまま公開すると、利用者が「情報がない」を「含まない」と受け取る恐れがあるためです。名前・品目マスタ・全状態を確認してから公開します。

### 60秒回答

保存は下書きとして途中でもできますが、公開は別の条件で制限します。画面で不足を示し、管理APIで再判定し、公開側の取得でも検査し、DBトリガーでも不完全な公開を非公開へ戻します。UI直打ちや古いデータに備えた多層の対策です。入力の負担が大きく、全品目を埋めても真偽は検証できないのが限界です。

### 詳細

`MAY_CONTAIN` は入力済みなので公開可、`UNKNOWN` とリンク欠損は不可。店舗が送った品目別状態は `MenuItemAllergen` に保存し、公開側は同じリンクを読んで `createStatusBySlug` と共通の公開判定・表示関数を通す。利用者向けに `FREE` を勝手に「安全」へ変換しない。公開条件は名前・マスタ・状態であり、原材料文と注意書きの入力は必須ではない。コードのマスタ集合検査に現在固定29件の判定が残る。DBトリガーはDB上のマスタに対する欠損を扱うが、コードマスタとの集合一致までは同じ形で保証しない。実DBへのmigration適用状況は未確認。

### 他の選択肢

- 下書き・公開を分けず即時公開する。
- UIだけで必須表示する。
- 入力不足でも未確認ラベルを付けて公開する。

### なぜ他の選択肢ではなかったのか

`getMenuPublishValidationErrors` のコメントは誤認防止、API直打ちへの対処を明記。`ed8b678` と `8ed074b` は未設定の公開除外・自動非公開を履歴として示す。完全な候補比較は**UNKNOWN**。

### トレードオフ

29品目を毎メニューで確認する負荷、品目追加時の移行、アプリとDBの公開規則を同期する保守費用。

### 今ならどうする？

**一部変更する。** 公開ゲートは維持し、根拠の記録・コピー支援・変更差分の再確認を検討する。要件と利用者調査なしに条件を緩めない。

### 根拠

- Evidence level: **CONFIRMED**。
- `lib/allergens.ts` `getMenuPublishValidationErrors`、`features/admin/menus/server/adminMenusRoute.ts`、`features/public/shops/server/PublicShopListPage.tsx`、`prisma/migrations/20260622000000_auto_unpublish_incomplete_menus/migration.sql`、`docs/guide/rules.md#publication`。
- 関連commit: `ed8b678`、`8ed074b`、`222331c`。

## 追加で聞かれそうな質問

- Q: なぜDBトリガーは遅延実行？ A: リンク行を入れ替える既存のトランザクション途中を不完全扱いしないためです。
- Q: 固定29件は将来も正しい？ A: いいえ。品目変更時にはコード・DB・テスト・表示の全層を見直します。

---

## Q6. [S] なぜ店舗側が入力し、利用者投稿を正本にしないのですか？

### 20秒回答

READMEに、店舗が情報を更新して利用者が事前確認する構想が明記されています。原材料を扱う店舗を更新元にする設計ですが、店舗入力だけで正確性が保証されるとは考えていません。

### 60秒回答

利用者はメニューの変更を継続的に把握しづらく、店舗には更新を伝える役割があります。そこで店舗担当者の管理画面から入力し、公開画面へ反映する流れを作りました。情報源と更新責任を示しやすい一方、誤入力・更新漏れ・現場での変更までは防げません。利用者投稿との比較検証や店舗運用の実証はまだありません。

### 詳細

入力はClerk認証と店舗所有権を通る。`updatedAt` はあるが、食品情報の確認者・確認日時・証跡の専用構造ではない。

### 他の選択肢

- 利用者の投稿を集約する。
- 運営者が全店舗分を代行入力する。
- 店舗サイトの文章を自動取得する。

### なぜ他の選択肢ではなかったのか

店舗入力という方針は**CONFIRMED**。候補ごとの採否理由はリポジトリで**UNKNOWN**。自動取得を「技術的に不可能だった」と言わない。

### トレードオフ

店舗の参加・更新負担が前提になり、入力内容の審査や鮮度保証はない。

### 今ならどうする？

**一部変更する。** 店舗入力を維持し、入力根拠、確認日、変更履歴、更新忘れの扱いを人の運用とともに設計する。

### 根拠

- Evidence level: **CONFIRMED**（方針）／**UNKNOWN**（他方式を却下した経緯）。
- `README.md`「制作背景」、`docs/guide/product.md#admin`、`features/admin/menus/components/MenuEditClient.tsx`、`prisma/schema.prisma` `MenuItem.updatedAt`。

## 追加で聞かれそうな質問

- Q: 店舗の申告は監査済み？ A: いいえ。管理操作の `AuditLog` はありますが、食品内容の確認証跡ではありません。
- Q: 最新情報と保証できる？ A: できません。更新日時と正確性は別です。

---

## Q7. [A] なぜ同店舗の別メニューの「含む」を補足するのですか？

### 20秒回答

あるメニューが `FREE` でも、同じ店舗の別の公開登録に「含む」があれば、利用者に補足として見せます。`FREE` 自体は書き換えず、店舗単位の追加情報として扱います。

### 60秒回答

原材料に含まない登録だけを見て過度に安心しないよう、同店舗の別メニューの登録を補足します。表示用の `effectiveRisk=STORE_HANDLED` を導出し、DBのメニュー別 `status` は保ちます。情報が増える利点はありますが、厨房の交差接触を調べた結果ではなく、別メニューの登録が不正確なら補足も不正確です。

### 詳細

補足の根拠は**公開可能な**別メニューに限定する。`CONTAINS/MAY_CONTAIN/UNKNOWN` の元状態はそのままで、`FREE` に対して補足する。

### 他の選択肢

- メニューの状態だけ表示する。
- 店舗単位の状態をDBに別途保存する。
- `FREE` を `MAY_CONTAIN` に書き換える。

### なぜ他の選択肢ではなかったのか

現行文書には登録状態と補足を分ける意図が明記される。各案の当時の比較は**UNKNOWN**。

### トレードオフ

他メニューを参照する取得・キャッシュ無効化が必要で、補足が厨房実態の証明と誤解される余地がある。

### 今ならどうする？

**一部変更する。** 補足は維持し、ラベルの理解を利用者テストで確かめる。厨房の事実と読み違えられるなら表示方法を改める。

### 根拠

- Evidence level: **CONFIRMED**（現行の分離意図）。
- `docs/guide/rules.md#allergens`、`lib/allergens.ts` `getAllergenEffectiveRisk` / `getStoreContainsAllergenSlugs`、`features/public/shops/server/storeAllergenSupplement.ts`、`tests/allergen-display.test.ts`。

## 追加で聞かれそうな質問

- Q: `STORE_HANDLED` はDB enum？ A: いいえ。表示時に導出する値です。
- Q: 交差接触を確認した印？ A: いいえ。同店舗の別の公開登録に「含む」情報がある印です。

---

## Q8. [A] なぜ利用者の品目設定をブラウザに保存するのですか？

### 20秒回答

推測ですが、ログインなしで閲覧できる導線に合わせ、個人の表示設定をブラウザの `localStorage` に保存したと考えられます。設定は強調・除外の見せ方であり、メニューの登録状態そのものは変えません。

### 60秒回答

利用者にアカウント作成を求めず、確認対象を次回も使えるようにしました。保存済み設定と編集中の案を分け、適用時だけ保存します。別タブ変更や旧形式・不正データも正規化します。サーバーに個人設定を持たない利点の反面、別端末へ同期せず、ブラウザ保存が使えない場合は設定を復元できません。

### 詳細

強調と除外の両方が確認対象。`includeMayContain` は除外検索の挙動で、`MAY_CONTAIN` の登録状態や詳細の注意分類を変えない。

### 他の選択肢

- Clerkの利用者アカウントとDBに保存する。
- URLクエリだけに持つ。
- 毎回選択し、永続化しない。

### なぜ他の選択肢ではなかったのか

匿名閲覧と端末保存は現行文書で**CONFIRMED**。保存方式の初回採用時の比較記録は**UNKNOWN**。**推測ですが**、アカウント不要の導線と相性が良いため端末保存を選んだと考えられる。

### トレードオフ

端末間同期なし、ブラウザ制限や消去で喪失、選択UIの意味が初見で分かりにくい。

### 今ならどうする？

**一部変更する。** 匿名設定を維持し、初回説明と保存失敗時の案内を検証する。同期は需要が確認できてから検討する。

### 根拠

- Evidence level: **INFERRED**（方式を選んだ理由）／**CONFIRMED**（匿名・端末保存の仕様）。
- `docs/guide/product.md#preferences`、`lib/public-allergen-preferences.ts` `normalizeUserAllergenPreferences`、`features/public/shops/components/UserAllergenPreferenceClient.tsx`。
- 関連commit: `58cd72a`（設定改善）。

## 追加で聞かれそうな質問

- Q: 除外対象は詳細から消える？ A: 表示設定で絞っても、詳細で必要な注意情報を安全判定に変えません。
- Q: 設定はClerkへ送る？ A: 現行実装では送りません。

---

## Q9. [A] なぜ公開店舗検索は登録店だけを対象にし、位置情報拒否でも続けられるのですか？

### 20秒回答

推測ですが、公開検索でアレルゲン登録のない外部店舗を混ぜないため、登録店に限定したと考えられます。位置情報は並び替えの補助なので、拒否されても通常検索を続けられます。

### 60秒回答

外部店舗まで検索すると、店舗ページと品目別の登録内容がない候補が混ざります。そこで登録店の名前・地域・カテゴリなどで探し、現在地がある時だけ距離を使います。内容のある候補へ導けますが、掲載店が少ない段階では結果が乏しく、位置情報なしでは距離順になりません。

### 詳細

公開のPlaces APIは利用不可応答にしており、管理側のGoogle店舗候補検索とは別。キーワードは全語一致を先に、部分一致を後に並べる。これは「食べられる店」のランキングではない。

### 他の選択肢

- Google等の外部店舗を公開検索に混ぜる。
- 位置情報必須にする。
- 文字列の単純な部分一致のみで並べる。

### なぜ他の選択肢ではなかったのか

登録店限定と拒否時の継続は文書に明記。各方式を比較した当時の実験は**UNKNOWN**。**推測ですが**、公開できる品目情報との対応を守るため外部店舗を戻していない。

### トレードオフ

店舗数が少ないと発見性が低い。距離・検索順位の妥当性は実ユーザーで未検証。

### 今ならどうする？

**同じ設計を維持する。** 結果0件の案内と検索語の理解を改善し、外部検索の再導入は情報品質を定義してから判断する。

### 根拠

- Evidence level: **INFERRED**（登録店限定の意図）／**CONFIRMED**（現行仕様）。
- `docs/guide/product.md#public`、`features/public/shops/components/public-shop-search.ts`、`features/public/shops/server/placesSearchRoute.ts`、`tests/readability-helpers.test.ts`、`tests/public-places.test.ts`。

## 追加で聞かれそうな質問

- Q: 位置情報を拒否したら検索不可？ A: いいえ。距離順を使わず通常検索します。
- Q: 検索結果は安全な店舗？ A: いいえ。登録店の情報を探す機能です。

---

## Q10. [S] なぜNext.jsとReactを選んだのですか？

### 20秒回答

公開画面・管理画面・API・DBアクセスを一つのコードベースで扱いたかったため、Next.js App Routerを採用したと旧READMEに記録されています。Reactは画面の入力や状態変化を部品として扱う土台です。ただし他候補との比較記録はありません。

### 60秒回答

二種類の画面とサーバー処理を同じプロジェクトで管理する必要がありました。Next.jsではページ、Route Handler、Server Componentを同居させ、Reactで検索・フォーム・設定の操作UIを作れます。構成をまとめやすい一方、サーバーとクライアントの境界やキャッシュの理解が必要です。React単独の採用理由はREADMEに独立して書かれておらず、Next.jsのUI基盤として使っている事実以上は断定しません。

### 詳細

旧READMEの選定表は `4e96a4cd` のblameで確認。現行 `package.json` はNext.js 16.3.4、React 19系。Next.js公式資料はApp Routerがファイルベースの経路・Server Components・Route Handlersを提供すると説明するが、それだけでは当時の個人の判断は証明しない。

### 他の選択肢

- React + 別APIサーバー。
- Remixなど別のフルスタック構成。
- サーバー描画中心のテンプレート方式。

### なぜ他の選択肢ではなかったのか

一つのコードベースで整理する意図は**CONFIRMED**。他候補の実測比較・React単体の選定経緯は**UNKNOWN**。

### トレードオフ

Next.js固有のキャッシュ、ビルド、Server/Client境界に依存する。別バックエンドへ分離する際の再設計も必要。

### 今ならどうする？

**同じ設計を維持する。** 現規模では利点がある。データ量・チーム・外部クライアントが増えた時に境界を再評価する。

### 根拠

- Evidence level: **CONFIRMED**（Next.jsの記録）／**UNKNOWN**（Reactの独立した比較）。
- `docs/guide/architecture.md#技術構成と選定記録`、旧 `README.md`（`64163cc^`）、`package.json`、`app/`。
- 関連commit: `5c9f847`（初期構築）、旧README選定表のblame `4e96a4cd`。
- 技術の機能確認: [Next.js App Router公式資料](https://nextjs.org/docs/app)、[Server/Client公式資料](https://nextjs.org/docs/app/getting-started/server-and-client-components)。

## 追加で聞かれそうな質問

- Q: Reactだけでは駄目？ A: 不可能ではありません。API・描画・経路を別途組み合わせる必要があり、現行はNext.jsにまとめています。
- Q: Next.jsだから安全？ A: いいえ。公開判定・認可・入力検証はアプリで実装しています。

---

## Q11. [A] なぜTypeScriptとTailwind CSSを使ったのですか？

### 20秒回答

旧READMEには、TypeScriptは店舗・メニュー・品目状態を型で扱って実装ミスを減らすため、Tailwindは公開・管理の表示を素早く作り、状態別の見た目を調整するためと記録されています。

### 60秒回答

アレルゲンの4状態やAPIの値を複数画面で共有するので、TypeScriptで取り違えを減らしたかったのだと思います。これは旧READMEに選定理由が残っています。Tailwindは公開・管理のUIを進めやすい反面、長いclass指定が複数箇所に散ると保守が難しい。型は実行時のJSONやDB値を検査しないので、Zod等も併用しています。

### 詳細

型の例は `AllergenStatus` と `AllergenDisplayItem`。表示色は `statusBadgeClass` や画面コンポーネントにある。スタイルは状態を色**だけ**で伝えず、文言も持つ。

### 他の選択肢

- JavaScript + 実行時検証のみ。
- CSS Modulesまたは通常のCSS。
- 大型UIコンポーネントライブラリ。

### なぜ他の選択肢ではなかったのか

型と表示調整の目的は**CONFIRMED**。上の技術を実際に比較・却下した記録は**UNKNOWN**。

### トレードオフ

型定義と実行時検証の二重保守、スタイル指定の長文化。型だけで入力の正しさや食品情報の真実性は担保できない。

### 今ならどうする？

**同じ設計を維持する。** 状態・文言・スタイルの共通化を進め、UIの理解度を実機で確かめる。

### 根拠

- Evidence level: **CONFIRMED**。
- `docs/guide/architecture.md#技術構成と選定記録`、旧 `README.md`（`64163cc^`）、`lib/allergens.ts`、`tailwind.config.ts`、`features/public/shops/components/SelectedAllergenResultCardsClient.tsx`。
- 旧README選定表のblame `4e96a4cd`。

## 追加で聞かれそうな質問

- Q: 型があるならZodは不要？ A: いいえ。HTTPやブラウザ保存値は実行時に不正値を受け得ます。
- Q: 色で区別しているだけ？ A: いいえ。状態名・注意文も表示します。

---

## Q12. [A] なぜ `app/`、`features/`、`components/`、`lib/` に分けたのですか？

### 20秒回答

`app/` をURLの入口、`features/` を機能ごとの実装、`components/` を実際の共通UI、`lib/` を横断処理にしています。推測ですが、変更箇所を機能単位で探しやすくする意図もあったと思います。

### 60秒回答

店舗閲覧、管理メニュー、認証などの機能が広がると、URLファイルへ全処理を詰め込むと変更範囲が読みにくくなります。現行は `page.tsx` や `route.ts` を入口にして、実装を機能別へ置き、共通のアレルゲン判定・認可を `lib/` に集めています。責務の見通しは良くなりますが、ファイルを追う段数が増え、共有処理と機能固有処理の線引きが必要です。

### 詳細

`(public)` と `(dashboard)` はURLに含まれない整理用グループ。`docs/guide/change-map.md` が機能から入口・実装・テストへ辿る索引。READMEとarchitectureは各ディレクトリの役割を明記する。

### 他の選択肢

- 全実装を `app/` に置く。
- 層別に全コンポーネント・API・DB処理を並べる。
- 機能ごとに完全独立パッケージ化する。

### なぜ他の選択肢ではなかったのか

現行文書に各配置の役割はある。**推測ですが**、変更範囲を機能単位で把握しやすくすることも狙いだったと読める。初回のディレクトリ比較議論は**UNKNOWN**。

### トレードオフ

入口から実体までジャンプが必要。小さな変更でも複数ファイルに触れやすい。

### 今ならどうする？

**同じ設計を維持する。** 実際に共有されないものを不用意に `components/` や `lib/` へ移さない。

### 根拠

- Evidence level: **INFERRED**（変更容易性という狙い）／**CONFIRMED**（配置の役割）。
- `README.md`、`docs/guide/architecture.md`、`docs/guide/change-map.md`、`app/`、`features/`、`components/`、`lib/`。
- 関連commit: `ffb7cdc`（可読性の改善）。

## 追加で聞かれそうな質問

- Q: `app/` が空の薄いファイルになる理由は？ A: URLの入口を固定し、機能処理の本体を `features/` に置くためです。
- Q: Repository層は？ A: 一律のRepository層はなく、機能サーバー処理からPrismaを使っています。

---

## Q13. [S] なぜ初期表示はServer Componentで直接取得し、操作UIだけClient Componentにするのですか？

### 20秒回答

初期表示はサーバーでDBと公開条件を確認し、検索やフォームなどブラウザ操作が必要な部分だけクライアントに渡しています。推測ですが、DBとブラウザAPIの責務を分けるためです。最初の画面が自分のAPIを経由する構成ではありません。

### 60秒回答

公開データの取得にはDB接続と公開判定が必要で、利用者の検索操作や `localStorage` にはブラウザが必要です。そこでサーバー側で必要な列を取得・整形し、操作部分をClient Componentにします。秘密やDB処理をブラウザから切り離せる一方、渡すデータの直列化と、Server/Clientの二種類の取得経路を管理する必要があります。

### 詳細

`PublicShopListPage` はPrismaで一覧を取得し `initialShops` を渡す。`PublicShopListClient` が検索・距離順・設定を扱う。公開メニューAPIは別入口。管理フォームも初期値はServer Componentから受け取り、保存は管理APIへ送る。

### 他の選択肢

- 初期表示もブラウザからAPI fetchする。
- ページ全体をClient Componentにする。
- HTMLだけをサーバーで生成し操作を減らす。

### なぜ他の選択肢ではなかったのか

コードと現行architectureで役割は確認できる。**推測ですが**、DBに近い初期取得と、必要な操作だけをクライアントに置くための分割です。当時の性能比較記録は**UNKNOWN**。

### トレードオフ

propsの変換、キャッシュ・再検証の理解、初期表示とAPIの公開判定を揃える責任が残る。

### 今ならどうする？

**同じ設計を維持する。** ページとAPIの公開ルールがずれないよう共通関数と回帰確認を優先する。

### 根拠

- Evidence level: **INFERRED**（分割した当初理由）／**CONFIRMED**（現行の処理順）。
- `docs/guide/architecture.md#public`、`features/public/shops/server/PublicShopListPage.tsx`、`features/public/shops/components/PublicShopListClient.tsx`、`features/admin/menus/server/AdminMenuEditPage.tsx`。
- 技術の機能確認: [Next.js Server/Client公式資料](https://nextjs.org/docs/app/getting-started/server-and-client-components)。

## 追加で聞かれそうな質問

- Q: `use client` を全ページに付けない理由は？ A: ブラウザAPI・状態・イベントが必要な範囲に限るためです。
- Q: 公開APIテストでページも保証される？ A: いいえ。初期表示は別のPrisma取得経路です。

---

## Q14. [A] なぜRoute HandlerとHonoを併用するのですか？

### 20秒回答

URLの入口はNext.jsの `route.ts`、HTTP処理の本体は機能別のHonoへ渡す形です。**Honoを選択した当時の理由はリポジトリから確認できません。**

### 60秒回答

現行コードではNext.jsの経路規約を使いながら、HonoにGET/POST等の処理とエラー処理をまとめています。`6dc7d57` はAPIをHonoへ移した記録です。**推測ですが**、HTTP処理を画面と分離し、複数メソッドを同じまとまりで扱いたかった可能性があります。ただしNext.js標準Route Handlerだけでも実装でき、追加抽象化と依存はコストです。

### 詳細

画面の初期表示は必ずHonoを通るわけではない。管理更新はJSONのPOST/PUT/DELETEなどを使い、DBやBlob、Clerkへの外部処理を `await` する。定期ジョブやキューに積む構成ではない。招待は外部APIとDBを単一トランザクションにできず補償を持つ。

### 他の選択肢

- Next.js Route Handlerのみで処理する。
- Server Actionsへフォーム更新を移す。
- 独立APIサーバーを立てる。

### なぜ他の選択肢ではなかったのか

**UNKNOWN**。移行commitは確認できるが選定比較はない。標準方式が駄目だったとは言わない。

### トレードオフ

Next.jsとHonoの二つのAPI流儀が混ざり、薄い転送ファイルと内部ルートの両方を追う必要がある。

### 今ならどうする？

**一部変更する可能性がある。** 既存契約は維持し、Honoが共通処理を十分に簡潔にしているか測ってから統一を判断する。

### 根拠

- Evidence level: **INFERRED**（整理目的）／**UNKNOWN**（Hono採用の本人理由）。
- `app/api/admin/menus/route.ts`、`features/admin/menus/server/adminMenusRoute.ts`、`docs/guide/architecture.md`、`package.json`。
- 関連commit: `6dc7d57`。技術の機能確認: [HonoのNext.js資料](https://hono.dev/docs/getting-started/nextjs)、[Next.js Route Handler資料](https://nextjs.org/docs/app/getting-started/route-handlers)。

## 追加で聞かれそうな質問

- Q: Server Actionは使っている？ A: 主要な管理保存経路はJSON管理APIです。
- Q: 非同期キューで更新？ A: いいえ。要求中にDB・外部サービスの完了を待ちます。

---

## Q15. [A] なぜフォームは下書き・公開・確認を分けたのですか？

### 20秒回答

入力途中を保存できるよう下書きを許し、利用者へ見せる公開には全品目確認を要求するためです。公開前や原材料変更時には、入力者へ見直しを促します。

### 60秒回答

29品目を一度に完成させるのは負担です。新規作成APIは空オブジェクトでも既定名の非公開下書きを作れますが、画面の新規フォームは名前を求めます。編集時は未保存変更を警告し、公開や原材料変更では確認を出します。途中保存と誤公開抑制を両立しますが、確認ダイアログは実際に確認した証跡ではなく、戻る/進むの全経路を守るものでもありません。

### 詳細

`menuInputSchema` は省略可能な項目を持つ。APIは部分更新を既存状態へ重ねる。`NewMenuForm` / `MenuEditClient` が入力状態と公開準備表示を扱い、DB保存は管理API側。

### 他の選択肢

- 完成するまで一切保存させない。
- 作成時に即公開する。
- メニューを複数画面のwizardに分ける。

### なぜ他の選択肢ではなかったのか

コードコメントと `d39bd32` のcommit messageに、下書き・公開前確認の意図がある。wizard等の比較履歴は**UNKNOWN**。

### トレードオフ

下書きが増える。画面とAPIで新規作成条件が異なり、説明とテストが必要。確認クリックだけでは食品確認の品質を担保できない。

### 今ならどうする？

**一部変更する。** 下書きと公開の分離を維持し、入力支援と確認履歴の要否を店舗の操作レビューで判断する。

### 根拠

- Evidence level: **CONFIRMED**。
- `docs/guide/product.md#menus`、`features/admin/menus/components/NewMenuForm.tsx` / `MenuEditClient.tsx` / `useUnsavedMenuChanges.ts`、`features/admin/menus/publication-review.ts`、`features/admin/menus/server/adminMenusRoute.ts`。
- 関連commit: `a05d1ec`、`d39bd32`。

## 追加で聞かれそうな質問

- Q: 空のメニューを公開できる？ A: いいえ。空オブジェクトは非公開下書きだけです。
- Q: 原材料確認ボタンは監査証跡？ A: いいえ。見直しを促すUIです。

---

## Q16. [S] なぜ画面だけでなくAPI入口で入力検証をするのですか？

### 20秒回答

画面の制約はAPI直打ちや壊れたJSONには効かないからです。APIでZodと個別の検証関数を使い、状態・品目・価格・画像URLを保存前に確かめています。

### 60秒回答

外部入力はTypeScriptの型を通らず、不正な型や未知のslug、他店舗の画像URLも送れます。そこでAPIでJSON形状と文字数をZodで、価格や品目マスタ、画像URLを専用関数で検証します。画面にも早いフィードバックを置きますが、最後の境界はサーバーです。検証箇所が複数あるため規則がずれないようテストが必要で、DBへの直接書込まで全条件を守るわけではありません。

### 詳細

`menuInputSchema.safeParse` は未知フィールドを採用しない。送られた `shopId` は所有権に使わず、Clerkから解決した店舗IDを使う。アレルゲンmapの値とslug集合は別々に検査する。

### 他の選択肢

- HTML入力属性だけで検証する。
- TypeScript型だけで済ませる。
- 全条件をDB制約だけで守る。

### なぜ他の選択肢ではなかったのか

`lib/allergens.ts` とAPIコメントに「API直打ち」「TypeScriptだけでは守れない」と明記。DBだけでは利用者へ項目別エラーを返しづらいが、当時の比較記録は**UNKNOWN**。

### トレードオフ

検証の重複と、アプリ外からDBへ書く経路で範囲制約が欠ける問題が残る。

### 今ならどうする？

**同じ境界を維持する。** 直接DB書込の有無と既存データを調べ、必要なCHECK制約だけを追加検討する。

### 根拠

- Evidence level: **CONFIRMED**。
- `features/admin/menus/schemas/menu-input.ts` `menuInputSchema`、`features/admin/menus/server/adminMenusRoute.ts`、`lib/allergens.ts` `validateAllergenStatusMap`、`lib/validators/admin-input.ts`、`docs/guide/rules.md#images`。
- 関連commit: `d39bd32`。

## 追加で聞かれそうな質問

- Q: 不明な品目を受ける？ A: mapの値と、DBマスタにあるslugかを両方確認して拒否します。
- Q: Zodがあれば食品データは正しい？ A: 形式は検査できますが、内容の真実性は証明できません。

---

## Q17. [A] なぜ「0件」「404」「DB障害」「入力失敗」を分けるのですか？

### 20秒回答

推測ですが、利用者が次に取る行動が違うためです。該当データなしと接続障害を同じ空画面にせず、APIでは権限・入力・競合なども区別します。

### 60秒回答

DB障害を「店舗がありません」と見せると原因を誤認します。公開ページは認識したDB接続障害だけを専用案内へ変え、他の例外は共通エラー画面へ渡します。管理APIは401/403/404/409/429等と一般的な500を使い、内部例外や秘密を返しません。利用者が再試行や入力修正を選べますが、APIのJSON形式は完全統一されておらず、外部サービスの結果不明は運用で照合が必要です。

### 詳細

`readPublicDataOrFallback` は認識したDB障害だけをfallbackへ変換し、可用性フラグを分離。`handleUnhandledApiError`、`app/error.tsx`、`global-error.tsx` は予期しない障害の安全な案内。管理側では `error` / `message` が混在する。

### 他の選択肢

- すべて空配列として返す。
- すべて500と技術的な例外文を返す。
- 全APIを統一エラー形式へ一度に移行する。

### なぜ他の選択肢ではなかったのか

現行文書に誤認を避ける説明がある。**推測ですが**、画面の回復行動を変えるために障害を分けたと読める。全API統一を見送った経緯は**UNKNOWN**。

### トレードオフ

分岐とテストが増え、応答形式の不統一がクライアントの共通処理を複雑にする。

### 今ならどうする？

**一部変更する。** 既存契約を壊さない範囲でエラー形式を段階的に揃え、接続障害・空結果・権限エラーをブラウザでも確認する。

### 根拠

- Evidence level: **INFERRED**（当初の判断理由）／**CONFIRMED**（現行の区別）。
- `lib/public-db.ts` `readPublicDataOrFallback`、`lib/auth/admin-api-utils.ts` `requireShopId`、`lib/observability.ts`、`app/error.tsx`、`docs/guide/rules.md#images`、`docs/guide/product.md`。

## 追加で聞かれそうな質問

- Q: DB障害は必ず503？ A: いいえ。経路によって専用表示、503、一般的な500などがあります。
- Q: 全APIのエラーは同じJSON？ A: いいえ。主に `error` と `message` を取り出しています。

---

## Q18. [S] なぜ店舗・メニュー・品目を別テーブルと中間テーブルにしたのですか？

### 20秒回答

推測ですが、同じ品目でもメニューごとに状態が違うためです。`MenuItemAllergen` に「どのメニューのどの品目か」と4状態を持たせています。

### 60秒回答

推測ですが、品目をメニューの固定列にせず、品目追加や並び順・名前を別管理したかったのだと思います。現行は `Shop → MenuItem`、`MenuItem ↔ Allergen` の関係にして、結合行に `status` を持たせます。複合主キーで同じメニュー・品目の重複を防げます。一方、公開時には全品目のリンクがそろうか別途確認が必要で、テーブル結合が増えます。

### 詳細

`MenuItemAllergen` は `(menuItemId, allergenId)` を複合主キーに持ち、双方へ外部キーで結ぶ。`Allergen.slug` は一意。店舗とメニューは一対多。画像のURLや任意説明はそれぞれのエンティティへ置く。

### 他の選択肢

- メニューに品目ごとの列を29本持つ。
- JSON列に全状態を保存する。
- 1行1品目の結合表を持つが品目マスタは置かない。

### なぜ他の選択肢ではなかったのか

旧READMEは中間表を制作中に学んだ設計として記録。**推測ですが**、品目の共通定義とメニュー別状態を分けるためです。JSON・固定列との比較実験は**UNKNOWN**。

### トレードオフ

JOINとリンクの存在確認が必要。マスタ更新時に既存メニューが不完全になるため公開判定・補正も必要。

### 今ならどうする？

**同じ設計を維持する。** ただしマスタ変更手順と、全品目確認の入力支援を整える。

### 根拠

- Evidence level: **INFERRED**（固定列等より選んだ理由）／**CONFIRMED**（中間表の役割）。
- `prisma/schema.prisma` `Shop` / `MenuItem` / `Allergen` / `MenuItemAllergen`、`docs/guide/architecture.md#dbのつながり`、旧 `README.md`（`64163cc^`）。
- 関連commit: `5c9f847`（初期スキーマ）。Prisma v6の関係表現は[公式資料](https://www.prisma.io/docs/orm/v6/prisma-schema/data-model/relations)で確認。

## 追加で聞かれそうな質問

- Q: `status` はAllergen表に置けない？ A: 同じ品目でもメニューごとに登録状態が違うため、結合行に置きます。
- Q: 重複は何で防ぐ？ A: `@@id([menuItemId, allergenId])` です。

---

## Q19. [A] なぜDB制約とアプリ側検証を両方使い、任意項目をnullableにしたのですか？

### 20秒回答

一意性や参照整合性、公開データの一部はDBでも守り、利用者に説明したい入力条件はAPIで検査しています。価格や説明など未登録を許す項目はnullableです。ただしnullableの各採用理由までは履歴に残っていません。

### 60秒回答

同じメニュー・品目の重複や招待の競合は、アプリで先に確認しても並行更新で抜け得ます。そのため複合主キー、所有者やslugの一意性、pending招待の部分一意インデックス、公開整合の遅延トリガーを使います。一方、文字数や価格・画像位置などは主にAPIで検証し、分かるエラーを返します。任意項目の `null` は未登録を表せますが、DB直接書込に対するCHECK制約は不足しています。

### 詳細

`MenuItem.name`、`Shop.name`、リンクの `status` 等は必須。`MenuItem.priceYen`、`ingredients`、`precaution` は任意。`User.passwordHash` のnullableはClerk移行互換とコメントに明記される。`Shop.userId` もnullableだが、その個別理由はコメントからは確定できない。`AdminInvite` のpending一意はPrisma schemaだけでなくSQL migrationを見る必要がある。

### 他の選択肢

- すべてAPIだけで検証する。
- すべての範囲条件をDBのCHECKへ移す。
- 任意項目にもダミー文字列や0を必ず保存する。

### なぜ他の選択肢ではなかったのか

Clerk移行互換と公開トリガーの理由はコメント・migrationにある。**推測ですが**、説明・価格などの `null` は「入力なし」と値ありを区別するため。各nullableの個別判断記録は**UNKNOWN**。

### トレードオフ

アプリを通さない更新では一部の値域不正を許し得る。DB固有SQLは移植と変更が難しい。

### 今ならどうする？

**一部変更する。** 現在のデータと直接書込経路を調べ、重要な値域だけCHECK化を検討する。既存データ確認なしに大量追加しない。

### 根拠

- Evidence level: **INFERRED**（一般のnullable意図）／**CONFIRMED**（移行互換・制約の目的）。
- `prisma/schema.prisma`、`prisma/migrations/20260420000000_add_admin_invites/migration.sql`、`prisma/migrations/20260622000000_auto_unpublish_incomplete_menus/migration.sql`、`docs/guide/verification.md#issues`、`scripts/database-regression.ts`。
- 関連commit: `e53dffc`、`8ed074b`。

## 追加で聞かれそうな質問

- Q: なぜpending招待にDBの一意制約？ A: 同時要求で同じメール・店舗のpendingが重複するのを防ぐためです。
- Q: `null` と0は同じ？ A: 価格や予算では未登録と0円は意味が違います。

---

## Q20. [S] なぜPostgreSQL / Neonを選んだのですか？

### 20秒回答

旧READMEには、店舗・メニュー・品目・招待・監査の関連データを扱いやすいことがPostgreSQL / Neonの選定理由として記録されています。ただし**Neonを他のPostgreSQLサービスより選んだ固有の理由は不明**です。

### 60秒回答

このアプリには外部キー、一意制約、中間表、トランザクション、遅延トリガーを使う関係データがあります。PostgreSQLはその実装に合います。Neonはホスティング候補として旧READMEと `.env.example` に記録され、通常接続と直接接続のURLを分けています。ただしNeonの料金・運用・他サービス比較をした証拠はありません。特定ベンダーを選んだ経緯は本人に確認します。

### 詳細

`schema.prisma` は `provider = "postgresql"`、`DATABASE_URL` と `DIRECT_URL` を参照。ローカル・CIはPostgreSQLで検証する。本番が現にNeonへ接続しているかはコードだけでは確定しない。

### 他の選択肢

- 他社のマネージドPostgreSQL。
- 自前運用のPostgreSQL。
- SQLiteまたはドキュメントDB。

### なぜ他の選択肢ではなかったのか

**CONFIRMED**なのは関係データとPostgreSQLの適合を理由とした旧READMEの記録まで。Neon固有の比較結果は**UNKNOWN**。自前運用等が「駄目」だったとは言わない。

### トレードオフ

DB運用・接続・migration適用・復元訓練が必要。マネージドサービスにはベンダー設定や費用の依存がある。

### 今ならどうする？

**同じDB方式を維持する。** Neon自体の継続は、現接続先・料金・復元手段・障害対応を確認して判断する。

### 根拠

- Evidence level: **CONFIRMED**（旧READMEの関係データ理由）／**UNKNOWN**（Neon固有の選定経緯・現在の本番設定）。
- 旧 `README.md`（`64163cc^`）、`docs/guide/architecture.md#技術構成と選定記録`、`prisma/schema.prisma`、`.env.example`、`docs/guide/development.md`。
- 旧README選定表のblame `4e96a4cd`。

## 追加で聞かれそうな質問

- Q: 現本番DBがNeonと証明できる？ A: いいえ。実デプロイの設定確認が必要です。
- Q: SQL特有の機能は？ A: pending招待の部分一意インデックスと、公開整合の遅延トリガーです。

---

## Q21. [A] なぜPrismaを採用したのですか？

### 20秒回答

旧READMEでは、DBスキーマとTypeScript側の型を対応させ、migrationとクエリを管理しやすくするためと説明されています。DB固有のトリガーや部分一意制約はSQL migrationも使っています。

### 60秒回答

店舗・メニュー・品目の関係を型付きで扱い、変更履歴をスキーマとmigrationで追えることが必要でした。Prismaの生成Clientで選択列や関連データを取得し、型のずれを見つけやすくしています。一方、Prismaだけで現行DBの全制約を表現しているわけではなく、SQL migrationやDB実検証も必要です。生成物、依存更新、接続設定の保守費用もあります。

### 詳細

`prebuild` でClient生成。`schema.prisma` にモデルと関係、`migrations/` にSQLの履歴。依存は `package-lock.json` の解決版を優先。限定overrideの `deepmerge-ts` は過去の脆弱性対応で、Prisma選定当初の理由ではない。

### 他の選択肢

- 生SQLと手書き型。
- Drizzle等の別ORM。
- DBクライアントと手動migration。

### なぜ他の選択肢ではなかったのか

旧READMEに型・migration・クエリ管理の理由がある。代替ORMとの性能・保守比較をした証拠は**UNKNOWN**。

### トレードオフ

生成とmigrationの運用、ORMで扱えないSQL制約との二重管理、依存更新時の互換確認。

### 今ならどうする？

**同じ設計を維持する。** DB固有制約の回帰テストを継続し、依存overrideの必要性は更新時に再評価する。

### 根拠

- Evidence level: **CONFIRMED**。
- 旧 `README.md`（`64163cc^`）、`docs/guide/architecture.md`、`prisma/schema.prisma`、`prisma/migrations/`、`package.json`、`tests/prisma-config-compat.test.ts`。
- 旧README選定表のblame `4e96a4cd`。Prisma v6の提供機能は[公式資料](https://docs.prisma.io/docs/orm/v6)で確認。

## 追加で聞かれそうな質問

- Q: Prisma schemaだけでDBの全ルールが分かる？ A: いいえ。SQL migrationに部分一意とトリガーがあります。
- Q: 型安全なら実DBテスト不要？ A: 不要にはなりません。DB制約やトランザクション挙動は実PostgreSQLで検証します。

---

## Q22. [S] なぜ認証をClerkへ任せ、認可はアプリ側で行うのですか？

### 20秒回答

旧READMEには、認証とセッション管理をClerkに任せ、店舗ごとの操作権限はアプリ側で管理するためと記録されています。ログインできることと、自店舗を編集できることを分けています。

### 60秒回答

パスワード・セッションを自前で持つと維持する範囲が広がります。現行はClerkのサーバーセッションから利用者IDを得て、DBの `User.clerkUserId` と `Shop.ownerClerkUserId` を照合し、稼働店舗だけを管理対象にします。認証を委ねても他店舗の操作は自動では防げないため、APIはリソースIDと解決したshopIdで絞ります。外部サービス依存とClerk・DB間の整合管理がトレードオフです。

### 詳細

`proxy.ts` は管理・認証経路にClerk middlewareを適用する入口で、所有権の最終確認ではない。`getCurrentAppUser` は通常読取で自動の旧メール連携をせず、明示的なprovisioningのみ作成する。旧 `passwordHash` は移行互換。

### 他の選択肢

- 自前のパスワード・セッション管理。
- 別の認証サービス。
- 店舗の共通パスワードだけを使う。

### なぜ他の選択肢ではなかったのか

認証を外部化し権限へ集中する理由は旧READMEで**CONFIRMED**。他社サービスとの詳細比較は**UNKNOWN**。

### トレードオフ

Clerkの設定・障害・費用に依存し、アプリのUser/Shopとの連携と招待の失敗処理が必要。

### 今ならどうする？

**同じ分担を維持する。** 実Clerkで未認証・別店舗・招待受諾を確認し、移行互換項目の整理は別計画にする。

### 根拠

- Evidence level: **CONFIRMED**。
- 旧 `README.md`（`64163cc^`）、`docs/guide/rules.md#ownership`、`proxy.ts`、`lib/auth/getCurrentAppUser.ts` / `admin-auth.ts`、`lib/auth/admin-api-utils.ts`、`prisma/schema.prisma`。
- 関連commit: `62a8ae4`（Clerk移行）、旧README選定表のblame `4e96a4cd`。ClerkのサーバーAPIは[公式資料](https://clerk.com/docs/nextjs/guides/users/reading)で確認。

## 追加で聞かれそうな質問

- Q: middlewareがあるから所有権は安全？ A: いいえ。管理APIがClerk本人とDBの所有店舗を照合します。
- Q: 管理者ロールなら全店舗を編集できる？ A: いいえ。運営招待権限と店舗所有権は別です。

---

## Q23. [A] なぜ店舗所有者を一人に制限し、招待を運営管理者経由にしたのですか？

### 20秒回答

現行DBは店舗所有者を一意にし、自己登録を止め、運営の招待と受諾で店舗へ結びます。登録できる人を制御できますが、複数担当者の運用を表せない制約があります。

### 60秒回答

推測ですが、誰でも店舗を作れる場合のなりすましや対象の取り違えを抑える意図があります。現行は運営ロールで招待を作り、受諾時にClerk本人のメールと有効招待を照合し、DBで所有者・稼働状態・招待状態を一緒に更新します。競合時は409を返し、外部Clerk操作の片側失敗には補償や再試行を用意しています。一方、`Shop.ownerClerkUserId` が一意でメンバー表がなく、複数担当者・共同編集はできません。

### 詳細

`getAdminRegistrationMode()` は常にdisabled。`AdminInvite` は `pending/accepted/revoked/expired/failed`。受諾はリクエスト本文のメール・shopIdを採用しない。外部処理とDB処理を一つのトランザクションにはできない。

### 他の選択肢

- 誰でも自己登録して店舗を作る。
- 店舗別の複数メンバー表と役割を作る。
- 運営者がDBを手作業で更新する。

### なぜ他の選択肢ではなかったのか

自己登録停止・招待制の意図はコードコメントと `e53dffc` の「招待制…設計」から確認できる。**推測ですが**、店舗の誤登録を抑えるための入口制御と読める。単一所有者の当時の選択理由は**UNKNOWN**。

### トレードオフ

招待・Clerk・DBの競合と補償が複雑。複数担当者や代理更新を表現できず、運営の招待作業が必要。

### 今ならどうする？

**一部変更する。** プロトタイプ中は入口制御を維持し、実店舗で複数担当者が必要と判明したらメンバー表と権限・監査を設計する。

### 根拠

- Evidence level: **INFERRED**（誤登録抑制・単一所有者の理由）／**CONFIRMED**（招待制と現行制約）。
- `docs/guide/rules.md#ownership`、`docs/guide/architecture.md#invitations`、`lib/auth/admin-registration.ts`、`features/admin/invitations/server/acceptInvitationRoute.ts`、`prisma/schema.prisma`、`prisma/migrations/20260420000000_add_admin_invites/migration.sql`。
- 関連commit: `e53dffc`。

## 追加で聞かれそうな質問

- Q: 「招待」なら複数管理者を追加できる？ A: 現行の所有者は一意で、複数メンバー表はありません。
- Q: Clerk招待とDB更新は原子的？ A: いいえ。片側失敗時の補償と運営者の照合が必要です。

---

## Q24. [A] なぜ画像をVercel Blobへ置き、DBにはURLを保存するのですか？

### 20秒回答

旧READMEには、画像をアプリ本体から分け、Vercel環境で扱いやすくするためと記録されています。DBには画像URLと表示設定を置き、アップロードとDB保存を別の処理として扱います。

### 60秒回答

店舗・メニューの画像をアプリのファイルやDB本体へ入れず、Blobへアップロードします。MIME・サイズ・先頭署名を確かめ、保存URLも許可したストアと自店舗のパスだけ認めます。画像配信とデータを分けられますが、Blob成功後にDB保存が失敗すると未参照画像が残り、古い画像の自動回収もありません。現在のサーバー経由アップロード上限5MiBは配備先の要求容量と一致しない可能性があります。

### 詳細

`uploadImageToBlob` は `put()` を使い、ランダムsuffixを付ける。`BLOB_READ_WRITE_TOKEN` はサーバー用。画像URLは表示時も `sanitizeStoredImageUrl` で検査する。ファイル全体のデコード・マルウェア検査ではない。

### 他の選択肢

- DBのバイナリ列へ保存する。
- S3など別ストレージを使う。
- サーバーを通さないclient uploadへ移る。

### なぜ他の選択肢ではなかったのか

アプリ本体との分離・Vercel連携の意図は旧READMEで**CONFIRMED**。他ストレージやclient uploadとの詳細比較は**UNKNOWN**。

### トレードオフ

DBとBlobの原子性がなく、孤立ファイル回収が必要。サービスの容量・権限・料金にも依存。

### 今ならどうする？

**一部変更する。** 許可URL検査は維持し、実Previewの容量を測り、必要ならclient uploadと削除・補償処理を設計する。

### 根拠

- Evidence level: **CONFIRMED**。
- 旧 `README.md`（`64163cc^`）、`docs/guide/rules.md#images`、`lib/storage/upload-images.ts` / `image-url-policy.ts`、`features/admin/menus/server/uploadMenuImageRoute.ts`、`prisma/schema.prisma`。
- 旧README選定表のblame `4e96a4cd`。Blobの役割は[公式資料](https://vercel.com/docs/vercel-blob)で確認。

## 追加で聞かれそうな質問

- Q: Blobに上がればDBに保存済み？ A: いいえ。別段階です。
- Q: MIME検査で画像の安全性を完全保証？ A: いいえ。署名までの形式確認で、全体解析ではありません。

---

## Q25. [A] なぜ公開ページにキャッシュと再検証を使うのですか？

### 20秒回答

推測ですが、公開ページの繰り返し読取を減らすため、静的生成と `revalidate=60` を使ったと考えられます。管理更新後は関連パスを再検証対象にしています。当初の性能測定値は確認できません。

### 60秒回答

推測ですが、毎回同じ読取をする代わりにキャッシュを使い、DB負荷と初期表示を改善したかったのだと思います。メニュー変更時は一覧・店舗・詳細のパスを無効化し、同店舗の別メニューから作る補足も対象にします。読取負荷を下げ得る一方、保存後即時反映や60秒以内の表示を保証しません。APIを通らないDB変更では無効化も通りません。

### 詳細

`force-static` と `revalidate=60` は公開店舗系ページにある。`revalidatePublicMenuPaths` は関連パスを対象にする。実環境の反映時間・キャッシュ設定は別途検証が必要。

### 他の選択肢

- 毎回DBを読み、キャッシュしない。
- TTLだけに頼り、更新APIから無効化しない。
- tag単位の再検証やデータキャッシュへ再設計する。

### なぜ他の選択肢ではなかったのか

`0abb9f9` に初期表示速度改善のcommitはある。**推測ですが**、DB読取負荷と表示速度を意識した可能性がある。TTL 60秒という数値を選んだ測定根拠は**UNKNOWN**。

### トレードオフ

鮮度が利用者へ分かりにくく、誤った登録が修正された後も反映まで差が生じ得る。無効化対象の漏れにも注意が必要。

### 今ならどうする？

**一部変更する。** 公開情報の鮮度要件を決め、実Previewで反映時間を測ってTTLと無効化範囲を再評価する。

### 根拠

- Evidence level: **INFERRED**（採用意図・60秒の理由）／**CONFIRMED**（現行の設定）。
- `features/public/shops/server/PublicShopListPage.tsx`、`features/public/shops/server/PublicMenuDetailPage.tsx`、`lib/public-cache.ts`、`docs/guide/architecture.md#public`。
- 関連commit: `0abb9f9`。

## 追加で聞かれそうな質問

- Q: `revalidate=60` は60秒以内の更新保証？ A: いいえ。再検証可能になる設定で、実際の反映は別確認です。
- Q: 店舗Aのメニュー変更は詳細だけ無効化すればよい？ A: いいえ。同店舗の他メニュー由来の補足も対象です。

---

## Q26. [S] なぜこのテスト分担にして、何が未検証ですか？

### 20秒回答

状態分類や入力条件は単体テスト、認可やAPI応答はモック付きAPIテスト、SQL制約は専用PostgreSQL、匿名の公開導線はChromiumで確認する構成です。実Clerk・Blob・本番相当の配備はCIだけでは検証できません。

### 60秒回答

誤った安心表示と他店舗更新を防ぐ境界が重要なので、`UNKNOWN`、公開条件、権限、招待競合を重点的にテストしています。CIは使い捨てDBにmigrationと架空データを入れ、単体/API、実DB、公開ブラウザ回帰を分けます。それぞれ速さと実装への近さが違います。実Clerkログイン、管理画面の保存、Blob画像、スマホ実機・支援技術、実Previewの設定や復元までは自動CIに含まれません。

### 詳細

`npm test` は `tests/*.test.ts`。`scripts/database-regression.ts` はトリガーと部分一意インデックスも対象。`browser-runner.mjs public` は公開の架空データをChromiumで確認する。専用 `admin` ブラウザ試験は外部Clerk/Blob書込を伴い、通常CIとは分離。

### 他の選択肢

- 単体テストのみ。
- 全操作を実サービスE2Eへ寄せる。
- 手動ブラウザ確認だけにする。

### なぜ他の選択肢ではなかったのか

CIの隔離と外部サービス非使用はREADME旧版・現行開発手順に明記。**推測ですが**、決定的な回帰確認と外部副作用の分離を優先した構成です。各テスト層の定量的な費用比較は**UNKNOWN**。

### トレードオフ

モックは実サービスの設定・応答差を見逃す。公開Chromium回帰だけでは管理画面、他ブラウザ、実機アクセシビリティは確認できない。

### 今ならどうする？

**一部変更する。** 隔離CIを維持し、許可した専用環境で管理E2Eと手動アクセシビリティ・復元訓練を追加する。

### 根拠

- Evidence level: **INFERRED**（分担の優先理由）／**CONFIRMED**（CI範囲）。
- `package.json`、`.github/workflows/ci.yml`、`tests/menu-publication.test.ts` / `admin-menu-api.test.ts` / `admin-invitation-api.test.ts`、`scripts/database-regression.ts` / `browser-runner.mjs`、`docs/guide/development.md#operations`。
- 関連commit: `58cd72a`（隔離CI）、`83832e8`（型検査）。

## 追加で聞かれそうな質問

- Q: すべてのテストが通れば実運用可能？ A: いいえ。実Clerk/Blob、配備、食品情報の真実性は別の検証です。
- Q: なぜ実DBテストがある？ A: Prismaの型やモックではSQLトリガー・部分一意・ロールバックの実動作を証明できないからです。

---

## Q27. [A] なぜVercel、環境変数、現在のCI/CD構成なのですか？

### 20秒回答

旧READMEにはNext.jsの配備とNeon・Blobの組み合わせを想定しやすいためVercelを選んだとあります。接続先や秘密鍵は環境変数へ分け、CIは使い捨てDBと非実在Clerkキーを使います。CI自体は本番デプロイをしません。

### 60秒回答

アプリと外部サービスの接続情報はコードへ書かず、`.env.example` に名前と役割を記載しています。DBは通常・直接接続、Clerkは公開キー・秘密キー、Blobはサーバー用トークンを分けます。CIはPRとmain/develop pushでテスト・lint・型・DB・build・公開ブラウザを実行します。Vercelへの配備や本番migrationはYAMLにありません。環境分離はしやすい一方、Vercel管理画面のProduction Branch、実キー、必須チェック、復元可能性はリポジトリだけでは証明できません。

### 詳細

`NEXT_PUBLIC_` はブラウザへ届き得るため秘密値を置かない。`dependency-audit.yml` は依存変更PR・週次・手動で既知の高リスク問題を検出するが自動更新しない。CIはGitHub Secretsを使わず、ClerkとBlobの実動作を検査しない。

### 他の選択肢

- 別のホスティングに配備する。
- CIから独自のdeploy/migrationを実行する。
- 開発・テストで共有DBや実キーを使う。

### なぜ他の選択肢ではなかったのか

Vercelの採用理由とCIで外部サービスを使わない方針は**CONFIRMED**。ホスティング比較、現在のクラウド設定、CDを分離した最初の判断は**UNKNOWN**。

### トレードオフ

GitHub・Vercel・Neon・Clerk・Blobの設定の整合が必要。CI成功と本番正常稼働は別。配備設定はコード差分だけで監査できない。

### 今ならどうする？

**一部変更する。** 本番相当のPreviewで接続・容量・認可・反映時間を確認し、必須チェックと復元手順を実設定で検証する。

### 根拠

- Evidence level: **CONFIRMED**（旧READMEのVercel選定理由とCI方針）／**UNKNOWN**（現配備設定）。
- 旧 `README.md`（`64163cc^`）、`.env.example`、`prisma/schema.prisma`、`.github/workflows/ci.yml` / `dependency-audit.yml`、`docs/guide/development.md#operations`。
- 旧README選定表のblame `4e96a4cd`、関連commit `58cd72a`。

## 追加で聞かれそうな質問

- Q: CIが通れば本番へ自動配備？ A: このCIにはdeploy処理はなく、VercelのGit連携と管理画面設定は別です。
- Q: `.env.example` に秘密値がある？ A: 名前と例示値です。実キーをコミットしません。

---

## Q28. [A] なぜ監査ログと運用ログを分けるのですか？

### 20秒回答

誰が管理操作をしたかと、要求がどこで失敗したかは目的が違うためです。`AuditLog` は操作の記録、JSONの運用ログは要求ID・状態・時間・分類で障害を追います。

### 60秒回答

メニュー更新や招待では操作者と対象を追いたく、API障害では安全な要求ID・処理時間・エラー分類で切り分けたい。現行はDBの `AuditLog` と `lib/observability.ts` の構造化ログに分け、URL・Cookie・本文・秘密や生の例外をそのまま出しません。障害対応はしやすくなりますが、監査保存はベストエフォートで、通知・保存期間・一度だけの記録まで保証しません。食品確認の証跡にもなりません。

### 詳細

認証成功の監査はサーバーでClerkセッションを検証した時のみ。クライアント申告は別扱い。Honoの未捕捉例外は一般的500へ変換、APIには `X-Request-Id` を付ける。ページの `onRequestError` が同じIDを持つとは限らない。

### 他の選択肢

- すべてを一つのログへ出す。
- 外部監視サービスへ全面送信する。
- エラーメッセージや入力本文を丸ごと記録する。

### なぜ他の選択肢ではなかったのか

現行文書には両者の目的と機密除去が明記される。外部監視の採否を当時比較した資料は**UNKNOWN**。

### トレードオフ

二種類の保存先を運用する。ベストエフォート監査、分散環境の重複、ログ保管・アラート未整備が残る。

### 今ならどうする？

**一部変更する。** 現行の最小記録を維持し、保管期間・閲覧権限・通知先を実運用要件に合わせて定める。

### 根拠

- Evidence level: **CONFIRMED**（現行の目的）。
- `docs/guide/rules.md#audit`、`lib/audit-log.ts`、`lib/observability.ts`、`lib/auth/auth-audit.ts`、`instrumentation.ts`、`tests/observability.test.ts`。
- 関連commit: `a04f1b7`（監査ログ追加）。

## 追加で聞かれそうな質問

- Q: AuditLogで「食品確認済み」を証明できる？ A: いいえ。管理操作の記録で、食品の確認証跡ではありません。
- Q: すべての障害を同じ要求IDで追える？ A: いいえ。ページ例外や外部サービス内部までは同じIDが保証されません。

---

## Q29. [B] なぜ匿名の管理デモと更新制限を用意したのですか？

### 20秒回答

就活用のプロトタイプを人に触ってもらうため、保存しない管理デモを用意しています。実更新はClerkの所有者とポートフォリオ編集許可が必要です。

### 60秒回答

体験レビューで毎回実アカウントやDB更新を求めると試しづらくなります。匿名デモは専用の架空店舗データを読み、フォームの入力は試せても保存しません。実更新側は所有権と追加の編集許可を確認します。レビューしやすい反面、匿名デモだけでは保存・公開・権限の全工程を実証できず、閲覧者が保存できると誤解しない案内が必要です。

### 詳細

`/admin/demo` は店舗名文字列で対象を決めず、専用デモユーザーを使う。`PORTFOLIO_MODE=true` は全認証・所有権を省く設定ではない。

### 他の選択肢

- 全レビュアーに実アカウントを渡す。
- スクリーンショットだけ見せる。
- 共用DBへ誰でも書けるデモにする。

### なぜ他の選択肢ではなかったのか

就活デモと保存しない方式はREADME・product・`d39bd32` に明記。候補の比較過程は**UNKNOWN**。

### トレードオフ

デモと実管理の二経路を保守する。匿名体験は保存処理の品質を示せない。

### 今ならどうする？

**同じ分離を維持する。** 面接では匿名デモの範囲を明示し、保存・公開の説明には隔離した専用テスト環境を使う。

### 根拠

- Evidence level: **CONFIRMED**。
- `README.md`、`docs/guide/product.md#demo`、`app/admin/demo/`、`lib/auth/demo-shop.ts`、`lib/auth/portfolio-mode.ts`。
- 関連commit: `d39bd32`。

## 追加で聞かれそうな質問

- Q: デモで保存まで試せる？ A: 匿名デモは保存しません。保存試験は認証と専用DBが必要です。
- Q: ポートフォリオモードなら所有権確認不要？ A: いいえ。追加の更新制限です。

---

## Q30. [B] なぜGoogle店舗候補検索と公開店舗検索を分けたのですか？

### 20秒回答

Google店舗候補は管理者が店舗情報を入力する補助です。公開検索はアプリ内で登録・公開された店舗に限定しています。候補を選んでも保存するまでDBには反映しません。

### 60秒回答

推測ですが、店舗担当者が住所や地域を入力する負担を下げるため、管理画面からGoogleの候補を取得したと考えられます。一方、利用者の公開検索に外部店舗を混ぜるとアレルゲン登録と結びつかない候補が出ます。そこで用途を分け、管理APIにはサーバー用キーと入力・地域整合の検査を置いています。外部APIへの依存や候補誤選択のリスクは残ります。

### 詳細

公開 `/api/places/search` は外部検索をしない。管理側は保存前のフォーム補助で、位置・地域は更新APIで再検証する。現在の公開画面に動く地図はない。

### 他の選択肢

- 公開画面でもGoogleの全店舗を表示する。
- 店舗情報をすべて手入力させる。
- 外部候補を選んだ時点で自動保存する。

### なぜ他の選択肢ではなかったのか

現行用途の分離は文書・コードで**CONFIRMED**。**推測ですが**、未登録店に品目情報があるかのように見せないため公開側を分離している。初期選定時の比較は**UNKNOWN**。

### トレードオフ

管理側の外部API設定・費用・失敗処理が増える。候補選択の誤りは入力者が見直す必要がある。

### 今ならどうする？

**同じ用途分離を維持する。** 実利用で候補の正確さと入力負担の改善を測り、不要なら補助機能を縮小する。

### 根拠

- Evidence level: **INFERRED**（公開分離の理由）／**CONFIRMED**（現行用途）。
- `docs/guide/product.md#shop`、`docs/guide/product.md#public`、`features/admin/shop/components/AdminGooglePlacePicker.tsx`、`features/admin/shop/server/adminPlacesSearchRoute.ts`、`features/public/shops/server/placesSearchRoute.ts`、`lib/google-places.ts`。

## 追加で聞かれそうな質問

- Q: 公開検索もGoogle Maps APIを使う？ A: いいえ。登録店舗が対象で、公開Places APIは外部検索をしません。
- Q: 候補を選べば即保存？ A: いいえ。フォーム入力の補助で、保存は別操作です。

---

## 技術選定を横断して答えるための早見表

ここでの「他候補」は現時点の比較対象であり、当時の比較実績ではない。機能の説明には公式資料を参照したが、選定理由の確定にはリポジトリ内の記録を使った。Context7 MCPはこの調査環境で利用できなかったため、[Next.js](https://nextjs.org/docs/app)、[Prisma v6](https://docs.prisma.io/docs/orm/v6)、[Clerk](https://clerk.com/docs/nextjs/guides/users/reading)、[Hono](https://hono.dev/docs/getting-started/nextjs)、[Vercel Blob](https://vercel.com/docs/vercel-blob)の公式資料で提供機能を確認した。最新ドキュメントの例をこのリポジトリの依存バージョンへ無条件には当てはめない。

この作業ツリーの `package-lock.json` の解決版は、Next.js 16.3.4、React 19.2.7、TypeScript 6.0.3、Prisma / Client 6.19.3、`@clerk/nextjs` 7.5.13、Hono 4.13.7、Zod 4.4.3、`@vercel/blob` 2.5.0、Tailwind CSS 4.3.2。これらの**版**は採用理由を示さない。

| 技術 | この案件で必要だったこと → 提供したもの | 今比較する他候補 | 主な代償 | 採用理由の証拠 |
| --- | --- | --- | --- | --- |
| Next.js App Router | 公開・管理・APIを一体で扱う → 経路・サーバー描画・Route Handler | React + 別API、別のフルスタック | キャッシュとServer/Client境界の複雑さ | **CONFIRMED**：旧README選定表、Q10 |
| React | 検索・フォームの操作UI → 部品と状態・イベント | テンプレート描画、別UIライブラリ | クライアント状態の保守 | **UNKNOWN**：Next.jsのUI基盤として使う事実はあるが独立した採用理由なし、Q10 |
| TypeScript | 状態・メニューの型共有 → 静的な整合確認 | JavaScript + 実行時検査 | 型と検証を両方保守 | **CONFIRMED**：旧README選定表、Q11 |
| Tailwind CSS | 二面の表示を調整 → utility class | CSS Modules、UIライブラリ | classの長文化 | **CONFIRMED**：旧README選定表、Q11 |
| Hono | HTTP処理の機能別実装 → ルートと共通エラー処理 | Next.js標準Route Handler、別API | 二つのAPI流儀 | **UNKNOWN**：移行commit `6dc7d57` はあるが理由比較なし、Q14 |
| Zod | 外部JSONを実行時に検査 → schemaの `safeParse` | 手書き検証、他のschemaライブラリ | 個別検証との重複 | **INFERRED**：推測ですが、APIの型・文字数をまとめて検査するため。採用比較記録はなし、Q16 |
| PostgreSQL | 関係・一意性・トランザクション → スキーマとSQL制約 | SQLite、別RDBMS | DB運用が必要 | **CONFIRMED**：旧READMEの関連データ理由、Q20 |
| Neon | PostgreSQLの配備先候補 → 接続URL | 他社managed PostgreSQL、自前 | サービス依存 | **UNKNOWN**：PostgreSQLとの併記はあるがNeon固有の比較理由なし、Q20 |
| Prisma | 型付きクエリ・migration → Clientとschema | 生SQL、Drizzle | 生成・ORM外SQLの二重管理 | **CONFIRMED**：旧README選定表、Q21 |
| Clerk | 認証・セッション → サーバーの本人ID | 自前認証、他社認証 | 外部設定・DBとの同期 | **CONFIRMED**：旧README選定表と移行履歴、Q22 |
| Vercel Blob | 画像をアプリから分離 → ファイル保存 | S3、DBバイナリ | DBとの非原子性・孤立画像 | **CONFIRMED**：旧README選定表、Q24 |
| Vercel | Next.js配備 → 旧READMEに記載の配備先 | 別ホスト、自前運用 | 配備設定の外部依存 | **CONFIRMED**：旧README選定表。ただし現配備設定は**UNKNOWN**、Q27 |
| Google Places | 店舗入力の候補提示 → 管理側補助API | 手入力、別の候補API | 外部キー・候補誤選択 | **INFERRED**：推測ですが、入力負担軽減が目的。採用時の比較記録なし、Q30 |

# 面接前に本人が確認すべき項目

1. **本人の意思決定範囲。** GitのauthorやREADMEの選定表だけで、各判断を一人で比較・決定・実装したとは証明できない。技術ごとに「自分が決めた／引き継いだ／後から改善した」を本人の記憶と作業記録で分ける。
2. **「3値」という説明の修正。** 保存は4状態。`MAY_CONTAIN`（入力済みの不確実性）と `UNKNOWN`（未設定）を混ぜない。`null` はこのenumの値ではない。
3. **安全性の言い切り。** 食品安全・摂取可否・交差接触・法令適合・店舗申告の真実性を保証しない。架空データの実運用前プロトタイプであり、食品判断には使わない。内部分類 `safe` や緑色を保証と呼ばない。
4. **品目と法令の説明。** 現行マスタは29品目、コード内分類は9+20だが、最新法令への適合を確認した証拠ではない。固定29件の検証とDBの品目集合を変えると公開条件の全層に影響する。
5. **店舗情報の信頼性。** `updatedAt` は更新日時で、食品の最終確認日時・確認者・証跡ではない。店舗の誤入力や変更漏れ、現場の交差接触は防げない。`AuditLog` も食品内容の確認記録ではない。
6. **公開前チェックの限界。** 全品目が入力されたことは確認するが、入力値が正しいことは検査できない。原材料文と注意書きは公開の必須条件ではない。DBトリガーはmigrationが対象DBへ適用済みか別確認が必要。
7. **ユーザー体験の未検証。** 「強調／除外」、`FREE` と同店舗補足、29品目入力の負担、スマホ・キーボード・支援技術での理解は十分な利用者検証がない。過去のローカル監査は課題候補で、実証ではない。
8. **技術選定のUNKNOWN。** Hono固有、React独立、Neon固有、Zod固有、Google Places固有の採用経緯を本人に確認する。記憶がなければ「理由は記録に残っていない。現状の適合はこう説明できる」と話す。
9. **DB・認可の制約。** `Shop.ownerClerkUserId` は一意で複数担当者表なし。`User.passwordHash` 等は移行互換。DBのCHECK制約は価格・座標等まで網羅せず、アプリ側検証に依存する部分がある。
10. **APIと画面の境界。** 初期表示はServer ComponentからPrisma直読取の経路が多く、更新は管理API。全ページがHonoを呼ぶわけではない。APIエラーのJSONは完全統一されていない。
11. **招待の失敗境界。** ClerkとDBの処理は原子的でない。補償失敗・通信結果不明なら運営者による照合が必要。実Clerkでの全工程の確認をCI成功と同一視しない。
12. **画像の負債。** BlobとDBは別保存で孤立画像の自動回収なし。アプリの5MiB上限と配備基盤の要求上限が食い違う可能性があり、実Preview確認が必要。
13. **キャッシュの鮮度。** `revalidate=60` は60秒以内の更新保証ではない。API外からのDB変更は無効化を通らない。
14. **テストの範囲。** 単体/APIモック、CIの実DB、公開Chromium回帰を分ける。実Clerk・Blob、管理保存E2E、スマホ実機、復元、実本番監視までPASSとは言わない。
15. **現在の外部状態。** Neon接続先、VercelのProduction Branch・環境分離・必須チェック、GitHub Issue/PR本文、公開中のSHAは今回確認できていない。ローカルにはPR #36等のmerge commit表題があるが、PR本文の設計理由として使わない。
16. **作業ツリーの状態。** 調査開始時にアプリ・CI・ガイドの未コミット変更が多数あった。面接で「この実装はmainに公開済み」と言う前に対象ブランチ、commit、配備SHAを確認する。
17. **本人の素直な動機。** 実際に「使える技術だった」ならそう言い、そこから「この案件で何に役立ち、どの欠点を後で知ったか」を説明する。旧READMEの選定理由を本人の比較実験として脚色しない。

# 明日の面接までに最低限覚える10問

| 質問 | 20秒回答 | 覚えるキーワード |
| -- | ----- | -------- |
| Q1 なぜこのサービス・対象者？ | 自分の外食時の負担が出発点です。店舗が更新し利用者が事前確認する流れを、架空データのプロトタイプで試しています。 | 当事者経験／二面／需要未検証 |
| Q2 なぜ4状態？ | 「含む」「原材料に含まない」「含む可能性あり」と、未入力を分けるためです。不確実な登録と未入力は公開条件も違います。 | `CONTAINS/FREE/MAY_CONTAIN/UNKNOWN` |
| Q4 なぜ安全と言わない？ | `FREE` は原材料に含まない**登録**で、交差接触や摂取可否は確認できません。情報確認を助けるもので、食品の安全判定ではありません。 | 登録情報／交差接触／保証しない |
| Q5 なぜ公開前チェック？ | 未入力を「含まない」と誤認させないためです。画面、API、公開側、DBで不足を扱いますが、入力内容の真実性は証明できません。 | 全品目／`UNKNOWN` 拒否／多層／真実性は別 |
| Q10 なぜNext.js？ | 旧READMEでは公開・管理・API・DB処理を一つのコードベースで整理するためと記録されています。他候補との比較は残っていません。 | App Router／React／比較記録なし |
| Q13 なぜServer/Client分割？ | 初期表示はサーバーでDBと公開条件を確認し、検索・フォームなど操作部分をクライアントに置いています。初期表示が自APIを呼ぶとは限りません。 | Prisma直取得／`localStorage`／境界 |
| Q18 なぜ中間テーブル？ | 同じ品目でもメニューごとに状態が違うため、メニュー×品目の結合行に状態を持たせています。複合主キーで重複を防ぎます。 | `MenuItemAllergen`／複合主キー／マスタ |
| Q20 なぜPostgreSQL / Neon？ | 関連データと制約を扱うためという旧READMEの記録があります。Neonを他のPostgreSQLサービスより選んだ固有理由は未確認です。 | 関係／トランザクション／Neon固有はUNKNOWN |
| Q22 なぜClerk？ | 認証・セッションはClerkに任せ、店舗の操作権限はDBで照合します。ログインと自店舗編集は別の判定です。 | 認証≠認可／`ownerClerkUserId`／他店舗404 |
| Q26 何をテストしている？ | 状態・API・SQL制約・匿名公開導線を層ごとに検査しています。実Clerk・Blob・本番環境・食品情報の正確さまではCIで確認できません。 | 単体／モック／実PostgreSQL／Chromium／未検証 |
