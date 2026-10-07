# 2026-10-07 公開前の依存対処

## 対象と公開の判断

PR #67の監査で重大1・高10・中2、計13パッケージを検出した。必要な更新の承認後、ユーザーは「監査を維持し、本番公開は保留」を選択し、続いて「本番公開に向けて対処して」と依頼した。残存依存の除去と再検証を進める。期限付き例外は不採用。開発依存を含む監査と重大度の閾値を維持する。

変更範囲は依存・lock、検証用npmの解決、Next lintの限定ルート検索互換層、インストール設定とDocker、回帰テスト、関連手順。UI・安全性の意味、DB schema/migration、認可、公開URL・クラウド設定は今回変更しない。本番公開保留の解除・mainへのマージと、依存対処の検証を区別する。

## 対処した依存

| 依存 | 更新前 | 対処後 | 目的 |
| --- | --- | --- | --- |
| next / @next/env / eslint-config-next | 16.3.4 | 16.3.6 | 修正版へ揃える |
| sharp | 0.35.4 | 0.35.5 | librsvg修正版を含む配布物 |
| source-map-js | 1.2.1 | 1.2.2 | DoSの修正 |
| brace-expansion（ESLint側） | 1.1.18 / 5.0.9 | 1.1.21 / 5.0.12 | 対応major内の修正版 |
| npm（検証CLI） | 11.19.1 → 調査時11.21.0 | アプリ依存から除去 | 未修正のCLI同梱依存をアプリから除去 |
| fast-glob → braces（Next lint） | fast-glob 3.3.3 / braces 3.0.3 | ローカル互換層 + tinyglobby 0.2.17 | 未修正bracesへの依存経路を除去 |

npm audit fix --force、監査例外、dev依存の除外、lintルールの削除は採用しない。

## npmの実行環境と監査範囲

アプリ内npmの用途はscripts/agent-harness.mjsとscripts/browser-runner.mjsのCLI呼出しだった。scripts/npm-cli.mjsがnpm lifecycleの絶対パス、Node配布のWindows/Unix標準位置などを調べ、package名・version・実CLIパスを検証する。既存Nodeから引数配列で起動し、npm runのpre/post hooksを保持する。未発見なら停止し、暗黙の導入やshell文字列へのフォールバックをしない。ハーネスは実npm版を記録する。

アプリのlock全体に対するauditは維持する。ホストのglobal npm、OS、別prefixのPlaywright/Chromiumを監査・修正した証拠ではない。CI/Dockerのglobal npm 11.18.0という既存設定は維持する。CLIは実行環境として別途管理が必要である。

## Next lintの限定互換層

固定版@next/eslint-plugin-next@16.3.6のfast-glob利用はgetRootDirsのglobSync(pattern, { onlyDirectories: true })に限られる。scripts/next-root-globは既存tinyglobby 0.2.17でこのAPIだけを提供する。上流fast-glob全体の代替ではない。private識別版3.3.3-clearallergy.1は上流の修正版という意味ではない。

ディレクトリ自動展開を止め、絶対・相対パスと末尾slashを補正する。rootDirの文字列・配列、wildcard、選択brace、除外、未一致を回帰確認する。独立reviewで数値range braceの解釈差を検出したため、範囲braceは明示FAILにし、列挙した配列・選択braceを案内する。長さ65,536・入れ子128で深い入力を再帰matcherより前に拒否する。Nextの内部リンクlintは無効化しない。

rootのdevDependencyでローカルpackageを指定し、固定版Next pluginのoverrideはその直接依存を参照する。`.npmrc` の `install-links=true` をinstall/ciで共通化し、lockは `file:scripts/next-root-glob` の通常packageとして記録する（link:trueなし）。Dockerはnpm ciより前に設定とローカルpackageをCOPYする。開発担当者が保守し、Next/plugin更新時は利用API・解決先・rootDir・内部リンク検知・clean install・全依存auditを再確認する。

## 現在の検証

追加回帰6件はPASS。実Next pluginの互換層利用、rootDir検索、Appのルート / とPagesの内部リンク検知、外部リンク許可、深い入力拒否、Windows/UnixとlifecycleのCLI解決を確認した。公開メニュー詳細のESLint設定113ルールの内容・重大度が変更前と一致した。Next上流のApp子ルート検知の範囲を拡張した検証ではない。

独立レビューの再確認では前P2を解消、新規P0〜P3なし。変更後のnpm解決で隔離Playwright 1.61.0・Chromiumの導入も成功した。

未commit候補（base 2309d0b）で `node scripts/agent-harness.mjs verify --base origin/main --output release-remediation-candidate-v2.json` を実行。Prisma generate/validate、lint、typecheck、全168件test（fail/skip/cancelled 0）、build、diff checkがPASS。candidate before/after一致。ローカルNode22.15.1/npm10.9.2で、指定Node22.23.1との差は残る。非実在Clerkと到達不能loopback DBの隔離環境であり、実認証・実DBを確認した結果ではない。

`docker build --load --tag clearallergy-release-check:remediation --progress=plain .` はPASS。実LinuxのNode22.23.1/npm11.18.0でnpm ci、Prisma生成を確認し、同じイメージで通信を遮断した追加回帰6/6と実npm CLI解決がPASS。Dockerfileは開発用イメージの構築であり、アプリの本番起動や配備の成功を示さない。

最終lockの `npm audit --ignore-scripts --json` はexit 0、重大・高・中・低・infoすべて0。dev依存を含む。最終lock hashは `dceea19762ab37e193648390e40ec92d3d52f37c155db1bbfcf1199dfbb5ca48`。関連文書・対応表・AGENTS.mdを更新し、相対リンク573件の参照先欠損0、diff check PASS。検証後の追記は文書のみで、コードとlockは変更していない。

初回のcommit操作は自動承認reviewで拒否された。その後、ユーザーが「commit・pushしてPR更新を承認」と明示したため、Draft PR #67へ反映し、最新HEADのGitHub CI・依存監査・Previewを確認する。ローカル結果と最新PRのcheckを区別して記録する。本番公開保留はこの承認で解除しておらず、mainは0e43038を維持する。実行前のCI・配備をPASSと扱わない。

## 最初のパッチ対処の記録

HEAD 2309d0bまで、監査は高8・中2、計10パッケージでFAILだった。braces由来の上位5件とnpm同梱5件を含み、独立した脆弱性10種類ではない。braces 3.0.3の[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)に修正版がなく、npm 12.2.0も古い同梱依存を持つことをtarballで確認した。単純なmajor更新やbundled依存への未検証overrideは不採用。

当時の隔離ハーネスはPrisma generate/validate、lint、typecheck、162件test（fail/skip 0）、build、diff checkがPASS。部品ブラウザ回帰は写真24群・QR10群PASS。2309d0bの通常CIは実PostgreSQL回帰と公開Chromium8群を含め成功したが、監査FAILの代わりにはしなかった。

実Clerk・Blobの管理保存、実機タッチ、紙印刷／カメラ読取、理解度はUNVERIFIED。過去と今回の検証runner・依存変更後の結果を区別する。

## 原典

- [Next.js advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)
- [sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)
- [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
- [npm audit](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-audit.md)
- [npm overrides / bundleDependencies](https://github.com/npm/cli/blob/latest/docs/lib/content/configuring-npm/package-json.md)
- [npm ci / install-links](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-ci.md)
