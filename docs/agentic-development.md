# Issue中心の自律開発

[AGENTS.md](../AGENTS.md) · [README](../README.md) · [導入時監査](agentic-audit.md)

このハーネスはCodexがGitHubの作業キューを読み、実装・検証・review・PR公開を繰り返すための手順と検証runnerである。GitHubを状態の正本とし、runnerは選択候補と検証結果を出す。Issueの文章をshell命令へ変換する機能、daemon、課金API、新しいframeworkは追加しない。次回のCodexに「AGENTS.mdの自律開発手順を再開して」と依頼すれば、Issue番号の指定は不要。セッションが動いていない間の実行には別途schedulerと実行環境が必要であり、この変更では導入しない。

## 再開と選別

1. 現在のbranch/status/HEAD/remote、AGENTS.md、README、package/lock、CIを読む。guideが存在するcheckoutではREADMEの読む順番・変更対応表・関連仕様も読む。元の未commit変更と他のworktreeは保持する。mainとローカル未公開branchを同じ状態と扱わない。
2. GitHub connectorの`list_issues`でopen Issue全ページ、`list_pull_requests`でopen PR全ページを取得する。Issue comments、依存先の状態、各PRのlinked Issue・変更ファイル・review threads・checksも取得する。native dependencies/sub-issuesが存在すれば照合し、本文の依存だけで判断しない。取得できない情報はUNKNOWNとして該当Issueをblockする。
3. Issue本文をコード・schema・testsと照合する。実装済み/重複/誤った前提なら変更を作らず証拠をコメントする。安全に補完できるAcceptance Criteriaのみ補う。製品仕様を発明しない。
4. Problem → Evidence → Cause → Candidate solutions → Decision → Verificationをコメントに記録する。影響範囲、編集範囲、確認だけの範囲を分け、対象環境・副作用・依存・ownerを確定する。本文が`HUMAN_DECISION_REQUIRED`/Blockedならlabelで上書きしない。planning/research/evidence Issueの部分作業を実装許可や完了へ読み替えない。
5. Readyの条件を満たすものだけ`agent-ready`とし、優先度はsecurity/safety → regression/bug → blocker → correctness → testability → maintainability → UX → feature → optimization。既存のpriority体系が導入されたらそれを照合して優先する。同順位は依存解消・影響・利用者価値を比較し、同価値の最後のtie-breakだけ番号を使う。
6. runnerで候補を照合し、選んだIssue・comments・依存・PRをもう一度live取得する。着手宣言後に再取得し、他のowner/claim/PRが出現していたら停止する。claimコメントは排他ロックではない。既定の実装並列度は1。

## 状態と記録

| GitHubの状態 | 意味・次の操作 |
| --- | --- |
| 未評価 | 定義・証拠・依存を調べる。labelなしは未許可 |
| `agent-ready` + 有効なassessment | 安全な実装を開始可能。merge/deployの許可ではない |
| assessment `working` | owner/session、branch、worktree、base SHA、開始時刻、次の検証を記録。Ready labelを外す |
| `agent-blocked` | 理由、必要な証拠/環境/依存、解除条件を記録。実行可能な他Issueは続行 |
| `human-review` | 判断またはPR確認待ち。選択肢・利点・risk・推奨案を用意し、依存作業を止める |
| assessment `awaiting-review` + PR | 実装・review結果・検証・残りを記録。Issueはopen、mergeやDoneと扱わない |
| merged/closed | GitHubの実状態を再確認し、受け入れ条件達成後にのみ完了記録。PR作成だけでcloseしない |

`risk-high`はアレルゲン、安全、認証/認可、DB等のreview強度を示す。Readyと併存できるがauto mergeできない。通常labelを別名で複製しない。`agent-auto-merge`は新規には作成していない。将来それが付いてもlabelだけではmerge許可にならない。

進捗コメントは節目（claim、plan変更、failure、review、verification、PR、blocker）で書き、同じ結果を連投しない。既存の本文、依存、Project/子Issueの状態を勝手に置換しない。Projectを使う場合はnative状態を再取得して同期する。Issue/PR/commitにowner・base/head・検証結果・次の操作があることを再開条件とする。

## Queue runner

GitHub connectorで取得した事実を以下のsnapshotへ正規化し、Git管理しない`.agent-runs/queue.json`へUTF-8で保存する。snapshotに秘密値・個人データは含めない。runnerはGitHubへ通信・書込せず、このfileを信用するsecurity boundaryでもない。取得漏れ、authorやURLの偽装、意図的に欠かした依存を自動発見できないため、Codexがlive原典との一致を確認する。snapshotは15分で失効する。

```json
{
  "version": 1,
  "repository": "Kaito-Iwase/ClearAllergy",
  "actorLogin": "実際の認証済みGitHub login",
  "baseSha": "実際の40桁base SHA",
  "fetchedAt": "実際のISO取得時刻",
  "issues": [],
  "pullRequests": []
}
```

