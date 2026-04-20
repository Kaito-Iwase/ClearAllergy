# ClearAllergy

外食時のアレルゲン情報確認を、店舗と利用者の双方にとってシンプルにする Web アプリです。

[![Next.js](https://img.shields.io/badge/Next.js-App_Router-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748)](https://www.prisma.io/)

## できること

### 公開側

- 公開中の店舗一覧を閲覧する
- 店舗ページで公開メニューを検索し、価格やカテゴリを確認する
- メニュー詳細でアレルゲン28品目を確認する
- `localStorage` に保存した個人設定に基づいて警告表示を出す

### 管理側

- 店舗アカウントを新規登録する
- メニューを作成し、そのまま編集画面へ遷移する
- メニューの公開 / 非公開、価格、画像、原材料、注意書き、アレルゲン28品目を更新する
- 店舗情報、カバー画像、公開URL用QRコードを更新する

## 技術スタック

| カテゴリ | 技術 |
| --- | --- |
| フレームワーク | Next.js 16 (App Router) |
| 言語 | TypeScript |
| スタイリング | Tailwind CSS |
| ORM | Prisma |
| データベース | PostgreSQL |
| 認証 | Clerk（管理ログインUIは custom flow。既製 SignIn / SignUp UI は未使用） |
| 画像アップロード | Vercel Blob |

## 主要ルーティング

### 画面ルート

| ルート | 用途 |
| --- | --- |
| `/` | トップページ。公開中メニューを持つ店舗を 1 件ピックアップ表示 |
| `/shops` | 公開店舗一覧。`?q=` で店舗名 / 説明を検索可能 |
| `/shops/[shopId]` | 公開店舗ページ。公開メニュー一覧、店舗情報、共有導線を表示 |
| `/shops/[shopId]/menus/[menuId]` | 公開メニュー詳細。アレルゲン28品目、原材料、注意書きを表示 |
| `/admin/register` | 店舗アカウント新規登録 |
| `/admin/login` | 管理画面ログイン |
| `/admin/menus` | 自店舗のメニュー一覧 |
| `/admin/menus/new` | メニュー新規作成。作成後 `/admin/menus/[menuId]/edit` へ遷移 |
| `/admin/menus/[menuId]/edit` | メニュー編集 |
| `/admin/shop` | 店舗情報編集、QRコード表示 |

### 主な API ルート

| ルート | 用途 |
| --- | --- |
| `/api/admin/register` | 店舗アカウント登録 |
| `/api/admin/onboarding` | Clerk ログイン後の初回店舗作成 |
| `/api/admin/shop` | ログイン中店舗の取得 / 更新 |
| `/api/admin/menus` | ログイン中店舗のメニュー一覧 / 新規作成 |
| `/api/admin/menus/[menuId]` | ログイン中店舗のメニュー取得 / 更新 / 削除 |
| `/api/admin/upload-shop-image` | 店舗画像アップロード |
| `/api/admin/upload-menu-image` | メニュー画像アップロード |
| `/api/allergens` | アレルゲン28品目一覧 |
| `/api/menus/[menuId]` | 公開中メニューの取得 |

## セットアップ

### 前提条件

- Node.js 20 以上
- PostgreSQL が起動していること

### 1. 依存関係をインストール

```bash
npm install
```

### 2. 環境変数ファイルを作成

`.env.example` をコピーして `.env` を作成します。Prisma CLI は `.env` を読むため、まずは `.env` を基準にするのが安全です。必要なら `.env.local` で上書きしてください。

```bash
cp .env.example .env
```

PowerShell の場合:

```powershell
Copy-Item .env.example .env
```

### 3. 環境変数を設定

| 変数名 | 必須 | 用途 |
| --- | --- | --- |
| `DATABASE_URL` | 必須 | Prisma / PostgreSQL 接続先 |
| `DIRECT_URL` | 必須 | Prisma Migrate 用の直接接続先 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | 必須 | Clerk SDK 読み込み用 |
| `CLERK_SECRET_KEY` | 必須 | Clerk サーバー側認証用 |
| `ENABLE_CLERK_ADMIN_AUTH` | 推奨 | 管理画面で Google / Clerk SSO 導線を開くかどうか。既定値は `false` |
| `ADMIN_REGISTRATION_MODE` | 推奨 | 管理者自己登録のモード。`disabled` / `invite_only` / `open` |
| `ADMIN_REGISTRATION_INVITE_TOKEN` | 条件付き必須 | `invite_only` のときに使う招待トークン |
| `NEXT_PUBLIC_APP_URL` | 任意 | 管理画面の QR コード生成時に使う公開 URL のベース。未設定時は現在のブラウザ origin を使う |
| `BLOB_READ_WRITE_TOKEN` | 任意 | 店舗画像 / メニュー画像のアップロードを有効にする Vercel Blob トークン |
| `ALLOWED_IMAGE_URL_PREFIXES` | 推奨 | DB に保存してよい画像URLの prefix 一覧。独自配信URLを使う場合に設定 |

最小構成でローカル起動する場合は `DATABASE_URL`、`DIRECT_URL`、`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`、`CLERK_SECRET_KEY` が必要です。画像アップロードまで確認する場合は `BLOB_READ_WRITE_TOKEN` も設定してください。

`.env.example` の初期値:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/clearallergy"
DIRECT_URL="postgresql://USER:PASSWORD@localhost:5432/clearallergy"
ENABLE_CLERK_ADMIN_AUTH="false"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
CLERK_SECRET_KEY=""
ADMIN_REGISTRATION_MODE="disabled"
ADMIN_REGISTRATION_INVITE_TOKEN=""
NEXT_PUBLIC_APP_URL="http://localhost:3000"
BLOB_READ_WRITE_TOKEN=""
ALLOWED_IMAGE_URL_PREFIXES=""
```

`invite_only` でローカル確認する最小例:

```env
ENABLE_CLERK_ADMIN_AUTH="true"
ADMIN_REGISTRATION_MODE="invite_only"
ADMIN_REGISTRATION_INVITE_TOKEN="replace-with-a-long-random-invite-token"
```

### 4. DB スキーマを適用

```bash
npx prisma migrate dev
npx prisma generate
```

### 5. デモデータを投入

```bash
npm run seed
```

### 6. 既存メール+パスワードユーザーを Clerk へ移行

```bash
npm run auth:migrate:clerk
```

`passwordHash` を持つ既存ユーザーを Clerk へ事前インポートします。`demo@clearallergy.local` を含む既存アカウントは、このコマンド後も今までのメールアドレス + パスワードでそのままログインできます。

この seed で以下が作成されます。

- アレルゲン28品目マスタ
- デモ店舗 `[デモ店舗]Cafe Hibi（カフェ ヒビ）`
- 公開メニュー数件
- デモ管理アカウント

| 項目 | 値 |
| --- | --- |
| メールアドレス | `demo@clearallergy.local` |
| パスワード | `demo1234` |

デモログインも Clerk に移行済みです。`npm run seed` のあとに `npm run auth:migrate:clerk` を実行すると、今までと同じメールアドレス / パスワードで `/admin/login` から入れます。

既存のテスト管理者を既知のパスワードで作り直したい時は、次も使えます。

```bash
npm run auth:create:test-user -- test@test.com Passw0rd!
```

このコマンドは local DB の `passwordHash` と Clerk 側パスワードを同じ値に揃えます。

### 7. 開発サーバーを起動

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。

## 動作確認の流れ

1. `/shops` を開き、seed で作成された `[デモ店舗]Cafe Hibi（カフェ ヒビ）` が見えることを確認する
2. 店舗ページ `/shops/[shopId]` で公開メニュー一覧と店舗情報が表示されることを確認する
3. メニュー詳細 `/shops/[shopId]/menus/[menuId]` でアレルゲン28品目、原材料、注意書きが見えることを確認する
4. 公開側で個人アレルゲン設定を変更し、再読み込み後も `localStorage` 由来の表示が維持されることを確認する
5. `npm run auth:migrate:clerk` 実行後、`/admin/login` からデモアカウントでログインし、`/admin/menus` と `/admin/shop` が表示できることを確認する
6. `/admin/menus/new` からメニューを作成し、作成後に編集画面へ遷移することを確認する
7. `BLOB_READ_WRITE_TOKEN` を設定した場合は、JPEG / PNG / WebP / GIF / AVIF の5MB以下画像だけがアップロード成功することを確認する

## 公開前の注意

- 認証基盤は Clerk に一本化しています。管理ログイン UI は既存フォームを維持し、submit 時だけ Clerk の custom flow を使います。
- 旧 `passwordHash` は既存ユーザーを Clerk へ移行するためだけに残しています。ランタイム認証では使いません。
- Google / Clerk SSO 導線は `ENABLE_CLERK_ADMIN_AUTH=false` を既定として閉じています。メールアドレス + パスワードの Clerk ログインは常に有効です。
- `Clerk` 側のアプリ内ユーザー作成は、認証確認時には行わず、明示的な初回セットアップ API だけで行うようにしています。
- `ADMIN_REGISTRATION_MODE=open` は誰でも店舗アカウント登録を試せるため、本番では `disabled` か `invite_only` を推奨します。
- `invite_only` を使う場合は `ADMIN_REGISTRATION_INVITE_TOKEN` を必ず設定し、配布方法も管理してください。
- `invite_only` 運用では、`/admin/login` に Google ログインを表示したまま、`/admin/register` は有効な招待トークン付き URL を開いた時だけ Google / メール登録導線を表示します。
- `npm run seed` のデモアカウントとデモデータは開発確認用です。本番 DB には投入しないでください。
- 本番では少なくとも `DATABASE_URL`、`DIRECT_URL`、`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`、`CLERK_SECRET_KEY` を適切な値に置き換えてください。
- 独自ドメインや固定URLで QR を配布するなら `NEXT_PUBLIC_APP_URL` を本番 URL に合わせて設定してください。
- 画像アップロードを使う場合は `BLOB_READ_WRITE_TOKEN` が必要です。未設定のままだとアップロード API は失敗します。対応形式は JPEG / PNG / WebP / GIF / AVIF、上限は 5MB です。
- 画像URLは保存時に許可prefix / Blob 由来ホスト / 想定 path を検証します。既存の外部URLデータは今後の保存で弾かれ、公開画面では非表示になります。
- 公開側の個人アレルゲン設定は `localStorage` 保存です。端末間同期はされません。
