# ClearAllergy コードベース教材ドキュメント

このドキュメントは、`ClearAllergy` のコードベースを初学者向けに「読める形」に分解した教材です。  
単なる一般論ではなく、実際のファイル構成・関数・API・認証・DB 設計に寄せて説明します。  
コード上で確認できることは断定し、コードから断定できないことは `未確認` または `推測` と明記します。

---

## 0. このプロジェクトを一言でいうと何か

ClearAllergy は、**飲食店が自分のメニューのアレルゲン情報を登録し、それを一般利用者が見やすく確認できる Web アプリ**です。

このアプリには、はっきり 2 つの利用者がいます。

- **店舗側（管理者）**
    - 自分の店舗アカウントでログインする
    - 店舗情報を編集する
    - メニューを作る
    - 各メニューに対して「アレルゲン 28 品目」を設定する
    - 公開する / 非公開にする
- **利用者側（一般ユーザー）**
    - ログインせずに店舗ページやメニューページを見る
    - 価格、原材料、アレルゲン情報を確認する
    - 自分が避けたいアレルゲンをブラウザに保存し、警告表示を受ける

このプロジェクトが解決したい課題は、README の表現を借りると **「聞かなくても分かる外食体験を増やす」** ことです。  
食物アレルギーがある人は、外食のたびに店員へ確認しないと安心できない場面があります。  
そこで、店舗が自分で情報を更新できる仕組みを用意し、利用者は公開ページから事前確認できるようにしています。

管理者側と公開側の違いは、かなり明確です。

- **管理者側**はログインが必要
- **公開側**はログイン不要
- **管理者側**は「変更する」
- **公開側**は「見る」
- **管理者側**は NextAuth による認証と `shopId` によるアクセス制御を使う
- **公開側**は誰でも見られるが、`isPublished: true` のデータだけ出す

---

## 1. 使用技術の全体像

まず、このプロジェクトの技術を「何のために使うか」で捉えると理解しやすくなります。  
大きく分けると、次の 5 層です。

1. **画面を作る技術**: Next.js / React / Tailwind CSS
2. **型安全に書く技術**: TypeScript
3. **認証を扱う技術**: NextAuth / bcrypt
4. **DB を扱う技術**: Prisma / PostgreSQL / Neon
5. **デプロイ・画像保存**: Vercel / Vercel Blob

### 技術一覧表

| 技術名                    | 何のために使うか                                                 | このプロジェクト内ではどこで使われているか                                             | 初学者向けのやさしい説明                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Next.js 16.1.6            | React アプリに、ルーティング、サーバー描画、API ルートなどを足す | `app` ディレクトリ全体、`app/api`、`middleware.ts`                                     | React だけだと「画面部品」を作る道具が中心です。Next.js はそれに「URL ごとのページ」「サーバー処理」「デプロイしやすさ」を足した土台です。 |
| React 19.2.3              | UI をコンポーネント単位で組み立てる                              | `components` 配下全体、`page.tsx` の JSX                                               | React は「画面を部品化して組み立てる考え方」です。ボタンやフォームやカードを部品として再利用できます。                                     |
| TypeScript 5              | 型を付けてバグを減らす                                           | 全 `.ts` / `.tsx` ファイル                                                             | 型は「この値は文字列か、数値か、配列か」を先に決める仕組みです。JS より安全に読めます。                                                    |
| Tailwind CSS 4            | CSS をクラス名で素早く書く                                       | JSX の `className`、`tailwind.config.ts`、`app/globals.css`                            | `bg-white` や `rounded-xl` のような短いクラスを並べて見た目を作る方法です。                                                                |
| NextAuth.js 4.24.13       | ログインとセッション管理                                         | `lib/auth.ts`、`app/api/auth/[...nextauth]/route.ts`、`lib/admin-auth.ts`              | 認証の面倒な処理をまとめてくれるライブラリです。このプロジェクトでは「メールアドレス + パスワード」でログインします。                      |
| Prisma 6.19.2             | DB を TypeScript から扱う ORM                                    | `lib/db.ts`、`prisma/schema.prisma`、各 `prisma.*` 呼び出し                            | ORM は「SQL を毎回手書きしなくても、コードから DB を扱える仕組み」です。                                                                   |
| PostgreSQL                | 実データを保存する RDB                                           | `prisma/schema.prisma` の `provider = "postgresql"`                                    | RDB は「表の形でデータを整理して保存する DB」です。ユーザー、店舗、メニューの関係管理が得意です。                                          |
| Neon                      | PostgreSQL 互換のホスティング先                                  | コード上の Neon 専用 SDK は未確認。`DATABASE_URL` に入る接続先として使う想定           | Neon は「PostgreSQL をクラウドで簡単に使えるサービス」です。Prisma からは普通の PostgreSQL とほぼ同じように見えます。                      |
| Vercel                    | Next.js アプリのデプロイ先                                       | README、`.vercel` ディレクトリ、`@vercel/blob` 利用                                    | 作った Next.js アプリを公開しやすいホスティングです。                                                                                      |
| bcrypt                    | パスワードのハッシュ化と照合                                     | `lib/auth.ts`、`app/api/admin/register/route.ts`、`prisma/seed.ts`                     | パスワードをそのまま保存せず、復元しにくい形に変換するための道具です。                                                                     |
| Zod                       | バリデーション用ライブラリ                                       | **未使用**。`package.json` とコード検索で未確認                                        | よく使われる入力チェック用ライブラリですが、このプロジェクトでは使わず、手書き関数で検証しています。                                       |
| Vercel Blob               | 画像ファイルの保存先                                             | `app/api/admin/upload-menu-image/route.ts`、`app/api/admin/upload-shop-image/route.ts` | 画像をサーバーのローカルディスクではなく、クラウド保存に置くための仕組みです。                                                             |
| API Route / Route Handler | 画面から呼べるサーバー API を作る                                | `app/api/**/route.ts`                                                                  | App Router では `pages/api` ではなく `app/api/.../route.ts` で API を定義します。                                                          |
| Server Component          | サーバー側で実行される React コンポーネント                      | `app/page.tsx`、`app/(public)/shops/page.tsx` など                                     | ブラウザではなくサーバー側で動き、DB を直接呼べます。                                                                                      |
| Client Component          | ブラウザ側で動く React コンポーネント                            | `components/admin/**`、`components/public/**` の多く                                   | `useState` や `window` や `fetch`、`localStorage` を使うときに必要です。                                                                   |
| localStorage              | 一般利用者のアレルゲン設定をブラウザ保存する                     | `lib/public-allergen-preferences.ts`、公開側 Client Component                          | サーバーの DB ではなく、今使っているブラウザの中だけに保存する仕組みです。                                                                 |
| QRCode React              | 店舗 URL の QR コード生成                                        | `components/admin/shop/ShopQrCard.tsx`                                                 | 公開 URL をスマホで開きやすくするために QR コードを表示しています。                                                                        |

### このプロジェクトで特に重要なつながり

このプロジェクトの理解で本当に大事なのは、技術を別々に覚えることではなく、**1 本の流れとしてつなげて理解すること**です。

流れとしてはこうです。

1. **Next.js** が URL ごとに画面と API を分ける
2. **React** が画面部品を作る
3. **Client Component** がフォーム入力や `fetch` を担当する
4. **NextAuth** がログイン状態を確認し、`shopId` をセッションに入れる
5. **Route Handler (`route.ts`)** が受け取ったリクエストを処理する
6. **Prisma** が TypeScript から DB 操作を行う
7. **PostgreSQL** が実データを保存する
8. **Neon** を使う場合は、その PostgreSQL をホスティングする

---

## 2. Next.js とは何か、このプロジェクトではどう書いているか

## 2-1. Next.js の基本

Next.js は、React をベースにしたフレームワークです。  
フレームワークとは、アプリを作るときの「土台」や「約束ごと」のセットです。

React 単体では、主に「画面部品をどう書くか」が中心です。  
一方で Web アプリを作るには、画面部品だけでは足りません。

- URL ごとのページ
- データ取得
- サーバーでの処理
- 認証
- API
- 本番公開

こういった「アプリ全体の骨組み」を Next.js が整えてくれます。

このプロジェクトでは、Next.js の中でも **App Router** を使っています。

## 2-2. React との違い

React と Next.js の違いを、このプロジェクトに寄せて言うと次のようになります。

| 項目                   | React                                           | Next.js                                                                  |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| 主な役割               | 画面部品を作る                                  | 画面部品を使ってアプリ全体を組み立てる                                   |
| ルーティング           | 自分で用意することが多い                        | `app` ディレクトリで自動ルーティング                                     |
| API                    | 別サーバーが必要なことが多い                    | `app/api/**/route.ts` で同じプロジェクト内に書ける                       |
| サーバー処理           | 標準では弱い                                    | Server Component で直接 DB に触りやすい                                  |
| このプロジェクトでの例 | `components/admin/menu/MenuEditClient.tsx` など | `app/(public)/shops/[shopId]/page.tsx` や `app/api/admin/menus/route.ts` |

つまり、React は「部品」、Next.js は「部品をどこに置き、どうつなぐかまで含めた全体設計」です。

## 2-3. App Router とは何か

App Router とは、`app` ディレクトリを基準にルーティングする新しい仕組みです。  
ルーティングとは、**URL と画面 / API の対応付け**のことです。

たとえばこのプロジェクトでは、次のように対応します。

- `app/page.tsx` → `/`
- `app/(public)/shops/page.tsx` → `/shops`
- `app/(public)/shops/[shopId]/page.tsx` → `/shops/:shopId`
- `app/admin/(auth)/login/page.tsx` → `/admin/login`
- `app/api/admin/menus/route.ts` → `/api/admin/menus`

ここで重要なのは、**フォルダ構造そのものが URL 設計になる**ことです。  
だから、このプロジェクトを読むときは、まず `app` を「URL の地図」として見るのが正解です。

## 2-4. `app` ディレクトリでルーティングするとはどういうことか

App Router では、フォルダとファイルに意味があります。

| ファイル / フォルダ       | 意味                          |
| ------------------------- | ----------------------------- |
| `page.tsx`                | その URL で表示するページ本体 |
| `layout.tsx`              | その階層以下で共通して使う枠  |
| `route.ts`                | その URL で受ける API 処理    |
| `[menuId]` のような角括弧 | 動的な URL パラメータ         |
| `(public)` のような丸括弧 | URL には出ない整理用グループ  |

このプロジェクトでの具体例を見ます。

- `app/(public)/shops/[shopId]/page.tsx`
    - URL は `/shops/abc`
    - `(public)` は URL に出ない
    - `[shopId]` の部分に動的な店舗 ID が入る
- `app/api/admin/menus/[menuId]/route.ts`
    - URL は `/api/admin/menus/abc`
    - `GET`, `PUT`, `DELETE` をこの 1 ファイルに書ける

## 2-5. `page.tsx`, `layout.tsx`, `route.ts` の違い

これは初学者がかなり混乱しやすいので、はっきり分けます。

| 名前         | 何を返すか              | 何のためにあるか                         | このプロジェクトでの例                                        |
| ------------ | ----------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| `page.tsx`   | 画面（HTML/JSX）        | ユーザーが見るページを作る               | `app/(public)/shops/page.tsx`                                 |
| `layout.tsx` | 画面を包む共通枠        | ヘッダーやサイドバーを共通化する         | `app/(public)/layout.tsx`、`app/admin/(dashboard)/layout.tsx` |
| `route.ts`   | レスポンス（JSON など） | API としてデータを返したり保存したりする | `app/api/admin/menus/route.ts`                                |

とても大事な言い方をすると、

- `page.tsx` は **人が見るページ**
- `route.ts` は **プログラムが呼ぶ入口**

です。

この違いをこのプロジェクトで見ると、

- 店舗一覧を見る → `app/(public)/shops/page.tsx`
- メニューを保存する → `app/api/admin/menus/[menuId]/route.ts`

となります。

## 2-6. Server Component と Client Component の違い

App Router では、React コンポーネントはデフォルトで **Server Component** です。  
Server Component とは、**サーバー側で実行されるコンポーネント**です。

このプロジェクトでは、次のような Server Component があります。

- `app/page.tsx`
- `app/(public)/shops/page.tsx`
- `app/(public)/shops/[shopId]/page.tsx`
- `app/admin/(dashboard)/menus/page.tsx`
- `app/admin/(dashboard)/shop/page.tsx`

これらの特徴は、**中でそのまま Prisma を呼んでいる**ことです。

たとえば `app/(public)/shops/page.tsx` では `prisma.shop.findMany(...)` を直接呼びます。  
これはサーバーで動くから可能です。ブラウザで直接 DB には触れません。

一方、Client Component はブラウザで動きます。  
このプロジェクトでは、次のような処理が Client Component にあります。

- 入力フォームの状態管理
- `useState`, `useEffect`
- `fetch`
- `window.location.href`
- `window.localStorage`
- `navigator.share`
- `navigator.clipboard`
- `signIn`, `signOut`

たとえば以下は Client Component です。

- `components/admin/auth/AdminLoginPageClient.tsx`
- `components/admin/menu/NewMenuForm.tsx`
- `components/admin/menu/MenuEditClient.tsx`
- `components/public/UserAllergenPreferenceClient.tsx`

## 2-7. `"use client"` が必要な理由

`"use client"` は、「このファイルはブラウザで動かしてください」という宣言です。

これが必要な理由は、ブラウザ専用の機能を使うからです。  
このプロジェクトで実際に使っているブラウザ専用機能は次の通りです。

- `useState`, `useEffect`
- `useRouter`
- `window`
- `localStorage`
- `navigator.share`
- `navigator.clipboard`
- `signIn`, `signOut`

たとえば `components/public/UserAllergenPreferenceClient.tsx` では `localStorage` を使います。  
`localStorage` はサーバーには存在しないので、Server Component では動きません。  
だから `"use client"` が必要です。

## 2-8. このプロジェクトの書き方の特徴

このプロジェクトには、初学者が読むときに注目すべき特徴があります。

### 1. 読み取りは Server Component で直接 Prisma を呼ぶ場面が多い

たとえば以下です。

- `app/page.tsx`
- `app/(public)/shops/page.tsx`
- `app/(public)/shops/[shopId]/page.tsx`
- `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx`
- `app/admin/(dashboard)/menus/page.tsx`
- `app/admin/(dashboard)/shop/page.tsx`

これは「表示のための読み取り」はサーバーで直接行い、無駄な `fetch` を減らす考え方です。

### 2. 変更処理は API に寄せている

作成・更新・削除・アップロードは `fetch` で API を呼びます。

- 登録: `/api/admin/register`
- メニュー作成: `/api/admin/menus`
- メニュー更新: `/api/admin/menus/[menuId]`
- 店舗更新: `/api/admin/shop`
- 画像アップロード: `/api/admin/upload-menu-image`, `/api/admin/upload-shop-image`

