# staging初回同期のローカル検証（2026-11-07）

[開発手順](../guide/development.md#staging) · [変更対応表](../guide/change-map.md) · [検証索引](../guide/verification.md) · [CI後配備の境界](../guide/staging-actions.md)

## 対象と作業範囲

既存stagingの履歴を保持して、main #133の採用後SHAを取り込む初回同期です。

- staging基点S: `6293d5a02758f72a7cf00201fec239afc6b699eb`。
- 同期先main M: `1b8e3db06c1009b285c1bb04a3b7bc9920ea8b72`（[main #133](https://github.com/Kaito-Iwase/ClearAllergy/pull/133)）。remote mainを取得して一致を確認しました。
- 共通祖先: `524ccdc`。Sを第1親、Mを第2親にする非破壊mergeで、stagingの履歴を置換しません。
- 作業branch: `ci/staging-sync-20261107`。本記録はローカル検証時点です。push、PR、remote branchのmerge、配備、環境設定、資格情報の利用・保存、DB接続・移行は行っていません。

この同期後の運用は、test/stagingへの変更をCIで検査してから専用Previewと固定URLを確認する流れです。mainからstagingへの自動mergeは追加しません。mainへの採用とProduction配備は別の承認対象です。

## 取り込むmainの変更と保持するstagingの保護

mainの公開画面の鮮度確認・再取得・旧情報表示、hydration前のメニュー編集修正、実保存API用E2E、UTC日時契約と20件目migrationのソース、CI後のremote Preview候補を保持します。migrationのファイル取得とDBへの適用は別です。

次の7ファイルはSとbyte単位で同一です。

- `app/globals.css`
- `components/layout/TestEnvironmentBanner.tsx`
- `lib/test-preview-environment.ts`
- `lib/storage/image-url-policy.ts`
- `lib/storage/upload-images.ts`
- `tests/test-environment-banner.test.ts`
- `tests/test-preview-blob.test.ts`

`app/layout.tsx` はstagingの条件付きテスト帯と、mainの `PublicFreshnessNavigation` の両方を保持します。branchがexact `test/staging`、またはflagが未設定・空・`false`以外の時は専用Preview検査に入り、検証済み `TEST_BLOB_READ_WRITE_TOKEN` を明示します。この検査で不正・欠損・不一致があれば共有token・OIDC・storeIdへfallbackしません。branchが欠損・別branchでflagも未設定・空・`false`なら通常のSDK設定へ進む、Sから継承した境界は残ります。専用token変数の存在だけでは検査に入りません。通常ProductionのSDK設定を変更しません。配備時のbranch metadata/flag、画像の読取許可prefixと実Blob/authの確認は別gateです。

## mergeの意味上の衝突と解消

Gitのテキストmergeでは衝突を検出しませんでした。しかし自動解決した `vercel.json` は、mainの `test/staging:false` の後に旧stagingの同名 `true` キーを残しました。後勝ちのJSON解釈で抑止が失われるため、その自動解決結果は使用していません。

`.github/workflows/ci.yml` と `vercel.json` をMの内容へ完全一致させ、重複キーがないことと、次の完全一致branchがすべてfalseであることを別途検査しました。

- `test/staging`
- `ci/staging-branch-preview-20261107`
- `ci/staging-sync-20261107`

blob IDはCIが `a56333aa6eade37c0be54574472219586c3371d7`、Vercel設定が `14d67c2da840d9e3866f3720af42f9a86f6d90bd` です。同期branchの初回pushもこのfalse設定を含む必要があります。Git接続やbranch限定変数は変更していません。未指定mainのGit配備まで抑止した証拠ではありません。

`development.md#staging` の旧Git自動配備true、旧mainと同じ19件、migration20を取り込まないという現行説明を、今回の同期と未解消のDB差分に合わせました。`change-map.md` と `verification.md` の案内も更新しました。`staging-dry-run.md` の旧CI/Git前提は#130時点の記録と節内でも明示し、現行手順へのリンクを付けました。mainから取り込むアプリ仕様の説明は既存main文書を保持し、保護・意味を変更しないためAGENTS・共通ルール・構成図は更新していません。

## ローカル実行結果

Linuxの独立clone、Node22.23.4、同梱npm10.9.9を使用しました。GitHub CIで使うnpm11.18.0の実行結果ではありません。独立した依存へ `npm ci --ignore-scripts --no-audit --no-fund` を行い、既存lockfileや依存を変更せず、Prisma生成を明示実行しました。

環境は既存CI定義の非実在Clerk値、loopbackの架空CI DB URL、CI/portfolio用フラグに限定しました。実際の環境ファイルやサービス資格情報は取得・コピーせず、DBサービスも起動していません。以下はSとMの最終同期コードで実行した結果です。記録文書の追記は実行コードを変更しません。

| コマンド・検査 | 結果 |
| --- | --- |
| `node node_modules/prisma/build/index.js generate` | PASS。Client生成のみ、migrationなし |
| `node node_modules/prisma/build/index.js validate` | PASS |
| `npm test` | PASS、547件、失敗0・skip0・cancel0。帯・Blob回帰7件を含む |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS。通常のprebuildと既定Next buildを使用 |
| `git diff --check` | PASS |
| CI/configとM、7保護ファイルとSのbyte比較 | PASS |
| JSON重複キー拒否、3branchのfalse、layout両要素 | PASS |

準備段階の旧main `c8ef345` に対する422件の結果は、上記547件へ流用していません。

## 未確認・配備前blocker

2026-11-07に引き継いだ専用DBの確認結果では、`clearallergy_main19` に19件のmigrationが完了し、今回のmainにある20件目 `20261024000000_utc_timestamp_contract` は未適用です。このローカル同期はDBへ接続して再確認していません。配備前に対象を再確認し、承認された移行と適用後検証を行う必要があります。再INIT、seed、resetや旧DBの削除で解消する作業ではありません。

以下はこの検証ではUNVERIFIEDです。

- PostgreSQLの実制約・UTC migration回帰と専用DBへの適用。
- GitHub上の同期commitのCI、branch保護・bypass防止とworkflow有効化。
- 資格情報の安全な受渡し・保存、live変数scope/値、SSOと実Clerk認証。
- 実Blob保存・読取許可、所有権分離、実アプリの保存・公開・STOP。
- Vercelの実remote build、実効SHA、Preview Ready、固定URL、Production。

ローカルbuildやモックテストを外部gateのPASSとして扱いません。source保護、DB移行、資格情報と設定、初回配備の確認前に切替完了・配備可能と報告しません。
