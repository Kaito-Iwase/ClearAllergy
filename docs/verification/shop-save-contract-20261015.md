# 店舗保存 #73：契約・検証記録

日付：2026-10-15。対象base `e29d24aae0ceec55ff744117f4b58723c1fe2b71` と本PRの店舗保存差分。[Issue #73](https://github.com/Kaito-Iwase/ClearAllergy/issues/73)を対象とする。人から「既存の保存・一覧の問題を直し、その後一料理の材料変更で検証する」という明示依頼があり、アプリ修正は#73/#74に限定された。merge・本番変更・実店舗連絡・募集は行わない。

## Problem → Evidence → Cause

店舗全量PUTは最終条件がidだけで、同じ初期値から備考訂正と電話変更を保存すると、後着フォームが先の訂正を戻した。DB更新後の公開再検証例外は共通catchへ入り500/失敗監査になった。UIはHTTP 200だけで成功として、空本文・欠落項目・別店舗DTOでも未保存基準と選択画像を解除した。いずれも発生頻度や本番事故を測った主張ではない。

## Candidate solutions → Decision

| 候補 | 判断と範囲 |
| --- | --- |
| 変更項目だけPATCH | 同項目競合は残るため、本件の競合対策に単独採用しない |
| 内容hash比較 | 正規化/対象列/同内容への復帰と互換を新設するため採らない |
| メニュー同様の整数version | 明確な選択肢だがShop column・migration・全writer移行が必要。今回の局所範囲には増やさない |
| 既存updatedAtを期待日時にする原子的更新 | **採用**。既存列はmigrationでTIMESTAMP(3)。このPUTでは前値より必ず1ms以上進め、同時刻・時計後退に対応。事前比較だけでなく最終writeに日時/owner/稼働を含める |
| 保存済みと公開反映待ちを分ける | **採用**。メニューの既存 `publicRefreshPending` と同じ意味。DB一般例外を成功に変換しない |
| 成功DTOと対象/tokenを確認する | **採用**。全反映項目を検査し、成功時だけ保存済み基準/token/Fileを更新する |

現在の他のShop writerは招待/Clerk紐付けによる所有情報更新と専用fixture・移行で、フォームの備考等を編集する別の現行アプリwriterは見つからなかった。日時を戻すSQL・古いserver・将来のwriterまでこの方式で保護したとは言わない。版なし旧clientは428、新client/旧serverの混在は非対応なので、契約を満たすserver/clientで使い、古い画面は読み直す。自動再送・自動mergeはしない。

Prisma 6.19.3の生成型と既存メニュー実装へ照合し、[v6の非一意条件/OCC](https://www.prisma.io/docs/orm/v6/reference/prisma-client-reference#filter-on-non-unique-fields-with-userwhereuniqueinput)を確認した。一意idに他の条件を加えるAPIとP2025を使う。Context7の初回結果は別版の例が混在したため採用せず、v6公式資料へ限定した。資料は今回の実DB実行証拠の代わりではない。

## 実装と維持する条件

- PUTは `expectedUpdatedAt` 必須、形式不正400・欠落428・古い日時/最終条件不一致409。全量保存の正規化・認証・Origin・portfolio・画像所有URL検査を維持する。
- 最終 `shop.update` はid・サーバーで確認したClerk所有者・isActive・期待日時を同時に判定する。一回の店舗書込に部分成功する追加操作はない。
- 更新が返った後の公開再検証例外は200の保存済みDTO＋ `publicRefreshPending:true`。業務失敗監査へ戻さず、固定した運用エラーを記録する。通知/配送/配備cache復旧は追加しない。
- UIはDTO全項目・対象id・前値より進んだtokenを確認する。不正200・500・通信断は結果不明。409/428/404でも入力と選択画像を保持し、保存操作を止めて別タブで最新内容を確認する。手動転記で必要な変更だけを反映し、古いフォームのtokenを自動更新しない。
- 画像upload失敗で店舗PUTを要求していない場合と、既知400等の入力訂正可能な失敗は再送ロックから分ける。画像uploadとDBは引き続き別処理で、孤立画像の回収は本件で実装しない。

## RED / GREEN と実行の範囲

| 検査 | 今回の証拠・状態 |
| --- | --- |
| API RED | 追加した意味上の回帰14件中7失敗：古い版/旧client/読取後所有変更/同時read/確定後cache例外。旧正常7件は維持 |
| API / 応答schema GREEN | 16/16。状態付きPrisma代用品・実route/認証query/入力/画像guard。実DBではない |
| 実client Chrome RED | 初回14群中12失敗。空/{} /別店舗/項目欠落/古い日時等で保存基準解除、競合や結果不明の導線不足、token未送信、pendingを通常成功扱い |
| 実client Chrome修復 | **18/18群PASS**（2026-10-15 05:52:05 UTC）。途中7/18の検査で保存ボタン1箇所の無効化漏れを発見し、全4箇所へ同期。handler guardは元から再送を止めていた。最終client SHA256 `69650dc81b31e6a5ac22b7397179c431453bb08d66668c00ba269f468bc3b5a8`、script `906b46da267d5701a19c7f79dd7bd07ad148471e19b389f1f69036f4b568ebe4` |
| 全unit | 196/196、fail/skipped/cancelled0。実Node22.15.1/npm10.9.2。repo基準22.23.1/11.18.0との差を保持 |
| lint / typecheck | PASS。型検査初回のnullable owner条件とfixture interceptor型を修正し再実行 |
| build | PASS。shared node_modules junctionに対するTurbopackの制約から、`npm.cmd --ignore-scripts run build -- --webpack`。同一schemaの既存Prisma Clientを使いprebuild再生成を省略。架空CI設定だけで実.envはコピーしない |
| Prisma validate | PASS、Client6.19.3、schema/依存/migrationの変更なし。実DBの状態証明ではない |
| PostgreSQL | ローカル実DBはUNVERIFIED。新しい接続guard付きscriptと既存CI stepを用意。Dockerは起動要求後もAPIが応答せず読取を中止。PR後の実DB/CIは当該PRの最終HEAD・run URL・結果で別途確認し、mock結果で代用しない |
| 独立レビュー | 実装履歴を共有しないread-only担当がcode/tests/2 scripts/workflowを確認し、具体的must-fix0。日時契約・popupの射程、最終18群とcode/script hash一致も再照合。文書の最終読取結果はPR本文へ記録 |

ブラウザは実ShopEditClient/Reactを一時bundleへ取り込み、Nextのlink/image/navigationとfetchを代用するloopback fixture。Chrome155.0.8059.40 / Playwright1.62.1 / Node22.15.1、同worktree CSS SHA256 `95453f5e063e1cf4f7b9f08e9eae81be1e5b28cdf7f2678c0a32f6472dd53297`。390/1440px、keyboard/focus、busy、選択画像と未保存注意、成功token増分を検査し、pageErrors0・外部要求0・想定外serverwrites0、横overflowなし。popupは実Chromeの別タブ導線と元入力保持までで、Nextによる最新DB取得や実Clerk/Blobとの結合E2Eではない。実app layoutの外部フォントとの差も見た目の限界として残す。

`scripts/check-shop-database.ts` はCI/testの既存接続guardを最初に通し、独自の架空User/Shopだけを作成・後始末する。実PrismaとPostgreSQL・実route/認証queryを使い、ClerkとNext cacheだけを代用。古い全量フォーム両順序、両readを揃えた同時PUT、読取後のowner/稼働/削除、既知確定後のcache例外、一意制約失敗、他店舗sentinel不変をassertする。CIで実行するまでPASSとしない。

## 未確認・変更しないもの

実食品・未申告材料変更・現場の確認負担・理解度・実provider・本番配備cache・既存tabの訂正到達・混在配備・全writer移行は未確認。#74一覧と一料理の運用演習は別変更であり、本件の技術試験を研究の25ケース合格や実店舗の時短効果へ拡張しない。

共通の状態/公開/所有権の意味、URL、DBモデル、依存、drawio/SVGが示すサービス境界は変わらないためrules/README/図/AGENTSは更新不要。操作・処理順・API/検証入口に関係するproduct/architecture/change-map/development/verificationを同期する。[独立レビュー原記録](shop-save-independent-review-20261015.md)は読取時点のまま保存し、過去の研究・検証記録も当時のまま保持する。
