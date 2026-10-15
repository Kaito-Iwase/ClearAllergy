# 管理一覧の食品再確認待ち：Issue #74

[管理操作](../guide/product.md#menus) · [変更対応表](../guide/change-map.md) · [食品確認の正本](../guide/rules.md#publication)

[独立レビュー原記録](admin-menu-review-queue-independent-20261015.md)は#74本体と実行証拠の読取を扱います。後続の[一料理の操作画面・台本・空票](../research/product/ingredient-change-trial-20261015.md)は、別の補助fixtureとして同じ変更内へ配置します。その模擬保存・補助試験を、実管理API/DBの試験や参加者の観察結果へ合算しません。

一料理fixtureの[準備結果](ingredient-change-trial-preparation-20261015.md)と[独立レビューのround1→round2](ingredient-change-trial-independent-20261015.md)も別記録へ接続しました。初回指摘の履歴を削除せず、資料先読み・価格・在庫カードの修復後13群と、最終の未解決must-fixなしを区別して読みます。

対象は [Issue #74](https://github.com/Kaito-Iwase/ClearAllergy/issues/74)、base `e29d24aae0ceec55ff744117f4b58723c1fe2b71`。2026-10-15の独立worktree `agent/issue-74-review-queue` の未コミット差分を検証する。commit・PR・最終HEADの記録は統合担当の最終報告へ引き継ぐ。

## 問題・原因・採用した変更

旧一覧は食品版・確認対応版・最新記録を表示DTOへ渡さず、未設定品目だけを「要確認」としていた。全品目設定済みで食品変更後の料理も「下書き／アレルゲン設定済み」に埋もれ、「全品目を設定すると公開準備完了」という案内が現行の公開条件と食い違っていた。

一覧の説明・取得だけを変更する案を採用した。通知・担当割当・期限・新しい承認モデルやschemaは不要なため追加しない。通常管理ページ、保存しない管理デモ、認証済み一覧GETを共通selectionと明示DTOへそろえた。`isFoodReviewCurrent` を再利用し、最新記録（`reviewSequence` 降順、1件）の食品版と未解決事項の有無で説明を分ける。根拠・操作者・snapshotは取得せず、未解決メモ本文も一覧に転送しない。

| 観察する状態 | 一覧の食品確認表示 | 再確認待ち件数 |
| --- | --- | --- |
| 現行版の最新記録に未解決事項あり | 最新の食品確認記録に未解決事項あり | 含める |
| 最新記録が存在し、食品版一致・未解決なし・現行版と確認対応版が一致 | 現行の食品確認記録あり | 含めない |
| 記録はあるが最新記録の食品版が違う、または現行の確認対応なし | 現在の食品内容に対応する確認記録なし | 含める |
| 一覧で取得した記録なし（確認対応版の一致だけでは補わない） | 食品確認記録なし | 含める |
| 品目未設定 | 品目名・未設定件数を上記とは別表示 | 食品確認の状態に従う |
| 通常STOP・現行確認あり | 非公開＋現行の食品確認記録あり | 含めない |

「旧確認」の理由を食品変更・期限切れ・誰の操作と推測しない。食品版・確認対応版はDBが維持する既存の契約であり、一覧が判定を書き換えることはない。「再確認待ち」は初回の記録なしも含む説明上の集計で、新たなDB状態ではない。公開中／非公開、未設定あり、食品確認の再確認待ちの各絞り込みを分け、検索と併用できる。編集入口は既存URLへ進む。

独立レビューで、取得の前後が混ざる等により「現行の確認対応版」と「同版の最新未解決記録」が同時に届く反例を指摘された。DBの通常の更新では確認対応が解除されるが、一覧はこの矛盾で未解決事項を隠さないよう、同版の最新未解決を先に表示する。追加回帰のREDは期待 `unresolved` に対し `current`、局所修正後は旧版の未解決を誤って現行の未解決にしない対照も含め4件GREEN。公開ゲート自体の変更ではない。

その後の統合担当の読取で、確認対応版だけ一致していても、取得した記録が空・最新記録が別食品版なら「記録あり」と表示してしまう追加反例を確認した。追加2件のREDは `current` に対して期待 `missing`／`outdated`。最新記録の存在と食品版一致を先に検査し、その記録の未解決事項を確認してから共通の確認対応を判定する局所修正で、対象6件GREENを確認した。過去／未来どちらへ食品版が食い違っても再確認待ちにし、親・子の別読取の食い違いを実記録の存在へ補完しない。旧版未解決の対照は「最新同版clean、その後に旧版未解決」の実在可能な履歴順に直した。通常STOPのfixtureも最新同版cleanの記録を明示している。DBの公開ゲートへこの表示用の追加条件は加えていない。

## 維持する境界

認証・解決済みshopIdの絞り込み、PUT/DELETEのCAS、STOP、食品版、公開ゲート、transaction、食品確認記録の意味、未保存フォームは変更しない。schema・migration・新規依存・本番データ・外部サービス設定を変更しない。公開の注意表示や安全意味も変更しない。通常の非公開を「下書き」だけと呼ばず、公開停止と再確認待ちを独立表示する。

一覧は読み込んだ時点の情報であり、自動更新・他端末への停止通知は追加していない。通常の一覧表示の成功は公開表示への訂正到達や実食品の正確性を証明しない。

## 今回の自動回帰

環境はWindows、Node `22.15.1`。既存canonicalの依存をjunctionで読み取り利用し、再install・共有Prisma生成は実行していない。

| 検査 | 今回の結果 |
| --- | --- |
| 一覧GETのRED | 追加回帰1件で、期待 `foodReviewState=unresolved` に対し旧実装は `undefined`。FAILを確認 |
| 一覧GETのGREEN | 同じ1件PASS。自店舗条件、未設定品目の導出、未解決本文・raw記録非転送を検査 |
| SSR表示のRED | 旧一覧に再確認待ちがないため追加1件FAIL |
| SSR表示・状態導出のGREEN | 初回3件、最新未解決の追加後4件、記録欠損／別版projection追加後6件PASS。全品目設定済みでも理由・入口を表示し、通常STOPを再確認件数から除外 |
| 全単体・APIテスト | `node --import tsx --test tests/*.test.ts`、記録projectionの追加修正後は194件PASS、失敗0。修正前の192件と区別する。未認証401・所有店舗なし403・他店舗ID404・自店舗一覧条件も既存／追加回帰で検査 |
| 型検査 | `node node_modules/typescript/bin/tsc --noEmit --incremental false`、終了0 |
| lint | `node node_modules/eslint/bin/eslint.js`、終了0 |
| build | `npm.cmd --ignore-scripts run build -- --webpack`、記録projectionの追加修正後の再実行も終了0。既存Prisma Clientを利用し、共有生成と他worktreeのbuildを直列化 |
| 隔離実ブラウザ | 既存Playwright `1.62.1` とChrome `155.0.8059.40` で `node scripts/check-allergen-cards-browser.mjs`、13群PASS。既定runnerの要求版1.61.0を装わず、個別scriptを実行 |
| 文書・差分 | 統合担当の補助資料への入口追加後も含む6文書のローカルリンク142件、対象ファイル・アンカーの欠落0。外部URLの疎通検査ではない。`git diff --check` 成功 |

最初のsandbox内全テストは187/191で、既存hardlink検査1件が権限エラー、既存root glob検査3件がsandbox固有の波括弧を含むTempパスで失敗した。同じ差分を通常Windowsで再実行して191/191を確認した。テストを削除・skipして成功扱いにはしていない。

依存のjunctionをTurbopackがroot外として拒否したため、アプリ設定を変更せずwebpackへ切り替えた。webpackのsandbox初回はGoogle FontsのDNS遮断で停止し、同じコマンドを通信可能な通常Windowsで実行して成功した。buildは非実在Clerkキーと架空loopbackのCI設定だけを使い、実際の`.env`はコピーしない。schema未変更の既存Prisma Clientを使い、共有生成物を変更するprebuildを省略した。これは通常のclean install／Turbopack buildが成功したという証拠ではない。

`scripts/check-allergen-cards-browser.mjs` に実一覧と実DTO導出の6状態fixtureを追加した。定義する検査は、通常STOPと再確認4件の区別、3理由、根拠本文非転送、キーボードfilter/編集フォーカス、320/390/768/1440px、検索・既存filter・0件、版付き削除の模擬応答と削除後件数、demo編集URL・削除禁止・空一覧。fixtureのNext Link/Image・routingは代用品で、削除応答は模擬。実DB・実Clerk・Blobへ接続しない。

本実行では現行`app/layout.tsx`が指定する公開Material Symbols CSSとフォントを事前取得し、成果物ディレクトリの`material-symbols.css`／`material-symbols.woff2`からloopback配信した（フォントSHA-256 `a98a4a072ebeb0928bb92ba6e1f6814b8f52168686ac2f03358e12a148264bf2`）。ブラウザの外部通信遮断は維持し、実フォントのloadと4幅の編集ラベルの表示範囲を検査した。390px・1440pxのスクリーンショットも目視確認した。アイコンを常時隠すアプリ変更や依存追加は行わない。cacheなしのfixtureではアイコン字体の描画を未確認と明示する。

既存の実認証用`check-test-browser.mjs`も新しい「非公開」filter名へ同期したが、実Clerk・専用DB・Blob書込を伴うため今回実行していない。モック・SSR・実部品ブラウザの成功を実認証・実DBの結合検証へ読み替えない。

## 一覧projectionの実DB回帰の追加

`scripts/check-admin-menu-list-database.ts` を追加し、CIの既存「Check PostgreSQL constraints and rollback」内で `check-ci-database.ts` 成功後に実行する。アプリのschema・SQLトリガーは変更しない。CIまたは専用テストDBの接続先ガードを通ってからPrismaと共有select/mapperを読み込み、UUID付き架空店舗1件と6料理だけを作る。既存Allergenは読むだけで、終了時は自分の店舗IDに限って監査行と店舗配下を削除しdisconnectする。migration・seed・resetはこのscriptでは実行しない。

定義した7検査は、未記録、現行確認＋公開中、通常STOPでもcurrent保持、食品変更によるoutdated、後続未解決によるunresolved、UNKNOWNを別軸で残して公開拒否、全DTOで根拠/actor/snapshot/未解決本文の非転送。実SQLの食品版・確認記録・公開トリガーを使うが、HTTP APIや実Clerkの検査ではない。

新scriptの型検査・対象lint、既存js-yamlによるworkflow parseと実行順assertは終了0。接続許可なし・別host・test flagとCI URLの不一致の3条件は期待通り終了1、DB module import試行0を確認した。独立read-onlyレビューに追加must-fixなし。ローカルDockerは利用できず、実SQLの7検査とcleanupの実行結果はこの原稿のfreeze時点では **UNVERIFIED**。PRの最終HEADに対するGitHub CI結果はPR本文と統合担当の最終記録へ残す。guard拒否や静的検査を実PostgreSQLの成功へ数えない。

## 文書と未確認事項

操作をproduct、共通DTOの責務をarchitecture、テストの入口をchange-map/development、今回の結果への入口をverificationへ同期する。rulesは状態・公開・権限の意味を変えないため本文更新不要。READMEの主機能、構成図の処理経路、AGENTSの作業手順も変わらないため更新しない。

独立read-onlyレビューのP2指摘（最新未解決の優先）は上記RED/GREENで修正し、その時点の再照合で追加must-fixなしと確認された。その後の統合担当の記録欠損／別版projection指摘も修正し、2回目の修復cycleとして同じ独立reviewerへ再読を依頼した。過去のraw reviewは当時の対象と結論を保持する。commit・GitHub CI・PRの最終状態は統合担当の報告で照合する。

実店舗の更新工数、滞留・見落とし率、食品の正確性、利用者の誤認防止は未検証。架空データの画面検査をこれらの実測へ読み替えない。研究資料の25試験をすべて実行・合格したという結果ではない。実認証の管理ルート、配備環境とGitHub CIは未確認として残す。
