# ハーネス導入時の監査

[自律開発手順](agentic-development.md) · [AGENTS.md](../AGENTS.md)

2026-10-04 JSTのsource-backed snapshot。継続的な現在状態の保証ではなく、次回はGitHubとcheckoutを再取得する。対象はmain `27d3e96c166f21433a37f2d6b587eb6094482095`と、canonical checkout `improve/prototype-usability-ci` HEAD `f1f209cc4f6891f22ada0a4916244b2be2217e32`。後者は7未push commit・22未commit/untracked fileで、今回その内容を変更/公開しない。

## 調査結果

| 領域 | 確認した証拠・判断 |
| --- | --- |
| 指示/文書 | root AGENTSのみ。mainのdocsはignoreされ未配置、ローカルbranchにはguide/researchがある。Issue本文のlocal研究参照はmainから復元できない。新手順はmainだけで読める参照に限定 |
| GitHub運用 | open Issue 21件（#37–#57）、open PR 0、標準label9種。実装/判断/research/planningを本文で区別。repo default main、取得branch metadataでmain/develop protected=false。rulesets/required checks全体は未確認、merge許可へ読み替えない |
| package/lock | mainとcanonicalのpackage/lock/schemaは同一。Next 16.3.4、Prisma/Client lock6.19.3、React19系、既存tsx/native node:test。lint/typecheck/test/buildとprebuild生成を実在確認。新dependency/framework不要 |
| runtime | ホストNode22.15.1/npm10.9.2、指定Node22.23.1、CI npm11.18.0。隔離依存のlocal npmをrunnerに使用。ホストNode差をreportし、CIの指定runtimeを別途確認 |
| CI | mainのci.ymlはmain/developのPR/push、PG17一時service、Prisma生成、tests/lint/typecheck、guard付きfictional fixture、build、公開Chromium。local branchにある追加DB回帰runner/validate/log要約をmainで実行済みと扱わない |
| CI履歴 | PR #36 head58cd72aのCI run35515682300はsuccess、公開browser stepもsuccess。今回のheadの結果へ流用しない。Vercel successも同じ旧headの記録に限る |
| 基準テスト | clean mainにlocked依存を隔離配置しPrisma生成後、`npm.cmd test` 56/56、fail0/skip0。変更前lint/typecheck/buildは別の未実施項目であり、この56件から成功を推測しない |
| 配置/入口 | appはroute入口、featuresは機能UI/server、libは共有rule/auth/DB、prismaはschema/migrations、scripts/testsは既存検証。公開/管理/APIを構造変更しない |
| 認証/認可 | proxyのadmin/API matcher、Clerk本人情報→User→稼働owned Shop→resource条件。mainのadminMenuRoute最終writeはid-onlyで#38の対象、ローカル修復と混ぜない。未認証/他店舗/portfolioのAPI mockがある |
| 公開/アレルゲン | schemaの4enumとUNKNOWN default、master集合、公開helper、公開APIの404、店舗由来STORE_HANDLEDを確認。mainの未知値fallbackが#37対象。食品情報の真実・医療保証・厨房確認ではない |
| DB | MenuItem→Shop、MenuItemAllergen複合PK/FK、Shop所有者unique、pending招待の部分unique、publicationのdeferred constraint triggerが既存16 migrationにある。定義の存在は本番適用の証拠ではない |
| テスト限界 | mockは実Clerk/Blob/PG raceの代用でない。専用Compose DB/CI guardは実在、admin browserは外部write。今回のrunnerから自動起動しない |

## 選別と設計判断

- #37: safety、局所修復、正常意味/契約を維持できる。既存local切り出しfd5028dは未公開、今回のfresh RED/GREENで再検証して1件の実証に選択。risk-high、manual review/merge。
- #38: authz境界強化だがcanonicalの継続作業と実DB回帰があり、owner/DB証拠の重複を避けてBLOCKEDとして保留。未認証/他店舗mockの成功だけで完了にしない。
- #39–#47: 人間判断Issue。#48/#50/#51/#55/#56/#57は判断依存を保持。
- #49/#52/#53/#54: measurement/research/planning/evidenceの限定作業のみ可能。実配備/利用者/Clerk/DB/担当者・許可の不足を実装可能Readyへ変換しない。対象環境なしの完了主張を防ぐ。
- #58: ユーザーが依頼したハーネス。Issue本文だけの運用、巨大framework、GitHub writeを行うdaemonを比較し、手順+JSON queue提案+既存script検証を採用。コードを実装するのはCodex、runnerは決定・許可を代行しない。

設計理由は、session終了後もGitHubのclaim/plan/review/PRから復元し、label単独の許可・古い成功・未公開文書への依存を防ぐこと。labelは4種のみ追加し、通常のmerge/deploy/cloud設定は変更しない。policy regressionは古いsnapshot、定義変更、依存不明、owner/scope衝突、人間判断、同じIssueの既存PRをfail closedにする。

導入時の実行・独立review・PR・改善探索はIssue #58/#37と各PRに最終headを付けて記録する。この文書に未来の成功結果を先に書かない。

## 残る不一致と運用上の限界

main READMEの画像参照と、Issueの研究資料は未公開部分がある。既存dirty文書をまとめてpushすることは今回の最小scopeでは行わない。証拠のあるfollow-upへ分ける。claimはGitHub commentなのでatomic lockではなく、並列度1とlive再取得で制限する。queue JSONの完全性をAPIで自動証明する機能はない。repo settings、本番migration/backup/alerts、実service、UX理解度はUNKNOWN/UNVERIFIEDを維持する。
