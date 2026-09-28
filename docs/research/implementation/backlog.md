# Implementation backlog — issue register

I01–I12はこの研究内の識別子であり、GitHub番号ではない。I01は[GitHub Issue #37](https://github.com/Kaito-Iwase/ClearAllergy/issues/37)で[ローカル実装・検証](i01-result.md)済み。I02は[GitHub Issue #38](https://github.com/Kaito-Iwase/ClearAllergy/issues/38)で[ローカル実装・API検証](i02-result.md)済みだが専用DBは未実行。I03–I12も2026-09-28に起票済み。Evidence IDsの出典は [register](../03-evidence-register.md)、現在の保証と提案を区別する。Issueの作成は実装承認や検証完了を意味しない。

| Backlog | GitHub Issue | 現在のゲート | 提案Milestone |
| --- | --- | --- | --- |
| I01 | [#37](https://github.com/Kaito-Iwase/ClearAllergy/issues/37) | local commit `111817e`、未push | M0 |
| I02 | [#38](https://github.com/Kaito-Iwase/ClearAllergy/issues/38) | local commits `03d39d4`/`242a0c9`、実DB未検証・未push | M0 |
| I03 | [#48](https://github.com/Kaito-Iwase/ClearAllergy/issues/48) | BLOCKED HD-02 | M2 |
| I04 | [#49](https://github.com/Kaito-Iwase/ClearAllergy/issues/49) | 測定設計READY、cache変更BLOCKED HD-05 | M1 → M2 |
| I05 | [#50](https://github.com/Kaito-Iwase/ClearAllergy/issues/50) | BLOCKED HD-06 | M2 |
| I06 | [#51](https://github.com/Kaito-Iwase/ClearAllergy/issues/51) | BLOCKED HD-03/I03 | M2 |
| I07 | [#52](https://github.com/Kaito-Iwase/ClearAllergy/issues/52) | 研究設計READY | M1 |
| I08 | [#53](https://github.com/Kaito-Iwase/ClearAllergy/issues/53) | 計画READY、訓練は環境・HD-04待ち | M1 → M3 |
| I09 | [#54](https://github.com/Kaito-Iwase/ClearAllergy/issues/54) | 証拠収集READY | M0 → M3 |
| I10 | [#55](https://github.com/Kaito-Iwase/ClearAllergy/issues/55) | BLOCKED HD-07 | M2 |
| I11 | [#56](https://github.com/Kaito-Iwase/ClearAllergy/issues/56) | BLOCKED HD-08 | M2 |
| I12 | [#57](https://github.com/Kaito-Iwase/ClearAllergy/issues/57) | BLOCKED HD-09/HD-05 | M2 |

M0–M3は[移行計画](migration-plan.md#proposed-milestones)の**提案上の段階**。2026-09-28時点のGitHubリポジトリにはMilestoneが0件で、IssueへのMilestone設定・期限は行っていない。

## Epic / dependency / ordering

| Epic | Purpose | Issues | Exit |
| --- | --- | --- | --- |
| EP01 | 不正値を誤ったnegativeへ変換せず、店舗境界を最終writeで維持 | I01 → I02 | pure/API回帰と必要な実DB認可検証 |
| EP02 | 同時更新とcommit後failureの意味を明確化 | I03、I12 | HD-02/09、実DB競合・障害試験 |
| EP03 | 情報の確認根拠と配信鮮度を説明可能にする | I04、I06（I03依存） | HD-03/05、review記録と測定された配信条件 |
| EP04 | 人の理解・招待identity・画像公開範囲を確定 | I05、I07、I10、I11 | HD-01/06/07/08、必要なhuman/provider検証 |
| EP05 | 配備とincident対応の実証可能性 | I08、I09 | scoped drill、release evidence |

**最初の実装: I01。** 誤ったnegative表示はH01に直接つながり得る。EX01で局所的に反証済み、schema/API変更への依存がなく、mapping→publication→public responseという小さな縦の経路を守れる。Learning valueは不正値の境界と既存test gapを実際のregressionへ結び付ける点。発生頻度不明を深刻度の確定値へ変換しない。

LOCAL_IMPLEMENTED: I01、I02（ともにlocal commit済・未push。I02のT09実DBは未実行）。READY research/planning/evidence: I04/I07/I08/I09。BLOCKED implementation: I03/I05/I06/I10/I11/I12、およびI04のcache変更。Issueの作成可能性と実装許可・配備許可は別。

各Issueの実装完了時に追記: commit、RED test名/失敗理由、GREEN run日時/結果、higher-level検証先、残存risk、Claim更新、Traceability更新。単なるチェック済み表示で埋めない。以下の「RED」は設計であり本runでtest codeを書いたものではない。

## I01 — 未知アレルゲン状態をnegative/publicationへ通さない

**Status:** LOCAL_IMPLEMENTED / D01 / [GitHub #37](https://github.com/Kaito-Iwase/ClearAllergy/issues/37)。以下は実装前に確定したIssue仕様。実装結果は [I01結果](i01-result.md)。Context/current（研究時点）: 通常入力はenum検証されるが、既存pure helperはDB-like stringをcastし、未知値をFREEや公開可能へ進める。EX01で確認した。Why/risk: H01/H02、未確認を原材料に含まないと誤読させる防御欠落。

**Evidence / requirement / invariant:** R02/R03/R12/EX01 → SR-SEM-001/SR-PUB-001/AR-BOUND-001 → INV01/INV02/INV14。Target: 有効4状態以外はUNKNOWN扱い、公開不可、negative文言なし。共通pure policyを維持し、HTTP/DB/認証への依存を持ち込まないことをdiff reviewでも確認する。

**Scope / target area:** lib/allergens.tsのruntime正規化・公開検証・label/effectiveRisk/badge、tests/allergen-display.test.ts、tests/menu-publication.test.ts、tests/public-menu-api.test.ts。呼び出し元全検索で直接helper利用も確認。Non-goals: 4状態の意味・公開文言・UI layout・schema・master品目数・認可の変更。

**Constraints / guidance:** 既存のUNKNOWNの意味へ倒す。有効値判定を局所共有し、FREEを明示条件にする。入力Zod rejectと出力normalizationを混同しない。追加依存・汎用repositoryは不要。API shapeは維持、不正public recordは既存404。Migration: data/schema migrationなし。

**Verification-first plan:**
- TDD_REQUIRED / T01。Unitで意味、APIで公開漏れを検証する。
- Preconditions/input: 全masterをFREE、eggのみUNRECOGNIZED、名前は非空。null/empty/missing/各slug置換も対照。public APIには同じDB-like fixtureを渡す。
- Expected: normalized egg UNKNOWN、publication false、effectiveRisk UNKNOWN、label/badgeは既存UNKNOWN表現、API404。
- RED reason: 現在はEX01の通りpublication true/effectiveRisk FREE。compile errorやmock load errorをREDに数えない。現時点でGREENなら呼び出す経路とassertionを再確認する。
- Why it proves behavior: helper call回数ではなく返却意味・公開可否・HTTP結果を観測する。
- Higher-level: 有効enum/missing relationを含むpublic API回帰、必要なpublic browser状態確認。SQL enumとの境界はT02を維持し、DB制約をmockで証明しない。
- Regression/characterization REQUIRED: 正常FREE/CONTAINS/MAY_CONTAIN/UNKNOWN、STORE_HANDLED、選択なし、includeMay設定を保持。未知→FREEはbug側。
- TDD exception: None。

**Acceptance:** 上記RED→GREEN、未知値がnegativeへ進む全対象helperを検索照合、有効4状態の表示不変、既存124件からの増減を説明。コード変更時のlint/typecheck/test/buildを実行し、未確認browser/実DBは分離記録する。
**Dependencies:** なし。**Rollback:** 局所patchを戻せるがH01再導入を伴うため、公開利用の停止判断と分離。**Docs:** guide/rulesの不正値扱い・guide/verification・research R02/EX01/C関連claim/traceabilityを実装結果へ更新。**Open:** 実配備での到達頻度は未確認。

## I02 — メニュー最終書込みをserver店舗条件で限定する

**Status:** LOCAL_IMPLEMENTED / DB_UNVERIFIED / D02 / [GitHub #38](https://github.com/Kaito-Iwase/ClearAllergy/issues/38)。以下は研究時点のIssue仕様。後続の結果は [I02結果](i02-result.md)。Current（研究時点）: 事前readはid+shop、PUT/DELETEの最終writeはidのみ。Why/risk: H03、read後の対象変更時に境界が弱い。通常他店舗拒否は存在し、認可欠如とは主張しない。
**Evidence / requirement / invariant:** R04/R05 → SEC-OWN-001/AR-BOUND-001 → INV03/INV14。
**Target behavior:** server解決shopに属する対象だけを最終write。事前read後に対象shopが変わったら404、fields/links/deleteすべて無変更。

**Scope:** features/admin/menus/server/adminMenuRoute.ts、関連API tests、専用DB regression。Non-goals: owner移転機能、ACL framework、招待条件、owner取消即時性、shop更新のOCC。
**Guidance / constraints:** tx内でid+shopの最終write条件またはconditional update結果を確認し、失敗時はthrowしてlinksもrollback。DELETEも同様。Prismaの既存エラー処理と404 mappingを整合。actor/shopはserver由来。API/schema/UI変更なし、data migrationなし。

**Verification-first plan:**
- TDD_REQUIRED / T09、Authorization+API+real DB。
- Preconditions/input: owner Aがmenu Aをread。barrier後に専用DB fixtureでmenu.shopIdをBへ変更し、AのPUT/DELETEを続行。
- Expected: 404、Bのmenu/linksは不変、他のA menuも不変。通常A操作は成功。
- Expected RED: id-only writeがBへ移った対象を変更/削除する。現行APIに移転機能はないため到達scopeは明記。
- Why this level: resource ownershipとrollbackの最終結果が主題でありmock call countだけでは不足。API mockはHTTP分岐の補助。
- Higher-level: 接続guardを通す専用PostgreSQLでinterleaving、未認証/他店/portfolio readOnly回帰。
- Characterization REQUIRED: 401/403/404と成功DTO、partial omission、画像owner検証、公開条件を維持。
- TDD exception: None。

**Acceptance:** PUT/DELETE両方でrace拒否・no partial mutationを確認、通常CRUD不変、既存guard維持、lint/typecheck/test/build。実DB未実施なら認可検証完了としない。
**Dependencies:** I01推奨順序だが技術依存なし。**Rollback:** 局所差分、認可を弱める戻しの運用判断は別。**Docs:** guide/rules認可、guide/verification、authorization/traceabilityを更新。**Open:** owner/isActive自体のwrite-time変更はHD-04と別issue。

## I03 — メニューrevisionによる競合検知

**Status:** BLOCKED HD-02 / revision ownership spike / D03。Current: 全statusを古いformから置換し、txはatomicでもlost updateを防がない。Risk H04。
**Evidence / requirement / invariant:** R04/X13 → DR-CON-001 → INV04。
**Target:** 同revisionからの競合更新は成功1件、他409で入力を保持。意図せず他人のCONTAINSをFREEへ戻さない。

**Scope:** MenuItem.revision候補、menu GET/PUT/client、関連triggerとのrevision整合、tests。候補のfeature use case抽出はtxが複雑になる箇所だけ。Non-goals: event sourcing、全model OCC、DELETE revision、backend分離。
**Guidance:** [target-schema](target-schema.md)のspikeを先に行いapp/DBのrevision増分責任を決める。expectedRevision+id+server shop CAS、fields/links同tx、count不一致rollback。409契約・missing revision400と旧client移行を承認してから実装。
**Impact:** schema/API/client変更、公開URL維持。expand→read support→client update→enforce→contract。optional期間はINV04未保証。旧値のbackfill=1は歴史的更新回数ではない。

**Verification-first plan:**
- TDD_REQUIRED / T03、real DB+API+2tab E2E。
- Preconditions/input: rを得たA/B。A egg CONTAINS、B古い全FREE+price変更をbarrierで同時submit、順序双方、異menu対照。
- Expected: 一方409、勝者fields/linksのみ保存、敗者入力保持。triggerの自動非公開もrevision契約に整合。
- RED reason: 現行はrevisionがなく両成功/上書きがあり得る。schema未導入compile failureで止めず、振舞いが欠けることを示す。
- Why level: isolation/CAS/deferred trigger/rollbackはreal PostgreSQL必須。
- Higher-level: 2tab、旧client互換、deploy mixed versions、conflict再読込と再編集。
- Characterization REQUIRED: partial payload、null画像、公開400/implicit unpublish、401/404を保存。lost updateは保存しない。
- Exception: None。

**Acceptance:** HD-02とrevision増分責任確定、T03全順序とtrigger case、旧client移行証跡、409 UX、通常checks、schema validate/generateを承認scopeで実行。
**Dependencies:** spike、HD-02。**Rollback:** enforce解除はlost update再導入。旧writerを止める/readOnly条件を定めてから戻す。列削除は別contract phase。**Docs:** API/guide/rules・development・verification、schema design/ADR/traceability。**Open:** trigger double increment/未増分、旧client期限。現状は追加architecture検討なしのREDへ入れないためG6不可。

## I04 — 公開情報の実配信鮮度を測定し契約を決める

**Status:** READY measurement design / cache implementation BLOCKED HD-05 / D04。
**Context/why:** revalidate60は開いた画面や直接DB更新を含む最大60秒の保証ではない。H06。
**Evidence / requirement / invariant:** R07/R12/X12 → SR-FRESH-001 → INV07。
**Scope:** T04/T08測定計画・結果、public-cache/public pages/read flow観察。Non-goals: 無承認TTL/polling/dynamic変更、本番データ操作、cache製品追加。
**Guidance/impact:** 隔離production build/Previewでfictional fixture、時刻同期、操作/response/body/supplementの時刻を記録。直接SQLやoutageは許可されたテスト環境だけ。現段階schema/API/UI変更なし。

**Verification-first plan:**
- TDD_NOT_APPROPRIATE: 許容stalenessの意思決定と環境依存の観察でありcode REDだけでは定義できない。
- Alternative T04/T08: publish→update→unpublish、DB直接更新、別menu補足、2tab/back/focus/offline、DB障害を比較。main/supplementの読取間で更新するcaseも含む。
- Expected observation: 各経路の古い情報が残る時間と条件を記録。HD-05前にPASS閾値を作らない。
- Higher-level: Vercel配備環境とlocalの差を比較、製品担当が停止要件を承認。
- Characterization REQUIRED as observation: stale挙動を正しい仕様として固定しない。
- Exception residual risk: 実測最大は上限保証ではなく、CDN/ブラウザ/offline差が残る。

**Acceptance:** 再現手順・時間系列・環境・limitsを提出しHD-05を決める材料になる。未実行は未実行と記録。**Dependencies:** scoped environment、数値契約はHD-05。**Rollback:** fixture回復だけ、prod変更なし。**Docs:** cache-freshness、open-questions、guide/architectureの承認済み鮮度説明。**Open:** 許容age、offline時の表示、緊急撤回。

## I05 — 招待受諾のverified identity条件を確定・強制する

**Status:** BLOCKED HD-06 / D05。Current: primary選択+first fallback、emailのverificationは明示検証しない。実Clerk設定が到達を遮断する可能性あり。Risk H03。
**Evidence / requirement / invariant:** R05/R06/X14 → SEC-ID-001 → INV09。
**Scope:** getCurrentAppUser/getCurrentClerkIdentity、accept route、影響するonboarding caller、auth/API tests。Non-goals: 全認証刷新、既存ユーザー一括取消、未実証の攻撃成功主張。
**Target/guidance:** HD-06案はserver auth IDとcurrentUser.id一致、primary存在+verifiedのみ採用、first fallback禁止。全caller変更かaccept専用helperかを影響調査で選ぶ。schemaなし、認可/API error意味の変更は事前承認。invalid identityでUser/Shop/Inviteを変えない。

**Verification-first plan:**
- TDD_REQUIRED / T05、Authorization/API+専用Clerk tenant。
- Preconditions/input: 同emailのpending invite、primary verified/unverified/null/failed/欠損、first emailのみ一致、ID不一致。
- Expected: verified+identity一致だけ成功、他は承認した401/400等、DB不変。
- RED reason: 現helperはverificationを捨ててメール一致へ進む見込み。普通のClerk flowで発生するかは別検証。
- Why: API doubleは条件強制、real tenantはprovider invariantとsignup/OAuthの整合を示す。
- Higher-level: primary変更、provider outage、既存invite revoke/resend race、ロック/rollback。
- Characterization REQUIRED: 正常verified受諾、期限切れ/取消/他email拒否。Exception None。

**Acceptance:** HD-06、専用tenantの到達性調査、denied no-write、正常受諾、必要checks。mockのみならprovider保証はUNVERIFIED。**Dependencies:** HD-06/scoped tenant。**Rollback:** 受諾停止を含む安全な戻しを事前決定。**Docs:** guide/rules認可、invitation/API/verification説明、research claim。**Open:** primary未verifiedを許す実設定と既存ユーザー影響。

## I06 — メニューrevisionに確認根拠を結び付ける

**Status:** BLOCKED HD-03 + I03 / D06。Current: updatedAtとbest effort auditは原材料確認履歴ではない。Risk H05/H09。
**Evidence / requirement / invariant:** R08/R11/X01/X02 → SR-REV-001/DR-PROV-001 → INV05/INV06。
**Scope:** 承認されたreview metadataまたはMenuReview snapshot、保存/publish use case、店舗review UI、public projection（承認後）、retention。Non-goals: 食品検査、supplier原本保管、AI推定、自動的な安全認定。
**Guidance/impact:** [target-schema](target-schema.md)の選択肢をHD-03で確定。server actor/time、review対象revision、basis kind/referenceを同txへ。歴史不明のupdatedAtをverifiedAtとしてbackfillしない。schema/API/UI変更、旧データの段階移行/保留が必要。価格変更でもreview invalidationするかは人の判断。

**Verification-first plan:**
- TDD_REQUIRED / T11、pure policy/application+real DB。UX01店舗確認を併用。
- Preconditions/input: rのreview後にr+1原材料更新、旧assertion再送、review insert failure、price-only/image-only、legacy row。
- Expected: HD-03対象集合に従い旧reviewをcurrent扱いしない。actor/timeはserver。失敗時fields/links/revision/review全rollback。
- RED reason: review model/現在性制約が未実装。承認specがないままtest expectedを創作しない。
- Why level: 時点対応とatomicityはDB、確認作業の理解/負担は人。
- Higher-level: migration/backfill/rollback drillと店員task。
- Characterization REQUIRED: 承認対象外の更新や公開条件の既存意味を維持。Exception None。

**Acceptance:** HD-03、retention/privacy/復元範囲、schema/API契約、T11と店員task、移行完了条件が確定してから実装受入。**Dependencies:** I03、HD-03。**Rollback:** 記録を消さず機能停止/旧projectionへの戻し。旧版による無review更新を許す条件は未決。**Docs:** rules/publication、API、schema、operations、safety-case。**Open:** 現在metadataか履歴snapshotか、確認対象集合、保存期間。G5不可。

## I07 — 状態理解とアクセシビリティの検証

**Status:** READY research / D07。Risk H07。Current: 注意文・色以外の表現はあるが理解度のE6なし。
**Evidence / requirement / invariant:** R01/R11/X01/X05/X06/X07 → PR-SCOPE-001/UX-COMP-001/UX-A11Y-001 → INV08。
**Scope:** [UX protocol](../product/ux-risk.md)のfictional task、当事者/保護者/スタッフ、mobile/keyboard/screen reader。Non-goals: 実食、臨床安全認定、無承認の公開文言変更、参加者への自動連絡。
**Guidance:** 同意・匿名ID・最小記録。FREE/UNKNOWN/MAY/STORE_HANDLED・対象外アレルゲン・更新時刻・店舗確認を理解rubricで評価。schema/API変更なし、UI案は隔離して扱う。

**Verification-first plan:**
- TDD_NOT_APPROPRIATE、User Experiment UX01/manual A11Y01。
- Reason: 正しいDOMと人の安全判断は同じ測定対象ではない。
- Alternative: 初期探索6–8当事者/4–6保護者/4–6店舗、順序counterbalance、task完了/誤認理由/確認行動/critical errorを記録。募集成立数と母集団差を明記。
- Higher-level: 補助component/E2Eはlabel/focus/非色表現のみ。人の理解の代用不可。
- Characterization NOT REQUIRED as code: 現画面baselineの観察記録は必要。
- Residual: 少数/架空task/観察効果/重症度差、0誤認でも安全保証不可。

**Acceptance:** 同意と実施scope、rubricと結果、未解決誤認、次の文言判断を記録。自動テストだけでcloseしない。**Dependencies:** 実施は参加者・HD-01/承認rubric、設計は着手可。**Rollback:** 実験案不採用、記録の同意に従う削除。**Docs:** ux-risk/claims/open-questions、承認後のみguide/UI文言。**Open:** 臨床用途へ進むか、許容critical error、対象者範囲。

## I08 — 非公開化・復旧・外部障害の運用訓練

**Status:** READY planning / execution needs scoped environment、HD-04 / D08。
**Evidence / requirement / invariant:** R06/R08 → OR-INC-001 → INV11、H09。
**Context/target:** audit/requestId/runbookはあるが、対象特定→止める→新規read確認→復旧を実行した証拠が不足。担当者が実行できる形にする。
**Scope:** 既存runbook/tabletop、隔離restore、招待provider取消失敗、非公開確認。Non-goals: 無承認緊急admin権限、prod停止/restore/通知、食品事故対応の専門判断。
**Guidance/impact:** 架空incidentと最小fixture、actor権限/対象/時刻/確認方法/連絡担当を定義。schema/API/UIなし。

**Verification-first plan:**
- TDD_NOT_APPROPRIATE / OPS01 operational drill。人の権限/手順/復元をunit REDでは確認できない。
- Alternative: 対象menu/requestId特定、既存ownerで非公開、fresh public read、Clerk failure時local revoke維持、隔離backupから復元後にtrigger/index/data整合確認。
- Expected failure: 不明な担当/権限不足/復元不整合/古い公開表示が露呈し得る。
- Higher-level: HD-04の運用目標と測定時間比較。機能fail injectionは関連API test。
- Characterization NOT REQUIRED as code、baseline手順記録は必要。
- Residual: tabletopは実障害圧力/全provider停止を再現しない。

**Acceptance:** drill記録、gap/担当/次のIssue、未実施の明示。本番でやったと表現しない。**Dependencies:** HD-04/隔離環境の実施scope。**Rollback:** 隔離fixtureのみ戻す。**Docs:** 既存operations/runbook、audit-observability、safety-case/traceability。**Open:** 停止権限、検知閾値/担当、復元目標。

## I09 — 配備条件と制約のEvidence ledger

**Status:** READY evidence collection / D09。Risk H10/H02。
**Evidence / requirement / invariant:** R03/R10/R13/RUN01/RUN02/X09 → OR-REL-001/SR-PUB-001 → INV12/INV02。
**Current/target:** repoのSQL/CI定義と実配備を区別。HEAD+dirty、runtime、lock、適用migration/trigger/index、checks、backup/monitorをsecret値なしで追跡する。
**Scope:** release ledger/CI evidence/readonly settings確認。Non-goals: cloud設定変更、無断migration、audit fix、依存更新。schema/API/UIなし。
**Guidance:** 現Node22.15.1対指定22.23.1を明記。必要な読取権限がなければUNKNOWN。SQL定義の存在をappliedとして扱わない。code master集合・literal29の件数検証・DB masterの一致をT02で照合し、将来品目変更を今回のscopeへ混ぜない。

**Verification-first plan:**
- TDD_OPTIONAL / REL01+T02。文書照合はmanual、trigger/lock/制約の実動作は既存guard下のreal DB。
- Preconditions: 同一release SHA/lock/runtimeと許可されたtest DB、prodの読取可能な適用履歴。
- Expected: 値差・不足・未実施を検出してrelease条件から分離。自動schema変更なし。
- RED: 新code規則を作らないため不要。制約testは既にGREENでもよく、不適用DBでは正しく失敗するか確認。
- Higher-level: CI required checksと配備実体/backup証拠のmanual確認。
- Characterization NOT REQUIRED: 動作変更なし。Exception: optional文書作業、制約実証は省略不可。

**Acceptance:** ledgerの日付・scope・出典・unknown、T02実施/未実施、secret非掲載。**Dependencies:** 読取access、DB test execution scope。**Rollback:** ledger訂正のみ。**Docs:** development/verification/operationsへの参照、security/repository evidence。**Open:** 実配備SHA/制約/alerts/backupの現在状態。

## I10 — Draft画像の公開範囲とorphan保持方針

**Status:** BLOCKED HD-07 / D10。Risk H08。
**Evidence / requirement / invariant:** R09/X15 → SEC-ASSET-001 → INV10。
**Current/target:** Blob putはaccess public、menu非公開とは独立。targetは承認したconfidentiality/retention contractであり、private化が決まったわけではない。
**Scope:** public-photo-only説明案またはprivate draft設計spike、orphan候補一覧と参照race保護。Non-goals: 無断Blob全削除/provider交換、未知のSDK互換を仮定。
**Guidance/impact:** HD-07後にschema/API/URL/費用/UI影響を具体化。回収は候補→猶予→再照合→限定削除。今はfull implementation readyではない。

**Verification-first plan:**
- 削除/owner invariant実装はTDD_REQUIRED / T06。説明のみのbranchはTDD_OPTIONAL+human review。
- Preconditions/input: 自店/他店prefix、draft、保存失敗、参照復活race、差替え。real Blobは専用store。
- Expected: 他店拒否維持、参照ありは削除しない、承認外の露出がない。public-onlyならdraft GET拒否を要求するtestは誤り。
- RED reason: 認可の既存部分はGREEN、retention防御やprivate条件は未実装/未確定。
- Why level: URLの実配信・削除・参照raceはAPI mockだけでは観察不可。
- Higher-level: CDN/実Blob+DB、許可画像の店舗理解。Characterization REQUIRED for現owner/URL validation。Exception None for deletion code。

**Acceptance:** HD-07、URL互換/retention/復旧条件、T06、既存upload回帰を確定してから実装。**Dependencies:** HD-07/provider spike。**Rollback:** deletion不可逆なので保持/backup条件を先決、private移行戻しは承認範囲に限定。**Docs:** image/API/運用/UX、asset claim。**Open:** 画像の機密性、猶予、race、復元可能性。

## I11 — 公開メニュー0件の店舗ページ仕様を一致させる

**Status:** BLOCKED HD-08 / D11。Risk H07（仕様の誤認）。
**Evidence / requirement / invariant:** R14 → PR-SCOPE-001 → INV08。
**Current:** guideはactive shopの0件表示を説明するがpageはnotFound。**Target:** HD-08で選んだ404または空状態を文書・page・検証に統一する。
**Scope:** guide/rules、PublicShopDetailPage、必要ならpage test。Non-goals: 検索公開条件/URL/API全変更。schemaなし。
**Guidance:** 404なら本文訂正だけ。空表示なら先にempty-state contract・店舗補足情報の扱いを決める。実装を理由に404を承認済みとしない。

**Verification-first plan:**
- docs-only TDD_OPTIONAL、behavior変更 TDD_RECOMMENDED。
- Preconditions/input: active shop+0menu、active+全非公開/不完全、inactive、正常公開menu。
- Expected: 承認branchの404/空状態、inactive非表示、通常menu不変。
- RED reason: 空表示branchは現pageがnotFoundになる。docs branchはcode RED不要。
- Level: page integration/component + browser、理由はAPIでなくpage独自分岐。
- Higher-level: 検索からの遷移/直接URL/モバイルempty状態。
- Characterization REQUIRED if code changes: 正常/inactive境界。既存404を正当仕様として先に固定しない。Exception none/optional docs。

**Acceptance:** HD-08記録、guideと実挙動一致、branchに応じたchecks。**Dependencies:** HD-08。**Rollback:** docs/局所page差分、routeを変更しない。**Docs:** guide/rules/change-map、R14/claim/traceability。**Open:** 0件shopを見せる利用目的。

## I12 — Commit後failureと保存結果不明を区別する

**Status:** BLOCKED HD-09 / D12。Risk H04/H09。
**Evidence / requirement / invariant:** R04/R07 → DR-OUT-001 → INV13。
**Current:** tx commit後revalidateがthrowすると500になり得る。auditは既にbest effort。通信喪失は結果不明。**Target:** DB確定済みを未保存と断定せず、blind retryを促さない。
**Scope:** menu create/update/deleteのpostcommit orchestration、cache failure observability、client recovery。Non-goals: event bus、queue、無根拠idempotency table、既存audit全面刷新。
**Guidance/impact:** HD-09で既存success維持+cache失敗別記録か新response contractか決める。前者schema/API shape維持候補、後者全client更新。鮮度失敗を成功表示の裏に隠さず運用検知へ接続。

**Verification-first plan:**
- TDD_REQUIRED / T07、API fault injection+real DB+client E2E。
- Preconditions/input: fields/links commit後だけcache invalidation throw、audit failure対照、response遮断、createの再送操作。
- Expected: HD-09の保存結果表示とDB状態が一致。unknownはunknown扱い、勝手に同createを再試行しない。
- RED reason: 現handlerでは既知commitでも500の見込み。DB確定内容とHTTP/UIを一緒にassertする。
- Why: call countではcommitとclient認識の違いを示せない。
- Higher-level: dedicated DB、client/network failure、運用event検知、HD-05鮮度。
- Characterization REQUIRED: commit前validation/DB failure、正常success DTO、既存audit best effort。Exception None。

**Acceptance:** HD-09、commit前/後/unknownのmatrix、T07、再試行仕様、必要checks。**Dependencies:** HD-09、鮮度解釈HD-05。**Rollback:** 旧500解釈へ戻るriskを明記、blind retryを有効化しない。**Docs:** API error/運用/verification、failure-model/safety-case/traceability。**Open:** outcome新契約の要否、重複頻度、再読込UI。
