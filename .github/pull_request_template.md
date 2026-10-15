## Why / Issue

具体的な問題・影響と対応Issue（Refs #）。未完了Issueをcloseする表現を使わない。

## What / Key decisions

変更内容、根拠、比較した小さい代替案。base/head SHA（比較基点と変更先のコミット識別子）。

## Evidence / Tests performed

実コマンド、実行環境（runtime）、件数、PASS/FAIL/UNVERIFIED（成功/失敗/未確認）。mock（代用品）・実DB・実ブラウザ・GitHubの結果を区別。

## Independent review / Repair

レビュー担当者、対象HEAD、指摘・修正・再検証。self review（自己レビュー）を独立レビューと扱わない。

## Risk / Manual verification / Remaining concerns

未実施の理由、残るgate（必須の検証）、画面・操作の証拠（UI Evidence）、rollback（変更を戻す手順）、人間判断。

## Documentation / Follow-up

関連文書更新、または更新不要の理由。改善Issueと重複検索結果。

- [ ] [文書保守ルール](https://github.com/Kaito-Iwase/ClearAllergy/blob/main/docs/guide/maintenance.md#update-map)に沿って必要なdocsを同じ変更内で更新し、更新文書または不要理由とリンク・コマンドの照合結果を示した

- [ ] 最終diff/check・受け入れ条件・参照を照合した
- [ ] 必須gateの失敗/未実施を隠していない（未達ならDraft）
- [ ] 安全・認証・認可・DB・アレルゲンに関係する変更はauto merge対象外
- [ ] 通常PRのmerge/deployは行っていない
