# ClearAllergy API チートシート

## 0. このチートシートの目的

このドキュメントは、ClearAllergy の API Route / Route Handler を素早く確認するための早見表です。

初学者向けに、各 API について次を整理します。

- URL
- HTTP メソッド
- 何をする API か
- ログインが必要か
- 認証・認可の方法
- 入力
- 出力
- DB 操作
- エラー
- 関連ファイル

現在の正しい認証前提は Clerk です。管理 API は Clerk ログイン状態と shopId 所有確認で保護します。

## 1. API 全体マップ

```txt
app/api/
├─ allergens/route.ts
│  └─ GET /api/allergens
├─ menus/[menuId]/route.ts
│  └─ GET /api/menus/[menuId]
├─ invitations/accept/route.ts
│  └─ POST /api/invitations/accept
└─ admin/
   ├─ shop/route.ts
   │  ├─ GET /api/admin/shop
   │  └─ PUT /api/admin/shop
   ├─ menus/route.ts
   │  ├─ GET /api/admin/menus
   │  └─ POST /api/admin/menus
   ├─ menus/[menuId]/route.ts
   │  ├─ GET /api/admin/menus/[menuId]
   │  ├─ PUT /api/admin/menus/[menuId]
   │  └─ DELETE /api/admin/menus/[menuId]
   ├─ upload-shop-image/route.ts
   │  └─ POST /api/admin/upload-shop-image
   ├─ upload-menu-image/route.ts
   │  └─ POST /api/admin/upload-menu-image
   ├─ register/route.ts
   │  └─ POST /api/admin/register
   ├─ onboarding/route.ts
   │  └─ POST /api/admin/onboarding
   ├─ auth/login/route.ts
   │  └─ POST /api/admin/auth/login
   ├─ auth/sso/route.ts
   │  └─ POST /api/admin/auth/sso
   └─ invitations/route.ts
      ├─ GET /api/admin/invitations
      └─ POST /api/admin/invitations
```

## 2. 公開 API と管理 API の違い

| 種類 | URL prefix | ログイン | 更新 | 目的 |
| --- | --- | --- | --- | --- |
| 公開 API | `/api/allergens`, `/api/menus` | 不要 | しない | 利用者向けに公開情報を返す |
| 管理 API | `/api/admin` | 必要 | する | 店舗管理者・運営管理者が管理操作をする |

公開 API は「読めるだけ」です。

管理 API は DB や Blob を更新するため、次のチェックが必要です。

```txt
管理API
  ↓
Same Origin 確認（更新系）
  ↓
Clerk ログイン確認
  ↓
DB で User / Shop 確認
  ↓
shopId 所有確認
  ↓
DB 更新
```

## 3. 管理 API 共通 helper

### `requireShopId()`

- ファイル: `app/api/admin/_utils.ts`
- 目的: 管理 API でログイン中の店舗 ID を取得する。
- 返すもの: `shopId`, `appUser` または 401/403/503 レスポンス。

処理イメージです。

```txt
requireShopId()
  ↓
getCurrentAdminContext()
  ↓
Clerk auth() から userId
  ↓
User.clerkUserId で appUser
  ↓
Shop.ownerClerkUserId で active Shop
  ↓
shopId を返す
```

重要な点は、`shopId` を request body から取らないことです。

### `enforceSameOriginAdminMutation(req)`

- ファイル: `lib/admin-api-security.ts`
- 目的: 更新系 API で `Origin` が同じサイトか確認する。
- 対象: GET/HEAD/OPTIONS 以外。
- 失敗時: 403。

CSRF 対策の一部です。CSRF とは、ログイン済みユーザーのブラウザに別サイトから勝手にリクエストを送らせる攻撃です。

### `readJson(req)`

- ファイル: `app/api/admin/_utils.ts`
- 目的: 壊れた JSON で API が落ちないようにする。
- 失敗時: `null` を返す。

### `internalError(e)`

- ファイル: `app/api/admin/_utils.ts`
- 目的: 500 エラーを整形する。
- 開発環境: エラーメッセージも返す。
- 本番環境: 内部情報を出しすぎない。

## 4. 公開 API

### GET `/api/allergens`

