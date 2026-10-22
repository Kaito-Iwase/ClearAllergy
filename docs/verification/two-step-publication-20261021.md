# 二段階公開・既存未解決の明示解除の検証記録

2026-10-21 UTC。当時の基準main・HEADは `d1e155b30d6cc2034ac2a007a59623e1b213303a`、専用ブランチは `feat/two-step-menu-publication-20261021`。以下は当時の未commit差分に対するローカル結果。**承認された最小案の実装・検証済み、本番未適用**。後続の店舗管理・公開表示の変更と追加検証は[2026-10-22の記録](store-management-20261022.md)を参照する。

## 承認・実装・既存データ

ユーザー承認に従い、長文の食品確認フォームを外した。新規・食品変更は非公開で保存し、保存済み内容を見直して別に「公開する」を押す。価格・画像構図のみの変更は既存公開を維持する。[判断ログ](../research/product/two-step-publication-decision-20261021.md)に、自由記述の記入負担に対する確認品質の効果が未検証であること、食品版による流用防止、公開操作を食品安全の保証にしないことを記録した。

既存未解決の解除は、親タスクが2026-10-22 01:28 JSTに提示し、その後具体例を説明した最小案をユーザーが暫定承認した。未解決原文を表示し、実際に確認・対応した店舗担当者が「この内容は解消した」を押す。解除だけでは公開せず、その後に別の公開操作を行う。長文入力を再導入しない。解除の仕様回答待ちは終了している。

旧 `MenuFoodReview` の根拠・範囲・確認日時・操作者・未解決本文・snapshotを変更せず履歴として保持する。新しい `MenuPublicationConfirmation` は公開操作、`MenuFoodIssueResolution` は解除対象ID・保存済み食品版・実操作者・実操作時刻・元の未解決本文を追記する。食品根拠や原資料を確認した日時を捏造しない。解除によるアレルゲン状態の変更はなく、UNKNOWN・欠損の公開拒否、所有権・Origin・競合409を維持する。

解除APIは内容保存・公開との混在を拒否し、所有行の期待版を確保して最新未解決IDと現在食品版を再検査する。解除では内容や品目リンクを変更しない。食品変更で公開と古い解除の版対応を失効させ、新しい未解決記録に以前の解除を流用しない。UI・API・応答schema・管理一覧・公開側4入口と店舗内補足・DB制約を同じ条件へ揃えた。

追加migrationは `20261021000000_two_step_publication` と `20261021010000_food_issue_resolution` の2本。既存migrationは変更していない。移行は既に公開中で有効な実在の旧記録があるメニューだけを移行由来IDで維持し、下書きや未解決を自動公開しない。新しい人の公開・解除イベントを補完しない。メニュー・店舗の明示削除で関連履歴が連鎖削除される従来の境界は残り、永久保存の監査とは扱わない。

## 環境と最終結果

Windows、Node 22.15.1、Next 16.3.8、React 19.2.7、TypeScript 6.0.3、Prisma 6.19.3、隔離Chromiumを使用した。repo基準のNode/npm環境との一致やGitHub CI実行は今回の結果に含めない。package/lockは変更せず、独立した依存ディレクトリでclean npm ci後、その依存を専用worktreeだけに配置した。canonicalのnode_modulesや.envは使わない。

DBは今回所有するDocker PostgreSQL 17、loopback `127.0.0.1:55439/clearallergy_ci`、架空fixtureのみ。CI接続ガードがDB名・利用者・テスト用資格情報・DATABASE_URL/DIRECT_URL一致を検査する。旧版からの移行は空の使い捨てDBで行い、通常の初期化後の回帰と分けた。本番接続先・実Clerk・Blobは使っていない。

