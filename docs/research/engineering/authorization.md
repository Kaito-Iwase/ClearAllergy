# Authorization and mutation inventory

R05/R06。AuthenticationはClerkのserver session、店舗認可はactive owned shop、運営認可はserver currentUser publicMetadata.role。client shopId/roleだけでは許可しない。portfolio許可は追加制限であり所有権を代替しない。

以下の表は研究時点のinventory。後続I02でPUT/DELETEの最終 `id+shopId` 条件をローカル実装した。API mockの結果と専用DB未実行の限界は [I02結果](../implementation/i02-result.md) を参照。表のid-only writeは現在のコード状態ではない。

| HTTP / entry | Actor → resource → permission | Writes / side effect | Existing verification / gap |
| --- | --- | --- | --- |
| POST /api/admin/menus | requireShopId + origin + portfolio → own shop → create | MenuItem+links tx、audit、cache | admin-menu-api mock |
| PUT /api/admin/menus/:id | same guards→id+shop read→update | id-only update+全links置換tx | 他店404回帰。write-time再検証/並行性gap |
| DELETE /api/admin/menus/:id | same→id+shop read→delete | links+menu tx、audit、cache | read他店拒否。tx writeはidのみ |
| PUT /api/admin/shop | same→server shop→edit | shop update、audit、published menu invalidation | admin-shop-api。owner変更同時性未検証 |
| POST /api/admin/upload-menu-image | same→shop prefix→upload | public Blob、audit。menu ownershipでなくshop所有 | admin-upload-api / image policy |
| POST /api/admin/upload-shop-image | same→shop cover prefix→upload | public Blob、audit | 同上 |
| POST /api/admin/invitations | origin + platform + portfolio → target shop → invite | pending DB/Clerk、補償、audit | admin-invitation-api、実Clerk未確認 |
| POST /api/admin/invitations/:id/resend | same→invite/shop→resend pending | Clerk revoke/create、conditional tx replace、補償 | race mockあり |
| POST /api/admin/invitations/:id/revoke | same→invite→revoke pending/retry revoked | DB先行拒否→Clerk revoke→ID clear | race+外部失敗mockあり |
| POST /api/invitations/accept | origin + portfolio + server identity/email → matching pending invite | expiry更新、lock→User/Shop/Invite tx | email verification明示なし、T05 |
| POST /api/admin/auth/login | origin + rate limit → auth event/current session | auth補助/監査、一部Clerk照会 | auth-audit-api、secret非漏出 |
| POST /api/admin/auth/sso | origin + rate limit → event/current session | 開始/失敗report、検証済みsession audit | 成功自己申告だけでは記録しない |
| POST /api/admin/register | origin/入力/rate/portfolio response/registration guard | denied監査はあり。business作成はdisabled guard後で到達不能 | 停止分岐、古い作成コードをcurrent機能扱いしない |
| POST /api/admin/onboarding | origin/portfolio/identity/入力/rate/registration guard | identity照会/denied audit、作成はdisabled | 同上 |
| GET /api/admin/invitations | requirePlatformAdminApi → invitation list | findMany+serialize、DB更新なし。portfolio mutation guardはGETにない | expiry更新はPOST作成/受諾経路であり一覧GETではない |
| その他GET | public / own shop read、admin Places認証 | query/外部Places、observability | resourceのprojectionを確認 |
| 運用scripts/seed/migrations | operator credentials → DB/Blob全域 | bulk/補正/削除/DDL | API認可を通らない。専用target guardと人のscope確認 |

上表は17routeファイルのHTTP入口と運用writeを含む。GETも呼び先まで確認し、一覧GETやgetCurrentAppUserはread-only、明示的provisioningとは分離されている。page内はread/redirect、管理demoはreadOnly UI、Server Action mutationは見つからない。

## 残る境界

SEC-OWN-001: I02でwrite条件へresource ID+server shopを含めた。認可判定とwriteの間でowner/isActiveが変わる問題は、単なるshopId追加では解決しない。現在owner移転APIは見つからず、DB/operatorが変更する条件をT09 API mockで再現した。専用DB回帰の定義は追加したが実行は未確認で、scopeを区別する。

SEC-ID-001: 招待のemail一致は“serverが返した文字列”というだけで所有の証明ではない。primary emailのverificationを明示的に要求する案はHD-06（認可ルール変更）。Clerk設定が常にverifiedを保証する可能性がcounter evidence。アカウント乗っ取りが実証されたとは報告しない。

platform adminの緊急停止権限は現行に追加しない。HD-04で、既存ownerによる非公開・運営者の限定DB操作・新しい停止権限の選択を行う。
