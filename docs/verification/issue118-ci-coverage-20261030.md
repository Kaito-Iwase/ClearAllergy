# Issue #118: 現行仕様とCI検査の対応

基準はmain `524ccdc2380a0854b9ec3ab3d2e3c4764bd514b5`。[公開ルール](../guide/rules.md#publication)と[Issue #118](https://github.com/Kaito-Iwase/ClearAllergy/issues/118)を優先し、研究上の未決事項を実装済み契約にしない。下表は検査の所在と境界であり、特定の実行が成功した証拠ではない。main CIはPRのbaseがmain/developの場合に起動する。`test/staging`の `6293d5a` は2コミット先で、同CIに同branchのpush/PR trigger、Preview表示・Blob分離・配備guard等を追加している。staging固有コードの検証結果はmainの証拠に流用しない。

| 現行の性質 | 既存検査・レベル | 不足と次の優先度 |
| --- | --- | --- |
| 4状態とUNKNOWN、不完全なマスタをFREEにしない | `tests/allergen-display.test.ts`、`tests/menu-publication.test.ts`、`tests/public-menu-api.test.ts` | P0: 境界値と欠損の負例を維持。実食品の安全性は検証外 |
| 保存と別公開、保存済み版との結合 | `tests/saved-menu.test.ts`、`tests/admin-menu-api.test.ts`、`scripts/check-saved-publication-browser.mjs`、`scripts/check-publication-database.ts` | P0: 実画面とAPI/DBを同じ試行でつなぐ検査は未実装。画面検査は架空HTTP、DB検査は別実行 |
| 内容変更は非公開保存し、公開確認は別操作 | `tests/menu-save-plan.test.ts`、`tests/admin-menu-api.test.ts`、`scripts/publication-database-regression.ts` | 今回のAPI負例は、乳状態の変更または既存APIの変更申告と公開要求を同時に送っても確認記録を作らないことを検査。UIの変更申告機能を復活させない。DB triggerの実行は別検査 |
| STOP・旧版・結果不明 | `tests/admin-menu-api.test.ts`、`scripts/check-saved-publication-browser.mjs` | P0: 実app/DBとブラウザをまたぐSTOP・旧フォーム拒否・通信断の一連検査は不足。通常STOPだけでは食品版を進めない |
| 一貫した公開読取と停止後の新規取得 | `tests/public-read-callers.test.ts`、`scripts/check-public-read-snapshot.ts`、`tests/public-menu-api.test.ts` | P0: 既存の実DB競合とcaller検査を再利用。P1: 既開タブ・戻る・通信断を新規GETと別々に測る。既開画面の自動訂正は現行保証ではない |
| 店舗所有・Origin・招待・店舗保存 | `tests/admin-menu-api.test.ts`、`tests/admin-shop-api.test.ts`、`tests/admin-invitation-api.test.ts`、`scripts/check-owned-menu-database.ts`、`scripts/check-shop-database.ts` | P0: 未認証・他店舗・同時更新を既存レベルで維持。Clerkはテストダブルであり、実セッションの検証ではない |
| 画像の入力・保存先・失敗 | `tests/admin-upload-api.test.ts`、`tests/image-url-policy.test.ts`、`tests/upload-image-validation.test.ts` | P1: 実Blobの認証・uploadは別途隔離確認後の少数smoke。mainにstaging専用Blobテストはない |
| 公開検索・設定・レスポンシブ | `scripts/check-first-use-browser.mjs` の `public`、`tests/public-allergen-preferences.test.ts` | P1: 主要導線を保持し、利用者の理解や実店舗での有用性は別途人が評価 |
| 共通食材・旧新在庫・無信号 | #118 T2/T3/対照の架空台帳 | P1: CSVの正解集合は未登録M06を含む4件。無信号を検知成功とせず、混在在庫の対応を新仕様として決めない |

## CIを二段に分ける

1. PRごと: 既存CIの架空データ・使い捨てPostgreSQL・Linux上の固定Playwright/Chromium・lint/typecheck/test/buildを維持。Secretsを使わず、forkやDependabotも同じ検査を受ける。`check-owned-menu-database.ts` は単独Node内でClerk呼出しを差し替え、実DBに対して既存route/所有権を検査する。これは実ClerkセッションやHTTP server全体の検証ではない。
2. 隔離Preview: 確認済みの専用DB・Development Clerk・専用Blob・架空fixtureについて少数の実認証/保存/公開/画像smokeを別途実施する。対象Deployment/source SHA・環境・所有者・cleanupと接続先を先に確定し、実行の可否と結果をPRの無秘密CIとは別に記録する。本人PCの一時セッションへの依存を完成形にしない。

一つの実Next serverに認証テストダブルを注入する方法は未確定。既存のModule loader差し替えはテストプロセスでの証拠であり、ビルド済みNextのmiddlewareとserverに安全に通る証拠ではない。本番認可を弱めるflagやbypassを前提にせず、安全なテスト専用手段が証明できなければ模擬HTTP画面検査と実DB route検査を分離する。

限定小試作: 既存の `6293d5a` のローカルwebpack成果物（模擬フォントで生成）を別Nodeプロセスから読み、Clerk module要求の監視を付けて管理GET関数を直接呼んだ。Clerk moduleへの通常のNode loader要求は観測0件、レスポンスは500で、Nextの実リクエスト文脈がない直接呼出しは実サーバー試験の代替にならなかった。DB設定は架空loopbackで、fetchは遮断した。この結果は他の注入手段の不可能性を証明しない。mainの実サーバー・middleware・実認証は未検証であり、現段階では層別検査を選ぶ。

CI結果にはPR head/base、checkoutされた実SHA（PR merge検証ならmerge SHA）、workflow・lockfile・run IDと検査の実行/未実行を残す。実サービスへの秘密をfork/Dependabotや未検証PRに渡さず、`pull_request_target`で未信頼コードを実行しない。runごとのfixtureを隔離し、未確定writeを盲目的に再送しない。raw credential・cookie・response bodyや実店舗情報を成果物に含めず、CI画面出力は架空データに限定する。

PR毎のtimeoutは現行CIの25分を基準とし、追加検査の時間・失敗率を実測して調整する。再試行で初回失敗を隠さず、環境や接続不足は未確認とする。実CIの所要時間・安定性はこの文書からは主張しない。配備guard、必須check化、実サービスの資格情報とcleanup、食品根拠や鮮度の製品契約はそれぞれ別の承認・判断事項。未採用PR #102/#105/#110/#112やharnessを前提にしない。
