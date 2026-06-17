# ClearAllergy 初学者向け学習ガイド

このドキュメントは、食物アレルギー情報を飲食店が登録し、一般利用者が事前に確認できる Web アプリ「ClearAllergy」を教材として読むためのガイドです。

現在の正しい技術前提は、Next.js App Router、TypeScript、React、Tailwind CSS、Clerk、Prisma、PostgreSQL、Vercel Blob です。古い NextAuth 前提の説明はこのドキュメントでは使いません。もしコードや古い資料の中に `passwordHash`、旧ログイン処理、NextAuth を連想させる説明が残っている場合、それは現在の正ではない可能性があります。現在の認証の正本は Clerk セッションです。

## 1. このプロジェクトで学べること

ClearAllergy を読むと、単に Next.js の文法を覚えるだけでなく、実際の Web アプリで「画面」「認証」「API」「DB」「画像保存」がどうつながるかを学べます。

たとえば、飲食店の管理者は管理画面にログインして、店舗情報やメニューを登録します。メニューには価格、説明、原材料、注意事項、画像、そして 28 品目それぞれのアレルゲン状態を入力します。この流れを読むことで、フォームの入力値を React で管理し、API に送信し、Prisma 経由で PostgreSQL に保存する一連の実務的な流れが見えてきます。

一般利用者は公開ページから店舗を探し、メニュー詳細でアレルゲン情報を確認します。この流れを読むことで、Next.js の `page.tsx` が URL と対応していること、Server Component で DB からデータを取得して画面に渡すこと、必要な部分だけ Client Component にしてブラウザ側の状態を扱うことを学べます。

管理画面では、Clerk でログインしていることに加えて、ログイン中ユーザーが所有する `shopId` のデータだけを操作できるようにしています。ここから、認証だけでは不十分で、認可、つまり「その人がそのデータを操作してよいか」の確認が重要だと学べます。

## 2. アプリ全体のざっくり構造

ClearAllergy は、大きく分けると公開側、管理側、API、DB、画像保存、認証で構成されています。

公開側は、ログインしていない一般利用者が見る画面です。店舗一覧、店舗詳細、メニュー詳細などがあり、公開中のメニューだけを表示します。

管理側は、店舗管理者がログインして使う画面です。店舗情報の編集、メニュー作成、メニュー編集、画像アップロードなどを行います。管理画面に入るには Clerk のログインが必要です。

API は、画面と DB の間に入る処理です。管理 API はログイン確認と `shopId` の所有確認を行います。公開 API はログインなしで読めますが、非公開メニューは返さないようにします。

```text
利用者
  ↓
公開ページ app/(public)
  ↓
Server Component / 公開API
  ↓
PostgreSQL
  ↓
メニュー・アレルゲン情報

店舗管理者
  ↓
Clerkログイン
  ↓
管理画面 app/admin/(auth), app/admin/(dashboard)
  ↓
管理API app/api/admin
  ↓
PostgreSQL / Vercel Blob
```

もう少し具体的に見ると、公開ページでは `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx` のようなファイルが DB から公開メニューを取得します。管理画面では `app/admin/(dashboard)/menus/[menuId]/edit/page.tsx` がログイン中の店舗に属するメニューだけを取得し、編集フォームに渡します。保存時は `app/api/admin/menus/[menuId]/route.ts` が PUT リクエストを受け取り、`shopId` を確認してから DB を更新します。

画像は DB に直接保存するのではなく、Vercel Blob にファイルを保存し、DB には画像 URL を保存します。

## 3. フォルダ構成の読み方

### app/(public)

公開ページを置く場所です。`(public)` は Route Group（URL には出ない整理用フォルダ）なので、`app/(public)/shops/page.tsx` は `/shops` として表示されます。

最初に見るべきファイルは、`app/(public)/shops/page.tsx`、`app/(public)/shops/[shopId]/page.tsx`、`app/(public)/shops/[shopId]/menus/[menuId]/page.tsx` です。

ここを読むと、Next.js App Router の URL とフォルダ構成の対応、Server Component で DB 取得する流れ、公開中データだけを表示する考え方を学べます。

### app/admin/(auth)

管理者のログインや登録に関するページを置く場所です。`(auth)` も URL には出ない Route Group です。

最初に見るべきファイルは、`app/admin/(auth)/login/page.tsx` と `app/admin/(auth)/register/page.tsx` です。

ここを読むと、認証が必要なアプリでログイン前の導線をどう分けるかを学べます。

