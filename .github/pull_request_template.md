## Why / Issue

具体的な問題・影響と対応Issue（Refs #）。未完了Issueをcloseする表現を使わない。

## What / Key decisions

変更内容、根拠、比較した小さい代替案。base/head SHA。

## Evidence / Tests performed

実コマンド、環境/runtime、件数、PASS/FAIL/UNVERIFIED。mock/実DB/browser/GitHubを区別。

## Independent review / Repair

reviewer、対象HEAD、指摘・修正・再検証。self reviewを独立reviewと扱わない。

## Risk / Manual verification / Remaining concerns

未実施の理由、残るgate、UI Evidence、rollback、人間判断。

## Documentation / Follow-up

関連文書更新、または更新不要の理由。改善Issueと重複検索結果。

- [ ] 最終diff/check・受け入れ条件・参照を照合した
- [ ] 必須gateの失敗/未実施を隠していない（未達ならDraft）
- [ ] 安全・認証・認可・DB・アレルゲンに関係する変更はauto merge対象外
- [ ] 通常PRのmerge/deployは行っていない