| 項目 | 内容 |
| --- | --- |
| ファイル | `app/api/allergens/route.ts` |
| 用途 | アレルゲン29品目の一覧取得 |
| 利用者 | 公開画面・管理画面の選択肢 |
| ログイン | 不要 |
| 入力 | なし |
| 出力 | `{ allergens: [...] }` |
| DB 読み取り | `Allergen` |
| DB 更新 | なし |

処理フローです。

```txt
GET /api/allergens
  ↓
prisma.allergen.findMany({
  orderBy: { sortOrder: "asc" },
  select: { slug, nameJa, nameEn, sortOrder }
})
  ↓
NextResponse.json({ allergens })
```

主なエラーは、DB 接続失敗時の 500 です。この API には明示的な try/catch はありません。

### GET `/api/menus/[menuId]`

| 項目 | 内容 |
| --- | --- |
| ファイル | `app/api/menus/[menuId]/route.ts` |
| 用途 | 公開メニュー詳細を JSON で返す |
| 利用者 | 公開メニュー詳細画面など |
| ログイン | 不要 |
| 入力 | URL の `menuId` |
| 出力 | `{ menu: {...} }` |
| DB 読み取り | `MenuItem`, `Allergen`, `MenuItemAllergen` |
| DB 更新 | なし |
| 公開条件 | `isPublished: true` |

処理フローです。

```txt
GET /api/menus/[menuId]
  ↓
params または URL 末尾から menuId を取得
  ↓
menuId がなければ 400
  ↓
prisma.menuItem.findFirst({
  where: { id: menuId, isPublished: true }
})
  ↓
見つからなければ 404
  ↓
Allergen マスタ取得
  ↓
buildAllergenRows()
  ↓
validateStoredImageUrl()
  ↓
JSON で返す
```

ステータスコードです。

| ステータス | 条件 |
| --- | --- |
| 200 | 公開メニューが見つかった |
| 400 | `menuId` がない |
| 404 | メニューがない、または非公開 |
| 500 | サーバーエラー |

## 5. 管理: メニュー API

### GET `/api/admin/menus`

| 項目 | 内容 |
| --- | --- |
| ファイル | `app/api/admin/menus/route.ts` |
| 用途 | 自店舗のメニュー一覧取得 |
| ログイン | 必要 |
| 認証 | `requireShopId()` |
| 認可 | `where: { shopId: auth.shopId }` |
| 入力 | なし |
| 出力 | `{ menus: [...] }` |
| DB 読み取り | `MenuItem` |
| DB 更新 | なし |

処理フローです。

```txt
GET /api/admin/menus
  ↓
requireShopId()
  ↓
prisma.menuItem.findMany({
  where: { shopId: auth.shopId },
  orderBy: { updatedAt: "desc" },
  select: { id, name, priceYen, category, imageUrl, isPublished, updatedAt }
})
  ↓
画像URLを validateStoredImageUrl() で確認
  ↓
{ menus } を返す
```

### POST `/api/admin/menus`

| 項目 | 内容 |
| --- | --- |
| ファイル | `app/api/admin/menus/route.ts` |
| 用途 | 自店舗にメニューを新規作成 |
| ログイン | 必要 |
| 認証 | `requireShopId()` |
| 認可 | `shopId` は `auth.shopId` を使用 |
| 入力 | メニュー基本情報、画像URL、公開状態、アレルゲン状態 |
| 出力 | `{ id: created.id }` |
| DB 読み取り | `Allergen` |
| DB 更新 | `MenuItem`, `MenuItemAllergen`, `AuditLog` |

入力 body の主な項目です。

| 項目 | 型 | 説明 |
| --- | --- | --- |
| `name` | string | メニュー名。未指定時は下書き名 |
| `description` | string/null | 説明 |
| `priceYen` | number/string/null | 価格 |
| `category` | string/null | カテゴリ |
| `ingredients` | string/null | 原材料 |
| `precaution` | string/null | 注意書き |
| `imageUrl` | string/null | Vercel Blob 由来の画像URL |
| `isPublished` | boolean | 公開状態 |
| `allergenStatusBySlug` | object | slugごとのアレルゲン状態 |

処理フローです。

```txt
POST /api/admin/menus
  ↓
Same Origin 確認
  ↓
requireShopId()
  ↓
ポートフォリオモード更新可否確認
  ↓
JSON 読み取り
  ↓
価格・文字列・画像URL・アレルゲン状態を検証
  ↓
Allergen マスタ取得
  ↓
公開する場合は UNKNOWN が残っていないか確認
  ↓
transaction
    MenuItem 作成
    MenuItemAllergen 29品目作成
  ↓
AuditLog 記録
  ↓
201 { id }
```

