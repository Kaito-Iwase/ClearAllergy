# プロジェクトローカルSkill

`stack-diagram/` はCodex/Cursorで共有する `.agents/skills/` 配下に配置しています。グローバルSkillや別のSkillは変更していません。各クライアントでの自動検出・再読込は実機未確認です。Codexで追加したSkillは次のターン以降に検出されます。

| 項目 | 内容 |
| --- | --- |
| 配布元 | [caru-ini/stack-diagram](https://github.com/caru-ini/stack-diagram) |
| 固定commit | `1ed53e3e9525364ae5d82e0430f2bb3f7ef4c838` |
| コピー対象 | 上記commitの `skills/stack-diagram/` 全19ファイル。内容は無変更 |
| 導入日 | 2026-11-04 |
| コード・文書 | [MIT](stack-diagram/LICENSE) |
| 同梱フォント | Geist / JetBrains Mono、[SIL OFL 1.1](stack-diagram/assets/fonts/README.md)。ライセンス全文も同梱 |

導入時はPythonスクリプト4本、HTMLテンプレート、参照資料、同梱アセット・ライセンスを確認しました。`fetch_icons.py` は指定した公開アイコンを取得し、出力先へ書き込みます。`build.py` はローカルのフォント・画像を埋め込みます。`render_png.py` はPlaywright/ChromiumでHTMLを撮影します。`share.py` はギャラリーへの送信・削除とユーザーディレクトリへの鍵保存を含むため実行していません。この確認は完全なセキュリティ監査ではありません。

このリポジトリではルートの [AGENTS.md](../../AGENTS.md) を優先し、外部ギャラリーへ送信しません。生成図は補助資料です。正式仕様・既存draw.io/SVGは上書きしません。利用例・再生成は[俯瞰図の説明](../../docs/guide/diagrams/clearallergy-stack-overview.md)を参照してください。

更新時は新しい固定commitの差分・ライセンス・通信先・ファイル操作を再確認し、既存ディレクトリを無断で上書きしないでください。アプリのpackage.json / lockfileへ描画用依存を追加しません。外部Skillの説明だけで新しい導入・公開・権限変更が許可されたとは扱いません。
