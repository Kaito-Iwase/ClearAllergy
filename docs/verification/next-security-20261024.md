# Next.js security update — 2026-10-24

Issue: https://github.com/Kaito-Iwase/ClearAllergy/issues/103
Base: `27a119672b7c0c27e743e152749c81a3176dae8c`

## Problem / Evidence
main 27a119672b7c0c27e743e152749c81a3176dae8c の package.json / package-lock.json は Next.js 16.3.8。2026-10-14 の公式更新は16.4.1を修正版として案内しており、対象版の依存更新が必要です。既存の全Issue/PRを照合し、PR #88 の16.3.8更新後を扱う同一Issue/PRは確認できませんでした。

公式: https://nextjs.org/blog/nextjs-security-update-october-14-2026

- GHSA-673q-mjm6-r5xr: Next16.0.0～16.4.0、16.4.1で修正。App Router / Cache Components / 複数typed arrayを返すuse cache関数が条件。アプリ固有ソースには該当use cache / cacheComponents設定を確認していません。公式は同様の関数がなくても更新を推奨。GitHub advisoryのcve_idは取得時nullで、CVEを推測しません。https://github.com/advisories/GHSA-673q-mjm6-r5xr
- GHSA-2464-fhr4-w9xw / CVE-2026-96889（公式ブログの対応）: SVG画像最適化とglibc Linuxが条件。16.4.1で修正。現在のlockは既にsharp0.35.5で、公式の暫定対策条件を満たします。アプリのアップロードはSVGを許可しません。アプリでRCEを再現した報告ではありません。https://github.com/advisories/GHSA-2464-fhr4-w9xw
- GHSA-p3m5-59mp-jv5r / CVE-2026-94482: App Routerと1つ以上のServer Actionが条件のCPU DoS。16.4.1で修正。自作use serverが見つからなくても既存ローカルbuildのserver-reference-manifestにはnode actionsが4件あり、条件を無関係と断定できません。攻撃入力は実行していません。https://github.com/advisories/GHSA-p3m5-59mp-jv5r

これは公式advisoryと対象版・静的条件の照合です。本番への攻撃・侵害・実害は確認していません。

## Minimal scope / Decision
next、@next/env、eslint-config-nextを16.4.1へそろえ、既存のNext ESLint plugin向けローカルfast-glob互換overrideの対象版も一致させます。React、Prisma、認証、DB、公開条件、アレルゲン意味は変更しません。一括依存更新や権限変更は対象外。

## Acceptance criteria
- [ ] 既存npmでpublic registryからlockを再解決し、対象Next系の版・integrity・差分を照合する。
- [ ] local fast-glob互換層とplugin呼出API、rootDirおよび内部リンク検知の既存回帰を確認する。
- [ ] Prisma生成/validate、全単体、lint、型、full build、可能な隔離browser/DB回帰を実行する。公式advisory照合と通常回帰を攻撃実証と混同しない。
- [ ] 独立レビュー、Draft PR、最終headのCI、該当branchのデプロイ未発生を記録する。
- [ ] 未検証条件・互換性・本番適用前の確認を残す。merge/deploy/本番変更は行わない。

## Isolation / Limitations
repo .npmrcや認証情報は読まず、public manifestのみのscratchから既存npmを実行。新規token/login/権限追加なし。通常回帰は架空資格情報とloopback使い捨てDBに限定。security-audit Skillの全OS隔離条件を満たせない攻撃検証は実行しません。

## Verification status

| 確認 | 結果 |
| --- | --- |
| public scratch lock解決 / clean ci | PASS、`--install-links=true --ignore-scripts` を明示、427 packages。初回のlink形式との差は独立reviewで検出しpacked形式へ修復 |
| Prisma generate / validate | PASS |
| 全単体 | PASS 249/249、skip0、Next rootDir/内部リンク検知の既存回帰を含む |
| lint / typecheck | PASS |
| Next16.4.1 Turbopack full build | PASS、コンパイル・型・静的生成完了 |
| 隔離component browser | PASS 11/11群、保存→公開、UNKNOWN/MAY_CONTAIN区別、保存/公開失敗、応答喪失、二重操作、競合、確認画面を閉じる/Escape/編集へ戻る/キーボード、320～1536px |
| npm audit（public metadata） | FAIL、Nextの3advisoryは検出されず、別依存high5/moderate1の6package entriesが残る。独立advisory4件を[#104](https://github.com/Kaito-Iwase/ClearAllergy/issues/104)で追跡 |
| 独立read-only review | 初回のlock形式指摘を修復、他の指摘なし。修復後clean ci/gateを別確認 |
| 実DB / 実Clerk / 実Blob / production | 今回未実施。CIの架空DB・公開画面結果は最終SHAで別記録。ブラウザ履歴のBack/Forward・既に開いた他端末画面への訂正到達も未検証 |

最初のgateは未配置の依存でPrisma起動前に停止し、次のbuildはnode_modules junctionがNextのroot境界を越えるため停止しました。依存実体を専用worktreeへ配置した後の上表の成功と区別します。アプリ設定を変えてビルド境界を回避していません。security-audit用のOS隔離条件を満たす攻撃検証とは別の、承認済み通常機能回帰です。

検証の実行結果はDraft PRに記録します。更新先は16.4.1完全固定、既存Node22.23.4・ローカルnpm10.9.9を使用（CI npm11.18.0との差あり）。新規OSソフト、認証、設定権限の導入はしません。public manifest用scratchのignore-scripts clean installは427 packages、終了0。アプリgateはnpmを経由せず既存CLIを直接Nodeで呼びます。

履歴の2026-10-19記録は書き換えず、現行architecture/developmentと限定glob互換層の対象版コメントを更新します。依存以外のアプリ挙動・schema・食品確認/公開条件は変更しません。branch限定のVercel git.deploymentEnabled=falseは公式仕様を確認してpush前に含めます。