重要ポイントです。

```txt
body.shopId は受け取らない
  ↓
auth.shopId を使う
  ↓
他店舗に作成できない
```

### GET `/api/admin/menus/[menuId]`

| 項目 | 内容 |
| --- | --- |
| ファイル | `app/api/admin/menus/[menuId]/route.ts` |
| 用途 | 自店舗のメニュー1件を編集用に取得 |
| ログイン | 必要 |
| 認証 | `requireShopId()` |
| 認可 | `where: { id: menuId, shopId: auth.shopId }` |
| 入力 | URL の `menuId` |
| 出力 | `{ menu: {...} }` |
| DB 読み取り | `MenuItem`, `Allergen`, `MenuItemAllergen` |
| DB 更新 | なし |

他店舗の `menuId` を指定しても 404 です。

### PUT `/api/admin/menus/[menuId]`

| 項目 | 内容 |
| --- | --- |
| ファイル | `app/api/admin/menus/[menuId]/route.ts` |
| 用途 | 自店舗のメニューを更新 |
| ログイン | 必要 |
| 認証 | `requireShopId()` |
| 認可 | `findFirst({ where: { id: menuId, shopId: auth.shopId } })` |
| 入力 | URL の `menuId` と更新 body |
| 出力 | `{ menu: updatedMenu }` |
| DB 更新 | `MenuItem`, `MenuItemAllergen`, `AuditLog` |

処理フローです。

```txt
PUT /api/admin/menus/[menuId]
  ↓
Same Origin 確認
  ↓
requireShopId()
  ↓
menuId 取得
  ↓
JSON 読み取り
  ↓
existing = prisma.menuItem.findFirst({
    where: { id: menuId, shopId: auth.shopId }
  })
  ↓
なければ 404
  ↓
入力検証
  ↓
公開する場合は UNKNOWN が残っていないか確認
  ↓
transaction
    MenuItem 更新
    MenuItemAllergen deleteMany
    MenuItemAllergen createMany
  ↓
AuditLog 記録
  ↓
{ menu }
```

IDOR 対策の中心はここです。

```ts
where: { id: menuId, shopId: auth.shopId }
```

### DELETE `/api/admin/menus/[menuId]`

| 項目 | 内容 |
| --- | --- |
| ファイル | `app/api/admin/menus/[menuId]/route.ts` |
| 用途 | 自店舗のメニュー削除 |
| ログイン | 必要 |
| 認証 | `requireShopId()` |
| 認可 | `where: { id: menuId, shopId: auth.shopId }` |
| 入力 | URL の `menuId` |
| 出力 | `{ ok: true }` |
| DB 更新 | `MenuItemAllergen`, `MenuItem`, `AuditLog` |

処理フローです。

```txt
DELETE /api/admin/menus/[menuId]
  ↓
Same Origin 確認
  ↓
requireShopId()
  ↓
menuId 取得
  ↓
自店舗メニューか確認
  ↓
MenuItemAllergen を先に削除
  ↓
MenuItem を削除
  ↓
AuditLog 記録
  ↓
{ ok: true }
```

## 6. 管理: 店舗 API

### GET `/api/admin/shop`

| 項目 | 内容 |
| --- | --- |
| ファイル | `app/api/admin/shop/route.ts` |
| 用途 | 自店舗情報を取得 |
| ログイン | 必要 |
| 認証 | `requireShopId()` |
| 認可 | `where: { id: auth.shopId }` |
| 出力 | `{ shop: {...} }` |
| DB 読み取り | `Shop` |
| DB 更新 | なし |

処理フローです。

```txt
GET /api/admin/shop
  ↓
requireShopId()
  ↓
prisma.shop.findUnique({ where: { id: auth.shopId } })
  ↓
画像URLを validateStoredImageUrl() で確認
  ↓
{ shop }
```

### PUT `/api/admin/shop`

| 項目 | 内容 |
| --- | --- |
| ファイル | `app/api/admin/shop/route.ts` |
| 用途 | 自店舗情報を更新 |
| ログイン | 必要 |
| 認証 | `requireShopId()` |
| 認可 | `where: { id: auth.shopId }` |
| 入力 | 店舗名、説明、住所、営業時間、画像URLなど |
| 出力 | `{ shop }` |
| DB 更新 | `Shop`, `AuditLog` |

