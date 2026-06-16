# ClearAllergy 完全理解ガイド

## 0. このドキュメントの目的

このドキュメントは、ClearAllergy のコード、DB、認証、API、サーバー側処理、画面遷移を初学者が順番に理解するための学習教材です。

このドキュメントで理解できることは、次のとおりです。

- ClearAllergy が何をするアプリなのか。
- Next.js App Router で画面と API がどう作られているか。
- Server Component と Client Component をどう分けているか。
- Prisma と PostgreSQL がどうつながっているか。
- Clerk 認証とアプリ内 User / Shop がどう対応しているか。
- 管理画面と管理 API がなぜ安全に守られているか。
- アレルゲン情報をどのテーブルにどう保存しているか。
- 画像アップロードで Vercel Blob をどう使っているか。
- 面接でこのプロジェクトを説明するときに、どの言葉で説明すればよいか。

読み終わった後に説明できるようになることは、次のような内容です。

- 「このアプリは、飲食店がメニューごとのアレルゲン情報を公開し、利用者が確認できるアプリです」と説明できる。
- 「管理 API は Clerk のログイン状態を確認し、DB からログインユーザーの Shop を引き、その shopId だけで更新します」と説明できる。
- 「MenuItem と Allergen は多対多なので、中間テーブル MenuItemAllergen で status を持たせています」と説明できる。
- 「shopId をクライアントから受け取って信用しないことで IDOR を防いでいます」と説明できる。

README との違いは、README が導入・実行方法・概要説明に向いているのに対し、このドキュメントは「なぜその設計か」「どのコードが何をしているか」「画面から DB までどう流れるか」を学習用に分解している点です。

設計資料との違いは、設計資料が完成形や仕様を整理するものだとすると、このドキュメントは実際のリポジトリに存在するファイルを読みながら、初学者がコードを追えるように説明する点です。

## 1. ClearAllergy は何をするアプリか

ClearAllergy は、飲食店がメニューごとのアレルゲン情報を管理し、利用者が公開ページから確認できる Web アプリです。

誰のためのアプリかというと、主に次の 2 種類の人のためです。

- 公開側ユーザー: 飲食店やメニューを見て、アレルゲン情報を確認したい人。
- 店舗管理者: 自分の店舗情報、メニュー情報、アレルゲン情報を登録・編集したい人。

解決したい課題は、「メニューごとのアレルゲン情報が見つけにくい」「店舗側が情報を整理して公開しにくい」「利用者が来店前に確認しにくい」という問題です。

公開側ユーザーができることは、次のとおりです。

- `/` でトップページを見る。
- `/shops` で公開店舗一覧を見る。
- `/shops/[shopId]` で店舗詳細と公開メニュー一覧を見る。
- `/shops/[shopId]/menus/[menuId]` でメニュー詳細、原材料、注意書き、アレルゲン29品目を見る。
- 自分が気になるアレルゲンをブラウザの localStorage に保存し、画面上で強調表示する。

店舗管理者ができることは、次のとおりです。

- `/admin/login` から Clerk でログインする。
- `/admin/register` から管理者登録または初回店舗作成を行う。
- `/admin/shop` で店舗名、説明、住所、営業時間、画像などを編集する。
- `/admin/menus` でメニュー一覧を見る。
- `/admin/menus/new` でメニューを新規作成する。
- `/admin/menus/[menuId]/edit` でメニュー情報、画像、アレルゲン状態、公開状態を編集する。

MVP として作っている範囲は、店舗・メニュー・アレルゲン情報の公開と管理です。決済、予約、在庫管理、口コミ、店舗スタッフ権限の細かい分離などは主機能ではありません。

ポートフォリオとして見せるときは、次のように説明すると正確です。

> ClearAllergy は、飲食店がメニューごとのアレルゲン29品目を管理し、利用者が公開ページで確認できる Next.js アプリです。管理画面は Clerk 認証で保護し、管理 API ではログインユーザーに紐づく shopId をサーバー側で解決して、他店舗データを更新できないようにしています。

## 2. 全体構成の超概要

ブラウザとは、ユーザーが Web ページを見るためのソフトです。Chrome、Safari、Edge などです。ClearAllergy では、公開ページも管理ページもブラウザで開きます。

Next.js とは、React を使って Web アプリを作るためのフレームワークです。フレームワークとは、ルーティング、サーバー処理、ビルドなどの土台を用意してくれる仕組みです。

React とは、画面をコンポーネントという部品に分けて作る JavaScript ライブラリです。ライブラリとは、特定の機能を提供する道具箱です。

Server Component とは、サーバー側で実行される React コンポーネントです。DB を直接読む画面で使います。このプロジェクトでは、公開店舗一覧や管理メニュー一覧などが Server Component です。

Client Component とは、ブラウザ側で動く React コンポーネントです。`useState`、`useEffect`、`onClick`、`fetch`、`localStorage` など、ブラウザの操作が必要な場所で使います。ファイルの先頭に `"use client";` と書きます。

API Route / Route Handler とは、Next.js の `app/api/.../route.ts` に置くサーバー側 API です。画面から `fetch()` で呼び、DB 更新やアップロードなどを行います。

Clerk とは、ログイン、ログアウト、セッション管理、ユーザー作成などを任せる認証サービスです。認証とは「誰がログインしているか確認すること」です。

Prisma とは、TypeScript から DB を操作するための ORM です。ORM とは、SQL を直接書かずに `prisma.shop.findMany()` のようなコードで DB を操作する仕組みです。

PostgreSQL とは、データをテーブル形式で保存するリレーショナルデータベースです。このプロジェクトでは User、Shop、MenuItem、Allergen などを保存します。

Vercel Blob とは、画像などのファイルを保存するストレージです。DB には画像本体ではなく、アップロード後の URL を保存します。

Vercel とは、Next.js アプリをデプロイするサービスです。デプロイとは、ローカルで作ったアプリをインターネット上で動く状態にすることです。

環境変数とは、DB 接続文字列や Clerk の秘密鍵など、環境ごとに変わる値をコードの外から渡す仕組みです。例は `.env.example` にあります。

全体の文章図です。

```text
ユーザーのブラウザ
↓
Next.js の画面
↓
必要なら API Route
↓
Clerk でログイン確認
↓
Prisma で DB 操作
↓
PostgreSQL に保存
↓
結果を画面に表示
```

公開側では、ログイン不要で DB から公開済みデータだけを読みます。管理側では、ログイン確認と shopId 所有確認を通った場合だけ DB を更新します。

## 3. フォルダ構成の理解

`app/` は Next.js App Router の中心です。ここに置いたフォルダが URL になります。このプロジェクトでは公開画面、管理画面、API がすべて `app/` 配下にあります。初学者はまず `app/page.tsx`、`app/(public)/shops/page.tsx`、`app/admin/(dashboard)/menus/page.tsx`、`app/api/admin/menus/route.ts` を見るとよいです。注意点は、`page.tsx` は画面、`route.ts` は API であり、役割が違うことです。

`app/(public)/` は公開画面の Route Group です。Route Group とは、URL には出さずにファイル構成だけを整理するためのフォルダです。`(public)` は URL に含まれないので、`app/(public)/shops/page.tsx` は `/shops` になります。公開側はログイン不要ですが、DB 取得時には `isActive: true` や `isPublished: true` で公開条件を絞ります。

`app/admin/(auth)/` はログインや登録など、管理者認証まわりの画面です。`app/admin/(auth)/login/page.tsx` は `/admin/login`、`app/admin/(auth)/register/page.tsx` は `/admin/register` です。注意点は、ここは「ログインする前後の画面」であり、通常の管理ダッシュボードとは分けていることです。

`app/admin/(dashboard)/` はログイン後の管理画面です。`app/admin/(dashboard)/layout.tsx` で `requireCurrentAdminContextOrRedirect()` を呼び、未ログインや店舗未作成の人を弾きます。初学者は `app/admin/(dashboard)/shop/page.tsx` と `app/admin/(dashboard)/menus/page.tsx` を見ると、管理画面が DB から初期表示データを取る流れを理解できます。

`app/api/` は API Route を置く場所です。`app/api/admin/...` は管理 API、`app/api/menus/[menuId]/route.ts` や `app/api/allergens/route.ts` は公開 API です。注意点は、画面でボタンを隠しても API は直接叩けるため、管理 API 自体で必ず認証と認可をする必要があることです。

`components/` は画面部品を置く場所です。`components/admin/` は管理画面用、`components/public/` は公開画面用、`components/layout/` は共通レイアウト用です。`"use client";` があるファイルはブラウザ側で動きます。

`lib/` は共通ロジックを置く場所です。`lib/db.ts` は Prisma Client、`lib/admin-auth.ts` は管理者認証文脈、`lib/allergens.ts` はアレルゲン共通処理、`lib/upload-images.ts` は画像アップロード処理です。注意点は、DB や認証に関する処理はできるだけ `lib/` に寄せ、各 API で同じルールを使い回していることです。

`lib/validators/` は入力検証を置く場所です。バリデーションとは、入力値が期待どおりか確認することです。`lib/validators/admin-auth.ts` では zod を使い、ログイン・登録・オンボーディングの入力を検証しています。`lib/validators/admin-input.ts` ではメニュー・店舗編集用の値を安全に整形しています。

`lib/constants/` はこのリポジトリには現時点で存在しません。依頼文には対象例として出ていますが、実装上はアレルゲン定数は `lib/allergen-master.ts` や `lib/allergens.ts` に置かれています。

`prisma/` は Prisma 関連を置く場所です。`prisma/schema.prisma` が DB 設計の中心で、`prisma/migrations/` に DB 変更履歴があります。`prisma/seed.ts` は開発用の初期データ投入です。

`prisma/schema.prisma` は Prisma schema です。Prisma schema とは、DB のテーブル、カラム、リレーション、enum を TypeScript プロジェクト側から定義するファイルです。

`prisma/migrations/` は migration の履歴です。migration とは、DB 構造の変更を SQL として記録し、環境ごとに同じ変更を適用できるようにする仕組みです。

`public/` は静的ファイルを置く場所です。ロゴやアイコン画像が `public/images/` にあります。ここに置いたファイルは `/images/...` のように公開されます。

`docs/` はドキュメントを置く場所です。このファイルは `docs/learning/full-project-understanding-guide.md` にあります。

