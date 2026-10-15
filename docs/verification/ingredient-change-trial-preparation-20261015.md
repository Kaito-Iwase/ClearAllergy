# 一料理の材料変更：準備結果

2026-10-15 JST。以下は演習準備担当の実行記録を基に、統合担当がrepo内の相対リンクと配置状況を同期したもの。演習準備担当は新規の隔離scriptと台本・空票を担当し、アプリ本体の #73 / #74 改修、commit/push/PR作成は担当していない。最終commit/PR/CIは統合担当の報告とPR本文を参照する。

## 成果物

| ファイル | 内容 |
| --- | --- |
| `scripts/ingredient-change-trial.mjs` | 演習準備担当が実装した新規script。実コンポーネントを使うloopbackの `--serve` / `--check`。以下の4文書も統合担当が同じ#74差分へ配置 |
| [進行台本](../research/product/ingredient-change-trial-20261015.md) | 一料理の基本経路、B1–B10分岐、U01–U08/D01–D06の参照、観察・採点・時間・限界 |
| [隔離画面・資料の設計と使い方](../research/product/ingredient-change-trial-fixture-20261015.md) | 最小案の比較、現行部品/DTO、S0–S7、架空A/B資料、起動/終了と補助結果 |
| [匿名記録票](../research/product/ingredient-change-trial-record-sheet-20261015.md) | 空票。初回/補助後、完了/理解、操作/実待ち/模擬待ち、現物相当とアプリの不一致、削除・未実施 |
| `ingredient-trial-review-r1-final-evidence/trial-check.json` | 独立レビュー修復後の最終実Chrome検証。14ソース/CSS/font hash、時刻、13群、8画像、R1–R3の実値、通信遮断 |
| 同ディレクトリ `01-review-queue-390.png` | 進行役の条件設定と再確認一覧。初回回答者へ見せない |
| `02-reviewed-B-detail-390.png` | Bへ変更・確認後の実公開詳細部品 |
| `03-list-320.png` / `03-list-390.png` / `03-list-1440.png` | #74実一覧の3幅 |
| `04-operator-assigned-partial-materials-390.png` | 操作者のB-?割当資料だけ。完全B-1/欠落の解答を表示しない |
| `05-facilitator-only-complete-materials-390.png` | token進行役だけの全資料・現物相当台帳・期待結果。初回回答者へ見せない |
| `06-saved-price-710-detail-390.png` | 710円を実フォームで保存した後の公開詳細 |
| `ingredient-trial-review-r1-red/trial-check.json` | 修復前のR1/R2/R3全FAILと測定source hash |