### app/admin/(dashboard)

ログイン後の管理画面を置く場所です。店舗編集、メニュー一覧、新規作成、編集画面がここにあります。

最初に見るべきファイルは、`app/admin/(dashboard)/layout.tsx`、`app/admin/(dashboard)/shop/page.tsx`、`app/admin/(dashboard)/menus/page.tsx`、`app/admin/(dashboard)/menus/new/page.tsx`、`app/admin/(dashboard)/menus/[menuId]/edit/page.tsx` です。

ここを読むと、管理画面全体を共通レイアウトで包む方法、ログイン必須ページの守り方、フォーム用の初期データ取得を学べます。

### app/api

Route Handler（Next.js App Router で API を作る仕組み）を置く場所です。`route.ts` が API の入口です。

最初に見るべきファイルは、`app/api/admin/menus/route.ts`、`app/api/admin/menus/[menuId]/route.ts`、`app/api/admin/shop/route.ts`、`app/api/admin/upload-shop-image/route.ts`、`app/api/menus/[menuId]/route.ts` です。

ここを読むと、GET / POST / PUT / DELETE の違い、JSON の読み取り、認証確認、`shopId` による所有確認、エラーレスポンスの返し方を学べます。

### components

画面で使う React コンポーネントを置く場所です。公開側は `components/public`、管理側は `components/admin`、共通レイアウトは `components/layout` に分かれています。

最初に見るべきファイルは、`components/public/ShopMenuListClient.tsx`、`components/public/PublicMenuDetailBodyClient.tsx`、`components/admin/menu/NewMenuForm.tsx`、`components/admin/menu/MenuEditClient.tsx`、`components/admin/shop/ShopEditClient.tsx` です。

ここを読むと、Client Component で `useState` を使って入力状態を持つ方法、フォーム送信、ボタン、一覧表示、条件付き表示を学べます。

### lib

DB 接続、認証、バリデーション、アレルゲン共通処理、画像 URL 検証など、複数の場所から使う処理を置く場所です。

最初に見るべきファイルは、`lib/db.ts`、`lib/admin-auth.ts`、`lib/allergens.ts`、`lib/upload-images.ts`、`lib/validators/admin-input.ts` です。

ここを読むと、画面や API から共通利用する処理をどう切り出すかを学べます。

### prisma

DB の構造や seed データを置く場所です。

最初に見るべきファイルは、`prisma/schema.prisma` と `prisma/seed.ts` です。

ここを読むと、User、Shop、MenuItem、Allergen、MenuItemAllergen の関係、enum、リレーション、初期データの作り方を学べます。

### public

静的ファイルを置く場所です。ロゴやアイコンなど、ビルド時にそのまま配信されるファイルが入ります。

最初に見るべきファイルは、`public/images` 配下のロゴ画像です。

ここを読むと、アプリで使う固定画像と、Vercel Blob にアップロードするユーザー投稿画像の違いを学べます。

### docs / document

設計メモや学習用ドキュメントを置く場所です。このリポジトリには `docs` フォルダがあり、このガイドは指定に合わせて `document/beginner-study-guide.md` に保存します。

最初に見るべきファイルは、この `document/beginner-study-guide.md` です。

ここを読むと、コードを読む前の地図を得られます。

### scripts

開発や運用の補助スクリプトを置く場所です。

最初に見るべきファイルは、`scripts/create-test-user.ts` と `scripts/migrate-users-to-clerk.ts` です。

ここを読むと、アプリ本体の画面や API ではなく、開発作業やデータ移行を助ける処理の書き方を学べます。

## 4. 初学者が読むべき順番

### Step 1: 公開ページから読む

理由:
ログインや DB 更新よりも、まず「表示される画面」を読む方が理解しやすいためです。公開ページは一般利用者が見る画面なので、アプリの目的がつかみやすいです。

見る場所:

- `app/(public)`
- `components/public`

学ぶこと:

- `page.tsx` の役割
- URL とフォルダ構成の対応
- Server Component で DB から取得した情報を画面に表示する流れ
- `isPublished: true` のメニューだけを公開する考え方
- localStorage などブラウザ側の機能だけ Client Component に分ける考え方

### Step 2: 管理画面を見る

見る場所:

- `app/admin/(dashboard)/shop`
- `app/admin/(dashboard)/menus`
- `app/admin/(dashboard)/menus/new`
- `app/admin/(dashboard)/menus/[menuId]/edit`
- `components/admin/shop`
- `components/admin/menu`

