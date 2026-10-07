# Detailed design / recommendation register

[Requirements](../safety/safety-constraints.md) / [Issues](backlog.md) / [Verification](verification-plan.md)

設計D01–D12はIssue I01–I12に1対1。新しいproduct意味・API・schemaはHUMAN_DECISION_REQUIREDのまま。以下は研究時点の設計で、D01は後続runの[実装結果](i01-result.md)、D02は[実装・隔離DB検証結果](i02-result.md)を持つ。他の設計案を既存動作と誤認しない。

## D01 — Runtime status normalization（I01 / LOCAL_IMPLEMENTED）

Problem/evidence/risk: R02/EX01、未知stringがnegative/publicationへ進むH01。SR-SEM-001/INV01。target: `lib/allergens.ts`内に有効4値判定を1か所で定義し、DB-like stringを受けるcreateStatusBySlugでは不正値をUNKNOWNへ正規化。getUnknownAllergenNames/publicationは有効なCONTAINS/FREE/MAY_CONTAINのみcompleteと数える。effectiveRisk/label/badgeの最終elseをFREEにしない。直接helper callでもunknown側へ倒す。公認4状態の意味・文言・styleを維持する。

Affected: lib/allergens.ts、tests/allergen-display.test.ts、menu-publication.test.ts、public-menu-api.test.ts。API入力は現行Zod/validateAllergenStatusMapのrejectを維持。schema/API shape/UI layout影響なし。不正状態を含むpublic menuは既存404契約へ。migrationなし、rollbackは局所patchだが問題を再導入するためpublic使用の判断と分ける。Open: production到達頻度不明。

TDD_REQUIRED、T01 pure+API。expected REDはunknown→FREE/publication pass。higher-level: valid enum+missing linkのpublic API回帰、必要ならpublic browser。characterization YES: 有効4値・STORE_HANDLED・選択なし・MAY_CONTAIN設定を固定。危険なunknown挙動は固定しない。

## D02 — Resource-scoped final write（I02 / LOCAL_IMPLEMENTED、LOCAL_DB_VERIFIED）

後続runの[実装・検証結果](i02-result.md)を参照。以下は研究時点のtarget design。

Problem: R04 readではid+shop、writeはidのみ。SEC-OWN-001/INV03。target: existing create/read guardを保ち、menu PUT/DELETEの最終Prisma writeと関連links操作を対象id+server shopで同じtx内へ限定。resourceがread後に別shopへ移ったら404相当でtx中止し、linksも元/新shop双方を変えない。Prisma6のunique id+additional shop条件、または先にscoped updateMany結果を確認する方式を局所判断する。失敗mappingを既存404へ揃える。

schema/API/UI変更なし。新汎用ACL/repositoryなし。owner取消の即時性を保証する変更とは分ける（HD-04）。row reassignmentのAPIは現状ないためdefense-in-depth。TDD_REQUIRED T09、実DB実行時のみ専用guardを通す。characterization YES: other shop404/own CRUD/portfolio readOnly。rollback局所、必須認可を弱める旧版へ運用上戻すかは別判断。

## D03 — Menu optimistic concurrency（I03 / BLOCKED HD-02）

Problem: H04/R04、古い全statusで修正を消す。DR-CON-001/INV04。Candidate use case:
`updateOwnedMenu({actor, menuId, expectedRevision, patch}) -> updated | notFound | conflict | validationFailure`。
actorはserver context由来のみ。HTTP bodyでactor/shopを受けない。framework-independent entity/repositoryは不要。Prisma txを利用する。

1. origin/auth/portfolio/input validation。
2. tx内でid+shopのcurrentを読む。expectedRevisionがcurrentと違うならconflict。
3. currentとpatchをmerge、公開条件/画像URL/price検証。
4. id+shop+revisionをpredicateにconditional write、revision increment。count!=1ならthrow conflictでrollback。
5. links置換を同txに実施。DB triggerと最終公開状態をcommit後の独立readで検証するtestを持つ。
6. audit/cacheは外側。clientは409で入力を保持し、最新状態と比較して再入力。自動blind retry不可。

API候補: GET menuにrevision integer>=1追加、PUTにexpectedRevision integer>=1必須、success menuにrevision追加。missing/invalid400、conflict409 `{error:"menu_conflict", message:"他の更新が保存されています。再読み込みして確認してください。"}`。401/403/404/500維持。公開URL変更なし。product確認前にmessageを公開しない。

schema: MenuItem.revision追加。old client対応のexpand→dual→enforce→contract。optional期間はINV04の保証なし。TDD_REQUIRED T03、real PostgreSQL+2tab。characterization YES。rollbackは旧client/古いwriteが再び競合を検知しないためreadOnly/運用停止を伴う判断。DELETE、ShopのOCCは別scope/残課題、同じIssueへ広げない。

## D04 — Freshness measurement and policy（I04 / READY spike, implementation blocked HD-05）

SR-FRESH-001/INV07、R07/R12。production codeを変更せず隔離production buildと配備PreviewでT04/T08測定を設計する。cache fixtureの状態変更をrevision代わりに比較できる。必要な計測追加は別Issue。最大staleness数値とstale時failure behaviorが決まるまでdynamic/polling/TTL変更なし。

TDD_NOT_APPROPRIATE（policy/測定）。alternative: timed integration/HTTP+browser。residual: localとVercel差、offline tab。schema/API/UI影響は現時点なし。characterization YES: current cache/back behaviorを観察するが、無期限staleを正しいspecとしない。

## D05 — Invitation identity contract（I05 / BLOCKED HD-06）

