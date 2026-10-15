# Issue #73 独立 read-only レビュー

2026-10-15。round 1。対象: `clearallergy-issue-73`、branch `agent/issue-73-shop-save`、base/未commit時HEAD `e29d24aae0ceec55ff744117f4b58723c1fe2b71`。実装履歴を渡されず、Issue全文snapshot、現行差分、全新規ファイル、関連契約・呼出し元を読んだ。アプリ・テスト・DB・ブラウザの実行、ネットワーク、commit/push、既存ファイルの編集は行っていない。この報告書のみ新規作成した。

## 結論

具体的な欠陥の指摘は **P0:0 / P1:0 / P2:0 / P3:0、must-fix:0**。現行の局所実装と明示された保証範囲は整合しており、Draft PRの準備を妨げるコード上の修正事項は見つからない。これは全受入条件の実環境検証完了やmerge/deployの承認を意味しない。

実PostgreSQLの新規回帰はローカル未実行で **UNVERIFIED**。実DBの競合・Prisma例外・atomicityを確認済みとするには、対象の最終HEADに対するCI stepの実際の成功を別途記録する必要がある。ここはテスト定義の静的レビューとmockの成功で代替しない。

## 読取対象と範囲

- `AGENTS.md`、READMEの入口、`docs/guide/{change-map,product,architecture,rules,development,maintenance,verification}.md`、新規 `docs/verification/shop-save-contract-20261015.md`。
- 全差分: `.github/workflows/ci.yml`、`ShopEditClient.tsx`、`adminShopRoute.ts`、`tests/admin-shop-api.test.ts` と上記変更docs。
- 全新規コード: `features/admin/shop/schemas/shop-response.ts`、`tests/shop-response.test.ts`、`scripts/check-shop-database.ts`、`scripts/check-shop-save-browser.mjs`。
- 関連実装: `AdminShopPage.tsx`、保存しないdemo caller、route wrapper、auth helpers/portfolio、監査、公開cache、未保存保護hook、Shop model、既存招待/Clerk所有情報writer、CI/test DB接続guard、package scripts。
- 変更範囲に依存・schema・migration・メニュー保存/公開条件・認可modelの緩和はない。既存ファイルの未commit差分と未追跡一覧を確認し、`git diff --check` は無出力・exit 0。

## 受入条件と敵対的反例の確認

| 境界 | 反例・根拠 | 判定 |
| --- | --- | --- |
| 古い全量フォーム | 同じ初期版から備考訂正→電話変更、逆順、同じ備考への同時保存。`adminShopRoute.ts:202` で版必須、`:244` で事前照合、`:388` の最終updateはid/owner/isActive/updatedAtを同時条件にする。事前readだけを信頼していない。`tests/admin-shop-api.test.ts:111` / `:140`、実DB script `:54` / `:69` が両順序と同時readを定義する。 | 静的整合。mock証拠あり、実DB未確認 |
| 読取後のowner/稼働/消失 | 読取直後にownerだけ変え、timestampを保っても最終owner条件が不一致になる。稼働false・削除も同様。clientのshopId/所有者指定は採用しない。DB script `:92` / `:135` は実Prismaで干渉を定義する。 | 静的整合。実DB未確認 |
| 単一updateのP2025 | `adminShopRoute.ts:527` はsaved前のP2025を409とする。この経路の業務書込は単一shop.updateで、P2025を出すネスト更新や別の必須書込はない。監査createは共通helper内で失敗を吸収する。一般DB障害は500に残し、成功へ誤変換していない。 | 問題なし |
| clockと精度 | `adminShopRoute.ts:396` はこの経路で `max(Date.now(), existing.updatedAt+1ms)` を明示し、CAS成立時に同値tokenを再利用しない。`tests/admin-shop-api.test.ts:167` は時計後退時の連続保存を定義。既存TIMESTAMP(3)とJS Dateのmillisecond精度は整合する。 | このPUT内の保証として整合 |
| known commit後cache例外 | `adminShopRoute.ts:451` でupdate完了を記録し、`:515` からの公開cache例外だけを200+保存DTO+pendingへ分離。saved後に失敗監査へ戻らない。`:153` のAPI testとDB script `:114` は保存内容と失敗監査不在を対照する。 | 静的整合。実cacheadapter/実DB結合は未確認 |
| 成功DTOから保存基準への境界 | `shop-response.ts:6` はフォーム反映項目を必須で型検査し、`:29` は対象idと進行tokenを確認。`ShopEditClient.tsx:401` より前にtoken/保存基準/Fileを成功扱いへ移さない。確認後 `:407`、`:482`、`:484` で移す。空本文/{} /別店舗/欠落/不正型/古い時刻/pending型不正はnullへ落ちる。 | 問題なし |
| 不正200・結果不明の入力/File | `ShopEditClient.tsx:389` / `:401` / `:489` は500・通信断・不正成功応答を結果不明とし、入力・File・local preview・保存基準を残す。upload成功後にPUTの応答が壊れる反例でもFileは確認成功まで解除しない。画像upload自体の失敗はPUT未要求として別案内。 | 最終ブラウザ証拠と静的実装が整合 |
| 再送禁止・最新照合UX | handler `:351`、全4 save button `:695` / `:740` / `:775` / `:1198` がneedsSaveCheckを共有。`:796` のリンクは別タブ・noopener noreferrerで、元入力を残して手動転記へ案内する。古いtokenを自動更新して再送しない。既知400は訂正可能なまま。 | 問題なし |
| busy/認証/guard | 既存fieldsetのbusy、readOnly、同一Origin→Clerk→所有稼働店舗→portfolio→入力/画像URL guardを維持。最終owner/isActive条件はサーバー由来。実routeのauth queryと入力validatorをmock testsから外していない。 | 静的整合。実provider結合は未確認 |

