# 2026-10-07 公開前の依存更新

## 対象と現在の判断

PR #67の公開前監査で、重大1・高10・中2、計13パッケージの指摘を検出した。ユーザーは必要なセキュリティ更新と再検証を承認した。その後「監査を維持し、本番公開は保留」を選択した。期限付き例外は不採用。現行workflowと重大度の閾値を維持し、mainへマージしない。

実際に変更する範囲はpackage.json / package-lock.jsonとこの記録、参照する開発手順・検証ガイド・構成説明。UI・アレルゲンの意味、DB schema/migration、認可、公開URLは変更しない。

## 更新した依存

| 依存 | 更新前 | 更新後 | 目的 |
| --- | --- | --- | --- |
| next / @next/env / eslint-config-next | 16.3.4 | 16.3.6 | Next.jsの修正版へ揃える |
| sharp | 0.35.4 | 0.35.5 | librsvgの修正版を含む配布物へ更新 |
| source-map-js | 1.2.1 | 1.2.2 | source mapによるDoSの修正 |
| brace-expansion（ESLint側） | 1.1.18 / 5.0.9 | 1.1.21 / 5.0.12 | 対応するmajor内の修正版へ更新 |
| npm（ローカル検証CLI） | 11.19.1（宣言 ^11.18.0） | 11.21.0（宣言 ^11.21.0） | 調査目的のCLI更新として保持。今回の脆弱性を修正した更新ではなく、同梱依存は未解消 |

npm audit fix --forceは使用しない。通常のnpm更新で置き換わらないnpm同梱依存は、tarballの実バージョンまで確認した。npm 12.2.0もbrace-expansion 5.0.9 / http-cache-semantics 4.2.0 / undici 6.28.0 / ip-address 10.5.0 / postcss-selector-parser 7.1.4を同梱し、major更新は解決にならないため採用しない。

## 更新後の残存指摘

2026-10-07のnpm audit --ignore-scripts --jsonは終了コード1、重大0・高8・中2、計10パッケージ。これは10種類の独立した脆弱性を意味せず、braces由来の上位パッケージ5件とnpm同梱パッケージ5件を含む。通信失敗ではない。

- braces 3.0.3: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)。深く入れ子にしたパターンによるstack exhaustion。修正版なし。ESLintのdev依存経路であり、アプリの入力処理から呼ぶ実装は検索で見つかっていない。利用していないことや攻撃不能を形式的に保証する結果ではない。
- npm同梱のbrace-expansion / http-cache-semantics / undici / ip-address / postcss-selector-parser。npmは現状dependenciesにあるためprod分類。呼び出しはscripts/agent-harness.mjsとscripts/browser-runner.mjsの検証CLIで、アプリの実行時コードからのimportは検索で見つかっていない。開発用という説明だけでprod監査を除外しない。

修正版がある個々のnpm同梱ライブラリへroot overridesを付けるだけでは、npmの配布物内のbundled dependenciesを解消した証拠にならない。未検証のoverrideは採用しない。

## 公開保留の決定

2026-10-07、ユーザーは現行監査の維持と本番公開保留を明示した。修正版のある依存更新をDraft PR #67へ載せる。mainへのマージ・本番配備・監査例外は実施しない。残存するFAILをPASSや脆弱性0件へ読み替えない。

期限付き例外は提案したが不採用。再検討する場合は、アプリ実行時の非到達だけでなくnpmのregistry通信とlintが処理するPR入力の経路を評価し、期限到来時と公開直前の再判定・責任者・復旧方針を具体化して別途承認を得る。週次workflowだけでは期限到来時に既存の成功結果が自動失敗へ変わるものではない。

## 検証結果

パッチ更新HEAD b5aac63で `node scripts/agent-harness.mjs verify --base origin/main --output release-security-patches.json` を実行。Prisma generate/validate、lint、typecheck、全162件のtest（fail/skip 0）、build、diff checkがPASS。candidate before/after一致、publicationSafe:true。ローカルNode22.15.1は指定22.23.1と異なる。隔離した到達不能loopback DBと非実在Clerkキーによるbuildであり、実DBや実認証の成功とは区別する。

独立した読取専用reviewで、新規の重大な回帰は未検出。npm更新の脆弱性改善根拠がないP3は上表で明記し、現行Next.jsバージョン表記のP3は16.3.6へ修正。最終の文書修正で実行コード・lockは変えていない。

依存更新後のブラウザ回帰とPR CIは結果確認後に追記する。PRの旧HEAD f06d43fでは通常CI（実PostgreSQL・公開ブラウザ含む）が成功したが、新しい依存の成功とは区別する。

## 原典

- [Next.js advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)
- [sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)
- [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
- [npm audit](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-audit.md)
- [npm overrides / bundleDependencies](https://github.com/npm/cli/blob/latest/docs/lib/content/configuring-npm/package-json.md)
