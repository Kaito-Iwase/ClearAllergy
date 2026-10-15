# ClearAllergy Issue照合：identity・画像・理解度・運用・文書（2026-10-14）

対象14件: #39 / #42 / #44 / #45 / #50 / #52 / #53 / #54 / #55 / #60 / #64 / #65 / #72 / #76。

## 対象と証拠の扱い

- アプリコードの固定対象はmain `e26b6088b79a4a3eaa1812c171657581fb814b66`。読取checkoutは `clearallergy-research-followup`、HEAD `10945eb830d36171a2712ced306d36e5662fa6be`。`git diff --name-only e26b608 HEAD -- app features lib components prisma tests scripts package.json package-lock.json` は出力なし。HEADの差分は研究文書5件だけ。開始時のstatusはclean。
- canonical checkoutは本担当のsandboxではPermission deniedだった。権限拡大せず、上記の同一コードcheckoutを読んだ。canonicalのHEAD/dirty保全は親タスクの別証拠であり、本担当自身によるcanonical検査結果とはしない。
- AGENTS.md全文、README、現行guide/関連研究・検証文書、14件の `issue-audit-records/issue-N.json`（本文・コメント）、関連PRの `issue-audit-pr-records/pr-N.json` を読んだ。親が取得したGitHub metadataを使用し、Issue/PR公開変更はしていない。
- 今回は静的読取だけ。テスト・ブラウザ・アプリ起動、依存導入、DB/Clerk/Blob接続、設定変更、Git書込はしていない。以下の過去PASSは日付・対象・出典がある既存証拠で、今回の実行結果ではない。
- パスと行番号は上記checkoutの読取時点。#76の新規4文書と索引追記だけはPR #77 HEADの証拠で、固定mainにはまだない。その他のコード・文書は固定mainにも存在する。
- `P1` は実店舗pilot/機密情報入力等の対象用途へ進む前の判断・検証、`P2` は局所改善/根拠整備、`P3` は完了済み成果の台帳整理の順序目安。確認された事故・攻撃の深刻度を意味しない。closeはすべて案のみ。
- 取得済みGitHub metadataでは14件すべてOPEN、assigneeは全件空。コメント/agent assessmentのowner記載をGitHub上の担当割当と同一視しない。agent-blockedは #39/#42/#44/#45/#50/#52/#53/#55/#60/#64、human-reviewは #39/#42/#44/#45/#54/#60/#64/#65/#76、risk-highは #50/#55、documentationは #60/#72/#76。labelだけでReady/完了を決定しない。

## 判定の概要

| Issue | 現在の分類 | 旧前提をそのまま使えるか | 次の中心作業 / 優先度 |
| --- | --- | --- | --- |
| #39 | 人の判断が残る | 公開注意・状態区別は既にある。UX設計も存在 | 対象/用途/claim/理解度受入の記名判断 / P1 |
| #42 | 人・運用判断が残る | owner/運営権限は既存。限定復旧記録もある | 停止/復旧責任・連絡・時間目標の記名判断 / P1 |
| #44 | 技術条件は現存、人の判断・provider証拠不足 | fallback・verified未検査・ID比較未検査は現存 | 専用tenant到達性と拒否contractの決定 / P1 |
| #45 | 技術条件は現存、用途・保持判断が残る | public Blobとdraft flagの独立は現存 | 公開可能な画像/機密性/保持条件の決定 / P1 |
| #50 | 未実装条件が現存、#44依存 | verified/ID一致の明示強制は現存しない | caller影響とno-write境界を固定後に限定実装 / P1 |
| #52 | 設計済み、募集・実験・判断未実施 | U01–U08と記録票を新規案にしない | 既存protocol承認と同意した参加者によるbaseline / P1 |
| #53 | 台本済み、正式訓練記録不足 | O01–O07は既存。取消順序の旧記述は更新要 | 現行手順へ台本照合し隔離drill / P1 |
| #54 | dated ledger成果は完了整理候補 | 「実配備すべてUNKNOWN」は後続記録で一部変化 | ledger完了と現在releaseの残るgateを分離 / P2 |
| #55 | 機密性/保持実装未決、#45依存 | prefix guard・限定テスト画像cleanupは既存、一般自動回収/race保護は未実装 | #45後に公開写真説明または隔離spike / P1 |
| #60 | 旧未公開前提が大きく変化、参照整理は残る | mainにguide/researchが存在、ignoreも許可へ変更 | 全対象の現行/歴史/PR-only/非管理記録を区分 / P2 |
| #64 | 技術対処済み部分が大きい、完了整理候補 | 同梱npm11.19.1前提は解消 | PR #67の代替方針と許容版差をIssueへ対応付け / P2 |
| #65 | 完了整理候補 | 0バイト拒否はmain済み、署名検査も後続追加済み | PR #66/現行testsの受入対応を記録 / P3 |
| #72 | 完了整理候補 | 9文書はPR #75 merge済み | merged成果・限定検証・hardbreakを台帳へ対応付け / P3 |
| #76 | 成果作成済み、PR #77 review待ち | 5文書はPR HEADのみ、main未反映 | PR文書レビューとmerge判断 / P2 |

