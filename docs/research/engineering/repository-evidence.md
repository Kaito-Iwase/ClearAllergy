# Repository forensics

以下は研究runのsnapshot。後続I01の変更は[実装結果](../implementation/i01-result.md)を参照し、研究時点の反例EX01と現在のコード動作を混ぜない。

[Inventory](inventory.md)は222ファイル（app/components/features/lib/prisma/scripts/tests/.githubのTS/TSX/MJS/SQL/Prisma/YAML）、17 API route files、25 test files、16 migrationsを静的棚卸しした。全fileを逐語レビュー/実行したという主張ではない。critical write/read/guard/projectionを本文の経路で深掘りし、純styling・全履歴・外部状態は対象範囲を限定した。

再現用snapshotは [baseline-files.json](../baseline-files.json)。既存103 status行を保持。生成前から未コミット変更が存在し、HEADだけのpermalinkは正確な証拠にならない。新規研究の登録に必要な `.gitignore` の限定allowlist以外の設定は変更しない。

## Evidence anchors（行番号はsnapshot時、symbolを優先）

| Evidence | Source anchor | Observed control/data flow |
| --- | --- | --- |
| R02 | lib/allergens.ts:111 createStatusBySlug、246 getAllergenEffectiveRisk、280 statusLabelJa、350 getUnknownAllergenNames、405 getMenuPublishValidationErrors | missingをUNKNOWNで初期化→stringを型assert→UNKNOWNだけ除外→不正stringはFREE fallback |
| R03 | prisma/schema.prisma MenuItem/AllergenStatus、20260622000000…SQL unpublishIncompleteMenus | COMMIT時遅延check→不完全isPublished false+AuditLog（同tx） |
| R04 | adminMenuRoute.ts:190 read、403 tx、405 id-only write、473 revalidate | auth.shopIdでread、tx外でmerge、tx内delete/create links、commit後audit/invalidation |
| R05 | admin-auth.ts getCurrentAdminContext、getCurrentAppUser.ts:14/88 | server auth userId→user→owner active shop。primary email fallback first、verificationは未参照 |
| R06 | invitations.ts:189 tx、198 FOR UPDATE NOWAIT、248 shop update | pending invite lock→shop/user検査→ownerとacceptedを同tx。SQLにpending email/shop部分unique |
| R07 | app/(public)/shops/**/page.tsx revalidate/dynamic、lib/public-cache.ts | 60/force-static、対象+店+一覧+dynamic page pattern invalidation |
| R08 | audit-log.ts writeAdminAuditLog、observability.ts:53/85 | best effort audit、request scope、metadata allowlist |
| R09 | upload-images.ts uploadImageToBlob、image-url-policy.ts sanitizeStoredImageUrl | authenticated shop prefix→signature→public put→URL返却→別HTTPでDB保存 |
| R10 | scripts/database-regression.ts runDatabaseRegression、CI | 実DB trigger/lock/rollbackの定義とfixture guard。RUN01はこのscriptを実行しない |
| R11 | MenuEditClient.tsx:300/330、publication-review.ts | confirmはbrowserだけ、全status送信、schemaに確認根拠なし |
| R12 | PublicMenuDetailPage、publicMenuRoute、PublicShopDetailPage、PublicShopListPage | 各DB取得→共通publishability→projection、別menu補足は別query |
| R14 | PublicShopDetailPage.tsx:163 vs guide/rules.md publication | publishableMenus.length===0で404、guideは0件表示ありと説明 |
| R15 | google-places.ts:71 fetch | 管理候補はGoogle Places POST/no-store、明示AbortSignalなし |

## Current stack / configuration

lock: Next16.3.4、React19.2.7、Clerk Next7.5.13/Backend3.11.0、Prisma/Client6.19.3、Hono4.13.7、Blob2.5.0、TS6.0.3、Tailwind4.3.2。declared rangeとlockを混同しない。RUN01 Node22.15.1、repository指定22.23.1の差あり。

Secrets値は取得・出力していない。source内の設定名: DATABASE_URL/DIRECT_URL、CLERK_SECRET_KEY、BLOB_READ_WRITE_TOKEN、ALLOWED_IMAGE_URL_PREFIXES、PORTFOLIO_MODE、PORTFOLIO_EDITOR_APP_USER_IDS、GOOGLE_MAPS_SERVER_API_KEY等。設定存在/正しい接続先/secret rotationはUNKNOWN。`next.config.ts`はnosniff/referrer-policy/admin frame制限、CSP/HSTS一律追加なし。`proxy.ts`はadmin/auth/acceptのみ。公開閲覧のClerk依存は限定的だがlayout等の実配備通信は未測定。

Server Actionsの `use server` はapp/features/lib検索で見つからない。write入口はHTTP Route Handler。Hono handlerはfeature/serverにあり、app/api wrappersはobservabilityを付ける。Server ComponentsはPrismaを直接読む。Client ComponentsはHTTPとlocalStorage/位置情報/UI状態を扱う。React cacheの管理contextを永続的な認可cacheと断定しない。

R02のmaster検証はslug集合をALLERGEN_MASTERから導出する一方、件数比較と一部説明にliteral 29がある。現masterも29なので現在の不一致ではないが、将来品目変更で件数/集合/DB masterがずれる保守risk（RQ-20）。I09のmaster照合対象へ含め、現時点で品目や法的scopeを勝手に変更しない。将来のmaster変更Issueでは導出可能な件数を重複固定しない。

## Smell hypotheses

| 仮説 | 判定 | Evidence / consequence |
| --- | --- | --- |
| UIに公開ruleしかない | CONTRADICTED | R02/R03/R04 server/DBにもある |
| UIに確認workflowが閉じる | CONFIRMED | R11。APIから原材料のみ変更可能。製品上違反かHD-03 |
| Route Handler責務集中 | SUPPORTED | menu更新でvalidation/merge/auth/write/audit/cacheを統合。行数だけでなくtx境界が読取りを囲まない点 |
| Prisma couplingが有害 | OPEN | serverに直接依存するがDB invariant検証には実Prismaが必要。抽象化のbenefit未測定 |
| Clerk/Blob couplingが全層に漏れる | CONTRADICTED（全面） | lib/auth、lib/storageがある。UI auth SDK依存は機能上必要 |
| 所有権check重複は全部悪い | CONTRADICTED | 中央actor解決とresource絞り込みは異なる責任 |
| Publication ruleが重複 | 部分的SUPPORTED | query/projectionに繰返し、中心policyは共有。SQLとTSは同一ではなく意図した多層防御 |
| Allergen mappingが一貫 | CONTRADICTED | EX01でsummary unknown / effective FREE |
| Validation rule一致 | OPEN | menu Zod+helper、shop別validators。省略契約は同一でない |
| Transaction境界なし | CONTRADICTED | atomic writesあり。ただしstale read/provenance/postcommit境界gap |
| Hidden side effectsなし | CONTRADICTED | invite作成/受諾のexpiry更新、audit、revalidation、Clerk補償。招待一覧GETにはDB更新なし。mutation台帳参照 |
| Testabilityが低いのでrewrite必須 | CONTRADICTED | 124既存tests、pure helpers、real DB harnessが既存 |
| 状態遷移が全く不明 | CONTRADICTED | publish+unknown自動非公開、inviteenumあり。食品review状態は未定義 |

## 限界

実DB接続/データ読取/ブラウザ/実Clerk/Blob/Google/配備/運用訓練は未実施。全git historyの意図を推定しない。文字列検索でnegative resultを保証しすぎない。test harnessのmodule loader mockはactual SDK、transaction isolation、cacheを再現しない。
