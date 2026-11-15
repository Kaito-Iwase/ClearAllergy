<!-- PRタイトルは英語type＋日本語説明。詳細: https://github.com/Kaito-Iwase/ClearAllergy/blob/main/docs/guide/development.md#commit-pr-conventions -->

## 変更と現在地

<!-- 問題がどう改善するかを1〜2文。Refs #番号。実装・検証・マージ・配備を区別する。 -->

## 判断・次の操作

<!-- 必須検証のFAIL/UNVERIFIED、重要リスク、判断待ちはここへ。なければその旨と次の担当・操作を1行。ユーザー判断が必要なら推奨案と影響を添える。 -->

## 確認結果

<!-- 今回の対象で確かめたことを短く。ローカル/CI/実環境を区別し、必要な証拠へリンク。過去の成功を今回へ転記しない。 -->

<details>
<summary>検証・判断の詳細（調査・レビュー時に開く）</summary>

- 対象: base/head SHA、環境。再利用できる既存証拠はリンクで示す。
- 検証: 実コマンド、件数、PASS/FAIL/UNVERIFIED、未実施理由。モック・実DB・実ブラウザ・GitHubを区別する。
- 判断: 選択理由、比較した小さい代替案、変更を戻す手順。未解決の重要事項は冒頭にも示す。
- 独立レビュー: 担当者・対象HEAD・指摘/修正/再検証。自己レビュー、GitHubのApproveと区別する。
- 文書・後続作業: 更新した文書または更新不要理由、参照の照合。後続Issueは証拠がある場合だけ示す。

- [ ] [文書保守ルール](https://github.com/Kaito-Iwase/ClearAllergy/blob/main/docs/guide/maintenance.md#update-map)に沿って、必要な文書・最終差分・受け入れ条件・参照を照合した
- [ ] 必須検証の失敗・未実施と判断待ちを冒頭に示した（必須検証が未達ならDraft）
- [ ] 既存の権限を守った。安全・認証・認可・DB・アレルゲン関連はauto merge対象外。PR作成をmerge/deployの許可と扱っていない

</details>