## #39 使用目的・公開claim・理解度acceptance

**現状と旧前提。** README:5–7は架空店舗・架空メニューによる実運用前prototypeと「飲食判断には使用しない」を示す。`lib/public-prototype.ts:1–2`に同じ利用境界と他公開メニュー由来補足の限界がある。`docs/guide/rules.md:14–31`、`lib/allergens.ts:328–342`、`SelectedAllergenResultCardsClient.tsx:175–201`には非色ラベル、UNKNOWNとFREEの区別、FREEは食品安全保証でないという表示が既にある。「注意がないから追加」を改善の出発点にはしない。

**受入との対応。** 元受入の対象population/用途/claim/保証しない事項について、現READMEはA（架空prototype）の実際の範囲を説明する証拠になる。ただし、#39コメントは依然HUMAN_DECISION_REQUIREDであり、対象population・重大誤認停止条件・決定者/日付が揃った承認記録は今回資料にない。`docs/research/open-questions.md:3–15`は全HD未決という研究時点の記録、`product/ux-risk.md:5–19`は設計票で、採点thresholdをHD-01へ残す。#52の2026-10-04コメントはU01–U08と採点案を具体化済みである。

**残りと依存。** #52の実施、店舗workflow、適切な専門家による公開文言/責任境界review。参加者・同意・対象と許容critical errorは未決で、現行UIや187件CIからは決定できない。新しいUIを作る前に、製品責任者が用途、対象/非対象、claim、重大誤認を観察した場合の中止/再設計条件と理由を記録する。現prototype用途の維持だけなら、その範囲を記名確認する小さい選択がある。

**具体的改善・利点・副作用・検証。** 既存U01–U08を使う一枚の判断票に、用途・対象・保証しないこと・採点rubric・停止条件・担当・日付を埋める。曖昧な「理解できた」を判定可能にするが、探索sampleの0誤認を一般安全保証へ誤って昇格させるおそれがある。匿名ID/タスク/端末別の分母、初回自発回答/補助後回答、判定不能と採点者不一致を残す。close条件は元4条件の記録と関連Issueへの反映であり、文言変更やpilot開始はこの監査では承認しない。**P1 / open維持案。**

## #42 incident責任者・停止権限・許容時間

**現状。** `lib/auth/admin-auth.ts:79–101`はClerk連携Userからactiveな所有店舗を解決する。`docs/guide/rules.md:68–71`はowner編集とClerk publicMetadata adminの招待管理を分ける。運営adminだから任意店舗を更新できる実装ではない。`docs/guide/development.md:197–211`には要求ID、取消502再試行、対象Clerk/DBの照合、アプリ切戻しとDB復元の区別が既にある。緊急admin権限や一般SaaSを新設する案はこの不足から直接導けない。

**受入との対応。** 選択肢A/B/C、影響、未決権限は#42本文・2026-10-04コメントと`open-questions.md:12`にある。#53のO01–O07は具体化済み。さらに2026-10-10復旧記録は限定した本番migration/架空デモ再公開/隔離restoreの承認と実施を記録する（`shops-recovery-20261010.md:16–24,51–82`）。これは実操作が一切ないという旧前提を変えるが、全incident責任・当番・連絡・許容時間・代替権限の合意ではない。

**残り・依存・次手。** 停止/復旧判断者、既存owner不在時の経路、通知先、各工程の時間目標、対象環境と残存riskを人が決め、#53の受入/rollbackへ反映する。Aを継続する場合もowner依頼の成立条件を記録する。B/Cは資格情報・対象scopeまたは認可変更の別判断を要する。

**改善と検証。** 既存台本へ権限表と「誰が・何を・何分で・何の証拠で止め/復旧するか」を対応付ける。ownerモデルを維持して不足を測れるが、owner不在時の遅延と誤停止の損失が残る。tabletopの議事と隔離実施タイムラインを別記録にし、実DB復元/通知の未実施を残す。時間目標の達成は測定なしにPASSにしない。元受入の選択/理由/決定者/日付/環境/保証範囲と#53反映が揃うまで **P1 / open維持案。**

## #44 招待identityの保証

**技術条件の現存。** [identity helper][identity] `lib/auth/getCurrentAppUser.ts:14–29`はprimaryメールを優先し、見つからなければfirst emailへfallbackする。verificationは返さない。:88–100は`auth().userId`と`currentUser()`を別々に取り、`currentUser.id`との一致を検査せず、auth userIdと抽出emailを同じidentityとして返す。`getCurrentAppUser():105–112`はauth userIdによる既存Userのreadだけで、identityメールを使う関数とは分かれている。source上の不在を確認したが、通常Clerk flowで未verified/ID不一致が到達するかは未確認で、攻撃成立とはしない。

