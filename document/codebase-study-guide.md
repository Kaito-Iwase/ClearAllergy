# ClearAllergy コードベース学習ガイド

このドキュメントは、ClearAllergy のコードを初学者が順番に読み、最終的に「どの関数・画面・API・DB処理について聞かれても説明できる」状態になるための学習用メモです。

**前提**

- このプロジェクトは **Next.js App Router** を使っています。
- 認証は **Clerk** です。
- DB 操作は **Prisma** です。
- DB は **PostgreSQL** を前提にしています。
- 画像アップロードは **Vercel Blob** を使います。
- 古い NextAuth / Auth.js 前提では読みません。

---

## 目次

1. [プロジェクト全体像](#1-プロジェクト全体像)
2. [ディレクトリ構造の解説](#2-ディレクトリ構造の解説)
3. [学習順ロードマップ](#3-学習順ロードマップ)
4. [重要フロー](#4-重要フロー)
5. [ファイルごとの解説](#5-ファイルごとの解説)
6. [関数・コンポーネントごとの解説](#6-関数コンポーネントごとの解説)
7. [重要概念の用語集](#7-重要概念の用語集)
8. [このプロジェクト特有の設計判断](#8-このプロジェクト特有の設計判断)
9. [面接・口頭説明で使える想定問答](#9-面接口頭説明で使える想定問答)
10. [次に読むべきファイル一覧](#10-次に読むべきファイル一覧)

---

## 0. このドキュメントの使い方

**学習順** は、最初に読むべきファイルです。

**重要** は、アプリの挙動を理解するうえで外せないファイルです。

**あとで読む** は、主要な流れを理解したあとに読むと理解しやすいファイルです。

ファイルパスはすべて `コード形式` で書いています。Notion に貼ったあと、ファイル名で検索しながら読むと追いやすいです。

### ここで覚えるポイント

- まず **DB → 認証 → 管理画面 → API → 公開画面** の順で読む。
- いきなり全ファイルを読むより、共通処理から入る。
- ファイルごとの説明では、必ず「入口」「出口」「エラー時」「保守時に一緒に見る場所」を確認する。

---

## 1. プロジェクト全体像

### このアプリは何をするものか

ClearAllergy は、飲食店がメニューとアレルゲン情報を管理し、利用者が公開ページで安全にメニュー情報を確認できるアプリです。

管理者は、店舗情報・メニュー・画像・アレルゲン状態を管理します。

利用者は、店舗一覧やメニュー詳細を見て、自分が避けたいアレルゲンと照らし合わせながら確認できます。

### 公開側と管理側の違い

```txt
公開側
  /shops
  /shops/[shopId]
  /shops/[shopId]/menus/[menuId]

管理側
  /admin/login
  /admin/register
  /admin/shop
  /admin/menus
  /admin/menus/new
  /admin/menus/[menuId]/edit
  /admin/invitations
```

公開側は、ログインしていない利用者でも閲覧できます。

管理側は、**Clerk** のログイン情報と DB 上の `User` / `Shop` 情報を組み合わせて、操作できる店舗を決めます。

### 技術スタック

| 分類 | 技術 | このプロジェクトでの役割 |
|---|---|---|
| フレームワーク | **Next.js App Router** | `app/` 配下のフォルダでページ・API・レイアウトを表現する |
| UI | **React** | 画面をコンポーネント単位で組み立てる |
| 認証 | **Clerk** | ログイン、ユーザー作成、招待、セッション確認を担当する |
| DB ORM | **Prisma** | TypeScript から DB を型安全に操作する |
| DB | **PostgreSQL** | 店舗・メニュー・アレルゲン・招待・監査ログを保存する |
| 画像 | **Vercel Blob** | 店舗画像・メニュー画像を保存する |
| 入力検証 | **Zod** | API に来た値が正しい形か確認する |

### データの流れ

```txt
ブラウザ
  ↓
Next.js Page / Client Component
  ↓
Route Handler または Server Component
  ↓
lib/ の共通処理
  ↓
Prisma
  ↓
PostgreSQL
```

公開ページでは、**Server Component** が直接 Prisma で DB を読みます。

管理画面では、フォーム送信やボタン操作から **Route Handler** にリクエストし、認証・権限・入力検証を通して DB を更新します。

### 認証の流れ

```txt
Clerk セッション
  ↓
getCurrentClerkIdentity()
  ↓
getCurrentAppUser()
  ↓
getCurrentAdminContext()
  ↓
管理画面・管理 API で利用
```

**Clerk** はログインしている本人を判定します。

ただし、アプリ固有の店舗権限は Clerk だけでは完結しません。

そのため `lib/auth/getCurrentAppUser.ts` で Clerk のユーザー ID と DB の `User` を結びつけ、`lib/admin-auth.ts` で「どの店舗の管理者か」を組み立てます。

### 画像アップロードの流れ

```txt
管理画面の画像フォーム
  ↓
/api/admin/upload-shop-image
または
/api/admin/upload-menu-image
  ↓
lib/upload-images.ts
  ↓
Vercel Blob
  ↓
DB には画像 URL を保存
```

画像そのものは DB に保存しません。

DB には Vercel Blob に保存された画像の URL を保存します。

`lib/image-url-policy.ts` は、更新時に「その店舗が扱ってよい画像 URL か」を確認します。

### DB との関係

DB 設計は `prisma/schema.prisma` に集約されています。

主な関係は次のとおりです。

```txt
User
  └─ Shop を所有する

Shop
  ├─ MenuItem を持つ
  └─ AdminInvite を持つ

MenuItem
  └─ MenuItemAllergen を通じて Allergen と関係する

Allergen
  └─ slug / label / category で分類される
```

### ここで覚えるポイント

- 公開側は閲覧中心、管理側は認証と権限確認が必須。
- Clerk は本人確認、Prisma は DB 操作、Vercel Blob は画像保存を担当する。
- DB の中心は `Shop`、`MenuItem`、`Allergen`、`MenuItemAllergen`。

---

## 2. ディレクトリ構造の解説

### 全体

| ディレクトリ | 置くもの | なぜそこに置くか | 他との違い |
|---|---|---|---|
| `app/` | ページ、レイアウト、API | **App Router** のルールで URL と処理を対応させるため | URL に直結する |
| `components/` | UI 部品 | 画面から見た目や操作を分離して再利用するため | URL そのものは作らない |
| `lib/` | 共通ロジック | 認証、DB、検証、アップロードなどを複数画面から使うため | UI を持たない |
| `prisma/` | DB スキーマ、seed、修復スクリプト | DB 構造と初期データを管理するため | Prisma と DB に直結する |
| `scripts/` | 運用・移行用スクリプト | アプリ外から実行する補助処理を置くため | Web リクエストでは呼ばれない |
| `document/` | 学習資料・設計メモ | コード理解や引き継ぎ用の文書を置くため | 実行時のアプリ挙動には関係しない |

### `app/`

`app/` は URL と一番強く結びつく場所です。

`page.tsx` は画面、`layout.tsx` は共通レイアウト、`route.ts` は API を表します。

**重要**

- `app/layout.tsx`
- `app/(public)/...`
- `app/admin/...`
- `app/api/.../route.ts`

このディレクトリがないと、Next.js がどの URL で何を表示するか判断できません。

### `components/`

`components/` は画面を構成する UI 部品を置く場所です。

たとえば、メニュー編集フォームや公開メニュー一覧など、画面の中で使われるまとまった UI が入っています。

`app/` が「どの URL で表示するか」を担当するのに対し、`components/` は「何をどう表示し、どう操作させるか」を担当します。

### `lib/`

`lib/` はアプリの中核ロジックです。

認証、権限、Prisma 接続、入力検証、画像アップロード、アレルゲン判定など、複数の画面や API から使われる処理が集まっています。

**重要**

- `lib/db.ts`
- `lib/auth/getCurrentAppUser.ts`
- `lib/admin-auth.ts`
- `lib/allergens.ts`
- `lib/upload-images.ts`
- `lib/image-url-policy.ts`

### `prisma/`

`prisma/` は DB の設計図を管理します。

`prisma/schema.prisma` は、テーブル・カラム・リレーション・enum を定義します。

`prisma/seed.ts` は、初期アレルゲンやサンプルデータを投入するために使います。

### `scripts/`

`scripts/` は、Web アプリの画面から直接呼ばれるものではありません。

テストユーザー作成や既存ユーザーの Clerk 移行など、開発・運用時にコマンドで実行する処理を置きます。

### ここで覚えるポイント

- `app/` は URL、`components/` は UI、`lib/` は共通処理。
- `prisma/` は DB の設計と初期化、`scripts/` は運用補助。
- ファイルの置き場所を見るだけで「画面なのか、API なのか、共通処理なのか」を判断できる。

---

## 3. 学習順ロードマップ

### 学習順 1: DB の形を理解する

まず `prisma/schema.prisma` を読みます。

理由は、画面も API も最終的には DB の形に従っているからです。

**見るポイント**

- `User` と Clerk の関係
- `Shop` と `MenuItem` の関係
- `MenuItemAllergen` が中間テーブルになっている理由
- `AllergenStatus` の意味

### 学習順 2: アプリ全体の入口を読む

次に `app/layout.tsx` と `proxy.ts` を読みます。

`app/layout.tsx` はアプリ全体の外枠です。

`proxy.ts` は Clerk の認証ミドルウェアを有効化します。

### 学習順 3: 認証と管理者コンテキストを読む

次に `lib/auth/getCurrentAppUser.ts` と `lib/admin-auth.ts` を読みます。

ここで、Clerk のログイン情報が DB の `User` とどう結びつくかを理解します。

### 学習順 4: 管理画面の入口を読む

`app/admin/page.tsx`、`app/admin/(auth)/login/page.tsx`、`components/admin/auth/AdminLoginPageClient.tsx` を読みます。

ログイン前後で画面がどう変わるかを追います。

### 学習順 5: 管理 API を読む

`app/api/admin/.../route.ts` を読みます。

**Route Handler**（HTTP リクエストを受け取る関数）で、認証・検証・DB 更新・エラー返却がどう書かれているかを確認します。

### 学習順 6: メニュー管理を読む

`app/admin/(dashboard)/menus/page.tsx`、`components/admin/menu/...`、`app/api/admin/menus/...` を読みます。

このプロジェクトの中心機能なので、ここは時間をかけて読みます。

### 学習順 7: 公開画面を読む

`app/(public)/shops/...` と `components/public/...` を読みます。

DB に保存されたメニュー情報が、利用者向けにどう見えるかを理解します。

### 学習順 8: 招待・画像・監査ログを読む

最後に、招待、画像アップロード、監査ログ、運用スクリプトを読みます。

ここは **あとで読む** に分類してよいですが、実務では重要です。

### ここで覚えるポイント

- 最初は DB から読む。
- 画面より先に認証と共通処理を読むと、API が理解しやすくなる。
- メニュー管理はアプリの中心なので、画面・API・DB をセットで読む。

---

## 4. 重要フロー

### 認証フロー

```txt
ブラウザでログイン
  ↓
Clerk がセッションを保持
  ↓
proxy.ts の clerkMiddleware がリクエストを処理
  ↓
lib/auth/getCurrentAppUser.ts が Clerk ユーザーを読む
  ↓
lib/admin-auth.ts が管理者用コンテキストを作る
  ↓
管理画面または管理 API が処理を続ける
```

**つまずきやすい点**

Clerk にログインしているだけでは、アプリ上の店舗管理者とは限りません。

このプロジェクトでは、Clerk の `userId` と DB の `User.clerkUserId`、さらに `Shop.ownerClerkUserId` などを見て、操作可能な店舗を判断します。

### メニュー作成フロー

```txt
/admin/menus/new
  ↓
NewMenuForm
  ↓
POST /api/admin/menus
  ↓
requireCurrentAdminContextOrRedirect 相当の認証・権限確認
  ↓
Zod による入力検証
  ↓
lib/allergens.ts でアレルゲン状態を整形
  ↓
Prisma で MenuItem と MenuItemAllergen を保存
```

**重要**

メニュー作成では、単に `MenuItem` を保存するだけではありません。

アレルゲンごとの状態を `MenuItemAllergen` に保存するため、`MenuItem` と `Allergen` の関係を理解する必要があります。

### メニュー公開判定フロー

```txt
メニュー入力
  ↓
アレルゲン状態を確認
  ↓
getMenuPublishValidationErrors()
  ↓
公開できるか判定
```

`UNKNOWN` は「不明」という意味です。

利用者にとって安全とは言えないため、公開前チェックで重要になります。

### 画像アップロードフロー

```txt
画像ファイル選択
  ↓
uploadShopImage または uploadMenuImage API
  ↓
validateImageFile()
  ↓
Vercel Blob に保存
  ↓
画像 URL をレスポンス
  ↓
店舗またはメニュー更新 API で DB に URL を保存
```

**エラー時**

- ファイル形式が不正なら失敗する。
- サイズが大きすぎると失敗する。
- Blob 側の保存に失敗すると API はエラーを返す。
- DB 更新時には `lib/image-url-policy.ts` で URL の妥当性を確認する。

### 招待フロー

```txt
管理者が招待を作成
  ↓
Clerk 側に招待を作成
  ↓
DB の AdminInvite に保存
  ↓
招待リンクから accept API
  ↓
招待状態を確認
  ↓
必要な User / Shop 関係を更新
```

招待は、Clerk と DB の両方に状態があります。

そのため、片方だけを見ても全体像は分かりません。

### ここで覚えるポイント

- 重要フローは「画面 → API → lib → Prisma → DB」で追う。
- 認証は Clerk、権限は DB のユーザー・店舗関係まで見る。
- 画像と招待は外部サービスと DB の整合性が重要。

---

## 5. ファイルごとの解説

この章では、対象ファイルを「どの画面・API・DB処理に関係するか」を中心に整理します。

各ファイルは、次の観点で読んでください。

```txt
1. このファイルがないと何が困るか
2. どの画面・API・DB処理に関係するか
3. import している主要モジュールの意味
4. export しているものの役割
5. 処理の入口と出口
6. エラー時にどうなるか
7. 保守時にどこを一緒に見るべきか
```

### 5.1 アプリ全体の入口

| ファイル | 区分 | 役割 |
|---|---|---|
| `app/layout.tsx` | **重要** | アプリ全体に `ClerkProvider`、フォント、グローバル CSS を適用する |
| `proxy.ts` | **重要** | Clerk のミドルウェアを有効にし、リクエスト時に認証情報を扱えるようにする |
| `app/globals.css` | **あとで読む** | 全画面共通の CSS を定義する |

#### `app/layout.tsx`

**このファイルがないと困ること**

アプリ全体で Clerk の認証情報を React 側から扱えません。

また、全ページ共通の HTML 構造、フォント、CSS が適用されません。

**関係する画面・API・DB処理**

すべての画面に関係します。

DB 処理を直接行うファイルではありませんが、認証 UI やログイン状態の表示に影響します。

**主要 import**

- `ClerkProvider`: Clerk の認証状態をアプリ全体に渡す。
- `Geist`: フォント設定。
- `./globals.css`: 全体 CSS。

**export**

- `metadata`: ページのタイトルなどのメタ情報。
- `RootLayout`: 全ページを包む最上位レイアウト。

**入口と出口**

入口は Next.js が全ページ表示時に自動で呼ぶ `RootLayout` です。

出口は `{children}` を `ClerkProvider` の内側で表示することです。

**エラー時**

Clerk の環境変数が不足している場合、認証 UI や Clerk 依存処理が正常に動かない可能性があります。

**保守時に一緒に見るファイル**

- `proxy.ts`
- `.env`
- Clerk を使う `components/admin/auth/*`

#### `proxy.ts`

**このファイルがないと困ること**

Clerk の認証情報を Next.js のリクエスト処理で扱う入口がなくなります。

管理画面や API の認証前提が崩れます。

**関係する画面・API・DB処理**

管理画面と管理 API 全体に関係します。

DB を直接触りませんが、DB へ到達する前の認証情報の土台です。

**主要 import**

- `clerkMiddleware`: Clerk のミドルウェア。

**export**

- `default clerkMiddleware()`: リクエストごとに Clerk を通す処理。
- `config`: どのリクエストにミドルウェアを適用するかの設定。

**入口と出口**

入口はブラウザや API クライアントから来る HTTP リクエストです。

出口は、Clerk の認証情報を付与した状態で次の Next.js 処理に渡すことです。

**エラー時**

ミドルウェア設定が間違うと、ログイン状態の取得に失敗したり、不要なパスまで認証処理対象になります。

**保守時に一緒に見るファイル**

- `lib/auth/getCurrentAppUser.ts`
- `lib/admin-auth.ts`
- `app/admin/...`
- `app/api/admin/...`

### 5.2 DB と Prisma

| ファイル | 区分 | 役割 |
|---|---|---|
| `prisma/schema.prisma` | **学習順 / 重要** | DB のモデル、リレーション、enum を定義する |
| `lib/db.ts` | **重要** | Prisma Client をアプリ全体で使い回す |
| `lib/db-errors.ts` | **重要** | Prisma の DB エラーを API 向けに扱いやすくする |
| `prisma/seed.ts` | **あとで読む** | 初期データを投入する |
| `prisma/repair-published-menus.ts` | **あとで読む** | 公開済みメニューの整合性を修復する |

#### `prisma/schema.prisma`

**このファイルがないと困ること**

Prisma が DB のテーブル構造を理解できません。

`User`、`Shop`、`MenuItem`、`Allergen` などの型も生成されません。

**関係する画面・API・DB処理**

すべての DB 処理に関係します。

特に管理画面、公開ページ、招待 API、メニュー API、店舗 API はこのスキーマに依存します。

**主要な定義**

- `User`: アプリ内ユーザー。`clerkUserId` で Clerk と結びつく。
- `Shop`: 店舗。
- `MenuItem`: メニュー。
- `Allergen`: アレルゲンマスタ。
- `MenuItemAllergen`: メニューとアレルゲン状態の中間テーブル。
- `AdminInvite`: 管理者招待。
- `AuditLog`: 操作履歴。
- `AllergenStatus`: アレルゲン状態の enum。
- `InviteStatus`: 招待状態の enum。

**入口と出口**

入口は開発者が schema を編集することです。

出口は `npx prisma generate` や migration によって、Prisma Client と DB 構造に反映されることです。

**エラー時**

リレーションや型が崩れると、Prisma Client の生成や DB migration が失敗します。

**保守時に一緒に見るファイル**

- `lib/allergens.ts`
- `app/api/admin/menus/route.ts`
- `app/api/admin/shop/route.ts`
- `lib/invitations.ts`

#### `lib/db.ts`

**このファイルがないと困ること**

アプリ内の Prisma 接続方法が統一されません。

開発環境で hot reload が起きるたびに Prisma Client が増え、接続数の問題につながります。

**関係する画面・API・DB処理**

Prisma を使うすべての Server Component、Route Handler、lib 処理に関係します。

**主要 import**

- `PrismaClient`: Prisma が生成する DB 操作用クライアント。

**export**

- `prisma`: アプリ全体で使う Prisma Client。

**入口と出口**

入口は `import { prisma } from "@/lib/db"` です。

出口は DB クエリを実行できる Prisma Client を返すことです。

**エラー時**

DB 接続文字列が間違っていると、クエリ実行時に接続エラーになります。

**保守時に一緒に見るファイル**

- `.env`
- `prisma/schema.prisma`
- Prisma を import している各 API / Server Component

### 5.3 認証・権限

| ファイル | 区分 | 役割 |
|---|---|---|
| `lib/auth/getCurrentAppUser.ts` | **学習順 / 重要** | Clerk のログイン情報から DB の `User` を探す |
| `lib/admin-auth.ts` | **学習順 / 重要** | 管理画面・管理 API 用の店舗権限コンテキストを作る |
| `lib/auth/clerkAdminCore.ts` | **重要** | Clerk 管理 API を扱う共通処理 |
| `lib/admin-platform-auth.ts` | **あとで読む** | プラットフォーム管理者かどうかを判定する |
| `lib/admin-registration.ts` | **あとで読む** | 管理者登録の可否を制御する |

#### `lib/auth/getCurrentAppUser.ts`

**このファイルがないと困ること**

Clerk のユーザーと DB の `User` を結びつけられません。

その結果、ログイン中の人がアプリ上の誰なのか判断できなくなります。

**関係する画面・API・DB処理**

- 管理画面全体
- 管理 API 全体
- オンボーディング
- 招待受け入れ

**主要 import**

- Clerk の認証取得関数: 現在ログイン中のユーザー ID を読む。
- `prisma`: DB の `User` を検索・作成する。

**export**

- `getCurrentClerkIdentity`: Clerk 側の本人情報を読む。
- `getCurrentAppUser`: DB の `User` を読む。
- `provisionCurrentAppUserFromClerk`: 必要に応じて DB ユーザーを作る。

**入口と出口**

入口は管理画面や API からの呼び出しです。

出口は、現在の Clerk ユーザーに対応する DB の `User` 情報です。

**エラー時**

未ログインならユーザー情報は取れません。

DB に対応する `User` がなければ、読み取り関数では見つからない状態になります。

**保守時に一緒に見るファイル**

- `lib/admin-auth.ts`
- `lib/auth/clerkAdminCore.ts`
- `app/api/admin/onboarding/route.ts`
- `app/api/invitations/accept/route.ts`

#### `lib/admin-auth.ts`

**このファイルがないと困ること**

管理者がどの店舗を操作できるか判断できません。

API ごとに権限確認をバラバラに書くことになり、漏れが起きやすくなります。

**関係する画面・API・DB処理**

- `app/admin/(dashboard)/...`
- `app/api/admin/shop/route.ts`
- `app/api/admin/menus/...`
- `app/api/admin/upload-...`

**主要 import**

- `getCurrentAppUser`: 現在のアプリユーザーを取得する。
- `prisma`: ユーザーに紐づく店舗を取得する。
- Next.js の redirect 系処理: 未ログインや未設定時に画面遷移させる。

**export**

- `getCurrentAdminContext`: 管理者コンテキストを返す。
- `requireCurrentAdminContextOrRedirect`: 必須の管理者情報がない場合にリダイレクトする。
- `requireShopId`: 店舗 ID を必須として扱う。

**入口と出口**

入口は管理画面または管理 API からの呼び出しです。

出口は、`user`、`shop`、`shopId` などの管理処理に必要な情報です。

**エラー時**

未ログイン、DB ユーザーなし、店舗なしの場合は、処理を続けずにリダイレクトまたはエラー扱いになります。

**保守時に一緒に見るファイル**

- `lib/auth/getCurrentAppUser.ts`
- `prisma/schema.prisma`
- `app/admin/(dashboard)/layout.tsx`
- `app/api/admin/*/route.ts`

### 5.4 管理画面

| ファイル | 区分 | 関係する機能 |
|---|---|---|
| `app/admin/page.tsx` | **学習順** | 管理トップの入口 |
| `app/admin/(auth)/login/page.tsx` | **学習順** | ログイン画面 |
| `app/admin/(auth)/register/page.tsx` | **重要** | 管理者登録画面 |
| `app/admin/(auth)/invitations/page.tsx` | **あとで読む** | 招待導線 |
| `app/admin/(dashboard)/layout.tsx` | **重要** | 管理画面共通レイアウト |
| `app/admin/(dashboard)/shop/page.tsx` | **重要** | 店舗編集画面 |
| `app/admin/(dashboard)/menus/page.tsx` | **学習順 / 重要** | メニュー一覧 |
| `app/admin/(dashboard)/menus/new/page.tsx` | **重要** | メニュー新規作成 |
| `app/admin/(dashboard)/menus/[menuId]/edit/page.tsx` | **重要** | メニュー編集 |

#### 管理画面ファイル共通の読み方

**このファイルがないと困ること**

対応する管理画面が表示できません。

たとえば `app/admin/(dashboard)/menus/page.tsx` がなければ、メニュー一覧ページが存在しなくなります。

**主要 import**

- `lib/admin-auth.ts`: 管理者としてアクセスできるか確認する。
- `prisma`: サーバー側で初期表示データを読む。
- `components/admin/...`: 実際の UI を描画する。

**export**

- `default function Page()`: Next.js がページとして扱うコンポーネント。

**入口と出口**

入口はブラウザで該当 URL にアクセスすることです。

出口は、必要な初期データを取得して Client Component に渡すことです。

**エラー時**

未ログインや店舗未設定なら、ログインやオンボーディングへリダイレクトされます。

DB 取得に失敗した場合は、ページ表示エラーになります。

**保守時に一緒に見るファイル**

- 対応する `components/admin/...`
- 対応する `app/api/admin/.../route.ts`
- `lib/admin-auth.ts`
- `prisma/schema.prisma`

### 5.5 管理 API

| ファイル | 区分 | 役割 |
|---|---|---|
| `app/api/admin/register/route.ts` | **重要** | 管理者登録 |
| `app/api/admin/onboarding/route.ts` | **重要** | 初回店舗設定 |
| `app/api/admin/auth/login/route.ts` | **重要** | ログイン補助 |
| `app/api/admin/auth/sso/route.ts` | **あとで読む** | SSO 関連 |
| `app/api/admin/shop/route.ts` | **重要** | 店舗情報取得・更新 |
| `app/api/admin/menus/route.ts` | **学習順 / 重要** | メニュー一覧作成・取得 |
| `app/api/admin/menus/[menuId]/route.ts` | **学習順 / 重要** | メニュー詳細更新・削除 |
| `app/api/admin/upload-shop-image/route.ts` | **重要** | 店舗画像アップロード |
| `app/api/admin/upload-menu-image/route.ts` | **重要** | メニュー画像アップロード |
| `app/api/admin/invitations/route.ts` | **あとで読む** | 招待作成・一覧 |
| `app/api/admin/invitations/[inviteId]/resend/route.ts` | **あとで読む** | 招待再送 |
| `app/api/admin/invitations/[inviteId]/revoke/route.ts` | **あとで読む** | 招待取り消し |

#### 管理 API ファイル共通の読み方

**このファイルがないと困ること**

画面からの保存・更新・削除ができません。

画面は表示できても、DB に変更を反映できなくなります。

**主要 import**

- `NextRequest` / `NextResponse`: HTTP リクエストとレスポンスを扱う。
- `zod`: 入力値を検証する。
- `prisma`: DB を操作する。
- `lib/admin-auth.ts`: 操作権限を確認する。
- `lib/db-errors.ts`: DB エラーを扱う。
- `lib/allergens.ts`: メニューとアレルゲンの整合性を扱う。

**export**

- `GET`: データ取得。
- `POST`: 新規作成。
- `PATCH` または `PUT`: 更新。
- `DELETE`: 削除。

**入口と出口**

入口は `fetch()` やフォーム送信による HTTP リクエストです。

出口は JSON レスポンスです。

**エラー時**

- 未ログインなら認証エラー。
- 権限がなければ拒否。
- 入力が不正なら 400 系。
- DB エラーなら 500 系または専用エラー。

**保守時に一緒に見るファイル**

- 呼び出し元の Client Component
- `lib/admin-auth.ts`
- `lib/db-errors.ts`
- `prisma/schema.prisma`

### 5.6 公開画面

| ファイル | 区分 | 役割 |
|---|---|---|
| `app/(public)/page.tsx` | **学習順** | トップページ |
| `app/(public)/terms/page.tsx` | **あとで読む** | 利用規約 |
| `app/(public)/shops/page.tsx` | **重要** | 店舗一覧 |
| `app/(public)/shops/[shopId]/page.tsx` | **重要** | 店舗詳細とメニュー一覧 |
| `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx` | **重要** | メニュー詳細 |

#### 公開画面ファイル共通の読み方

**このファイルがないと困ること**

利用者が店舗やメニューを閲覧できません。

管理側で登録した情報の出口がなくなります。

**主要 import**

- `prisma`: 公開する店舗・メニュー情報を読む。
- `lib/public-db.ts`: 公開データ取得の補助。
- `components/public/...`: 利用者向け UI。

**export**

- `default function Page()`: 公開ページ。

**入口と出口**

入口は利用者が URL にアクセスすることです。

出口は DB から取得した公開可能な店舗・メニュー情報を画面に表示することです。

**エラー時**

店舗やメニューが存在しない場合は、not found 相当の表示になります。

公開されていないメニューは表示対象から外れます。

**保守時に一緒に見るファイル**

- `components/public/*`
- `lib/public-db.ts`
- `lib/public-allergen-preferences.ts`
- `lib/allergens.ts`

### 5.7 UI コンポーネント

| ファイル群 | 区分 | 役割 |
|---|---|---|
| `components/admin/auth/*` | **重要** | ログイン、登録、招待受け入れの UI |
| `components/admin/menu/*` | **学習順 / 重要** | メニュー一覧・作成・編集・画像調整 UI |
| `components/admin/shop/*` | **重要** | 店舗編集と QR 表示 |
| `components/public/*` | **重要** | 公開側の店舗・メニュー表示、アレルゲン設定 |
| `components/layout/*` | **あとで読む** | ロゴ、ヘッダー、管理画面シェル |

#### Client Component 共通の読み方

**このファイルがないと困ること**

ボタン操作、入力フォーム、画像プレビュー、localStorage 連携など、ブラウザ側の操作ができません。

**主要 import**

- `useState`: 画面内の状態を持つ。
- `useEffect`: 初回表示後や値変更後に処理する。
- `fetch`: API を呼ぶ。
- `next/navigation`: 画面遷移や再読み込みを行う。

**export**

- React コンポーネント。

**入口と出口**

入口は Page から props を渡されること、またはユーザー操作です。

出口は画面表示、API 呼び出し、ルーター遷移です。

**エラー時**

API が失敗した場合、エラーメッセージ表示や送信中解除が必要です。

**保守時に一緒に見るファイル**

- 呼び出している `app/api/.../route.ts`
- 親の `page.tsx`
- 入力検証で使う `lib/*`

### 5.8 共通 lib

| ファイル | 区分 | 役割 |
|---|---|---|
| `lib/allergens.ts` | **学習順 / 重要** | アレルゲン状態の整形・検証・公開判定 |
| `lib/upload-images.ts` | **重要** | 画像ファイルの検証と Blob 保存 |
| `lib/image-url-policy.ts` | **重要** | 店舗が扱ってよい画像 URL か確認する |
| `lib/menu-image-display.ts` | **重要** | メニュー画像の表示設定を扱う |
| `lib/invitations.ts` | **あとで読む** | 招待の期限・状態・受け入れ処理 |
| `lib/audit-log.ts` | **あとで読む** | 操作履歴を保存する |
| `lib/public-db.ts` | **重要** | 公開ページ用の DB 取得処理 |
| `lib/public-allergen-preferences.ts` | **重要** | 公開側のアレルゲン設定を扱う |
| `lib/validators/*` | **重要** | 入力値の形を定義する |

#### `lib/allergens.ts`

**このファイルがないと困ること**

メニューごとのアレルゲン状態を正しく保存・検証・表示できません。

公開できるメニューかどうかの判断も不安定になります。

**関係する画面・API・DB処理**

- メニュー作成
- メニュー編集
- メニュー公開判定
- 公開メニュー詳細
- `MenuItemAllergen` の保存

**主要 export**

- `createStatusBySlug`: slug から状態を引ける形にする。
- `buildAllergenRows`: DB 保存用の行データを作る。
- `validateAllergenStatusMap`: アレルゲン状態が正しいか検証する。
- `getMenuPublishValidationErrors`: 公開前の不足を返す。
- `buildSpecifiedIngredientNotice`: 特定原材料に関する表示文を作る。

**入口と出口**

入口は API や公開画面から渡されるアレルゲン状態です。

出口は DB に保存する形、または画面に表示する判断結果です。

**エラー時**

不明な slug や不正な状態がある場合、検証エラーとして扱われます。

**保守時に一緒に見るファイル**

- `prisma/schema.prisma`
- `components/admin/menu/*`
- `app/api/admin/menus/route.ts`
- `app/api/admin/menus/[menuId]/route.ts`

#### `lib/upload-images.ts`

**このファイルがないと困ること**

店舗画像・メニュー画像を安全にアップロードできません。

ファイルサイズや MIME type の検証が各 API に散らばります。

**主要 import**

- `@vercel/blob`: Blob にファイルを保存する。

**主要 export**

- 画像検証処理。
- Blob 保存処理。

**入口と出口**

入口はアップロード API から渡される `File` です。

出口は Blob に保存された画像 URL です。

**エラー時**

許可されていない形式、サイズ超過、保存失敗でエラーになります。

**保守時に一緒に見るファイル**

- `app/api/admin/upload-shop-image/route.ts`
- `app/api/admin/upload-menu-image/route.ts`
- `lib/image-url-policy.ts`

### 5.9 運用スクリプト

| ファイル | 区分 | 役割 |
|---|---|---|
| `scripts/create-test-user.ts` | **あとで読む** | Clerk テストユーザーを作成する |
| `scripts/migrate-users-to-clerk.ts` | **あとで読む** | 既存ユーザーを Clerk 前提に移行する |
| `prisma/seed.ts` | **あとで読む** | 初期データを投入する |
| `prisma/repair-published-menus.ts` | **あとで読む** | 公開メニューの整合性を補修する |

**注意**

これらは通常の Web リクエストでは動きません。

コマンドラインから実行する運用用の処理です。

### ここで覚えるポイント

- `page.tsx` は画面、`route.ts` は API、`lib/` は共通処理。
- ファイルを見るときは「入口」「出口」「エラー時」「一緒に見る場所」を必ず確認する。
- 重複する API の読み方は共通化して、個別差分に注目する。

---

## 6. 関数・コンポーネントごとの解説

この章では、特に重要な関数・コンポーネントを取り上げます。

コードを読むときは、1 行ずつ「何を受け取り、何を返し、失敗したらどうなるか」を確認します。

### `getCurrentClerkIdentity`

**入力**

なし。内部で Clerk の現在セッションを読みます。

**出力**

ログイン中の Clerk ユーザー情報、または未ログイン状態を表す値です。

**何をしているか**

Clerk のセッションから、現在のユーザー ID などを取得します。

**処理のまとまり**

```txt
Clerk から auth 情報を読む
  ↓
userId があるか確認する
  ↓
必要な Clerk ユーザー情報を返す
```

**1行ずつ読むときの意味**

- Clerk の関数を呼ぶ行: ブラウザではなくサーバー側でログイン情報を読む。
- `userId` を確認する行: 未ログインなら以降の DB 検索をしない。
- 戻り値を作る行: 後続処理が扱いやすい形に整える。

**なぜこの書き方か**

Clerk と DB の処理を分けることで、「ログインしているか」と「DB にユーザーがいるか」を区別できます。

**代替案**

各 API で直接 Clerk を読む方法もあります。

ただし、同じ処理が散らばり、修正漏れが起きやすくなります。

**つまずきやすい点**

Clerk のユーザー ID は DB の主キーではありません。

DB では `User.clerkUserId` として保存されています。

### `getCurrentAppUser`

**入力**

なし。内部で Clerk の現在ユーザーを読みます。

**出力**

DB の `User`、または見つからない状態です。

**何をしているか**

Clerk のユーザー ID を使って、DB の `User` を検索します。

**処理のまとまり**

```txt
Clerk のユーザーを取得
  ↓
clerkUserId で User を検索
  ↓
見つかった User を返す
```

**1行ずつ読むときの意味**

- `getCurrentClerkIdentity` を呼ぶ行: まず本人確認をする。
- `clerkUserId` で検索する行: Clerk とアプリ DB を接続する。
- `include` や `select` がある行: 後続処理に必要な関連情報だけを読む。
- `return` の行: 管理処理や API が使うユーザー情報を渡す。

**なぜこの書き方か**

Clerk を認証基盤、DB をアプリ固有データの管理場所として分けているためです。

**代替案**

Clerk の metadata だけで権限を持つ方法もあります。

ただし、店舗・メニュー・招待のような複雑な関係は DB で扱う方が保守しやすいです。

**つまずきやすい点**

ログイン済みでも DB に `User` がなければ、アプリ上のユーザーとしては未準備です。

### `provisionCurrentAppUserFromClerk`

**入力**

Clerk の現在ユーザー情報。

**出力**

作成または取得された DB の `User`。

**何をしているか**

Clerk には存在するが DB には存在しないユーザーを、アプリ DB に登録します。

**処理のまとまり**

```txt
Clerk ユーザーを読む
  ↓
DB に User があるか確認
  ↓
なければ作成
  ↓
User を返す
```

**なぜこの書き方か**

ログインとアプリ利用開始のタイミングを分けるためです。

**代替案**

Clerk webhook で DB ユーザーを作る方法もあります。

このプロジェクトでは、必要なタイミングで作成する設計です。

**つまずきやすい点**

同時リクエストで重複作成が起きないよう、DB の unique 制約とエラー処理を合わせて見る必要があります。

### `getCurrentAdminContext`

**入力**

なし。

**出力**

管理者として必要な `user`、`shop`、`shopId` などの情報。

**何をしているか**

現在のユーザーが管理画面で操作できる店舗情報をまとめます。

**処理のまとまり**

```txt
現在の App User を取得
  ↓
関連する Shop を取得
  ↓
管理画面で使いやすい形にまとめる
```

**1行ずつ読むときの意味**

- ユーザー取得: 未ログインや DB 未登録を確認する。
- 店舗取得: その人が操作できる対象を決める。
- context 作成: ページや API が同じ形で権限情報を使えるようにする。

**なぜこの書き方か**

各管理 API が毎回ユーザー・店舗検索を書くと、権限確認がばらつくためです。

**代替案**

API ごとに `prisma.shop.findFirst` を書く方法もあります。

ただし、保守性と安全性が下がります。

**つまずきやすい点**

認証と認可は別です。

**認証** は「誰か」を確認すること、**認可** は「何をしてよいか」を確認することです。

### `requireCurrentAdminContextOrRedirect`

**入力**

なし。

**出力**

管理者コンテキスト。条件を満たさない場合はリダイレクトします。

**何をしているか**

管理画面を表示する前に、必要なログイン状態や店舗設定を強制します。

**処理のまとまり**

```txt
管理者コンテキストを取得
  ↓
不足があれば redirect
  ↓
問題なければ context を返す
```

**なぜこの書き方か**

ページ側では「正常に表示できる状態」だけを扱えるようになります。

**代替案**

各ページで if 文を書いて分岐する方法もあります。

ただし、同じ判定が増えて管理しにくくなります。

**つまずきやすい点**

`redirect` は通常の `return` とは違い、そこでページ処理が終了します。

### `createStatusBySlug`

**入力**

アレルゲン状態の配列または map 化できるデータ。

**出力**

`slug` から状態を引けるオブジェクト。

**何をしているか**

画面表示や検証で使いやすいように、アレルゲン状態を検索しやすい形へ変換します。

**処理のまとまり**

```txt
アレルゲン状態の一覧を受け取る
  ↓
slug をキーにする
  ↓
状態を値にする
```

**なぜこの書き方か**

配列を毎回検索するより、`slug` で直接引ける方が読みやすく効率もよいからです。

**代替案**

毎回 `find()` で探す方法もあります。

ただし、表示項目が増えるほど処理が散らかります。

**つまずきやすい点**

`slug` は画面表示名ではなく、コードや DB で安定して使う識別子です。

### `buildAllergenRows`

**入力**

メニュー ID、アレルゲン一覧、状態 map。

**出力**

`MenuItemAllergen` に保存できる行データ。

**何をしているか**

画面から受け取った状態を、DB の中間テーブル用データに変換します。

**処理のまとまり**

```txt
アレルゲン一覧を回す
  ↓
各アレルゲンの status を決める
  ↓
menuItemId / allergenId / status の形にする
```

**なぜこの書き方か**

`MenuItem` と `Allergen` は多対多の関係です。

そのため、中間テーブル `MenuItemAllergen` に保存する形へ変換する必要があります。

**代替案**

JSON カラムにまとめて保存する方法もあります。

ただし、検索・集計・整合性チェックが難しくなります。

**つまずきやすい点**

`AllergenStatus.FREE` は「含まない」、`UNKNOWN` は「不明」です。

`UNKNOWN` を安全扱いしないことが重要です。

### `getMenuPublishValidationErrors`

**入力**

メニューの公開状態、名前、説明、アレルゲン状態など。

**出力**

公開できない理由の配列。

**何をしているか**

公開前に必要な情報が揃っているか確認します。

**処理のまとまり**

```txt
必須項目を確認
  ↓
アレルゲン状態を確認
  ↓
不足があればエラーメッセージにする
```

**なぜこの書き方か**

公開可否のルールを API や UI に散らばらせないためです。

**代替案**

画面側だけでチェックする方法もあります。

ただし、API を直接叩かれた場合に不正な公開ができてしまいます。

**つまずきやすい点**

UI の入力チェックとサーバー側の検証は別物です。

最終的な安全確認はサーバー側で行います。

### `uploadImage` 系処理

**入力**

ブラウザから送られた画像ファイル。

**出力**

Vercel Blob の URL。

**何をしているか**

画像形式とサイズを検証し、Blob に保存します。

**処理のまとまり**

```txt
File を受け取る
  ↓
MIME type を確認
  ↓
サイズを確認
  ↓
保存先パスを作る
  ↓
Blob にアップロード
  ↓
URL を返す
```

**なぜこの書き方か**

API ごとに画像検証を書くと、許可形式やサイズ上限がずれやすいためです。

**代替案**

画像を DB に直接保存する方法もあります。

ただし、DB が重くなりやすく、配信にも向きません。

**つまずきやすい点**

DB に保存するのは画像本体ではなく URL です。

### `image-url-policy` 系処理

**入力**

画像 URL、店舗 ID、用途。

**出力**

許可された URL かどうか。

**何をしているか**

他店舗の画像 URL や想定外の URL を保存しないように確認します。

**処理のまとまり**

```txt
URL を受け取る
  ↓
Blob の URL か確認
  ↓
パスに shopId が含まれるか確認
  ↓
用途に合うパスか確認
```

**なぜこの書き方か**

画像アップロード API と DB 更新 API は別なので、DB 更新時にも URL の安全性を確認する必要があります。

**代替案**

アップロード直後の URL だけを信じる方法もあります。

ただし、API に直接別 URL を送られた場合に危険です。

**つまずきやすい点**

「URL がある」ことと「その店舗が使ってよい URL である」ことは別です。

### 管理 API の `GET` / `POST` / `PATCH` / `DELETE`

**入力**

HTTP リクエスト。

**出力**

JSON レスポンス。

**何をしているか**

管理画面からの操作を受け取り、認証・権限・入力検証・DB 操作を行います。

**処理のまとまり**

```txt
リクエストを受け取る
  ↓
管理者コンテキストを取得
  ↓
body または params を読む
  ↓
Zod で検証
  ↓
Prisma で DB 操作
  ↓
JSON を返す
```

**1行ずつ読むときの意味**

- `export async function POST(...)`: Next.js が POST API として認識する。
- `await request.json()`: ブラウザから送られた JSON を読む。
- `schema.safeParse(...)`: 値の形が正しいか確認する。
- `prisma.xxx.create/update`: DB に変更を保存する。
- `return NextResponse.json(...)`: ブラウザへ結果を返す。

**なぜこの書き方か**

Next.js App Router では、`route.ts` の HTTP メソッド名 export が API の入口になるからです。

**代替案**

Server Actions を使う方法もあります。

ただし、このプロジェクトでは管理 API と画面の責務を分けるため Route Handler を使っています。

**つまずきやすい点**

Client Component から直接 Prisma は使えません。

DB 操作はサーバー側の API または Server Component で行います。

### `NewMenuForm`

**入力**

初期アレルゲン一覧、店舗情報、必要な初期値。

**出力**

メニュー作成 API へのリクエスト、成功時の画面遷移。

**何をしているか**

新規メニューの入力フォームを表示し、送信時に API を呼びます。

**処理のまとまり**

```txt
入力状態を useState で持つ
  ↓
ユーザー入力で state を更新
  ↓
送信時に payload を組み立てる
  ↓
POST /api/admin/menus を呼ぶ
  ↓
成功なら一覧または編集画面へ遷移
```

**なぜこの書き方か**

フォーム入力はブラウザ上で変化するため、**Client Component** として状態管理が必要です。

**代替案**

HTML form と Server Action で処理する方法もあります。

ただし、画像プレビューや複雑なアレルゲン入力があるため、Client Component の方が操作性を作りやすいです。

**つまずきやすい点**

画面上の state は DB ではありません。

API に送って保存が成功して初めて DB に反映されます。

### `MenuEditClient`

**入力**

既存メニュー、アレルゲン一覧、画像表示設定。

**出力**

更新 API へのリクエスト、画面上の編集結果。

**何をしているか**

既存メニューの内容を編集し、保存します。

**処理のまとまり**

```txt
初期値を state に入れる
  ↓
入力変更を state に反映
  ↓
画像やアレルゲン状態を整える
  ↓
PATCH /api/admin/menus/[menuId] を呼ぶ
  ↓
成功またはエラーを表示する
```

**なぜこの書き方か**

既存データを初期値として持ち、ユーザー操作に応じて差分を保存する必要があるためです。

**代替案**

ページ遷移ごとに保存する方法もあります。

ただし、入力途中の編集体験が悪くなります。

**つまずきやすい点**

props の初期値と state の現在値は別です。

保存時には state の現在値を API に送ります。

### `ShopEditClient`

**入力**

店舗情報。

**出力**

店舗更新 API へのリクエスト。

**何をしているか**

店舗名、説明、画像などを編集します。

**処理のまとまり**

```txt
店舗情報を state に入れる
  ↓
画像アップロード API を呼ぶ
  ↓
店舗更新 API に保存する
  ↓
成功・失敗を画面に表示する
```

**なぜこの書き方か**

店舗情報は管理画面から変更され、公開側にも反映される重要データだからです。

**代替案**

メニューと同じ API にまとめる方法もあります。

ただし、店舗とメニューは責務が違うため分けています。

**つまずきやすい点**

画像アップロードと店舗保存は別処理です。

アップロードに成功しても、店舗更新 API に保存しなければ DB には反映されません。

### 公開側 Client Component

対象例:

- `components/public/UserAllergenPreferenceClient.tsx`
- `components/public/ShopMenuListClient.tsx`
- `components/public/MenuDetailClient.tsx`

**入力**

Server Component から渡された店舗・メニュー・アレルゲン情報。

**出力**

利用者向けの表示、検索、絞り込み、localStorage への保存。

**何をしているか**

公開データを、利用者のアレルゲン設定に合わせて見やすく表示します。

**処理のまとまり**

```txt
公開データを受け取る
  ↓
localStorage から利用者設定を読む
  ↓
表示用に絞り込み・強調
  ↓
必要に応じて設定を保存する
```

**なぜこの書き方か**

個人のアレルゲン設定は DB ではなくブラウザに保存するため、Client Component で扱います。

**代替案**

ログインユーザーごとに DB 保存する方法もあります。

ただし、公開利用者にログインを求めない設計では localStorage が軽量です。

**つまずきやすい点**

localStorage はブラウザにしかありません。

Server Component では直接使えません。

### ここで覚えるポイント

- 関数は「入力 → 処理 → 出力」で読む。
- **認証** と **認可** を分けて説明できるようにする。
- Client Component はブラウザ操作、Route Handler は API、Prisma は DB 操作を担当する。

---

## 7. 重要概念の用語集

| 用語 | やさしい説明 |
|---|---|
| **App Router** | Next.js の `app/` ディレクトリでページや API を作る仕組み |
| **Server Component** | サーバー側で実行される React コンポーネント。DB を直接読める |
| **Client Component** | ブラウザ側で動く React コンポーネント。`useState` や `useEffect` を使える |
| **Route Handler** | `app/api/.../route.ts` に書く API 処理 |
| **Clerk** | ログイン、ユーザー管理、セッション管理を担当する認証サービス |
| **Prisma** | TypeScript から DB を操作するための ORM |
| **ORM** | SQL を直接書かずに、コードから DB を扱う仕組み |
| **schema** | DB の設計図。Prisma では `schema.prisma` |
| **migration** | schema の変更を DB に反映する手順 |
| **validation** | 入力値が正しい形か確認すること |
| **session** | ログイン状態を保持する情報 |
| **authorization** | 操作してよい権限があるか確認すること |
| **authentication** | 誰がログインしているか確認すること |
| **relation** | DB テーブル同士の関係 |
| **enum** | 決められた値だけを許可する型 |
| **many-to-many** | 多対多の関係。例: 1つのメニューに複数アレルゲン、1つのアレルゲンが複数メニューに関係する |
| **中間テーブル** | 多対多を表すためのテーブル。例: `MenuItemAllergen` |
| **localStorage** | ブラウザ内に小さなデータを保存する仕組み |
| **Vercel Blob** | 画像などのファイルを保存・配信するサービス |
| **MIME type** | ファイルの種類を表す情報。例: `image/png` |
| **Zod** | TypeScript で入力検証を書くためのライブラリ |

### ここで覚えるポイント

- **authentication** は本人確認、**authorization** は権限確認。
- **Server Component** はサーバー、**Client Component** はブラウザ。
- **schema** を理解すると、API と画面のデータ構造が理解しやすくなる。

---

## 8. このプロジェクト特有の設計判断

### なぜ Clerk を使っているのか

ログイン、セッション、ユーザー作成、招待などを自前で作ると、セキュリティと保守の負担が大きくなります。

このプロジェクトでは **Clerk** に認証を任せ、アプリ固有の店舗・メニュー・権限は DB で管理します。

### なぜ Prisma なのか

Prisma を使うと、`schema.prisma` から TypeScript の型が生成されます。

そのため、DB のカラム名や relation をコード上で安全に扱いやすくなります。

### なぜこのフォルダ構成なのか

Next.js App Router では `app/` が URL 構造を表します。

一方、UI は `components/`、共通処理は `lib/`、DB 設計は `prisma/` に分けています。

この分け方により、画面、部品、ロジック、DB 設計の責務が混ざりにくくなります。

### なぜ public / admin を分けているのか

公開側と管理側では、利用者、必要な権限、扱うデータが違うためです。

公開側は閲覧中心です。

管理側は DB 更新や画像アップロードを行うため、認証・権限確認が必須です。

### なぜ Route Handler を使っているのか

管理画面の Client Component から DB を直接操作できないためです。

`app/api/.../route.ts` に API を置くことで、ブラウザ操作とサーバー側の DB 更新を分離しています。

### なぜ画像 URL のポリシーを別ファイルにしているのか

画像アップロードと DB 更新は別 API です。

そのため、DB 更新時にも「その URL を保存してよいか」を確認する必要があります。

この確認を `lib/image-url-policy.ts` に集めることで、店舗画像とメニュー画像の安全性を共通管理できます。

### ここで覚えるポイント

- Clerk は認証、DB はアプリ固有データを担当する。
- Route Handler はブラウザと DB の境界。
- 公開側と管理側は、権限と責務が違うため分けている。

---

## 9. 面接・口頭説明で使える想定問答

### Q. このアプリの構成を説明してください

A. ClearAllergy は、飲食店がメニューとアレルゲン情報を管理し、利用者が公開ページで確認できる Next.js アプリです。

`app/` に公開画面、管理画面、API があり、UI 部品は `components/`、共通ロジックは `lib/`、DB 設計は `prisma/schema.prisma` に分かれています。

認証は Clerk、DB 操作は Prisma、画像保存は Vercel Blob です。

### Q. 認証はどうなっていますか

A. ログインとセッション管理は Clerk が担当します。

アプリ側では `lib/auth/getCurrentAppUser.ts` が Clerk のユーザー ID から DB の `User` を探し、`lib/admin-auth.ts` が管理者として操作できる `Shop` を含むコンテキストを作ります。

つまり、Clerk は本人確認、DB は店舗権限の確認に使っています。

### Q. DB 設計を説明してください

A. 中心は `Shop`、`MenuItem`、`Allergen` です。

`Shop` は複数の `MenuItem` を持ちます。

`MenuItem` と `Allergen` は多対多なので、`MenuItemAllergen` を中間テーブルとして使い、各アレルゲンの状態を `AllergenStatus` で保存します。

### Q. なぜ `MenuItemAllergen` が必要ですか

A. 1つのメニューには複数のアレルゲン状態があり、1つのアレルゲンも複数メニューに関係するためです。

多対多の関係に加えて `CONTAINS`、`FREE`、`MAY_CONTAIN`、`UNKNOWN` の状態を保存する必要があるので、中間テーブルが必要です。

### Q. 画像アップロードはどうなっていますか

A. 画像は Vercel Blob に保存します。

アップロード API がファイル形式とサイズを検証し、Blob に保存して URL を返します。

その URL を店舗やメニュー更新 API で DB に保存します。

DB には画像本体ではなく URL が入ります。

### Q. なぜ Client Component と Server Component を分けていますか

A. DB 読み込みや初期データ取得は Server Component が向いています。

一方、フォーム入力、画像プレビュー、localStorage、ボタン操作はブラウザ側の状態が必要なので Client Component にしています。

### Q. なぜ Route Handler を使っていますか

A. Client Component から直接 DB を操作できないためです。

Route Handler を API として用意し、認証・権限・入力検証を通したうえで Prisma から DB を更新しています。

### Q. なぜ Clerk だけで権限管理しないのですか

A. Clerk はログインやユーザー管理には強いですが、店舗、メニュー、招待、監査ログのようなアプリ固有の関係は DB で扱う方が自然です。

そのため、本人確認は Clerk、業務データと権限は Prisma / PostgreSQL で管理しています。

### Q. エラー処理はどこを見ればよいですか

A. API のエラー処理は `app/api/.../route.ts` と `lib/db-errors.ts` を見ます。

認証エラーは `lib/auth/getCurrentAppUser.ts` と `lib/admin-auth.ts`、入力検証エラーは `lib/validators/*` や各 route の Zod schema を確認します。

### ここで覚えるポイント

- 口頭説明では「Clerk = 本人確認」「DB = アプリ固有データ」「Route Handler = API 境界」と説明する。
- DB 設計では `MenuItemAllergen` の理由を説明できるようにする。
- 画像は Blob、DB は URL という分担を押さえる。

---

## 10. 次に読むべきファイル一覧

### 最初に読む

1. `prisma/schema.prisma`
2. `app/layout.tsx`
3. `proxy.ts`
4. `lib/db.ts`
5. `lib/auth/getCurrentAppUser.ts`
6. `lib/admin-auth.ts`

### 管理画面を理解するために読む

1. `app/admin/page.tsx`
2. `app/admin/(auth)/login/page.tsx`
3. `components/admin/auth/AdminLoginPageClient.tsx`
4. `app/admin/(auth)/register/page.tsx`
5. `app/admin/(dashboard)/layout.tsx`
6. `app/admin/(dashboard)/shop/page.tsx`
7. `components/admin/shop/ShopEditClient.tsx`
8. `app/admin/(dashboard)/menus/page.tsx`
9. `components/admin/menu/MenuListPageClient.tsx`

### メニュー機能を理解するために読む

1. `app/admin/(dashboard)/menus/new/page.tsx`
2. `components/admin/menu/NewMenuForm.tsx`
3. `app/admin/(dashboard)/menus/[menuId]/edit/page.tsx`
4. `components/admin/menu/MenuEditClient.tsx`
5. `components/admin/menu/MenuImageComposer.tsx`
6. `lib/allergens.ts`
7. `lib/menu-image-display.ts`
8. `app/api/admin/menus/route.ts`
9. `app/api/admin/menus/[menuId]/route.ts`

### 店舗・画像を理解するために読む

1. `app/api/admin/shop/route.ts`
2. `app/api/admin/upload-shop-image/route.ts`
3. `app/api/admin/upload-menu-image/route.ts`
4. `lib/upload-images.ts`
5. `lib/image-url-policy.ts`

### 公開側を理解するために読む

1. `app/(public)/page.tsx`
2. `app/(public)/shops/page.tsx`
3. `app/(public)/shops/[shopId]/page.tsx`
4. `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx`
5. `components/public/UserAllergenPreferenceClient.tsx`
6. `components/public/ShopMenuListClient.tsx`
7. `components/public/MenuDetailClient.tsx`
8. `lib/public-db.ts`
9. `lib/public-allergen-preferences.ts`

### あとで読む

1. `lib/invitations.ts`
2. `app/api/admin/invitations/route.ts`
3. `app/api/admin/invitations/[inviteId]/resend/route.ts`
4. `app/api/admin/invitations/[inviteId]/revoke/route.ts`
5. `app/api/invitations/accept/route.ts`
6. `lib/auth/clerkAdminCore.ts`
7. `lib/admin-platform-auth.ts`
8. `lib/admin-registration.ts`
9. `lib/audit-log.ts`
10. `lib/db-errors.ts`
11. `lib/validators/*`
12. `prisma/seed.ts`
13. `prisma/repair-published-menus.ts`
14. `scripts/create-test-user.ts`
15. `scripts/migrate-users-to-clerk.ts`

### ここで覚えるポイント

- 次に読むファイルは、DB → 認証 → 管理画面 → API → 公開画面 → 運用の順。
- メニュー機能はこのアプリの中心なので、画面・API・`lib/allergens.ts` をセットで読む。
- あとで読むファイルは、主要フローを理解してから読むと意味がつかみやすい。
