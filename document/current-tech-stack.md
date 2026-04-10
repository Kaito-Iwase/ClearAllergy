# ClearAllergy で今使っている技術まとめ

このドキュメントは、ClearAllergy で現在使っている技術を、初心者向けに整理した学習用メモです。  
単なる技術名の一覧ではなく、

- 何のために使っているのか
- このプロジェクト内のどこで使われているのか
- 似た技術と何が違うのか
- なぜこの技術を使っているのか

まで含めて説明します。

コードベースから確認できることだけを断定し、コードだけでは断定できないことは `未確認` と書きます。

---

## 1. このプロジェクトを支える技術の全体像

ClearAllergy は、1 つの技術だけでできているわけではありません。  
画面、サーバー処理、認証、データベース、画像保存といった役割ごとに、別の技術が協力しています。

### 画面を作る技術

- `Next.js`
- `React`
- `TypeScript`
- `Tailwind CSS`
- `Client Component`
- `Server Component`

ここは「見た目をどう出すか」と「入力をどう受けるか」を担当します。  
公開ページや管理画面の UI は、この層で作られています。

### サーバー処理を行う技術

- `Next.js App Router`
- `Route Handler`
- `fetch`
- `Server Component`

ここは「保存する」「更新する」「API を返す」といった処理を担当します。  
`app/api/**/route.ts` が代表的です。

### 認証の技術

- `NextAuth`
- `bcrypt`
- 補足: `Clerk` もコード上では併用されています

ここは「誰がログインしているか」「パスワードをどう安全に扱うか」を担当します。  
ClearAllergy では、旧認証として NextAuth と bcrypt を使いながら、Google ログイン導線側では Clerk も見られます。

### データベースの技術

- `Prisma`
- `PostgreSQL`
- `Neon`

ここは「店舗」「メニュー」「アレルゲン」「ユーザー」などのデータを保存する層です。  
コード上では Prisma が直接使われ、DB の種類は PostgreSQL です。  
Neon は PostgreSQL の接続先候補として README と教材に登場しますが、Neon 専用 SDK は未確認です。

### デプロイや画像保存の技術

- `Vercel`
- `Vercel Blob`

ここは「アプリを公開する場所」と「画像ファイルを保存する場所」です。  
`@vercel/blob` の利用はコードから確認できます。  
Vercel 本体は README と `.vercel` ディレクトリから利用想定が読み取れます。

### ブラウザ保存の技術

- `localStorage`

これはサーバーではなく、**今使っているブラウザの中だけ** にデータを保存する仕組みです。  
ClearAllergy では、一般利用者のアレルゲン設定保存に使っています。

---

## 2. 技術一覧表

| 技術名 | 何のために使うか | このプロジェクトのどこで使われているか | 初心者向けのやさしい説明 |
| --- | --- | --- | --- |
| Next.js | ページ、API、サーバー処理の土台 | `app/**`, `app/api/**`, `app/layout.tsx` | React アプリに「URL」「サーバー処理」「構成ルール」を足した土台です。 |
| React | 画面部品を作る | `components/**`, `page.tsx`, `layout.tsx` | ボタンやフォームやカードを部品として組み立てる技術です。 |
| TypeScript | 型でバグを減らす | `.ts`, `.tsx` 全体 | 「この値は文字列か数値か」を先に決めて、安全に書けるようにします。 |
| Tailwind CSS | CSS をクラスで書く | `className`, `tailwind.config.ts`, `app/globals.css` | 短いクラスを並べて見た目を作る方法です。 |
| NextAuth | 旧ログインの認証管理 | `lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts` | ログイン状態やセッション管理をまとめる認証ライブラリです。 |
| bcrypt | パスワードのハッシュ化と照合 | `lib/auth.ts`, `app/api/admin/register/route.ts`, `prisma/seed.ts` | パスワードをそのまま保存しないための道具です。 |
| Prisma | TypeScript から DB を扱う ORM | `lib/db.ts`, `prisma/schema.prisma`, `app/api/**` | SQL を毎回手書きせず、コードから DB を扱える仕組みです。 |
| PostgreSQL | 実データを保存する DB | `prisma/schema.prisma` | 表の形でデータを保存する、一般的なデータベースです。 |
| Neon | PostgreSQL の接続先候補 | README, `document/codebase-study-guide.md`, `.env.example` | PostgreSQL をクラウドで使いやすくしたサービスです。Neon 専用コードは未確認です。 |
| Vercel | アプリの公開先 | README, `.vercel` | Next.js アプリを公開しやすいホスティングです。 |
| Vercel Blob | 画像保存先 | `lib/upload-images.ts`, `app/api/admin/upload-*.ts` | 画像ファイルをクラウドへ保存する仕組みです。 |
| localStorage | ブラウザ内設定保存 | `lib/public-allergen-preferences.ts`, 公開側 Client Component | 今使っているブラウザの中だけに設定を保存します。 |
| Route Handler | API を書く入口 | `app/api/**/route.ts` | App Router で API を作るファイルです。 |
| Server Component | サーバー側で動く画面 | `app/(public)/**/page.tsx`, `app/admin/**/page.tsx` | ブラウザではなくサーバーで動き、DB を直接読みやすいコンポーネントです。 |
| Client Component | ブラウザ側で動く画面 | `components/admin/**`, `components/public/**` | 入力、ボタン操作、`fetch`、`localStorage` を扱うコンポーネントです。 |
| Clerk | Google ログイン系の認証基盤 | `app/layout.tsx`, `lib/auth/getCurrentAppUser.ts`, `components/admin/auth/AdminGoogleAuthButton.tsx` | NextAuth とは別系統の認証基盤です。現在は共存しているコードが見えます。 |

