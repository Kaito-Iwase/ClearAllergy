# PR #105 本体の現main適用と検証境界

2026-10-25。base `0b6ed291b2fd853230c7efdeeb1e061815404a81`、読み取ったPR #105 HEAD `e5664af8e4a490baa8e40500cfe799fd9b02a21d`。独立ローカルbranch `codex/pr105-main-local-20261025`。この記録を含むcommitを固定し、full検証・phase証跡pipelineの結果、最終SHA、patch/bundleをタスク成果へ保存します。本文は検証範囲の定義であり、未実行phaseの成功を表しません。

## 適用した範囲

元PRの `agent-harness.mjs`、`verification-evidence.mjs`、`run-public-phase.mjs` と既存追加テストを適用。AGENTS・agentic-development・change-mapは必要行だけ統合し、競合するdevelopmentは現在の末尾にP0説明を追加しました。現mainのsecurity依存/lock、vercel.jsonと配備抑止文書、schema/migration、食品仕様、認可、workflowは保持します。未公開のP1 workflowは取り込みません。

他候補 #95/#96/#101/#102 は別branchと証拠を保持し、この候補へ組み合わせません。#105は既に独立レビュー3回の上限という引継ぎのため、今回の作業は実装適用と機械検証のみです。新たな独立レビューは実施せず、**最終的な人間レビューが必要**です。GitHub GraphQL403により最新レビュー履歴自体は未取得です。

## 追加成果の取得障害

親から指定されたLibraryファイルは `libfile_69bd8f9d336081919b860a3b27f62bc3`（clearallergy-context-verification-20261024.zip）。この環境の公開ツールにはLibrary取得機能がなく、Sediment専用download_fileはlibfileを扱えません。元ローカルcommit `e7d4c79ff6986703d172340354ff23343c0b5821` と日本語候補 `f0e554ab5fc68f0998559fb64498868c5ca9e27b` もローカルGitにありません。

14ファイルのpatch・manifest・限定RED/GREEN、同tree `ba497e70e3fb8d708daaac73301d1c704af85bc6` という情報は引継ぎであり、実物と照合できていません。追加差分は未取得・未適用・未検証です。代替実装や別資格情報での取得回避はしていません。正規ツールまたは通常のファイル添付で実物を受領後、base・manifest・treeを照合する必要があります。

## 今回の機械的な反例

実#105の集約関数と、架空の小さなGit repository上の実CLIを使用しました。小repoのlint/typecheck/test/buildは固定の成功fixtureなので、ここでのPASSはアプリ検証成功を意味しません。実資格情報・DB・外部サービスは使っていません。

| 対象 | 観測と判定 |
| --- | --- |
| serverEvidence欠落・存在しない参照 | receiptの候補/build欄が一致すれば集約PASS。参照先検査は未実装 |
| server run/candidate/build/hashとの不一致 | 参照先を照合しないため検出できない。追加成果で直るかも未確認 |
| output hash欠落 | 集約PASS。hashの存在/真正性を別途保証する機能ではない |
| scope外・rename・untracked・protected area | 安定した変更としてfingerprintへ含まれ、verifyはPASS。許可planとの照合機能なし |
| verifyのsnapshot指定 | 存在しないsnapshot名でもverifyは読まない。queue/assessmentとverifyの接続は未実装 |
| receipt自体のcandidate/build不一致 | FAIL。明示requiredのphase不足はUNVERIFIED |
| 古いsnapshot/assessment | 既存queue単体の失効・定義/base変更拒否を確認。verifyへの接続を示す結果ではない |
| 秘密情報の診断出力 | 架空のtoken/接続文字列/個人名markerを含む失敗入力が固定分類/既知test位置のみになることを確認 |

機械probe全体は上記の未強制条件を検出してexit1です。このREDを修正済み/GREENとは扱いません。元PRの限定単体 `node --import tsx --test tests/agent-harness.test.ts tests/verification-evidence.test.ts` は25成功で、追加Library成果の「37件成功」という過去記録と混同しません。

## phase実行と未確認

通常gateとphase pipelineは固定候補の実scriptsで実行し、コマンド・実exit・JSON・必要なsidecarの照合結果をタスク成果に保存します。DB phaseは所有確認済みのローカル使い捨てPostgreSQL/架空認証だけ、browserはloopbackを使用。環境変数除去だけをOS隔離とは呼びません。Node子プロセスはこのクラウド実行環境のsandbox権限を引き継ぎ、harness自身が専用OS隔離を作るものではありません。DBのDocker隔離とNodeの制限は区別します。

Prisma/Fontsは同じ通常経路で後続成功した事実と、許可反映の主体/時刻未確認を区別。今回の設定適用・別経路・TLS/checksum無効化はありません。GitHub CI、P1接続、追加14ファイル、実Clerk/Blob、本番/Preview、他候補との組合せ、最終人間レビューは未確認。push/PR更新/merge/deploy/実リソース書込み/永続環境変更は実施しません。