### 3. 認証情報として `shopId` をセッションに持たせている

このプロジェクトは「1 店舗 1 アカウント」の設計です。  
そのため、ログイン後のセッションに `shopId` を入れておき、API 側では毎回その `shopId` を使って「この店のデータだけ触れる」ようにしています。

### 4. App Router の Route Group を使って公開側と管理側を整理している

- `(public)` は一般公開用
- `admin/(auth)` はログイン / 登録用
- `admin/(dashboard)` はログイン後管理画面用

これは URL を変えずに、コード上の責務だけをきれいに分離するためです。

### 5. `params` や `searchParams` を `Promise` として受けている箇所がある

たとえば `app/(public)/shops/page.tsx` や `app/admin/(dashboard)/menus/[menuId]/edit/page.tsx` では、`params` や `searchParams` が `Promise` になる前提で `await` しています。  
これは Next.js の最近の App Router の書き方に合わせている部分です。

---

## 3. ディレクトリ構造を上から順に解説

まず、ルートから見た大まかな構造を簡略化して書くとこうなります。

```text
ClearAllergy/
├── app/
├── components/
├── lib/
├── prisma/
├── public/
├── scripts/
├── document/
├── middleware.ts
├── next-auth.d.ts
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

## 3-1. ルートディレクトリ

ルートには「アプリ全体の設定」と「大分類フォルダ」があります。

| 名前             | 役割                                                      |
| ---------------- | --------------------------------------------------------- |
| `app`            | Next.js App Router の本体。ページ、レイアウト、API を置く |
| `components`     | 再利用できる UI 部品を置く                                |
| `lib`            | 認証、DB、バリデーション、整形などの共通ロジックを置く    |
| `prisma`         | DB スキーマ、マイグレーション、seed を置く                |
| `public`         | 静的ファイル置き場                                        |
| `scripts`        | 開発補助スクリプト                                        |
| `document`       | README 用画像など、ドキュメント資産                       |
| `middleware.ts`  | 管理画面ページへのアクセス制御                            |
| `next-auth.d.ts` | NextAuth の型拡張                                         |
| `package.json`   | 使用ライブラリ、スクリプト定義                            |

### ルートで注目すべきこと

- アプリ本体は `app` に集中している
- 再利用部品は `components` に分離している
- 共通処理は `lib` に寄せている
- DB 設計は `prisma/schema.prisma` が中心
- 認証は `lib/auth.ts` と `app/api/auth/[...nextauth]/route.ts` に分かれている

## 3-2. `app`

`app` はこのプロジェクトで最重要のフォルダです。  
ここを見ると、**URL と画面 / API の対応**が分かります。

このプロジェクトでは `app` がさらに次の責務に分かれています。

- 公開ページ
- 管理画面
- API
- 共通レイアウト

## 3-3. `components`

`components` は「再利用 UI 部品置き場」です。

このプロジェクトでは以下のように分けています。

- `components/admin`
    - 管理画面で使う UI
- `components/public`
    - 公開画面で使う UI
- `components/layout`
    - レイアウト共通部品

これを分ける理由は、**ページファイルを薄く保つため**です。  
`page.tsx` に全部書くと、URL の責務と UI の責務が混ざって読みにくくなるからです。

## 3-4. `lib`

`lib` は「画面ではない共通ロジック」を置く場所です。  
このプロジェクトではかなり役割分担がきれいです。

| ファイル                             | 役割                                     |
| ------------------------------------ | ---------------------------------------- |
| `lib/auth.ts`                        | NextAuth の設定本体                      |
| `lib/admin-auth.ts`                  | セッション取得や `shopId` 取得の補助     |
| `lib/db.ts`                          | Prisma Client の共有                     |
| `lib/admin-validators.ts`            | 管理画面 API の入力整形                  |
| `lib/allergens.ts`                   | アレルゲン状態の定数・表示補助           |
| `lib/formatters.ts`                  | 日付や価格の表示整形                     |
| `lib/public-allergen-preferences.ts` | 一般ユーザー向け設定の localStorage 操作 |

`lib` に置く理由は、**UI と切り離して使い回せるから**です。

## 3-5. `prisma`

`prisma` は DB 関連の中心です。

| 名前            | 役割                  |
| --------------- | --------------------- |
| `schema.prisma` | テーブル設計の元      |
| `migrations/`   | DB に反映した変更履歴 |
| `seed.ts`       | 初期データ投入        |

このフォルダを見ると、「アプリがどんなデータを持っているか」が分かります。  
画面を読む前にここを読むと、全体像がつかみやすくなります。

## 3-6. `public`

`public` は静的ファイル置き場です。  
確認できた範囲では `public/images` フォルダだけがあり、**中身は未確認というより現在空に見えます**。  
少なくとも現在の主要画像保存は `public` ではなく **Vercel Blob** に寄っています。

これは重要です。  
つまりこのプロジェクトは「画像をリポジトリに同梱する」のではなく、「アップロード後の URL を保存する」方式です。

## 3-7. `scripts`

`scripts` はアプリ本体ではなく、開発補助用です。

| ファイル                                | 役割                         |
| --------------------------------------- | ---------------------------- |
| `scripts/create-test-user.ts`           | テスト用ユーザー・店舗を作る |
| `scripts/move-menus-to-current-shop.ts` | 既存メニューを別店舗に移す   |

ここは本番アプリの導線ではなく、**開発時の作業を楽にするための道具**です。

## 3-8. `document`

`document/screenshot` に README 用スクリーンショットがあります。  
アプリの実行には直接関係しませんが、README の説明を補助しています。

## 3-9. 空フォルダ・現時点で未使用に見える場所

コードを確認した範囲では、以下は**空または実質未使用**に見えます。

- `app/add`
- `app/library`
- `app/mix`
- `app/tracks/[id]`
- `components/sonic-curator`
- `components/ui`

これらは今後の機能追加用か、作業途中の名残である可能性があります。  
ただし、**現時点の主要機能には関わっていない**と読んでよさそうです。

---

## 4. `app` ディレクトリの完全解説

## 4-1. `app` 全体の見方

このプロジェクトの `app` は、役割ごとに大きく次の 4 つに分かれています。

- `app/(public)`: 一般公開ページ
- `app/admin/(auth)`: 管理者ログイン / 登録
- `app/admin/(dashboard)`: 管理者の操作画面
- `app/api`: API

これに加えて、`app/layout.tsx` と `app/page.tsx` がアプリ全体の入口です。

## 4-2. `app/(public)`

### Route Group の意味

`(public)` の丸括弧は **Route Group** です。  
Route Group とは、「URL には出さずに、コード上だけグループ分けしたい」ときに使います。

つまり、

- フォルダ名は `(public)`
- でも URL には `/public` は出ない

という意味です。

### ここにある主な URL

| ファイル                                              | URL                            | 役割                        |
| ----------------------------------------------------- | ------------------------------ | --------------------------- |
| `app/(public)/layout.tsx`                             | なし（共通レイアウト）         | 公開側共通ヘッダー          |
| `app/(public)/shops/page.tsx`                         | `/shops`                       | 店舗一覧                    |
| `app/(public)/shops/[shopId]/page.tsx`                | `/shops/:shopId`               | 店舗詳細 + 公開メニュー一覧 |
| `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx` | `/shops/:shopId/menus/:menuId` | 公開メニュー詳細            |

### `app/(public)/layout.tsx`

公開側の共通ヘッダーを出します。  
`PublicHeader` を 1 回だけ置けば、その配下のページすべてにヘッダーが付きます。

### `app/(public)/shops/page.tsx`

公開中メニューを持つ店舗だけを DB から取得し、検索クエリ `?q=` による店舗検索にも対応しています。  
つまり、「公開側の入口として店舗一覧を出すページ」です。

### `app/(public)/shops/[shopId]/page.tsx`

特定店舗の詳細ページです。  
ここでは次の 3 種類の情報をまとめて読みます。

- 店舗情報
- その店舗の公開メニュー一覧
- アレルゲンマスタ

そのうえで、一覧表示部分は `ShopMenuListClient` に渡しています。  
これは、**データ取得はサーバー、閲覧体験の変化はクライアント**という分担です。

### `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx`

メニュー詳細ページです。  
ここでは、

- メニュー基本情報
- 原材料
- 注意書き
- アレルゲン 28 品目
- 特定原材料 8 品目の強調表示

をまとめて表示します。

また、一般ユーザーがブラウザに保存したアレルゲン設定を `MenuAllergenAlertClient` などで反映します。

## 4-3. `app/admin/(auth)`

ここは管理者の認証専用エリアです。  
ログイン前に入る場所なので、サイドバーのような管理レイアウトは持たせていません。

### 主な URL

| ファイル                             | URL               | 役割                         |
| ------------------------------------ | ----------------- | ---------------------------- |
| `app/admin/(auth)/layout.tsx`        | なし（共通枠）    | 認証ページ用の最小レイアウト |
| `app/admin/(auth)/login/page.tsx`    | `/admin/login`    | ログインページ               |
| `app/admin/(auth)/register/page.tsx` | `/admin/register` | 新規登録ページ               |

### `app/admin/(auth)/login/page.tsx`

中身はほぼ `AdminLoginPageClient` を返すだけです。  
つまり、ページファイルは URL の入口だけ担当し、実際の UI と送信処理は Client Component に分離しています。

### `app/admin/(auth)/register/page.tsx`

こちらも `AdminRegisterPageClient` を返すだけです。  
登録後は API でユーザーと店舗を作り、そのまま自動ログインする流れになっています。

## 4-4. `app/admin/(dashboard)`

ここはログイン後の管理画面です。  
公開側と違って、管理者が「変更」するためのページが入っています。

### 主な URL

| ファイル                                             | URL                         | 役割                             |
| ---------------------------------------------------- | --------------------------- | -------------------------------- |
| `app/admin/(dashboard)/layout.tsx`                   | なし（共通枠）              | 管理画面のサイドバー・レイアウト |
| `app/admin/(dashboard)/menus/page.tsx`               | `/admin/menus`              | メニュー一覧                     |
| `app/admin/(dashboard)/menus/new/page.tsx`           | `/admin/menus/new`          | 新規メニュー作成                 |
| `app/admin/(dashboard)/menus/[menuId]/edit/page.tsx` | `/admin/menus/:menuId/edit` | メニュー編集                     |
| `app/admin/(dashboard)/shop/page.tsx`                | `/admin/shop`               | 店舗情報編集                     |

### `app/admin/(dashboard)/layout.tsx`

`AdminDashboardShell` を使ってサイドバー付き画面にしています。  
これにより、`/admin/menus` と `/admin/shop` で同じ管理 UI を共有できます。

### `app/admin/(dashboard)/menus/page.tsx`

ログイン中の `shopId` を取得し、その店舗のメニュー一覧を Prisma で直接取得します。  
ここが大事で、**一覧表示は API を使わず Server Component で直接 DB を読んでいます**。

### `app/admin/(dashboard)/menus/new/page.tsx`

新規作成用ページです。  
アレルゲンマスタを先に読み、`NewMenuForm` に渡します。

### `app/admin/(dashboard)/menus/[menuId]/edit/page.tsx`

編集対象のメニューを取得し、同時にアレルゲンマスタも取得します。  
さらに `createStatusBySlug` で「各アレルゲンの初期状態」を作ってから `MenuEditClient` に渡しています。

### `app/admin/(dashboard)/shop/page.tsx`

ログイン中の店舗情報を取得し、`ShopEditClient` に初期値として渡します。

## 4-5. `app/api`

ここは画面ではなく API の入口です。  
App Router なので、`pages/api` ではなく `app/api/**/route.ts` で書かれています。

### API の大分類

| パス                                       | 役割                             |
| ------------------------------------------ | -------------------------------- |
| `app/api/auth/[...nextauth]/route.ts`      | NextAuth 本体                    |
| `app/api/admin/register/route.ts`          | 店舗アカウント新規登録           |
| `app/api/admin/menus/route.ts`             | 管理者メニュー一覧 / 作成        |
| `app/api/admin/menus/[menuId]/route.ts`    | 管理者メニュー取得 / 更新 / 削除 |
| `app/api/admin/shop/route.ts`              | 店舗情報取得 / 更新              |
| `app/api/admin/upload-menu-image/route.ts` | メニュー画像アップロード         |
| `app/api/admin/upload-shop-image/route.ts` | 店舗画像アップロード             |
| `app/api/menus/[menuId]/route.ts`          | 公開向けメニュー取得 API         |
| `app/api/allergens/route.ts`               | アレルゲン一覧 API               |

### 管理画面と公開画面はどう分かれているか

- **管理画面ページ**
    - `/admin/...`
- **管理 API**
    - `/api/admin/...`
- **認証 API**
    - `/api/auth/...`
- **公開 API**
    - `/api/menus/...`, `/api/allergens`

この分け方はとても大事です。  
「誰が使う処理か」が URL に表れています。

### `app/api/menus/_disabled/route.ts` について

`app/api/menus/_disabled/route.ts` には、コメント上は旧 `POST /api/menus` 実装が残されています。  
ただし今は `_disabled` という別フォルダに移されているため、**現在の主要導線では使われていません**。  
ただし、App Router では `_disabled` が特別な無効化記号ではないので、**URL としては `/api/menus/_disabled` になる可能性があります**。  
「完全削除ではなく退避」と読むのが自然ですが、ここは設計意図としては `推測` です。

---

## 5. ファイルごとの役割説明

ここでは、重要ファイルを 1 つずつ見ます。  
特に「どこから呼ばれるか」「中に何があるか」「何を読むべきか」を意識してください。

### `app/layout.tsx`

- パス: `app/layout.tsx`
- このファイルの役割: アプリ全体の最上位レイアウト。`html`, `body`, フォント、共通 CSS を設定する
- いつ呼ばれるか / どこから使われるか: 全ページで自動的に使われる
- 中にある主な関数やコンポーネント: `RootLayout`
- 初学者が読むときの注目ポイント: ここは「見た目」より「土台」です。`globals.css` と Google Fonts を読み込み、全ページ共通の外枠を作っています

### `app/page.tsx`

- パス: `app/page.tsx`
- このファイルの役割: トップページ用のデータ取得を行い、`HomePageView` に渡す
- いつ呼ばれるか / どこから使われるか: `/` にアクセスしたとき
- 中にある主な関数やコンポーネント: `HomePage`
- 初学者が読むときの注目ポイント: Server Component なので、ここで `prisma.shop.findFirst` を直接呼べる。トップページは `HomePageView` に表示部分を分離している

### `app/(public)/layout.tsx`

- パス: `app/(public)/layout.tsx`
- このファイルの役割: 公開側ページの共通ヘッダーをまとめる
- いつ呼ばれるか / どこから使われるか: `(public)` 配下のページすべて
- 中にある主な関数やコンポーネント: `PublicLayout`
- 初学者が読むときの注目ポイント: レイアウトに共通ヘッダーを置くと、各 `page.tsx` で毎回ヘッダーを書かずに済む

### `app/(public)/shops/page.tsx`

- パス: `app/(public)/shops/page.tsx`
- このファイルの役割: 公開店舗一覧を表示する
- いつ呼ばれるか / どこから使われるか: `/shops`
- 中にある主な関数やコンポーネント: `PublicShopListPage`
- 初学者が読むときの注目ポイント: `searchParams.q` から検索語を受け取り、Prisma の `where` 条件を組み立てている。「入力は URL クエリ、処理は DB 検索、返すのは JSX」という流れが分かりやすい

### `app/(public)/shops/[shopId]/page.tsx`

- パス: `app/(public)/shops/[shopId]/page.tsx`
- このファイルの役割: 店舗詳細と公開メニュー一覧を表示する
- いつ呼ばれるか / どこから使われるか: `/shops/:shopId`
- 中にある主な関数やコンポーネント: `buildMenuWhere`, `PublicShopDetailPage`
- 初学者が読むときの注目ポイント: `shopId` を `params` から受け取り、アレルゲンマスタと店舗情報をまとめて取得している。Client Component に渡す前に `Date` を文字列へ変換している点も重要

### `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx`

- パス: `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx`
- このファイルの役割: 公開メニュー詳細を表示する
- いつ呼ばれるか / どこから使われるか: `/shops/:shopId/menus/:menuId`
- 中にある主な関数やコンポーネント: `PublicMenuDetailPage`
- 初学者が読むときの注目ポイント: `menuItem.findFirst` で「この店の、この公開メニューだけ」を取得している。全アレルゲン 28 品目を一覧化するとき、「未登録は FREE 扱い」にしている

### `app/admin/(auth)/login/page.tsx`

- パス: `app/admin/(auth)/login/page.tsx`
- このファイルの役割: ログインページの URL 入口
- いつ呼ばれるか / どこから使われるか: `/admin/login`
- 中にある主な関数やコンポーネント: `AdminLoginPage`
- 初学者が読むときの注目ポイント: 本体ロジックは `AdminLoginPageClient` にある。`page.tsx` は「URL と部品の接続役」と割り切られている

### `app/admin/(auth)/register/page.tsx`

- パス: `app/admin/(auth)/register/page.tsx`
- このファイルの役割: 新規登録ページの URL 入口
- いつ呼ばれるか / どこから使われるか: `/admin/register`
- 中にある主な関数やコンポーネント: `AdminRegisterPage`
- 初学者が読むときの注目ポイント: ログインページと同じく、表示本体は Client Component に分離されている

### `app/admin/(dashboard)/menus/page.tsx`

- パス: `app/admin/(dashboard)/menus/page.tsx`
- このファイルの役割: ログイン中店舗のメニュー一覧を表示する
- いつ呼ばれるか / どこから使われるか: `/admin/menus`
- 中にある主な関数やコンポーネント: `AdminMenusPage`
- 初学者が読むときの注目ポイント: `requireSessionShopIdOrRedirect` でログイン確認し、その `shopId` で DB を絞っている。多店舗混在を避ける基本形

### `app/admin/(dashboard)/menus/new/page.tsx`

- パス: `app/admin/(dashboard)/menus/new/page.tsx`
- このファイルの役割: 新規メニュー作成フォームを表示する
- いつ呼ばれるか / どこから使われるか: `/admin/menus/new`
- 中にある主な関数やコンポーネント: `AdminMenuNewPage`
- 初学者が読むときの注目ポイント: フォーム表示前にアレルゲンマスタを取っている。フォーム部品に「候補データ」を渡す書き方の例

### `app/admin/(dashboard)/menus/[menuId]/edit/page.tsx`

- パス: `app/admin/(dashboard)/menus/[menuId]/edit/page.tsx`
- このファイルの役割: 編集対象メニューの初期データを読み、編集 UI に渡す
- いつ呼ばれるか / どこから使われるか: `/admin/menus/:menuId/edit`
- 中にある主な関数やコンポーネント: `AdminMenuEditPage`
- 初学者が読むときの注目ポイント: `findFirst({ where: { id: menuId, shopId } })` が重要。`id` だけでなく `shopId` でも絞るのが安全設計

### `app/admin/(dashboard)/shop/page.tsx`

- パス: `app/admin/(dashboard)/shop/page.tsx`
- このファイルの役割: 店舗情報編集ページに初期データを渡す
- いつ呼ばれるか / どこから使われるか: `/admin/shop`
- 中にある主な関数やコンポーネント: `AdminShopPage`
- 初学者が読むときの注目ポイント: 店舗情報も `shopId` をセッションから取り、その店だけ取得している

### `app/api/auth/[...nextauth]/route.ts`

- パス: `app/api/auth/[...nextauth]/route.ts`
- このファイルの役割: NextAuth の Route Handler を公開する
- いつ呼ばれるか / どこから使われるか: `signIn`, `signOut`, セッション確認など、NextAuth の内部ルートから使われる
- 中にある主な関数やコンポーネント: `handler` を `GET` と `POST` として export
- 初学者が読むときの注目ポイント: 実際の認証設定はここではなく `lib/auth.ts` にある。ここは「NextAuth を URL に結びつける薄い入口」

### `lib/auth.ts`

- パス: `lib/auth.ts`
- このファイルの役割: NextAuth の認証設定本体
- いつ呼ばれるか / どこから使われるか: `app/api/auth/[...nextauth]/route.ts`、`getServerSession(authOptions)`
- 中にある主な関数やコンポーネント: `authOptions`, `authorize`, `jwt`, `session`
- 初学者が読むときの注目ポイント: このファイルが「ログインしてよい人の条件」「JWT に何を入れるか」「session に何を見せるか」を全部決めている

### `lib/admin-auth.ts`

- パス: `lib/admin-auth.ts`
- このファイルの役割: 管理画面用のセッション補助
- いつ呼ばれるか / どこから使われるか: 管理ページや管理 API
- 中にある主な関数やコンポーネント: `getAdminSession`, `getSessionShopId`, `requireSessionShopIdOrRedirect`
- 初学者が読むときの注目ポイント: 認証ロジックを毎回同じように書かないための薄いラッパー。特に `shopId` を取り出す責務が分かりやすい

### `lib/db.ts`

- パス: `lib/db.ts`
- このファイルの役割: Prisma Client を 1 つだけ使い回す
- いつ呼ばれるか / どこから使われるか: Prisma を使うほぼすべてのファイル
- 中にある主な関数やコンポーネント: `prisma`
- 初学者が読むときの注目ポイント: 開発環境でホットリロードが起きても PrismaClient を増やしすぎないための定番パターン

### `next-auth.d.ts`

- パス: `next-auth.d.ts`
- このファイルの役割: NextAuth の `Session`, `User`, `JWT` 型に `userId` と `shopId` を追加する
- いつ呼ばれるか / どこから使われるか: TypeScript コンパイル時に自動反映される
- 中にある主な関数やコンポーネント: 型拡張
- 初学者が読むときの注目ポイント: 実行時の処理ではなく「型の世界」の設定。`session.user.shopId` を型エラーなく使うために必要

### `app/api/admin/_utils.ts`

- パス: `app/api/admin/_utils.ts`
- このファイルの役割: 管理 API 共通の補助関数
- いつ呼ばれるか / どこから使われるか: `app/api/admin/**/route.ts`
- 中にある主な関数やコンポーネント: `readJson`, `requireShopId`, `getMenuId`, `internalError`
- 初学者が読むときの注目ポイント: API で繰り返す処理を共通化している。特に「認証確認」「JSON 読み取り」「500 エラー統一」は API の基本パターン

### `lib/admin-validators.ts`

- パス: `lib/admin-validators.ts`
- このファイルの役割: 管理画面 API の入力値を整形・検証する
- いつ呼ばれるか / どこから使われるか: `app/api/admin/menus/route.ts`, `app/api/admin/shop/route.ts`
- 中にある主な関数やコンポーネント: `toTrimmedNullableString`, `toRequiredTrimmedString`, `toBooleanOrDefault`, `parsePriceYen`
- 初学者が読むときの注目ポイント: Zod を使わず、必要最低限の入力チェックを関数で分けている

### `lib/allergens.ts`

- パス: `lib/allergens.ts`
- このファイルの役割: アレルゲン状態に関する定数・表示補助・集計補助
- いつ呼ばれるか / どこから使われるか: 公開画面、管理画面
- 中にある主な関数やコンポーネント: `ALLERGEN_STATUS_VALUES`, `createStatusBySlug`, `statusLabelJa`, `statusBadgeClass`, `buildSpecifiedIngredientNotice`
- 初学者が読むときの注目ポイント: アレルゲンの「意味」を UI で統一する中心ファイル

### `lib/public-allergen-preferences.ts`

- パス: `lib/public-allergen-preferences.ts`
- このファイルの役割: 一般利用者のアレルゲン設定を localStorage に保存する
- いつ呼ばれるか / どこから使われるか: 公開ページ側の Client Component
- 中にある主な関数やコンポーネント: `loadUserAllergenPreferences`, `saveUserAllergenPreferences`, `clearUserAllergenPreferences`
- 初学者が読むときの注目ポイント: DB ではなくブラウザ保存を使っているので、ログイン不要で個別設定を持てる

### `prisma/schema.prisma`

- パス: `prisma/schema.prisma`
- このファイルの役割: DB スキーマの定義
- いつ呼ばれるか / どこから使われるか: Prisma CLI、Prisma Client 生成時
- 中にある主な関数やコンポーネント: `generator`, `datasource`, `model User`, `model Shop`, `model MenuItem`, `model Allergen`, `model MenuItemAllergen`, `enum AllergenStatus`
- 初学者が読むときの注目ポイント: アプリのデータ設計の中心。ここを読むと「何が保存されているか」が分かる

### `prisma/seed.ts`

- パス: `prisma/seed.ts`
- このファイルの役割: 初期アレルゲンマスタ、デモユーザー、デモ店舗、デモメニューを投入する
- いつ呼ばれるか / どこから使われるか: `npm run seed`
- 中にある主な関数やコンポーネント: `seedAllergenMaster`, `seedDemoShop`, `main`
- 初学者が読むときの注目ポイント: 実データ例があるので、DB 設計の理解にとても役立つ

### `app/api/admin/register/route.ts`

- パス: `app/api/admin/register/route.ts`
- このファイルの役割: 店舗アカウントを新規作成する
- いつ呼ばれるか / どこから使われるか: `AdminRegisterPageClient` の `fetch("/api/admin/register")`
- 中にある主な関数やコンポーネント: `POST`
- 初学者が読むときの注目ポイント: `User` 作成と同時にネストした `shop.create` で `Shop` も作る。Prisma の「関連込み作成」の例

### `app/api/admin/menus/route.ts`

- パス: `app/api/admin/menus/route.ts`
- このファイルの役割: 管理者メニュー一覧取得と新規作成
- いつ呼ばれるか / どこから使われるか: `POST` は `NewMenuForm` と `MenuEditClient` の「新規メニュー作成」で使用。`GET` はコード上で存在するが、現 UI からの利用は未確認
- 中にある主な関数やコンポーネント: `GET`, `POST`
- 初学者が読むときの注目ポイント: `shopId` を body で受けず、セッションから取得していることが重要

### `app/api/admin/menus/[menuId]/route.ts`

- パス: `app/api/admin/menus/[menuId]/route.ts`
- このファイルの役割: 管理者のメニュー取得・更新・削除
- いつ呼ばれるか / どこから使われるか: `MenuEditClient`, `MenuListPageClient`
- 中にある主な関数やコンポーネント: `GET`, `PUT`, `DELETE`
- 初学者が読むときの注目ポイント: どのハンドラでも「まず `shopId` をセッションから取得し、その店のメニューか確認する」という流れを守っている

### `app/api/menus/[menuId]/route.ts`

- パス: `app/api/menus/[menuId]/route.ts`
- このファイルの役割: 公開向けメニュー取得 API
- いつ呼ばれるか / どこから使われるか: 現在の主要公開ページは直接 Prisma を呼んでおり、この API を呼んでいるコードは確認できていない
- 中にある主な関数やコンポーネント: `GET`
- 初学者が読むときの注目ポイント: URL から `menuId` を保険付きで取り出す実装になっている。現在は「将来利用・検証用」寄りに見える

### `app/api/admin/shop/route.ts`

- パス: `app/api/admin/shop/route.ts`
- このファイルの役割: 店舗情報取得・更新
- いつ呼ばれるか / どこから使われるか: `ShopEditClient`
- 中にある主な関数やコンポーネント: `GET`, `PUT`
- 初学者が読むときの注目ポイント: 店舗名は必須、説明・住所・営業時間・画像 URL は任意として整形している

### `app/api/admin/upload-menu-image/route.ts`

- パス: `app/api/admin/upload-menu-image/route.ts`
- このファイルの役割: メニュー画像を Vercel Blob にアップロードする
- いつ呼ばれるか / どこから使われるか: `NewMenuForm`, `MenuEditClient`
- 中にある主な関数やコンポーネント: `POST`
- 初学者が読むときの注目ポイント: `formData` から `File` を受け取り、サイズ・ MIME type を検証してから Blob に保存している

### `app/api/admin/upload-shop-image/route.ts`

- パス: `app/api/admin/upload-shop-image/route.ts`
- このファイルの役割: 店舗画像を Vercel Blob にアップロードする
- いつ呼ばれるか / どこから使われるか: `ShopEditClient`
- 中にある主な関数やコンポーネント: `POST`
- 初学者が読むときの注目ポイント: `getSessionShopId()` を使ってアップロード先パスに店舗 ID を入れている

### `app/api/allergens/route.ts`

- パス: `app/api/allergens/route.ts`
- このファイルの役割: アレルゲン 28 品目一覧を JSON で返す
- いつ呼ばれるか / どこから使われるか: 現在の主要ページからの利用は未確認だが、API としては公開されている
- 中にある主な関数やコンポーネント: `GET`
- 初学者が読むときの注目ポイント: `findMany` と `orderBy` の基本例で、軽い読み取り API の手本になっている

### `components/admin/auth/AdminLoginPageClient.tsx`

- パス: `components/admin/auth/AdminLoginPageClient.tsx`
- このファイルの役割: ログインフォーム UI と送信処理
- いつ呼ばれるか / どこから使われるか: `/admin/login`
- 中にある主な関数やコンポーネント: `AdminLoginPageClient`, `onSubmit`
- 初学者が読むときの注目ポイント: `signIn("credentials", { redirect: false })` で NextAuth にログインを依頼している

### `components/admin/auth/AdminRegisterPageClient.tsx`

- パス: `components/admin/auth/AdminRegisterPageClient.tsx`
- このファイルの役割: 新規登録フォーム UI と送信処理
- いつ呼ばれるか / どこから使われるか: `/admin/register`
- 中にある主な関数やコンポーネント: `AdminRegisterPageClient`, `onSubmit`
- 初学者が読むときの注目ポイント: まず `/api/admin/register` を呼び、その後で `signIn` している。登録とログインは別処理

### `components/admin/menu/NewMenuForm.tsx`

- パス: `components/admin/menu/NewMenuForm.tsx`
- このファイルの役割: 新規メニュー作成フォーム
- いつ呼ばれるか / どこから使われるか: `/admin/menus/new`
- 中にある主な関数やコンポーネント: `normalizeOptionalText`, `buildPriceYen`, `uploadSelectedImage`, `onSubmit`
- 初学者が読むときの注目ポイント: 画像アップロード → メニュー作成 API 呼び出し → 返ってきた ID で編集ページに遷移、という流れを持つ

### `components/admin/menu/MenuEditClient.tsx`

- パス: `components/admin/menu/MenuEditClient.tsx`
- このファイルの役割: メニュー編集 UI と保存処理
- いつ呼ばれるか / どこから使われるか: `/admin/menus/:menuId/edit`
- 中にある主な関数やコンポーネント: `buildPriceYen`, `uploadSelectedImage`, `onSave`, `handleCreateMenu`
- 初学者が読むときの注目ポイント: 編集画面からさらに空の新規メニューも作れる。作成と編集の UI を近づける設計

### `components/admin/menu/MenuListPageClient.tsx`

- パス: `components/admin/menu/MenuListPageClient.tsx`
- このファイルの役割: 管理画面のメニュー一覧 UI と削除処理
- いつ呼ばれるか / どこから使われるか: `/admin/menus`
- 中にある主な関数やコンポーネント: `onDelete`
- 初学者が読むときの注目ポイント: 一覧の初期データは Server Component から受け取り、削除だけ `fetch` で API を呼ぶ

### `components/admin/shop/ShopEditClient.tsx`

- パス: `components/admin/shop/ShopEditClient.tsx`
- このファイルの役割: 店舗情報編集 UI、画像アップロード、保存処理
- いつ呼ばれるか / どこから使われるか: `/admin/shop`
- 中にある主な関数やコンポーネント: `onSelectImage`, `uploadSelectedImage`, `onSubmit`
- 初学者が読むときの注目ポイント: 店舗画像プレビューと保存後の `updatedAt` 表示まで UI で更新している

### `components/admin/shop/ShopQrCard.tsx`

- パス: `components/admin/shop/ShopQrCard.tsx`
- このファイルの役割: 公開店舗 URL の QR コードと共有導線
- いつ呼ばれるか / どこから使われるか: `/admin/shop`
- 中にある主な関数やコンポーネント: `handleCopyUrl`
- 初学者が読むときの注目ポイント: `NEXT_PUBLIC_APP_URL` を優先し、なければ `window.location.origin` を使う

### `components/layout/AdminDashboardShell.tsx`

- パス: `components/layout/AdminDashboardShell.tsx`
- このファイルの役割: 管理画面の共通シェル
- いつ呼ばれるか / どこから使われるか: `app/admin/(dashboard)/layout.tsx`
- 中にある主な関数やコンポーネント: `AdminDashboardShell`
- 初学者が読むときの注目ポイント: サイドバー、モバイルヘッダー、ログアウトボタンを共通化している

### `components/layout/PublicHeader.tsx`

- パス: `components/layout/PublicHeader.tsx`
- このファイルの役割: 公開画面共通ヘッダー
- いつ呼ばれるか / どこから使われるか: `app/(public)/layout.tsx`
- 中にある主な関数やコンポーネント: `PublicHeader`
- 初学者が読むときの注目ポイント: `Suspense` で `PublicSearchBox` を包んでいる

### `components/public/HomePageView.tsx`

- パス: `components/public/HomePageView.tsx`
- このファイルの役割: トップページの見た目全体を描画する
- いつ呼ばれるか / どこから使われるか: `app/page.tsx`
- 中にある主な関数やコンポーネント: `HomePageView`
- 初学者が読むときの注目ポイント: データ取得は `app/page.tsx`、描画はこのファイルという分離になっている

### `components/public/PublicSearchBox.tsx`

- パス: `components/public/PublicSearchBox.tsx`
- このファイルの役割: URL クエリ `?q=` を更新する検索ボックス
- いつ呼ばれるか / どこから使われるか: 公開ヘッダー
- 中にある主な関数やコンポーネント: `autoPlaceholder`, `onChange`, `onClear`
- 初学者が読むときの注目ポイント: 検索語は React state だけでなく URL にも同期している。これにより再読み込みしても検索条件が残る

### `components/public/ShareShopUrlButton.tsx`

- パス: `components/public/ShareShopUrlButton.tsx`
- このファイルの役割: 店舗公開 URL の共有ボタン
- いつ呼ばれるか / どこから使われるか: 店舗詳細ページ、店舗編集ページ
- 中にある主な関数やコンポーネント: `showMessage`, `onClick`
- 初学者が読むときの注目ポイント: `navigator.share` が使える端末では共有 UI、使えなければクリップボードコピーにフォールバックする

### `components/public/ShopMenuListClient.tsx`

- パス: `components/public/ShopMenuListClient.tsx`
- このファイルの役割: 店舗ページの公開メニュー一覧表示と個人設定反映
- いつ呼ばれるか / どこから使われるか: 店舗詳細ページ
- 中にある主な関数やコンポーネント: `buildOverallSummary`, `buildPersonalizedSummary`, `goToMenu`
- 初学者が読むときの注目ポイント: 同じメニューでも「一般表示」と「あなた向け表示」を切り替えている

### `components/public/UserAllergenPreferenceClient.tsx`

- パス: `components/public/UserAllergenPreferenceClient.tsx`
- このファイルの役割: 一般ユーザーが避けたいアレルゲンをブラウザ保存する UI
- いつ呼ばれるか / どこから使われるか: 店舗詳細ページ、メニュー詳細ページ
- 中にある主な関数やコンポーネント: `toggleSlug`, `onSave`, `onClear`
- 初学者が読むときの注目ポイント: DB に保存せず `localStorage` に保存しているので、ログイン不要で動く

### `components/public/MenuAllergenAlertClient.tsx`

- パス: `components/public/MenuAllergenAlertClient.tsx`
- このファイルの役割: 選択済みアレルゲンに一致したときの警告表示
- いつ呼ばれるか / どこから使われるか: メニュー詳細ページ
- 中にある主な関数やコンポーネント: 一致判定ロジック
- 初学者が読むときの注目ポイント: `CONTAINS` と `MAY_CONTAIN` を分けて見せている

### `components/public/SelectedFreeAllergenCardsClient.tsx`

- パス: `components/public/SelectedFreeAllergenCardsClient.tsx`
- このファイルの役割: 選択済みアレルゲンのうち「含まない」ものをカード表示する
- いつ呼ばれるか / どこから使われるか: メニュー詳細ページ
- 中にある主な関数やコンポーネント: FREE 状態抽出ロジック
- 初学者が読むときの注目ポイント: 警告だけでなく「含まない」情報も見せようとしている

### `middleware.ts`

- パス: `middleware.ts`
- このファイルの役割: 管理画面ページへの未ログインアクセスを防ぐ
- いつ呼ばれるか / どこから使われるか: `/admin/menus/:path*`, `/admin/shop/:path*`
- 中にある主な関数やコンポーネント: `next-auth/middleware` の再 export
- 初学者が読むときの注目ポイント: ページ保護はミドルウェア、API 保護は `requireShopId()` と役割分担している

---

## 6. 関数ごとの役割説明

ここでは、重要な関数を「入力」「処理」「返り値」「必要性」で追います。

### `authorize`

- 何をする関数か: メールアドレスとパスワードが正しいかを確認し、ログインしてよいユーザー情報を返す
- どこで定義されているか: `lib/auth.ts`
- 何を引数として受け取るか: `credentials`。中には `email`, `password` が入る
- 中で何をしているか:
    1. `email`, `password` を取り出す
    2. どちらか欠けていれば `null`
    3. `prisma.user.findUnique({ where: { email } })` でユーザー取得
    4. 見つからなければ `null`
    5. `bcrypt.compare(password, user.passwordHash)` で照合
    6. 不一致なら `null`
    7. `prisma.shop.findUnique({ where: { userId: user.id } })` で店舗取得
    8. 店舗が無ければ `null`
    9. `id`, `email`, `shopId` を持つオブジェクトを返す
- 何を返すか: 成功時はログインユーザー情報、失敗時は `null`
- なぜ必要か: NextAuth に「この入力が有効かどうか」を教える中心だから
- 似た役割の別の書き方があるなら何が違うか: Google ログインなどの OAuth では `authorize` を自分で書かない場合もある。Credentials 認証では自前で照合が必要

### `jwt` callback

- 何をする関数か: ログイン時に JWT トークンへ `userId`, `shopId` を入れる
- どこで定義されているか: `lib/auth.ts`
- 何を引数として受け取るか: `token`, `user`
- 中で何をしているか: `user` があるときだけ `token.userId = user.id`, `token.shopId = user.shopId` を入れる
- 何を返すか: 更新後の `token`
- なぜ必要か: 後続のリクエストで「誰がログインしているか」「どの店か」を使い回すため
- 似た役割の別の書き方があるなら何が違うか: DB セッション方式ならサーバー側セッションテーブルに持たせる設計もある

### `session` callback

- 何をする関数か: JWT に入っている `userId`, `shopId` を `session.user` に移す
- どこで定義されているか: `lib/auth.ts`
- 何を引数として受け取るか: `session`, `token`
- 中で何をしているか: `session.user.userId = token.userId`, `session.user.shopId = token.shopId`
- 何を返すか: 更新後の `session`
- なぜ必要か: 画面や API から `session.user.shopId` を使えるようにするため
- 似た役割の別の書き方があるなら何が違うか: 必要な情報を session に渡さない設計もあるが、このプロジェクトでは店舗単位制御のため `shopId` が重要

### `getAdminSession`

- 何をする関数か: サーバー側で現在のセッションを取得する
- どこで定義されているか: `lib/admin-auth.ts`
- 何を引数として受け取るか: なし
- 中で何をしているか: `getServerSession(authOptions)` を呼ぶ
- 何を返すか: セッション、または `null`
- なぜ必要か: 各ページや API で同じ呼び方を統一するため
- 似た役割の別の書き方があるなら何が違うか: 各ファイルで直接 `getServerSession` を呼んでもよいが、共通化のほうが読みやすい

### `getSessionShopId`

- 何をする関数か: セッションから `shopId` だけを取り出す
- どこで定義されているか: `lib/admin-auth.ts`
- 何を引数として受け取るか: なし
- 中で何をしているか: `getAdminSession()` を呼び、`session?.user?.shopId ?? null` を返す
- 何を返すか: `shopId` または `null`
- なぜ必要か: このプロジェクトでは「どの店か」が最重要だから
- 似た役割の別の書き方があるなら何が違うか: 毎回 `session.user.shopId` を直接読むより意図が明確

### `requireSessionShopIdOrRedirect`

- 何をする関数か: `shopId` が無ければ `/admin/login` へリダイレクトする
- どこで定義されているか: `lib/admin-auth.ts`
- 何を引数として受け取るか: なし
- 中で何をしているか: `getSessionShopId()` を呼び、無ければ `redirect("/admin/login")`
- 何を返すか: 取得できた `shopId`
- なぜ必要か: 管理画面の Server Component でログイン必須にしたいから
- 似た役割の別の書き方があるなら何が違うか: ミドルウェアだけでも保護できるが、ページ側でも明示しておくと安全

### `readJson`

- 何をする関数か: API リクエストの JSON を安全に読む
- どこで定義されているか: `app/api/admin/_utils.ts`
- 何を引数として受け取るか: `Request`
- 中で何をしているか: `req.json().catch(() => null)`
- 何を返すか: パース成功なら JSON、失敗なら `null`
- なぜ必要か: 壊れた JSON で API 全体を落とさないため
- 似た役割の別の書き方があるなら何が違うか: 直接 `await req.json()` すると例外で落ちやすい

### `requireShopId`

- 何をする関数か: API 用にセッション確認し、`shopId` を返す
- どこで定義されているか: `app/api/admin/_utils.ts`
- 何を引数として受け取るか: なし
- 中で何をしているか:
    1. `getAdminSession()` を呼ぶ
    2. セッションが無ければ `401 unauthorized`
    3. `session.user.shopId` が無ければ `401`
    4. 成功なら `{ ok: true, shopId }`
- 何を返すか: 成功時は `shopId`、失敗時は `NextResponse`
- なぜ必要か: API の認証確認を共通化するため
- 似た役割の別の書き方があるなら何が違うか: ミドルウェアは API には直接効いていないので、API では別途必要

### `getMenuId`

- 何をする関数か: `menuId` を `context.params` か URL から取り出す
- どこで定義されているか: `app/api/admin/_utils.ts`
- 何を引数として受け取るか: `req`, `context`
- 中で何をしているか: `params?.menuId` を優先し、なければ URL の末尾を使う
- 何を返すか: `menuId` または `undefined`
- なぜ必要か: 環境差で `params` 形が揺れても壊れにくくするため
- 似た役割の別の書き方があるなら何が違うか: `context.params.menuId` だけでもよいが、このコードは保険を多めに掛けている

### `internalError`

- 何をする関数か: 500 エラーの返し方を統一する
- どこで定義されているか: `app/api/admin/_utils.ts`
- 何を引数として受け取るか: `unknown`
- 中で何をしているか: `console.error` し、開発環境では `message` 付き、本番では一般的な文言だけ返す
- 何を返すか: `NextResponse.json(...)`
- なぜ必要か: API ごとに 500 エラー形式がばらばらになるのを防ぐため
- 似た役割の別の書き方があるなら何が違うか: 例外を投げて共通ミドルウェアで拾う設計もある

### `parsePriceYen`

- 何をする関数か: 価格入力を `number | null` に整え、エラー時は理由を返す
- どこで定義されているか: `lib/admin-validators.ts`
- 何を引数として受け取るか: `unknown`
- 中で何をしているか:
    1. 空なら `null`
    2. 数字か文字列か判定
    3. `Number` 変換
    4. 数値 / 整数 / 0 以上 / Prisma の Int 上限以下を確認
- 何を返すか: 成功なら `{ ok: true, value }`、失敗なら `{ ok: false, message }`
- なぜ必要か: フォーム入力は文字列になりやすく、そのまま DB に入れると危ないため
- 似た役割の別の書き方があるなら何が違うか: Zod や React Hook Form などのライブラリでもよく実装する

### `createStatusBySlug`

- 何をする関数か: 全アレルゲンを `slug -> status` の辞書に変換する
- どこで定義されているか: `lib/allergens.ts`
- 何を引数として受け取るか: アレルゲン一覧、既存リンク一覧
- 中で何をしているか:
    1. まず全 `slug` を `FREE` で初期化
    2. DB の既存リンクがあればその状態で上書き
- 何を返すか: `Record<string, AllergenStatus>`
- なぜ必要か: 「未登録のものも含めて 28 品目全部表示したい」から
- 似た役割の別の書き方があるなら何が違うか: DB から全 28 件を join して返す方法もある

### `buildSpecifiedIngredientNotice`

- 何をする関数か: 特定原材料 8 品目について、警告ボックスの文言と色を決める
- どこで定義されているか: `lib/allergens.ts`
- 何を引数として受け取るか: `rows`
- 中で何をしているか:
    1. 指定 8 品目だけ取り出す
    2. `CONTAINS` があるか確認
    3. なければ `MAY_CONTAIN` を確認
    4. 危険 / 注意 / 安全 の表示情報を返す
- 何を返すか: `title`, `desc`, `boxClass` などを含むオブジェクト
- なぜ必要か: 28 品目全部より先に、特定原材料 8 品目を目立たせたいから
- 似た役割の別の書き方があるなら何が違うか: UI コンポーネント側に直接書いてもよいが、ロジックを `lib` に出した方が再利用しやすい

### `POST /api/admin/register` の `POST`

- 何をする関数か: 店舗アカウント新規登録
- どこで定義されているか: `app/api/admin/register/route.ts`
- 何を引数として受け取るか: `Request`。body に `shopName`, `email`, `password`
- 中で何をしているか:
    1. JSON 読み取り
    2. 必須チェック
    3. 既存メール確認
    4. `bcrypt.hash(password, 10)`
    5. `prisma.user.create` でユーザー作成
    6. ネストした `shop.create` で店舗も同時作成
- 何を返すか: 成功時はユーザー情報と店舗情報、失敗時はエラー JSON
- なぜ必要か: 1 店舗 1 アカウントを作る入口だから
- 似た役割の別の書き方があるなら何が違うか: トランザクションで分けて作る実装もあるが、Prisma のネスト作成で十分書ける

### `GET /api/admin/menus` の `GET`

- 何をする関数か: ログイン中店舗のメニュー一覧を返す
- どこで定義されているか: `app/api/admin/menus/route.ts`
- 何を引数として受け取るか: なし
- 中で何をしているか: `requireShopId()` → `menuItem.findMany({ where: { shopId } })`
- 何を返すか: `{ menus }`
- なぜ必要か: API として一覧取得したい場面に備えるため
- 似た役割の別の書き方があるなら何が違うか: このプロジェクトの一覧画面は Server Component で直接 DB を読むので、現時点では API を使わない

### `POST /api/admin/menus` の `POST`

- 何をする関数か: 新規メニューを作る
- どこで定義されているか: `app/api/admin/menus/route.ts`
- 何を引数として受け取るか: body に `name`, `description`, `priceYen`, `category`, `ingredients`, `precaution`, `isPublished`, `imageUrl`, `allergenStatusBySlug`
- 中で何をしているか:
    1. `requireShopId()` で認証確認
    2. `readJson()` で body 取得
    3. 名前と価格を検証
    4. 文字列項目を trim / null 化
    5. アレルゲンの `slug -> status` を検証
    6. 必要なら `Allergen` を検索
    7. `$transaction` の中で `MenuItem` を作り、`MenuItemAllergen` もまとめて作る
- 何を返すか: 成功時 `{ id }`
- なぜ必要か: メニュー本体とアレルゲン状態をずれずに作るため
- 似た役割の別の書き方があるなら何が違うか: 画面から直接 DB は触れないので、作成は API にする必要がある

### `GET /api/admin/menus/[menuId]` の `GET`

- 何をする関数か: 編集用に 1 件のメニュー詳細を返す
- どこで定義されているか: `app/api/admin/menus/[menuId]/route.ts`
- 何を引数として受け取るか: `req`, `context`
- 中で何をしているか: 認証確認 → `menuId` 取得 → その店舗のメニューか確認 → アレルゲン情報も含めて返却
- 何を返すか: `{ menu }`
- なぜ必要か: 編集画面が API 経由で再取得したい場合に使える
- 似た役割の別の書き方があるなら何が違うか: このプロジェクトの編集画面初期表示は Server Component 直読みにしている

### `PUT /api/admin/menus/[menuId]` の `PUT`

- 何をする関数か: メニュー更新
- どこで定義されているか: `app/api/admin/menus/[menuId]/route.ts`
- 何を引数として受け取るか: `req`, `context`。body にメニュー更新内容
- 中で何をしているか:
    1. 認証確認
    2. `menuId` 取得
    3. body 取得
    4. その店舗のメニューか確認
    5. `menuItem.update` で本体更新
    6. 送られてきた `slug` だけ `Allergen` を引き当て
    7. `menuItemAllergen.upsert` を `$transaction` でまとめて実行
- 何を返すか: `{ menu: updatedMenu }`
- なぜ必要か: 本体情報とアレルゲン状態をまとめて保存したいから
- 似た役割の別の書き方があるなら何が違うか: 全 28 品目を毎回削除して再作成する方法もあるが、ここでは `upsert` で部分更新できる

### `DELETE /api/admin/menus/[menuId]` の `DELETE`

- 何をする関数か: メニュー削除
- どこで定義されているか: `app/api/admin/menus/[menuId]/route.ts`
- 何を引数として受け取るか: `req`, `context`
- 中で何をしているか:
    1. 認証確認
    2. `menuId` 取得
    3. その店舗のメニューか確認
    4. `MenuItemAllergen` を先に削除
    5. `MenuItem` を削除
- 何を返すか: `{ ok: true }`
- なぜ必要か: メニュー削除時に関連レコードも整合性を保って消すため
- 似た役割の別の書き方があるなら何が違うか: `onDelete: Cascade` があるので本体削除だけでも消える設計に寄せることもある

### `PUT /api/admin/shop` の `PUT`

- 何をする関数か: 店舗情報更新
- どこで定義されているか: `app/api/admin/shop/route.ts`
- 何を引数として受け取るか: `Request`。body に `name`, `description`, `address`, `hours`, `coverImageUrl`
- 中で何をしているか:
    1. 認証確認
    2. JSON 読み取り
    3. 店舗名必須チェック
    4. 任意項目を trim / null 化
    5. `prisma.shop.update`
- 何を返すか: `{ shop }`
- なぜ必要か: 店舗ページの公開内容を管理画面から更新できるようにするため
- 似た役割の別の書き方があるなら何が違うか: フォームから直接 DB は触れないので API が必要

### `onSubmit` in `AdminLoginPageClient`

- 何をする関数か: ログインフォーム送信
- どこで定義されているか: `components/admin/auth/AdminLoginPageClient.tsx`
- 何を引数として受け取るか: `React.FormEvent<HTMLFormElement>`
- 中で何をしているか:
    1. デフォルト送信停止
    2. エラー初期化
    3. `signIn("credentials", { email, password, redirect: false })`
    4. 結果確認
    5. 成功なら `/admin/menus` へ遷移
- 何を返すか: 明示的には返さない
- なぜ必要か: ログイン UI と NextAuth をつなぐ入口だから
- 似た役割の別の書き方があるなら何が違うか: HTML の通常フォーム送信に任せる実装もあるが、このコードはエラーハンドリングを自前制御している

### `onSubmit` in `AdminRegisterPageClient`

- 何をする関数か: 新規登録フォーム送信
- どこで定義されているか: `components/admin/auth/AdminRegisterPageClient.tsx`
- 何を引数として受け取るか: `React.FormEvent<HTMLFormElement>`
- 中で何をしているか:
    1. 入力バリデーション
    2. `/api/admin/register` を `fetch`
    3. 成功したら `signIn("credentials")`
    4. 成功したら `/admin/menus` へ
- 何を返すか: 明示的には返さない
- なぜ必要か: 登録とその後の自動ログインを 1 つの体験にするため
- 似た役割の別の書き方があるなら何が違うか: 登録完了後にログイン画面へ戻す設計もある

### `uploadSelectedImage`

- 何をする関数か: 選択された画像をアップロードし、URL を返す
- どこで定義されているか: `NewMenuForm.tsx`, `MenuEditClient.tsx`, `ShopEditClient.tsx`
- 何を引数として受け取るか: なし。コンポーネント state の `selectedFile` を読む
- 中で何をしているか: `FormData` を作り、対応 API に `POST` し、返ってきた URL を state に入れる
- 何を返すか: `Promise<string | null>`
- なぜ必要か: 画像ファイルは JSON では送れないので、別 API と別手順が必要だから
- 似た役割の別の書き方があるなら何が違うか: Base64 で送る方法もあるが、通常はファイルアップロード API を分ける

### `onSubmit` in `NewMenuForm`

- 何をする関数か: 新規メニュー作成
- どこで定義されているか: `components/admin/menu/NewMenuForm.tsx`
- 何を引数として受け取るか: `FormEvent`
- 中で何をしているか:
    1. 必須の名前確認
    2. 価格文字列を数値へ
    3. 必要なら画像アップロード
    4. body を組み立てる
    5. `/api/admin/menus` に `POST`
    6. 返ってきた `id` で編集ページへ遷移
- 何を返すか: 明示的には返さない
- なぜ必要か: 新規作成をブラウザから行うため
- 似た役割の別の書き方があるなら何が違うか: Server Action を使う方法もあるが、このコードは `fetch` で統一している

### `onSave` in `MenuEditClient`

- 何をする関数か: メニュー編集内容を保存する
- どこで定義されているか: `components/admin/menu/MenuEditClient.tsx`
- 何を引数として受け取るか: なし
- 中で何をしているか:
    1. 名前必須確認
    2. 価格整形
    3. 必要なら画像アップロード
    4. `/api/admin/menus/${menuId}` に `PUT`
    5. 成功したら `saved` を true、`router.refresh()`
- 何を返すか: 明示的には返さない
- なぜ必要か: 編集 UI と保存 API をつなぐ中心だから
- 似た役割の別の書き方があるなら何が違うか: フォーム送信にしてもよいが、ボタン押下で制御した方が状態管理しやすい

### `onDelete` in `MenuListPageClient`

- 何をする関数か: メニュー削除
- どこで定義されているか: `components/admin/menu/MenuListPageClient.tsx`
- 何を引数として受け取るか: `menuId`, `menuName`
- 中で何をしているか: 確認ダイアログ → `DELETE /api/admin/menus/[menuId]` → 成功したらローカル state から削除
- 何を返すか: 明示的には返さない
- なぜ必要か: 削除後に画面を即座に更新したいから
- 似た役割の別の書き方があるなら何が違うか: 再読み込みするより、state から消す方が軽い

### `buildOverallSummary`

- 何をする関数か: メニュー一覧カード用に、アレルゲン状況の要約文を作る
- どこで定義されているか: `components/public/ShopMenuListClient.tsx`
- 何を引数として受け取るか: `links`, `nameJaBySlug`, `rankBySlug`
- 中で何をしているか: `CONTAINS`, `MAY_CONTAIN` を数え、順位順に名前を整えて、要約文とバッジ種別を作る
- 何を返すか: `summaryText`, `badge`, `containsCount`, `mayCount`
- なぜ必要か: 一覧画面で全部のアレルゲンを出さず、短く危険度を見せるため
- 似た役割の別の書き方があるなら何が違うか: サーバー側で計算して返すこともできる

### `buildPersonalizedSummary`

- 何をする関数か: ユーザーが選んだアレルゲンだけに絞った要約を作る
- どこで定義されているか: `components/public/ShopMenuListClient.tsx`
- 何を引数として受け取るか: `links`, `selectedSlugs`, `nameJaBySlug`, `rankBySlug`
- 中で何をしているか: 選択済み `slug` と一致するものだけ数え、要約を作る
- 何を返すか: `summaryText`, `badge`, `containsCount`, `mayCount`
- なぜ必要か: 「一般表示」ではなく「自分に関係ある危険だけ」を目立たせたいから
- 似た役割の別の書き方があるなら何が違うか: サーバー保存のユーザー設定があればサーバー側で計算もできる

---

## 7. NextAuth を徹底解説

## 7-1. NextAuth はそもそも何か

NextAuth は、Next.js で認証を扱うためのライブラリです。  
認証とは、「この人は本当にログインしてよい人か」を確認し、その後のリクエストでもログイン状態を保つ仕組みです。

このプロジェクトでは、Google ログインのような外部連携ではなく、**Credentials 認証**を使っています。  
Credentials 認証とは、**自分の DB にあるメールアドレスとパスワードでログインする方式**です。

## 7-2. このプロジェクトでは Credentials 認証をどう使っているか

設定の中心は `lib/auth.ts` です。

- `Credentials({...})` で入力項目を定義
- `authorize` でユーザー照合
- `jwt` callback で `shopId` を保存
- `session` callback で画面から使える形にする
- `app/api/auth/[...nextauth]/route.ts` で NextAuth のルートを公開

## 7-3. ログイン時に何が起きるかを順番に説明

### 1. フォーム入力

`components/admin/auth/AdminLoginPageClient.tsx` で、ユーザーはメールアドレスとパスワードを入力します。

### 2. `signIn`

`onSubmit` の中で `signIn("credentials", { email, password, redirect: false })` を呼びます。  
ここで「credentials 方式でログインしたい」という要求を NextAuth に送ります。

### 3. `authorize`

NextAuth は `lib/auth.ts` の `authorize` を呼びます。  
ここが本当のログイン判定です。

### 4. DB からユーザー取得

`authorize` は `prisma.user.findUnique({ where: { email } })` でメールアドレス一致のユーザーを探します。

### 5. bcrypt で照合

DB に保存されているのは生パスワードではなく `passwordHash` です。  
そこで `bcrypt.compare(password, user.passwordHash)` で一致確認します。

### 6. JWT に情報を入れる

ログイン成功時、`jwt` callback が呼ばれ、`token.userId`, `token.shopId` に値を入れます。

### 7. session に情報を渡す

次に `session` callback で、JWT に入っていた `userId`, `shopId` を `session.user` に写します。

### 8. 画面側で session を使う

その後、管理画面や API で `getServerSession(authOptions)` を通じて session を読み、`session.user.shopId` を使います。

## 7-4. なぜ `session.user.shopId` を持たせるのか

このプロジェクトでは、**どの店舗の管理者か**が最重要です。  
ただ「ログイン済み」だけでは足りません。

必要なのは、

- 誰がログインしたか
- その人がどの店舗に対応しているか

の 2 つです。

だから `session.user.shopId` を持たせています。

これがあると API 側で、

- body の `shopId` を信用しない
- session から `shopId` を取る
- `where: { id: menuId, shopId: auth.shopId }` で絞る

という安全な書き方ができます。

## 7-5. 他店舗のデータを触れないようにする考え方

これがこのプロジェクトの認証設計の核心です。

### ダメな考え方

クライアントが送ってきた `shopId` をそのまま信じる。

これだと、悪意あるユーザーが body を書き換えて別店舗の ID を送り、他店データを触れる可能性があります。

### このプロジェクトの考え方

サーバーが持っている session の `shopId` を使う。

実際に、管理 API では `requireShopId()` を呼び、その `shopId` を DB 条件に使っています。

例:

- `GET /api/admin/menus`
    - `where: { shopId: auth.shopId }`
- `PUT /api/admin/menus/[menuId]`
    - まず `findFirst({ where: { id: menuId, shopId: auth.shopId } })`

この設計によって、「その店の管理者にしか、その店のデータを触らせない」が実現できます。

## 7-6. JWT セッションとは何か

このプロジェクトでは `session: { strategy: "jwt" }` を使っています。

これは、**ログイン状態を JWT 方式で保持する**という意味です。  
初学者向けに言うと、

- ログインのたびに「この人は誰か」を表す情報をトークンに入れる
- そのトークンをセッション管理に使う

という方式です。

このコードから確実に言えるのは、

- `jwt` callback でトークンへ `userId`, `shopId` を入れている
- `session` callback で画面向け session に渡している

ということです。

厳密な内部フォーマットの詳細まではこのコードだけでは追っていませんが、  
少なくとも開発者として意識すべき点は **「JWT に必要情報を入れ、session に渡して使う」** です。

## 7-7. Cookie とは何か

Cookie は、ブラウザに保存される小さなデータです。  
ログイン状態の維持でよく使われます。

このプロジェクトでも NextAuth が Cookie を使ってログイン状態を維持します。  
あなたが毎回パスワードを入れずに管理画面へ入れるのは、その Cookie があるからです。

## 7-8. 初学者が混乱しやすい points

### `authorize` はログイン画面の関数ではない

見た目上は `AdminLoginPageClient.tsx` の中からログインしていますが、本当の判定は `lib/auth.ts` の `authorize` です。

### `session` と `JWT` は同じではない

- JWT: セッション情報の元データに近いもの
- session: 画面やサーバーコードが使いやすい形に整えたもの

### `shopId` を session に入れるのは便利だからではなく、安全だから

ここを「ただの設計趣味」と思わないことが大切です。  
マルチテナント（複数店舗）では安全性に直結します。

### ミドルウェアだけで完全ではない

`middleware.ts` は管理ページ URL を守りますが、API 自体は `requireShopId()` で別途守っています。  
ページ保護と API 保護は別層です。

---

## 8. Prisma と PostgreSQL を徹底解説

## 8-1. Prisma とは何か

Prisma は ORM です。  
ORM とは、**データベースの表を、プログラムのオブジェクトとして扱いやすくする仕組み**です。

このプロジェクトでは、たとえば SQL を直接こう書いていません。

```sql
SELECT * FROM "Shop" WHERE id = '...';
```

代わりに TypeScript でこう書きます。

```ts
await prisma.shop.findUnique({ where: { id: shopId } });
```

これが ORM のよさです。

- 型が効く
- 書き間違いを減らせる
- 関連データも扱いやすい

## 8-2. PostgreSQL とは何か

PostgreSQL は、リレーショナルデータベースです。  
リレーショナルとは、**表同士の関係をきちんと持てる**という意味です。

このプロジェクトでは、

- User
- Shop
- MenuItem
- Allergen
- MenuItemAllergen

という複数の表が関係し合います。  
こういう関係の強いデータには PostgreSQL が向いています。

## 8-3. Prisma schema は何を表しているのか

`prisma/schema.prisma` は、DB の設計図です。  
ここに「どんな表があるか」「各列は何型か」「どう関連するか」が書かれています。

### `generator`

```prisma
generator client {
  provider = "prisma-client-js"
}
```

これは Prisma Client を生成する設定です。  
つまり「TypeScript から DB を触る道具を作ってください」という意味です。

### `datasource`

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

これは「接続先 DB は PostgreSQL で、接続 URL は環境変数 `DATABASE_URL` から読む」という意味です。

## 8-4. model, relation, enum, unique, id の意味

| 用語       | 意味                       | このプロジェクトの例                         |
| ---------- | -------------------------- | -------------------------------------------- |
| `model`    | テーブル定義               | `model User`, `model Shop`                   |
| `relation` | 表同士のつながり           | `Shop.user`, `MenuItem.shop`                 |
| `enum`     | 取りうる値を限定した型     | `AllergenStatus`                             |
| `unique`   | 重複禁止                   | `User.email`, `Shop.userId`, `Allergen.slug` |
| `id`       | 主キー。行を一意に識別する | 各 model の `id`                             |

### 例: `@id @default(cuid())`

これは「この列が主キーで、値が無ければ `cuid()` で自動生成する」という意味です。  
このプロジェクトでは文字列 ID を使っています。

## 8-5. このプロジェクトのテーブル設計を ER 図っぽく文章で説明

文章で図にすると、こうです。

- **User**
    - 店舗管理アカウント
    - 1 人の User は 0 または 1 件の Shop を持つ
- **Shop**
    - 店舗情報
    - 必ず 1 人の User に属する
    - 複数の MenuItem を持つ
- **MenuItem**
    - 各店舗のメニュー
    - 必ず 1 件の Shop に属する
    - 複数の Allergen と関係する
- **Allergen**
    - アレルゲン 28 品目マスタ
    - たくさんの MenuItem から参照される
- **MenuItemAllergen**
    - MenuItem と Allergen をつなぐ中間テーブル
    - さらに `status` を持つ

## 8-6. `User`, `Shop`, `MenuItem`, `Allergen`, `MenuItemAllergen` がどうつながっているか

### `User` と `Shop`

`Shop.userId` に `@unique` が付いているので、1 店舗 1 ユーザーの関係です。

- User 1 : 1 Shop

### `Shop` と `MenuItem`

`MenuItem.shopId` があるので、1 店舗に複数メニューを持てます。

- Shop 1 : N MenuItem

### `MenuItem` と `Allergen`

ここは直接つながっていません。  
`MenuItemAllergen` を挟みます。

- MenuItem 1 : N MenuItemAllergen
- Allergen 1 : N MenuItemAllergen

つまり全体としては、

- MenuItem N : N Allergen

の関係です。

## 8-7. なぜ中間テーブルが必要なのか

これは非常に重要です。

1 つのメニューには複数のアレルゲンが関係します。  
たとえば「卵を含む」「乳は含まない」「小麦は可能性あり」などです。

また、1 つのアレルゲンは多くのメニューに出ます。

このような **多対多（many-to-many）** の関係では、中間テーブルが必要です。

さらにこのプロジェクトでは、ただ「関係がある」だけでなく、  
その関係ごとに `status` を持たせたいです。

たとえば、

- メニュー A × 卵 → `CONTAINS`
- メニュー A × 乳 → `FREE`
- メニュー A × 小麦 → `MAY_CONTAIN`

この「組み合わせごとの状態」を保存するには、中間テーブルが最適です。

## 8-8. migration は何をしているのか

migration は、**スキーマ変更を実際の DB に反映する履歴**です。

このプロジェクトでは 2 つ確認できます。

- `20260301144342_init`
    - 初期テーブル作成
- `20260308085850_add_shop_cover_image`
    - `Shop` に `coverImageUrl` を追加

つまり migration は「DB の進化の履歴」です。

## 8-9. `prisma generate` と `prisma migrate` の違い

| コマンド          | 何をするか                           |
| ----------------- | ------------------------------------ |
| `prisma generate` | schema から Prisma Client を作り直す |
| `prisma migrate`  | schema 変更を DB に反映する          |

初学者向けに言い換えると、

- `generate`: アプリ側の道具を作る
- `migrate`: DB 側の構造を変える

です。

## 8-10. `findUnique`, `findFirst`, `findMany`, `create`, `update`, `upsert` などの意味

| メソッド       | 意味                             | このプロジェクトでの例                          |
| -------------- | -------------------------------- | ----------------------------------------------- |
| `findUnique`   | 一意キーで 1 件取る              | `user.findUnique({ where: { email } })`         |
| `findFirst`    | 条件に合う最初の 1 件を取る      | `menuItem.findFirst({ where: { id, shopId } })` |
| `findMany`     | 複数件取る                       | 店舗一覧、アレルゲン一覧                        |
| `create`       | 1 件作る                         | メニュー作成、登録                              |
| `createMany`   | 複数件まとめて作る               | `MenuItemAllergen` まとめ作成                   |
| `update`       | 1 件更新する                     | 店舗更新、メニュー更新                          |
| `updateMany`   | 複数件更新する                   | `move-menus-to-current-shop.ts`                 |
| `delete`       | 1 件削除する                     | メニュー削除                                    |
| `deleteMany`   | 複数件削除する                   | 既存リンク削除                                  |
| `upsert`       | あれば更新、なければ作成         | seed、アレルゲンリンク更新                      |
| `$transaction` | 複数処理をまとめて一体として扱う | メニュー作成 + アレルゲン作成                   |

### `findUnique` と `findFirst` の違い

- `findUnique` は、`email` や `id` のような **一意な列**に向いています
- `findFirst` は、`id + shopId` のような条件検索で 1 件欲しいときに向いています

このプロジェクトでは、多店舗安全性のために `findFirst({ where: { id, shopId } })` を多用しています。

---

## 9. Neon とどうつながっているか

## 9-1. Neon とは何か

Neon は、PostgreSQL 互換のクラウド DB サービスです。  
言い換えると、「PostgreSQL を自分でサーバー管理しなくても使いやすくしたもの」です。

## 9-2. PostgreSQL との関係

Neon は PostgreSQL 互換です。  
そのため、アプリ側から見ると「PostgreSQL に接続している」のとほぼ同じ扱いができます。

このプロジェクトでも、Prisma 側はこう書かれています。

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

ここに Neon 固有の SDK は出てきません。  
つまり、**Prisma が PostgreSQL として接続し、その接続先が Neon である**という構成です。

## 9-3. このプロジェクトでは接続文字列をどこで使うか

接続文字列は `prisma/schema.prisma` の `env("DATABASE_URL")` で使います。  
実際に値を読むのは Prisma です。

`lib/db.ts` には接続 URL 自体は書かれていません。  
`new PrismaClient()` を作るだけで、Prisma が内部的に `DATABASE_URL` を使います。

## 9-4. `.env` に何を書くのか

このリポジトリでキー名として確認できたものは次です。

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `BLOB_READ_WRITE_TOKEN`
- `NEXT_PUBLIC_APP_URL`
- `VERCEL_OIDC_TOKEN`

README にはさらに次も書かれています。

- `NEXTAUTH_URL`

ただし、実コード上で直接参照が確認できたのは主に以下です。

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXT_PUBLIC_APP_URL`