**全callerと影響。** getCurrentClerkIdentityは `app/admin/page.tsx:40`（登録へのredirect）、`AdminLoginPage.tsx:73–80`（pendingSetupEmail）、`AdminRegisterPage.tsx:69–70,95–96,145–150`（招待受諾画面/サインアップ分岐）、`adminOnboardingRoute.ts:62–68,235`（rate-limit識別/失敗監査）、`acceptInvitationRoute.ts:40–59`（受諾）に直接到達する。provision helper:117–132経由のonboarding:168は新規Userのemailにも使う。getCurrentAppUserの直接callerは登録page、onboarding:114、`admin-auth.ts:82`、`auth-audit.ts:43`、`portfolio-mode.ts:62`。共有read helperまでverified要件を広げると既存管理導線/監査/portfolio許可へ影響し得るため、招待受諾専用helperという候補と比較が必要。

**受入/残り。** A tenant設定証拠、B primary verified強制、C全verified emailsのどれを選ぶか、拒否HTTP/画面contract、fallback利用中の既存ユーザー影響、実tenant/signup/OAuth/primary変更/outageの保証、決定者/日付/対象/残存riskが未記録。既存招待ロック/取消/正常受諾をverified保証に読み替えない。

**改善・利点・副作用・検証。** 専用tenantで到達性を記録し、Bを選ぶなら受諾入口に限定したidentity policyを優先比較する。no-writeをDB呼出前に成立させやすいが、primary未設定・verification待ち・変更中の人の受諾が止まり、既存受諾UIの説明とretry導線が必要になる。#50のT05表（verified/unverified/null/failed/欠損/firstのみ一致/ID不一致）と正常verified・取消/期限切れを対にする。#44は技術修復PRの存在だけでは決定Issueとして完了しない。**P1 / #50依存元 / open維持案。**

## #45 draft画像の機密性と保持

**現存条件と実装済み境界。** [画像共通処理][upload] `upload-images.ts:108–115`のputは`access: "public"`。upload APIsはmenuIdやisPublishedを受けず、サーバー所有店舗prefixへ保存しURLを返す（menu:80–103 / shop:80–101）。draftを非公開にするDB flagとBlobのアクセス制御は独立。`image-url-policy.ts:3–12,20–54`にはHTTPS・trusted store origin/path・自店舗prefix・ファイル名の検査が既にあり、無制限URL保存という旧案は現行には当たらない。実URL/CDNアクセスは今回未再現。

**受入/残り。** public-photo-onlyの許容画像と説明、private draft必要性、orphan猶予・保持/復旧・削除責任の選択/理由/決定者/日付、対象用途/保証範囲、#55への反映が未記録。UI flagの存在やURL guard、empty/署名検査は機密性を保証しない。

**改善と副作用。** prototypeのAを選ぶなら公開可能な写真だけを許す用途の説明と、保存前でもURL共有アクセスが生じ得る限界を既存画像入力へ人の判断後に示す。低い変更範囲で期待を合わせられるが、機密素材の利用者要件は満たさず、読み飛ばしにも対応しない。Bはprivate/read認可/URL互換/費用/provider条件を伴う隔離spike、Cは孤立参照を減らす候補で、publicアクセス問題は残る。Cの削除は不可逆であり、保持/backup/参照復活raceの先決なしに作らない。

**検証/次手。** #55 T06の自店/他店prefix・draft・保存失敗・差替え・参照復活を、承認した専用Blob+DBで比較する。Aを選んだ場合「draft URLがGET拒否になる」を合格条件にはしない。全量Blob削除やprovider交換の根拠にはしない。**P1（機密画像利用前） / #55依存元 / open維持案。**

## #50 verified identityの確定・強制

**現行技術部分。** #44のhelper不在条件は現存する。[accept route][accept] `acceptInvitationRoute.ts:40–59`はidentity/emailの存在だけで受諾helperへ進む。`invitations.ts:177–205`は正規化mailのpendingを行ロックで選び、:234–279でUser/Shop/Inviteを更新する。:126–175は既存Clerk IDのメール更新、emailが一致する旧未連携Userの連携/新規User作成も行う。これらの書込の前にverifiedとID一致を検査するコードはない。

**重要なno-write境界。** `invitations.ts:187`はtransaction前に`expirePendingInvitesForEmail`(:76–95)で期限切れ招待を更新する。invalid identityのno-writeを受入にするなら、受諾helper内のロック取得後だけにguardを置く案ではこの前処理書込を防げない。承認済みidentity判定をこのhelper呼出前へ置くか、明確に再構成する必要がある。

**既存テストとの対応。** `tests/admin-invitation-api.test.ts:330`「本文のshopId/email/userIdを信用せずClerk本人情報だけで確定」、:343「未認証・取消済み・期限切れを拒否」、:320「他店舗所有者409全更新取消」、:182/204/219の取消競合/外部失敗は現存する。しかしfixture:26–30はcurrentUser.idもverificationも含まない。これらはserver情報利用・transaction・既存guardの証拠で、verified/ID一致のcharacterizationではない。

**受入・残り・次手。** HD-06承認、専用tenant到達性、deniedでUser/Shop/Invite不変、正常verified/招待異常維持、全caller影響・拒否contract/rollback、checksとdocs同期が残る。テストは親担当、今回追加・実行なし。#44の決定後、T05の無効identityでexpire/update/createも0回、正常受諾・取消/revoke/resend raceは現行の成功/拒否を保つ意味のテストを作る。ログイン全刷新/大量取消/schemaは不要。