草案時点ではこの結果報告を含む4文書の相互リンク9/9の存在を確認した。repo版4文書は[研究索引](../research/README.md)・[開発手順](../guide/development.md#browser)・[変更対応表](../guide/change-map.md)から接続済み。全体の配置後リンク数は統合担当の最終検証記録へ分けて残す。#74 helper/実UIと同じ変更内のscriptを組で利用する。下記のJSON・画像・log名はtask-2に保持した実行証拠を指し、repoへ全ファイルを同梱した意味ではない。

## 最小実装の理由

既存公開 `/admin/demo` はreadOnlyで保存せず、DB読取を伴う。新たな公開ルート、材料/在庫schema、供給元連携を作るより、既存 `check-allergen-cards-browser.mjs` と同じTS/Next同梱webpack方式で実部品を取り出す方が狭い。`MenuListPageClient`、`MenuEditClient`、`MenuFoodReviewFields`、`ShopMenuListClient`、`PublicMenuDetailBodyClient` を使う。

#74の `getMenuFoodReviewState` / `toAdminMenuListRow` と現行の食品snapshot・公開条件の純粋関数を使用する。Prismaの型importは消去され、実DB/Clerk/Blob/アプリサーバーのモジュールをimportしない。bundle module graphを検査して禁止対象を拒否する。実SQL・trigger増分・transaction・ロック・認可を再現するものではない。

ソースAから乳使用Bへの一材料変更を、一つの架空料理だけで行う。メモリ内セッション、同origin書込、127.0.0.1専用bind、CSP、ブラウザ外部要求遮断を使用する。進行役の全資料・真値台帳・条件制御は起動時だけのランダムtokenで分け、通常route/DTOには条件別の割当資料だけを返す。サーバー終了で全セッションとtokenの有効性は消える。実参加者の回答の記録機構・録画・解析イベントは追加していない。

## 実行結果

最終実行: **2026-10-15T06:10:36.479Z〜06:10:47.202Z、13群PASS / 8画像**。修復前R1–R3を同一runで全FAILとして記録してから修復した。

- Node `22.15.1`、既存Playwright `1.62.1`、既存Chrome `155.0.8059.40`。
- 基準HEAD `e29d24aae0ceec55ff744117f4b58723c1fe2b71`。#74未commit変更と新規scriptの実ファイルSHA256をJSONに記録。
- 最終script SHA256: `c7d6967371e402d10cdf497335ed1be7cffc9f72e7c9f08d47b2a986bffac5a9`。script・実UI・共通helper・formatterを含む14ソースを記録。
- `node --check scripts/ingredient-change-trial.mjs`、`node node_modules/eslint/bin/eslint.js scripts/ingredient-change-trial.mjs` は個別にexit0。`git diff --no-index --check -- NUL scripts/ingredient-change-trial.mjs` はexit1（新規ファイルとの差分あり）。出力は既存autocrlf警告だけで、whitespaceの指摘はなかった。最初の一括shellの末尾exit0をこのGitコマンドへ帰属した報告を訂正した。
- 320/390/1440pxで横はみ出しなし。ローカルfontの実読込と、編集リンクの全テキスト矩形がボタン内に収まることを確認。初版の一覧/詳細の目視に加え、修復後の操作者B-?資料・進行役全資料・710円の詳細も画像で照合済み。
- 外部originのPOSTは403。検査用の外部ナビゲーションはブラウザrouteで送信前に1件遮断。実外部サービスに送った成功例ではない。
- 初版に加え、修復後の最終scriptでも `--serve --minutes 1` を実起動し、1分後の自動終了exit0を確認した。修復後のmanifestは `ingredient-trial-review-r1-serve/trial-manifest.json`。通常URL `http://127.0.0.1:57281` は終了済みであり、再利用せず起動時の新URLを読む。進行役tokenは証拠へ転記していない。

```powershell
$env:PLAYWRIGHT_MODULE_PATH='C:\Users\kaito\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:BROWSER_EXECUTABLE='C:\Program Files\Google\Chrome\Application\chrome.exe'
node scripts/ingredient-change-trial.mjs --check --icons-root 'C:\Users\kaito\Documents\Codex\2026-10-14\task-2\issue74-browser-artifacts' --output 'C:\Users\kaito\Documents\Codex\2026-10-14\task-2\ingredient-trial-review-r1-final-evidence'
```

上記はこのexecutorの実行記録であり、別PCに同じpathが存在する前提の製品手順ではない。新規install/build/generateは本担当では実行していない。#74担当の既存build成果物と取得済みicon cacheを読んだ。`--icons-root` を省略しても動作し、その場合は装飾glyphだけを省略する。

## 13群の範囲

1. 進行条件の実select/リセット操作と、#74一覧の再確認待ち。
2. UNKNOWN・最新未解決・記録なしの管理発見と公開propsからの除外。
3. 通常STOPは食品確認currentのままで、再確認失効と混同しない。
4. 未申告の現物相当Bに対し旧A表示が残る、検知不能の反例。
5. 実料理フォームへのB材料・乳CONTAINS入力→合成保存→旧確認失効→確認資料/範囲/日時入力→再公開。
6. 実STOPボタンが未保存入力を送らず保持。旧公開タブは自動更新せず、reload後に公開除外。
7. 合成競合409/不正200は入力保持と成功なし、保存済み＋合成反映未完了は別通知。
8. UNKNOWNのまま実公開toggleで公開せず、label付き入力のShift+Tab到達とfocus-visible。
9. 3幅の一覧、実fontと編集文言、架空資料カード。
10. foreign-origin拒否、外部要求遮断、実部品のpageerrorなし。
11. R1: 操作者nav・資料route・通常state DTOから全資料/真値台帳/進行制御を分離。B-?はB-?のみ、未申告はA-1のみ。tokenなし直接URL・JSON・制御403、有効tokenの進行役面では全資料を維持。
12. R2: 実フォームの710円/価格未設定を保存し、公開詳細が既存formatterによる保存済み値と一致。
13. R3: Bのみ/F-02、Aのみ/F-01、旧A新B併存/F-03対応不明、未申告の現物B/申告Aを確認。JSONに進行役専用の実値台帳を残した。

## 途中の検出と修正

- 既定sandboxではChromeのloopback接続が `ERR_NETWORK_ACCESS_DENIED`。同一の架空・loopback検証を承認済み実行で行った。`trial-check-sandbox-blocked.json` を保持。
- 進行条件selectのラベルに選択肢のテキストが混ざり、正確なlabel探索が失敗。fixtureのhtmlFor/idへ修正。`trial-check-r1.json` を保持。
- 初回スクリーンショットで、外部アイコンfontを取得していないためligature文字がボタンを圧迫。最初は装飾glyphを省略するoffline adapterで解消し、最終版は任意の取得済みfont cacheにも対応。既存表示の実font・矩形検査と最終画像で再確認した。アプリの部品や公開文言は本担当で変更していない。

途中の失敗・修正はfixtureの開発であり、食品安全や実店舗の不具合率の観察ではない。

## 独立レビュー round 1の修復

- **R1 / RED:** 通常navから進行役へ入れ、B-?条件でも全B-1/白ごま抜け/未申告の答えを読めた。**修復:** 通常導線・通常state DTOを割当資料だけにし、全資料/進行役GET・制御POSTに起動時tokenを要求。通常DTOはgeneration/menu/master/materials/publicVisible/listRowのみ。`?facilitator=1` の資料/stateと無tokenの制御は403を確認。B-?確認記録の根拠名も、未取得B-1を名乗らずB-?受領メモへ訂正。
- **R2 / RED:** 正常保存710円でも詳細は700円固定。**修復:** `formatPriceYen(m.priceYen)` へ変更し、710円だけでなくnullの「価格未設定」もGREEN。
- **R3 / RED:** staleの現物Bに対して「Aのみ」が残った。**修復:** 各条件の現物相当/在庫/対象提供分を整合させ、アプリ申告を別項目に。未解決はA/B併存でF-03との対応不明、未申告はBのみ/F-02だが申告A。フォームを保存しても現物相当台帳を自動で変えない。

R1のtokenはこのloopback fixtureの表示/制御の分離であり、公開アプリの認可や同じPC・OS・履歴・開発者ツールからの機密保護を保証しない。進行役の全資料/採点票は別PCまたは専用の紙で管理し、初回回答者とPC・ブラウザ履歴・ターミナルを共有しない。操作者の端末で進行役面を開いてから返さない。tokenや採点情報を先に見た回答を未提示条件の初回へ数えない。端末・事前設定・紙資料の授受は参加者実施前に別途整える。

初版10群/5画像と初版source SHAは過去証拠として `ingredient-trial-check` に保持したが、今回の修復後の証拠へ流用しない。進行役の全資料画像・R3台帳JSONは初回回答者へ見せない。

## 未実施と残る判断

実DB・実Clerk/Blob・実公開ルート/HTTP・本番反映・実店舗・実食品・参加者観察・実機/スクリーンリーダー・匿名票への実回答・時間測定・比較効果・独立採点は本担当で未実施。#73の店舗保存3故障系はrootの実装/検証記録を参照する。全25研究試験、D01–D06全件、U01–U08全条件の合格を意味しない。

旧新在庫、未申告、複合材料抜け、FREE/UNKNOWN、STOP/訂正/旧タブを画面または資料カード/台本に含めたが、在庫や現物の自動照合はない。B5の別料理補足、B6の複数条件全件、B7の将来条件、B10の表示比較は準備案に留まり、実行済み条件へ数えない。

#39/#52の対象者・同意・保持削除・rubric/重大誤認の受入閾値は人間判断を残す。準備は進められるが、募集・連絡・健康情報収集・実店舗の継続提供・一般公開判断をこの成果だけで行わない。[独立レビュー原記録](ingredient-change-trial-independent-20261015.md)はround1のP2 3件を保持し、後段のround2に全件解消・追加must-fixなしを記録した。PRで修復と残る限界を報告する。