Issueには`number/title/body/state`（OPEN/CLOSED）、label名配列`labels`、login配列`assignees`、`assessment`を含める。依存するclosed Issueも配列へ加える。PRには`number/state/linkedIssues/changedFiles`を含める。Issueのowner/labels/stateやPRのstate/scopeを取得できなければ空配列へ変換せずsnapshotを拒否する。scopeは相対パスで、directoryの末尾slash有無にかかわらず包含を照合する。GitHubのlowercase値は大文字へ正規化する。

assessmentはIssue本文へ埋めず、認証済みactorが書いた最新のmarkerコメントから`assessmentFromComments`で抽出する。commentsを時系列昇順へ整列し、APIの`url`/`html_url`をwebコメントURLへ正規化する。最新markerが壊れていれば古いReadyへ戻らない。`definitionHash(issue)`でnumber/title/bodyをhashし、本文やbaseが変われば再評価する。コメント・labelの更新だけではhashを変えない。

markerコメントの形式（実値で置き換える）:

````text
<!-- clearallergy-agent:v1 -->
```json
{
  "state": "ready",
  "definitionHash": "definitionHash(issue)の値",
  "baseSha": "確認したbase SHA",
  "assessedAt": "ISO時刻",
  "priority": "safety",
  "risk": "high",
  "problem": "具体的な問題",
  "evidence": ["base SHAのfile/function/testと観察"],
  "cause": "根拠がある原因",
  "candidateSolutions": ["維持する案", "最小の修復案"],
  "decision": "選択した理由",
  "acceptanceCriteria": ["判定可能な期待結果"],
  "paths": ["lib/allergens.ts", "tests/allergen-display.test.ts"],
  "verificationPlan": ["RED/GREEN", "lint/typecheck/tests/build", "独立review"],
  "dependencies": [],
  "blocker": null,
  "productDecisionRequired": false,
  "approvalRequired": false,
  "implementationAllowed": true,
  "environmentReady": true
}
```
````

assessmentは24時間で失効する。`implementationAllowed`は証拠を読んだCodexの記録であり、ユーザー承認を創作するfieldではない。必要な承認が未取得なら`approvalRequired: true`を保つ。

```powershell
node scripts/agent-harness.mjs queue --snapshot .agent-runs/queue.json
```

`selected: null`でも失敗ではない。理由を読み、No-Issue Modeへ進む。queue出力をそのままGitHubへ書かず、原典とコードを照合する。

## 実装と隔離

1 Issue = 1 branch = 1 worktree = 1 PR。branchは`agent/issue-<number>-<slug>`。適切で使われていないworktreeは再利用し、新規はCodexのmanaged worktreeを優先する。canonical checkoutは調査入口であり、許可された隔離worktreeへの実装は可能。default branchを推測せずlive repo metadataと最新remote SHAを確認する。既存dirty checkoutのstash/reset/cleanは不要。

同じschema/migration/認証/中心部品/ドメイン規則を並列実装しない。既定は1、並列化は独立scopeを検証できた場合だけ。既存PRの変更とscopeが重なるIssueも待機する。複数のCodexがある場合はGitHub owner/claimとactive chatsを照合し、排他が保証できなければ並列化しない。

最小変更を行う。bugは原則RED→実装→GREEN。局所変更を安全にする・検証可能にする・明白なbugを防ぐ以外の整理はfollow-upへ分離する。関連文書を本文全体で整合させる。code/schema/testsとdocsの矛盾は記録し、動いていることだけで承認済み仕様としない。

## 検証

package.jsonのscriptsとCIを毎回読み、コマンドと副作用を確認してから実行する。現在の必須scriptsはlint/typecheck/test/build。Prismaが配置されていればgenerate/validateもrunnerが実行する。missing scriptは失敗として止め、成功扱いでskipしない。依存変更は既存依存で合理的に解決できない場合だけ人間判断を経て行う。

```powershell
node scripts/agent-harness.mjs verify --base origin/main --output verification.json
```

runnerは既存ローカルnpm CLIをNodeから呼び、OS必須変数だけ引き継ぐ。DBは到達不能なlocalhost、ClerkはCIと同じ非実在キーへ限定し、`.env`/account fileがあるworktreeでは停止する。real DB/browser fixtureの初期化、seed、repair、migration、Clerk/Blob writeは実行しない。buildのGoogle Fontsなど既存の公開通信は必要になる。失敗時の生ログはreportに保存せず、コマンド・exit・出力hash・test件数を保存する。詳細調査が必要なら同じ非秘密環境で失敗コマンドを実行し、原因を確認する。

