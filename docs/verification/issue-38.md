# #38: メニュー最終書き込みの所有店舗条件

[README](../../README.md) · [自律開発](../agentic-development.md) · [Issue #38](https://github.com/Kaito-Iwase/ClearAllergy/issues/38)

基点は main `1830a98fd4f8b60e9621417a5b843a4e42e0d81a`。PUT/DELETE の事前取得後に menu.shopId が変わると、id のみの最終書き込みが移転先へ作用する局所反例を修復する。通常の移転 API や、実環境での越権成立を示す報告ではない。

## 動作と境界

サーバーで Clerk セッションから解決した shopId と menuId の両方を、トランザクション内の update/delete に指定する。該当行がなくなった場合の Prisma P2025 は、既存の404 `{"error":"menu not found"}` を返す。DELETE に先行するリンク削除もトランザクションとともに巻き戻る。拒否した操作を成功監査や公開 cache 更新へ進めない。その他の DB 障害は従来の内部エラーへ戻す。

認証方式、店舗所有者モデル、同一 origin、portfolio 制限、公開条件、正常レスポンス、アレルゲン4状態と店舗補足は維持する。shop owner/isActive 自体の同時変更を即座に取り消す保証、同時編集の lost update 防止、Clerk/Blob の実接続、食品情報の正しさはこの変更の検証対象外。

## 検証

- API 回帰: 未認証401、店舗なし403、他店舗404、portfolio、入力、公開条件に加え、移転/消失後のPUT/DELETEと成功監査/cache更新の抑止。
- `scripts/check-owned-menu-database.ts`: 既存 CI または Compose の接続ガード通過後だけ実行。架空の2店舗と公開条件を満たすメニューを作り、実際の所有権 read と transaction の間で移転/削除を挿入する。HTTP404、menu fields、全 links、無関係な自店舗メニューの不変を確認する。正常 owner の PUT/DELETE も確認する。作成した fixture と監査行だけを finally で削除する。
- CI: `setup-ci-env.ts` の空の一時 PostgreSQL への既存 migration/架空 master 準備後に本回帰を実行する。runner 自体に migration/seed/外部サービス操作はない。通常 DB・本番・実 Clerk/Blob を接続先にしない。

2026-10-04 の fresh RED は API 14件中4失敗（移転は期待404/実200、消失は期待404/実500）。実 PostgreSQL の PUT 移転も期待404/実200で失敗した。修復後は API14/14、実PGの移転/消失4ケースと正常CRUD1組が成功した。全検証・独立 review・GitHub checks の最終結果は Issue/PR に対象 HEAD とともに記録する。

Prisma Client は lock の6.19.3を使用する。Context7 の現在資料は新しい major の説明を多く含むため、それを6系へ転用せず、生成済み型・型検査・実PG実行で今回の条件付きwrite/P2025/rollbackを確認した。依存更新、schema/migration変更はない。

local Node22.15.1 と指定22.23.1の差、実サービス・本番配備・利用者理解度は別の証拠であり、local成功から推測しない。public Chromium は最終HEADのCIで確認し、実管理認証ブラウザは未確認として残す。

## 文書の扱い

mainにはguide/researchが未公開のため、この公開文書とIssue本文を再開入口にする。canonicalの未push/未commit資料を一括復元しない。参照全体の整合は #60、実配備のEvidence ledgerは #54で扱う。ロールバックで所有店舗条件を外すと元の競合を再導入するため、人間の安全判断を伴う。通常PRはmergeしない。