`BLOB_READ_WRITE_TOKEN` はコードで直接 `process.env` 参照していませんが、`@vercel/blob` が内部で利用する想定です。

## 9-5. Prisma が Neon にどう接続するのか

流れは単純です。

1. `.env` または本番環境に `DATABASE_URL` を設定する
2. その URL が Neon の PostgreSQL 接続 URL である
3. Prisma が `schema.prisma` を見て PostgreSQL に接続する
4. アプリコードは `prisma.user.findUnique(...)` のように普通に使う

つまり、アプリコードから見ると Neon を特別扱いしていません。

## 9-6. ローカル開発と本番でどう違うか

- **ローカル開発**
    - `DATABASE_URL` にローカル PostgreSQL を入れてもよい
    - Neon の接続 URL を入れてもよい
- **本番**
    - 通常はデプロイ先の環境変数に `DATABASE_URL` を入れる

この差は「コード」ではなく「環境変数の値」で切り替わります。

## 9-7. セキュリティ上、接続 URL をどう扱うべきか

- Git に秘密情報をコミットしない
- `DATABASE_URL` を画面側に出さない
- `NEXT_PUBLIC_` を付けるのはブラウザに出してよい値だけ

`DATABASE_URL` はサーバー専用です。  
もし `NEXT_PUBLIC_DATABASE_URL` のようにしてしまうと危険です。