**改善・副作用・検証。** accept専用policyは影響を小さくし、不正identityの副作用前拒否を明確にする。一方、onboardingのメール利用をそのまま残すので用途別保証の境界を文書化する必要がある。global helperを変える選択では登録page/レート識別/メール表示/既存User provisioningもcharacterizationが必要。mockだけならprovider到達性はUNVERIFIEDのまま。**P1 / #44と専用tenant scope依存 / open維持案。**

## #52 状態理解とアクセシビリティ

**既存設計。** [UX設計票][ux] `docs/research/product/ux-risk.md:5–19`には当事者6–8/保護者4–6/店舗4–6の探索募集案、架空タスク、順序counterbalance、誤認理由/確認行動/時間/主観負荷、独立採点、同意/匿名化/保持がある。:21–25はmobile/keyboard/screen-reader/非色表現等のmanual計画。#52の2026-10-04 13:31 UTCコメント（issuecomment-5980509427）はU01–U08、記録票、初回と説明後回答、採点不能/不一致を具体化済み。設計票作成を新しい未実装機能として提案しない。

**現コードに合わせる事項。** UNKNOWNメニューは公開不可（`rules.md:36–41`）のため隔離カード/管理draft課題を使う既存設計を維持。STORE_HANDLEDは別公開登録由来（:27）で厨房確認結果ではない。現公開ラベルはPR #67/#68/#69で承認付き変更があり、古い刺激のまま試験せず固定SHAのbaselineへ合わせる。公開更新時刻と食品確認日時も分ける（:47–51）。コンポーネントやChromiumのラベル/フォーカス検査は人の理解とは測定対象が違う。

**受入・残り。** 元受入の同意・実施scope、rubric/結果、未解決誤認、次の文言判断について、protocol/rubric案まであるが、実参加者/結果欄は空で募集・同意・実機支援技術・採点一致性・理解度はUNVERIFIED。#39の対象/threshold/重大誤認中止条件が依存する。自動テストのみでclose不可という元条件を保つ。

**改善と検証。** 次手は現行SHAを固定して既存タスク票を承認可能にすること、その後同意した参加者のbaselineを実施すること。利点は再利用可能な設計から人の誤認へ証拠を進める点。副作用は探索人数/架空task/学習・観察効果/対象者偏りであり、役割・端末・タスク別分母と未完了/判定不能を残す。UI案比較はbaseline結果と人の文言判断後に分ける。連絡は今回範囲外。**P1 / #39依存 / 設計完了部分と実験BLOCKEDを分けopen維持案。**

## #53 非公開化・復旧・外部障害の運用訓練

**台本と現行実装。** #53の2026-10-04 13:31 UTCコメント（issuecomment-5980509624）はO01対象特定、O02owner非公開、O03fresh/既存tab、O04取消障害、O05隔離復元、O06復旧判断、O07cleanupと時刻票を既に定義する。`engineering/audit-observability.md:3–12`、`guide/development.md:197–211`にも現運用の入口がある。独立operations.md/runbook.mdというファイルはtracked一覧にはなく、「operations/runbook」は作業カテゴリと既存手順を指すため、今存在しないファイルを必須参照としない。

**旧記述の訂正候補。** 旧commentの「Clerk失敗catch後local revokedを試す」は現在の順序と異なる。[取消route][revoke] :73–79はpending限定DB updateManyで`revoked`を先に確定、:80–84競合409、:113–131外部取消/失敗502とID維持・再試行。`tests/admin-invitation-api.test.ts:182,204,219`にaccepted維持/Clerk待機中拒否/失敗後再試行の既存補助検証がある。O04をこの順序とDB失敗時の分岐へ合わせる改善が必要で、既にある取消強化を再実装しない。

**後続実証。** `shops-recovery-20261010.md:20–24,44–49,68–82`は実バックアップの隔離復元/SQL/途中rollback/食品変更停止を限定範囲で記録する。Neon専用extension・所有role・ACLは再現していない。#53の当番/owner実操作/provider障害/工程時間/tabletopを一式実施した証拠ではなく、「restore全て未経験」という旧条件を一部更新できるだけ。

**受入/残り/改善。** #42の停止/復旧担当と目標、許可された既存actor/対象/backup/rollback/provider scope、tabletop議事と隔離drillタイムライン、gap/担当/次Issueが必要。既存O01–O07を現コードへ照合してから、架空対象を既存権限で実施する。利点は対象誤認、権限不足、旧表示、復元不整合を観察できること。副作用は台本成功を実障害圧力や全provider停止へ一般化すること、隔離復元の副作用・cleanup漏れ。接続guardに加え空DB/backup同一性/所有資源を先に確認し、未実施は時間票の空欄と理由へ残す。**P1 / #42・隔離scope依存 / open維持案。**

## #54 配備Evidence ledger