学ぶこと:

- 店舗情報の編集
- メニュー作成
- メニュー編集
- 28 品目アレルゲンの状態管理
- `useState` を使ったフォーム入力の管理
- Server Component から Client Component に初期値を渡す流れ

### Step 3: APIを見る

見る場所:

- `app/api/admin/menus`
- `app/api/admin/menus/[menuId]`
- `app/api/admin/shop`
- `app/api/admin/upload-shop-image`
- `app/api/menus/[menuId]`
- `app/api/admin/_utils.ts`

学ぶこと:

- GET / POST / PUT / DELETE の違い
- リクエストとレスポンス
- 認証が必要な API と公開 API の違い
- `requireShopId()` によるログイン確認と `shopId` 取得
- `shopId` による所有確認
- API 直打ちに備えたバリデーション

### Step 4: Prisma schemaを見る

見る場所:

- `prisma/schema.prisma`

学ぶこと:

- `User` / `Shop` / `MenuItem` / `Allergen` / `MenuItemAllergen` の関係
- 1 対 1、1 対 多、多 対 多
- enum の意味
- アレルゲン状態 `CONTAINS` / `FREE` / `MAY_CONTAIN` / `UNKNOWN` の役割
- `@@id([menuItemId, allergenId])` のような複合主キー

### Step 5: 認証を見る

見る場所:

- `app/layout.tsx` の `ClerkProvider`
- `proxy.ts` の `clerkMiddleware()`
- `lib/auth/getCurrentAppUser.ts`
- `lib/admin-auth.ts`
- `app/admin/(dashboard)/layout.tsx`
- `app/api/admin/_utils.ts`
- `requireShopId()` や `requireCurrentAdminContextOrRedirect()` を使っている箇所

学ぶこと:

- ログインしていない人を管理画面に入れない仕組み
- Clerk のログイン中ユーザーとアプリ内 `User` を結びつける考え方
- ログイン中ユーザーと `Shop` を `ownerClerkUserId` で結びつける考え方
- 認証と認可の違い

## 5. 重要な技術を初心者向けに説明

### Next.js

何のために使っているか:
React を使って Web アプリを作るためのフレームワークです。フレームワークとは、ルーティング、画面表示、API、ビルドなどをまとめて支える土台です。

このプロジェクト内ではどこで使っているか:
`app` フォルダ全体、`next.config.ts`、`package.json` の `next` が該当します。

初学者が最初に理解すべきポイント:
`app` フォルダの中に `page.tsx` を置くとページになります。`route.ts` を置くと API になります。

深追いしすぎなくてよいポイント:
最初からレンダリング最適化、キャッシュ、ビルド内部の仕組みまで理解しようとしなくて大丈夫です。

### App Router

何のために使っているか:
Next.js の新しいルーティング方式です。フォルダ構成で URL、レイアウト、ページ、API を表します。

このプロジェクト内ではどこで使っているか:
`app/(public)`、`app/admin/(auth)`、`app/admin/(dashboard)`、`app/api` です。

初学者が最初に理解すべきポイント:
`app/shops/page.tsx` は `/shops`、`app/shops/[shopId]/page.tsx` は `/shops/店舗ID` のように対応します。`(public)` や `(dashboard)` は URL に出ない整理用フォルダです。

深追いしすぎなくてよいポイント:
Parallel Routes や Intercepting Routes のような高度な機能は、このプロジェクトの基本理解が終わってからで十分です。

### React

何のために使っているか:
画面を部品に分けて作るために使います。コンポーネントとは、ボタン、フォーム、カード、一覧などの画面部品です。

このプロジェクト内ではどこで使っているか:
`components` 配下、各 `page.tsx`、管理画面のフォームコンポーネントで使っています。

初学者が最初に理解すべきポイント:
関数が JSX を返すと画面になります。入力値などブラウザ側で変わる状態は `useState` で管理します。

深追いしすぎなくてよいポイント:
最初から高度なパフォーマンス最適化やメモ化を追う必要はありません。

### TypeScript

何のために使っているか:
JavaScript に型を付けて、データの形をコード上で分かりやすくするために使います。

このプロジェクト内ではどこで使っているか:
`.ts`、`.tsx` ファイル全体で使っています。API の request body 型、コンポーネント props 型、Prisma の型などが例です。

初学者が最初に理解すべきポイント:
型は「この変数にはどんな値が入るか」を説明するメモ兼チェック機能です。たとえば `priceYen: number | null` は、価格が数値または未設定であることを表します。

