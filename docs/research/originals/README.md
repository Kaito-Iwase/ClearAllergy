# 読みやすく書き直す前の原稿

[研究資料の入口](../README.md)へ戻る。

ここには、日本語の説明や構成を直す前の原稿を保存します。書き直した本文と比較できるように、元の文章・改行・文字コードを含むファイルの内容をそのまま残します。現在の仕様を説明する文書ではありません。

## 2026-10-15 の日本語改善候補

基準はコミット `cd502b2404f518975dc4243ab6c41a702e7aa226` から作成した作業領域です。安全分析の原稿は2026-09-28の研究を扱い、索引はその後に追加された調査への入口も含みます。

| 保存した原稿 | 書き直した文書 |
| --- | --- |
| [被害・危険の分析原稿](20261015-ja-readability/losses-hazards.md.txt) | [利用者や店舗に生じ得る被害と、その原因になる状況](../safety/losses-hazards.md) |
| [研究索引の原稿](20261015-ja-readability/research-index.md.txt) | [研究資料の入口](../README.md) |

原稿は `.md.txt` として保存しました。原稿内の相対リンクは保存前の場所を基準にしているため、ここではリンクを直さず、文章として保持します。読むためのリンクは上表の書き直した文書を使ってください。`.gitattributes` は、原稿にGitの改行変換を適用せず、原文の空白を整形対象にしないための設定です。原稿の文章や空白を直して一致させることはしません。

当初の日本語改善候補の編集対象は上表の説明と入口でした。別に保存している受領済みの7原稿は編集・移動していません。原稿をそのまま保持することと、読みやすい説明を別に作ることを分けて管理します。

## 2026-10-15 main統合時の原稿16件

`20261015-main-integration/` は作成時点の原稿をbyte単位で保持しています。現行の判断入口・計画は別の閲覧版です。原稿の店舗接触案や「未commit」「task-2内」は当時の状況であり、現在の作業指示ではありません。

- [ca-next-direction-20261015.md.txt](20261015-main-integration/ca-next-direction-20261015.md.txt) — SHA-256 `ff1ce64ad406d23b2a1b37381defdd3ce34869a6fa4e478e30d641bd3c294c0c` / 10378 bytes
- [ca-current-main-issue-audit-20261015.md.txt](20261015-main-integration/ca-current-main-issue-audit-20261015.md.txt) — SHA-256 `102b62e20f745aaeb2e82f927a138a2625d2a7ae43e25379ca8c88ababbe1b07` / 17487 bytes
- [ca-one-dish-reconciliation-20261015.md.txt](20261015-main-integration/ca-one-dish-reconciliation-20261015.md.txt) — SHA-256 `e9248c454c00c3f530aba6323de3ca65546938239d7c50841228d5ee705479d9` / 10685 bytes
- [ca-next-verification-plan-20261015.md.txt](20261015-main-integration/ca-next-verification-plan-20261015.md.txt) — SHA-256 `b07886dcf767838d5a45d08cdc1be087d6ef4e371fc34c9ca972190c6929b1a9` / 13074 bytes
- [ca-next-independent-review-20261015.md.txt](20261015-main-integration/ca-next-independent-review-20261015.md.txt) — SHA-256 `fe5b77844be8fd3971089ce94e2b48bccf95ae22a1bf15765e7ccddcfafe5d0d` / 3510 bytes
- [ca-next-result-20261015.md.txt](20261015-main-integration/ca-next-result-20261015.md.txt) — SHA-256 `82bc03252f2e3b51a5e944e3d628f4e997d5fa34c4bcf6002f42063b34ceb2d4` / 5985 bytes
- [received-research-status-20261015.md.txt](20261015-main-integration/received-research-status-20261015.md.txt) — SHA-256 `f10070de09d11e122d237ce33d1428863d6b9cca593995f454026676b26bc533` / 2711 bytes
- [received-shop-adoption-plan-20261015-v2.md.txt](20261015-main-integration/received-shop-adoption-plan-20261015-v2.md.txt) — SHA-256 `1af435bd82092603fe16d6948367bb02c38cd06bc8a111aefdc5f26066b73d7e` / 22417 bytes
- [received-safety-understanding-plan-20261015-v2.md.txt](20261015-main-integration/received-safety-understanding-plan-20261015-v2.md.txt) — SHA-256 `4286a521f8e423112c6182863cb37e0d596e5b6a4cbf4458e7c5b2de940c5c2f` / 37203 bytes
- [received-plans-independent-review-20261015.md.txt](20261015-main-integration/received-plans-independent-review-20261015.md.txt) — SHA-256 `8308152fe07cf9e4021ea956c6e6b0b62004b7d02dc106db11f425e715d9f2ff` / 20165 bytes
- [received-shop-adoption-plan-20261015-v1.md.txt](20261015-main-integration/received-shop-adoption-plan-20261015-v1.md.txt) — SHA-256 `3412ee9b6d0dec7c53a44c4bcb206efe00256fd6ecb3b32da2314c39a2c335c5` / 15695 bytes
- [received-safety-understanding-plan-20261015-v1.md.txt](20261015-main-integration/received-safety-understanding-plan-20261015-v1.md.txt) — SHA-256 `3304c2151e02cb2cc8b3b7b2b7dcd94eb2191a084378b6841581d93ae9445e5f` / 24069 bytes
- [ja-readability-rollout-plan-20261015.md.txt](20261015-main-integration/ja-readability-rollout-plan-20261015.md.txt) — SHA-256 `206c119347994cc36a1f542d9890370c85f51927fcb3a088b884a3abbc1894e6` / 22551 bytes
- [ja-readability-pr78-main-plan.md.txt](20261015-main-integration/ja-readability-pr78-main-plan.md.txt) — SHA-256 `c8be94606e9025d24881e63edee5486527d6e8c437bf72cea9c79512213890e7` / 3469 bytes
- [ja-readability-result-20261015.md.txt](20261015-main-integration/ja-readability-result-20261015.md.txt) — SHA-256 `cdcaec1905c5a7db3ec60460ce0500f49e1e3c6e4f6f14d3f1f2d22fda95c61c` / 9706 bytes
- [ja-readability-content-map.md.txt](20261015-main-integration/ja-readability-content-map.md.txt) — SHA-256 `47ed245bd2fafc5177549eb3c0e85cbb8bf48eae99f3c392aceda20eb441d031` / 6605 bytes
