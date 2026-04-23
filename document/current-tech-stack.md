# ClearAllergy 現在技術スタック

このドキュメントは、2026-04-23 時点の実コードを基準に、ClearAllergy の現在構成を簡潔に整理したものです。  
古い NextAuth 前提の説明はこのリポジトリの現在実装とは一致しません。認証の正は Clerk です。

## 1. アプリの役割

ClearAllergy は次の 4 層で構成されています。

- 公開画面: 店舗一覧、店舗詳細、メニュー詳細を表示する
- 管理画面: 店舗アカウントでログインし、店舗情報とメニューを管理する
- API: 管理操作と公開データ取得を受け持つ
- データ層: Prisma 経由で PostgreSQL を扱う

## 2. 使用技術

| 分類 | 技術 | このリポジトリでの役割 |
| --- | --- | --- |
| Web フレームワーク | Next.js 16 App Router | 画面ルーティング、Route Handler、Server Component |
| UI | React 19 | 画面コンポーネント |
| 言語 | TypeScript | 画面、API、スクリプトの型安全化 |
| スタイリング | Tailwind CSS 4 | 公開画面 / 管理画面のスタイリング |
| 認証 | Clerk | 管理者ログイン、Clerk セッション、Google / SSO 導線 |
| ORM | Prisma | DB アクセス |
| DB | PostgreSQL | 店舗、メニュー、アレルゲン、ユーザー、監査ログを保存 |
| 画像保存 | Vercel Blob | 店舗画像 / メニュー画像アップロード |
| QR 表示 | `qrcode.react` | 管理画面の店舗 QR コード表示 |
| パスワード移行補助 | `bcrypt` | 旧ローカルユーザーを Clerk へ移行する時の password digest 引き継ぎ |
| 入力検証 | `zod` | 管理認証系 API の入力 schema |

## 3. 現在の認証構成

- 正式な認証基盤は Clerk です。
- 管理画面は `/admin/login` と `/admin/register` を入口にしています。
- `proxy.ts` で Clerk middleware を通します。
- `lib/auth/getCurrentAppUser.ts` が Clerk セッションとローカル `User` / `Shop` をつなぎます。
- `lib/admin-auth.ts` は管理画面用の read helper です。
- `passwordHash` は旧ユーザー移行のために残っており、現在の主認証方式そのものではありません。

## 4. ディレクトリの見方

| パス | 役割 |
| --- | --- |
| `app/(public)` | 公開画面ルート |
| `app/admin` | 管理画面ルート |
| `app/api` | API |
| `components/public` | 公開画面向け Client Component / UI |
| `components/admin` | 管理画面向け Client Component / UI |
| `components/layout` | 共通レイアウト部品 |
| `lib/auth` | Clerk 連携とアプリユーザー解決 |
| `lib/validators` | API 入力 schema / helper |
| `lib` | DB、監査ログ、画像 URL 制御、レート制限などの共通処理 |
| `prisma` | schema、migration、seed、補助スクリプト |
| `scripts` | 運用・移行用スクリプト |
| `document` | 説明資料と handover |

## 5. 主な画面ルート

- `/`
- `/terms`
- `/shops`
- `/shops/[shopId]`
- `/shops/[shopId]/menus/[menuId]`
- `/admin/login`
- `/admin/register`
- `/admin/invitations`
- `/admin/menus`
- `/admin/menus/new`
- `/admin/menus/[menuId]/edit`
- `/admin/shop`

## 6. 主な API ルート

- `/api/admin/register`
- `/api/admin/onboarding`
- `/api/admin/auth/login`
- `/api/admin/auth/sso`
- `/api/admin/invitations`
- `/api/admin/invitations/[inviteId]/resend`
- `/api/admin/invitations/[inviteId]/revoke`
- `/api/admin/shop`
- `/api/admin/menus`
- `/api/admin/menus/[menuId]`
- `/api/admin/upload-shop-image`
- `/api/admin/upload-menu-image`
- `/api/allergens`
- `/api/menus/[menuId]`

## 7. ローカル開発で重要な環境変数

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `ENABLE_CLERK_ADMIN_AUTH`
- `ADMIN_REGISTRATION_MODE`
- `ADMIN_REGISTRATION_INVITE_TOKEN`
- `NEXT_PUBLIC_APP_URL`
- `BLOB_READ_WRITE_TOKEN`
- `ALLOWED_IMAGE_URL_PREFIXES`

## 8. 補助スクリプト

- `npm run seed`
  - アレルゲン master、デモ店舗、デモメニューを投入します。
- `npm run auth:migrate:clerk`
  - 既存ローカルユーザーを Clerk へ同期します。
- `npm run auth:create:test-user -- <email> <password> [shopName]`
  - テスト用管理アカウントを local DB と Clerk の両方に作ります。
- `npm run repair:published-menus`
  - 公開メニュー整合性を補修します。

## 9. 公開前に重要な注意

- NextAuth は現在の正ではありません。
- URL 直結の route segment 名は安易に変えないでください。
- `proxy.ts`、`app/sign-in/**`、`app/sign-up/**`、`lib/auth/**` は認証導線の中核です。
- `prisma/schema.prisma` は DB 意味変更に直結するため、構造整理とは分けて扱うべきです。