深追いしすぎなくてよいポイント:
ジェネリクスや条件型などの高度な型は、最初は読める範囲だけで十分です。

### Tailwind CSS

何のために使っているか:
CSS クラスを組み合わせて画面の見た目を作るために使います。

このプロジェクト内ではどこで使っているか:
JSX の `className` に `px-4`、`text-sm`、`bg-white`、`rounded-xl` のようなクラスが書かれています。

初学者が最初に理解すべきポイント:
クラス名がそのままスタイルを表します。`text-sm` は文字サイズ、`bg-white` は背景色、`flex` は横並びや縦並びの土台です。

深追いしすぎなくてよいポイント:
最初から Tailwind の設定ファイルやプラグインまで詳しく追わなくて大丈夫です。

### Clerk

何のために使っているか:
ログイン、ログアウト、ユーザーセッションを管理するために使います。認証とは「誰がログインしているか」を確認する仕組みです。

このプロジェクト内ではどこで使っているか:
`app/layout.tsx` の `ClerkProvider`、`proxy.ts` の `clerkMiddleware()`、`lib/auth`、`lib/admin-auth.ts` で使っています。

初学者が最初に理解すべきポイント:
現在の正しい認証基盤は Clerk です。管理画面や管理 API では Clerk のログイン中ユーザーを起点に、アプリ内 `User` と `Shop` を確認します。

深追いしすぎなくてよいポイント:
OAuth や Clerk の管理 API の詳細は、まずログイン中ユーザーを取得する流れが分かってからで大丈夫です。

### Prisma

何のために使っているか:
ORM（データベースを TypeScript のコードから扱いやすくする仕組み）として使います。

このプロジェクト内ではどこで使っているか:
`prisma/schema.prisma`、`lib/db.ts`、API や Server Component 内の `prisma.menuItem.findMany()` などで使っています。

初学者が最初に理解すべきポイント:
`findMany` は複数取得、`findFirst` は条件に合う 1 件取得、`create` は作成、`update` は更新、`delete` は削除です。`where` は条件、`select` は取得する列、`include` は関連データも一緒に取る指定です。

深追いしすぎなくてよいポイント:
最初から複雑なトランザクションやマイグレーション設計を完全理解しようとしなくて大丈夫です。

### PostgreSQL

何のために使っているか:
アプリのデータを保存するリレーショナルデータベースです。リレーショナルとは、テーブル同士の関係を使ってデータを表す方式です。

このプロジェクト内ではどこで使っているか:
Prisma の datasource に `provider = "postgresql"` として設定されています。

初学者が最初に理解すべきポイント:
店舗、メニュー、アレルゲンは別々のテーブルに分かれ、ID でつながっています。

深追いしすぎなくてよいポイント:
インデックス最適化や実行計画は、基本的なテーブル関係を理解した後で十分です。

### Vercel Blob

何のために使っているか:
店舗画像やメニュー画像のファイル保存に使います。DB には画像そのものではなく、Blob に保存された画像の URL を保存します。

このプロジェクト内ではどこで使っているか:
`lib/upload-images.ts`、`app/api/admin/upload-shop-image/route.ts`、`app/api/admin/upload-menu-image/route.ts` で使っています。

初学者が最初に理解すべきポイント:
ファイルは `formData` で API に送り、API 側で形式とサイズを確認してから Blob に保存します。この実装では JPEG / PNG / WebP / GIF / AVIF のみ、5MB 以下に制限しています。

深追いしすぎなくてよいポイント:
ストレージの課金や CDN の詳細は、まずアップロードの基本が分かってからで十分です。

### Server Component

何のために使っているか:
サーバー側で実行される React コンポーネントです。DB 取得や認証確認など、ブラウザに出したくない処理に向いています。

このプロジェクト内ではどこで使っているか:
多くの `page.tsx` は Server Component です。たとえば `app/(public)/shops/[shopId]/page.tsx` や `app/admin/(dashboard)/menus/[menuId]/edit/page.tsx` です。

初学者が最初に理解すべきポイント:
Server Component では `useState` や `onClick` のようなブラウザ側の状態管理は使えません。その代わり、DB 取得や `redirect()`、`notFound()` を扱いやすいです。

深追いしすぎなくてよいポイント:
ストリーミングや細かいキャッシュ戦略は後回しで大丈夫です。

### Client Component

何のために使っているか:
ブラウザ側で動く React コンポーネントです。フォーム入力、クリック操作、localStorage などに使います。

