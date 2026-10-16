# 材料変更の公開確認文：独立反証と隔離ブラウザの記録

2026-10-16 00:24 JST（2026-10-15 15:24 UTC）。**公開確認文と送信設定の不一致を2条件で再現し、先に挙げたUNKNOWN条件は反証しました。コードは未修正です。**

基準mainは `cd502b2404f518975dc4243ab6c41a702e7aa226`。文書branchの確認時点は `521c7fd` で、実行コードは同じです。[判断の入口](../research/engineering/material-change-followup-20261016.md)、[次の実装・検証案](../research/product/public-refresh-and-change-e2e-plan-20261016.md)へ進めます。

## 何を確かめたか

保存前の確認文は `getMenuReviewMessage({ willPublish: isPublished, ... })`、実際の送信設定は `canPublish ? isPublished : false` を使います。食品変更後に`isPublished`がtrueのまま、現行確認が不足して`canPublish=false`となると、画面の公開予定・確認文・送信設定が一致しません。

これは公開漏れを再現した記録ではありません。ブラウザでは不一致2条件ともPUTはfalseで、メモリ内の保存後も非公開でした。実DBのトランザクション・トリガーは今回実行していません。

根拠：[公開予定の導出](../../features/admin/menus/components/MenuEditClient.tsx#L179)、[確認文の呼出し](../../features/admin/menus/components/MenuEditClient.tsx#L322)、[送信設定](../../features/admin/menus/components/MenuEditClient.tsx#L355)、[確認文の関数](../../features/admin/menus/publication-review.ts)、[UNKNOWN選択時の処理](../../features/admin/menus/components/MenuEditClient.tsx#L214)。

## 実UIでの条件と結果

各条件は、全品目が設定され現行の食品確認がある公開中の架空小丼から、別のブラウザcontextで開始しました。C1/C2は編集後に**公開切替ボタンを押さず**保存します。公開切替操作を追加するとstateが変わり、同じ再現条件ではありません。

| 条件 | 保存前の操作 | 確認文と送信・保存結果 | 判定 |
| --- | --- | --- | --- |
| C1 原材料変更 | 原材料を架空R2へ変更。新しい確認記録は入力しない | ボタンは「保存時は公開停止（再確認が必要）」、確認文は「公開する設定で保存」、PUT false、保存後false・outdated | 不一致を再現 |
| C2 変更申告のみ | 文字は変えず、食品変更の申告checkboxを選ぶ。新しい確認記録なし | ボタンは公開停止、確認文は公開、PUT false、保存後false・outdated | 不一致を再現 |
| C3 UNKNOWN追加 | 乳の実UIボタン「未設定」を選ぶ | `setOne`で公開stateもfalse。確認ダイアログ0件、PUT false、保存後false | 先の不一致主張を反証 |
| C4 取消 | C1の操作後、確認ダイアログを取消 | PUT 0件、保存前の公開状態・データが不変 | 対照成立 |
| C5 価格だけ変更 | 価格を710円へ変更 | 確認文は公開、PUT true、保存後true・current | 対照成立 |
| C6 新確認を同時に入力 | 原材料変更、乳CONTAINS、新しい架空根拠・範囲・日時を入力 | 確認文は公開、PUT true、保存後true・current | 対照成立 |

6条件の検査は成功しました。「不具合を修正してテストに合格」ではなく、2件の再現、1件の反証、3件の対照が成立したという意味です。ブラウザ例外0件。外部originへの要求は遮断する構成で、今回の外部要求試行は0件でした。

## 先の3条件という説明を訂正する

先の式だけによる照合は、UNKNOWNを選んだ後にも`isPublished=true`が残ると仮定していました。実際の`setOne`はUNKNOWN選択時にfalseへ変えるため、この仮定は実UIの操作経路に合いません。独立担当がこの状態遷移を指摘し、ブラウザでも反証しました。以後の実装対象はC1/C2とし、C3は修復対象を広げないための対照にします。

独立担当は実ソース式・handlerの14条件と純関数の5項目を確認しました。独立担当自身はブラウザ・DBを実行しておらず、rootのブラウザ確認と証拠を分けています。[独立反証JSON](evidence/20261016-material-change/independent-confirmation.json)を参照してください。

## 環境と証拠

mainを`git archive`で別のscratch領域へ複製し、既存の`ingredient-change-trial.mjs`を変更せず実行しました。接続は127.0.0.1のみ、保存はメモリ内のadapterです。アプリserver・DB・Clerk・Blobのimportを拒否する既存の検査を通して起動しています。Node 22.15.1、インストール済みChrome 155.0.8059.40、既存Playwrightを使用しました。依存の導入・更新、build、generateはしていません。

ビルド済みCSSは既存の隔離作業領域から再利用し、装飾アイコンは省略しました。画面全体の見た目や最新buildの評価ではありません。fixtureのmanifestはGit metadataを持たないscratchのため`sourceHead`が空ですが、別の[ソース保持証拠](evidence/20261016-material-change/source-preservation.json)でmainのtrackedファイル380件とscratchのbyte一致、fixtureが列挙する14ソースの一致、確認文helperのhashを記録しています。

- [ブラウザ6条件の詳細JSON](evidence/20261016-material-change/confirmation-check.json)：実際の確認文、PUT本文、合成応答、保存後状態。
- [fixture manifest](evidence/20261016-material-change/trial-manifest.json)：部品・CSSのhash、Nodeと検証境界。
- [検証driverのソース](evidence/20261016-material-change/browser-driver.cjs.txt)／[起動・終了wrapperのソース](evidence/20261016-material-change/runner-source.cjs.txt)：この計測だけの補助コードを文字列資料として保管。アプリの実装ファイルではありません。
- 初回はsandboxからloopbackへの接続が拒否され、次は実行環境を分けた接続がtimeoutしました。[初回記録](evidence/20261016-material-change/attempt1-sandbox-network-denied.json)と[2回目記録](evidence/20261016-material-change/attempt2-connection-timeout.json)を保持しています。同じ隔離実行contextでfixtureとブラウザを起動した最終回が上表です。最初の失敗をアプリ不具合や成功件数へ数えません。

検査終了後、この作業で起動したfixtureを停止しメモリsessionを破棄しました。通常DB・本番・provider・既存worktreeのソースは変更していません。

## 修復時に必要な確認

確認文・公開予定表示・送信payloadが同じ公開可否の導出を使うよう、対象と例外を揃える案です。単に確認文を非公開へ固定せず、新確認が揃うC6と通常更新C5の公開を維持します。食品変更申告だけで文字が同じC2も扱い、必要な確認を意図せず消さないようにします。

修復後はC1/C2で公開するという誤案内がなく、送信false・保存後非公開が一致すること、C3〜C6が変わらないこと、取消で送信なし、409/不正応答で入力を失わないことを確認します。実DBの不変条件は既存の回帰を再利用します。コード実装はこの記録では行っていません。

反証完了後の[証拠整合レビュー](evidence/20261016-material-change/confirmation-evidence-review.json)もPASS、未解消指摘はありません。これはrootのブラウザを独立に再実行したという意味ではありません。
