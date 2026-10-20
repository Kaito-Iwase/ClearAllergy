# Next.js 依存脆弱性のローカル修正・検証（2026-10-19）

対象は `Kaito-Iwase/ClearAllergy` の main `b3613a1090605efca74fe80b5878deae61d9b26e`。新規 clone 時の origin/main と一致した。作業ブランチは `fix/next-security-20261019`。本記録はローカル検証完了時点の結果であり、その時点では HEAD は同 SHA のまま、修正は未コミットだった。後続の commit・PR・CI の結果は PR に記録する。

独立 checkout は `C:\Users\kaito\Documents\Codex\2026-10-19\task-3\clearallergy-next-security`。別タスクの `task-2\clearallergy-store-review` と Git ディレクトリ・依存・生成物を共有せず、そちらのファイルを変更していない。ローカル検証段階では commit、push、PR 投稿、merge、deploy、本番操作、認証設定変更は実施していない。後続で今回の 7 ファイルの commit・通常 push・main 向け Draft PR 作成が明示承認された。merge、auto-merge、本番反映、設定変更は承認対象外である。

## 変更内容と根拠

| 対象 | 変更前 | 変更後 |
| --- | --- | --- |
| `next` / `@next/env` / `eslint-config-next` | 16.3.6 | 16.3.8（完全固定） |
| lockfile の `@next/eslint-plugin-next` と各 OS 向け SWC 8 エントリ | 16.3.6 | 16.3.8 |
| fast-glob override の対象 plugin | `@next/eslint-plugin-next@16.3.6` | `@next/eslint-plugin-next@16.3.8` |
| ローカル fast-glob adapter | 3.3.3-clearallergy.1 | 同版を維持 |