このプロジェクト内ではどこで使っているか:
`components/admin/menu/MenuEditClient.tsx`、`components/admin/menu/NewMenuForm.tsx`、`components/public/PublicMenuDetailBodyClient.tsx` などです。

初学者が最初に理解すべきポイント:
ファイル先頭に `"use client";` があると Client Component になります。`useState` を使いたい場合は Client Component にする必要があります。

深追いしすぎなくてよいポイント:
最初から Server Component との細かい境界設計を完璧にする必要はありません。まず「DB 取得はサーバー、操作はクライアント」と考えると分かりやすいです。

### Route Handler

何のために使っているか:
Next.js App Router で API を作るために使います。

このプロジェクト内ではどこで使っているか:
`app/api/**/route.ts` にあります。`export async function GET()`、`POST()`、`PUT()`、`DELETE()` のように HTTP メソッドごとの関数を書きます。

初学者が最初に理解すべきポイント:
画面から `fetch("/api/admin/menus")` のように呼び出され、JSON を受け取って DB を操作し、`NextResponse.json()` で結果を返します。

深追いしすぎなくてよいポイント:
Edge Runtime や低レベルな HTTP 詳細は、基本的な API の読み書きが分かってからで十分です。

### middleware

何のために使っているか:
リクエストがページや API に届く前に共通処理を行うために使います。このプロジェクトでは Clerk の認証状態を全体で読めるようにするために使っています。

このプロジェクト内ではどこで使っているか:
`proxy.ts` の `clerkMiddleware()` です。Next.js のバージョンや構成により、一般に middleware 相当の役割を持つファイルとして読めます。

初学者が最初に理解すべきポイント:
`clerkMiddleware()` だけで全ての管理画面が守られるわけではありません。実際の管理画面アクセス制御は `lib/admin-auth.ts`、管理 API の確認は `requireShopId()` が担当しています。

深追いしすぎなくてよいポイント:
matcher の正規表現は最初から完全に理解しなくて大丈夫です。

## 6. 主要なデータ構造の説明

### User

アプリ内のユーザーを表します。現在の認証の正本は Clerk なので、`clerkUserId` が重要です。`email` はメールアドレス、`shop` はそのユーザーに紐づく店舗です。

`passwordHash` は残っていますが、現在の正しい認証基盤は Clerk です。古いログイン方式や移行互換の名残である可能性があるため、初学者は「今は Clerk を見る」と覚えてください。

### Shop

飲食店を表します。店舗名、説明、住所、営業時間、定休日、電話番号、注意書き、カバー画像 URL などを持ちます。

`ownerClerkUserId` は、Clerk のユーザー ID と店舗を結びつけるための重要な値です。管理画面では、ログイン中の Clerk ユーザーが所有する店舗だけを操作します。

`Shop` と `MenuItem` は 1 対 多です。1 つの店舗は複数のメニューを持ちます。

### MenuItem

メニューを表します。名前、説明、価格、カテゴリ、原材料、注意事項、画像 URL、公開状態などを持ちます。

`shopId` によって、どの店舗のメニューかを表します。管理 API では、URL の `menuId` だけで更新してはいけません。必ず `shopId` も条件に入れて、自分の店舗のメニューだけを操作します。

`isPublished` は公開状態です。公開ページでは `isPublished: true` のメニューだけ表示します。

### Allergen

アレルゲンのマスタデータを表します。`slug` はプログラム上の識別子、`nameJa` は日本語名、`nameEn` は英語名、`sortOrder` は表示順です。

このプロジェクトでは 28 品目のマスタとして使います。`prisma/seed.ts` に、えび、かに、くるみ、小麦、そば、卵、乳、落花生などの初期データがあります。

### MenuItemAllergen

メニューとアレルゲンの関係を表す中間テーブルです。ここは特に重要です。

1 つのメニューには、28 品目それぞれについて「含む」「含まない」「含む可能性がある」「未設定」の状態が必要です。一方、1 つのアレルゲン、たとえば「卵」は多くのメニューに登場します。

つまり、`MenuItem` と `Allergen` は多 対 多の関係です。ただし、単に「関係がある」だけでは不十分で、その関係ごとに `status` を持つ必要があります。そのため `MenuItemAllergen` という中間テーブルを使っています。

例:

```text
MenuItem: 米粉パンケーキ
  - えび: FREE
  - 卵: FREE
  - 乳: FREE
  - 大豆: CONTAINS
  - りんご: MAY_CONTAIN
  - その他: FREE または UNKNOWN
```