| 確認 | 最終結果 | 証拠と限界 |
| --- | --- | --- |
| 単体・APIモック全体 | 225/225 PASS、失敗0 | `food-issue-unit-complete-20261021.log`。DB・Clerk・cacheは代用品 |
| 型検査 | PASS、終了0 | `food-issue-typecheck-final-20261021.log`。最後に追加した実DB/API回帰も含む |
| lint | PASS、警告0・終了0 | `food-issue-lint-final-20261021.log`。追加DB回帰後にも再実行 |
| build | PASS、終了0 | `food-issue-build-first-20261021.log`。Next 16.3.8のwebpackビルド、Prisma生成・TypeScript・静的生成を完了 |
| Prisma validate / generate | PASS | `food-issue-prisma-20261021.log`。専用Clientの生成であり本番適用ではない |
| 移行・DB制約・実API・一覧の回帰 | 56 PASS項目 | `food-issue-ci-order-final-20261021.log` の12項目と `food-issue-ci-resume-20261021.log` の44項目。途中のテストスクリプト修正と再開は下記に分けて記録 |
| 店舗・メニューの実UI | 8/8グループ PASS | `food-issue-store-browser-first/store-review-browser-result.json`。長文フォーム不在、別保存・公開、表示済み未解決の明示解除、履歴不変、解除409、変更後の再失効。390/768/1536px |
| 品目・一覧・編集の実UI | 13グループ PASS | `food-issue-allergen-browser-final-20261021.log`。UNKNOWN・未入力・不正応答・readonly・検索/絞込・履歴・入力保持、320/390/768/1440px。装飾アイコンfontの実描画はローカルcache不足でUNVERIFIED |
| 隔離した材料変更演習 | 14/14グループ PASS | `food-issue-ingredient-trial-final/trial-check.json`。明示解除→別公開、元の問題と日時保持、材料変更・公開停止・価格・競合。メモリ保存による合成演習であり実食品・参加者研究ではない |
| 独立レビュー | 基本変更3 rounds、追加解除1 round | 読取専用subagentによる別レビュー。追加解除は修正必須指摘なし。reviewer自身のDB/browser実行とは扱わない |

DB56項目には、旧公開・下書き・未解決の移行、全旧記録の不変、公開/解除イベント補完0、再deploy不変、直接の派生値復元拒否、旧版/未来版拒否、append-only、DELETE/TRUNCATE後の失効、トランザクション巻戻し、並行食品訂正を含む。実PUTをPostgreSQLへ接続した回帰では、解除200の内容・品目・履歴不変と実操作者、解除後の公開GET404、再送409、別公開後GET200、材料変更後GET404、旧版解除/未解決公開400、portfolio readonly403を確認した。Clerkとcacheだけはテストプロセス内の代用品である。

ブラウザは実コンポーネントと同一worktreeのビルド済みCSSを使う。Nextの一部機能、認証、fetch応答を隔離fixtureで置換しており、実Clerk経由の管理ルートや配備環境を検証した結果ではない。既存の画面証拠は `food-issue-store-browser-first/menu-explicit-resolution-mobile.png` と `menu-two-step-published-mobile.png` に保持した。常時公開のプレビューURLは作成していない。

## 再現するコマンドと副作用

静的検査は `npm.cmd run lint`、`node node_modules/typescript/bin/tsc --noEmit --incremental false`、`node --import tsx --test tests/*.test.ts`、`npm.cmd run build -- --webpack`、Prismaの既存CLIでvalidate/generateを実行した。buildは解除を含むアプリ変更後、型検査とlintは後続のテストスクリプト修正後にも完了した。その後の文書だけの修正ではbuildを繰り返さない。

DBは承認された使い捨てDBと上記CIガードを設定したうえで、次を実行した。空DBを要求する最初のコマンドを既存DBに向けたり、DBを無断リセットしたりしない。架空fixtureは各回帰が自身の作成分を後始末する。

```powershell
node --import tsx scripts/check-publication-migration.ts
node --import tsx scripts/setup-ci-env.ts
node --import tsx scripts/check-publication-database.ts
node --import tsx scripts/check-ci-database.ts
node --import tsx scripts/check-admin-menu-list-database.ts
```

今回のローカルでは新テーブルの制約確認を先に実行し、その後既存制約/API・一覧を再開した。workflowにも空DB移行回帰と新公開/解除のDB回帰を加えたが、GitHub上のCIは未実行。既存の追加CI項目（shop/owned-menuなど）全体を新たに回したと主張しない。主要な所有権・競合の実API回帰は上記check-ci-databaseに含まれる。