**dated成果の受入。** PR #63はMERGED、head `2204eb6` / merge `a75193f`（2026-10-06）。[2026-10-04 ledger][ledger] :5–19は対象main1830a98/canonical dirty/lock生byteとGit blob/runtime/definitionとUNKNOWNを分け、:29–49はCI guard下PG17.11・29master/4enum/16migration/3trigger/2indexなど9組の実証と未実施を示す。JSON原典・hash・collector・sourceを公開する。元Acceptanceの日付/scope/出典/unknown/T02実施・未実施/秘密非掲載は、この限定成果とPR記録へ対応する。完全production確認を完了条件へ追加しなくても、ledgerという成果を整理できる。

**後続の配備証拠を区別。** [2026-10-10復旧記録][recovery] :7は当日の本番SHA01137、:11–16は15/17 migrationと許可対象2件、:20–34はbackup/隔離restore/本番適用17件、:51–82は承認された架空デモ32件と実公開ブラウザ確認を記録する。これは実配備証拠であり、CI一時DBの適用結果と区別する。2026-10-04 UNKNOWN欄を過去の時点として保持したまま、後続対象証拠を索引へ結ぶ方式が適切。

**残り。** 最新main e26b608の実配備SHA/runtime/lock/対象DBの全catalogとCI required-check policy、monitor/alerts/backup retention/運用担当、実Clerk/Blob、配信鮮度、理解度はこの監査で再取得していない。2026-10-10の適用履歴17件だけで現在すべてのcatalog/現データ不変を主張しない。CI/Preview SUCCESSもdeploy全面検証ではない。

**次手・改善・副作用・検証。** まず#54の元成果の受入対応とPR #63 mergeを記録し、「dated ledger成果は完了」「現在release gateの残りは対象SHA/時点付きで別途追う」を分ける。利点は既存証拠の再収集を避けて不足に集中できること。副作用は歴史的recordを最新状態へ上書きしたり、ledger-closeをproduction readinessと誤認すること。新releaseを確認する場合は専用dated ledgerと許可されたread accessを使い、旧base固定collectorを異なるSHAへ無修正流用しない（ledger:53–57）。原JSON parse/hash・固定入力比較・catalog実証・同一SHA CIを分離する。**P2 / ledger scopeで完了整理候補。現在配備の不足は引継ぎが必要。**

## #55 Draft画像公開範囲・orphan保持

**受入との照合。** HD-07/URL互換/retention/復旧条件/T06を先決するIssueで、private化は採用されていない。#45と同じpublic put条件が現存する。`image-url-policy.ts:35–68`とupload APIの自店舗path/owner/origin/portfolio guardは既存のGREEN側characterizationであり、所有権保護を新規機能として提案しない。`tests/admin-upload-api.test.ts:79,91,102,116,133,152,159`は未認証/別Origin、非所有/閲覧専用、欠損/形式/サイズ、本文他店舗ID不信用等を定義する。

**保持/raceの実装状態。** `lib/storage`にはput/URL policyがある。一般のorphan一覧・retention collectorは確認できない。一方、`scripts/cleanup-test-images.ts:1–19`には既存の限定テスト画像cleanupがあり、専用テストDBガードと記録URL・対象テスト店舗prefix検査後にBlob delを呼ぶ。これを一般画像の自動保持・回収と混同しない。同scriptは今回実行していない。`adminMenuRoute.ts:550–605`のメニュー削除はDB deleteで、Blob回収ではない。アップロードはフォームのDB保存より先に完成し、保存失敗・放棄・差替えでURL参照が残らない可能性は静的にある。実storeでの孤立件数/保存失敗/参照復活raceは未再現で、すべての画像が確実にorphanになるとは断定しない。

**次手と改善。** #45のAなら用途説明と既存ガードのcharacterizationに限定、BならURL互換/read認可/provider/費用spike、Cなら候補一覧→猶予→最新DB再照合→限定削除の設計を比較する。利点は無参照資源を検証可能な条件で回収できること。副作用は参照復活競合で現使用画像を消すこと、復元不能、public URL/CDNの残存/削除反映の限界。猶予中にDB参照が復活したケース、menu/shop共用参照、別店舗prefix、失敗して再送された保存、途中rollbackを専用Blob+DBで観察する。race保護/backup条件が未決のまま自動削除しない。**P1（用途決定） / #45とprovider scope依存 / open維持案。**

## #60 Issue参照とGitHub実体

**変化した旧前提。** 固定mainには`docs/guide/`、`docs/research/`、dated verificationがtrackedされる。`.gitignore`はdocs全体削除のままではなく、guide/研究/verificationの明示許可を持つ。#60の「mainにguide/researchなし」「すべて未公開」の記述は2026-10-04時点のEvidenceとして保持すべきで、現在のblockerそのものにはできない。PR #67、#71、#75で現行説明・履歴・新原稿を区分して公開済みであり、新たな一括復元を再提案しない。

**本担当14件の参照確認。** #39のopen-questions/research-questions/evidence-register/ux-risk、#42/#44/#45のevidence/open-questions/backlog/traceability、#50/#52/#53/#54/#55の研究directoryと#52 ux-risk、#54 ledger MD/JSON、#60 detailed-design、#64 agentic-development、#65 issue-65、#72 maintenance/研究索引/5原稿は固定mainで読める。#76新規4文書はmainにはなく、PR #77固定headで読める。`docs/links`や`docs/claim/traceability`というgrep抽出はコメントのカテゴリ列挙であって実ファイル参照ではない。#72の`docs/shops-recovery-20261010`はcanonical branch名であって実doc pathではない。単純正規表現の不在件数を壊れたリンク数にしない。

