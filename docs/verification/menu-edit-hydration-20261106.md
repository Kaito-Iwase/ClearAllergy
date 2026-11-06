# メニュー編集のhydration中の入力保護（2026-11-06）

[操作](../guide/product.md#menus) · [E2E手順](../guide/e2e.md) · [変更対応表](../guide/change-map.md)

## 問題と原因

main `4d28efc65b769d20aa93216281d00938d3aa03a1` の [CI run 42227484408](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/42227484408) は、食品訂正の保存後管理GETで原材料が「訂正内容＋旧原材料」になり失敗しました。DOMの非表示文字の問題ではありません。`MenuEditClient.tsx` は初期値をReact stateへ入れ、保存APIは受信した原材料を置換します。APIに連結処理はありません。

修正前と同じソースをコピーした実Nextアプリ・使い捨てPostgreSQL・架空食品で、NextのJavaScriptだけを保留して次の3操作を観測しました。Clerk境界のみローカルの認証doubleです。

| 操作 | 入力・PUT・保存後管理GET |
| --- | --- |
| hydration後に `fill` | 訂正値が一致 |
| hydration前に `fill`を完了してからJS再開 | hydrationで旧値へ戻り、旧値を送信・保存 |
| hydration前にクリック・全選択し、JS再開後に通常のキーボード入力 | 選択範囲が `[0,62]` から `[0,0]` に戻り、「訂正内容＋旧値」を送信・保存 |

最後の操作は `textarea.value` の直接書換えやAPI応答の差替えを使いません。読み込み途中の利用者操作でも起きる製品の入力保護の不具合です。CIの失敗と同じ文字列の形状を再現しましたが、当該CIの厳密なイベント順序は記録されていないため未確認です。

診断run `local-95fb3bb9-7830-4070-a7a6-45afeb6ef5bd` では診断1件が完走し、追加したPC・モバイル回帰2件は「無効を期待した原材料欄が有効」で失敗しました。回帰の初版は保留中routeの終了待ちがなく、後始末にもエラーを出したため、最終テストでは `unrouteAll({behavior:'wait'})` で保留解除後の処理完了を待ちます。run全体のactor cleanup・所有DB停止は成功、一時アプリとDBも削除済みです。既定の不完全なブラウザーcacheによる先行runの試験未開始は成功件数に含めません。

## 修正と検証範囲

`MenuEditClient.tsx` のfieldsetをSSRと初回hydrationの間は無効にし、「編集の準備中です。」を表示します。`useSyncExternalStore` のserver snapshotをfalse、client snapshotをtrueにし、イベントが接続された後だけ操作を有効にします。既存の保存中・画像処理中・保存内容確認中の無効条件も維持します。

`e2e/admin.spec.mjs` の2件は1440×1000・390×844でNextスクリプトを保留し、原材料欄と保存ボタンの無効を確認します。保留解除後は原材料を入力し、入力値・PUT本文・保存後GETの完全一致を要求します。Reactの内部プロパティに依存する診断処理や一時的なテスト絞り込みは製品・CIへ残しません。既存の食品訂正・非公開化・別操作の再公開テストの期待値は変更しません。

`vercel.json` は作業branch `fix/e2e-food-edit-20261106` のGit配備だけをfalseにします。外部Project設定・mainのGit配備・staging自動配備の有効化は変更しません。API・認可・公開条件・DB schema・依存の変更はありません。入力保護は既存メニューの編集画面が対象です。

## 実行結果

公式Node 22.23.4、既存npm 10.9.2、React/ReactDOM 19.2.7、Next 16.4.1、既存Playwright 1.61.0を使用。アプリ依存・Prisma Client・PostgreSQL実行ファイル・完全なブラウザーcacheを再利用しました。外部DB・実Clerk・Blobは使いません。

- 単体テスト：380/380 PASS。
- `npm.cmd run lint`・`npm.cmd run typecheck`・`npm.cmd run build`（prebuildのPrisma Client生成を含む）：PASS。公式NodeをPATH先頭に指定し、既存npm CLIで実行しました。lintは診断コードを除いた最終の回帰テストでも再確認しました。
- `node e2e/run-local.mjs --allow-font-download`：23定義中22 PASS・native BFCache1 SKIP。実Chromium、Clerk境界double、所有する使い捨てDB。run `local-5d3c8e3b-4101-4580-b070-5e763475d09c` は既存食品訂正・UNKNOWN・権限拒否・競合・新PC/モバイル2件を含みます。actor cleanupと所有DB停止は終了code 0、所有process停止と一時アプリ/DBの削除も確認、lifecycle結果はPASSです。native BFCacheの`persisted=false`は未実証として残します。
- 独立した読取専用レビュー：コード上のP0/P1/P2なし。手順書の件数不一致P3を修正し、再レビューで解消。`git diff --check` と一時的なrunner/config変更の残留なしも確認しました。
- GitHub CI：公開後に対象head・PR merge SHA・runを照合します。上記はWindowsでの結果です。
- 実Clerk・Blob・実端末の手操作：UNVERIFIED。今回の使い捨てDB試験と区別します。

## 公式資料

Context7でReactとPlaywrightの公式資料を照合しました。Playwrightの[hydrationの説明](https://playwright.dev/docs/navigations#hydration)は、リスナー接続前に有効な入力で変更が失われる場合、hydration完了まで操作を無効にする対処を示しています。Reactの [`useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering) のserver snapshotはSSRと初回hydrationで一致させます。保留routeの終了待ちはPlaywrightの [`unrouteAll`](https://playwright.dev/docs/api/class-page#page-unroute-all) に従います。