## 9-8. このコードベースで Neon 固有実装はあるか

**Neon 固有 SDK や専用コードは未確認**です。  
コード上で確実に言えるのは、

- Prisma が
- PostgreSQL provider で
- `DATABASE_URL` を使って接続する

という点です。

したがって説明としては、  
**「Prisma が PostgreSQL 互換の Neon に接続している構成」**  
と理解するのが最も正確です。

---

## 10. API と画面のつながり

## 10-1. 画面から API を呼ぶとはどういうことか

画面から API を呼ぶとは、  
**ブラウザ側のコードが HTTP リクエストを送り、サーバー側の `route.ts` がそれを受け取る**ことです。

このプロジェクトでは、たとえば保存ボタンを押したときに `fetch` が使われます。

例:

- `fetch("/api/admin/menus", { method: "POST" })`
- `fetch("/api/admin/menus/${menuId}", { method: "PUT" })`
- `fetch("/api/admin/shop", { method: "PUT" })`

## 10-2. `fetch` の役割

`fetch` は、ブラウザからサーバーへリクエストを送る関数です。

このプロジェクトでは主に次の用途です。

- 新規登録
- メニュー作成
- メニュー更新
- メニュー削除
- 店舗更新
- 画像アップロード

## 10-3. 管理画面で保存ボタンを押したとき、何が起こるか

