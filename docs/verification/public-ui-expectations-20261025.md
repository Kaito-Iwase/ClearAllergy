# 公開UI検査の旧バッジ期待値とLinuxフォント検査

2026-10-25 UTC。main `0b6ed291b2fd853230c7efdeeb1e061815404a81` と5候補のローカル統合 `26b255d25f613ffcdc614959a4fce69f684ca6f2` を比較した。修正は統合候補から分けた `codex/ui-regression-expectations-local-20261025` のテストと検証文書のみ。製品表示・食品文言・公開条件・認可・DB・依存・安全設定は変更しない。

## 原因と仕様の出典

修正前の `scripts/check-public-ui-browser.mjs` 66行目は、架空の照り焼きチキンカードに `/特定原材料：含む/` を要求していた。76行目は架空パンケーキカードに同じバッジがないことを検査していた。

しかし、[2026-10-22の承認済み店舗管理変更](store-management-20261022.md)は、品目別の「含む／含む可能性あり・要確認」を残し、重複する上段badgeを除くと記録している。mainの祖先 `f34add6c93118be4afdee7c3679b73d7296860b0` は `ShopMenuListClient` の当該badgeを削除している。現在の[製品説明](../guide/product.md#preferences)と[表示対象のルール](../guide/rules.md#allergens)も、確認対象と各状態の品目・件数、その他の注意情報の別表示を定める。過去の2026-10-07記録のbadge説明を現行仕様へ戻さない。

実表示は「確認対象：特定原材料（9品目）」の下に「含む」「卵（1品目）」「含む可能性あり・要確認」「小麦・乳（2品目）」が並ぶ。「その他のアレルゲン」には大豆・鶏肉とごまを別集計する。`ShopMenuListClient.tsx` と `MenuAllergenSummary.tsx`、旧検査scriptはmainと統合候補で同一だった。

別worktreeのmainをビルドし、その19 migrationsだけを適用した空の使い捨てDBに既存CIの架空3メニューを作った。統合候補には別の20 migrationsのDBを作った。両方で同じ `browser-runner.mjs ui` の66行目が失敗した。ログはcheckoutの絶対パスと架空データの更新時刻だけを正規化すると一致する。統合による表示変更ではなく、削除済みbadgeを要求する既存テストの不一致と特定した。

## 最小修正

旧badgeの2つのassertionを、現行表示の強い検査に置き換えた。

- チキンの主な確認対象の登録行を、状態・品目名・件数の配列として完全一致で検査する。行の欠落・余分な行・その他品目との合算は通らない。HTML整形用空白だけを除く。
- パンケーキの主な登録表示を「確認対象は原材料に含まないと登録されています。食品安全の保証ではありません。」と完全一致で検査する。その他の大豆のCONTAINS表示も既存assertionで維持する。

assertionの削除・skip・弱い部分一致への変更は行わない。元からある対象範囲、その他品目、主な品目と件数の検査も保持した。仕様やコマンドは変わらないためproduct / rules / architecture / development / AGENTSの本文は更新不要。検証入口からこの記録を追加する。

## RED / 限定GREENと残るFAIL

同じ架空DB・製品buildを使った修正後のUI検査は、最初の登録表示グループを通過した。これは上記2assertionのGREENであり、UI全体の成功ではない。次の320pxフォント検査にある `document.fonts.load(getComputedStyle(heading).font, heading.textContent)` で `NetworkError` が出たため、以降のUI全項目は未検証のまま。

外部の読み取り専用browser probeでmainと統合候補を比較した。両buildのCSSは `Noto Sans JP Fallback` を `src:local(Arial)` として定義し、computed fontにはNoto本体とこのfallback等を含む。両版とも以下を確認した。

- font候補列全体の `document.fonts.load` はNetworkError、失敗したFontFaceは `Noto Sans JP Fallback`。
- `new FontFace(..., 'local(Arial)').load()` もNetworkError。
- Noto Sans JPだけを指定した同じ日本語文字列のロードは成功。
- Chromium CDPは実見出しの描画をcustom Noto Sans JPとして報告し、woffの通信失敗はなかった。

したがってこの後続失敗は、全候補列を強制ロードする検査と、このLinux環境のlocal Arial不在の組合せで再現する。実Notoの配信失敗や統合の食品表示変更とは区別する。診断probeはテストを変更するものではなく、UI全体のPASS証拠にも用いない。Googleの外部icon CSSは従来どおり遮断し、外部通信を許可して解消していない。Arial導入やfont検査方法の変更は今回含めず、別途判断する。

修正後の通常検証は `npm test` が278 pass / 0 fail / 0 skip、`npm run lint` / `npm run typecheck` / `npm run build` がexit 0。`node scripts/browser-runner.mjs allergens` は17グループ成功した。allergensは実componentsとbuild CSS、架空propsによる回帰で、実DB・認証・保存・Next routingを検証した結果ではない。相対リンクと参照検査も成功した。

今回の検査は修正したscriptのhashを記録し、commit後の同ファイルとの一致を照合する。元の統合候補のDB時刻・公開状態・HTMLエラー回帰はそのSHAの証拠として保持し、新SHAの未実行phaseへ転記しない。今回の変更は検査scriptだけで、DB契約を変えないため、元の3タイムゾーン移行回帰は繰り返さない。

## その他の未確認

親がLibrary正規ツールで取得し9チャンクで渡したZIPの保存済み実物を再照合した。この追試でLibraryから再ダウンロードしたわけではない。48463 bytes、SHA-256 `982f0d43f8b6b32a6e07cfd93ed99f548863a4762754da47a25b6a0f9f3078cb`、CRCとmanifestの11ファイルが一致し、元#105 HEADにpatchを別indexで適用したtreeも `ba497e70e3fb8d708daaac73301d1c704af85bc6` と再一致した。

旧作業ファイルのhashは別の証拠である。14ファイル中13個はGit blobそのものまたはCRLF化で照合できるが、`tests/verification-evidence.test.ts` の旧hash `ceba913596ca786f4cbe3ae1672e62f0fb8fa0eaf2441142cdd9992326e1e320` は不一致。受信blob等のraw/LF/CRLF/末尾改行/BOMを比較した21通りでも原因を特定できない。元working fileの実物はなく、改行差と推測して解消済みにはしない。元commit objectの取得も未確認。

harnessの完全snapshot不足・API403は未解決。phaseやCI情報の捏造・回避は行わない。追加独立レビューは実施せず、元課題のレビュー回数をリセットしない。Linux停止判定とこのテスト修正を含む最終人間レビューは未実施。push / PR更新 / merge / deploy / 実認証・DB・Blob書込み / 永続環境設定変更は行わない。
