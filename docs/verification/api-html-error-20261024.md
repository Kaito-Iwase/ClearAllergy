# 管理操作のHTML障害応答の修復と確認

2026-10-24、基点main `27a119672b7c0c27e743e152749c81a3176dae8c`。専用branch `fix/issue-triage-20261024` の未コミット候補を検証した記録です。外部push・PR作成・merge・deployは行っていません。

## 再現・原因・変更

`lib/utils/api-error-message.ts` は、大文字小文字を区別した `<!DOCTYPE` / `<html` の先頭一致だけでHTMLを除外していました。`text/html` の502応答に `<HTML><BODY>Bad gateway</BODY></HTML>` を与えると、呼出元の操作案内よりHTML本文を返すことを単体テストで再現しました。小文字doctype・HTML断片・コメント・header欠落にも代表的な反例があります。本番での発生頻度・実応答の再現は未確認で、XSS成立や情報漏えいを実証した記録ではありません。

明示HTMLのmedia type（大小文字・charsetを正規化）とHTML風の先頭構文を検知し、既存fallbackを返します。JSONの`error`/`message`、通常テキスト、空本文・読取失敗の処理を保持します。HTMLから案内を抽出/描画する処理は追加しません。

呼出元はメニュー編集/新規/一覧、画像アップロード、保存済み内容の読取です。保存結果不明・競合・保存済み/公開反映未確認、4状態の意味、公開条件、認証/所有権、API形、schema・依存を変更しません。PR [#95](https://github.com/Kaito-Iwase/ClearAllergy/pull/95)（単一店舗仕様の文書）・[#96](https://github.com/Kaito-Iwase/ClearAllergy/pull/96)（公開読取性能）の既存作業と重ねていません。

## 実行環境・結果

Windows KaitoLaptop、既存Node22.23.4/npm10.9.9、Prisma6.19.3。リポジトリのNode指定に一致し、CI/Dockerのnpm11.18.0とは異なります。同一lockfileの既存依存を専用worktreeへコピーし、元checkout・共有依存を変更せず検証しました。実環境ファイルは持ち込まず、ハーネス/単独コマンドとも継承変数を限定し、到達不能localhost DB・非実在Clerkキーで実行します。

| 検証 | 今回の結果 |
| --- | --- |
| 追加単体のfresh RED | 4群中pass1/fail3。HTML実値とfallback期待値の差で失敗 |
| 修復後の追加単体 | 4/4 PASS。独立担当も別に4/4を実行 |
| `node scripts/agent-harness.mjs verify --base origin/main --output triage-initial-gates.json` | Prisma generate/validate、lint、typecheck PASS。候補fingerprint不変・diff-check PASS。sandbox内の全testsは249/253、4失敗でbuildを実行せず停止 |
| sandboxの4失敗の切分け | 1件はhardlink作成のEPERM。3件はsandbox一時パスのbraceを含む既存root glob検証。今回のhelper差分と別領域。秘密値を除外した同じ全testsを通常ローカル権限で再実行し253/253 PASS、fail/skip/cancelled 0 |
| build（`npm run build -- --webpack`、prebuild含む） | 通常ローカル権限でPASS。sandboxでの初回は公開Google FontsのDNS取得失敗と生成先mkdirのEPERM。実DBへは接続せず、標準buildのwebpack指定で再実行。既存tailwind.config.tsのmodule-type警告は残る |
| 隔離Chromium（`node scripts/browser-runner.mjs publication`） | 13/13群PASS。空白名・負数価格の送信0、0円/未設定の区別、HTML保存/公開失敗、入力保持、連打、閉じる/Escape、409/400/401/403、GET不一致/不正/通信断、未設定1/3/全品目、MAY_CONTAIN・未解決、新規POST後の読取失敗・修正PUT、公開中価格変更、320/390/768/1536px・キーボード・長文を検査。pageerror/外部通信の記録はともに0 |

ハーネス全体の記録はFAILのまま保持し、後続の単独検証成功へ書き換えません。ローカルログはGit管理外の`.agent-runs/triage-initial-gates.json`、`all-tests.log`、`all-tests-local.log`、`build.log`、`build-local.log`、`browser.log`、`html-error-browser/saved-publication-browser-result.json`に保存します。ブラウザは実React部品とこのworktreeの生成CSSを使い、全通信を架空レスポンスへ置換したもので、通常Nextサーバー・実認証・実DBの結合試験ではありません。

## 独立レビュー・文書対応

実装履歴を渡さない読取専用担当がAGENTSと`find-bugs`の手順に従い、helper・ブラウザscript・新規単体テストの全文と呼出元を確認しました。修正必須の指摘なし。独立4/4・diff-check PASS。全体テスト・ブラウザの再実行を独立担当自身の結果とは扱いません。

更新はこの検証記録、guideのverification入口・change-mapです。productの保存結果案内、rulesの状態/公開/権限、architectureの処理責務、developmentのコマンド、README・AGENTSの作業規則は変わらないため、確認のみで更新不要です。

## 外部操作・未確認

新規Issue作成はGitHub連携が `403 Resource not accessible by integration` を返して拒否しました。Issue未作成、既存Issueのclose/コメント・push・PRも未実行です。元のIssue本文・コメントは変更していません。起票案と棚卸しはrepo外の作業フォルダに保持しています。

実DB制約/race、実Clerk/Blob、実管理セッション、戻る/進むの全保護、スクリーンリーダー、実機キーボード、本番動作・実食品・利用者理解は未検証です。架空レスポンスの成功をこれらの保証へ読み替えません。rollbackは今回のhelperと回帰検証差分のrevertで、DB移行はありません。