---

## 3. 技術ごとの詳しい説明

## 3-1. Next.js

Next.js は、このプロジェクトの全体の土台です。  
ページの URL、レイアウト、API、Server Component などをまとめて扱います。

### 何のために使っているか

- ページを URL ごとに分ける
- API を `app/api/**/route.ts` に書く
- Server Component で初期表示を作る

### どこで使っているか

- `app/page.tsx`
- `app/(public)/**`
- `app/admin/**`
- `app/api/**`

### 似た技術と何が違うか

React は画面部品を作る技術です。  
Next.js は、その React を使って「ページ全体の構造」まで作る技術です。

### なぜ使っているのか

ClearAllergy は公開ページと管理画面と API を同じリポジトリでまとめて管理したい構成です。  
そのため、Next.js の App Router と相性がよいです。

## 3-2. React

React は画面の部品を作る技術です。

### 何のために使っているか

- 入力フォームを作る
- メニューカードを作る
- ボタンや警告 UI を部品化する

### どこで使っているか

- `components/admin/menu/MenuEditClient.tsx`
- `components/public/ShopMenuListClient.tsx`
- `components/public/MenuAllergenAlertClient.tsx`

### 似た技術と何が違うか

Next.js が「アプリ全体の土台」なら、React は「画面部品そのもの」です。

### なぜ使っているのか

公開画面と管理画面の両方に、再利用したい UI が多いからです。  
React の部品化と state 管理が向いています。

## 3-3. TypeScript

TypeScript は JavaScript に型を足したものです。

### 何のために使っているか

- 入力値の型をはっきりさせる
- API の body や response の形を揃える
- `unknown` をそのまま使わず、検証してから扱う

### どこで使っているか

- 全 `.ts` / `.tsx` ファイル
- 例: `app/api/admin/menus/[menuId]/route.ts`

### 似た技術と何が違うか

JavaScript は柔軟ですが、間違った値も通りやすいです。  
TypeScript は「何が入るか」を先に決めて、読みやすく安全にします。

### なぜ使っているのか

このプロジェクトは、認証、価格、アレルゲン状態、画像 URL など、意味の違う値が多いです。  
型がある方が理解しやすく、バグも減らせます。

## 3-4. Tailwind CSS

Tailwind CSS は、見た目をクラスで作るための道具です。

### 何のために使っているか

- 余白、色、角丸、文字サイズなどを素早く指定する
- 公開画面と管理画面の UI を組み立てる

### どこで使っているか

- JSX の `className`
- `app/globals.css`
- `tailwind.config.ts`

### 似た技術と何が違うか

普通の CSS は自分でクラス名を作ることが多いです。  
Tailwind は、用意された小さなクラスを組み合わせて見た目を作ります。

### なぜ使っているのか

画面の種類が多くても、見た目を速く揃えやすいからです。

## 3-5. NextAuth

NextAuth は、旧ログイン機能の中心です。

### 何のために使っているか

- メールアドレス + パスワードのログイン
- セッション管理
- `shopId` を session に載せる

### どこで使っているか

- `lib/auth.ts`
- `app/api/auth/[...nextauth]/route.ts`
- `components/admin/auth/AdminLoginPageClient.tsx`

### 似た技術と何が違うか

`bcrypt` はパスワード照合の道具です。  
NextAuth は、それを含む「ログイン全体の流れ」を管理します。

### なぜ使っているのか

管理画面はログイン必須で、ログイン後は `shopId` を安全に持ち回る必要があるからです。

## 3-6. bcrypt

bcrypt は、パスワードを安全に扱うためのライブラリです。

### 何のために使っているか

- パスワードをハッシュ化して保存する
- ログイン時に照合する

### どこで使っているか

- `lib/auth.ts`
- `app/api/admin/register/route.ts`
- `prisma/seed.ts`

### 似た技術と何が違うか

