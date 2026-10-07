# Security, supply chain, quality cross-check

これはASVS/SSDF/ISO適合宣言やpenetration testではない。X08は5.0.0の章観点を使用し、未確認の細目番号は作らない。

| Reference / applicable area | CA evidence | Gap / linked action |
| --- | --- | --- |
| ASVS validation/business logic | menu Zod/price/slug/master/publication、R02/R03 | 未知read status、concurrency、T01/T03 |
| ASVS authentication/session/authorization | Clerk server session、owner active shop、platform role、origin、R05 | verified email/実tenant、write-time権限、I02/I05 |
| ASVS file handling | 5MiB/type/signature/HTTPS/store+shop prefix | public draft assetとorphan、I10。signatureは完全decodeではない |
| ASVS API/web frontend | error wrapper、nosniff/referrer/frame、input validators | deployed origin/CSP方針/実auth E2E、I09。CSP欠落だけでexploit確定しない |
| ASVS data protection / logging | secrets server-side、allowlisted logs、R08 | old audit retention/backup権限、HD-04 |
| ASVS configuration / dependency | lock、CI、npm audit、RUN02 | deployment version/protection/support lifecycle未確認、I09 |
| SSDF PO | protocol/requirements/owners/Issue | 人の役割・受入判断HD群 |
| SSDF PS | Git/CI read permission/credential persistence false | artifact署名/branch protection実設定不明 |
| SSDF PW | threat/hazard、verification、pure/API/DB境界 | real provider/cache/UX証拠不足 |
| SSDF RV | dependency audit weekly定義、運用logs | アラートdelivery/triage/修正期限の運用証拠なし |
| ISO25010参考 | functional suitability/reliability/security/interaction/performance/maintainability等の漏れ確認 | 最新abstractだけ閲覧、全subcharacteristic適合評価でない |

Threat actors: unauthenticated attacker、別店舗owner、権限を失ったowner、誤操作する正当owner、侵害されたprovider credential、operator/script。threat surface: JSON/params/formData/localStorage/外部Places response/画像URL/headers/Clerk metadata/DB migration。browser validationをsecurity boundaryにしない。

public検索は登録済み店舗だけ、admin Placesのみ外部Google呼出。追加DBやbackend分離でこれらの入力trust boundaryが消えるわけではない。local rate limitはプロセス内であり分散DoS対策ではない。追加Redisは実abuse/要件/費用なしに決めない。

依存の現状: RUN02で既知vulnerability 0、lock固定値はrepository-evidence参照。Next/Clerk/Prisma/Blob/Neon/Vercelのsupport期限、実配備のpatch/region/backup/secret rotationはUNKNOWN。過去audit結果を再利用していない。最新advisoryを最小権限で再取得したが、provider outageの不存在は証明しない。

QAの反証: testsがGREENでもEX01が再現する。したがってcoverage率や件数をsafety caseの主根拠にしない。重要failure example単位のtestを追加する。
