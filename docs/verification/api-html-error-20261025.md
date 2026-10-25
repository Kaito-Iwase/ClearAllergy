# PR #101：現mainへのHTML障害応答修復の最小適用

2026-10-25 JST。基点mainは `0b6ed291b2fd853230c7efdeeb1e061815404a81`、確認したPR #101のHEADは `4b4b16985654a3a71386843d4353c6dc8b3f9ab0`。ローカルbranch `codex/pr101-main-local-20261025` の候補を検証した記録です。対象はこの記録と同じコミットのhelper・回帰テストです。PR更新・push・merge・deployは行っていません。

## 問題と適用範囲

mainの `getApiErrorMessage` は、大文字小文字を区別した `<!DOCTYPE` / `<html` の先頭一致だけでHTMLを除外していました。`text/html` の502応答に `<HTML><BODY>proxy-error-marker</BODY></HTML>` を与えると、管理画面のエラー欄へ本文が表示されることを単体・実React部品の隔離ブラウザで再現しました。本番の発生頻度、XSS成立、実情報の漏えいを実証したものではありません。

PR #101のhelper修正をそのまま適用し、HTML/XHTMLのmedia type、大小文字を問わないHTML風の先頭タグ・doctype・コメントでは呼出元の既存fallbackを返します。JSONの `error` / `message` は従来どおり採用し、JSON内の文字列自体を新しくHTML除去する処理は加えません。通常テキスト、空本文、不正JSON、読取失敗も確認しました。

呼出元はメニュー編集・新規・一覧、画像アップロード、保存済み内容の読取です。呼出元の文言、保存結果不明の扱い、入力保持、競合、公開条件、食品安全文言、認可、DB schemaは変更していません。

PR全体のmergeは `vercel.json` と `docs/verification/review-branch-deployment-guard-20261024.md` でadd/add競合します。この候補では両ファイルを現mainのまま保持しました。依存ファイル・過去の検証文書も戻していません。PRに含まれた名前・価格の追加ブラウザケースは今回のHTML修復と独立した追加分のため移していません。既存ケースは削除していません。

## 環境・コマンド・結果

既存の隔離Linuxクラウド環境、Node.js 22.23.4 / npm 11.18.0 / Prisma 6.19.3 / Next.js 16.4.1。新規依存・実資格情報・環境設定の保存/適用はありません。以下はリポジトリルートで実行しました。ビルドはセットアップ済みのCI架空認証・専用localhost DBのプロセス設定を使用し、DBの更新・migrationは実行していません。

| 検証 | 結果 |
| --- | --- |
| 修正前 `node --import tsx --test tests/api-error-message.test.ts` | 4件中1成功・3失敗。HTML本文とfallback期待値の差を確認 |
| 修正前 `node scripts/browser-runner.mjs publication` | 12群中11成功・HTML障害ケース1失敗。実Reactエラー欄へのHTML本文表示を確認 |
| 修正後の追加単体 | 4/4成功。XHTML、不正JSON、JSON文字列内のタグ表記も確認 |
| `npm run lint` / `npm run typecheck` | ともに終了コード0 |
| `npm test` | 256成功、失敗・skip・cancelledは0 |
| `npm run build`（prebuild含む） | Prisma generateと標準Turbopack build成功。既存tailwind.config.tsのmodule-type警告あり |
| 修正後の隔離ブラウザ | 12/12群成功。クライアント例外・外部要求はともに0 |
| `git diff --check` | 成功 |

ブラウザは既存の隔離Playwright 1.61.0とシステムChromium 154.0.8037.57を使用しました。`CLEARALLERGY_BROWSER_RUNNER_DIR` / `BROWSER_EXECUTABLE` / `CLEARALLERGY_BROWSER_OUTPUT` でセットアップ済みツールと記録先を指定し、承認された実行基盤の制限外実行で起動しました。リポジトリのテストやsandbox設定を変更して成功させたものではありません。

このfixtureは現在の実React部品・生成CSSを読み、すべての画面/API要求を架空応答に置き換えます。保存・公開失敗時の操作案内と入力保持、書込試行数、保存成功扱いにしないことを確認しました。既存の保存済み版・二重送信・409/400/401/403・GET不一致/失敗・未設定・MAY_CONTAIN・新規POST後の再取得/修正、320/390/768/1536pxとキーボードの回帰も成功しています。通常Nextサーバー・実認証・実DBとの結合試験ではありません。

## レビュー・文書・未確認

既存記録とAGENTSの最大3回規則を確認しました。引継ぎではPR #101の独立レビューは2回実施済みです。今回の最終候補に対する独立レビューは残り1回以内とし、担当変更による回数リセットや #105 の追加レビューは行いません。

GitのHTTPS読み取りでmain/PR HEADを更新しましたが、`gh pr view 101` のGraphQL要求は403で拒否されました。最新のPR本文・コメント・レビュー履歴は取得できていません。別資格情報・別経路で回避せず、引継ぎの回数とGitから確認した対象を区別します。独立レビューの結果と最終SHAは別途作業報告へ保存します。

更新文書はこの記録、verification入口、change-mapの回帰テスト参照です。README、productの保存結果案内、rulesの食品/公開/権限、architectureの責務、developmentのコマンド、AGENTSの作業規則は変更がないため確認のみです。

新たな実DB検証は不要と判断しました。変更は取得済みHTTP応答から表示文言を選ぶ共通helperだけで、DBクエリ・書込・transaction・schema・認可には変更がないためです。セットアップ時の実DB検証結果を、この差分の新規実行結果として数えていません。

実Clerk/Blob・管理セッション・本番/Preview・スクリーンリーダー・実機操作は未検証です。GitHub CI・PR更新・mainへの統合は未実施です。再適用はこのローカル候補の差分だけを対象にし、現mainのデプロイ抑止設定を保持します。DB移行や設定変更は不要です。
