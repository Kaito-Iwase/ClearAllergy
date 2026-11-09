# Issue中心の自律開発

[AGENTS.md](../AGENTS.md) · [README](../README.md) · [開発手順](guide/development.md) · [文書の保守](guide/maintenance.md) · [導入時監査](agentic-audit.md)

このハーネス（作業手順と検証をまとめた仕組み）は、CodexがGitHubの作業キューを読み、実装・検証・レビュー・PR（Pull Request、変更提案）の公開を繰り返すためのもの。手順とrunner（候補選択や検証を行うスクリプト）で構成する。GitHubを状態の正本とし、runnerは選択候補、検証結果、マージ後のIssue完了候補を出す。Issueの文章をシェル命令へ変換する機能、常駐処理、課金API、新しいフレームワークは追加しない。次回のCodexに「AGENTS.mdの自律開発手順を再開して」と依頼すれば、Issue番号の指定は不要。セッションが動いていない間の実行には別途スケジューラーと実行環境が必要であり、この変更では導入しない。

## 再開と選別

1. 現在のブランチ・作業状態・HEAD・remote、AGENTS.md、README、package/lock、CI（継続的な自動検証）を読む。guideが存在するcheckoutではREADMEの読む順番・変更対応表・関連仕様も読む。元の未コミット変更と他のworktree（ブランチごとに分離した作業ディレクトリ）は保持する。mainとローカル未公開branchを同じ状態と扱わない。
2. GitHub connectorの`list_issues`でopen Issue全ページ、`list_pull_requests`でopen PR全ページを取得する。Issue comments、依存先の状態、各PRのlinked Issue・変更ファイル・review threads・checksも取得する。native dependencies/sub-issuesが存在すれば照合し、本文の依存だけで判断しない。取得できない情報はUNKNOWN（未確認）として該当Issueをblockする。
   - 自分の最新assessmentが `awaiting-review` のIssueは、記録されたPRを番号で再取得する。マージ後は[完了判定](#issue-completion)から再開する。未確認の完了操作の控えがあれば、open一覧とは別に控えのIssue番号を指定して現在の状態を確認する。配備・検証待ちのIssueを記録し、独立したReady Issueの選別は続ける。
3. Issue本文をコード・schema・testsと照合する。実装済み/重複/誤った前提なら変更を作らず証拠をコメントする。安全に補完できるAcceptance Criteriaのみ補う。製品仕様を発明しない。
4. Problem → Evidence → Cause → Candidate solutions → Decision → Verificationをコメントに記録する。影響範囲、編集範囲、確認だけの範囲を分け、対象環境・副作用・依存・ownerを確定する。本文が`HUMAN_DECISION_REQUIRED`/Blockedならlabelで上書きしない。planning/research/evidence Issueの部分作業を実装許可や完了へ読み替えない。
5. Ready（着手可能）の条件を満たすものだけ`agent-ready`とし、優先度はsecurity/safety → regression/bug → blocker → correctness → testability → maintainability → UX → feature → optimization。既存のpriority体系が導入されたらそれを照合して優先する。同順位は依存解消・影響・利用者価値を比較し、同価値の場合に限り、最後の比較に番号を使う。
6. runnerで候補を照合し、選んだIssue・comments・依存・PRをもう一度live取得する。着手宣言後に再取得し、他のowner/claim/PRが出現していたら停止する。claimコメントは排他ロックではない。既定の実装並列度は1。

## 状態と記録

| GitHubの状態 | 意味・次の操作 |
| --- | --- |
| 未評価 | 定義・証拠・依存を調べる。labelなしは未許可 |
| `agent-ready` + 有効なassessment（Issueの評価記録） | 安全な実装を開始可能。merge/deployの許可ではない |
| assessment `working` | owner/session、branch、worktree、base SHA、開始時刻、次の検証を記録。Ready labelを外す |
| `agent-blocked` | 理由、必要な証拠/環境/依存、解除条件を記録。実行可能な他Issueは続行 |
| `human-review` | 判断またはPR確認待ち。選択肢・利点・risk・推奨案を用意し、依存作業を止める |
| assessment `awaiting-review` + PR | 実装・review結果・検証・残りを記録。Issueはopen、mergeやDoneと扱わない |
| PRがmerged | 必要なマージ後CI、配備、動作確認、Issue全体の受け入れ条件を[完了判定](#issue-completion)で照合する |
| Issueがclosed | 完了コメントとGitHubの完了理由を照合し、両方のリンクと結果を記録する |

`risk-high`はアレルゲン、安全、認証/認可、DB等のreview強度を示す。Readyと併存できるがauto mergeできない。通常labelを別名で複製しない。`agent-auto-merge`は新規には作成していない。将来それが付いてもlabelだけではmerge許可にならない。

進捗コメントは節目（claim、plan変更、failure、review、verification、PR、blocker）で書き、同じ結果を連投しない。既存の本文、依存、Project/子Issueの状態を勝手に置換しない。Projectを使う場合はnative状態を再取得して同期する。Issue/PR/commitにowner・base/head・検証結果・次の操作があることを再開条件とする。

## Queue runner

GitHub connectorで取得した事実を以下のsnapshot（取得時点の写し）へ正規化し、Git管理しない`.agent-runs/queue.json`へUTF-8で保存する。snapshotに秘密値・個人データは含めない。runnerはGitHubへ通信・書込せず、このファイルの信頼性を保証する仕組みでもない。取得漏れ、authorやURLの偽装、意図的に欠かした依存を自動発見できないため、Codexがlive原典との一致を確認する。snapshotは15分で失効する。

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

Readyの選定に使うassessmentは24時間で失効する。`implementationAllowed`は証拠を読んだCodexの記録であり、ユーザー承認を創作するfieldではない。必要な承認が未取得なら`approvalRequired: true`を保つ。

```powershell
node scripts/agent-harness.mjs queue --snapshot .agent-runs/queue.json
```

`selected: null`でも失敗ではない。理由を読み、[改善探索と次Issue](#改善探索と次issue)のReadyがない場合の手順へ進む。queue出力をそのままGitHubへ書かず、原典とコードを照合する。

## 実装と隔離

1 Issue = 1 branch = 1 worktree = 1 PR。branchは`agent/issue-<number>-<slug>`。適切で使われていないworktreeは再利用し、新規はCodexのmanaged worktreeを優先する。canonical checkout（正規の作業コピー）は調査入口であり、許可された隔離worktreeへの実装は可能。default branchを推測せずlive repo metadataと最新remote SHAを確認する。既存dirty checkoutのstash/reset/cleanは不要。

同じschema/migration/認証/中心部品/ドメイン規則を並列実装しない。既定は1、並列化は独立scopeを検証できた場合だけ。既存PRの変更とscopeが重なるIssueも待機する。複数のCodexがある場合はGitHub owner/claimとactive chatsを照合し、排他が保証できなければ並列化しない。

最小変更を行う。bugは原則RED（修復前の回帰テスト失敗）→実装→GREEN（修復後の同じテスト成功）。局所変更を安全にする・検証可能にする・明白なbugを防ぐ以外の整理はfollow-upへ分離する。関連文書を本文全体で整合させる。code/schema/testsとdocsの矛盾は記録し、動いていることだけで承認済み仕様としない。

## 検証

配備条件を確認するときは、[2026-10-04のEvidence ledger](verification/release-evidence-20261004.md)と[原典JSON](verification/release-evidence-20261004.json)を参照する。これは記載SHA・取得時点のrepository/CI/隔離DB証拠であり、production適用やrelease承認を示さない。次回は同じ対象・日時・出典・未確認事項を再取得する。

package.jsonのscriptsとCIを毎回読み、コマンドと副作用を確認してから実行する。現在の必須scriptsはlint/typecheck/test/build。Prismaが配置されていればgenerate/validateもrunnerが実行する。必須scriptがなければ失敗として止め、成功扱いでskipしない。依存変更は既存依存で合理的に解決できない場合だけ人間判断を経て行う。以降、次の段階へ進むために必須の検証をgateと呼ぶ。

```powershell
node scripts/agent-harness.mjs verify --base origin/main --output verification.json
```

runnerは `scripts/npm-cli.mjs` で解決したNode配布またはnpm lifecycleの既存CLIをNodeから呼び、OS必須変数だけ引き継ぐ。npmをアプリ依存に同梱しない。DBは到達不能なlocalhost、ClerkはCIと同じ非実在キーへ限定し、`.env`/account fileがあるworktreeでは停止する。real DB/browser fixtureの初期化、seed、repair、migration、Clerk/Blob writeは実行しない。buildのGoogle Fontsなど既存の公開通信は必要になる。失敗時の生ログはreportに保存せず、コマンド・exit・出力hash・test件数を保存する。詳細調査が必要なら同じ非秘密環境で失敗コマンドを実行し、原因を確認する。

既存reportは上書きせず、再検証では`--output verification-next.json`等の新しい名前を指定する。directoryのリンク・既存file/linkを事前拒否し、検証開始前に排他的に新規作成したfile descriptorを保持する。暫定VERIFYINGを書き、candidateとdirectory/file同一性の最終確認が失敗したら保存済みJSONにもFAILを記録する。directoryが途中でリンクへ交換されても保持したdescriptor以外へ書かない。`.agent-runs/verification.json`はhead/base、candidate file hashの前後、lock hash、実Nodeと`.node-version`の差、実npm版、実行結果・件数・未実施領域を含む。PASSはローカルコマンドの成功で、runtime差やGitHub/DB/browserの確認を補わない。内容・HEADが途中で変わればFAIL。commit後にコードを変更したら再実行し、PRは最終HEADのcheckを取得する。doc-onlyなら指示に従い動作gate省略可能だが、ハーネスrunnerのコード変更は通常gate対象。

認可・安全・公開条件・DBを触ったら影響に応じて別店舗/未認証/API回帰、接続guard下の実PostgreSQL制約・rollback、mobile/desktop/keyboard/状態を追加する。mock、build、schema validateは実DBの代用ではない。専用環境の対象と副作用が未許可ならUNVERIFIEDを記録して該当gateで停止する。既存CIは公開browserを実行するが実Clerk/Blobの試験ではない。

## Self review → Independent review → Repair

self review（自己レビュー）では、差分・空白エラーと受け入れ条件を照合する。independent review（独立レビュー）では実装の結論を渡さず、別のレビュー担当へIssue、base/head、diff、Invariant（変更しても守る条件）、検証結果を渡す。ユーザーまたは適用指示で委任が許可されていれば、履歴を共有しないread-only subagentを使う。許可がない環境では外部reviewer/別reviewセッションを待ち、self reviewを独立reviewと呼ばない。

正しさ、セキュリティ、認可、アレルゲン状態の意味、データ整合性、互換性、エラー処理、利用体験（UX）、アクセシビリティ（a11y）、性能、テスト網羅性、複雑性、使われないコード、依頼範囲からの逸脱を、変更を壊す観点で確認する。指摘ごとにファイル・発生条件・影響を記録し、fix→関連gate→reviewを繰り返す。最大3 repair rounds、同じ重大問題が2回再発したら原因・選択肢を整理してblockする。reviewが未実施ならDraft PRまで公開可能だが完成扱いにしない。

## PRとmerge

テンプレートのWhy/What/Issue/Evidence/decisions/tests/risk/manual/remainingに実結果を記載。Issueのリンクと最終HEADを含める。UIは可能な環境でbefore/afterまたは確認Evidenceを残す。必要gateが未実施/失敗ならDraftとし、残る具体的な条件を示す。

実装PRのcommit/push/PR作成はこの自律運用をユーザーが依頼したセッションの許可範囲で行う。通常の別依頼へその許可を拡大しない。push前にclean worktree、具体的commit、push remote、対象branch、PR baseを確認し、単一の明示refspecを使う。push後にremote SHA一致とmain不変を確認する。作成したPRはCodexへattachする。

通常PRはmergeしない。将来auto mergeを利用するには、Issueの明示許可と人間が与えた対象・範囲を再確認し、保護ruleのrequired checks成功、review指摘解消、conflictなし、risk-highでないことが必要。安全/認証/認可/DB/アレルゲン関連は対象外。policy/保護ruleが読めなければmergeを止める。runnerにmerge実行機能はない。merge/deploy/本番migrationの許可をPR作成から推測しない。

<a id="issue-completion"></a>
## マージ後の検証とIssueの完了

ハーネスで管理するPRは `Refs #番号` で関連付ける。マージと同時にIssueが閉じるキーワードは、この完了確認を行うPRでは使わない。完了条件はIssue全体に適用する。部分対応のPRがマージされた場合は、対応した条件と残りを記録する。

1. PRをレビューに出す時点で、必要なマージ先、配備先、その環境で行う検証をIssueの受け入れ条件と照合する。認証済みactorの最新assessmentを `awaiting-review` に更新し、現行の `definitionHash`、重複のない `acceptanceCriteria`、依存Issue番号の `dependencies`、`completion.pullRequests` と `completion.acceptance` を保存する。
   - 各PRには `number`、`baseRef`、レビュー済みの `headSha`、必要な配備先の `deployments` を記す。配備先は `{ target, origin }` で記録し、`origin` はパスを含まない固定HTTPSオリジンとする。配備検証が不要なPRには空配列と `noDeploymentReason` を記す。
   - `completion.acceptance` には受け入れ条件ごとに `{ criterion, pullRequest, target }` を記す。条件に複数環境が必要なら環境ごとに行を追加する。CIで検証する条件の `target` は `null` とする。PRのheadや要求が変われば、範囲と証拠を再確認してassessmentを更新する。
   - 旧assessmentの単一の `pullRequest` は検索に使う。最終レビューの証跡、必要な配備先、全受け入れ条件を照合できた場合だけ完了計画を追加する。`human-review` などのブロッカーは解消の証拠と更新権限を確認して扱う。
2. マージ後にGitHubのIssue、関連PR、依存と子Issueを取得し直す。各PRが指定先にマージされたことと、そのブランチのマージ後コミットに対するpush CIが成功したことを確認する。配備が必要なら、各環境で対象配備の状態と固定URLの割り当てを照合し、対象画面・API・運用手順などを受け入れ条件に沿って実際に確認する。stagingの配備確認は[専用stagingの手順](guide/staging-actions.md)に従う。配備がより新しいコミットに進んでいる場合はGitHubの比較でマージコミットを含むことを確認し、新しい配備先で検証する。失敗、未実施、別のSHAや環境の結果、承認待ちの判断、未解決の依存は完了の根拠に使えない。
   - PR本文の `Refs` とIssueへの相互参照も照合する。GitHubの自動クローズ用リンクだけでは関連PRを拾えない。
   - push CIはGitHub Actionsの対象ワークフローを直接取得する。読み取り例は `gh api "repos/Kaito-Iwase/ClearAllergy/actions/workflows/ci.yml/runs?event=push&branch=$baseRef&head_sha=$mergeSha" --paginate`。一致する最新runとその最新attemptのジョブを `gh api "repos/Kaito-Iwase/ClearAllergy/actions/runs/$runId/attempts/$runAttempt/jobs" --paginate` で確認する。最新attemptが進行中・失敗・取得不能なら以前の成功へ戻らない。
   - セッション内でマージした場合は、動いているCIと必要な配備を完了まで追跡する。失敗や承認待ちで進めない場合は、止まった工程と再開条件を記録する。
3. 下のsnapshotを作り、`completion` を実行する。マージ時点のPRチェック、ローカルのPASS、VercelのReadyはそれぞれ別の証拠として扱う。必要な結果が揃っていない場合は、Issueに残る条件と解除に必要な証拠を記録する。
4. `readyToClose: true` の場合は、Issueの定義・状態・担当・依存、関連PR、必要な配備先を再取得して差分を確認する。操作前にリポジトリ、Issue番号、actor、`completionKey` を `.agent-runs/completion-pending.json` に控える。未確認の控えは上書きしない。自律運用の依頼で許可された範囲内で、GitHub connectorの `add_issue_comment` で完了コメントを先に投稿する。
   - 先頭に `<!-- clearallergy-completion:v1 <completionKey> -->` を付け、Issue定義のハッシュ、PRとマージSHA、CIの実行と試行、配備先・配備のリンク・SHA、確認日時、受け入れ条件ごとの結果と証跡、対象外の確認を記載する。同じキーの自分のコメントが既にあれば、内容と現状を照合して再利用する。
   - コメントを読み戻し、最新の状態で `completion` を再実行する。同じキーで `readyToClose: true` を確認してから、`issue_write` の `method: "update"`、`state: "closed"`、`state_reason: "completed"` で閉じる。最後に閉じた状態・理由、Issue定義とコメントを読み戻し、確認結果を控えに記録する。読み取りと書き込みの間に変化が見つかった場合は、その差分を報告する。合意した対象への配備操作は、既存の配備許可に従う。
5. コメントやクローズの応答が失われた場合は、控えのIssue番号からGitHubの状態を取得する。既に閉じていれば理由と証跡を照合する。開いていれば最新の証跡で判定し、同じキーの自分のコメントを確認してから再開する。証跡を確認できないまま閉じていた場合は、完了確認が不足していると報告する。

`completion` はGitHubへ書き込まず、取得済みの事実を照合する。Codexが下記を原典から埋め、最後の取得時刻を `fetchedAt` として `.agent-runs/completion.json` に保存する。取得できない項目は空の成功扱いにせず保留する。秘密値や共有トークン付きURLを保存しない。

| snapshotの項目 | 入れる事実 |
| --- | --- |
| `version`、`repository`、`actorLogin`、`fetchedAt` | `1`、`Kaito-Iwase/ClearAllergy`、認証済みのGitHubログイン名、取得完了のISO時刻。取得から15分以内 |
| `issue` | queueと同じ `number`、`title`、`body`、`state`、`labels`、`assignees`、`assessment`。未完了の子Issue番号を `openSubIssues` に、本文・assessment・GitHubにある依存Issueすべての `{ number, state }` を `dependencies` に入れる。空配列は該当なしを確認した場合だけ使う |
| `pullRequests` | 全関連PRの `number`、`state`、`linkedIssues`。GitHubでmergedを確認したPRは `MERGED` に正規化する。完了計画にある各PRには `baseRef`、`headSha`、`mergeSha`、ISO時刻の `mergedAt`、`ci`、必要な `deployments` も入れる |
| 各PRの `ci` | マージ後のコミットを検証したpush実行の `event: "push"`、`commitSha`、マージ先と一致する `branch`、`workflowPath: ".github/workflows/ci.yml"`、最新の `runAttempt`、試行の開始・完了ISO時刻 `startedAt` / `completedAt`、Actions実行の `url`、`status`。最新試行で必須ジョブがすべて成功したときだけ `PASS` |
| 各配備の証跡 | 計画にある `target`、Vercelなどの `state`、`commitSha`、配備固有の `url`、配備完了のISO時刻 `readyAt`、固定URLで対象配備を確認した `active: true`。より新しいSHAなら `comparison: { status: "ahead", url }` に当該マージSHAと現配備SHAのGitHub比較を入れる |
| 配備の `verification` | マージ・配備の両方が完了してから配備先で観察した `status`、`commitSha`、ISO時刻の `observedAt`、確認した `url`、操作と結果の `summary`。配備と同じSHAかつ計画の固定オリジンでの実確認だけを `PASS` とする |
| `acceptance` | 計画の `{ criterion, pullRequest, target }` ごとに、`status`、検証済みの `commitSha`、結果の `summary` と証跡の `url` を入れる。環境を指定した条件には対象配備の `deploymentUrl` と、マージ・配備後の確認ISO時刻 `observedAt` を入れる。確認時の配備と現行の配備が一致する場合だけ使う |

```powershell
node scripts/agent-harness.mjs completion --snapshot .agent-runs/completion.json
```

`readyToClose: false` または不正なsnapshotは終了コード1。検証が揃った場合の `completionKey` は、Issue定義・assessment、マージ、CIの試行、配備、条件ごとの検証対象と証跡リンクが同じ間は変わらない。コメント再利用時は確認内容も照合する。GitHubへの書き込み結果は別に再取得して確認する。

## 改善探索と次Issue

PR gateの後に今回のscopeだけを監査する。変更難度、重複規則、Invariant不足、認可、error、観測、a11y、performance、依存、dead code、古い文書、設計のずれを確認。Problem/Evidence/Impact/Direction/Acceptance/Riskが書けるものだけ、open/closed IssueとPRを検索して重複排除し、原則最大3 follow-up。小さい見栄えの問題を量産しない。

GitHubを再取得し、独立したReady Issueがあれば人間の番号指定を待たず次へ進む。Readyがなければ1回だけRepository Improvement Auditを行う。価値のある証拠がなければ「変更なし」で停止。既存blockerは維持。初期導入・1 sessionの実装予算は最大3 Issue、auditは1回、follow-upは終了Issueごと最大3。新Issueが無限に実装を生むことを防ぎ、次回はGitHub記録から再開する。

## 人間判断と停止

意味/注意/安全保証/医学/法務/責任、認証方式・認可model、schema・migration・本番data、secrets、課金service/provider、大規模architecture、major dependency、public API/URL契約、privacyは既存許可を照合し、未承認なら停止する。選択肢・利点・risk・推奨・解除条件を記録する。証拠不足、対象環境不明、owner衝突、重大review未解消、必要gate失敗、基点の変化でも停止。停止は該当Issueだけに適用できるが、共通Invariantを壊す基盤問題はsession全体を止める。

最終報告は変更・文書更新/不要理由、PASS/FAIL/UNVERIFIED、実コマンド/件数、PR/follow-up、blocker・次の操作を日本語で簡潔に示す。過去の成功、PR公開、merged、deployment、食品安全の証明を混同しない。