重要な入力検証です。

| 項目 | 検証 |
| --- | --- |
| `name` | 必須、空文字不可 |
| `averageBudgetYen` | 空欄可、0以上の整数 |
| `coverImageUrl` | 許可された Vercel Blob URL のみ |
| 文字列項目 | trim し、空なら null |

処理フローです。

```txt
PUT /api/admin/shop
  ↓
Same Origin 確認
  ↓
requireShopId()
  ↓
JSON 読み取り
  ↓
既存 Shop 取得
  ↓
入力検証
  ↓
prisma.shop.update({
    where: { id: auth.shopId },
    data: ...
  })
  ↓
AuditLog 記録
  ↓
{ shop }
```

## 7. 管理: 画像アップロード API

### POST `/api/admin/upload-shop-image`

| 項目 | 内容 |
| --- | --- |
| ファイル | `app/api/admin/upload-shop-image/route.ts` |
| 用途 | 店舗カバー画像を Vercel Blob に保存 |
| ログイン | 必要 |
| 入力 | `FormData` の `file` |
| 出力 | `{ url, pathname }` |
| DB 更新 | なし |
| Blob 保存先 | `shops/{shopId}/cover-{timestamp}.{ext}` |

### POST `/api/admin/upload-menu-image`

| 項目 | 内容 |
| --- | --- |
| ファイル | `app/api/admin/upload-menu-image/route.ts` |
| 用途 | メニュー画像を Vercel Blob に保存 |
| ログイン | 必要 |
| 入力 | `FormData` の `file` |
| 出力 | `{ url, pathname }` |
| DB 更新 | なし |
| Blob 保存先 | `menu-images/{shopId}/{timestamp}.{ext}` |

共通フローです。

```txt
POST upload API
  ↓
Same Origin 確認
  ↓
requireShopId()
  ↓
formData から file 取得
  ↓
validateImageFile(file)
  ↓
uploadImageToBlob()
  ↓
{ url, pathname }
```

`validateImageFile()` の制限です。

| 制限 | 内容 |
| --- | --- |
| MIME | JPEG / PNG / WebP / GIF / AVIF |
| サイズ | 5MB 以下 |

画像 API は DB に URL を保存しません。URL を返すだけです。実際の DB 保存は `/api/admin/shop` または `/api/admin/menus/[menuId]` が行います。

## 8. 管理: 登録・ログイン関連 API

### POST `/api/admin/register`

| 項目 | 内容 |
| --- | --- |
| ファイル | `app/api/admin/register/route.ts` |
| 用途 | Clerk ユーザー作成 + DB User / Shop 作成 |
| ログイン | 不要 |
| 入力 | `shopName`, `email`, `password`, `inviteToken` |
| 検証 | `adminRegisterSchema` |
| DB 更新 | `User`, `Shop`, `AuditLog` |
| Clerk 操作 | ユーザー作成、失敗時削除 |

処理フローです。

```txt
POST /api/admin/register
  ↓
Same Origin 確認
  ↓
ポートフォリオモード確認
  ↓
zod で入力検証
  ↓
rate limit
  ↓
登録許可モード確認
  ↓
既存 email 確認
  ↓
Clerk ユーザー作成
  ↓
DB User + Shop 作成
  ↓
Clerk externalId 更新
  ↓
AuditLog 記録
  ↓
201
```

### POST `/api/admin/onboarding`

| 項目 | 内容 |
| --- | --- |
| ファイル | `app/api/admin/onboarding/route.ts` |
| 用途 | Clerk ログイン後、Shop 未作成ユーザーの初回店舗作成 |
| ログイン | 必要 |
| 入力 | `shopName`, `inviteToken` |
| 検証 | `adminOnboardingSchema` |
| DB 更新 | `Shop`, `AuditLog` |

### POST `/api/admin/auth/login`

| 項目 | 内容 |
| --- | --- |
| ファイル | `app/api/admin/auth/login/route.ts` |
| 用途 | ログイン前チェックと監査ログ |
| 入力 | `mode: "precheck"` または `mode: "result"` |
| 検証 | `adminLoginPrecheckSchema`, `adminLoginAuditSchema` |
| DB 更新 | `AuditLog` |