## 4. Next.js App Router の基本

App Router とは、Next.js の `app/` ディレクトリを使ったルーティング方式です。ルーティングとは、URL と表示する画面や API を対応させることです。

`app/` 配下のフォルダが URL になります。例えば `app/(public)/shops/page.tsx` は、`(public)` が Route Group なので URL には出ず、`/shops` になります。

`page.tsx` は、その URL で表示する画面です。例えば `app/(public)/shops/page.tsx` は `/shops` の画面です。

`layout.tsx` は、その配下のページを包む共通レイアウトです。例えば `app/admin/layout.tsx` では `ClerkProvider` で `/admin` 配下を包んでいます。

`route.ts` は API のファイルです。例えば `app/api/admin/menus/route.ts` は `/api/admin/menus` の API です。`export async function GET()` や `POST()` のように HTTP メソッドごとの関数を書きます。

`(public)` のような Route Group は、URL に影響しない整理用フォルダです。公開画面と管理画面をコード上で分けるために使います。

`[shopId]` や `[menuId]` は動的ルートです。動的ルートとは、URL の一部が変数になるルートです。`/shops/abc123` を開くと、`shopId` が `abc123` として取得できます。

公開画面と管理画面を分けている理由は、利用者向けの読み取り画面と、店舗管理者向けの更新画面では、必要な認証・UI・データ取得条件が違うからです。

URL とファイルの対応は次のとおりです。

| URL | ファイル | 役割 |
| --- | --- | --- |
| `/` | `app/page.tsx` | トップページ。静的デモ店舗を `HomePageView` に渡す。 |
| `/shops` | `app/(public)/shops/page.tsx` | 公開店舗一覧。公開メニューがある active 店舗だけ取得。 |
| `/shops/[shopId]` | `app/(public)/shops/[shopId]/page.tsx` | 店舗詳細。店舗情報と公開メニュー一覧を表示。 |
| `/shops/[shopId]/menus/[menuId]` | `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx` | 公開メニュー詳細。アレルゲン29品目を表示。 |
| `/admin/login` | `app/admin/(auth)/login/page.tsx` | 管理ログイン画面。Clerk ログイン UI へつなぐ。 |
| `/admin/register` | `app/admin/(auth)/register/page.tsx` | 管理者登録・初回店舗セットアップ。 |
| `/admin/shop` | `app/admin/(dashboard)/shop/page.tsx` | 店舗情報編集画面。 |
| `/admin/menus` | `app/admin/(dashboard)/menus/page.tsx` | メニュー一覧管理画面。 |
| `/admin/menus/new` | `app/admin/(dashboard)/menus/new/page.tsx` | メニュー新規作成画面。 |
| `/admin/menus/[menuId]/edit` | `app/admin/(dashboard)/menus/[menuId]/edit/page.tsx` | メニュー編集画面。 |
| `/api/admin/menus` | `app/api/admin/menus/route.ts` | 管理メニュー一覧取得・新規作成 API。 |
| `/api/admin/menus/[menuId]` | `app/api/admin/menus/[menuId]/route.ts` | 管理メニュー取得・更新・削除 API。 |
| `/api/admin/shop` | `app/api/admin/shop/route.ts` | 管理店舗情報取得・更新 API。 |
| `/api/menus/[menuId]` | `app/api/menus/[menuId]/route.ts` | 公開メニュー詳細 API。 |

## 5. Server Component と Client Component

Server Component とは、サーバー側で実行される React コンポーネントです。簡単に言うと、ブラウザに送る HTML を作る前にサーバーで動く部品です。DB を直接読むことができます。

Client Component とは、ブラウザ側で実行される React コンポーネントです。簡単に言うと、クリック、入力、状態管理など、ユーザー操作に反応する部品です。

`"use client"` とは、「このファイルは Client Component として扱ってください」という Next.js への指示です。ファイルの先頭に書きます。

DB を触れるのは Server Component、Route Handler、Server Action などサーバー側のコードです。Client Component から DB を直接触ってはいけません。Client Component は必要なら `fetch()` で API を呼びます。

`useState` や `onClick` を使うのは Client Component です。Server Component ではブラウザ上の状態やクリックイベントを扱えません。

画面を Server 側と Client 側に分ける理由は、DB 取得や認証確認はサーバー側で安全に行い、フォーム入力やボタン操作はブラウザ側で快適に行うためです。

Server Component として動いている画面の例です。

- `app/(public)/shops/page.tsx`: DB から公開店舗を取得する。
- `app/(public)/shops/[shopId]/page.tsx`: DB から店舗詳細と公開メニューを取得する。
- `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx`: DB から公開メニュー詳細を取得する。
- `app/admin/(dashboard)/shop/page.tsx`: 認証後、店舗情報を取得する。
- `app/admin/(dashboard)/menus/page.tsx`: 認証後、自店舗メニュー一覧を取得する。
- `app/admin/(dashboard)/menus/[menuId]/edit/page.tsx`: 認証後、自店舗の対象メニューだけ取得する。

Client Component として動いている部品の例です。

- `components/admin/menu/NewMenuForm.tsx`: 入力 state、画像選択、POST `/api/admin/menus`。
- `components/admin/menu/MenuEditClient.tsx`: 入力 state、PUT `/api/admin/menus/[menuId]`。
- `components/admin/shop/ShopEditClient.tsx`: 店舗フォーム、画像アップロード、PUT `/api/admin/shop`。
- `components/public/UserAllergenPreferenceClient.tsx`: localStorage に利用者のアレルゲン設定を保存。
- `components/public/ShopMenuListClient.tsx`: 公開メニュー一覧の絞り込みや強調表示。

間違って Client 側で DB を触ると危険な理由は、DB 接続情報や更新ロジックがブラウザに漏れる可能性があるからです。また、ブラウザ側のコードは利用者が改変できるため、認可チェックを信用できません。

## 6. DB設計の全体像

DB とは、データを保存する場所です。ClearAllergy では PostgreSQL を使っています。

テーブルとは、同じ種類のデータを行と列で保存する入れ物です。例えば `Shop` テーブルは店舗情報を保存します。

レコードとは、テーブルの 1 行です。例えば `Shop` の 1 レコードは 1 店舗を表します。

カラムとは、テーブルの列です。例えば `Shop.name` は店舗名、`MenuItem.priceYen` は価格です。

主キーとは、レコードを一意に識別する ID です。Prisma schema では `@id` が付いているカラムです。例: `Shop.id`。

外部キーとは、別のテーブルの主キーを参照するカラムです。例: `MenuItem.shopId` は `Shop.id` を参照します。

リレーションとは、テーブル同士の関係です。例: 1つの Shop は複数の MenuItem を持ちます。

1対1とは、1つのデータが別の1つのデータに対応する関係です。このプロジェクトでは `User` と `Shop` は `User.shop` / `Shop.userId @unique` により、基本的に 1 ユーザー 1 店舗の形です。

1対多とは、1つのデータが複数のデータを持つ関係です。`Shop` と `MenuItem` は 1対多です。1店舗は複数メニューを持ちます。

多対多とは、複数対複数の関係です。`MenuItem` と `Allergen` は多対多です。1メニューは複数アレルゲンを持ち、1アレルゲンは複数メニューに関係します。

Prisma schema とは、DB の構造を Prisma で表現するファイルです。このプロジェクトでは `prisma/schema.prisma` です。

migration とは、DB 構造の変更履歴です。`prisma/migrations/` に SQL として保存されています。

## 7. Prisma schema のモデル解説

### User

`User` はアプリ内の管理者ユーザーを表すテーブルです。

使う画面・機能は、管理ログイン後のユーザー解決、登録、監査ログです。Clerk のユーザー ID とアプリ内 User を結びつけます。

主なカラムは次のとおりです。

- `id`: アプリ内 User の主キー。
- `email`: メールアドレス。`@unique` なので重複不可。
- `passwordHash`: 旧認証互換用。現在の正は Clerk です。
- `clerkUserId`: Clerk の userId。`@unique` で 1 Clerk ユーザーに 1 User。
- `createdAt`, `updatedAt`: 作成・更新日時。

他のテーブルとの関係は、`shop Shop?` と `auditLogs AuditLog[]` です。User は Shop を 1 つ持つ可能性があり、複数の AuditLog を持ちます。

なぜこの設計かというと、Clerk は認証を担当し、アプリ DB は店舗や監査ログなど業務データを担当するためです。Clerk の userId だけで業務データをすべて持たせるのではなく、アプリ内 User を置くことで DB 上の関連を扱いやすくしています。

誤解しやすい点は、`passwordHash` があるから NextAuth や自作ログインが正という意味ではないことです。schema コメントにもある通り、現在のランタイム認証は Clerk セッションを正とします。

### Shop

`Shop` は店舗を表すテーブルです。

使う画面・機能は、公開店舗一覧、店舗詳細、管理店舗編集、管理メニュー操作です。

主なカラムは次のとおりです。

- `id`: 店舗の主キー。
- `userId`: 旧 User との 1対1 紐づけ。`@unique`。
- `ownerClerkUserId`: 現在の店舗所有者を Clerk user id で判定するためのカラム。
- `name`: 店舗名。
- `description`, `address`, `hours`, `regularHoliday`, `phoneNumber`, `note`: 公開ページに表示する店舗情報。
- `isActive`: 公開・管理対象として有効かどうか。
- `coverImageUrl`: 店舗画像 URL。
- `averageBudgetYen`: 平均予算。

他のテーブルとの関係は、`menus MenuItem[]`、`adminInvites AdminInvite[]`、`user User?` です。

Shop と User の関係は、基本的に 1 User が 1 Shop を持つ形です。ただし Clerk 移行や招待フローの都合で `userId` や `ownerClerkUserId` が nullable です。現在の所有確認では `ownerClerkUserId` と Clerk の userId を使う設計です。

### MenuItem

`MenuItem` は店舗のメニューを表すテーブルです。

使う画面・機能は、公開メニュー一覧、公開メニュー詳細、管理メニュー一覧、管理メニュー作成・編集です。

主なカラムは次のとおりです。