NextAuth は認証全体を扱います。  
bcrypt は、その中で「パスワードを安全に比べる」部分だけを担当します。

### なぜ使っているのか

パスワードを平文のまま保存しないためです。

## 3-7. Prisma

Prisma は ORM です。

### 何のために使っているか

- `User`, `Shop`, `MenuItem` などを TypeScript から扱う
- migration と schema で DB 設計を管理する

### どこで使っているか

- `lib/db.ts`
- `prisma/schema.prisma`
- `app/api/admin/menus/route.ts`
- `app/(public)/shops/[shopId]/page.tsx`

### 似た技術と何が違うか

PostgreSQL は実際の DB 本体です。  
Prisma は、その DB をアプリコードから触りやすくする道具です。

### なぜ使っているのか

TypeScript との相性が良く、DB 設計とアプリコードをつなぎやすいからです。

## 3-8. PostgreSQL

PostgreSQL は、実際のデータを保存するリレーショナルデータベースです。

### 何のために使っているか

- ユーザー情報を保存する
- 店舗とメニューを保存する
- アレルゲン 28 品目と状態を保存する

### どこで使っているか

- `prisma/schema.prisma`
- `.env.example` の `DATABASE_URL`

### 似た技術と何が違うか

Prisma は DB そのものではなく、DB を扱うための ORM です。

### なぜ使っているのか

このプロジェクトは、ユーザー、店舗、メニュー、アレルゲンの関係が多いので、表の関係を扱う DB が向いています。

## 3-9. Neon

Neon は PostgreSQL 互換のクラウド DB サービスです。

### 何のために使っているか

教材と README では、PostgreSQL の接続先候補として説明されています。

### どこで使っているか

- README
- `document/codebase-study-guide.md`
- `.env.example` の説明文

### 似た技術と何が違うか

PostgreSQL は DB の種類です。  
Neon は、その PostgreSQL をクラウドで提供するサービスです。

### なぜ使っているのか

**推測**ですが、クラウド上で PostgreSQL を扱いやすくするためです。  
ただし、Neon 専用 SDK や Neon 固有処理はコード上で未確認です。

## 3-10. Vercel

Vercel は、アプリを公開するホスティングです。

### 何のために使っているか

- Next.js アプリのデプロイ先として想定されている

### どこで使っているか

- README
- `.vercel` ディレクトリ

### 似た技術と何が違うか

Vercel は「アプリを動かす場所」です。  
Vercel Blob は「画像ファイルを置く場所」です。

### なぜ使っているのか

**推測**ですが、Next.js と相性がよく公開しやすいからです。  
デプロイ設定の詳細まではこのコードだけでは未確認です。

## 3-11. Vercel Blob

Vercel Blob は画像保存の仕組みです。

### 何のために使っているか

- 店舗画像を保存する
- メニュー画像を保存する

### どこで使っているか

- `lib/upload-images.ts`
- `app/api/admin/upload-menu-image/route.ts`
- `app/api/admin/upload-shop-image/route.ts`

### 似た技術と何が違うか

Vercel はアプリの公開先です。  
Vercel Blob はファイル保存先です。

### なぜ使っているのか

画像をサーバーのローカルディスクに置かず、クラウド側へ保存したいからです。

## 3-12. localStorage

localStorage はブラウザ内の保存機能です。

### 何のために使っているか

- 一般利用者のアレルゲン設定を保存する

### どこで使っているか

- `lib/public-allergen-preferences.ts`
- `components/public/UserAllergenPreferenceClient.tsx`
- `components/public/MenuAllergenAlertClient.tsx`

### 似た技術と何が違うか

PostgreSQL は全体で共有する DB です。  
localStorage は、今の端末・今のブラウザだけに保存する仕組みです。

### なぜ使っているのか

利用者がログインしなくても、自分向けアレルゲン設定を保持できるからです。

---

## 4. 特に混同しやすいものの違い

## 4-1. Next.js と React の違い

- React: 画面部品を作る
- Next.js: その React 部品をページや API と結びつける

React は「部品」、Next.js は「アプリ全体の土台」です。

## 4-2. Prisma と PostgreSQL の違い

- PostgreSQL: 実際にデータを保存する DB
- Prisma: その DB を TypeScript から扱いやすくする ORM

Prisma は DB そのものではありません。

## 4-3. NextAuth と bcrypt の違い

- NextAuth: ログイン全体の管理
- bcrypt: パスワードの安全な保存と照合

NextAuth の中で bcrypt を使う、という関係です。

## 4-4. Server Component と Client Component の違い

- Server Component: サーバーで動く。DB を直接呼びやすい
- Client Component: ブラウザで動く。入力、`fetch`、`localStorage` を扱える

ClearAllergy では、初期表示は Server、操作は Client という分担が多いです。

## 4-5. Vercel と Vercel Blob の違い

