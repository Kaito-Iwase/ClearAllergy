# Traceability matrix

Evidence→Hazard→Requirement→Invariant→Design→Expected Test→Issueを結ぶ。Code Ownerは**コード上の責任箇所**であり人への割当ではない。新提案ファイルは未実装と明示。実装後のcommit・passing test・higher-level run・claim更新欄はbacklogの各Issueへ追記する。

| Evidence | Hazard | Requirement | Invariant | Design | Verification Level | Expected Test | Code Owner | Issue / ready |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R02,EX01,RUN03,RUN05 | H01 | SR-SEM-001 | INV01 | D01 | Unit/API | T01 RED→GREEN、境界ケース補強、RUN05全133件PASS | lib/allergens.ts、publicMenuRoute | I01 LOCAL_IMPLEMENTED / [#37](https://github.com/Kaito-Iwase/ClearAllergy/issues/37) |
| R03,R12,RUN03,RUN05 | H02 | SR-PUB-001 | INV02 | D01/D09（既存gate維持） | Unit/API/DB/E2E | T01 API404 PASS、T02/T10別 | lib/allergens、public server、publication SQL | I01局所PASS、I09 READY evidence |
| R04,R05,RUN04,RUN05 | H03 | SEC-OWN-001 | INV03 | D02 | Authorization/API/DB | T09 API RED→GREEN13/13、RUN05実DB18 PASS、実ハンドラ404・no partial mutation | adminMenuRoute、admin-auth | I02 LOCAL_IMPLEMENTED / [#38](https://github.com/Kaito-Iwase/ClearAllergy/issues/38) |
| R04,X13 | H04 | DR-CON-001 | INV04 | D03 | Real DB/API/E2E | T03 | menu route、MenuEditClient、schema、候補updateOwnedMenu | I03 BLOCKED HD-02/spike |
| R08,R11,X01/X02 | H05 | SR-REV-001 | INV05 | D06 | Policy/DB/User | T11/UX01 | publication policy、候補review record | I06 BLOCKED HD-03 |
| R08 | H05/H09 | DR-PROV-001 | INV06 | D06 | DB/manual | T11 | schema、候補review write | I06 BLOCKED |
| R07,R12,X12 | H06 | SR-FRESH-001 | INV07 | D04 | HTTP/browser experiment | T04/T08 | public pages、public-cache | I04 READY spike / impl BLOCKED |
| R01,R11,X01/X05/X06 | H07 | PR-SCOPE-001/UX-COMP-001 | INV08 | D07 | User experiment | UX01 | public-prototype、public UI、product owner | I07 READY research |
| R11,X07 | H07 | UX-A11Y-001 | INV08 | D07 | Component/E2E/manual | A11Y01/UX01 | public/admin components | I07 READY research |
| R05,R06,X14 | H03 | SEC-ID-001 | INV09 | D05 | Authorization/API/provider | T05 | getCurrentClerkIdentity、accept route | I05 BLOCKED HD-06 |
| R09,X15 | H08 | SEC-ASSET-001 | INV10 | D10 | API/realBlob/DB/manual | T06 | lib/storage、upload routes | I10 BLOCKED HD-07 |
| R08,R06 | H09 | OR-INC-001 | INV11 | D08 | Operational/manual | OPS01 | observability/audit、運用runbook | I08 READY planning |
| R10,R13,RUN01/02,X09 | H10 | OR-REL-001 | INV12 | D09 | CI+manual | REL01/T02 | CI/scripts/release owner | I09 READY evidence |
| R04,R07 | H04/H09 | DR-OUT-001 | INV13 | D12 | API/DB/E2E | T07 | menu handlers/client/cache | I12 BLOCKED HD-09 |
| R02–R12,INF01,RUN03/RUN04/RUN05 | H01–H06 | AR-BOUND-001 | INV14 | ADR-001/D01–03 | Policy/DB/code review | T01 PASS、T09 API/隔離DB PASS、T02/T03の広い保証は別 | lib/feature/server境界 | I01/I02局所PASS、I03 BLOCKED |
| R14 | H07 | PR-SCOPE-001 | INV08 | D11 | Docs/conditional page | 0件404/空表示比較（I11） | guide/rules、PublicShopDetailPage | I11 BLOCKED HD-08 |

重要invariantにtest入口があることは**設計traceability**。T03/T04/T05/T06/T07/T11のcontract未確定や未実行をpassing evidenceとしない。全体G6はPARTIALLY_READY。

Implementation closure fields（各Issueで後から埋める）: commit SHA、test file/test name、RED failure reason、GREEN run ID/date、real integration target、human validation結果、updated claim ID、remaining risk owner。空欄のままsafety caseをSUPPORTEDへ昇格しない。