`@@id([menuItemId, allergenId])` は、「同じメニューと同じアレルゲンの組み合わせは 1 行だけ」という意味です。これにより、同じメニューに対して「卵」の状態が重複して登録されることを防ぎます。

### AllergenStatus

アレルゲン状態を表す enum（決まった値だけを許可する型）です。

- `CONTAINS`: 含む
- `FREE`: 含まない
- `MAY_CONTAIN`: 含む可能性があります
- `UNKNOWN`: 未設定、未確認

`UNKNOWN` と `FREE` はまったく違います。`FREE` は確認したうえで含まないという意味です。`UNKNOWN` はまだ確認できていない、または未入力という意味です。健康に関わる情報なので、この違いを混同してはいけません。

## 7. 典型的な処理の流れ

### 店舗管理者がメニューを作成する流れ

1. 管理画面にログインする

Clerk でログインします。管理画面の共通レイアウト `app/admin/(dashboard)/layout.tsx` では `requireCurrentAdminContextOrRedirect()` を使って、未ログインならログイン画面へ、店舗未作成なら登録画面へ移動させます。

2. 新規メニュー作成画面を開く

`app/admin/(dashboard)/menus/new/page.tsx` が表示されます。このページは Server Component で、アレルゲンマスタを DB から取得し、`NewMenuForm` に渡します。

3. フォームに入力する

`components/admin/menu/NewMenuForm.tsx` が入力状態を管理します。ここは Client Component なので、`useState` でメニュー名、価格、説明、28 品目の状態などを扱えます。

4. API に POST する

フォーム送信時に `/api/admin/menus` へ POST します。`app/api/admin/menus/route.ts` の `POST()` が受け取ります。

5. DB に MenuItem が作られる

API は `requireShopId()` でログインと `shopId` を確認します。その後、`MenuItem` を作成し、同じ transaction の中で `MenuItemAllergen` も作成します。transaction（複数の DB 操作をまとめて成功または失敗にする仕組み）を使うことで、メニューだけ作られてアレルゲン情報が欠ける事故を防ぎます。

6. 編集画面へ移動する

API は作成したメニューの `id` を返します。画面側はその `id` を使って `/admin/menus/[menuId]/edit` へ移動し、詳細編集を続けます。

### 店舗管理者がアレルゲン情報を更新する流れ

1. メニュー編集画面を開く

`app/admin/(dashboard)/menus/[menuId]/edit/page.tsx` が表示されます。ここでログイン中の `shopId` と URL の `menuId` を使い、自店舗のメニューだけを取得します。

2. 28 品目の状態を変更する

`MenuEditClient` で 28 品目の状態を変更します。状態は `CONTAINS`、`FREE`、`MAY_CONTAIN`、`UNKNOWN` のいずれかです。

3. 保存ボタンを押す

画面から `/api/admin/menus/[menuId]` に PUT します。

4. API に PUT する

`app/api/admin/menus/[menuId]/route.ts` の `PUT()` が受け取ります。ここでも `requireShopId()` を通し、さらに `findFirst({ where: { id: menuId, shopId } })` で所有確認をします。

5. DB の MenuItemAllergen が更新される

現在の実装では、保存時に既存の `MenuItemAllergen` を削除し、28 品目分を作り直しています。これにより、欠損や古い状態が残ることを防ぎます。

6. 公開ページにも反映される

メニューが `isPublished: true` であれば、公開ページの DB 取得結果にも新しいアレルゲン状態が反映されます。公開時には UNKNOWN が残っていないかをサーバー側でも確認します。

### 一般利用者がメニュー詳細を見る流れ

1. 公開ページにアクセスする

利用者は `/shops/[shopId]/menus/[menuId]` にアクセスします。

2. menuId に対応するメニューを取得する

`app/(public)/shops/[shopId]/menus/[menuId]/page.tsx` が `shopId` と `menuId` を使って DB からメニューを取得します。条件には `isPublished: true` が入るため、非公開メニューは表示されません。

3. アレルゲン状態を表示する

`buildAllergenRows()` が 28 品目マスタを基準に表示用データを作ります。DB にリンクがない品目も `UNKNOWN` として表示できるようにしています。

4. CONTAINS / MAY_CONTAIN / FREE / UNKNOWN を見分ける

利用者は「含む」「含む可能性があります」「含まない」「未設定」を見分けて判断します。アレルギー情報は健康に関わるため、`UNKNOWN` は安全とは扱わず、未確認として表示します。