DTO検査は完全な必須形状・対象・進行tokenの検査であり、返された店舗情報の現実の正しさやprovider/通信の真正性を独立に証明する仕組みではない。レビューでもその保証へ拡張していない。

## 新規検証スクリプト

`check-shop-database.ts:7` はapplication/DB moduleのimportより先に既存CI/test接続guardを呼ぶ。新規の架空run固有User/Shopのみを作成し、`:151` から自身のaudit・Shop・Userをcleanupする。通常DBや共有DBのreset/migration/実Clerk・Blobへの書込を追加しない。

ClerkとNext cacheだけを代用し、route本体・所有権解決query・Prisma・監査は実物を使う。`:73` のinterceptorは本物のfindUnique完了後に2要求をbarrierへ置くため、単に同じtimestampのmock値を返すだけの試験ではない。条件付き競合、owner/稼働/消失、一意制約失敗、cache例外の各assertがあり、他店舗sentinelは全フィールド比較する。単一Shop updateなので、別テーブルの業務書込をtransaction外へ追加する変更はない。

`check-shop-save-browser.mjs` は実ShopEditClient/ReactをChromiumで動かし、fetch・Next link/image/navigationをadapterにする。外部要求と想定外server writeを検出し、loopback fixtureのみに限定する。実Clerk/DB/Blob、Nextの実routing、popupの最新DB内容、アプリlayoutや外部icon fontを検証しないという限界がscript/最終JSON/docsへ明示されている。実DB試験と交換可能な証拠として扱っていない。

## 証拠の照合

レビュー担当は実行していない。以下はroot実行の既存ログ/JSONを読んだ結果。

- `issue73-full-tests.log`: tests196/pass196/fail0/skipped0/cancelled0。
- `issue73-lint.log`、`issue73-typecheck.log`、`issue73-build.log`: 既存のlint/typecheck/Webpack build成功記録を確認。実Node/npm版とrepo基準の差、junctionによるTurbopack制約、同一schema生成済みClientを使いprebuildを省いた点は文書が明示する。
- 最終ブラウザは **`issue73-browser-green-final2/shop-save-browser-result.json`** の18/18、2026-10-15 05:52:05 UTC。pageErrors0、blockedExternal0、unexpectedServerWrites0、390/1440px横overflowなし。
- 現行client SHA256 `69650dc81b31e6a5ac22b7397179c431453bb08d66668c00ba269f468bc3b5a8`、script SHA256 `906b46da267d5701a19c7f79dd7bd07ad148471e19b389f1f69036f4b568ebe4` を読み取り計算し、最終JSONと一致。
- `issue73-browser-green-final` は7/18の旧途中結果で、当時client hashも異なる。現在の成功証拠へ読み替えない。修復前REDや途中失敗を消して最終成功だけがあったとする主張もない。
- 最終409 mobileとpending mobileの既存画像を読取で目視。保持・照合案内と保存済み/反映未確認の表示を確認。スクリーンショットの実フォント/layout差はdocsどおり検査限界。
- Prisma validateはroot側実行・PASSの記録が最終verification文書にある。担当自身は再実行していない。schemaの静的妥当性は実DB競合の成功証拠ではない。

## 文書・保証範囲の最終再読

`product` の競合/結果不明時の手順、`architecture` の最終writeとpost-commit境界、`change-map` のschema/tests/script参照、`development` の実行前提・隔離先・CSS・adapterとCIの説明、`verification` と新規詳細記録を最終再読した。最終18群・Prisma validate・未確認DBの欄は更新されている。必須の確認をGit管理外のローカルartifactだけへ依存させず、再実行scriptと保証範囲をrepo内に残している。

`architecture` と詳細記録は、このtokenが当該PUT限定であり、旧clientは428、旧server混在や日時を戻すSQL・別writer・将来writerの保護を保証しないと明示する。招待/Clerk所有情報writerはフォーム項目を編集しないが、そのupdatedAtまで本変更が単調化したわけではない。mixed deployや全writerのtimestamp保証を達成したという過剰な主張は見つからない。

## 残る未確認境界

1. 新規実DB回帰のCI実行結果・最終HEAD/run URL。ローカルDocker API不応答のため未実行。
2. CIの規定Node/npmと通常Prisma生成・既定build。ローカルの既存結果との差を最終CIで確認する。
3. 実Clerkセッション、実Blob upload、Nextの実管理ルート、再確認tabが読む最新DB、実配備cacheの動作。
4. 旧server/新server混在、直接SQL/別writerの日時巻戻し、既存tabへの訂正配送、孤立Blob回収。
5. 実食品の正確性、未申告材料変更の検知、現場負荷・理解・時短効果。本技術回帰からは推論しない。

これらは確認済みであるという主張がない限り本Draftへの追加コード指摘ではない。受入条件を全面PASSとして閉じる場合、特に1の実際の証拠が必要。