たとえばメニュー編集画面では次の流れです。

1. `MenuEditClient` の保存ボタンを押す
2. `onSave()` が走る
3. 入力値を整形する
4. 必要なら画像アップロード API を先に呼ぶ
5. その URL を含めて `PUT /api/admin/menus/[menuId]` を呼ぶ
6. API で認証確認、DB 更新
7. JSON が返る
8. Client 側で「保存しました」と表示し、`router.refresh()` する

## 10-4. エンドポイントごとの整理

| エンドポイント                      | 何のためにあるか         | 誰が使うか                | どんな入力を受け取るか                     | 何を返すか           | どの画面から呼ばれるか                                         |
| ----------------------------------- | ------------------------ | ------------------------- | ------------------------------------------ | -------------------- | -------------------------------------------------------------- |
| `GET /api/admin/menus`              | 管理者メニュー一覧取得   | 管理画面                  | なし                                       | `{ menus }`          | 現 UI からの利用は未確認                                       |
| `POST /api/admin/menus`             | 新規メニュー作成         | 管理画面                  | メニュー基本情報、画像 URL、アレルゲン状態 | `{ id }`             | `/admin/menus/new`、編集画面の新規作成                         |
| `GET /api/admin/menus/[menuId]`     | 1 件のメニュー詳細取得   | 管理画面                  | `menuId`                                   | `{ menu }`           | 現 UI からの利用は未確認                                       |
| `PUT /api/admin/menus/[menuId]`     | メニュー更新             | 管理画面                  | `menuId`、更新内容                         | `{ menu }`           | `/admin/menus/[menuId]/edit`                                   |
| `DELETE /api/admin/menus/[menuId]`  | メニュー削除             | 管理画面                  | `menuId`                                   | `{ ok: true }`       | `/admin/menus`                                                 |
| `POST /api/admin/register`          | 店舗アカウント新規登録   | 管理画面                  | `shopName`, `email`, `password`            | 作成した user / shop | `/admin/register`                                              |
| `GET /api/admin/shop`               | 店舗情報取得             | 管理画面                  | なし                                       | `{ shop }`           | 現 UI の初期表示は Server Component 直読みにしており利用未確認 |
| `PUT /api/admin/shop`               | 店舗情報更新             | 管理画面                  | 店舗名、説明、住所、営業時間、画像 URL     | `{ shop }`           | `/admin/shop`                                                  |
| `POST /api/admin/upload-menu-image` | メニュー画像アップロード | 管理画面                  | `FormData(file)`                           | `{ url, pathname }`  | メニュー新規 / 編集                                            |
| `POST /api/admin/upload-shop-image` | 店舗画像アップロード     | 管理画面                  | `FormData(file)`                           | `{ url }`            | 店舗編集                                                       |
| `GET /api/menus/[menuId]`           | 公開向けメニュー取得     | 公開側 or 将来利用        | `menuId`                                   | `{ menu }`           | 現公開ページからの利用は未確認                                 |
| `GET /api/allergens`                | アレルゲン一覧取得       | 公開 / 管理両方で利用可能 | なし                                       | `{ allergens }`      | 現ページは Prisma 直読みにしており利用未確認                   |

