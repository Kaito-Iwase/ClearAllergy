# 公開UIフォント検査の可搬性

2026-10-25 UTC。旧badge期待値を直した `45ab53567e26b8e41570cea47d843ccd3b5df85f` から、`codex/font-portability-local-20261025` で検査scriptと文書だけを変更した。[直前のREDと診断](public-ui-expectations-20261025.md)は当時の結果として保持する。アプリのfont指定、依存、食品表示・公開条件・DB・認証は変えていない。

## 元の保証と原因

[書体変更の記録](../guide/ui-ux-review.md)は、Noto Sans JPを本文・見出し・入力欄へ統一し、同一originから配信すること、`swap` と日本語OSフォントで取得失敗時にも本文を表示することを定める。通常回帰では日本語の実描画がNotoのcustom fontであることをCDPで検査し、Latin shardやCSS family名だけでは合格にしない。過去の補助検査にはWebフォント遮断とCSS zoom 2も含まれる。Arialの導入や強制ロードを受け入れ条件とする記録はない。

`app/layout.tsx` は `Noto_Sans_JP`、`display: swap`、`preload: false`、`adjustFontFallback: false` を指定する。`app/globals.css` のOS代替はHiragino Sans / Yu Gothic UI / Meiryo / sans-serif。現在のTurbopack出力は設定にかかわらず `Noto Sans JP Fallback` の `src:local(Arial)` も含み、computed fontにもこのfamilyが入っていた。生成理由自体のNext内部調査・修正は今回の対象外。

旧検査は `document.fonts.load(getComputedStyle(heading).font, heading.textContent)` で候補列全体を渡した。インストール済みTypeScriptの `lib.dom.d.ts` は `load(font, text?)` を「parametersに渡した全fontsを強制ロードする」と説明する。実ブラウザで、候補列全体とlocal Arial単体はNetworkError、Noto単体は成功した。OSにArial familyはなく、実見出しはNotoで描画されている。任意fallbackの強制ロードが、本来必要なNotoのロード失敗に見えていた。

Context7は利用不可。MDN FontFaceSet.loadとCSSWG CSS Font Loading公式ページを通常経路で取得しようとしたが、両方ともCONNECT 403。公式本文を取得済みとはせず、別経路・資格情報・ネットワーク設定で回避しなかった。ここでの判断は既存コード、インストール済みAPI宣言、同じブラウザでの実測を根拠にする。

## 比較した案

| 案 | 判断 |
| --- | --- |
| 検査を変更しない | 製品に不要なArialを強制ロードする失敗が残り、その後のUIを検査できない |
| エラーをcatch/skipする、実Noto判定を削る | 日本語shard欠損やOS fontへの意図しない切替を見逃すので不採用 |
| 先頭のapp fontだけ待ち、実Noto判定を維持し、遮断時を別contextで検査 | 採用。通常配信と代替表示の保証をそれぞれ明示的に検査できる |

Arialインストールや製品font変更は不要で、行っていない。

## 修正と検査範囲

通常ルートではcomputed styleの先頭familyとstyle/weight/size、実見出しのtextを `document.fonts.load` へ渡す。返ったfacesが空でなく全てNoto Sans JPかつloadedであることを追加検査する。既存の本文/入力欄font指定、CDPのcustom Notoによる日本語実描画、横幅・ロゴ・検索欄の検査は維持した。既存の限定的なDOM置換リトライ以外のエラーは失敗する。

別の新規browser contextでは全Web font要求を遮断し、390/1440px × CSS zoom 1/2 × 5ルートの20条件を検査する。通常版のmain全文と一致し、日本語見出しの各文字に幅・高さのある画面幅内の描画領域があり、CDPが実OS fontのglyphを報告し、横スクロール・文字内容の欠落・client例外がないことを検査する。実際にfont要求が遮断されたことも必須。OS font名は固定しない。今回の環境はNoto Sans CJK JPだった。

通常Noto25条件とOS代替20条件の結果を `CLEARALLERGY_BROWSER_OUTPUT/font-checks.json` に保存し、失敗時もそれまでの結果を残す。店舗ページの4条件は画像を保存する。390px/2xと1440px/1xの画像で、日本語の表示と折返し、状態・品目・注意文を目視した。全Unicode、全要素のglyph、実機・Safari・Windows・ネイティブ拡大や利用者理解度を確認した結果ではない。日本語OS fontがない環境で失敗をskipする仕組みは追加しない。

## 実行結果と残件

修正前の `browser-runner.mjs ui` は最初の表示グループ通過後、106行目のevaluate呼出でNetworkErrorになりRED。外部driverは内部load行109を期待したため行番号assertionも失敗したが、実UIのNetworkErrorとexit 1は保存し、ドライバー側の照合失敗と区別した。

修正後の同じ製品build・専用synthetic DBで、全UI **12グループPASS**。5幅 × 5ルートの通常font、20条件の遮断時表示、設定・食品状態・補足・キーボード・404回復を完走した。通常ルートのclient例外は0。streamed not-foundの回復時だけ、既存検査が対象を限定して許容するReact #419が2件、HTTP200を記録した。今回この許容条件を広げていない。

`npm test` は278 pass / 0 fail / 0 skip、`npm run lint` / `npm run typecheck` / `npm run build` はexit 0。結果JSONの保存に失敗してもbrowserを閉じる終了処理を最後に整え、その後に対象scriptのESLint・Node構文確認と全UI12グループを再実行して成功した。最終実行でもnot-found回復付近のReact #419を2件ログに保持した。相対リンク・参照検査もPASS。DB処理や製品コードは変わらないため、既存統合の時刻・公開DB回帰は繰り返さない。

追加独立レビューは0。既存課題のreview上限は維持し、このテスト変更も最終人間レビュー待ち。完全なGitHub snapshotと実CIのphase/serverEvidence/summaryは引き続き未検証。通常検査の成功をphase receiptに転記しない。旧作業ファイル1件のhash不一致も未解決のまま。push / merge / deploy / 実DB・Clerk・Blobへの書込み / 永続設定変更は行っていない。
