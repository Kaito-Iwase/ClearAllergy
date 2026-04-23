# ClearAllergy コードベース案内

このドキュメントは、初学者が現在のコードベースを追いやすくするための最小ガイドです。  
2026-04-23 時点の実装に合わせて、今どこに何があるかだけに絞って整理しています。

## 1. 最初に見る順番

1. `README.md`
2. `document/current-tech-stack.md`
3. `app`
4. `components`
5. `lib`
6. `prisma`

この順で見ると、画面、API、共通処理、DB の関係を追いやすくなります。

## 2. URL から追う時の地図

### 公開側

- `app/page.tsx`
  - `/`
- `app/(public)/terms/page.tsx`
  - `/terms`
- `app/(public)/shops/page.tsx`
  - `/shops`
- `app/(public)/shops/[shopId]/page.tsx`
  - `/shops/[shopId]`
- `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx`
  - `/shops/[shopId]/menus/[menuId]`

### 管理側

- `app/admin/(auth)/login/page.tsx`
  - `/admin/login`
- `app/admin/(auth)/register/page.tsx`
  - `/admin/register`
- `app/admin/invitations/page.tsx`
  - `/admin/invitations`
- `app/admin/(dashboard)/menus/page.tsx`
  - `/admin/menus`
- `app/admin/(dashboard)/menus/new/page.tsx`
  - `/admin/menus/new`
- `app/admin/(dashboard)/menus/[menuId]/edit/page.tsx`
  - `/admin/menus/[menuId]/edit`
- `app/admin/(dashboard)/shop/page.tsx`
  - `/admin/shop`

## 3. API から追う時の地図

### 管理認証

- `app/api/admin/register/route.ts`
  - 店舗アカウント登録
- `app/api/admin/onboarding/route.ts`
  - Clerk ログイン後の初回店舗作成
- `app/api/admin/auth/login/route.ts`
  - ログイン試行の事前検査と監査ログ
- `app/api/admin/auth/sso/route.ts`
  - Google / SSO 導線の監査ログ
- `app/api/admin/invitations/route.ts`
  - 店舗管理者招待の一覧 / 作成
- `app/api/admin/invitations/[inviteId]/resend/route.ts`
  - 招待の再送
- `app/api/admin/invitations/[inviteId]/revoke/route.ts`
  - 招待の取消

### 管理データ更新

- `app/api/admin/shop/route.ts`
  - 店舗情報の取得 / 更新
- `app/api/admin/menus/route.ts`
  - メニュー一覧 / 新規作成
- `app/api/admin/menus/[menuId]/route.ts`
  - メニュー取得 / 更新 / 削除
- `app/api/admin/upload-shop-image/route.ts`
  - 店舗画像アップロード
- `app/api/admin/upload-menu-image/route.ts`
  - メニュー画像アップロード

### 公開データ

- `app/api/allergens/route.ts`
  - アレルゲン 28 品目一覧
- `app/api/menus/[menuId]/route.ts`
  - 公開中メニュー詳細

## 4. components の責務

| パス | 主な内容 |
| --- | --- |
| `components/public` | 公開画面の検索、警告表示、共有導線、個人設定 UI |
| `components/admin/auth` | 管理ログイン、登録、初回セットアップ UI |
| `components/admin/menu` | メニュー作成 / 編集 UI |
| `components/admin/shop` | 店舗情報編集、QR コード表示 |
| `components/admin/common` | 管理画面共通 UI |
| `components/layout` | ヘッダーやダッシュボード shell |

## 5. lib の責務

| パス | 主な内容 |
| --- | --- |
| `lib/auth` | Clerk セッション、Clerk 管理クライアント、アプリユーザー解決 |
| `lib/validators/admin-auth.ts` | 管理認証系の zod schema |
| `lib/validators/admin-input.ts` | 管理 API 用の入力整形 helper |
| `lib/admin-auth.ts` | 管理画面の session / shop 解決 helper |
| `lib/admin-registration.ts` | 登録モード制御 |
| `lib/admin-api-security.ts` | same-origin と rate limit の共通処理 |
| `lib/allergens.ts` | アレルゲン状態の共通処理 |
| `lib/db.ts` | Prisma client |
| `lib/public-db.ts` | 公開側クエリ補助 |
| `lib/public-allergen-preferences.ts` | 公開側の localStorage 保存 |
| `lib/upload-images.ts` | Vercel Blob へのアップロード処理 |
| `lib/image-url-policy.ts` | 保存可能な画像 URL の検証 |
| `lib/audit-log.ts` | 監査ログ書き込み |

## 6. 認証を追う時の入口

1. `proxy.ts`
2. `app/layout.tsx`
3. `lib/auth/getCurrentAppUser.ts`
4. `lib/admin-auth.ts`
5. `app/admin/(auth)` と `app/admin/(dashboard)`
6. `app/api/admin/register/route.ts` と `app/api/admin/onboarding/route.ts`

ここを見ると、Clerk セッションからローカル `User` / `Shop` にどう接続しているか追えます。

## 7. DB を追う時の入口

1. `prisma/schema.prisma`
2. `prisma/migrations`
3. `lib/db.ts`
4. `app/api/admin/**`
5. `app/(public)/**/page.tsx`

Server Component は直接 Prisma を読む箇所があるので、画面ファイルでも DB クエリを確認できます。

## 8. スクリプト

- `prisma/seed.ts`
  - 開発用 seed
- `prisma/repair-published-menus.ts`
  - 公開メニュー補修
- `scripts/create-test-user.ts`
  - テストアカウント生成
- `scripts/migrate-users-to-clerk.ts`
  - 旧ローカルユーザーの Clerk 同期

ハードコードされた one-off script は原則として残さず、必要なら README か `document` に目的を残した上で削除する方針です。

## 9. 読む時の注意点

- 認証の正は Clerk です。
- `passwordHash` は移行互換用で、現在の主認証方式そのものではありません。
- `app` 配下のフォルダ名は URL 仕様に直結するため、内部 util と同じ感覚で rename しないでください。
- `document` は参考になりますが、実コードが常に正です。