Clerk のログイン処理そのものは Clerk が担当します。この API は入力検証、rate limit、監査ログのためにあります。

### POST `/api/admin/auth/sso`

- ファイル: `app/api/admin/auth/sso/route.ts`
- 用途: Google / Clerk SSO 導線の監査。
- 入力: provider, stage, reason など。
- DB 更新: `AuditLog`。

## 9. 管理: 招待 API

### GET `/api/admin/invitations`

| 項目 | 内容 |
| --- | --- |
| ファイル | `app/api/admin/invitations/route.ts` |
| 用途 | 運営管理者向け招待一覧 |
| 認証 | `requirePlatformAdminApi()` |
| DB 読み取り | `AdminInvite`, `Shop` |

### POST `/api/admin/invitations`

| 項目 | 内容 |
| --- | --- |
| ファイル | `app/api/admin/invitations/route.ts` |
| 用途 | 店舗管理者招待を作成 |
| 認証 | `requirePlatformAdminApi()` |
| 入力 | email, shopId または shopName, expiresInDays |
| 検証 | `adminInviteCreateSchema` |
| Clerk 操作 | Clerk invitation 作成 |
| DB 更新 | `AdminInvite`, 必要なら `Shop` |

### POST `/api/admin/invitations/[inviteId]/resend`

- ファイル: `app/api/admin/invitations/[inviteId]/resend/route.ts`
- 用途: 招待再送。
- 認証: 運営管理者。

### POST `/api/admin/invitations/[inviteId]/revoke`

- ファイル: `app/api/admin/invitations/[inviteId]/revoke/route.ts`
- 用途: 招待取り消し。
- 認証: 運営管理者。

### POST `/api/invitations/accept`

- ファイル: `app/api/invitations/accept/route.ts`
- 用途: Clerk 招待を受諾し、Shop 所有者を確定する。
- Clerk ログイン状態と招待情報を使います。

## 10. ステータスコード早見表

| ステータス | 意味 | このプロジェクトでの例 |
| --- | --- | --- |
| 200 | 成功 | GET /api/admin/shop |
| 201 | 作成成功 | POST /api/admin/menus, POST /api/admin/register |
| 204 | 内容なし成功 | ログイン監査 API |
| 400 | 入力不正 | JSON 不正、価格不正、menuId 不足 |
| 401 | 未ログイン | 管理 API を未ログインで実行 |
| 403 | 権限なし | 店舗未設定、Origin 不一致、portfolio read only |
| 404 | 見つからない | 他店舗 menuId、非公開メニュー |
| 409 | 競合 | 既存メール、既存 Shop、重複招待 |
| 429 | 試行回数超過 | ログイン・登録 rate limit |
| 500 | サーバーエラー | 予期しない例外 |
| 503 | DB 利用不可 | DB 接続失敗 |

## 11. API を読むときのチェックリスト

管理 API を読むときは、次を確認します。

- `requireShopId()` を呼んでいるか。
- 更新系なら `enforceSameOriginAdminMutation(req)` を呼んでいるか。
- `shopId` を body から信じていないか。
- `where` に `auth.shopId` が入っているか。
- 入力値を検証しているか。
- 画像 URL を `validateStoredImageUrl()` で確認しているか。
- 公開切り替え時に UNKNOWN を止めているか。
- エラー時に詳細を出しすぎていないか。
- AuditLog を記録しているか。

公開 API を読むときは、次を確認します。

- `isPublished: true` を条件にしているか。
- `isActive: true` を条件にしているか。
- 画像 URL を sanitize しているか。
- 非公開データの存在が推測されにくい返し方か。

## 12. 面接で API を説明するなら

短い回答例です。

> 公開 API と管理 API を分けています。公開 API はログイン不要で、公開済みメニューやアレルゲンマスタだけを返します。管理 API は Clerk のログイン状態を確認し、DB からログインユーザーに紐づく Shop を取得します。メニュー更新では `where: { id: menuId, shopId: auth.shopId }` で所有確認するため、他店舗のデータを更新できません。

さらに詳しく聞かれた場合です。

> メニュー作成・更新では、アレルゲン状態も同時に保存します。MenuItem と MenuItemAllergen を transaction で処理し、途中で失敗した場合に中途半端なデータが残らないようにしています。公開時はサーバー側で UNKNOWN が残っていないか確認し、UI を回避されても未設定のまま公開できないようにしています。