## 8. 初学者がつまずきやすいポイント

### page.tsx が多くてどれを見ればいいかわからない

原因:
App Router では各 URL ごとに `page.tsx` が存在するため、ファイル数が多く見えます。

どこを見る:
まず `app/(public)/shops/page.tsx`、次に `app/(public)/shops/[shopId]/page.tsx`、その後 `app/admin/(dashboard)/menus/page.tsx` を見ます。

どう直す:
URL から逆算してファイルを探します。`/shops/abc` なら `app/(public)/shops/[shopId]/page.tsx` です。

### app フォルダの URL ルールがわからない

原因:
フォルダ名が URL になるというルールに慣れていないためです。

どこを見る:
`app/(public)/shops/[shopId]/menus/[menuId]/page.tsx` を見ます。

どう直す:
`page.tsx` までのフォルダを `/` でつなげると URL になる、と考えます。`[shopId]` は動的な値です。

### `(public)` や `(dashboard)` が URL に出ない理由がわからない

原因:
丸括弧のフォルダは Route Group で、URL には出ない整理用フォルダだからです。

どこを見る:
`app/(public)`、`app/admin/(dashboard)`、`app/admin/(auth)` を見ます。

どう直す:
丸括弧フォルダは「URL ではなくコード整理用」と覚えます。`app/admin/(dashboard)/menus/page.tsx` は `/admin/menus` です。

### Server Component と Client Component の違いがわからない

原因:
どちらも React コンポーネントなので、最初は同じに見えるためです。

どこを見る:
Server Component の例は `app/(public)/shops/[shopId]/page.tsx`、Client Component の例は `components/admin/menu/MenuEditClient.tsx` です。

どう直す:
DB を読む、認証を確認する、初期データを取るなら Server Component。`useState`、クリック、入力フォーム、localStorage を使うなら Client Component と整理します。

### useState が使えないエラー

原因:
Server Component で `useState` を使おうとしている可能性があります。

どこを見る:
エラーが出たファイルの先頭と、そのファイルが `app` 配下の `page.tsx` かどうかを確認します。

どう直す:
ブラウザ側の状態が必要な部分を別コンポーネントに切り出し、ファイル先頭に `"use client";` を書きます。

### params が undefined になる問題

原因:
Next.js のバージョンや呼び出し方によって、`params` が Promise として渡る場合があります。また、API の Route Handler では context の扱いに注意が必要です。

どこを見る:
`app/api/admin/_utils.ts` の `getMenuId()`、`app/api/menus/[menuId]/route.ts` を見ます。

どう直す:
`const { menuId } = await params;` のように Promise 両対応で扱います。API では `context.params` から取れない場合に URL 末尾から補う実装も参考になります。

### API の URL を間違える問題

原因:
公開 API と管理 API のパスが似ているためです。

どこを見る:
`app/api/admin/menus/route.ts` と `app/api/menus/[menuId]/route.ts` を見比べます。

どう直す:
管理画面から更新する API は `/api/admin/...`、公開画面から読む API は `/api/...` と分けて覚えます。

### 401 / 403 / 404 / 500 の違い

原因:
HTTP ステータスコードの意味に慣れていないためです。

どこを見る:
`app/api/admin/_utils.ts` と各 API の `NextResponse.json(..., { status })` を見ます。

どう直す:
`401` は未ログイン、`403` はログインしているが権限や店舗設定が足りない、`404` は対象が見つからない、`500` はサーバー内部エラーです。このプロジェクトでは、他店舗の menuId を指定された場合に存在推測を避けるため `404` を返す箇所があります。

### Prisma の include / where がわからない

原因:
DB 取得の条件と関連データの取得が同じ場所に書かれているためです。

どこを見る:
`app/(public)/shops/[shopId]/page.tsx` と `app/admin/(dashboard)/menus/[menuId]/edit/page.tsx` を見ます。

どう直す:
`where` は「どのデータを取るか」、`select` は「どの列を取るか」、`include` は「関連データも取るか」と考えます。このプロジェクトでは `select` を使って必要な情報だけ取得する例が多いです。

### shopId の所有確認を忘れる危険性

原因:
`menuId` だけで更新できるようにすると、他店舗のメニュー ID を知っている人が更新できてしまうためです。

どこを見る:
`app/api/admin/menus/[menuId]/route.ts` の `findFirst({ where: { id: menuId, shopId: auth.shopId } })` を見ます。

