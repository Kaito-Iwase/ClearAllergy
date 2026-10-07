# Target architecture after adversarial review

**A1: 現行feature構成を維持し、根拠のある境界だけ補強する。** approved product semanticsを変えないD01/D02を先行候補とし、conditional設計はHD解決後のtarget extension。導入済みではない。

| Boundary | Responsibility / allowed dependency | Prohibited shortcut |
| --- | --- | --- |
| app pages/API | routing/observability、featureへの委譲 | 新しいpublic semantic policyを定義しない |
| feature UI | input/表示/未保存保護、server DTO | Prisma/秘密値/権限の自己申告 |
| application use case（必要sliceのみ） | server actor、resource、input、policy、tx、result | UI確認を食品review証明とする |
| semantic policy（lib/allergens） | runtime状態正規化、公開完全性、表示投影 | Clerk/Next/Prisma/Blobをimport |
| authentication | Clerk server session/identity | body userId信用 |
| authorization | server actor→active owned shop→resource predicate | platform roleで任意店舗編集 |
| persistence | Prisma schema/tx/DB constraint | mockをatomicity証拠にする |
| external service | 既存Clerk/Blob/Places helpers、失敗分類 | network I/OをDB lock内へ持込む |
| audit/outcome | business確定とsupplementary audit/cacheの区別 | HTTP失敗を常にrollbackと説明 |

```text
app/                                 # 維持
features/
  admin/menus/
    components/                      # 維持、revision対応はHD-02後
    schemas/menu-input.ts            # 維持
    server/
      adminMenuRoute.ts              # HTTP契約・guards、当面既存
      adminMenusRoute.ts             # create/list維持
      menu-update-helpers.ts          # pure merge維持
      updateOwnedMenu.ts             # 将来D03時だけ候補、現時点未作成
  admin/invitations/server/           # 現行compensationを維持
  public/shops/server/                # read目的ごと、共通policy利用
lib/
  allergens.ts                       # D01の唯一のsemantic修正先
  auth/                              # 既存identity/ownership境界
  db/index.ts                        # Prisma直接利用を許可
  storage/                           # 既存Blob adapter
  public-cache.ts                     # 現行、HD-05後に局所変更
  audit-log.ts
  observability.ts
prisma/schema.prisma                 # D01/D02では変更なし
tests/                               # 既存node:test方式
scripts/database-regression.ts       # real DB verification入口を再利用
```

新layerを導入しない理由: 主要pure ruleは既にisolated、auth/storageも共通入口あり。新interfaceのvariation pointを説明できない。D03 use case fileの条件付き理由: transaction内のload/merge/CAS/policy/linksを1所有者へ集め、HTTP処理とcommit/outcomeを混ぜない。これを行わないroute内案でも同じinvariantとtestを満たせるなら抽出不要。

Transaction: menu fields/links/revision/必要ならreviewは同tx、provider callsはtx外。Authはrequest-time server情報、resource制約を最終writeまで維持。Cacheはglobal policy変更でなく測定→HD-05→critical read単位。raw Prisma modelsをそのままpublic/clientへ渡さず現行select/DTOを維持。
