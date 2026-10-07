# 2026-10-07 公開前の依存更新

## 対象と現在の判断

PR #67の公開前監査で、重大1・高10・中2、計13パッケージの指摘を検出した。ユーザーは必要なセキュリティ更新と再検証を承認した。監査の例外・重大度の閾値変更・mainへの未検証反映は承認されていない。現時点では公開を保留する。

実際に変更する範囲はpackage.json / package-lock.jsonとこの記録、参照する開発手順・検証ガイド。UI・アレルゲンの意味、DB schema/migration、認可、公開URLは変更しない。

## 更新した依存

| 依存 | 更新前 | 更新後 | 目的 |
| --- | --- | --- | --- |
| next / @next/env / eslint-config-next | 16.3.4 | 16.3.6 | Next.jsの修正版へ揃える |
| sharp | 0.35.4 | 0.35.5 | librsvgの修正版を含む配布物へ更新 |
| source-map-js | 1.2.1 | 1.2.2 | source mapによるDoSの修正 |
| brace-expansion（ESLint側） | 1.1.18 / 5.0.9 | 1.1.21 / 5.0.12 | 対応するmajor内の修正版へ更新 |
| npm（ローカル検証CLI） | 11.19.1（宣言 ^11.18.0） | 11.21.0（宣言 ^11.21.0） | 同一majorの最新配布を調査。下記の同梱依存は未解消 |

npm audit fix --forceは使用しない。通常のnpm更新で置き換わらないnpm同梱依存は、tarballの実バージョンまで確認した。npm 12.2.0もbrace-expansion 5.0.9 / http-cache-semantics 4.2.0 / undici 6.28.0 / ip-address 10.5.0 / postcss-selector-parser 7.1.4を同梱し、major更新は解決にならないため採用しない。

## 更新後の残存指摘

2026-10-07のnpm audit --ignore-scripts --jsonは終了コード1、重大0・高8・中2、計10パッケージ。これは10種類の独立した脆弱性を意味せず、braces由来の上位パッケージ5件とnpm同梱パッケージ5件を含む。通信失敗ではない。

- braces 3.0.3: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)。深く入れ子にしたパターンによるstack exhaustion。修正版なし。ESLintのdev依存経路であり、アプリの入力処理から呼ぶ実装は検索で見つかっていない。利用していないことや攻撃不能を形式的に保証する結果ではない。
- npm同梱のbrace-expansion / http-cache-semantics / undici / ip-address / postcss-selector-parser。npmは現状dependenciesにあるためprod分類。呼び出しはscripts/agent-harness.mjsとscripts/browser-runner.mjsの検証CLIで、アプリの実行時コードからのimportは検索で見つかっていない。開発用という説明だけでprod監査を除外しない。

修正版がある個々のnpm同梱ライブラリへroot overridesを付けるだけでは、npmの配布物内のbundled dependenciesを解消した証拠にならない。未検証のoverrideは採用しない。

## 未承認の対応案

1. **公開保留（現行方針）**: 修正版のある依存更新をPRへ載せ、現行監査を維持。未修正版依存の上流対応を待つ。監査のFAILをPASSへ読み替えない。
2. **期限付き例外で公開**: 以下の限定条件をユーザーが承認した場合だけ、専用の監査判定を追加する。現在は提案であり、workflowへ適用していない。
   - 期限は2026-10-14 00:00 UTC。期限切れで自動的に失敗させる。
   - bracesは3.0.3かつdev:trueのnode_modules/bracesのみ。npm同梱はnpm 11.21.0の該当5パッケージの既知のパス・バージョン・advisory IDだけ。
   - audit JSONのすべての直接advisoryと上位依存の到達先を照合し、未知の指摘、別パス、バージョン変更、prodへのbraces混入、通信/JSON解析失敗は失敗のままにする。重大・高の閾値を下げたりdev全体を除外したりしない。
   - 原報告の重大度・件数と例外件数を出力し、脆弱性0件とは報告しない。毎週・依存変更PRの監査を維持する。
   - Next.js production buildのtraceとコード参照を調べ、例外依存のアプリ実行時利用が見つかった場合は例外対象にしない。build・CI・ブラウザ回帰の成功は、この脆弱性を修正した証拠とはしない。
   - runtime用依存からnpmを除く・検証CLIを隔離する変更は別案であり、この例外だけで実装済みとしない。

承認を待つ間もパッチ更新のlint・型・単体テスト・buildと独立reviewを実施する。CIや本番配備の成功は、更新前の結果を流用しない。

## 検証結果

パッチ更新後のハーネス・ブラウザ回帰・独立reviewは実行結果が出てから追記する。現時点ではUNVERIFIED。PRの旧HEAD f06d43fでは通常CI（実PostgreSQL・公開ブラウザ含む）が成功したが、新しい依存の成功とは区別する。

## 原典

- [Next.js advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)
- [sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)
- [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
- [npm audit](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-audit.md)
- [npm overrides / bundleDependencies](https://github.com/npm/cli/blob/latest/docs/lib/content/configuring-npm/package-json.md)