- Vercel: アプリ全体を公開する場所
- Vercel Blob: 画像ファイルを保存する場所

同じ Vercel 系でも、役割は別です。

## 4-6. Neon と PostgreSQL の違い

- PostgreSQL: DB の種類
- Neon: PostgreSQL をクラウドで使うサービス

「PostgreSQL をどこで動かすか」の候補が Neon です。

---

## 5. このプロジェクトならではの技術のつながり

ClearAllergy では、技術が次のようにつながって動きます。

1. 画面入力  
   管理画面で、店名、メニュー名、価格、アレルゲン状態などを入力します。

2. Client Component  
   `MenuEditClient` や `NewMenuForm` が入力状態を持ちます。

3. `fetch` / API  
   保存ボタンを押すと、`fetch("/api/admin/menus/...")` のように API を呼びます。

4. Route Handler  
   `app/api/admin/menus/[menuId]/route.ts` などがリクエストを受け取ります。

5. 認証  
   管理 API では `shopId` を session から取り、本人の店舗だけを対象にします。

6. Prisma  
   Route Handler から `prisma.menuItem.update(...)` のように DB 操作します。

7. PostgreSQL / Neon  
   Prisma が PostgreSQL へつなぎます。Neon を使う場合は、その PostgreSQL を Neon 側でホストします。

8. 画面への反映  
   保存結果を返し、Client Component が再表示したり `router.refresh()` したりします。

公開画面側では、別の流れもあります。

1. 利用者がページを開く
2. Server Component が Prisma で初期データを読む
3. `MenuAllergenAlertClient` が `localStorage` の個人設定と突き合わせる
4. 利用者ごとの警告表示が出る

---

## 6. 今の技術選定の意味

### なぜこの組み合わせなのか

このプロジェクトは、公開ページ、管理画面、認証、API、画像アップロード、DB が 1 つにつながっています。  
そのため、

- Next.js で画面と API をまとめる
- React で UI を部品化する
- TypeScript で安全に書く
- Prisma で DB とつなぐ
- NextAuth と bcrypt で旧認証を支える
- Vercel Blob で画像を保存する

という組み合わせは、かなり自然です。

### 初心者がどこから学ぶと理解しやすいか

次の順が理解しやすいです。

1. React と JSX
2. Next.js の `app` ディレクトリ
3. Server Component と Client Component
4. `fetch` と Route Handler
5. Prisma と `schema.prisma`
6. NextAuth と session

### このプロジェクトで特に重要な技術は何か

特に重要なのは次の 5 つです。

1. `Next.js`
2. `Prisma`
3. `NextAuth`
4. `Server Component / Client Component`
5. `lib/allergens.ts` を中心としたアレルゲン共通ロジック

最後の 1 つは厳密には技術名ではありませんが、このプロジェクトを理解する上ではとても重要です。

---

## 7. 今後理解を深めるために読むべきファイル

初心者向けのおすすめ順は次の通りです。

1. `document/codebase-study-guide.md`  
   全体の地図をつかむための教材です。

2. `prisma/schema.prisma`  
   何のデータがあるかを先に理解できます。

3. `lib/auth.ts`  
   ログインと `shopId` の扱いが分かります。

4. `lib/allergens.ts`  
   ClearAllergy らしさが一番強い共通ロジックです。

5. `app/api/admin/menus/[menuId]/route.ts`  
   管理 API の更新処理と validation が見えます。

6. `app/api/menus/[menuId]/route.ts`  
   公開 API がどう返すかを確認できます。

7. `prisma/repair-published-menus.ts`  
   既存データを直す考え方が学べます。

8. `lib/admin-registration.ts`  
   登録モード制御の考え方が分かります。

9. `lib/upload-images.ts`  
   画像アップロードの共通安全策が分かります。

10. 補足で読むとよいもの  
   `components/admin/menu/MenuEditClient.tsx`  
   `components/public/MenuAllergenAlertClient.tsx`  
   `lib/public-allergen-preferences.ts`

---

## まとめ

ClearAllergy の今の技術構成は、**Next.js を土台にして、React で画面を作り、TypeScript で安全に書き、Prisma で PostgreSQL を扱い、NextAuth と bcrypt で旧認証を支え、Vercel Blob で画像を保存する構成**です。  
さらに、公開ページでは `localStorage` を使って、ログイン不要でも個人向けアレルゲン設定を保存しています。

初心者が最初に覚えるべきなのは、技術名を暗記することではなく、

- どの技術が画面担当か
- どの技術がサーバー担当か
- どの技術が認証担当か
- どの技術が DB 担当か

を分けて理解することです。  
その上で、このプロジェクト特有の「アレルゲン 28 品目」「`shopId` による管理」「公開側と管理側の分離」を読むと、全体がつながりやすくなります。
