# 専用 staging dry-run のローカル検証（2026-11-06）

[未有効の運用手順](../guide/staging-dry-run.md) · [開発手順](../guide/development.md#staging-dry-run)

## 対象と境界

継続作業の基準は main `7ac9a96cfbddfe801b48aa195cc59c520aa19658`（#128/#129 統合後）。ローカル検証時点では branch `chore/staging-dry-run-main-20261106` の同 SHA の HEAD に、未コミットの dry-run 差分を適用していました。作業場所は `C:\Users\kaito\AppData\Local\Temp\clearallergy-staging-dry-run-main-20261106`。先行作業の branch/worktree/patch と canonical checkout の既存変更は保持しました。

CI 成功 commit・workflow・環境・専用 project/team・固定 alias の一致をローカル JSON で評価します。戻り値は常に `deploymentAllowed=false`。実証拠の collector、排他/TOCTOU 対策、配備/alias 更新、実行 workflow は未実装/未有効です。このローカル検証では実際の GitHub/Vercel 設定、DB、Clerk、Blob を変更せず、commit/push/PR/merge/deploy/secret 作成/権限変更も行いませんでした。後続の commit・PR・CI の状態は、対象 SHA と GitHub の記録を別途照合してください。

## 前回の build 失敗の切り分け

前回は基準 SHA `51adcb23945b80bb34b110d2d0f263d29629a821`、Node 22.15.1/npm 10.9.2 で、sandbox 内では Google Fonts の取得失敗、host では Turbopack の CSS 用子プロセスが接続前に exit 0 で終了し、build は exit 1 でした。この結果を今回の PASS へ読み替えません。

今回、準備済み依存の `.bin/next.cmd` と `.bin/prisma.cmd` が `C:\Program Files\nodejs\node.EXE`（22.15.1）を絶対参照していることを確認しました。PATH の変更だけではこれらの起動先は切り替わりません。次の条件で再検証しました。

- [公式 Node 22.23.4 配布](https://nodejs.org/en/download/archive/v22.23.4)を Temp 内へ展開。zip の SHA256 は公式 `SHASUMS256.txt` と一致：`cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20`。署名検証を実施したという意味ではありません。
- Node は `C:\Users\kaito\AppData\Local\Temp\clearallergy-node-22.23.4\node-v22.23.4-win-x64\node.exe`。親と `process.execPath` で起動する子の両方が v22.23.4 と確認。
- 依存は先行 worktree から独立コピー。install/更新なし。lockfile は前回基準から不変。共有依存への junction は使用せず、Client 生成もこのコピー内だけ。
- コピー先の無視対象 `.bin` に限り、next/prisma の旧 Node 絶対参照を PATH の `node` に変更し、不足する eslint/tsc の起動ファイルを同じ方式で用意。Git 管理下の scripts/依存定義/設定は変更しない。
- 既存 npm CLI `C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`（10.9.2）を上記 Node で明示起動。npm の追加導入は行わない。指定 Node と一致するが、CI の npm 11.18.0 との一致は未確認。portable 配布付属の npm は10.9.9で、今回の検証には使用していない。
- 通常の Windows host、通常 Temp 領域、架空 Clerk 値、DB は未接続の loopback port 9。環境ファイルはコピーしない。Google Fonts は読み取りで取得。migration/seed/実 DB 接続は実行しない。

この条件では **既定 Turbopack の通常 build が exit 0**。Prisma Client 6.19.3 生成、Next 16.4.1 のコンパイル、TypeScript、ページ生成まで成功しました。Webpack への切替や Next 設定の変更は不要でした。Tailwind の `MODULE_TYPELESS_PACKAGE_JSON` 警告は残りますが、無関係な package.json 変更は加えていません。

旧 Node を指す起動経路の不一致は確認済みの事実です。不一致の解消後に worker エラーは再現していません。ただし同時に main も更新しているため、Node 単独が唯一の原因とする因果確定ではありません。少なくとも CSS、PostCSS/Tailwind 設定、lockfile、指定 Node 版は前回基準から不変で、dry-run のためにアプリの CSS 処理を変更する必要はありませんでした。

## 今回の実行結果

コマンドは上記 Node で既存 npm CLI を起動した同等の npm scripts 実行です。ログは `C:\Users\kaito\AppData\Local\Temp\clearallergy-staging-main-<項目>.log` に保存しました。

| 項目 | 実行 | 結果 |
| --- | --- | --- |
| 全体テスト | `npm test` | PASS、380 tests / 380 pass / 0 fail / 0 skip。追加 dry-run 51件を含む |
| lint | `npm run lint` | PASS、exit 0、指摘なし |
| 型検査 | `npm run typecheck` | PASS、exit 0 |
| 通常 build | `npm run build` | PASS、exit 0。prebuild の Prisma Client 生成を含む |

`git diff --check` は PASS。実装履歴を共有しない読取専用 reviewer はコード・文書・各ログを照合し、重大所見なし。reviewer 自身も Node 22.23.4 で追加 dry-run テストを実行し、51/51 PASS・skip 0 を確認しました。全体380件と build/lint/型検査は実装担当の実行結果です。

## 残る境界

ローカル検証後の Draft PR 準備では、`vercel.json` に `chore/staging-dry-run-main-20261106: false` の完全一致ルール1行を追加しました。未指定 branch の既定値は true であり、設定なしの初回 push が不要な配備を誘発し得るためです。既存ルール・main/develop/test/staging は不変で、外部 Vercel project 設定や credential を変更するものではありません。push 前に JSON 差分と minimatch による一致を確認し、ローカルの抑止条件と実サービス上の抑止観測は区別します。

この結果はローカル実装・テスト・build の検証です。GitHub 上でこの差分の CI を実行した結果、CI と同一 npm/Linux 環境、実認証、ブラウザー、実 DB、staging 配備/固定 URL 切替の成功は **UNVERIFIED**。UI・schema を変更しておらず、外部書込は禁止されているため、それらの回帰は今回実行しません。

現行 CI は `test/staging` push を対象にせず、Vercel の自動配備抑止も全 branch に適用されていません。有効化前に必要な承認・環境分離・collector・直列化・書込直前/直後の照合は[運用手順](../guide/staging-dry-run.md#自動化を有効化する前の別作業)を参照してください。

Next の仕様は Context7 `/vercel/next.js` と実際の Next 16.4.1 CLI を照合しました。[公式の Next 16 移行説明](https://nextjs.org/docs/app/guides/upgrading/version-16)には `--webpack` の選択肢もありますが、今回は通常 build が通ったため比較用 build は実行していません。