SEC-ID-001/INV09。identity helperをserver auth userIdとcurrentUser.idが一致、primaryEmailAddressId一致のemailが存在しverification.status=="verified"の場合のみ返す案。fallback firstは使わずemail missingとしてaccept existing400、未認証401を維持する候補。既存Clerk signup/OAuthで到達するstatusを専用tenantで確認してから確定。primary変更・provider outageも対象。helperのonboarding callerに波及するため受諾専用helperへ局所分離する選択も可能。

schemaなし、認可条件とaccept error behaviorは変更承認必要。TDD_REQUIRED T05。valid verified pathはcharacterization YES。実Clerk確認なしでaccount exploit修正完了としない。rollback: 不確かなidentityを許可する旧版へ戻す代わり受諾停止を優先する方針を人が決める。

## D06 — Review evidence tied to menu revision（I06 / BLOCKED HD-03, depends I03）

SR-REV-001/DR-PROV-001/INV05/06。schema候補はtarget-schema。最小metadata案と履歴snapshot案を比較し、必要な復元範囲をHD-03で決める。厳格候補は、更新でrevisionが進んだら旧reviewをcurrent確認とは認めず、公開true要求にはその新revisionを対象にreview assertion+basisを同txで保存する。単なる“確認しました”booleanだけで食品真実性を保証しない。価格変更でも再reviewとなる保守的案の負担を店舗実験で確認し、safety-fields-only案へ変える場合は別decisionで対象集合を明記。

API候補: PUTのreview `{confirmed:true,basisKind,basisReference}`。actor/verifiedAtはserver設定、client時刻不可。public DTOへのreview日時/意味の追加は文言承認後。旧updatedAtからreviewは作らない。review書込失敗はfields/links/revisionすべてrollback。supplier原本保存・AI原材料判定はnon-goal。TDD_REQUIRED T11 + UX01/店舗manual。rollback/data privacy/retentionはHD-03未決のためGate5未通過。

## D07 — Comprehension/accessibility validation（I07 / READY research）

PR-SCOPE-001/UX-COMP-001/UX-A11Y-001/INV08。UX01/A11Y01を実行できるprotocolへ渡す。TDD_NOT_APPROPRIATE: 人の理解はcode REDでは測れない。component/E2Eは情報存在・navigationの補助証拠のみ。実験結果・participant privacy・approved wordingをIssueに記録。schema/APIなし、UI本変更は別承認後。rollbackはprototype案を採用しないこと。residual少数/架空task。

## D08 — Incident/restore drill（I08 / READY planning, execution scoped environment required）

OR-INC-001/INV11。既存request log/audit/runbookを使いOPS01を設計。運営者の停止権限を無断追加しない。TDD_NOT_APPROPRIATE（人・権限・運用連携）、alternative tabletop+隔離restore確認。通知/本番DBは別scope。schema/API/UIなし。reversibilityはisolated fixtureのみ、restore訓練後に本番を上書きしない。

## D09 — Release evidence ledger（I09 / READY）

OR-REL-001/INV12。SHA、runtime、lock hash、applied migrations（trigger/index含む）、environment分離、HTTPS origin、critical test run、dependency audit、backup/monitor担当を秘密値なしで記録。TDD_OPTIONAL: 文書とevidence収集。existing tests/CIを利用し、設定の機械化が必要なら専用Issueでtest-firstを判断。schema/API/UIなし。rollbackは文書訂正のみ、cloud変更なし。N/Aではなく未確認を明示。

## D10 — Asset confidentiality and retention（I10 / BLOCKED HD-07）

SEC-ASSET-001/INV10。Option public-photo-onlyなら非公開menuと画像accessが独立と入力時説明し、機密資料をupload対象にしない承認が必要。Option confidential draftならprivate storage/access proxyが必要で、現SDK/費用/URL互換をspike後に設計する。orphan回収は参照全件検査→候補一覧→猶予→再照合→限定削除、race参照保護が決まるまで実装しない。

TDD_REQUIRED for deletion/owner invariants、T06。schema/API/UX影響はoption依存。全Blobをlist/deleteする作業を本runで行わない。rollbackは削除不能、保持またはbackup方針を先に決める。Gate5/6 BLOCKED。

## D11 — Resolve zero-menu documentation discrepancy（I11 / BLOCKED HD-08）

PR-SCOPE-001、R14。productが404を選ぶならguideの0件表示説明とchange-mapを修正しcode変更なし。0件pageを選ぶなら既存route/受け入れ条件を先に定義。TDD_OPTIONALはdocs-only branch、behavior branchはTDD_RECOMMENDED（0件/非active/公開不可/通常menuをAPIとpageで混同しない）。Characterizationはobserved404記録のみ、正しい仕様と承認しない。rollback docs/局所pageのみ。

## D12 — Post-commit outcome handling（I12 / BLOCKED HD-09）

DR-OUT-001/INV13。T07でcommit後revalidate throw/response lossを再現する。候補A: DB確定後のcache失敗を別運用eventとして記録し、既存success bodyを維持（stale publicの検知必須）。候補B: saved=true/outcome=unknown等のcontractを導入（client全変更）。candidate Aが単純だがfailureの意味と公開鮮度に関わり人の判断必要。監査はすでにbest effortであり重複実装しない。

TDD_REQUIRED T07、real DB commit検証+client retry。schemaなしを第一案とする。idempotency key/storeはrequest重複頻度・API policyが必要なため別decision。rollbackは旧500誤認が戻るためblind retryを有効にしない。Known commitと通信喪失で結果不明を同一扱いにしない。