- `id`: メニューの主キー。
- `shopId`: どの店舗のメニューかを表す外部キー。
- `name`: メニュー名。
- `description`: 説明。
- `priceYen`: 価格。
- `category`: カテゴリ。
- `ingredients`: 原材料。
- `precaution`: 注意書き。
- `imageUrl`: メニュー画像 URL。
- `isPublished`: 公開中かどうか。

Shop と MenuItem の関係は 1対多です。1つの Shop は複数の MenuItem を持ちます。`MenuItem.shopId` が `Shop.id` を参照します。

なぜ `shopId` が重要かというと、管理 API で `where: { id: menuId, shopId }` のように条件を入れることで、他店舗のメニューを取得・更新できないようにするためです。

### Allergen

`Allergen` はアレルゲン品目のマスタテーブルです。

使う画面・機能は、管理画面の29品目選択、公開画面の29品目表示、公開 API の正規化です。

主なカラムは次のとおりです。

- `id`: アレルゲンの主キー。
- `slug`: プログラム上の固定キー。例: `egg`, `milk`。
- `nameJa`: 日本語名。
- `nameEn`: 英語名。
- `sortOrder`: 表示順。

アレルゲン品目は `lib/allergen-master.ts` にも定義されています。現在は29品目です。

### MenuItemAllergen

`MenuItemAllergen` は MenuItem と Allergen の中間テーブルです。

中間テーブルとは、多対多の関係を保存するためのテーブルです。MenuItem と Allergen は多対多なので、直接どちらかに配列として保存するのではなく、`MenuItemAllergen` を置きます。

主なカラムは次のとおりです。

- `menuItemId`: メニュー ID。
- `allergenId`: アレルゲン ID。
- `status`: そのメニューがそのアレルゲンをどう扱うか。
- `createdAt`, `updatedAt`: 作成・更新日時。

`@@id([menuItemId, allergenId])` は複合主キーです。複合主キーとは、複数カラムの組み合わせで 1 レコードを一意にすることです。これにより、同じメニューと同じアレルゲンの組み合わせが重複しません。

MenuItem と Allergen の関係は、MenuItemAllergen を通じた多対多です。

MenuItem に `eggStatus`, `milkStatus`, `wheatStatus` のようなカラムを直接持たせない理由は、品目が増えたときにテーブル構造を変更し続ける必要があるからです。マスタと中間テーブルに分けると、品目追加がしやすく、表示順や英語名も一元管理できます。

`CONTAINS`, `FREE`, `MAY_CONTAIN`, `UNKNOWN` の意味は次のとおりです。

- `CONTAINS`: 含む。
- `FREE`: 含まない。
- `MAY_CONTAIN`: 含む可能性があります。
- `UNKNOWN`: 未設定、未確認。

`UNKNOWN` を持たせる意味は、未確認を安全側に扱うためです。「未入力」を「含まない」と誤解すると危険です。未確認は未確認として表示し、公開時にはサーバー側で未設定が残っていないか確認します。

### AdminInvite

`AdminInvite` は店舗管理者を Clerk 招待で追加するためのテーブルです。

主なカラムは、`email`、`shopId`、`status`、`clerkInvitationId`、`invitedByClerkUserId`、`acceptedByClerkUserId`、`expiresAt` です。

この機能は、通常の店舗管理者というより運営管理者向けの招待管理に使います。`app/api/admin/invitations/route.ts` で作成・一覧取得します。

### AuditLog

`AuditLog` は管理操作を記録するテーブルです。

主なカラムは、`actorUserId`、`actorShopId`、`action`、`targetType`、`targetId`、`success`、`ipAddress`、`metadata` です。

なぜ必要かというと、ログイン、登録、メニュー作成、画像アップロードなどの成功・失敗を追跡できるようにするためです。セキュリティや運用確認に役立ちます。

### enum AllergenStatus / InviteStatus

enum とは、決められた値だけを許可する型です。`AllergenStatus` は `CONTAINS`, `FREE`, `MAY_CONTAIN`, `UNKNOWN` のみを許可します。`InviteStatus` は招待状態を `pending`, `accepted`, `revoked`, `expired`, `failed` に限定します。

## 8. Prisma Client の使い方

Prisma Client とは、TypeScript から DB を操作するために Prisma が生成するクライアントです。このプロジェクトでは `lib/db.ts` で初期化しています。

重要コードです。

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: ["error", "warn"],
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
```

1行ずつ説明します。

- `import { PrismaClient } from "@prisma/client";`: Prisma Client を読み込みます。
- `globalForPrisma`: 開発中の hot reload で PrismaClient が何度も作られないよう、`globalThis` に保持します。
- `export const prisma = ...`: アプリ内で使う Prisma Client を共通 export します。
- `new PrismaClient({ log: ["error", "warn"] })`: DB エラーや警告をログに出す設定です。
- `NODE_ENV !== "production"`: 開発環境だけグローバルに使い回します。本番では通常の生成に任せます。

Prisma の主なメソッドです。

- `prisma.xxx.findMany()`: 複数件取得します。
- `prisma.xxx.findUnique()`: 主キーや unique カラムで 1 件取得します。
- `prisma.xxx.findFirst()`: 条件に合う最初の 1 件を取得します。
- `prisma.xxx.create()`: 1 件作成します。
- `prisma.xxx.update()`: 1 件更新します。
- `prisma.xxx.delete()`: 1 件削除します。
- `include`: relation を含めて取得します。
- `select`: 返すカラムを限定します。
- `where`: 条件です。
- `orderBy`: 並び順です。

店舗一覧取得の実コードは `app/(public)/shops/page.tsx` です。

```ts
prisma.shop.findMany({
    where: {
        isActive: true,
        menus: {
            some: {
                isPublished: true,
            },
        },
    },
    orderBy: { updatedAt: "desc" },
    select: {
        id: true,
        name: true,
        description: true,
        address: true,
        averageBudgetYen: true,
        coverImageUrl: true,
        updatedAt: true,
        menus: {
            where: { isPublished: true },
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: { priceYen: true },
        },
    },
})
```

- `prisma.shop.findMany`: Shop を複数件取得します。
- `isActive: true`: 有効な店舗だけに絞ります。
- `menus.some.isPublished: true`: 公開メニューを 1 件以上持つ店舗だけに絞ります。
- `orderBy`: 更新日の新しい順にします。
- `select`: 公開一覧に必要な列だけ返します。
- `menus.where`: 店舗に紐づくメニューのうち公開中だけ取ります。
- `take: 1`: 一覧用に代表メニュー 1 件だけ取ります。

メニュー詳細取得の実コードは `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx` です。

```ts
const menu = await prisma.menuItem.findFirst({
    where: {
        id: menuId,
        shopId,
        isPublished: true,
    },
    select: {
        id: true,
        name: true,
        ingredients: true,
        precaution: true,
        shop: { select: { id: true, name: true } },
        allergenLinks: {
            select: {
                status: true,
                allergen: { select: { slug: true } },
            },
        },
    },
});
```

- `findFirst`: `id`, `shopId`, `isPublished` の条件に合うメニューを 1 件探します。
- `shopId` を条件に含めることで、URL の店舗とメニューの対応を確認します。
- `isPublished: true` により、非公開メニューは表示しません。
- `shop` relation で店舗名を一緒に取得します。
- `allergenLinks` relation でアレルゲン状態を一緒に取得します。

メニュー作成の実コードは `app/api/admin/menus/route.ts` です。

```ts
const created = await prisma.$transaction(async (tx) => {
    const menu = await tx.menuItem.create({
        data: {
            shopId: auth.shopId,
            name,
            priceYen: priceResult.value,
            isPublished,
            imageUrl: imageUrlResult.value,
        },
        select: { id: true },
    });

    await tx.menuItemAllergen.createMany({
        data: allergens.map((allergen) => ({
            menuItemId: menu.id,
            allergenId: allergen.id,
            status: (completeAllergenMap[allergen.slug] ?? "UNKNOWN") as never,
        })),
    });

    return menu;
});
```

- `$transaction`: 複数の DB 操作をひとまとまりにします。途中で失敗したら全部取り消します。
- `tx.menuItem.create`: MenuItem を作成します。
- `shopId: auth.shopId`: クライアントからではなく、サーバー側認証で得た shopId を使います。
- `select: { id: true }`: 作成後に必要な ID だけ返します。
- `tx.menuItemAllergen.createMany`: 29品目のアレルゲン状態をまとめて作ります。
- `UNKNOWN`: 欠損時は未設定として保存します。

メニュー更新の実コードは `app/api/admin/menus/[menuId]/route.ts` です。

```ts
const existing = await prisma.menuItem.findFirst({
    where: { id: menuId, shopId: auth.shopId },
    select: { id: true, isPublished: true, allergenLinks: { select: { status: true, allergen: { select: { slug: true } } } } },
});
```

- `id: menuId`: URL のメニュー ID です。
- `shopId: auth.shopId`: ログイン中の店舗 ID です。
- この 2 つを同時に見ることで、他店舗の menuId を指定されても見つかりません。

店舗情報更新は `app/api/admin/shop/route.ts` の `prisma.shop.update({ where: { id: auth.shopId } })` です。ここでもクライアントから shopId を受け取らず、認証済みの shopId だけで更新します。

アレルゲン状態更新は、更新時に一度 `deleteMany` で対象メニューの既存リンクを消し、`createMany` で全品目を作り直します。これにより、フォームの状態と DB の状態を一致させやすくしています。

## 9. 認証と認可の基本

認証とは、誰がログインしているか確認することです。英語では authentication です。

認可とは、その人がその操作をしてよいか確認することです。英語では authorization です。

ログインとは、ユーザーが本人であることをサービスに示し、以後そのユーザーとして扱われる状態に入ることです。

セッションとは、ログイン状態を一定期間保つ仕組みです。

Cookie とは、ブラウザに保存され、リクエスト時にサーバーへ送られる小さなデータです。ログインセッション管理によく使われます。

トークンとは、本人確認や権限確認に使われる文字列です。Clerk はログイン状態を安全に管理し、Next.js 側で `auth()` から userId を取得できるようにします。

Clerk は、ログイン UI、ユーザー管理、セッション、パスワード、SSO などを担当します。このプロジェクトでは自作認証ではなく Clerk を使います。自作認証はパスワード保存、セッション管理、攻撃対策などミスが重大事故につながりやすいためです。

管理画面にログインが必要な理由は、店舗情報やメニュー情報を変更できるからです。公開画面にログイン不要な理由は、利用者が見るだけのページだからです。

## 10. Clerk 認証の実装解説

Clerk 関連の中心ファイルは次のとおりです。

- `app/admin/layout.tsx`: `/admin` 配下を `ClerkProvider` で包む。
- `proxy.ts`: Clerk middleware の対象 URL を管理画面・管理 API・Clerk callback に限定する。
- `lib/auth/getCurrentAppUser.ts`: Clerk の `auth()` / `currentUser()` からアプリ内 User を解決する。
- `lib/admin-auth.ts`: 管理画面・管理 API で使う AdminContext を返す。
- `app/admin/(auth)/login/page.tsx`: ログイン画面。
- `app/admin/(auth)/register/page.tsx`: 登録・初回セットアップ画面。
- `app/api/admin/_utils.ts`: 管理 API 共通の `requireShopId()`。

`app/admin/layout.tsx` の重要コードです。

```tsx
import { ClerkProvider } from "@clerk/nextjs";

