# PR #105 追加harnessの現main適用と検証条件

2026-10-25。main `0b6ed291b2fd853230c7efdeeb1e061815404a81`、元PR #105 `e5664af8e4a490baa8e40500cfe799fd9b02a21d`。本体のみの候補 `0d18e63774d7edd430479ee10f23368464ab5918` を保持し、別ローカルbranch `codex/pr105-context-main-local-20261025` へ追加差分を適用します。この記録を含むcommitを固定した後の実コマンド・結果・最終SHA・patch/bundleはタスク成果へ保存します。ここに記載した検証条件だけでは、各gateの成功を意味しません。

## 追加成果の出典

本人所有のLibrary成果 `libfile_69bd8f9d336081919b860a3b27f62bc3` を管理元タスクが正規ツールで取得し、このタスクへ分割転送しました。最初の一括転送は欠損していたため未使用。9通を保存・連結し、Base64 64,620文字、ZIP 48,463 bytes、SHA-256 `982f0d43f8b6b32a6e07cfd93ed99f548863a4762754da47a25b6a0f9f3078cb`、全ZIP CRCとmanifest記載11ファイルのsize/hashを照合しました。

元PRを基点に14ファイルpatchから再構成したtreeは、申告された `ba497e70e3fb8d708daaac73301d1c704af85bc6` と一致。元commit `e7d4c79ff6986703d172340354ff23343c0b5821` / 日本語候補 `f0e554ab5fc68f0998559fb64498868c5ca9e27b` のcommit object自体は受領していません。限定検証記録のworking file hashは13/14件がGit blobそのもの、またはCRLFへ変換した値と一致。`tests/verification-evidence.test.ts` の1件は一致せず、元working fileの同一性は未確認として残します。Git tree一致と、この記録上の不一致を区別します。

## 適用範囲と維持する条件

宣言scopeと実Git差分（rename元/先・untrackedを含む）の照合、公開食品取得/表示のprotected分類、実変更から必要な検証の選択、完了フラグ、最新snapshotの完全性、serverEvidenceの実読込・hash/run/phase/candidate/build/終了結果の照合、入口文書の相対参照検査が対象です。CIメタデータのガードを維持し、環境変数の一致をOS隔離の証明とは扱いません。

初回適用時は実装・テスト8ファイルが再構成した追加成果と一致しました。後述のLinux停止判定だけを追加修正し、残り7ファイルは一致を維持します。文書は現mainへ差分で適用し、agentic-developmentは三treeで統合。READMEは現mainで確認できる実装とPR参照を記載し、追加成果の古いProduction配備成功の申告を現在の確認結果へ転記しません。

mainのsecurity依存・lock、vercel.json・配備抑止文書、schema・過去migration、食品仕様・公開契約・認可・workflowは変更しません。未公開P1 workflowを混ぜず、#95/#96/#101/#102の候補も別に保持します。製品仕様の正本であるrules/productは更新不要です。

## RED/GREENと実行境界

本体のみの候補で、公開snapshotのprotected分類、serverEvidence欠落、最終保存時の完了フラグ、実Git範囲逸脱の4反例を再現しました。いずれも新しい期待結果に対して失敗（0成功/4失敗）。Git fixtureのnpmコマンドは固定no-opで、アプリ検証とは別です。追加適用後に同じ反例と既存関連テスト、full unit・lint・typecheck・build・文書参照を検査し、実結果と失敗をタスク成果へ残します。

初回のfull unitは270成功/1失敗でした。LinuxのSIGTERM終了では子プロセスの`exitCode`がnull、`signalCode`がSIGTERMになるため、停止済みでも追加版のserver証跡がFAILになることを既存テストと小さな子プロセスで再現しました。`run-public-phase.mjs`の最終停止判定を、終了コードまたは終了シグナルのいずれかがある場合へ修正。既存の所有server・終了結果・秘密marker・保存拒否を含む関連37件が成功しました。実CIガードを弱める変更ではありません。修正後の固定commitで通常gateを再実行します。Context7は利用可能なツール一覧になく、Nodeの実プロセスと配置済み型定義で終了状態を確認しました。

追加版のphase/verifyは、完全な最新GitHub snapshotとGitHub-hosted CIメタデータを要求します。現クラウド環境の通常アプリ検証と、このrunnerの実行条件を混同しません。実CIの値や収集完了を偽装せず、ガードが拒否するphase pipelineは未実行として残します。固定fixtureを使ったserver所有/停止・秘密marker除外は、実アプリのphase→server→summary全経路の成功ではありません。

既存クラウドで許可された通常検証は、既存の架空認証・到達不能なloopback DB設定または所有確認済み使い捨てDBだけを使います。実資格情報の追加・取得・保存、実Clerk/Blob操作は行いません。環境変数の除去は専用OS隔離を作らず、環境設定の適用にも当たりません。Prisma/Fontsは通常経路で後続通信が成功した事実と、先行した許可反映の主体/時刻未確認を区別します。

## 人間の判断と残る確認

#105は既に独立レビュー3回の上限です。今回の適用と機械検証は追加独立レビューではなく、**最終的な人間レビューが必要**です。最新レビュー履歴は先行GraphQL403以降未取得。GitHub CI、実サービス、本番/Preview、他候補との組合せは未検証です。push/PR更新/merge/deploy/実リソース書込み/永続環境変更は行いません。
