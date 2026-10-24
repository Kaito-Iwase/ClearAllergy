# Runtime dependency security update — 2026-10-24

Issue: https://github.com/Kaito-Iwase/ClearAllergy/issues/104
Stack base: Next PR #106, 5971040501237776e12152bfee839a82f7563a3b。Nextの差分は本PRへ重複させず、別Draftで確認する。merge/deployは行わない。

## Scope and vendor evidence

| 対象 | 旧解決版 | 候補 | 根拠 |
| --- | --- | --- | --- |
| root Zod | 4.4.3 | 4.6.6完全固定 | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) / CVE-2023-54404、[release](https://github.com/colinhacks/zod/releases/tag/v4.6.6) |
| cli-config0.2.0配下 Zod | 4.1.11 | root4.6.6へ統一 | 同advisory、現在consumerだけのoverride |
| Blob配下 Undici | 6.28.1 | 6.29.1 | [excessive content-encoding](https://github.com/advisories/GHSA-xjj6-f33q-929c) / CVE-2026-109869、[EventSource](https://github.com/advisories/GHSA-4qv8-2p9j-2685) / CVE-2026-109924、[release](https://github.com/nodejs/undici/releases/tag/v6.29.1) |
| Hono | 4.13.7 | 4.13.11完全固定 | [GHSA-5r4p-p66f-jhc7](https://github.com/advisories/GHSA-5r4p-p66f-jhc7) / CVE-2026-111757、[release](https://github.com/honojs/hono/releases/tag/v4.13.11) |

Zodはcollection上限超過時に要素parse前で停止する修正。アプリはZodをschemaへ使うが、巨大入力・負荷・攻撃実証は行わない。Undiciは既存Blob SDKの互換range内で更新し、自作EventSource/直接Undici利用は確認できない。Honoの該当条件はserveStaticで、自作sourceには利用が見つからない。対象版検出、到達可能性、実害を区別する。本番への攻撃・侵害は確認していない。

Vercel/Clerk SDK、Node、Prisma、React、認証/権限/公開/食品確認/DB契約は維持。latest CLI configにも旧Zod exact pinが残るためSDK一括更新を選ばず、npm公式のscoped overrideを用いる。@vercel/cli-config@0.2.0だけをrootのzod specへ合わせる。CLI consumerの純粋なschemaのparse/encode、既存field/将来field保持、不正型拒否を小さい架空fixtureで確認する。実設定reader/writer、home、資格情報、providerへは接続しない。上流が修正版Zodを要求した時、consumer版変更時、Zod更新時にoverrideの削除可否と互換testを再確認する。

## Lock and verification

repo .npmrcや認証値を読まずpublic manifestだけのscratchで既存npm10.9.9を使う。install-links=true、ignore-scripts、空user/global config、public registryを明示。npm install/updateが古いnested解決を維持しaudit4件だったため、fresh scratchのその1entryだけを未解決へ戻してnpmに再解決させた。他のlockを保持し、版/integrityは手書きしていない。最終lockはroot/nested Zodの統合、Hono、Undiciとroot宣言だけが変更対象。公開metadata auditは0件/exit0。初回の6→4→0を最終成功へ上書きしない。

通常の6要素fixtureでmax5を超える時の要素transformが修正前6回となるRED（3件中1fail/2pass）を確認。修正版ではrootとCLI consumerの両方で要素parse前停止と、max5以下の通常変換・入力保持を確認する。これは小さな境界回帰であり、DoS実証・OS隔離security auditの代用ではない。

clean install、全unit/lint/型/full build、隔離component browser、独立read-only review、最終SHAの通常CI/dependency audit、公開後deployment未発生の結果はDraft PRへ記録する。CI workflow自体の変更なし。stack先feature branchをbaseにするため、既存workflow_dispatchが使える場合に同じSHAでCIを実行し、拒否されたworkflow更新は送信しない。新規権限や認証は取得しない。

実Clerk/Blob/production、巨大攻撃入力、browser history Back/Forward、他端末の既存画面への訂正到達は未検証。6つの正確なreview branchだけのVercel deployment guardを維持し、main/develop等の既定動作は変えない。

## Local results before commit

| 確認 | 結果 |
| --- | --- |
| public scratch clean ci | PASS 426 packages、install-links=true / ignore-scripts |
| 公開npm metadata audit | PASS 0件、exit0。Next PR #106と本差分の組合せに対する結果 |
| 通常境界・純粋consumer互換 | RED 1fail/2pass → GREEN 3/3、rootとCLI側の両Zodを確認 |
| 全単体 / Prisma generate・validate | PASS 252/252 skip0 / PASS |
| lint / typecheck / Next16.4.1 Turbopack full build | PASS |
| 隔離component browser | PASS 11/11群、保存→公開、状態区別、二重操作・失敗・競合、確認画面終了、keyboard、320～1536px |
| 独立read-only review | 1round、no findings。実行結果は通常gateの担当が確認 |

最終commitのSHAとremote CI / audit、deployment一覧はPRへ追記する。#106単体のhead5971040の通常CIは成功しているがDependency auditは別依存のためFAILのままであり、この組合せの成功へ読み替えない。
