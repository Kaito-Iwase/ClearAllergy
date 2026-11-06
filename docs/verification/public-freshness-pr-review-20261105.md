# 鮮度試作のDraft公開準備・敵対的セルフレビュー（2026-11-05）

以下の既存節は公開準備と各固定headの記録です。後続のmain取込前の文書整合・検証範囲は[2026-11-06の追補](#main-adoption-review-20261106)へ分けています。

## 比較基点と範囲

確認時のmainは `51adcb23945b80bb34b110d2d0f263d29629a821`、PR #128はDraft・未merge、head `bcc4c0cdd888ecef55e65279d4e4dbd370b0d315` です。鮮度試作はそのheadに依存します。新PRのbaseは#128のbranch `test/practical-e2e-main-20261105`、headは `test/public-freshness-prototype-20261105` とし、#128の32ファイルを新PRの独立差分へ重複させません。#128を採用する判断は本PR作成へ含めません。mainへretargetする前には#128の採用状態・差分・再検証が必要です。

本記録は実装担当によるセルフレビューです。[保存済みの独立レビュー](public-freshness-prototype-20261105.md#実行結果と証拠)や、別途進む独立レビューと区別します。元repoの別作業、#128用worktree、元食品E2E候補を変更しません。

## #128を単独で疑う

| 反証したい誤り | 実コード・証拠の照合と限界 |
| --- | --- |
| 古い版の拒否をSTOP拒否と取り違える | A/B各店で別タブの価格保存後、元editorのPUT409・入力保持・DB read不変を要求し、同じeditorのbodyなしSTOP200と食品内容保持・公開API404を別assertする。STOPにも版照合があるという模擬仕様を追加しない |
| 認可拒否を画面上だけで済ませる | 他店のGET/PUT/DELETE/STOPを404とし、所有者readとの不変比較を残す。匿名管理API401も別条件。Clerk境界模擬なので実Clerkの署名・session検証の証拠にはしない |
| 食品変更が公開されたままになる、UNKNOWNをFREEとして見せる | 実保存後の非公開化・食品版上昇・公開確認版解除、確認panel、別操作の再公開を検査。代表3状態は管理GET・公開API・同じ品目行で照合。UNKNOWNは最新版の公開要求400と新規公開画面からの除去を要求し、UNKNOWNの公開成功を要求しない |
| mock成功を実DB障害や生SQL照合の成功と呼ぶ | 保存失敗1件は500注入。管理GETは永続化の観測で、生SQLによる各E2Eデータの独立照合ではない。実DB制約回帰は別のscriptで保持する |
| cleanupが既存データを消す／監査を残す | run所有の新規User/Shop/Menuと監査だけをcleanupし、既存4model fingerprint・監査残留なし・process終了・一時領域終了を要求する。共有fixtureへの同時書込みは成功にしない。任意の実DBへ流用しない |

#128のLinux既証拠は11/11、unit299/299の対象head・runに限定します。今回の試作CIの結果ではありません。実Clerk、Blob、新規店舗登録、招待、実サービス伝播、人の食品判断は未確認です。

## 鮮度試作を単独で疑う

| 反証したい誤り | 実装・検査と残る範囲 |
| --- | --- |
| HTTP200や呼出完了だけで「更新済み」にする | 対象key・UUID・HTTP意味・schemaを照合し、必要な本文leafのDOM commitまで完了にしない。初期取得・正常404・503・HTML・render失敗を区別する。DOM commitはpaintや利用者認知の証明ではない |
| 古い応答で別画面や停止済み食品を復活させる | 世代・対象・中止・unmountを検査。abortを無視する旧promiseの後着をunitで与え、正常な対象なし適用後にも復活できない負例を持つ。実ブラウザの全配送順序を再現したものではない |
| 本体のupdatedAtだけで店舗内補足の変更を見落とす | 同一RepeatableRead内の完全snapshotを共通loaderで取得。他menuのSTOPでtarget更新日時が不変でも補足が変わるE2Eを持つ。原FREEをSTORE_HANDLEDへ書き換えない |
| 取得失敗した旧FREEを現在の安心へ言い換える | Aは肯定的要約を止め、各行を以前の登録と明示。原状態と既知注意は残すが、旧FREEの読み飛ばし・誤読は未実証。Bは旧本文と既知注意・本文内の確認先も隠す。非表示を「含有なし」と誤読する可能性も未検証 |
| 復帰さえすれば即時・全端末へ訂正が届くとする | manual/focus/visible/persisted pageshow/SPA履歴が契機。表示したまま・JS無効・process休止・実オフライン・復帰前の旧paint・native BFCacheは保証しない。native実復元はpersisted=falseのため1件SKIP。合成イベント成功で置換しない |
| 更新による入力消失を見逃す | 通常再取得の未適用検索文字列は実E2E確認。遮蔽前のfocus移動も確認。未適用個人設定案の全状態は未検証。正常な対象なしでは本文フォームが終了し、その入力案の継続方法は未確定 |

Aは利用者比較の暫定既定候補です。旧FREEの誤読が続き、Bでは注意の消失を安心へ読み替えず確認行動へ進める証拠が出れば、確認先・入力案の扱いも含めて推奨を変えます。両案とも安全性の優位を実証していません。期限秒数・最大許容遅延・自動timeout・定期pollを根拠なく追加していません。

## 統合時の競合・試験の抜け

- #128のpublic/admin spec11件の本文とfixture・所有データguardは変更せず、freshness project7定義を追加します。既存の新規ナビゲーションによる非公開除去と、開いている画面の再取得を別の条件として残します。held-page観察はassertへ昇格させません。
- 公開3pageのクエリ抽出に合わせ、実4caller testと10箇所のmutation参照先を更新します。root-client禁止・distinct tx・要求間snapshot分離・正確なread集合・期待原因検出・復元条件を保持します。
- #128上のローカル結合runは17 PASS・native1 SKIP、unit316（既知EPERM指定1件除外）、実DB37groups、lint・型検査・通常Next設定buildが成功。対応source hashを保持し、今回のLinux CIは公開後の別結果として確認します。
- 生SQLでの全E2E観測、実Clerk、JS無効、実通信断、利用者理解、全ブラウザ・OS、native BFCache、継続閲覧への訂正到達、本番の要求集中・DB待機・取消後SQLの負荷は、この結合成功から証明しません。
- baseに#128固有のCI基盤が必要なため、既存CIと依存監査のpull_request base filterへそのbranch一つだけを追加します。main/develop、監査のhigh閾値・paths、通常製品build、既存DB/browser検査・UTC3job・read-only権限を維持します。手動Actions起動や既知拒否の再試行は行いません。
- 最初に公開するcommitから正確なhead branchの `git.deploymentEnabled=false` を含めます。既存guardは保持し、main/developの既定動作・Project設定を変更しません。公式仕様と設定の照合は実際の非配備観測とは別であり、push後に両Projectのbranch/SHA配備一覧とProduction IDを確認します。merge・手動deployの抑止ではありません。

設定・文書の追加を除く測定済み実装の変更は、この公開準備時点ではありません。新たな不具合を確認した場合は原因・最小修正・再検証を追記し、受入条件を弱めません。Draft作成・CI成功は、製品方針の確定・main merge・本番配備の承認ではありません。

## 公開後の結合確認

[Draft PR #129](https://github.com/Kaito-Iwase/ClearAllergy/pull/129)を#128宛に作成しました。head `7feb5c136e52dd29afa54a7c9387c35ab910b7d4` とbase `bcc4c0cdd888ecef55e65279d4e4dbd370b0d315` のmerge候補 `b7bfa54abb2f73aecd2181af8c853ad2e6cdcc85` で、自動CI全4job・high閾値の依存監査が成功しています。Linux unit317/317・skip0と、既存11件を含むE2E17 PASS・native1 SKIPを確認しました。[具体的なrun・artifact・cleanup・非配備観測](public-freshness-prototype-20261105.md#linux-ci-7feb5c1)を参照してください。

公開準備後のfocused22件も再実行して22/22・skip0、文書リンク365件・40ファイルscope・diff/check・exact branch falseと既存guard不変を確認しました。設定の最初の文字列照合はCRLF checkoutとLF blobの差で失敗し、改行を正規化して内容一致を検査すると成功しました。製品の不具合ではなく、製品コードの修正は伴いません。別途の独立レビュー完了をこの自己レビューから主張しません。

## 2026-11-06 独立レビューで確認された試験の抜け

初回の自己確認と旧17件の成功では、単独FREEと詳細一覧の注記を確認していましたが、混在欄のFREE行と店舗一覧失敗時の除外結果を確認できていませんでした。独立レビューからの2指摘を実コードと修正前に失敗する部品試験で確認し、3表示部品を修正しました。上部件数と関連店舗を含む0件案内まで対象にします。修正中の0件表現の範囲誤りも独立レビューで検出し、関連店舗だけ残る負例を追加して公開前に解消しました。

既存のアレルゲン状態・補足・除外計算・端末設定の意味を変更せず、旧情報の文脈を判定結果と同じ位置へ示す修正です。SSR部品7件、実アプリの追加E2E2件を加え、[修正前後・実行結果・後始末](public-freshness-prototype-20261105.md#review-followup-20261106)を別に記録しました。旧headのCI成功を新しい条件の検証済みという意味に拡張しません。Aの暫定性、継続表示・JSなし・実offline・native BFCache・利用者理解の未確認も維持します。

<a id="main-adoption-review-20261106"></a>
## 2026-11-06追補：main取込前の文書整合と検証範囲

PR #128 head `bcc4c0cd` とPR #129 head `88ca4630` の独立した文書レビューで、現行ガイドの「未採用branch」「main未反映」「取得中・失敗時表示や復帰時挙動は未変更」という説明を、そのままmain取込後の説明にできないことを確認しました。本追補では現行本文を「この変更をmainへ取り込む場合」の動作へ整合させ、旧検証本文・件数・未実施事項は当時の記録として保持しています。これは文書の照合であり、レビュー担当によるDB／ブラウザー再実行ではありません。

PR #128の固定headのLinux11件と、PR #129の固定headのLinux19 PASS・native1 SKIP、後続stagingの観測は[食品訂正の追補](e2e-food-states-20261105.md#linux-ci-bcc4c0cd)と[鮮度の追補](public-freshness-prototype-20261105.md#main-adoption-preparation-20261106)へ分けました。staging由来のsame-origin transportは製品sourceと対応testの2ファイルに限定し、staging専用12ファイルは含めません。後続のroot layout listenerと店舗集計表示の修正・追加回帰は別に検証します。stagingの別構成での成功をmain取込対象そのもののCI成功へ読み替えません。

Aは比較用の暫定設定です。共通公開条件、raw status、既知の注意、実Clerk／Blob書込未検証、食品安全性・連続した最新性の未保証を維持します。公開layoutを離れたSPA復帰は追加負例の検査対象で、実行前の成功を主張せず、従来の公開layout内のSPA履歴成功や合成pageshowから保証しません。

後続の局所修正では関連30件が30 PASS・fail0・skip0でした。旧表示コードに新しい部品試験だけを適用した別worktreeは10件中8 PASS・2 FAILで、店舗内集計と0件の旧情報注記不足を検出しています。型検査と変更TSX等への直接ESLint CLIもexit0です。保存先はworktreeの親の `pr129-refresh-followup-20261106/`（`focused-first.log`、`presentation-before-fix.log`、`typecheck.log`、`lint.log`）です。この関連検査を最終E2E・build・CIの成功へ拡張しません。

この追補時点でPR #128・#129は未mergeです。最終source／文書のSHA・そのCIと件数、mainへのretarget後の検証、merge SHA・main CI・Production deploymentと公開読取の確認結果は未確定です。確定後に対象SHAとrunを本節へ追記し、それまではmain反映済み・Production確認済みとは報告しません。
