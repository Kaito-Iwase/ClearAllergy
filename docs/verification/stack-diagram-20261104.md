# 技術スタック俯瞰図の導入・確認（2026-11-04）

対象実装: main `51adcb23945b80bb34b110d2d0f263d29629a821`。作業ブランチ: `docs/stack-diagram-20261104`。最終変更HEADとDraft PR、GitHub CIの状態は当該PRに記録します。

変更はプロジェクトローカルSkill、補助図（HTML・ライト／ダークPNG）、図の根拠・ライセンス・描画補助、最小限の索引・ルール・gitignoreです。製品コード、アプリ依存、schema/migration、認証設定、CI、Vercel設定、既存SVG/draw.ioは変更していません。

既存作業ツリーのAGENTS.md・docs/agentic-development.mdの未コミット変更は保持しました。管理worktreeツールはチャット直下のGit配置を認識できなかったため、許可されたワークスペース内の専用cloneで最新mainから独立ブランチを作成しました。

## 導入・根拠確認

- PASS: `caru-ini/stack-diagram` の `1ed53e3e9525364ae5d82e0430f2bb3f7ef4c838` を確認し、skill-installerの `install-skill-from-github.py --repo caru-ini/stack-diagram --path skills/stack-diagram --ref 1ed53e3e9525364ae5d82e0430f2bb3f7ef4c838 --dest .agents/skills` で導入。配布元の19ファイルと照合し、Skill内容の改変なし。
- PASS: Pythonスクリプト4本、テンプレート、参照資料、フォント・汎用SVGとライセンスを確認。コードはMIT、フォントはSIL OFL 1.1。公開ロゴの取得元・ハッシュと第三者通知を保存。完全なセキュリティ監査ではない。
- PASS: AGENTS、README、現行guide、研究資料の時点・候補、package.json/lockfile、実際のページ/API/共通処理/DB定義/設定に照合。[根拠表](../guide/diagrams/clearallergy-stack-overview.md)に接続単位で記録。
- PASS: 実装・候補・未確認を分離。画像URLのDB保存はアップロード後の別操作として表記。Google Placesの管理側と公開側の違いを記録。
- PASS: 外部ギャラリーへの送信・`share.py` 実行なし。秘密情報・内部URL・個人データ・実アカウント・実店舗情報を追加せず、環境変数値や管理コンソールは未参照。

## 今回の描画・検証

環境: Windows PowerShell、Python 3.12.4、Node.js 22.15.1、既存Playwright 1.61.0、Microsoft Edge 156.0.4314.58（Chromiumエンジン）。アプリ・DB・認証の起動なし。Python版Playwrightは未導入だったためNode版を使用。初回のサンドボックス内Edge起動は環境制約で失敗し、承認された通常ホスト実行で成功しました。

| 検証 | 結果 |
| --- | --- |
| Skillの `fetch_icons.py` / `build.py` | PASS: 公開アイコンを取得し、HTMLへ埋込。表示時の外部リソース不要 |
| `node --check docs/guide/diagrams/render-stack-overview.mjs` | PASS: 描画用スクリプトの構文検査 |
| `node docs/guide/diagrams/render-stack-overview.mjs` | PASS: ライト／ダークとも17ノード・20画像、欠落画像0・境界外0・欠け0・矢印と文字の交差0 |
| テーマ切替・オフライン・狭幅 | PASS: HTMLの両テーマリンク、390px幅で図の横スクロール・ページ枠の収まり、HTTP(S)要求0、ページ例外0 |
| PNGの目視 | PASS: 両テーマを開き、文字・ロゴ・矢印の接続・境界を確認。折返しとラベル接触を修正して再出力。2880×2500px |
| 文書・参照・差分 | PASS: 作業用の読取検証スクリプトで7文書の相対リンク・アンカー181件、上流Skill19ファイル、埋込20画像と取得manifest15件、図の版数とlockfile、既存正式図と製品/CI差分なし、gitignoreの追跡対象を照合。自作差分の `git diff --cached --check` 成功（下記の上流ライセンス1ファイルを除外） |

再実行コマンドは[図の説明](../guide/diagrams/clearallergy-stack-overview.md)を参照。図は配置・主要経路の説明であり、本番稼働・すべての経路・食品安全の検証ではありません。

全体の `git diff --cached --check` は上流の `OFL-Geist.txt:21` に既存の末尾空白1件を検出します。Skill無改変を優先し、当該ファイルだけをpathspecで除外した検査はPASSです。自作文書・HTMLの空白指摘は修正しました。

## 未実施と範囲

- UNVERIFIED: 実Vercel/Neon/Clerk/Blob/Places/Analytics設定・接続、実DB、製品ブラウザ回帰、実端末間のフォント差、CursorでのSkill検出。対象外のため接続・設定変更なし。
- 未実行: アプリのlint・型検査・単体テスト・build。文書と隔離描画ツールのみの変更で、製品コード・アプリ依存・設定・既存検証経路を変えないため、AGENTSの文書変更時の条件で省略。GitHubの既存CI結果とは分けてPRへ記録。
- 独立レビュー未実施。接続の照合・差分確認・目視は作成エージェントの自己レビューで、独立レビュー成功とは扱わずDraftで引き渡す。
- mainへのmerge、本番deploy、外部ギャラリーへの投稿は行わない。戻す場合はこのPRの図・Skillと追加導線だけを戻す。DBや製品のrollbackは不要。

READMEとarchitectureの正式図直後に導線、AGENTSにローカルSkillの参照・共有禁止、verificationの記録索引を追加しました。product/rules/change-mapの仕様・実装経路・API契約は変わらず、既存研究資料や正式図も更新不要と判断しました。