## 10-5. このプロジェクトの API 利用方針

初学者が混乱しやすいので、はっきり書きます。

このプロジェクトは、

- **表示初期データの取得**
    - Server Component が Prisma を直接呼ぶことが多い
- **ブラウザ操作による変更**
    - Client Component が `fetch` で API を呼ぶ

という使い分けです。

つまり、

- 「最初に画面を出すだけ」なら Server Component 直読みに寄せる
- 「ボタンを押して保存 / 削除する」なら API を使う

という設計です。

---

## 11. データの流れをストーリーで説明

ここでは、「ユーザー操作 → 画面 → API → 認証 → DB → レスポンス → 再表示」の順で追います。

## 11-1. 店舗がログインする流れ

1. **ユーザー操作**
    - 店舗管理者が `/admin/login` でメールアドレスとパスワードを入力する
2. **画面**
    - `AdminLoginPageClient` の `onSubmit` が動く
3. **API / 認証**
    - `signIn("credentials")` により NextAuth の認証処理へ進む
4. **認証**
    - `authorize` が DB から `User` を探す
    - `bcrypt.compare` でパスワード照合
    - `Shop` を取得し `shopId` を得る
5. **JWT**
    - `jwt` callback で `userId`, `shopId` をトークンに入れる
6. **session**
    - `session` callback で `session.user.shopId` に渡す