**歴史資料/必須条件。** `docs/research/README.md:3–7,33`はfreezeの旧HEAD/未push結果を明示した歴史資料で、現在の不足・現在の承認へ読み替えない。古いIssue本文の「ローカル未コミットdocs」も、その時点の制約と現在の参照を分けて対応付ける。`.agent-runs/issue65-final-head.json`等はGit管理外の実行証拠で、GitHub-only reviewerの必須根拠にしない。必要な結果は公開検証MD/Issue/PRの時点付き要約と、公開JSONがある場合にその原典へ結ぶ。

**元受入との残り。** 全対象Issue/READMEの必須参照、削除理由/owner/対象commitと公開範囲の合意、現在/Historical/PR-only/非管理の区分、Status/HUMAN_DECISION_REQUIRED/未検証維持、結果のIssue記録が元条件。全27件の集約は親担当。PR #28等の削除意図は本資料だけでは確定しないが、後続目的別公開の事実は確認できる。#72の完了で全27件の参照整合が自動完了するわけではない。

**具体策・利点・副作用・検証。** 新たな全文復元ではなく、Issue番号→元根拠ID→公開固定commit/file→現guide/code/test→実施/未実施→人判断依存の小さい参照表を作る。現mainへの浮動linkは操作入口、過去証拠は固定SHAへ結び、PR-onlyは明示する。利点は別sessionがGitHubだけで根拠と残りを追えること。副作用は研究とcurrent guideを二重の仕様正本にすること、古い承認を追認すること。`maintenance.md:14–24,39–45,55–56`の区分を使い、実pathと見出し/アンカー、コード関数を開いて確かめる。外部資料全面監査やDB実証は#60へ追加しない。**P2 / owner・公開範囲照合後の限定文書作業 / この14件照合だけではclose案を出さない。**

## #64 npm版差

**解消/変化した技術前提。** 現package/lockにアプリ同梱npmはない。[resolver][npm] :7–25はnpm_execpath、Node標準Windows/Unix、Windows APPDATA候補の既存CLIを絶対path/realpath/npm package名/versionで検査し、未発見ならfailする。harness:197–198はそのCLIを選び、:212でNode+引数配列として実行、:231でruntime.actualNpmを保存する。browser-runnerも同resolver:38–41を使う。元Issueのnode_modules/npm11.19.1を固定利用・実npm版未記録というCauseは現在解消している。actualNpmは解決したCLIのpackage.versionであり、別の独立`npm --version`採取だと説明しない。

**版差と承認記録。** CI:63–67 / Dockerfile:1–13はNode22.23.1/npm11.18.0を維持。`security-release-20261007.md:5–7,17,24–26,42–48`は承認後の依存対処、同梱npm除去、host10.9.2とDocker11.18.0の実測差、Docker build/npm ci/CLI回帰、公開保留/PR反映許可を記録する。PR #67はMERGED（headc74d8a2 / mergedd28068 / 2026-10-07）。従来A/Bへの統一とは別の「同梱を除いて環境CLIを検証し記録」の採用実体がある。過去#59/#61のnpm版UNKNOWNをこの情報から推測で埋めない。

**受入と残り。** resolver/actualNpm/guardとreport integrityは既存技術条件で満たされる。`tests/npm-cli.test.ts:19` Windows/Unix/spaces、:30 lifecycle優先/別package/relative拒否が存在する。`agent-harness.test.ts:102,112,138,174`のcandidate不変/レポートリンク置換拒否/commands等も既存で、追加一般保護を再提案しない。元Issueの方針決定者・日付・選択・対象/非対象・許容差を#67の承認/dated記録へ対応付け、環境CLIの版差をどう扱うか最後の台帳整理が残る。CI宣言11.18.0と実job runtimeの証拠は別。npm版差がbehaviorを悪化させたかは未測定のまま。

**改善と検証。** #64本文/判定に後続代替方針を対応付ける。必要なら将来reportに方針identifier/期待npmまたは許容差を追加する小さい候補はあるが、ホスト全体のnpm更新や再同梱は不要。利点は差を再現性評価へ残せること、副作用は固定基準がなければ比較が難しいこととhost CLI管理責任が残ること。既存resolver回帰＋同一candidate Windows/Linux記録、CI/Docker実版証拠と宣言の照合を使う。全版統一が未実装という理由だけでBLOCKEDを固定しない。**P2 / 対処済み技術部分の完了整理候補、許容差/owner記録を添える。**

## #65 0バイト画像拒否

