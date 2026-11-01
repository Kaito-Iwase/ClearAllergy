# Issue118 server callback 診断のCI側未有効化候補

## 状態と対象

実通信・実認証・配備は未実施。アプリ候補は `aa92dbba35088f807b8f54a7548556ab4009a37b`（6293d5a基準、ローカル未配備）。実際の新しいDeployment IDとURLは未確認。この検査の `https://candidate-preview.issue118.invalid` / `dpl_SYNTHETIC_ONLY` は架空fixtureであり、実配備receiptではない。

`scripts/check-issue118-server-callback-candidate.mjs` は合成seam専用で、CLIからは常に `SERVER_CALLBACK_CANDIDATE_DISABLED_NO_NETWORK` / exit 1。workflowの `PREPARE_SERVER_CALLBACK_DISABLED` はdefaultではなく、対応job自体を設けない。既存の唯一のlive jobもこのmodeを受理しないため、このmodeでEnvironment・Secret・OIDCに到達しない。通常modeと既存送信先の許可範囲は変更しない。

## 合成検査の責務

固定Project・Preview・test/staging・候補SHA・Deployment・origin・Clerk・owner/shopと10分以内のreceiptを照合する。ownerはreceipt内の一致だけで、実APIでの所有者確認ではない。OIDCは架空署名を持つ合成値だけを受理し、claims/期限の局所guardを検査する。実際のOIDC取得・署名検証を成功と主張しない。

注入したHTTPモデルだけで、appの初回GET→固定ClerkのGET→app callbackのGETの最大3回を検査。OIDCはappだけ、診断headerは3回目だけに付ける。自動redirect/retry、Cookie等の明示転送、4 GET目、ClerkJS、Backend token、session API、fixture書込みには進まない。診断応答の固定schema・署名結果booleanを照合し、未知errorは固定HOLDにする。応答本文の16KiB制限は受理サイズの制限であり、Playwrightによるbuffer前のメモリ上限ではない。

URL異常、送信先逸脱、重複query、legacy/nonce混在、署名否定、期限切れ、oversize、raw error、owner不一致、context/browser終了失敗を拒否する。providerの値・URL・header・body・token・Cookieは結果へ転記しない。contextとbrowserの終了は別々に判定し、不明を成功にしない。注入モデルのassertion自体の失敗も別判定し、期待HOLDに飲み込ませない。

## 検査入口と限界

`node --test tests/issue118-server-callback-candidate.test.mjs`。既存 `node scripts/browser-runner.mjs issue118-live-guards` にも接続する。モデル成功は実SDK callback受理、実JWT署名、Cookie継承、認証、実API/DB、T1成功の証拠ではない。新しいserver候補は旧6293配備を遡って証明しない。

実行可能化には、正規の新Preview配備方法と必要なCLI認証・PC保存範囲の具体承認、実Deployment/SHA/unique URL/branch scopeのfresh receipt、合成target置換と専用modeの有効化に対する別確認が必要。現在の候補をdispatchしても実診断は始まらない。VercelのProject指定は認証権限そのものをProject限定にする保証ではない。既存Secretを取り出したり新branchへコピーしたりしない。
