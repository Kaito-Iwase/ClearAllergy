# Codex 用実装プロンプト / 設計ルール

## 目的

ClearAllergy の今後の実装支援で、Codex が毎回同じ前提を確認し、認証・公開条件・入力ルールを壊さないようにするための実務文書です。

## 定型プロンプト

```text
ClearAllergy リポジトリで作業します。
まず関連する app / components / lib / prisma の現行実装を読んでから変更してください。
推測で既存仕様を書き換えず、確認できた事実と未確定事項を分けてください。
管理画面では Clerk 認証、shopId による所有権確認、同一 origin の mutation 制約を壊さないでください。
メニュー公開条件は現行の `getMenuPublishValidationErrors` と管理メニュー API を基準にしてください。
DB スキーマ変更は明示依頼がない限り前提にしないでください。
実装変更は小さくし、文言・バリデーション・API 責務の変更点を最後に要約してください。
```

## ルーティングの前提

| 領域 | ルート | 前提 |
| --- | --- | --- |
| 公開 | `/` | 公開中メニューを持つ店舗をピックアップ表示。`isActive` 条件は現状揺れあり |
| 公開 | `/shops` | `isActive: true` かつ公開メニューありの店舗一覧 |
| 公開 | `/shops/[shopId]` | `isActive: true` かつ公開メニューありの店舗だけ表示 |
| 公開 | `/shops/[shopId]/menus/[menuId]` | `isPublished: true` かつ `shop.isActive: true` のメニューだけ表示 |
| 管理 auth | `/admin/login`, `/admin/register` | 未ログイン・店舗未作成向け |
| 管理 dashboard | `/admin/shop`, `/admin/menus`, `/admin/menus/new`, `/admin/menus/[menuId]/edit` | `requireCurrentAdminContextOrRedirect` を通す |
| API 管理 | `/api/admin/**` | `requireShopId` と mutation の same-origin 検証を使う |
| API 公開 | `/api/menus/[menuId]`, `/api/allergens` | 公開データ取得用 |

## バリデーションの責務

| 層 | 責務 | 例 |
| --- | --- | --- |
| Client Component | 早めの入力補助、即時エラー、ボタン disabled | 店舗名未入力、メニュー名未入力 |
| API route | 最終的な保存・公開バリデーション | 価格、平均予算、画像 URL、公開条件、所有権 |
| `lib/validators/admin-input.ts` | 文字列・数値・boolean の入力整形 | `toTrimmedNullableString`, `parsePriceYen` |
| `lib/allergens.ts` | アレルゲン状態、公開条件、表示ラベル | `validateAllergenStatusMap`, `getMenuPublishValidationErrors` |
| Prisma schema | データ型、default、relation | `AllergenStatus`, `MenuItem.isPublished` |

ルール:

- 公開条件は UI だけに置かない。
- API 直打ちでも公開条件を越えられないようにする。
- `UNKNOWN` を `FREE` に自動変換しない。
- `shopId` は request body から受け取らず、認証コンテキストから決める。

## UI文言のルール

| 状況 | 現行基準 |
| --- | --- |
| アレルゲン状態 | 未設定 / 含む / 含まない / 含む可能性があります |
| 原材料名 | 推奨。未入力でも保存・公開可 |
| 注意書き | 推奨。未入力でも保存・公開可 |
| 公開状態 | フォーム上は「公開中 / 非公開」、一覧では「公開中 / 下書き」 |
| 保存成功 | 「保存しました。」または「店舗情報を保存しました。」 |
| 価格未入力 | 「価格未設定」または「価格なし」系の表示 |

実装時の注意:

- 既存文言と矛盾する新しい必須表現を入れない。
- 「安全」「完全に含まない」など、現行より強い保証表現を追加しない。
- 文言を変更する場合は、公開画面と管理画面の両方の表示差を確認する。

## API責務のルール

| API | 責務 |
| --- | --- |
| `GET /api/admin/shop` | ログイン中店舗の編集用データ取得 |
| `PUT /api/admin/shop` | ログイン中店舗のみ更新 |
| `GET /api/admin/menus` | ログイン中店舗のメニュー一覧取得 |
| `POST /api/admin/menus` | ログイン中店舗にメニュー作成、必要なら公開条件検証 |
| `GET /api/admin/menus/[menuId]` | ログイン中店舗のメニューのみ取得 |
| `PUT /api/admin/menus/[menuId]` | ログイン中店舗のメニューのみ更新、公開状態なら公開条件検証 |
| `DELETE /api/admin/menus/[menuId]` | ログイン中店舗のメニューのみ削除 |
| `GET /api/menus/[menuId]` | 公開中メニュー取得。`shop.isActive` 条件は揃える余地あり |

## 変更対象外を明示するルール

明示依頼がない限り、以下は変更しない。

| 対象外 | 理由 |
| --- | --- |
| Prisma schema / migration | DB 変更は影響が大きい |
| Clerk 認証フロー | 管理画面の入口と所有権に直結する |
| `requireShopId` / `requireCurrentAdminContextOrRedirect` の弱体化 | 他店舗データ閲覧・更新を防ぐため |
| 画像 URL の許可ポリシー | 公開画面の安全性に関係する |
| `UNKNOWN` の自動 `FREE` 化 | 未確認情報を安全扱いにしてしまう |
| 公開条件の緩和 | アレルゲン表示の信頼性に直結する |

## 実装時の確認項目

| 観点 | 確認 |
| --- | --- |
| ルート | App Router の該当 page / route を読んだか |
| 所有権 | `shopId` 条件が維持されているか |
| 認証 | 管理画面で Clerk 前提を崩していないか |
| 公開条件 | `getMenuPublishValidationErrors` と矛盾しないか |
| 保存条件 | 下書き保存と公開保存を混同していないか |
| UNKNOWN | 未設定を安全扱いしていないか |
| 文言 | 原材料名・注意書きを勝手に必須扱いしていないか |
| 画像 | 保存済み URL 検証を迂回していないか |
| スマホ | 長い文言やボタンが折り返しても破綻しないか |

## レビュー時の確認項目

| 観点 | NG 例 |
| --- | --- |
| 公開条件 | UI でだけ公開可否を判定している |
| 認可 | request body の `shopId` で更新先を決めている |
| アレルゲン | `UNKNOWN` を非表示にして「含まない」と誤解させる |
| 入力ルール | 原材料名や注意書きを実装根拠なしに必須化している |
| ルーティング | 公開画面間で `isActive` / `isPublished` 条件が広がっている |
| API | 画像 URL をそのまま信用して返す |
| UI | エラーがフォーム上部だけで、該当項目が分からない |

## 最小実装タスクの切り方

1. 文言だけを揃える
2. UI の表示順だけを変える
3. Client 側の補助バリデーションを足す
4. API の最終バリデーションを足す
5. テストを足す

この順番を崩す場合は、理由を PR または作業メモに書く。