**元受入の現行対応。** `upload-images.ts:3–11`は5MIME/5MiB、:26–46は未許可MIME→0バイト→上限の順に拒否。両upload routes:23–39はOrigin→owner→portfolio、:61–77はvalidation失敗400、menu:84 / shop:82のputは後段。共通guardは維持される。`tests/upload-image-validation.test.ts:170`全5MIME空、:177非空PNG、:182未許可/超過、:187両API空拒否/Blob0、:197guard先行がある。両APIの全5MIME10拒否はPR #66の独立reviewに記録され、現committed focused API test自体のループはPNGだけである。この範囲を混同しない。

**過去結果と後続。** PR #66はMERGED（headd948b79 / mergec7afbd7 / 2026-10-06）。`docs/verification/issue-65.md:15–25` RED5中fail2→GREEN5/5、PR/Issue最終commentは85/85と同HEAD CI/独立reviewを記録する。現行は後続PR #67で先頭4KiBの署名検査(:48–72)も追加され、tests:23/32/43/50/64とadmin-upload API:116にMIME偽装等の回帰がある。issue-65.md:36のMIME偽装「対象外」は当Issueの当時scopeで、現在まったく検査しないという意味ではない。全decode/破損/マルウェア保証は依然ない。

**受入・次手・副作用。** 元受入（全5empty/両caller400/Blob前/既存制約/RED-GREEN/全gates/独立review/最終CI/docs）へ対応する成果がmainにあるため完了整理候補。実Clerk/Blob/管理browser/productionを当Issueの未完了条件へ追加して恒久openにしないが、UNVERIFIEDは維持する。利点は同じempty guardを再実装しないこと。副作用はcloseを画像完全性保証やdraft機密性完了と誤認すること。現在のfocused testsとAPI controlsを必要時に再利用し、5MIME×両APIを恒久回帰へ拡張する案は低優先の任意強化で、元受入の欠落と断定しない。**P3 / close整理案、#45/#55/#54は別目的。**

## #72 5原稿全文・文書同期ルール9件

**保存範囲/承認。** Issue本文はBの文書Issue→commit/push→PR許可を記録する。PR #75はMERGED（heada79dd67 / mergee26b608 / 2026-10-14T14:21:01Z）。`git diff --name-only 01137f3 a79dd67`はAGENTS、maintenance、PR template、研究README、5原稿の9件に一致。PR #71の復旧3文書は含まない。main基点の目的別worktree成果をcanonical dirtyと混ぜていない。

**元受入との対応。** `AGENTS.md:5–13`は同時docs/具体的不要理由/リンク・code参照/研究時点/外部資料の権限境界を指示。`maintenance.md:26–45`は単一update-map、:55–61は参照と既存templateを使う。PR template:25は追加1check。研究README:15–33は全5原稿入口と未採用/歴史の区別。PR #75本文・既存verification JSONは5全文hash一致/旧索引保持/allowlist9/inline links583欠損0/独立reviewを記録する。

**限定検証/残り。** codex-cli読取はignore-user-config/ephemeral/read-onlyの初期AGENTS要約で、通常Appや継続遵守/全リンク先自動読込を保証しない。既定diff checkは更新運用原稿10/11行のMarkdown hardbreak2件でexit2、他8件exit0という説明を保持する。原文hash保持を優先した記録で、全9一律PASSへ書き換えない。外部URL134到達/完全Markdown解析/PR描画、店舗運用効果は未確認。文書例外によるlocal app gates省略はscopeに適合する。

**次手・改善・副作用・検証。** mergedの元受入対応と限定未確認をIssueへ記録する整理が中心。利点は文書同期ルールと原稿が再利用可能であること、副作用は新researchをcurrent仕様に昇格すること、CLI要約を通常App遵守と扱うこと。代表的な変更依頼でmaintenance→change-map→rules/code/tests→更新/不要理由をレビューする既存方式を用いる。新CI/フック/設定や全文再整形は追加しない。#60全27参照、#73/#74アプリ不足と別scope。**P3 / 完了整理候補。**

## #76 追加3調査と独立レビューの訂正統合5件

**PR成果とmain境界。** PR #77はOPEN/Draft、head10945eb / basee26b608。差分は新規4文書+研究README追記の5件。mainに新規4文書はまだなく、#75を再差分に含めない。Issue comment（issuecomment-6171166473）とPR本文は4原稿の全文取得、訂正統合、旧索引保持6行、496追加/削除0、独立敵対review要修正0を記録する。

**受入の直接対応。** [追補入口][followup] :3–5は未採用・未実装と採用/食品安全保証境界、:25–35は注文周辺範囲/初期継続負担/未使用と未確認/最小性/独立評価基準、:39–53は元reviewの原典照合と今回統合を分ける。国内1842を個人店標本にしない、患者団体n38を個人患者率にしない、FSA対照30.5%とITTの有意差未検出を区分し、GS1/ベンダー条件と権利を未確定のまま保持する。:55–87は5検証順序を提案として示し、店舗連絡/契約/実装許可にはしない。

**検証証拠。** 全5diff-check exit0、repo62 Markdown599 inline link欠損0/独立76 link照合、出典URL保持はIssue/PR記録と既存followup verification artifactsにある。`followup-ci-final.json`は同headのrun38583230251 completed/success、2026-10-14T14:46:49Z更新。Issue最終commentはCI187件pass/fail0/skip0、lint/typecheck/build/Prisma/隔離PG/公開Chromiumのscopeを記録する。ローカルapp/DB/browser未実行と分ける。現在のPR DraftはCI失敗の証拠ではなく、merge/レビュー前の状態。