[失敗した既存監査](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/39227846983/job/117978414307)を確認し、今回の変更前 lockfile でも Next に対する 6 advisory を再取得した。各 range の上限は `<16.3.8`。[公式 v16.3.8 リリース](https://github.com/vercel/next.js/releases/tag/v16.3.8)と照合して最小の修正版を選んだ。リリースに列挙された全 advisory と、この lockfile に該当する 6 件は同じ集合とは限らない。

今回の監査で該当した ID は GHSA-3w37-wq28-93x7、GHSA-4jqv-mc3x-m676、GHSA-39w2-rjm5-chcv、GHSA-f87g-xv8r-7p7x、GHSA-mcj8-r9mp-w47p、GHSA-cjq9-62q9-8jv4。npm の `fixAvailable` は 16.4.2 を提示したが、上記 affected range と修正リリースを根拠に 16.3.8 を明示した。`npm audit fix --force` は使っていない。

`package.json` を最小編集し、既存 npm の `install --package-lock-only` で lockfile を生成した。lockfile の 538 package エントリ（root を含む）を比較し、上記 Next 関連と root の指定以外は不変。React、Clerk、Prisma、postcss 等の版は変更していない。

インストール済み plugin 16.3.8 の fast-glob 利用は `dist/utils/get-root-dirs.js` の `globSync(pattern, { onlyDirectories: true })` だけであることを検索確認した。実 plugin から解決される fast-glob はローカル adapter 3.3.3-clearallergy.1。rootDir の文字列・配列・既定値、絶対パス、内部リンク検知、外部リンク許可、入力上限の既存回帰を実行した。ESLint のルール設定は変更していない。

## 実行環境・手順

実 Node は 22.15.1、npm は 10.9.2、Windows。文書基準 Node 22.23.1 / CI npm 11.18.0 とは異なる。runtime をアプリ依存へ追加していない。`AGENTS.md`、開発手順・変更対応表・文書保守手順を読み、ユーザーホームの `.agents/skills/context7-mcp/SKILL.md` に従って Context7 の公式 Next.js 資料も照合した。リポジトリ内・canonical checkout 内の `.agents/skills` は存在しなかった。

実 DB URL・Clerk secret・Blob token を引き継いでおらず、checkout に `.env` / `.env.local` はない。build だけ、既存 CI と同じ非実在の Clerk キーをプロセス環境へ渡した。永続ファイル・認証設定は変更していない。Google Fonts の実取得を含む通常の `npm.cmd run build` を実行し、prebuild の Prisma Client 生成を省略していない。

ローカルの生ログ・監査 JSON・再実行用 smoke script・ブラウザ画像は、リポジトリ外のタスク成果物 `C:\Users\kaito\Documents\Codex\2026-10-19\task-3\evidence` に保存した。このパスは今回のローカル証拠であり、リポジトリの必須実行手順にはしない。

## 今回の結果

| コマンド・確認 | 結果 |
| --- | --- |
| `npm.cmd install --package-lock-only --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=30000` | PASS、exit 0 |
| `npm.cmd ci --no-audit --no-fund --fetch-retries=0 --fetch-timeout=30000` | PASS、exit 0、独立環境へ 427 packages を新規配置 |
| 変更前 `npm.cmd audit --ignore-scripts --json --fetch-retries=0 --fetch-timeout=30000` | exit 1、Next 1 package に 6 advisory。package 集計 high 1、他 0、依存総数 537 |
| 同じ完全監査の変更後実行 | PASS、exit 0、info / low / moderate / high / critical 全て 0、依存総数 537。dev を含み、`--omit`・重大度フィルタなし |
| `npx.cmd prisma generate` | PASS、exit 0、Client 6.19.3 を今回の checkout に生成 |
| `node --import tsx --test tests/next-root-glob.test.ts tests/npm-cli.test.ts` | PASS、exit 0、6/6、skip 0 |
| `npm.cmd run lint` | PASS、exit 0、警告・エラー出力なし |
| `npm.cmd test` | PASS、exit 0、203/203、fail / skip / cancelled 0 |
| `npm.cmd run typecheck` | PASS、exit 0 |
| `npm.cmd run build` | PASS、exit 0、Next 16.3.8 Turbopack、compile・TypeScript・26/26 静的生成・route 出力まで完走 |
| `npm.cmd ls next @next/env eslint-config-next @next/eslint-plugin-next fast-glob --all` | PASS、exit 0、Next 関連版・adapter 実体の整合を確認 |
| `node --import tsx ..\evidence\image-smoke.cjs` | PASS、exit 0、6 groups。実 next.config の許可 HTTPS / ローカル画像受入、別 host / HTTP / query / loopback 拒否、Next optimizeImage の JPEG・PNG・WebP・AVIF 64×32 出力、private IP 拒否時の HTTP 到達 0 件 |
| `node scripts/browser-runner.mjs composition` | PASS、exit 0、24 groups。店舗/メニュー、contain/cover、50/100/150/250%、実画素の移動方向、両プレビュー、端、元画像比較、keyboard/wheel、390px touch/pinch。既存の隔離 Playwright 1.61.0 と今回の build CSS を使用 |
| `git diff --check` | PASS、exit 0 |

初回の制限環境では、npm DNS 取得と Prisma engine 取得が失敗した。権限レビューの初回監査要求は期限切れでプロセス未開始。対象を限定したローカル実行で取得・監査・生成が成功し、未解決のネットワーク block はない。

初回 adapter 回帰の 3 件は sandbox の一時パス `sandbox.{GUID}` を glob が brace と解釈して失敗した。タスク所有の brace を含まない TEMP/TMP を使った再実行は 6/6。最初の全 unit 実行は 202/203 で、残り 1 件はテスト用 hard link の作成が sandbox により EPERM となった。通常ローカル権限で同じ全テストを再実行し 203/203。テストを削除・skip・緩和せず、初回失敗ログも保持した。

## 独立レビュー・文書

実装履歴を共有しない読取専用 subagent に base/HEAD、diff、Invariant、検証結果を渡して独立レビューを依頼した。機能・設定の指摘はなく、`docs/guide/architecture.md` の現行 Next 版表記が古いという P3 指摘を修正した。最終差分と監査 JSON・各検証ログ・画像 5 枚との整合を独立再レビューし、P3 解消・残る指摘なしを確認した。

変更ファイルは `package.json`、`package-lock.json`、`scripts/next-root-glob/index.cjs`（対象版コメント）、`docs/guide/development.md`（対象 plugin 版）、`docs/guide/architecture.md`（現行版）、本記録と `docs/guide/verification.md`（記録入口）。`AGENTS.md` は規則・コマンド・参照先の変更がなく更新不要。変更対応表は既存の起動・依存／画像の入口が維持されるため更新不要。製品仕様・認証・DB・UX のコードは変更していない。

## 未確認・残リスク

- GitHub CI、指定の Node/npm 基準版での検証、Docker/Linux、全 SWC プラットフォームの実行は UNVERIFIED。Windows の実行結果と区別する。
- 実 DB 回帰、公開ルート全体のブラウザ回帰、実 Clerk 認証、Blob アップロード・保存・再読込は未実行。今回の画像試験は隔離 component と optimizer の smoke である。
- 本番配備版、侵害・悪用の有無、運用ログ、Vercel の設定は未確認。ローカル修正を本番反映済みとはしない。
- 監査 0 件は今回時点のアプリ lockfile の既知依存脆弱性に対する結果。Node/npm 本体・OS・隔離 Playwright、未公表問題、コード全体の安全性の証明ではない。