どう直す:
管理 API では body の `shopId` を信用せず、Clerk 認証から得た `shopId` を使います。更新対象を探すときも必ず `id` と `shopId` の両方で絞ります。

### UNKNOWN と FREE を混同する危険性

原因:
どちらも「含む」ではないように見えてしまうためです。

どこを見る:
`prisma/schema.prisma` の `AllergenStatus`、`lib/allergens.ts` の `statusLabelJa()` と公開前バリデーションを見ます。

どう直す:
`FREE` は確認済みで含まない、`UNKNOWN` は未確認または未設定です。利用者の健康に関わるため、UNKNOWN を安全表示として扱ってはいけません。

## 9. セキュリティ上の重要ポイント

管理 API では必ずログイン確認します。理由は、店舗情報やメニュー情報の作成・更新・削除は店舗管理者だけが行うべき操作だからです。このプロジェクトでは `requireShopId()` が管理 API 共通の入口になっています。

body の `shopId` を信用してはいけません。リクエスト body はブラウザや外部ツールから自由に書き換えられます。もし body の `shopId` を信じると、悪意ある人が他店舗の `shopId` を送って更新できる可能性があります。

session / auth から取得した `userId` / `shopId` を使います。このプロジェクトでは Clerk セッションからログイン中ユーザーを確認し、`ownerClerkUserId` で店舗を探します。API では `requireShopId()` が返す `auth.shopId` を使います。

他店舗の `menuId` を指定されても更新できないようにします。`menuId` は URL に入るため、推測や漏洩の可能性をゼロにはできません。だから `where: { id: menuId, shopId: auth.shopId }` のように、必ず自店舗の条件を入れます。

画像アップロードではファイル形式やサイズ制限が必要です。画像以外のファイルや大きすぎるファイルを許可すると、セキュリティリスクやストレージ濫用につながります。このプロジェクトでは `validateImageFile()` で MIME type と 5MB 以下の制限を確認しています。

公開ページに出してよい情報と出してはいけない情報を分けます。公開ページでは店舗名、メニュー、価格、アレルゲン状態など利用者に必要な情報を出します。一方、管理者のメール、内部 ID、監査ログ、招待情報などは公開してはいけません。

アレルギー情報は人の健康に関わるため、断定表現や責任範囲に注意します。`FREE` は「登録上、含まないと確認されている」状態ですが、実際の調理環境や混入可能性までは別問題です。`MAY_CONTAIN` や注意事項を適切に表示し、`UNKNOWN` を安全扱いしないことが重要です。

## 10. このプロジェクトで練習できる課題

### Level 1: 表示を変える

- ボタン文言を変える
- メニューカードの表示項目を増やす
- `UNKNOWN` の表示文言を変更する
- 店舗詳細ページの「平均予算」の表示を少し整える
- メニュー詳細の更新日時の表示位置を変える

### Level 2: 小さな機能追加

- メニュー一覧に検索欄を追加する
- 公開メニュー詳細に注意書きを追加する
- 店舗詳細に営業時間表示を整える
- メニューカードにカテゴリラベルを追加する
- アレルゲン状態ごとの色やラベルを改善する

### Level 3: APIを触る

- メニューの公開/非公開切り替え API を確認する
- 不正な入力のバリデーションを追加する
- 404 と 403 の使い分けを整理する
- 価格が負の数にならないことを API 側で確認する
- 画像 URL が自店舗の Blob URL だけになるよう検証する処理を読む

### Level 4: DBを理解する

- Prisma Studio でデータを見る
- `MenuItem` と `MenuItemAllergen` の関係を確認する
- seed データを追加する
- 28 品目マスタの `sortOrder` を確認する
- `isPublished` が公開画面にどう影響するかを DB 上で確認する

### Level 5: 実務寄り改善

- E2E テストの観点表を作る
- エラーメッセージを整理する
- README に技術選定理由を書く
- セキュリティレビュー観点を追加する
- 管理 API の監査ログにどの情報を残すべきか整理する
- アレルギー表示の責任範囲と注意文言をレビューする

## 11. 学習メモ用テンプレート

以下は、コードを読んだときに Notion などへ貼れる学習メモ用テンプレートです。

```md
# 今日読んだファイル

## ファイル名

## このファイルの役割

## 出てきた重要な関数・変数

## 処理の流れ

1.
2.
3.

## わからなかった用語

## 自分の言葉で説明すると

## 次に確認するファイル
```