export default function AdminLayout({ children }: { children: ReactNode }) {
    return <ClerkProvider>{children}</ClerkProvider>;
}
```

- `ClerkProvider`: Clerk のログイン状態や UI を React 側で使えるようにする Provider です。
- `/admin` 配下だけを包むことで、公開ページには Clerk の処理を広げすぎない設計です。

`proxy.ts` の重要コードです。

```ts
export default clerkMiddleware();

export const config = {
    matcher: [
        "/admin/:path*",
        "/api/admin/:path*",
        "/api/invitations/accept",
        "/sign-in/:path*",
        "/sign-up/:path*",
    ],
};
```

- `clerkMiddleware()`: Clerk がリクエストからログイン状態を読めるようにします。
- `matcher`: middleware を適用する URL です。
- 公開ページは対象外です。公開ページに ClerkProvider や middleware を広げすぎると、不要な Clerk handshake やリダイレクトが混ざり、公開ページの初期表示に影響する可能性があります。

`lib/auth/getCurrentAppUser.ts` の重要コードです。

```ts
export async function getCurrentAppUser() {
    const { userId } = await auth();

    if (!userId) {
        return null;
    }

    return findExistingAppUser(userId);
}
```

- `auth()`: Clerk が管理するログイン情報をサーバー側で取得します。
- `userId`: Clerk のユーザー ID です。
- `userId` がなければ未ログインです。
- `findExistingAppUser(userId)`: DB の `User.clerkUserId` からアプリ内 User を探します。

Clerk の userId と DB の User / Shop の対応は次の流れです。

```text
Clerk userId
↓
User.clerkUserId
↓
User.shop または Shop.ownerClerkUserId
↓
Shop.id
↓
MenuItem.shopId で自店舗データだけ操作
```

`lib/admin-auth.ts` では `getCurrentAdminContext()` が Clerk userId から appUser を取得し、さらに active な Shop を探します。

```ts
const activeOwnedShop = clerkAppUser.clerkUserId
    ? await prisma.shop.findFirst({
          where: {
              ownerClerkUserId: clerkAppUser.clerkUserId,
              isActive: true,
          },
      })
    : null;