7. **レスポンス**
    - `signIn` の結果がクライアントへ返る
8. **再表示**
    - 成功時に `window.location.href = "/admin/menus"`

## 11-2. 管理画面でメニュー一覧を見る流れ

1. **ユーザー操作**
    - ログイン後に `/admin/menus` へ移動
2. **画面**
    - `app/admin/(dashboard)/menus/page.tsx` が実行される
3. **認証**
    - `requireSessionShopIdOrRedirect()` が `session.user.shopId` を確認
4. **DB**
    - `prisma.menuItem.findMany({ where: { shopId } })`
5. **レスポンス**
    - Server Component が JSX を返す
6. **再表示**
    - `MenuListPageClient` に初期一覧が表示される

ここでは API を挟んでいません。  
Server Component が直接 DB を読んでいます。

## 11-3. 新規メニューを作る流れ

1. **ユーザー操作**
    - `/admin/menus/new` で内容を入力し、「作成して編集へ」を押す
2. **画面**
    - `NewMenuForm.onSubmit` が動く
3. **画像アップロード**
    - 必要なら `POST /api/admin/upload-menu-image`
4. **API**
    - `POST /api/admin/menus`
5. **認証**
    - API で `requireShopId()` が session から `shopId` を取る
6. **DB**
    - `MenuItem` を作る
    - 必要なら `MenuItemAllergen` をまとめて作る
7. **レスポンス**
    - `{ id }` が返る
8. **再表示**
    - クライアントが `/admin/menus/[id]/edit` へ遷移

## 11-4. メニュー編集を保存する流れ

1. **ユーザー操作**
    - `/admin/menus/[menuId]/edit` で編集し、「保存する」を押す
2. **画面**
    - `MenuEditClient.onSave` が動く
3. **画像アップロード**
    - 新しい画像が選ばれていれば `POST /api/admin/upload-menu-image`
4. **API**
    - `PUT /api/admin/menus/[menuId]`
5. **認証**
    - `requireShopId()` が `shopId` を session から取得
6. **DB**
    - 対象メニューがその店のものか `findFirst({ id, shopId })` で確認
    - `menuItem.update(...)`
    - `menuItemAllergen.upsert(...)` を transaction で更新
7. **レスポンス**
    - 更新後の `menu` JSON
8. **再表示**
    - `saved` メッセージ表示
    - `router.refresh()` で最新表示

## 11-5. 公開ページでメニュー詳細を見る流れ

1. **ユーザー操作**
    - 利用者が `/shops/:shopId/menus/:menuId` を開く
2. **画面**
    - `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx` が実行される
3. **DB**
    - アレルゲンマスタ取得
    - `menuItem.findFirst({ where: { id: menuId, shopId, isPublished: true } })`
4. **処理**
    - 未登録アレルゲンを `FREE` 扱いで補完
    - 特定原材料 8 品目の強調表示データ作成
5. **クライアント側補助**
    - `UserAllergenPreferenceClient` が localStorage を読む
    - `MenuAllergenAlertClient` が個人設定とメニュー情報を突き合わせる
6. **再表示**
    - 価格、原材料、注意書き、アレルゲン 28 品目、個人向け警告が表示される

---

## 12. 初学者がつまずきやすいポイント集

### `page.tsx` と `route.ts` の違い

- `page.tsx`: 人が見る画面
- `route.ts`: プログラムが叩く API

保存ボタンで呼ぶのは `route.ts`、URL を開いて見るのは `page.tsx` です。

### Server Component と Client Component の違い

- Server Component: サーバーで動く。DB を直接読める
- Client Component: ブラウザで動く。`useState`, `window`, `fetch` が使える

このプロジェクトでは、初期表示は Server、操作は Client の分担が多いです。

### React コンポーネントと普通の関数の違い

- React コンポーネント: JSX を返して画面になる
- 普通の関数: 値を変換したり、補助処理をする

例:

- コンポーネント: `MenuEditClient`
- 普通の関数: `parsePriceYen`, `createStatusBySlug`

### Prisma は SQL を直接書かないのになぜ DB を触れるのか

Prisma が内部で SQL を組み立ててくれるからです。  
開発者は TypeScript で書き、Prisma が PostgreSQL 向けに変換します。

### NextAuth の session と JWT の違い

- JWT: ログイン情報の元データ
- session: アプリ側が使いやすい形にしたもの

このプロジェクトでは `jwt` callback で入れ、`session` callback で見せています。

### `shopId` を body ではなく session から取る理由

body は改ざんできます。  
session はサーバー側で検証されたログイン情報です。  
だから body の `shopId` より安全です。

### Route Group の意味

`(public)` や `(dashboard)` は URL には出ません。  
コードの整理のためだけに使います。

### migration の意味

DB 構造の変更履歴です。  
「この日付の時点で、どんなテーブル変更を入れたか」が残ります。

### `.env` の意味

秘密情報や環境ごとに変わる値をコードに直書きしないための仕組みです。  
DB URL や認証用 secret を入れます。

### なぜ API を経由するのか

ブラウザは DB を直接触れないし、触れてはいけません。  
保存や削除はサーバー側で認証確認してから行うべきだからです。

### なぜ「直接 Prisma を読むページ」と「API を呼ぶ画面」が混ざっているのか

役割が違うからです。

- 初期表示の読み取り: Server Component 直読みに向く
- ユーザー操作による変更: API に向く

### `params` や `searchParams` が `Promise` なのはなぜか

このコードは、最近の App Router の書き方に合わせて `await` できる形で受けています。  
「必ず Promise でないといけない」というより、互換性を見た安全寄りの書き方と理解するとよいです。

---

## 13. このプロジェクトを読むおすすめ順

初学者が一番理解しやすい順番は、次です。

1. **`prisma/schema.prisma`**
    - 理由: 何のデータがあるか分からないまま画面を読むと迷いやすいから
2. **`app` 全体の URL 構造**
    - 理由: どのページと API があるか地図を先に持ちたいから
3. **公開側ページ**
    - 理由: 読み取り中心で、比較的流れが素直だから
4. **管理画面ページ**
    - 理由: 認証付きだが、公開側を読んだ後なら差分として理解しやすいから
5. **`lib/auth.ts` と `lib/admin-auth.ts`**
    - 理由: 管理画面がどう守られているかを理解するため
6. **管理 API (`app/api/admin/**`)\*\*
    - 理由: 保存・更新・削除の裏側が分かるから
7. **Client Component**
    - 理由: `fetch` とフォーム送信を画面側から追えるから
8. **`prisma/seed.ts`**
    - 理由: 実データ例があると全体がつながるから
9. **`middleware.ts`, `next-auth.d.ts`, `scripts`**
    - 理由: 補助要素として最後に読む方が理解しやすいから

---

## 14. 学習ロードマップ

このコードベースをちゃんと理解するために、次に学ぶべき順番はこうです。

1. **HTML / CSS / JavaScript の基礎**
    - 理由: React と Next.js はその上に乗っているから
2. **React 基礎**
    - 理由: コンポーネント、props、state、イベント処理が画面理解の土台だから
3. **TypeScript 基礎**
    - 理由: このプロジェクトは strict mode で型が多く、型が読めると理解が一気に進むから
4. **Next.js App Router 基礎**
    - 理由: `app`, `page.tsx`, `layout.tsx`, `route.ts`, Server/Client Component の理解が必要だから
5. **HTTP / API 基礎**
    - 理由: `GET`, `POST`, `PUT`, `DELETE`, JSON, `fetch` が保存処理の前提だから
6. **認証の基礎**
    - 理由: session, cookie, JWT, hash が管理画面理解に直結するから
7. **DB / SQL の基礎**
    - 理由: テーブル、主キー、外部キー、1対多、多対多が Prisma の理解に必要だから
8. **Prisma**
    - 理由: 実際の DB 操作は Prisma 経由なので、最後に ORM の使い方を固めると実務に近いから
9. **デプロイ / 環境変数**
    - 理由: Neon, Vercel, Blob のつながりを運用視点で理解できるから

---

## 15. 用語集

### App Router

`app` ディレクトリを基準にページや API を定義する Next.js の仕組み。

### Route Handler

`app/api/**/route.ts` に書く API 処理。  
`GET`, `POST` などの関数を export する。

### Route Group

`(public)` のような、URL に出さない整理用フォルダ。

### Server Component

サーバー側で実行される React コンポーネント。  
DB を直接呼びやすい。

### Client Component

ブラウザ側で実行される React コンポーネント。  
`useState`, `fetch`, `window` が使える。

### Session

ログイン状態をアプリ側で扱うための情報。  
このプロジェクトでは `session.user.shopId` が重要。

### JWT

ログイン情報を持たせるトークン方式。  
このプロジェクトでは session の元データとして使う。

### Cookie

ブラウザに保存される小さなデータ。  
ログイン状態維持によく使われる。

### Credentials 認証

メールアドレスとパスワードを自前 DB で照合する認証方式。

### NextAuth

Next.js で認証を扱うライブラリ。

### Hash

元に戻しにくい形へ変換した値。  
パスワード保存で使う。

### bcrypt

パスワードをハッシュ化したり照合したりするライブラリ。

### ORM

データベースをコードから扱いやすくする仕組み。  
このプロジェクトでは Prisma。

### Prisma

TypeScript から PostgreSQL を扱う ORM。

### Schema

DB の設計図。  
テーブルや列や関係が書かれる。

### Migration

DB 構造変更の履歴。

### Model

Prisma でテーブルを表す単位。

### Relation

テーブル同士のつながり。

### Enum

取りうる値を限定した型。  
このプロジェクトでは `AllergenStatus`。

### `unique`

重複してはいけない制約。

### `id`

各行を一意に識別する主キー。

### `findUnique`

一意キーで 1 件取得する Prisma メソッド。

### `findFirst`

条件に合う最初の 1 件を取る Prisma メソッド。

### `findMany`

複数件取得する Prisma メソッド。

### `upsert`

あれば更新、なければ作成。

### Transaction

複数の DB 操作を「全部成功か、全部失敗か」でまとめる仕組み。

### Environment Variable

環境変数。  
秘密情報や環境依存値をコード外に置く方法。

### `DATABASE_URL`

Prisma が DB に接続するための URL。

### Neon

PostgreSQL 互換のクラウド DB サービス。

### Vercel

Next.js アプリを公開しやすいホスティング。

### Vercel Blob

画像などのファイルを保存するクラウドストレージ。

### `fetch`

ブラウザから API を呼ぶ関数。

### `localStorage`

ブラウザ内にデータを保存する仕組み。  
このプロジェクトでは一般利用者のアレルゲン設定に使う。

---

## このコードベースを読めるようになるための最短ルート

最短ルートは、**`schema.prisma` でデータ設計を掴む → `app` で URL と画面の地図を見る → `lib/auth.ts` で認証の流れを見る → `app/api/admin/**`と`MenuEditClient`/`ShopEditClient` で保存処理を追う\*\*、の順です。  
このプロジェクトは「Next.js 画面」「NextAuth 認証」「Prisma 経由の PostgreSQL」「必要に応じた API 呼び出し」が一直線につながっているので、その 1 本の流れを意識して読むと理解しやすくなります。

---

# 追補: 2026-04-06 の実装更新まとめ

## 追補の位置づけ

- この追補は 2026-04-06 時点の実装変更をまとめた補足教材です。
- 既存本文には更新前の説明が一部残る可能性があります。
- 今日の変更点については、この追補の説明を優先して読んでください。

## 1. 今日の更新で何が変わったか

2026-04-06 の更新では、特に **「未設定なのに安全に見えてしまう危険」** を減らす方向で実装が強化されました。

まず大きいのは、`UNKNOWN` が正式なアレルゲン状態として入ったことです。  
今は `CONTAINS`, `FREE`, `MAY_CONTAIN` に加えて `UNKNOWN` があり、`lib/allergens.ts` と `prisma/schema.prisma` の両方で確認できます。  
これは「まだ確認していない状態」を、はっきり別の意味として扱うためです。

