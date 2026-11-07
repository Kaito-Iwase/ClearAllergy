# PR #102 最新mainへの適用検証（2026-11-03）

対象mainは `9e22cc237d00cb4f33d6740855db55f60128a0c0`、元PR headは `794961b6cbfaf0ae76c84e081fd2cda0eae247b7`。前候補はtree `4c048474470dcb691b7bb7fa510c2f96213ec79f`、patch SHA256 `2a9c2a714778b14e337284075fa12b4a0c9822ca8a559d9a5b003117df3392f1`です。

前候補のパッチは、新しい隔離worktreeの対象mainで `git apply --check --index` が成功した後、`git apply --index` で競合なく実適用しました。mergeコマンド、commit、push、PR変更は実施していません。前のworktree・パッチ・証拠も保持しています。

## 差分の扱い

前base `9c7262ce3cdf05cabdb04bf311a07f490e75130f` から対象mainへの変更は、PR #124による `.github/workflows/ci.yml` と `.github/workflows/dependency-audit.yml` の `actions/checkout@v6` → `@v7` の2行だけです。

既存パッチが新設するUTC jobにはcheckout v6が含まれていたため、最新mainと同じv7へそろえました。既存build jobとdependency-audit job、全deployment guardと `dependabot/**` は対象mainの内容を保持します。アプリコード、Prisma schema、migration、UTC回帰スクリプト、依存定義・lockfileは前の検証済み候補と同一です。

[checkout v7の公式action定義](https://github.com/actions/checkout/blob/v7/action.yml)で `persist-credentials` 入力とNode 24実行を確認しました。既存どおり通常の `pull_request` と `contents: read`、`persist-credentials: false` を保ちます。GitHub Actionsでの実行結果を示すものではありません。

## 検証

| 今回実行・照合した検査 | 結果 |
| --- | --- |
| 元patchの最新mainへの適用、同一treeのpatch再現 | PASS |
| 最新mainの既存build・依存監査・全deployment guard保持、checkout v7整合 | PASS |
| アプリ・SQL・schema・依存・テストの前候補との一致 | PASS |
| Prisma generate / validate、lint、型検査 | PASS |
| npm test | 263/263 PASS（fail/skip/cancelled 0） |
| npm run build | PASS |
| 空DBでのUTC日時 / DST / 履歴・ACL不変 / DDL待機とrollback / 招待期限 / writer回帰 | UTC・JST・LAの3/3構成 PASS |
| 独立レビュー | コードの未解消指摘0、文書の2件を修正 |
| GitHub上のcheckout v7 / Linux / PostgreSQL 17 | UNVERIFIED |

Node 22.23.4、npm 11.18.0、Prisma 6.19.3、既存のWindowsネイティブPostgreSQL 18.4を使用しました。依存定義・lockfileの一致を確認し、前の隔離環境のnode_modulesを別worktreeへ物理コピーしました。新しい依存は導入せず、旧worktreeの依存や生成Clientを共有しません。DBの再実行後に生成・buildを順次行い、Windows DLLの同時使用を避けました。

今回の証拠はタスクルートの `latest-validation/` に保存しています。

- `static-validation.json`：元patch適用と最新main保持、前候補との実行source一致。
- `checks-final/results.json` と各log：今回の標準コマンドの実結果。
- `ca-utc-db-cf7e2f23-dc99-44a4-b6a3-60c00e74aa25/result.json` と各log：今回の3TZ実行、identity照合、停止・data directory削除。
- `independent-review.json`：新しい読取専用reviewの結果。
- `candidate-manifest.json` と `pr102-latest-main-candidate.patch`：対象SHA、候補tree、patch SHA256、別indexへの再現結果。

前回の標準DB回帰15実行とブラウザ13群＋8群は今回再実行していません。最新mainとの差分がcheckoutの2行に限定され、今回の候補と前候補のアプリ・SQL・schema・依存・テストが同一であることを照合したため、前回の結果は同一sourceに対する参考証拠として明示します。今回実行した3TZ・標準コマンドの結果とは分け、現在のGitHub CIやProductionの成功には読み替えません。

前候補の全記録は[前回の統合検証](utc-timestamp-pr102-20261103.md)を参照してください。実サービス・共有E2Eへの接続は禁止のままです。GitHub上のLinux/PostgreSQL 17とcheckout v7自体の実行は、ローカル検証とは区別します。