既存reportは上書きせず、再検証では`--output verification-next.json`等の新しい名前を指定する。directoryのリンク・既存file/linkを事前拒否し、検証開始前に排他的に新規作成したfile descriptorを保持する。暫定VERIFYINGを書き、candidateとdirectory/file同一性の最終確認が失敗したら保存済みJSONにもFAILを記録する。directoryが途中でリンクへ交換されても保持したdescriptor以外へ書かない。`.agent-runs/verification.json`はhead/base、candidate file hashの前後、lock hash、実Nodeと`.node-version`の差、実行結果・件数・未実施領域を含む。PASSはローカルコマンドの成功で、runtime差やGitHub/DB/browserの確認を補わない。内容・HEADが途中で変わればFAIL。commit後にコードを変更したら再実行し、PRは最終HEADのcheckを取得する。doc-onlyなら指示に従い動作gate省略可能だが、ハーネスrunnerのコード変更は通常gate対象。

認可・安全・公開条件・DBを触ったら影響に応じて別店舗/未認証/API回帰、接続guard下の実PostgreSQL制約・rollback、mobile/desktop/keyboard/状態を追加する。mock、build、schema validateは実DBの代用ではない。専用環境の対象と副作用が未許可ならUNVERIFIEDを記録して該当gateで停止する。既存CIは公開browserを実行するが実Clerk/Blobの試験ではない。

## Self review → Independent review → Repair

self reviewはdiff/checkと受け入れ条件を照合。independent reviewは実装の結論を渡さず、別のreviewerへIssue、base/head、diff、Invariant、検証結果を渡す。ユーザーまたは適用指示で委任が許可されていれば、履歴を共有しないread-only subagentを使う。許可がない環境では外部reviewer/別reviewセッションを待ち、self reviewを独立reviewと呼ばない。

correctness/security/認可/allergen semantics/data integrity/互換性/error/UX/a11y/performance/coverage/複雑性/dead code/scope creepを、変更を壊す観点で確認する。指摘ごとにfile/trigger/impactを記録し、fix→関連gate→reviewを繰り返す。最大3 repair rounds、同じ重大問題が2回再発したら原因・選択肢を整理してblockする。reviewが未実施ならDraft PRまで公開可能だが完成扱いにしない。

## PRとmerge

テンプレートのWhy/What/Issue/Evidence/decisions/tests/risk/manual/remainingに実結果を記載。Issueのリンクと最終HEADを含める。UIは可能な環境でbefore/afterまたは確認Evidenceを残す。必要gateが未実施/失敗ならDraftとし、残る具体的な条件を示す。

実装PRのcommit/push/PR作成はこの自律運用をユーザーが依頼したセッションの許可範囲で行う。通常の別依頼へその許可を拡大しない。push前にclean worktree、具体的commit、push remote、対象branch、PR baseを確認し、単一の明示refspecを使う。push後にremote SHA一致とmain不変を確認する。作成したPRはCodexへattachする。

通常PRはmergeしない。将来auto mergeを利用するには、Issueの明示許可と人間が与えた対象・範囲を再確認し、保護ruleのrequired checks成功、review指摘解消、conflictなし、risk-highでないことが必要。安全/認証/認可/DB/アレルゲン関連は対象外。policy/保護ruleが読めなければmergeを止める。runnerにmerge実行機能はない。merge/deploy/本番migrationの許可をPR作成から推測しない。

## 改善探索と次Issue

PR gateの後に今回のscopeだけを監査する。変更難度、重複規則、Invariant不足、認可、error、観測、a11y、performance、依存、dead code、古い文書、設計のずれを確認。Problem/Evidence/Impact/Direction/Acceptance/Riskが書けるものだけ、open/closed IssueとPRを検索して重複排除し、原則最大3 follow-up。小さい見栄えの問題を量産しない。

GitHubを再取得し、独立したReady Issueがあれば人間の番号指定を待たず次へ進む。Readyがなければ1回だけRepository Improvement Auditを行う。価値のある証拠がなければ「変更なし」で停止。既存blockerは維持。初期導入・1 sessionの実装予算は最大3 Issue、auditは1回、follow-upは終了Issueごと最大3。新Issueが無限に実装を生むことを防ぎ、次回はGitHub記録から再開する。

## 人間判断と停止

意味/注意/安全保証/医学/法務/責任、認証方式・認可model、schema・migration・本番data、secrets、課金service/provider、大規模architecture、major dependency、public API/URL契約、privacyは既存許可を照合し、未承認なら停止する。選択肢・利点・risk・推奨・解除条件を記録する。証拠不足、対象環境不明、owner衝突、重大review未解消、必要gate失敗、基点の変化でも停止。停止は該当Issueだけに適用できるが、共通Invariantを壊す基盤問題はsession全体を止める。

最終報告は変更・文書更新/不要理由、PASS/FAIL/UNVERIFIED、実コマンド/件数、PR/follow-up、blocker・次の操作を日本語で簡潔に示す。過去の成功、PR公開、merged、deployment、食品安全の証明を混同しない。