UIは `node scripts/check-store-review-browser.mjs`、`node scripts/browser-runner.mjs allergens`、`node scripts/ingredient-change-trial.mjs --check` を使う。既存の隔離Playwright/Chromium、ビルド済みCSSと出力先を指定する。必要な前提と副作用は[開発手順](../guide/development.md#browser)に従う。app/DB/実認証を必要とするadminブラウザ回帰は今回実行していない。

## 途中の失敗・修正とレビュー

- 初回コピーのNext 16.3.6とlockの16.3.8の不一致を検出し、変更のないlockからclean installした16.3.8へ交換した。16.3.6の初回buildを最終根拠にしない。clean installの既存moderate監査1件を依存更新やaudit fixで変更していない。
- `scripts/npm-cli.mjs` を実行CLIと誤認した空の初回lint/buildログは成功根拠から除外し、実CLIへ訂正した。
- 追加解除の初回単体はfixtureの解除配列不足と、解除時の通常リンク再整形によって失敗した。解除をメタデータ専用更新に分け、リンク書込を行わないよう修正し、全225件を再実行して成功した。
- 旧フォームを参照するブラウザfixtureの残存変数を修正し、品目13組と演習14組を最後まで再実行した。
- 初回の架空CI初期化は一般エラーで失敗した。作成行0を確認し、一時的な診断コピーと、新しい空DBでの元の初期化は成功した。初回の原因は未特定であり、推測でtimeoutと断定しない。診断コピーは削除済み。
- 最終DB順序では、移行・初期化・新制約12項目の成功後、後から追加した実API回帰の重複変数名が構文エラーになった。変数名を修正し、型検査と残り44項目を再実行して成功した。アプリコードの不具合と区別する。
- 基本変更の独立レビューで、移行専用IDの後付け、公開根拠削除後の旧根拠復活、想定内の拒否が500になる問題を修正した。専用DB回帰で再現経路を塞いだことを確認し、3 round目に新しい重大指摘なし。追加解除の独立レビューは別phaseの1 roundで修正必須指摘なし。任意のreadonly補強は実DB/APIで追加した。同一食品版で新reviewを追加する競合そのものの専用テストは未追加だが、最新ID拒否と食品訂正とのロック競合は確認した。

## 文書・差分・保全

[公開条件の正本](../guide/rules.md#publication)、[操作](../guide/product.md#menus)、[内部処理](../guide/architecture.md#mutation)、[開発・移行](../guide/development.md)、[変更対応表](../guide/change-map.md)、README、AGENTS、研究索引、検証入口と図のdrawio/SVGを更新した。過去の演習記録には現行方式への案内を加え、当時の結果を改変していない。文書保守の手順自体は変わらないため `maintenance.md` は確認のみで更新不要。

最終確認は、変更Markdown12件の相対リンク371件・アンカー、図2件のXML、差分空白と新規テキストの末尾空白がPASS。既存migration/package/lockは不変。canonicalの元358ファイルhash・未commit9変更・HEAD・branch・index/statusは開始時と一致した。補助証跡を作業フォルダの `food-publication-final-20261021.json` に保持する。検証用DBは今回所有するコンテナの名前・所有label・ID一致を確認して停止済み。他のDBは操作していない。

## 残る確認・本番適用の境界

実Clerk/Blob、稼働DBの該当未解決データの有無、実認証の管理ブラウザ、Vercelと配備cache、実店舗での記入負担・確認品質への効果はUNVERIFIED。自由記述を外した効果や安全性を実証したとはしない。

本番ではDB制約とアプリを一緒に切り替える手順・バックアップ・復旧先・停止/再開条件を別途確認する必要がある。新旧サーバー混在や逆向きmigrationは未検証で、アプリを旧版へ戻すだけではDBは戻らない。旧履歴や新操作を削除したり、旧公開フラグを一括復元したりするrollbackは採用しない。適用と復旧を別の承認済み作業として準備する。

この記録の時点ではcommit・push・Issue/PR投稿・merge・本番DB変更・本番deployは行っていない。解除仕様は実装済みで追加の仕様回答を阻害要因として残していない。本番反映はこの時点の承認に含まれない。後日のcommit/push/Draft PRへの追加承認と表示改善は、冒頭の後続記録で分けて扱う。