次に、未設定を `FREE` と同じにしないようになりました。  
今の `createStatusBySlug()` は、まず 28 品目を `UNKNOWN` で埋めてから、保存済みデータで上書きします。  
つまり「DB に行が無いから安全」とは見なしません。

公開条件も、サーバー側で必須になりました。  
`app/api/admin/menus/route.ts` と `app/api/admin/menus/[menuId]/route.ts` では、`isPublished: true` にする時に `getMenuPublishValidationErrors()` を使います。  
メニュー名、原材料名、注意書き、アレルゲン 28 品目の確定がそろわないと公開できません。

update API の validation も強化されました。  
壊れた JSON、空のメニュー名、不正な価格、未知のアレルゲン slug、許可されない画像 URL などを API 側で弾きます。  
フロントエンドだけでなく、サーバー側でも入力を守る形になりました。

旧公開 API は削除されました。  
少なくとも現在のリポジトリ上では、`app/api/menus/_disabled/route.ts` というファイルは存在しません。  
そのため、古い抜け道のような API は「停止予定」ではなく、実装ファイルごと消えている状態です。

既存公開データを直す one-shot script も追加されました。  
`prisma/repair-published-menus.ts` は、過去データに残っている欠損アレルゲン行を `UNKNOWN` で補い、公開条件を満たさないメニューを下書きへ戻します。

seed も 28 品目完全化されました。  
`prisma/seed.ts` では、公開デモメニューについて 28 品目ぶんの状態を必ず作るようになっています。  
開発用データだからといって、不完全な公開データを作らない方針です。

GET API も 28 品目正規化へ変わりました。  
`GET /api/menus/[menuId]` と `GET /api/admin/menus/[menuId]` は、`buildAllergenRows()` を使って 28 品目をそろえて返します。  
欠損は `UNKNOWN` として見える形になります。

公開 UI では、`UNKNOWN` が文言から落ちないようになりました。  
`components/public/ShopMenuListClient.tsx` では件数表示だけでなく要約文にも未設定を残します。  
`components/public/MenuAllergenAlertClient.tsx` でも、`CONTAINS` や `MAY_CONTAIN` がある時に `UNKNOWN` を落とさず併記します。

seed の平文パスワードログ出力も削除されました。  
現在の `prisma/seed.ts` では `bcrypt.hash()` による保存はありますが、平文パスワードを `console.log` する処理は確認できません。

ログインと登録にはレート制限が追加されました。  
`lib/auth.ts` の `authorize()` にはログイン用、`app/api/admin/register/route.ts` には登録用の IP 単位レート制限があります。  
これは短時間の連続試行を減らすための壁です。

`/admin/register` にはモード制御も入りました。  
`lib/admin-registration.ts` により、`disabled`, `invite_only`, `open` の 3 モードを切り替えられます。  
`app/api/admin/register/route.ts` だけでなく `app/api/admin/onboarding/route.ts` でも同じ制御が使われています。

画像アップロード検証も強化されました。  
`lib/upload-images.ts` に処理が集約され、whitelist、5MB 上限、JSON エラー整形が共通化されています。

## 2. なぜこの変更が必要だったのか

未設定を `FREE` 扱いすると危険なのは、利用者が「その品目は入っていない」と受け取ってしまうからです。  
でも本当は、「まだ確認していない」だけかもしれません。  
アレルギー情報では、この差はとても大きいです。

旧 API が残っているとまずいのは、今の安全ルールを通らない古い入口になるかもしれないからです。  
新しい API で公開条件や認可を厳しくしても、古い API が残っていればそこから抜けられる可能性があります。

既存データも直さないといけないのは、コードを直しただけでは過去に保存された危険なデータが残るからです。  
たとえば、欠損アレルゲン行や不完全なのに公開中のメニューは、schema を変えただけでは自動で安全になりません。

seed が不完全だと危険なのは、開発中にそのデータを見た人が「この表示で正しいのだ」と誤解しやすいからです。  
教材やデモ用のデータも、安全な完成形に寄せた方が学習しやすくなります。

レート制限が必要なのは、正しい認証実装だけでは総当たりや BOT の連打を防ぎきれないからです。  
レート制限は「短時間の試行回数を減らす壁」です。

登録モード制御が必要なのは、`/admin/register` がそのまま公開されていると、誰でも店舗アカウント作成を試せてしまうからです。  
本番では、自己登録を止めるか、少なくとも招待制にする方が安全です。

アップロード検証が必要なのは、画像アップロードが外からファイルを受け取る処理だからです。  
何でも受け取ると、大きすぎるファイル、想定外の形式、不適切なエラー応答などの問題が起きやすくなります。

## 3. 今日追加・変更した重要ファイル

### `lib/allergens.ts`

- 何のためのファイルか: アレルゲン状態の共通ルールをまとめるファイルです。
- 今日何を変えたか: `UNKNOWN` を正式に扱い、28 品目の正規化、公開条件判定、notice 文言の統一を入れました。
- なぜ重要か: 画面ごとに意味がずれると、未設定が安全に見える事故が起きるからです。

### `app/api/admin/menus/route.ts`

- 何のためのファイルか: 管理者メニュー一覧取得と新規作成 API です。
- 今日何を変えたか: 公開条件のサーバー側判定、アレルゲン map validation、28 品目作成、画像 URL 検証を強化しました。
- なぜ重要か: 新規作成の時点で危険な公開データを作らないためです。

### `app/api/admin/menus/[menuId]/route.ts`

- 何のためのファイルか: 1 件のメニューの取得・更新・削除 API です。
- 今日何を変えたか: `GET` の 28 品目正規化、`PUT` の validation 強化、公開条件の再検証を入れました。
- なぜ重要か: 既存データ更新時の抜け道を防ぐためです。

### `app/api/menus/[menuId]/route.ts`

- 何のためのファイルか: 公開メニュー詳細 API です。
- 今日何を変えたか: 28 品目正規化と `UNKNOWN` 補完、画像 URL の再検証を入れました。
- なぜ重要か: 公開 API の意味を公開画面とそろえるためです。

### `prisma/repair-published-menus.ts`

- 何のためのファイルか: 既存公開データ是正用の one-shot script です。
- 今日何を変えたか: 新規追加されました。
- なぜ重要か: 過去データの欠損や不完全公開をコード修正後にまとめて直すためです。

### `prisma/seed.ts`

- 何のためのファイルか: 開発用の初期データを作る script です。
- 今日何を変えたか: 公開デモメニューを 28 品目完全化し、平文パスワードログ出力をしない形にしました。
- なぜ重要か: seed 自体が教材と確認用データの土台になるからです。

### `lib/auth.ts`

- 何のためのファイルか: NextAuth の旧ログイン設定本体です。
- 今日何を変えたか: ログイン試行の IP 単位レート制限を追加しました。
- なぜ重要か: 総当たり対策の最初の壁になるからです。

### `app/api/admin/register/route.ts`

- 何のためのファイルか: 旧認証の新規登録 API です。
- 今日何を変えたか: レート制限と登録モード制御を追加しました。
- なぜ重要か: 登録画面だけ閉じても API から登録できる状態を防ぐためです。

### `app/api/admin/onboarding/route.ts`

- 何のためのファイルか: Google ログイン後などの初回店舗作成 API です。
- 今日何を変えたか: `getAdminRegistrationGuard()` を使い、ここでも登録モード制御を通す形になっています。
- なぜ重要か: 登録 API だけ固くしても、初回セットアップ API が抜け道になると意味がないからです。

### `lib/rate-limit.ts`

- 何のためのファイルか: 簡易レート制限の共通処理です。
- 今日何を変えたか: ログイン・登録で使う基盤として追加されました。
- なぜ重要か: 同じ制限ロジックを 1 か所で管理できるからです。

### `lib/request-ip.ts`

- 何のためのファイルか: ヘッダーから送信元 IP を取り出す補助関数です。
- 今日何を変えたか: レート制限や監査ログで使う土台として加わりました。
- なぜ重要か: IP 単位制御や記録は、まず IP を安定して取れないと始まらないからです。

### `lib/admin-registration.ts`

- 何のためのファイルか: 登録モードと招待トークン判定の共通ルールです。
- 今日何を変えたか: `disabled`, `invite_only`, `open` の判定を集約しました。
- なぜ重要か: 画面側と API 側で同じ登録ルールを共有するためです。

### `lib/upload-images.ts`

- 何のためのファイルか: 画像アップロードの共通検証と共通エラー整形です。
- 今日何を変えたか: MIME whitelist、5MB 上限、Blob エラーの JSON 整形を集約しました。
- なぜ重要か: API ごとの差を減らし、同じ安全ルールで運用するためです。

### `app/api/admin/upload-shop-image/route.ts`

- 何のためのファイルか: 店舗画像アップロード API です。
- 今日何を変えたか: `lib/upload-images.ts` の共通検証を使うようになり、JSON エラーも統一されました。
- なぜ重要か: 店舗画像もメニュー画像と同じ安全基準で扱うためです。

### `app/api/admin/upload-menu-image/route.ts`

- 何のためのファイルか: メニュー画像アップロード API です。
- 今日何を変えたか: `lib/upload-images.ts` の共通検証を使うようになり、JSON エラーも統一されました。
- なぜ重要か: フォームから送られる画像の入口を安全にするためです。

## 4. UNKNOWN と FREE の違い

ここは特に大切です。

- `FREE` = 確認して「含まない」
- `UNKNOWN` = まだ未設定・未確認

`FREE` は、店舗が情報を確認したうえで「入っていない」と判断した状態です。  
一方 `UNKNOWN` は、まだ判断できていないだけです。

この違いが重要なのは、利用者が意思決定に使う情報だからです。  
もし `UNKNOWN` を `FREE` に見せてしまうと、利用者は「安全」と受け取るかもしれません。  
でも実際には、まだ確認できていないだけなら、その安心は間違っている可能性があります。

利用者への見え方としては、少なくとも次が必要です。

- 項目が欠けていても消さない
- `未設定` と分かる文言で出す
- `含む` や `可能性あり` がある時でも `未設定` を落とさない

今の公開 UI は、この考え方に近づくように更新されています。

## 5. one-shot script とは何か

`prisma/repair-published-menus.ts` を例にすると、one-shot script は **必要な時に 1 回だけ明示的に実行する補助プログラム** です。

migration との違いは次の通りです。

- migration は DB の構造を変えるものです。
- one-shot script は 既存データの中身を直すものです。

今回は `UNKNOWN` の導入や公開条件強化により、過去データの中にも直すべきものが出ました。  
たとえば、アレルゲン行が欠けているメニューや、不完全なのに公開中のメニューです。

この script は、そうしたものを 1 回だけまとめて直すために追加されています。  
具体的には、次を行います。

1. 欠けているアレルゲン行を `UNKNOWN` で補う
2. 公開条件を満たさない公開メニューを下書きへ戻す

## 6. 登録モード制御とは何か

登録モード制御とは、`/admin/register` をどの程度開くかを切り替える仕組みです。

### `disabled`

自己登録を止めるモードです。  
本番で一番安全です。

### `invite_only`

有効な招待トークンがある時だけ登録を許可するモードです。  
限定運用したい時に向いています。

### `open`

誰でも登録を試せるモードです。  
開発や限定検証では便利ですが、本番常用には向きません。

本番で `open` を避けるべき理由は、本人確認や審査フローがまだ確認できないからです。  
つまり、「誰が店舗を作っているか」を十分に確かめる仕組みが未確認のままです。

## 7. 画像アップロード検証とは何か

画像アップロード検証は、「どんな画像なら受け取ってよいか」を入口で確かめる処理です。

今の実装で確認できる主な内容は次の通りです。

- whitelist  
  JPEG / PNG / WebP / GIF / AVIF のみ受け付けます。
- 5MB 上限  
  5MB を超える画像は受け付けません。
- JSON エラー整形  
  Blob の設定不足なども、フロントが扱いやすい JSON エラーに直して返します。

なぜ制限が必要かというと、画像アップロードは外からファイルを受け取る処理だからです。  
何でも受け入れると、コスト、障害、想定外ファイルの混入、扱いづらいエラー応答などの問題が起きやすくなります。

## 8. 実際の確認手順

1. migration を本番向けに反映します。

```bash
npx prisma migrate deploy
```

2. Prisma Client を最新 schema に合わせて再生成します。

```bash
npx prisma generate
```

3. 既存公開データ是正 script を 1 回実行します。

```bash
npm run repair:published-menus
```

4. 開発用データを入れ直したい時は seed を実行します。

```bash
npm run seed
```

5. ビルドが通るか確認します。

```bash
npm run build
```

6. `GET /api/menus/[menuId]` を確認します。
   28 品目がそろって返り、欠損は `UNKNOWN` で見えることを確認します。

7. `GET /api/admin/menus/[menuId]` を確認します。
   管理 API 側でも 28 品目正規化が返ることを確認します。

8. `/admin/register` のモード確認をします。
   `ADMIN_REGISTRATION_MODE=disabled|invite_only|open` を切り替え、画面と API の両方で挙動が変わることを確認します。

9. レート制限を確認します。
   ログインや登録を短時間に何度も試し、制限が効くことを確認します。  
   ただし、ログイン画面の見え方は通常失敗と区別しにくい点に注意します。

10. 画像アップロード確認をします。
    5MB 以下の許可形式画像は通り、5MB 超や許可外 MIME は JSON エラーになることを確認します。

## 9. まだ残っている本番前課題

### 監査ログ

`AuditLog` テーブルと書き込み処理はあります。  
ただし、閲覧 UI や通知連携は未確認です。

### 画像URL保存ルールの厳格化

保存時・表示時の防御は入っています。  
一方で、既存 DB の外部 URL をどう洗い出して整理するかは未確認です。

### 公開登録を `open` で使う場合の本人確認

`open` モードはありますが、本人確認や審査フローは未確認です。  
そのため、本番で `open` を使うのは危険です。

### 店舗ページ公開条件

今は「公開メニューが 1 件以上ある店舗だけ見せる」実装です。  
店舗自体の公開 / 非公開フラグは schema 上で未確認です。

### 認証失敗時UX

ログイン失敗とレート制限到達時が、画面上では区別しにくい状態です。  
UX 改善の余地があります。

## 10. 今日の学習ポイント

- 未設定と安全は同じではありません。
- フロントエンドだけでなく、サーバー側で公開条件を守る必要があります。
- 過去データが危険なら、コード修正だけでは足りません。
- seed やアップロードのような補助機能も、安全設計の一部です。

## 11. 次に読むおすすめファイル順

1. `prisma/schema.prisma`
2. `lib/allergens.ts`
3. `lib/auth.ts`
4. `app/api/admin/menus/[menuId]/route.ts`
5. `prisma/repair-published-menus.ts`
6. `lib/admin-registration.ts`
7. `app/api/admin/register/route.ts`
8. `app/api/admin/onboarding/route.ts`
9. `lib/upload-images.ts`
10. `app/api/menus/[menuId]/route.ts`