**残りと次手。** PR5文書の人のレビュー・merge判断。外部URL全到達/原典全再監査/実店舗工数・費用・価格・継続性/表示理解/事故低減/実食品正確性/通常App遵守は未確認で、この文書統合Issueの受入へ全部実験を追加しない。原稿の出典・日付・母集団・法域・限界を保った保存と独立reviewは成果化済み。closeはPR review/merge状態を再取得してからの案。

**改善・副作用・検証。** 現行仕様への昇格をせず、既存読み入口から3詳細と元review区分を追える形でレビューする。利点は訂正が本文へ統合され誤った旧表現を読ませないこと。副作用はベンダー主張/海外法域/探索案を日本小規模店の実証と誤認すること。数値分母・ITT/per-protocol・初期/継続・品質同水準比較・一人営業・注文scopeを重点静的照合し、CI成功を効果実証に読み替えない。**P2 / PR #77レビュー待ち維持案。**

## 静的検査の実施記録と未実施

実施: UTF-8 PowerShell `Get-Content`、tracked `git ls-files`/`git ls-tree`、`git grep -n`、固定SHAの`git diff --name-only`、HEAD/status/log、取得済みIssue/PR JSON parse、source/行番号の照合。rgは未導入のためgit grep/PowerShellへ切替。14件本文と全commentsを確認し、agent assessment JSONが必要なら本文と別に分類した。

未実施: テスト実行、Prisma生成/検証、DB・実provider接続、アプリ/ブラウザ起動、外部一次資料の追加一般調査、全Markdown parser/外部URL到達、Git/public edits。追加検証やcode実装を完了扱いにしない。アプリ・原稿・設定・stage・commit・push・Issue/PR変更は0件、出力は本reportのみ。

完了時の再読取では14件の個別節を確認し、読取checkoutのHEADは10945eb、`git status --short`は出力なし（clean）のまま。canonicalの保全は本担当の権限で再読取していない。

## 主な固定参照

統合時の独立コードレビューにより、#55の「Blob deleteがない」という検索範囲の広すぎる説明を上記の限定cleanupへ訂正した。元14件の調査記録を機能欠落の断定へ広げず、一般保持・回収の未決条件は残している。[既存cleanup固定ソース](https://github.com/Kaito-Iwase/ClearAllergy/blob/e26b6088b79a4a3eaa1812c171657581fb814b66/scripts/cleanup-test-images.ts)。

- [identity helper][identity] / [招待accept][accept] / [取消route][revoke]
- [画像validator/public put][upload] / [npm CLI resolver][npm]
- [理解度設計票][ux] / [2026-10-04 ledger][ledger] / [2026-10-10復旧][recovery]
- [PR #67（npm環境化を含む）](https://github.com/Kaito-Iwase/ClearAllergy/pull/67) / [PR #75](https://github.com/Kaito-Iwase/ClearAllergy/pull/75) / [PR #77](https://github.com/Kaito-Iwase/ClearAllergy/pull/77)

[identity]: https://github.com/Kaito-Iwase/ClearAllergy/blob/e26b6088b79a4a3eaa1812c171657581fb814b66/lib/auth/getCurrentAppUser.ts#L14-L29
[accept]: https://github.com/Kaito-Iwase/ClearAllergy/blob/e26b6088b79a4a3eaa1812c171657581fb814b66/features/admin/invitations/server/acceptInvitationRoute.ts#L40-L59
[revoke]: https://github.com/Kaito-Iwase/ClearAllergy/blob/e26b6088b79a4a3eaa1812c171657581fb814b66/features/admin/invitations/server/revokeInvitationRoute.ts#L73-L131
[upload]: https://github.com/Kaito-Iwase/ClearAllergy/blob/e26b6088b79a4a3eaa1812c171657581fb814b66/lib/storage/upload-images.ts#L25-L78
[npm]: https://github.com/Kaito-Iwase/ClearAllergy/blob/e26b6088b79a4a3eaa1812c171657581fb814b66/scripts/npm-cli.mjs#L7-L25
[ux]: https://github.com/Kaito-Iwase/ClearAllergy/blob/e26b6088b79a4a3eaa1812c171657581fb814b66/docs/research/product/ux-risk.md#L5-L25
[ledger]: https://github.com/Kaito-Iwase/ClearAllergy/blob/e26b6088b79a4a3eaa1812c171657581fb814b66/docs/verification/release-evidence-20261004.md#L5-L74
[recovery]: https://github.com/Kaito-Iwase/ClearAllergy/blob/e26b6088b79a4a3eaa1812c171657581fb814b66/docs/verification/shops-recovery-20261010.md#L7-L86
[followup]: https://github.com/Kaito-Iwase/ClearAllergy/blob/10945eb830d36171a2712ced306d36e5662fa6be/docs/research/product/clearallergy-followup-20261014.md#L3-L87
