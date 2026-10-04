# 空の画像を保存前に拒否する検証（Issue #65）

[Issue #65](https://github.com/Kaito-Iwase/ClearAllergy/issues/65) · [自律開発の検証](../agentic-development.md#検証) · [共通画像validator](../../lib/storage/upload-images.ts) · [回帰テスト](../../tests/upload-image-validation.test.ts)

2026-10-04 JST、main基点 `1830a98fd4f8b60e9621417a5b843a4e42e0d81a` のRepository Improvement Auditで、許可MIMEの0バイトFileが`validateImageFile`から`ok:true`を返すことをfresh再現した。上限サイズだけを確認していたため、[メニュー画像API](../../features/admin/menus/server/uploadMenuImageRoute.ts)と[店舗画像API](../../features/admin/shop/server/uploadShopImageRoute.ts)はBlob処理へ進めた。実Blobへの保存成否は試していない。

## 変更と維持する境界

共通validatorに0バイトFileの拒否だけを追加した。両callerの既存validation失敗経路からHTTP400の`{ error: "画像ファイルが空です。" }`を返し、Blobを呼ばない。許可MIME、上限5MB、非空Fileの判定、未許可MIMEの先行拒否は維持する。

外部Clerk/Blobはテストプロセス内のstubへ置き換える。実アプリのroutes、共有validator、origin/portfolio/所有店舗helperは実行し、DB取得はmockへ限定する。認証方式、所有店舗ルール、URL、JSON形式、provider、schema、migration、依存は変更していない。アレルゲン状態や公開条件、安全・法務文言も変更しない。

## RED → GREEN

focused testsは5組。所有店舗fixtureを現在のClerk ID条件へ合わせたうえでfresh REDを取得した。

| 確認 | 修正前 | 修正後 |
| --- | --- | --- |
| 全5許可MIMEの空File | `ok:true`でFAIL | すべて`ok:false`、PASS |
| 非空PNGと拡張子 | PASS | PASS |
| 未許可MIMEと5MB超過 | PASS | PASS |
| 両APIの空PNG | メニューAPIが200/期待400でFAIL、transport stubを呼ぶ | 両API400・既存JSON形、Blob呼出0、PASS |
| 未認証・所有店舗なし・別origin | 401/403を維持、PASS | 401/403を維持、Blob呼出0、PASS |

修正前5組中pass3/fail2、修正後5/5（fail0/skip0）。未認証等の確認はrequest/DB mockであり、実Clerk tenantの操作証拠ではない。fixture初期設定不足による403はREDの根拠へ含めず、設定修正後の200/期待400を記録している。

```powershell
node --import tsx --test tests/upload-image-validation.test.ts
node scripts/agent-harness.mjs verify --base origin/main --output issue65-final-head.json
```

全gateは既存runnerの非秘密環境で実行し、最終HEAD・件数・CI・独立reviewの結果をPR/Issueへ記録する。runner reportはGit管理しない。ローカルNode22.15.1は指定22.23.1と異なるため、指定runtimeのCI結果と分ける。bundled npm11.19.1とCI/Docker指定11.18.0の方針は[#64](https://github.com/Kaito-Iwase/ClearAllergy/issues/64)へ分離している。

## 未確認・範囲外

実Clerk/Blob、管理ブラウザの画像選択・toast、production配備はUNVERIFIED。今回外部サービスへの書込やDB fixtureの初期化を行わない。全画像decode、非空FileのMIME偽装・破損検出、画像安全性の保証、orphan削除、draft画像の機密性は対象外。機密性/保持の判断は[#45](https://github.com/Kaito-Iwase/ClearAllergy/issues/45) / [#55](https://github.com/Kaito-Iwase/ClearAllergy/issues/55)を維持する。

READMEの既存画像機能・最大サイズ・provider・認可の説明は変わらず、当文書を局所的な入力境界の検証先とする。未公開guide/researchは復元せず[#60](https://github.com/Kaito-Iwase/ClearAllergy/issues/60)の判断を維持する。rollbackでこのguardを削除すると空Fileが再び下流へ進む。通常merge/deployは実施しない。