```

- `ownerClerkUserId`: 店舗所有者の Clerk userId です。
- `isActive: true`: 有効な店舗だけを管理対象にします。
- これにより、「ログインしている Clerk ユーザーが所有する店舗」をサーバー側で決めます。

## 11. サーバー側で認証する意味

ここが管理アプリで非常に重要です。

ブラウザ側の表示制御だけでは危険です。例えば、画面上で「削除ボタン」を隠しても、攻撃者はブラウザの開発者ツールや curl で API を直接叩けます。

ボタンを隠しても API を直接叩かれたら意味がない理由は、画面 UI はあくまで利用者のブラウザ上の表示にすぎないからです。ブラウザ側の JavaScript は利用者が読めますし、通信内容も再現できます。

そのため、API 側で必ずログイン確認します。このプロジェクトでは `app/api/admin/_utils.ts` の `requireShopId()` が共通入口です。

```ts
export async function requireShopId() {
    const context = await getCurrentAdminContext();

    if (!context) {
        return { ok: false, res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
    }

    if (!context.shop) {
        return { ok: false, res: NextResponse.json({ error: "shop setup required" }, { status: 403 }) };
    }

    return { ok: true, shopId: context.shop.id, appUser: context.appUser };
}
```

- `getCurrentAdminContext()`: Clerk ログイン状態から appUser と shop を取得します。
- `!context`: 未ログインなので 401。
- `!context.shop`: ログインしているが店舗が未設定なので 403。
- `shopId: context.shop.id`: 以後の DB 操作で使う安全な shopId です。

API 側で必ず shopId の所有確認をする理由は、ログインしているだけでは「どの店舗のデータを操作してよいか」は分からないからです。ログイン確認は認証、shopId 所有確認は認可です。

`shopId` をリクエスト body から信じてはいけません。body はブラウザから送られる値なので、攻撃者が書き換えられます。

サーバー側で `auth()` から userId を取得する意味は、ユーザーが自由に書き換えられない Clerk のセッション情報を使うためです。

DB からログインユーザーに対応する Shop を探す意味は、「この人が所有する店舗」をサーバーが決めるためです。

`where: { id: menuId, shopId }` のような条件が重要な理由は、URL の `menuId` だけでは他店舗のメニュー ID も指定できてしまうからです。`shopId` を同時に条件に入れることで、自店舗のメニュー以外は見つかりません。

悪い例です。

1. ユーザーAがログインする。
2. ユーザーAが自分のメニュー編集APIを叩く。
3. リクエストbodyの shopId をユーザーBの shopId に書き換える。
4. サーバーがbodyの shopId を信じる。
5. ユーザーBのメニューを更新できてしまう。

良い例です。

1. ユーザーAがログインする。
2. サーバーが Clerk のログイン情報から userId を取得する。
3. DBで userId に紐づく Shop を取得する。
4. その shopId だけを使って更新対象を絞る。
5. body の shopId は使わない。
6. 他店舗のデータは更新できない。

この種の脆弱性は IDOR と関係します。IDOR とは「他人のIDを指定するだけで他人のデータを見たり変更できてしまう問題」です。このプロジェクトでは、管理メニュー API で `findFirst({ where: { id: menuId, shopId: auth.shopId } })` を使うことで IDOR を防いでいます。

## 12. API Route / Route Handler の理解

このプロジェクトの主な API は次のとおりです。

### `GET /api/menus/[menuId]`

- ファイル: `app/api/menus/[menuId]/route.ts`
- 目的: 公開メニュー詳細を JSON で返す。
- 誰が使うか: 公開画面や外部の読み取り処理。
- ログイン: 不要。
- 入力: URL の `menuId`。
- 出力: menu 情報と allergens。
- DB 読み取り: `MenuItem`, `Allergen`, `MenuItemAllergen`。
- DB 更新: なし。
- 認証チェック: なし。
- 認可チェック: `isPublished: true` で公開データだけ返す。
- エラー: menuId 不足は 400、見つからない場合は 404、例外は 500。

処理フローです。

1. URL または params から menuId を取得。
2. menuId がなければ 400。
3. `isPublished: true` の MenuItem を検索。
4. 見つからなければ 404。
5. Allergen マスタを取得。
6. `buildAllergenRows()` で29品目を正規化。
7. 画像 URL を `validateStoredImageUrl()` で安全確認。
8. JSON を返す。

### `GET /api/allergens`

- ファイル: `app/api/allergens/route.ts`
- 目的: アレルゲン29品目の一覧を返す。
- ログイン: 不要。
- DB 読み取り: `Allergen`。
- DB 更新: なし。
- 出力: `slug`, `nameJa`, `nameEn`, `sortOrder`。

### `GET /api/admin/menus`

- ファイル: `app/api/admin/menus/route.ts`
- 目的: 管理者の自店舗メニュー一覧を返す。
- ログイン: 必要。
- 認証: `requireShopId()`。
- 認可: `where: { shopId: auth.shopId }`。
- DB 読み取り: `MenuItem`。
- 出力: menus。

### `POST /api/admin/menus`

- ファイル: `app/api/admin/menus/route.ts`
- 目的: 自店舗にメニューを新規作成する。
- ログイン: 必要。
- 入力: name, description, priceYen, imageUrl, allergenStatusBySlug など。
- DB 更新: `MenuItem` 作成、`MenuItemAllergen` 一括作成。
- 認証: `requireShopId()`。
- 認可: `shopId` は body ではなく `auth.shopId` を使う。
- バリデーション: 価格、画像 URL、アレルゲン status、公開条件。
- エラー: 400, 401, 403, 500。

主要コードです。

```ts
const originError = enforceSameOriginAdminMutation(req);
if (originError) return originError;

const auth = await requireShopId();
if (!auth.ok) return auth.res;
```

- `enforceSameOriginAdminMutation`: 更新系 API で Origin を確認します。CSRF 対策の一部です。
- `requireShopId`: ログインと店舗所有を確認します。

### `PUT /api/admin/menus/[menuId]`

- ファイル: `app/api/admin/menus/[menuId]/route.ts`
- 目的: 自店舗の既存メニューを更新する。
- ログイン: 必要。
- 入力: URL の menuId、body の更新内容。
- DB 更新: `MenuItem` 更新、`MenuItemAllergen` 再作成。
- 認可: `where: { id: menuId, shopId: auth.shopId }` で既存確認。
- エラー: 不正 JSON は 400、未ログインは 401、店舗なしは 403、対象なしは 404。

### `DELETE /api/admin/menus/[menuId]`

- ファイル: `app/api/admin/menus/[menuId]/route.ts`
- 目的: 自店舗のメニューを削除する。
- ログイン: 必要。
- DB 更新: `MenuItemAllergen` を削除後、`MenuItem` を削除。
- 認可: `where: { id: menuId, shopId: auth.shopId }`。

### `GET /api/admin/shop`

- ファイル: `app/api/admin/shop/route.ts`
- 目的: 自店舗の情報を取得する。
- ログイン: 必要。
- 認可: `auth.shopId` の店舗だけ取得。

### `PUT /api/admin/shop`

- ファイル: `app/api/admin/shop/route.ts`
- 目的: 自店舗情報を更新する。
- 入力: name, description, address, hours, image URL など。
- DB 更新: `Shop`。
- 認可: `where: { id: auth.shopId }`。

### `POST /api/admin/upload-shop-image`

- ファイル: `app/api/admin/upload-shop-image/route.ts`
- 目的: 店舗画像を Vercel Blob にアップロードする。
- ログイン: 必要。
- 入力: `FormData` の `file`。
- DB 更新: なし。URL を返し、店舗更新 API が DB に保存する。
- 認可: 保存先 path に `shops/${auth.shopId}/...` を使う。

### `POST /api/admin/upload-menu-image`

- ファイル: `app/api/admin/upload-menu-image/route.ts`
- 目的: メニュー画像を Vercel Blob にアップロードする。
- ログイン: 必要。
- 保存先: `menu-images/${auth.shopId}/...`。

### その他の API

- `POST /api/admin/register`: Clerk ユーザーと DB User / Shop を作成する。
- `POST /api/admin/onboarding`: Clerk ログイン後に初回 Shop を作成する。
- `POST /api/admin/auth/login`: ログイン precheck と監査ログ。
- `POST /api/admin/auth/sso`: SSO 監査。
- `GET/POST /api/admin/invitations`: 運営管理者向け招待管理。
- `POST /api/invitations/accept`: 招待受諾。

## 13. HTTPメソッドの理解

GET はデータを取得するためのメソッドです。このプロジェクトでは `/api/allergens`、`/api/menus/[menuId]`、`/api/admin/menus`、`/api/admin/shop` で使います。データを変更しないため GET を使います。

POST は新しいデータ作成や処理実行に使います。このプロジェクトでは `/api/admin/menus` のメニュー作成、`/api/admin/register` の登録、画像アップロード API で使います。新規作成やファイル送信なので POST です。

PUT は既存データ全体の更新に使います。このプロジェクトでは `/api/admin/menus/[menuId]` と `/api/admin/shop` で使います。フォーム内容をまとめて保存するため PUT です。

PATCH は一部更新に使うことが多いメソッドです。現時点の主要 API では PATCH は使われていません。メニュー公開状態だけを切り替える専用 API を作るなら PATCH が候補になります。

DELETE は削除に使います。このプロジェクトでは `/api/admin/menus/[menuId]` でメニュー削除に使います。

## 14. バリデーションの理解

バリデーションとは、入力値が正しい形か確認することです。例えば、価格が 0 以上の整数か、メールアドレスの形式か、画像 URL が許可されたものかを確認します。

フォーム入力をそのまま信用してはいけない理由は、ブラウザ側の入力制限は簡単に回避できるからです。攻撃者は API に直接 JSON を送れます。

zod とは、TypeScript で入力データを検証するライブラリです。このプロジェクトでは `lib/validators/admin-auth.ts` や `lib/validators/admin-invitations.ts` で使っています。

`lib/validators/admin-auth.ts` の例です。

```ts
export const adminRegisterSchema = z.object({
    shopName: z.string().trim().min(1).max(120),
    email: normalizedEmailSchema,
    password: passwordSchema,
    inviteToken: optionalInviteTokenSchema,
});
```

- `z.object`: オブジェクトの形を定義します。
- `shopName`: 空文字不可、最大120文字。
- `email`: メール形式と正規化。
- `password`: 8文字以上、128文字以下。
- `inviteToken`: 招待トークン。

メニュー・店舗編集では zod ではなく `lib/validators/admin-input.ts` の helper を使っています。

- `toRequiredTrimmedString`: 必須文字列を trim して確認。
- `toTrimmedNullableString`: 空文字を null にする。
- `parsePriceYen`: 価格を 0 以上の整数に限定。
- `parseAverageBudgetYen`: 平均予算を 0 以上の整数に限定。

フロント側バリデーションは、入力中に早くエラーを見せるためのものです。サーバー側バリデーションは、API 直打ちも含めて最終的に DB を守るためのものです。必須なのはサーバー側です。

## 15. 店舗管理画面の処理フロー

### 店舗管理者がログインする

1. 管理者が `/admin/login` を開く。
2. `app/admin/(auth)/login/page.tsx` が Server Component として動く。
3. すでにログイン済みか `getCurrentAdminContext()` で確認する。
4. 未ログインなら `AdminLoginPageClient` を表示する。
5. Client Component が Clerk のログイン処理を実行する。
6. ログイン後、DB の `User.clerkUserId` と Clerk userId を対応させる。
7. Shop があれば `/admin/shop` へ、なければ `/admin/register` へ進む。

### 店舗情報を編集する

1. 管理者が `/admin/shop` を開く。
2. `app/admin/(dashboard)/layout.tsx` が `requireCurrentAdminContextOrRedirect()` で認証確認する。
3. `app/admin/(dashboard)/shop/page.tsx` が `auth.shop.id` の Shop を DB から取得する。
4. `ShopEditClient` に初期値を渡す。
5. 管理者がフォームを変更する。
6. 保存時に必要なら `/api/admin/upload-shop-image` へ画像を送る。
7. その後 `/api/admin/shop` に PUT する。
8. API は `requireShopId()` でログインと shopId を確認する。
9. `prisma.shop.update({ where: { id: auth.shopId } })` で自店舗だけ更新する。
10. レスポンスを画面に反映する。

### メニューを新規作成する

1. `/admin/menus/new` を開く。
2. Server Component が認証確認し、Allergen マスタを DB から取得する。
3. `NewMenuForm` に allergens を渡す。
4. 管理者がフォームを入力する。
5. 保存時に `/api/admin/menus` へ POST する。
6. API は `requireShopId()` で shopId を決める。
7. body から shopId は受け取らない。
8. `MenuItem` と `MenuItemAllergen` を transaction で作成する。
9. 作成後、`/admin/menus/[id]/edit` へ遷移する。

### メニューを編集する

1. `/admin/menus/[menuId]/edit` を開く。
2. URL から `menuId` を取得する。
3. Server Component が `where: { id: menuId, shopId }` で自店舗メニューだけ取得する。
4. 見つからなければ 404。
5. `MenuEditClient` でフォームを編集する。
6. 保存時に `/api/admin/menus/[menuId]` へ PUT する。
7. API 側でも `where: { id: menuId, shopId: auth.shopId }` で再確認する。
8. `MenuItem` を更新し、`MenuItemAllergen` を作り直す。

### メニューを公開する

`isPublished` は公開中かどうかを表す Boolean です。`true` なら公開側に出ます。公開側では `isPublished: true` のメニューだけ取得します。

公開時には `getMenuPublishValidationErrors()` で、メニュー名とアレルゲン29品目の未設定がないかをサーバー側で確認します。未公開メニューは公開ページにも公開 API にも表示されません。

## 16. 公開画面の処理フロー

店舗一覧を見る流れです。

1. 利用者が `/shops` を開く。
2. `app/(public)/shops/page.tsx` が DB から active かつ公開メニューありの店舗を取得する。
3. `PublicShopListClient` に初期データを渡す。
4. ブラウザ側で検索や表示調整をする。

店舗詳細を見る流れです。

1. `/shops/[shopId]` を開く。
2. `shopId` を params から取得する。
3. `Shop` を `isActive: true`、公開メニューありで取得する。
4. 公開メニューだけを取得する。
5. 店舗情報、メニュー一覧、アレルゲン設定 UI を表示する。

メニュー詳細を見る流れです。

1. `/shops/[shopId]/menus/[menuId]` を開く。
2. `shopId` と `menuId` を params から取得する。
3. `MenuItem` を `id`, `shopId`, `isPublished: true` で取得する。
4. `Allergen` マスタと `MenuItemAllergen` を使って29品目を表示する。
5. 画像 URL は `sanitizeStoredImageUrl()` で表示許可済みだけ表示する。

公開側はログイン不要ですが、更新はできません。公開側の画面や API は読み取り専用で、更新 API は `/api/admin/...` に分けられ、Clerk 認証と shopId 認可が必要です。

## 17. アレルゲン表示機能の設計理解

アレルゲンとは、アレルギー反応の原因になりうる物質や食品です。このアプリでは、食品表示で重要な品目をメニューごとに表示します。

このアプリで扱うアレルゲン品目は `lib/allergen-master.ts` にあります。えび、かに、くるみ、小麦、そば、卵、乳、落花生、アーモンド、あわび、いか、いくら、オレンジ、カシューナッツ、キウイフルーツ、牛肉、ごま、さけ、さば、大豆、鶏肉、バナナ、豚肉、マカダミアナッツ、もも、りんご、やまいも、ゼラチン、ピスタチオの29品目です。

Allergen テーブルの役割は、品目のマスタ管理です。`slug`、日本語名、英語名、表示順を持ちます。

MenuItemAllergen テーブルの役割は、各メニューと各アレルゲンの状態を保存することです。`status` に `CONTAINS`, `FREE`, `MAY_CONTAIN`, `UNKNOWN` を保存します。

4択で管理する理由は、単純な「含む/含まない」だけでは現場の不確実性を表現できないからです。同一厨房や同一調理器具による混入可能性がある場合は `MAY_CONTAIN` が必要です。未確認は `UNKNOWN` として、`FREE` と区別します。

未設定は安全とは見なすべきではありません。`UNKNOWN` は「分からない」なので、利用者には確認を促すべきです。

アレルギー事故を防ぐためには、アプリだけで安全を保証できないことを明示する必要があります。店舗の原材料変更、仕入れ変更、調理場の交差接触などがあるため、重いアレルギーがある利用者には店舗へ直接確認する導線が必要です。

## 18. 画像アップロード機能の理解

Vercel Blob とは、Vercel が提供するファイル保存サービスです。このプロジェクトでは店舗画像とメニュー画像を保存します。

DB に画像本体を直接保存しない理由は、画像はサイズが大きく、DB に入れると重くなりやすいからです。DB には画像 URL だけ保存し、画像本体は Blob に置きます。

画像アップロード API の処理フローです。

1. Client Component で画像ファイルを選ぶ。
2. `FormData` に `file` を入れる。
3. `/api/admin/upload-shop-image` または `/api/admin/upload-menu-image` に POST する。
4. API が Origin を確認する。
5. API が `requireShopId()` でログインと店舗を確認する。
6. `validateImageFile()` で MIME とサイズを確認する。
7. `uploadImageToBlob()` で Vercel Blob に保存する。
8. Blob の URL を返す。
9. 店舗更新またはメニュー更新 API で DB に URL を保存する。

認証チェックが必要な理由は、誰でもアップロードできるとストレージが悪用されるからです。

ファイルサイズや拡張子チェックが必要な理由は、大きすぎるファイルや想定外形式を拒否するためです。`lib/upload-images.ts` では JPEG / PNG / WebP / GIF / AVIF、5MB 以下に制限しています。

URL 制約を入れる意味は、外部の任意 URL を保存させないためです。`lib/image-url-policy.ts` では Vercel Blob 由来で、かつ path に自店舗の shopId が含まれる URL だけを許可します。

店舗画像は `shops/${shopId}/cover-...`、メニュー画像は `menu-images/${shopId}/...` に保存されます。

## 19. 環境変数の理解

環境変数とは、環境ごとに変わる設定値をコードの外から渡す仕組みです。`.env.example` に例があります。

秘密情報をコードに直接書いてはいけない理由は、GitHub に push されると漏洩するからです。

主な環境変数です。

- `DATABASE_URL`: Prisma が PostgreSQL に接続する URL。
- `DIRECT_URL`: Prisma Migrate 用の直接接続 URL。
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: ブラウザ側でも使える Clerk 公開キー。
- `CLERK_SECRET_KEY`: サーバー側だけで使う Clerk 秘密鍵。
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob へ書き込むためのトークン。
- `ALLOWED_IMAGE_URL_PREFIXES`: 追加で許可する画像 URL prefix。
- `PORTFOLIO_MODE`: ポートフォリオ公開時に更新を制限する設定。
- `ADMIN_REGISTRATION_MODE`: 管理者自己登録の制御。
- `NEXT_PUBLIC_APP_URL`: 公開 URL のベース。

`NEXT_PUBLIC` が付くものはブラウザに公開されます。秘密鍵には絶対に付けてはいけません。`CLERK_SECRET_KEY` や `BLOB_READ_WRITE_TOKEN` はサーバー専用です。

ローカル環境では `.env` や `.env.local` を使います。本番環境では Vercel の Environment Variables に設定します。

GitHub に push してよいものは `.env.example` のような空の例です。push してはいけないものは実際の `.env`、DB URL、Secret Key、Blob Token です。

## 20. エラー処理の理解

400 Bad Request は、リクエストの形や入力が不正な場合です。例: JSON が壊れている、価格が不正、menuId がない。

401 Unauthorized は、ログインが必要なのに未ログインの場合です。`requireShopId()` は context がなければ 401 を返します。

403 Forbidden は、ログインしていても操作権限がない場合です。例: 店舗未設定、ポートフォリオモードで更新不可、Origin 不一致。

404 Not Found は、対象データが見つからない場合です。他店舗のメニュー ID を指定されたときも 404 にすることで、存在有無を推測されにくくしています。

500 Internal Server Error は、サーバー内部で予期しない例外が起きた場合です。

try/catch は、例外が起きたときにアプリが落ちないように捕まえる構文です。`app/api/admin/_utils.ts` の `internalError()` は、開発中は message を返し、本番では詳細を出しすぎないようにしています。

本番で詳細エラーを出しすぎると、DB 構造、環境変数名、内部実装が攻撃者に伝わる可能性があります。

## 21. セキュリティ設計の理解

このプロジェクトの主なセキュリティ対策です。

- 管理画面はログイン必須。
- 管理 API もログイン必須。
- shopId はサーバー側で決める。
- 他店舗データを更新できないよう、`where` に `shopId` を入れる。
- 公開 API と管理 API を分ける。
- 入力値をバリデーションする。
- 環境変数で秘密情報を管理する。
- 画像アップロードを MIME・サイズ・保存先で制限する。
- エラー情報を出しすぎない。
- IDOR 対策を入れる。
- 更新 API で Same Origin を確認する。
- 監査ログを保存する。

CSRF とは、ログイン済みユーザーのブラウザに別サイトから勝手にリクエストを送らせる攻撃です。このプロジェクトでは `enforceSameOriginAdminMutation()` で更新系 API の Origin を確認しています。ただし、CSRF 対策は Clerk のセッション方式や Cookie 設定も含めて継続的に確認すべきです。

XSS とは、悪意ある JavaScript をページに埋め込む攻撃です。React は通常テキストを自動エスケープしますが、画像 URL や HTML 直接挿入を扱う場合は注意が必要です。このプロジェクトでは画像 URL を制限している点が有効です。

ポートフォリオ公開時は、実データや秘密情報を入れない、登録や更新を制限する、アレルギー安全性を保証する表現を避ける、注意表示を整えることが重要です。

## 22. レンダリング戦略の理解

SSR は Server Side Rendering の略で、リクエスト時にサーバーで HTML を作る方式です。

SSG は Static Site Generation の略で、ビルド時に静的 HTML を作る方式です。

ISR は Incremental Static Regeneration の略で、静的ページを一定時間ごとに再生成する方式です。

CSR は Client Side Rendering の略で、ブラウザ側で JavaScript がデータ取得・描画する方式です。

このプロジェクトの公開ページには `export const revalidate = 60;` と `export const dynamic = "force-static";` があるページがあります。これは公開ページをある程度静的寄りに扱い、60 秒単位の再検証を意識した実装です。

管理ページはログイン状態や店舗所有者ごとに表示が変わるため、公開ページより動的です。管理画面では `requireCurrentAdminContextOrRedirect()` によってログインユーザーに応じた処理をします。

ただし、現時点で ISR や revalidate を「高度に使いこなしている」と強く語りすぎない方が安全です。面接では次の表現が正確です。

> 公開ページでは `revalidate = 60` を設定し、公開データは静的寄りに扱う設計にしています。一方、管理画面は認証ユーザーごとに内容が変わるため、Server Component で認証確認と DB 取得を行う動的な画面として実装しています。

## 23. 主要ファイルの1行ずつ解説

この章では、実ファイルの重要部分を引用し、行単位で意味を説明します。完全な全行引用ではなく、理解に必要な重要部分を抜粋します。

### `app/layout.tsx`

#### このファイルの役割

アプリ全体のルートレイアウトです。HTML の `lang`、フォント、メタデータ、全体 CSS を設定します。

#### このファイルが関係する画面・API

すべての画面に関係します。

#### 処理の流れ

1. Next.js の Metadata を定義する。
2. Google Font を設定する。
3. `<html lang="ja">` と `<body>` で children を包む。

#### コード解説

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
```

- `Metadata`: ページタイトルなどの型です。
- `Geist`, `Geist_Mono`: Next.js の font 機能で使うフォントです。
- `globals.css`: Tailwind CSS を含む全体スタイルです。

```tsx
export const metadata: Metadata = {
    title: "ClearAllergy",
    description: "Allergy-friendly menu viewer",
};
```

- `metadata`: ブラウザタブや検索エンジン向けの情報です。

```tsx
export default function RootLayout({ children }) {
    return (
        <html lang="ja">
            <body>{children}</body>
        </html>
    );
}
```

- `children`: 各ページの中身です。
- `lang="ja"`: 日本語ページであることを示します。

#### 初学者が間違えやすい点

ここに ClerkProvider を置くと公開ページにも Clerk が広がります。このプロジェクトでは `/admin` 配下だけで ClerkProvider を使っています。

#### 面接で説明するなら

> ルートレイアウトでは全体のメタデータ、フォント、CSS を設定し、認証 Provider は公開側へ広げすぎないよう admin layout に分離しています。

### `app/page.tsx`

トップページです。`dynamic = "force-static"` で静的表示に寄せ、デモ店舗を `HomePageView` に渡しています。DB 取得はしていません。

重要コードです。

```tsx
export const dynamic = "force-static";
```

- このページを静的寄りに扱う指定です。

```tsx
const featuredShop = { id: "demo-cafe-hibi", ... };
```

- トップページ用のデモデータです。実 DB ではなく固定データです。

### `app/(public)/shops/page.tsx`

公開店舗一覧ページです。

```tsx
const { data: shops, isDatabaseAvailable } = await readPublicDataOrFallback(
    () =>
        prisma.shop.findMany({
            where: {
                isActive: true,
                menus: { some: { isPublished: true } },
            },
        }),
    [],
    { context: "public-shops:list" },
);
```

- `readPublicDataOrFallback`: DB 接続失敗時に fallback を返す helper です。
- `prisma.shop.findMany`: 店舗を複数取得します。
- `isActive: true`: 有効な店舗だけ。
- `menus.some.isPublished`: 公開メニューがある店舗だけ。
- `[]`: DB が使えない場合の fallback。

### `app/(public)/shops/[shopId]/page.tsx`

公開店舗詳細ページです。

```tsx
const { shopId } = await params;
if (!shopId) {
    notFound();
}
```

- URL の `[shopId]` を取り出します。
- なければ 404 にします。

```tsx
const shop = await prisma.shop.findFirst({
    where: {
        id: shopId,
        isActive: true,
        menus: { some: { isPublished: true } },
    },
});
```

- 店舗 ID が一致し、有効で、公開メニューがある店舗だけ取得します。

### `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx`

公開メニュー詳細ページです。

```tsx
const menu = await prisma.menuItem.findFirst({
    where: {
        id: menuId,
        shopId,
        isPublished: true,
    },
});
```

- `id`: メニュー ID。
- `shopId`: URL の店舗 ID。
- `isPublished: true`: 公開メニューだけ。
- この3条件により、別店舗の menuId や非公開メニューを表示しません。

### `app/admin/(auth)/login/page.tsx`

管理ログインページです。Server Component で先にログイン状態を確認し、必要なら Client Component のログインフォームを出します。

```tsx
context = await getCurrentAdminContext();
```

- Clerk セッションから appUser と Shop を確認します。

```tsx
if (!context) {
    return <AdminLoginPageClient />;
}
```

- 未ログインならログイン UI を表示します。

```tsx
redirect("/admin/shop");
```

- すでに店舗を持つ管理者は管理画面へ送ります。

### `app/admin/(dashboard)/shop/page.tsx`

管理店舗編集ページです。

```tsx
const adminContext = await requireCurrentAdminContextOrRedirect();
const shopId = adminContext.shop.id;
```

- 未ログインや店舗未作成なら redirect します。
- 認証済みの shopId を取得します。

```tsx
const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { id: true, name: true, description: true, ... },
});
```

- 自店舗だけを取得します。
- `select` で画面に必要な列だけ取得します。

### `app/admin/(dashboard)/menus/page.tsx`

管理メニュー一覧ページです。

```tsx
const [allergens, menus] = await Promise.all([
    prisma.allergen.findMany(...),
    prisma.menuItem.findMany({
        where: { shopId },
        orderBy: { updatedAt: "desc" },
    }),
]);
```

- アレルゲンマスタと自店舗メニューを並列に取得します。
- `where: { shopId }` により他店舗メニューは出ません。

### `app/admin/(dashboard)/menus/new/page.tsx`

メニュー新規作成ページです。認証後、アレルゲンマスタを取得して `NewMenuForm` に渡します。

### `app/admin/(dashboard)/menus/[menuId]/edit/page.tsx`

メニュー編集ページです。

```tsx
const menu = await prisma.menuItem.findFirst({
    where: { id: menuId, shopId },
});
```

- URL の menuId と認証済み shopId の両方で取得します。
- 他店舗の menuId を直接入力しても取れません。

### `app/api/admin/menus/route.ts`

管理メニュー一覧・作成 API です。

```ts
const auth = await requireShopId();
if (!auth.ok) {
    return auth.res;
}
```

- すべての管理操作の入口で認証と店舗確認をします。

```ts
const menus = await prisma.menuItem.findMany({
    where: { shopId: auth.shopId },
});
```

- 自店舗メニューだけ取得します。

```ts
const created = await prisma.$transaction(async (tx) => { ... });
```

- MenuItem と MenuItemAllergen を一貫して作成します。

### `app/api/admin/menus/[menuId]/route.ts`

管理メニュー単体 API です。

```ts
const existing = await prisma.menuItem.findFirst({
    where: { id: menuId, shopId: auth.shopId },
});
```

- IDOR 対策の中心です。
- menuId だけでなく shopId も見るため、他店舗データを更新できません。

### `app/api/admin/shop/route.ts`

管理店舗 API です。

```ts
const shop = await prisma.shop.update({
    where: { id: auth.shopId },
    data: { name, description, address, ... },
});
```

- body の shopId は使いません。
- 認証済み shopId の店舗だけ更新します。

### `app/api/menus/[menuId]/route.ts`

公開メニュー API です。ログイン不要ですが、`isPublished: true` のメニューだけ返します。

### `prisma/schema.prisma`

DB 設計の中心です。`User`, `Shop`, `MenuItem`, `Allergen`, `MenuItemAllergen`, `AdminInvite`, `AuditLog` を定義します。

### `lib/db.ts`

Prisma Client 初期化です。開発中の接続数増加を防ぐため、`globalThis` に保持します。

### `proxy.ts`

Clerk middleware の対象を管理画面と管理 API に限定します。

### `lib/validators/admin-auth.ts` / `lib/validators/admin-input.ts`

入力検証です。zod は認証・登録系で使い、メニュー・店舗編集では helper で文字列や数値を検証します。

## 24. データの流れを具体例で理解する

### 例1：利用者がメニュー詳細を見る

1. 利用者が `/shops/shop123/menus/menu456` を開く。
2. `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx` が動く。
3. params から `shopId = shop123`, `menuId = menu456` を取得する。
4. `prisma.menuItem.findFirst({ where: { id: menuId, shopId, isPublished: true } })` で MenuItem を取得する。
5. `allergenLinks` から MenuItemAllergen と Allergen を取得する。
6. `buildAllergenRows()` で29品目を整える。
7. `PublicMenuDetailBodyClient` に渡して画面表示する。

### 例2：店舗管理者がメニューを保存する

1. 管理者が Clerk でログインする。
2. `/admin/menus/menu456/edit` を開く。
3. Server Component が認証済み shopId でメニューを取得する。
4. フォームを変更する。
5. 保存ボタンを押す。
6. `fetch("/api/admin/menus/menu456", { method: "PUT" })` で API に送る。
7. API で `requireShopId()` を呼ぶ。
8. DB でログインユーザーに対応する Shop を取得する。
9. `where: { id: menuId, shopId: auth.shopId }` で所有確認する。
10. MenuItem を更新する。
11. MenuItemAllergen を更新する。
12. 結果を JSON で返す。
13. 画面に保存完了を表示し、必要なら `router.refresh()` で再取得する。

### 例3：他店舗のメニューを不正に更新しようとした場合

1. 攻撃者が別の menuId を指定する。
2. API がログインユーザーの shopId を取得する。
3. `where: { id: menuId, shopId: auth.shopId }` で探す。
4. 他店舗メニューなので見つからない。
5. 404 を返す。
6. 更新されない。

## 25. よくあるエラーと原因

### `401 Unauthorized`

- 原因: 未ログインで管理 API を叩いた。
- どこを見るか: `app/api/admin/_utils.ts` の `requireShopId()`。
- どう直すか: Clerk でログインする。
- 直るとどうなるか: 管理 API が処理を続行する。

### `403 Forbidden`

- 原因: 店舗未作成、ポートフォリオモード、Origin 不一致、登録制限など。
- どこを見るか: `requireShopId()`, `requirePortfolioMutationAccessApi()`, `enforceSameOriginAdminMutation()`。
- どう直すか: 店舗セットアップ、環境変数、送信元、権限を確認する。
- 直るとどうなるか: 更新 API が実行できる。

### `404 Not Found`

- 原因: 対象データがない、非公開、他店舗の ID を指定した。
- どこを見るか: `findFirst({ where: { id, shopId } })`。
- どう直すか: URL の ID、公開状態、所有店舗を確認する。
- 直るとどうなるか: 対象画面または JSON が返る。

### `500 Internal Server Error`

- 原因: 予期しない例外、環境変数不足、Blob 失敗など。
- どこを見るか: API の catch、サーバーログ。
- どう直すか: ログを見て根本原因を直す。
- 直るとどうなるか: 正常レスポンスが返る。

### Prisma の接続エラー

- 原因: `DATABASE_URL` が間違っている、DB が起動していない、ネットワーク不通。
- どこを見るか: `.env`, `.env.example`, `lib/db-errors.ts`。
- どう直すか: DB URL と接続先を確認する。
- 直るとどうなるか: Server Component や API が DB データを取得できる。

### Clerk の環境変数未設定

- 原因: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` や `CLERK_SECRET_KEY` がない。
- どこを見るか: `.env.example`, Clerk Dashboard。
- どう直すか: 正しいキーを環境変数に設定する。
- 直るとどうなるか: ログイン・登録が動く。

### Vercel Blob token 未設定

- 原因: `BLOB_READ_WRITE_TOKEN` がない。
- どこを見るか: `lib/upload-images.ts`。
- どう直すか: Vercel Blob の read-write token を設定する。
- 直るとどうなるか: 画像アップロードが成功する。

### `useState` を Server Component で使った

- 原因: `"use client"` がないファイルで React state を使った。
- どこを見るか: エラーが出たコンポーネント。
- どう直すか: Client Component に切り出す、またはファイル先頭に `"use client"` を付ける。
- 直るとどうなるか: ブラウザ側で状態管理できる。

### `window` を Server Component で使った

- 原因: サーバーには `window` がない。
- どこを見るか: `window`, `localStorage`, `document` を使っている箇所。
- どう直すか: Client Component に移す。
- 直るとどうなるか: ブラウザ専用 API が使える。

### API のURLを間違えた

- 原因: `fetch("/api/admin/menu")` のように実在しない URL を呼んだ。
- どこを見るか: `app/api/` の route.ts。
- どう直すか: 実在する URL に合わせる。
- 直るとどうなるか: API が呼ばれる。

### menuId が undefined

- 原因: URL params が取れていない、リンク生成が間違っている。
- どこを見るか: `[menuId]` page/API の params。
- どう直すか: Link の href と params 処理を確認する。
- 直るとどうなるか: 対象メニューを取得できる。

### shopId が一致しない

- 原因: 他店舗の menuId を指定している、DB の所有関係が不整合。
- どこを見るか: `Shop.ownerClerkUserId`, `MenuItem.shopId`。
- どう直すか: DB データとログインユーザーを確認する。
- 直るとどうなるか: 自店舗データだけ操作できる。

### migration を実行していない

- 原因: schema と DB の実テーブルがずれている。
- どこを見るか: `prisma/migrations/`, `prisma/schema.prisma`。
- どう直すか: `npx prisma migrate deploy` または開発環境では適切な migrate を実行する。
- 直るとどうなるか: Prisma Client と DB 構造が一致する。

## 26. 面接で説明できるようにする章

なぜ Next.js を使ったのですか？

> 公開画面と管理画面、さらに API Route を同じプロジェクトで扱いたかったためです。Server Component で DB 取得をサーバー側に寄せられ、管理 API も同じ App Router 配下で実装できます。

なぜ React 単体ではなく Next.js なのですか？

> React 単体だとルーティング、サーバー側 API、認証チェック、DB アクセスの構成を別途組む必要があります。Next.js なら画面、API、サーバー側処理を一つの構成で扱えます。

なぜ Clerk を使ったのですか？

> 自作認証はパスワード管理やセッション管理のリスクが高いため、認証部分は Clerk に任せました。アプリ側では Clerk userId と DB の User / Shop を紐づけ、認可を実装しています。

なぜ Supabase Auth ではなく Clerk なのですか？

> この実装では Clerk の Next.js 連携、ログイン UI、セッション取得を使っています。Supabase Auth でも可能ですが、このプロジェクトでは認証を Clerk に寄せ、DB は Prisma/PostgreSQL で管理する構成にしました。

なぜ Prisma を使ったのですか？

> TypeScript から型安全に DB を操作し、schema と migration で DB 設計を管理しやすくするためです。

なぜ PostgreSQL を使ったのですか？

> 店舗、メニュー、アレルゲン、中間テーブルのようなリレーションが多いデータを扱うため、リレーショナル DB が適しています。

DB設計で工夫した点は？

> MenuItem と Allergen を直接カラムで持たせず、中間テーブル MenuItemAllergen で status を持たせました。品目追加や表示順管理がしやすく、未設定を UNKNOWN として扱えます。

認証と認可はどう実装しましたか？

> 認証は Clerk で行い、サーバー側で `auth()` から userId を取得します。認可は DB でその userId に紐づく Shop を取得し、管理 API の DB 操作に `shopId` 条件を入れて実装しています。

他店舗のデータを更新できないようにどうしていますか？

> クライアントから shopId を受け取らず、サーバー側でログインユーザーの shopId を決めています。メニュー更新では `where: { id: menuId, shopId: auth.shopId }` で対象を確認しています。

IDOR対策はしていますか？

> はい。他人の menuId を指定しても、ログインユーザーの shopId と一致しない限り取得・更新できないようにしています。

アレルゲン情報はどう設計していますか？

> Allergen マスタと MenuItemAllergen 中間テーブルで管理しています。status は CONTAINS / FREE / MAY_CONTAIN / UNKNOWN の4値です。

UNKNOWN を入れた理由は？

> 未確認を「含まない」と誤解させないためです。未設定は UNKNOWN として扱い、公開時には未設定が残っていないかサーバー側で確認しています。

画像保存はどうしていますか？

> Vercel Blob に画像本体を保存し、DB には URL を保存しています。アップロード API ではログイン確認、MIME、サイズ、保存 path を確認しています。

セキュリティで意識した点は？

> 管理画面と管理 API の認証、shopId のサーバー側解決、IDOR 対策、入力検証、画像 URL 制限、環境変数管理、エラー情報の出しすぎ防止を意識しています。

苦労した点は？

> Clerk のユーザー ID と既存 DB の User / Shop をどう安全につなぐか、また公開画面と管理画面で認証の範囲を分ける点です。

今後改善したい点は？

> テスト追加、E2E テスト、error.tsx/loading.tsx の整備、古い NextAuth 文書の整理、アレルギー注意表示や利用規約の強化です。

AIを使ってどこを開発しましたか？

> コード生成やレビュー補助に AI を使った場合でも、認証・認可・DB 設計・セキュリティ判断は実装を読み、自分で説明できる状態にする必要があります。

自分で理解して実装・判断した部分はどこですか？

> shopId を body から受け取らず、Clerk userId からサーバー側で解決する設計、MenuItemAllergen による多対多設計、UNKNOWN の扱いは自分で説明すべき中心です。

## 27. 現在の弱点・改善点

### 古いNextAuth文書が残っている可能性

- 何が問題か: 読む人が現在の正を誤解する。
- なぜ問題か: 実装は Clerk 前提なので、NextAuth 前提の説明は混乱を生む。
- どのファイルを見るべきか: `README.md`, `docs/`, 古い認証関連記述。
- どう直すとよいか: Clerk 前提に統一し、移行メモとして残すなら明記する。
- 優先度: 高。

### Clerk移行後の説明不足

- 何が問題か: Clerk userId と DB User / Shop の関係が分かりにくい。
- なぜ問題か: 認証と認可の中心だから。
- どのファイルを見るべきか: `lib/auth/getCurrentAppUser.ts`, `lib/admin-auth.ts`。
- どう直すとよいか: 図とフローを README または docs に追加する。
- 優先度: 高。

### AuditLog の確認余地

- 何が問題か: AuditLog model はあり、多くの API から書かれているが、一覧・確認画面は限定的。
- なぜ問題か: 監査ログは保存するだけでなく確認できる運用が必要。
- どのファイルを見るべきか: `prisma/schema.prisma`, `lib/audit-log.ts`。
- どう直すとよいか: 運営管理者向けログ閲覧やフィルタを追加する。
- 優先度: 中。

### zod と helper の整理

- 何が問題か: 認証系は zod、メニュー・店舗系は helper で分かれている。
- なぜ問題か: ルールが増えると把握しにくい。
- どのファイルを見るべきか: `lib/validators/admin-auth.ts`, `lib/validators/admin-input.ts`。
- どう直すとよいか: メニュー・店舗更新も zod schema 化を検討する。
- 優先度: 中。

### テスト不足

- 何が問題か: 認証・認可・公開条件の回帰を自動検出しにくい。
- なぜ問題か: shopId 所有確認のミスは重大。
- どのファイルを見るべきか: `app/api/admin/menus/[menuId]/route.ts`, `app/api/admin/shop/route.ts`。
- どう直すとよいか: API 単体テスト、IDOR テスト、公開/非公開テストを追加する。
- 優先度: 高。

### E2Eテスト不足

- 何が問題か: ログインからメニュー保存までの実画面フローが壊れても気づきにくい。
- なぜ問題か: Next.js/Clerk/DB/API がつながる部分だから。
- どう直すとよいか: Playwright などで管理者ログイン、メニュー作成、公開表示を検証する。
- 優先度: 中。

### error.tsx / loading.tsx 不足

- 何が問題か: 一部 loading はあるが、全体的なエラー UI がまだ限定的。
- なぜ問題か: DB 接続失敗や API 失敗時のユーザー体験に影響する。
- どう直すとよいか: 主要 route に `error.tsx` と `loading.tsx` を追加する。
- 優先度: 中。

### ISR / revalidate 未活用の説明注意

- 何が問題か: `revalidate = 60` はあるが、ISR 戦略を大きく語るには検証が必要。
- なぜ問題か: 面接で過剰説明になる。
- どう直すとよいか: キャッシュ戦略と更新反映時間を明文化する。
- 優先度: 低。

### アレルギー事故リスクへの注意表示

- 何が問題か: アプリ情報だけで安全を保証できない。
- なぜ問題か: アレルギー情報は高リスク情報。
- どう直すとよいか: 注意喚起、免責、店舗確認導線を強化する。
- 優先度: 高。

## 28. 学習ロードマップ

1. HTML / CSS: `app/globals.css`, 各 `page.tsx` の JSX を見る。
2. JavaScript: `components/public/*.tsx` の配列 map、条件分岐を見る。
3. TypeScript: `type Params`, `type MenuCreateBody` など型定義を見る。
4. React: `components/admin/menu/MenuEditClient.tsx` の state とイベントを見る。
5. Next.js App Router: `app/` の page/layout/route 構成を見る。
6. HTTP / API: `app/api/admin/menus/route.ts` の GET/POST を読む。
7. DB / PostgreSQL: `prisma/schema.prisma` の model と relation を読む。
8. Prisma: `lib/db.ts` と `prisma.xxx.findMany()` の実例を見る。
9. 認証 / 認可: `lib/admin-auth.ts` と `app/api/admin/_utils.ts` を読む。
10. Clerk: `app/admin/layout.tsx`, `proxy.ts`, `lib/auth/getCurrentAppUser.ts` を読む。
11. セキュリティ: `lib/admin-api-security.ts`, `lib/image-url-policy.ts` を読む。
12. Vercel デプロイ: `.env.example`, `next.config.ts`, Vercel 環境変数を確認する。
13. ポートフォリオ説明: このドキュメントの 26 章を自分の言葉で言えるようにする。

## 29. 用語集

- Next.js: React で画面、API、サーバー処理を作るフレームワーク。
- React: UI をコンポーネントで作る JavaScript ライブラリ。
- TypeScript: JavaScript に型を追加した言語。
- App Router: Next.js の `app/` ディレクトリを使うルーティング方式。
- Route Handler: `app/api/.../route.ts` に書く API 処理。
- Server Component: サーバー側で動く React コンポーネント。
- Client Component: ブラウザ側で動く React コンポーネント。
- API: 画面などから呼ぶデータ取得・更新の入口。
- HTTP: ブラウザとサーバーが通信するための約束。
- GET: データ取得。
- POST: 作成や処理実行。
- PUT: 既存データ更新。
- DELETE: 削除。
- DB: データベース。データを保存する場所。
- PostgreSQL: リレーショナルデータベース。
- Prisma: TypeScript から DB を操作する ORM。
- ORM: SQL を直接書かずに DB を操作する仕組み。
- migration: DB 構造変更の履歴。
- schema: DB の構造定義。
- model: Prisma schema のテーブル定義。
- relation: テーブル同士の関係。
- foreign key: 外部キー。別テーブルの ID を参照する列。
- primary key: 主キー。レコードを一意に識別する列。
- enum: 決められた値だけを許す型。
- Clerk: 認証サービス。
- 認証: 誰がログインしているか確認すること。
- 認可: その人が操作してよいか確認すること。
- session: ログイン状態を保持する仕組み。
- Cookie: ブラウザに保存されリクエストで送られる小さなデータ。
- middleware: リクエストがページや API に届く前に動く処理。
- environment variable: 環境変数。秘密情報や環境ごとの設定。
- Vercel: Next.js のデプロイ先としてよく使われるサービス。
- Vercel Blob: 画像などのファイルストレージ。
- validation: 入力検証。
- zod: TypeScript で入力検証するライブラリ。
- IDOR: 他人の ID を指定するだけで他人のデータを見たり変更できてしまう問題。
- XSS: 悪意ある JavaScript をページに埋め込む攻撃。
- CSRF: ログイン済みユーザーに意図しないリクエストを送らせる攻撃。
- SSR: リクエスト時にサーバーで HTML を作る方式。
- SSG: ビルド時に静的 HTML を作る方式。
- ISR: 静的ページを一定時間ごとに再生成する方式。
- CSR: ブラウザ側で描画する方式。

## 30. 最後のまとめ

このアプリの全体像は、飲食店がメニューごとのアレルゲン情報を管理し、利用者が公開ページで確認できる Next.js アプリです。

DB の中心設計は、`Shop`、`MenuItem`、`Allergen`、`MenuItemAllergen` です。MenuItem と Allergen を中間テーブルでつなぎ、各品目の status を保存します。

認証の中心設計は Clerk です。Clerk の userId を DB の `User.clerkUserId` や `Shop.ownerClerkUserId` と紐づけます。

API の中心設計は、公開 API と管理 API を分けることです。公開 API は読み取り専用、管理 API は Clerk 認証と shopId 認可が必須です。

セキュリティの中心設計は、shopId をクライアントから信じず、サーバー側でログインユーザーから決めることです。これにより IDOR を防ぎます。

面接で一番説明すべきポイントは、「認証は Clerk、認可は DB の Shop 所有確認、更新は必ず `shopId` で絞る」という点です。

今後の改善ポイントは、テスト、E2E、古い認証文書整理、エラー画面整備、アレルギー注意表示の強化です。
