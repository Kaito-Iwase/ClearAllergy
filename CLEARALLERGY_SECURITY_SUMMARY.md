# ClearAllergy セキュリティ対策まとめ

## 1. この資料の目的

この資料は、ClearAllergy に実装されているセキュリティ対策を、就活用ポートフォリオ説明、開発メンバー共有、セキュリティレビュー記録として使える形でまとめたものです。

単なる脆弱性一覧ではなく、「どのようなリスクに対して、どのような技術的対策をしているのか」を、実際のファイル名・関数名とセットで説明します。

補足: このリポジトリ内を確認した範囲では、独立した Security Scan レポートファイルは見つかりませんでした。そのため、本文では「実コードで確認できたこと」と、ユーザー指定の「Security Scanで安全寄りと判断された観点」を分けて記載します。

## 2. ClearAllergyで守るべきもの

ClearAllergy は、飲食店のアレルゲン情報を公開する Web アプリです。守るべきものは主に次の通りです。

- アレルゲン情報: 利用者の健康リスクに関係するため、不正変更や誤公開を起こしにくくする必要があります。
- 店舗情報・メニュー情報: 店舗管理者が自分の店舗データだけを更新できる必要があります。
- 管理者アカウント: 店舗管理者や運営管理者になりすました操作を防ぐ必要があります。
- 招待情報: 店舗管理者を自由登録ではなく招待制にするための情報です。
- 画像URLとアップロード先: 外部URLの混入、不適切ファイル、ストレージ濫用を抑える必要があります。
- 秘密情報: `DATABASE_URL`、`DIRECT_URL`、`CLERK_SECRET_KEY`、`BLOB_READ_WRITE_TOKEN` などは公開してはいけません。

## 3. 全体のセキュリティ方針

### 管理領域と公開領域を分ける

- 想定されるリスク: 利用者向け公開画面から管理機能へアクセスされる、または認証機能が公開画面の表示に不要な影響を与える。
- 実装されている対策: 公開画面は `app/(public)/**`、管理画面は `app/admin/**`、管理APIは `app/api/admin/**` に分けられています。Clerk middleware は `proxy.ts` の `matcher` で管理領域中心に限定されています。
- 関係するファイル: `proxy.ts`, `app/layout.tsx`, `app/admin/layout.tsx`, `app/sign-in/layout.tsx`, `app/sign-up/layout.tsx`
- 初学者向け解説: 認証とは「誰がログインしているか」を確認する仕組みです。公開画面は誰でも見られるため、全ページでログイン確認を走らせる必要はありません。
- なぜ効果があるか: 認証が必要な範囲を管理画面と管理APIに寄せることで、公開画面の責務と管理画面の責務が混ざりにくくなります。
- まだ注意すべき点: `proxy.ts` の `matcher` に新しい管理APIを追加し忘れると、Clerk の認証文脈が取れない可能性があります。ただし最終的な認可は各API側のサーバーガードで行うべきです。

## 4. 認証：ログインユーザーを確認する仕組み

### Clerkによる認証

- 想定されるリスク: 未ログインユーザーが管理画面や管理APIを実行する。
- 実装されている対策: `lib/auth/getCurrentAppUser.ts` の `getCurrentClerkIdentity()` と `getCurrentAppUser()` が Clerk の `auth()` / `currentUser()` を使ってログイン中ユーザーを確認します。管理画面では `lib/admin-auth.ts` の `requireCurrentAdminContextOrRedirect()` が未ログインユーザーを `/admin/login` へリダイレクトします。
- 関係するファイル: `lib/auth/getCurrentAppUser.ts`, `lib/admin-auth.ts`, `app/admin/(dashboard)/layout.tsx`, `app/api/admin/_utils.ts`
- 初学者向け解説: Clerk はログインやセッション管理を担当する外部サービスです。アプリ側では「Clerk が認証したユーザーID」を受け取り、そのユーザーがどの店舗を持つかをDBで確認します。
- なぜ効果があるか: パスワードやセッション管理を自前実装せず、Clerk に寄せることで、アプリ側は店舗権限の確認に集中できます。
- まだ注意すべき点: Clerk にログインしているだけでは店舗操作を許可してはいけません。必ず次の認可チェックが必要です。

### ClerkProviderを管理・認証領域に限定

- 想定されるリスク: 公開ページ全体に認証プロバイダを広げ、不要なハンドシェイクやリダイレクトが公開画面に混ざる。
- 実装されている対策: root の `app/layout.tsx` には `ClerkProvider` がなく、`app/admin/layout.tsx`、`app/sign-in/layout.tsx`、`app/sign-up/layout.tsx` に限定されています。
- 関係するファイル: `app/layout.tsx`, `app/admin/layout.tsx`, `app/sign-in/layout.tsx`, `app/sign-up/layout.tsx`, `proxy.ts`
- 初学者向け解説: `ClerkProvider` は Clerk の認証状態を React 側で使うための部品です。公開画面に不要なら、管理画面だけに置く設計にできます。
- なぜ効果があるか: 公開側はログイン不要で安定して表示し、管理側だけ認証機能を使う分離ができます。
- まだ注意すべき点: 公開画面でログイン状態を使う機能を将来追加する場合は、設計を見直す必要があります。

## 5. 認可：操作してよいデータだけを扱う仕組み

### server-derived shopIdによる認可

- 想定されるリスク: クライアントが別店舗の `shopId` を送って、他店舗のメニューや店舗情報を更新する。
- 実装されている対策: `app/api/admin/_utils.ts` の `requireShopId()` が、サーバー側で Clerk ユーザーから店舗を解決し、`auth.shopId` を返します。管理APIはクライアントから送られた `shopId` ではなく、この `auth.shopId` を使っています。
- 関係するファイル: `app/api/admin/_utils.ts`, `lib/admin-auth.ts`, `app/api/admin/shop/route.ts`, `app/api/admin/menus/route.ts`, `app/api/admin/menus/[menuId]/route.ts`
- 初学者向け解説: 認可とは「ログイン済みの人が、そのデータを操作してよいか」を確認する仕組みです。ログイン済みでも、他店舗のデータは触れないようにします。
- なぜ効果があるか: 攻撃者がリクエスト本文に `shopId: "別店舗ID"` を入れても、API側はそれを権限判定に使いません。
- まだ注意すべき点: 新しい管理APIを追加するときも、必ず `requireShopId()` または同等のサーバー側認可を入れる必要があります。

危険な例:

```ts
// クライアントから来た shopId を信用している
await prisma.menuItem.create({
    data: {
        shopId: body.shopId,
        name: body.name,
    },
});
```

安全寄りな例:

```ts
const auth = await requireShopId();
if (!auth.ok) return auth.res;

await prisma.menuItem.create({
    data: {
        shopId: auth.shopId,
        name,
    },
});
```

## 6. IDORを起こしにくくする設計

### menuIdとshopIdを組み合わせた所有権確認

- 想定されるリスク: IDOR、つまり「URLのIDを他人のIDに変えるだけで他人のデータを見たり操作したりできる」脆弱性。
- 実装されている対策: `app/api/admin/menus/[menuId]/route.ts` の `GET`、`PUT`、`DELETE` では、対象メニューを `where: { id: menuId, shopId: auth.shopId }` で検索しています。管理画面の編集ページ `app/admin/(dashboard)/menus/[menuId]/edit/page.tsx` でも同じ考え方で `where: { id: menuId, shopId }` を使っています。
- 関係するファイル: `app/api/admin/menus/[menuId]/route.ts`, `app/admin/(dashboard)/menus/[menuId]/edit/page.tsx`
- 初学者向け解説: `menuId` だけで検索すると、IDが分かれば他店舗のメニューも見つかる可能性があります。`shopId` も条件に入れることで、「このメニューが自分の店舗のものか」を同時に確認できます。
- なぜ効果があるか: 他店舗の `menuId` を指定しても、`shopId` が一致しないため検索結果が `null` になり、404 になります。
- まだ注意すべき点: `PUT` 内の実際の `update` は `where: { id: menuId }` ですが、その前に `findFirst({ id, shopId })` で所有権確認しています。将来コードを変更する場合は、この事前確認を削らないことが重要です。

危険な例:

```ts
// menuId だけで更新しているため、他店舗IDでも通る可能性がある
await prisma.menuItem.update({
    where: { id: menuId },
    data: { name },
});
```

安全寄りな例:

```ts
const existing = await prisma.menuItem.findFirst({
    where: { id: menuId, shopId: auth.shopId },
    select: { id: true },
});
if (!existing) {
    return NextResponse.json({ error: "menu not found" }, { status: 404 });
}
```

## 7. 管理APIの保護

### app/api/admin配下の共通ガード

- 想定されるリスク: 未ログインユーザー、店舗未設定ユーザー、他店舗ユーザーが管理APIを実行する。
- 実装されている対策: 多くの管理APIが `requireShopId()` を呼び、未ログインなら 401、店舗がなければ 403 を返します。更新系APIでは `enforceSameOriginAdminMutation()` で `Origin` ヘッダーも確認しています。
- 関係するファイル: `app/api/admin/_utils.ts`, `lib/admin-api-security.ts`
- 初学者向け解説: APIは画面からだけでなく、curl やブラウザ開発者ツールから直接呼べます。そのため、画面側の制御だけでなくAPI側にもチェックが必要です。
- なぜ効果があるか: API直打ちでも、サーバー側でログイン・店舗所有・同一オリジンを確認します。
- まだ注意すべき点: 同一オリジン確認はCSRFリスクを下げますが、認証・認可の代わりではありません。

### GET / POST / PUT / DELETE の確認状況

- 想定されるリスク: HTTPメソッドごとに保護の抜けが生まれる。
- 実装されている対策:
    - `GET /api/admin/menus`: `requireShopId()` 後、`where: { shopId: auth.shopId }`
    - `POST /api/admin/menus`: `enforceSameOriginAdminMutation()`、`requireShopId()`、`requirePortfolioMutationAccessApi()`
    - `GET /api/admin/menus/[menuId]`: `requireShopId()`、`where: { id: menuId, shopId: auth.shopId }`
    - `PUT /api/admin/menus/[menuId]`: 同一オリジン、`requireShopId()`、Portfolio guard、所有権確認
    - `DELETE /api/admin/menus/[menuId]`: 同一オリジン、`requireShopId()`、Portfolio guard、所有権確認
    - `GET /api/admin/shop`: `requireShopId()` 後、`where: { id: auth.shopId }`
    - `PUT /api/admin/shop`: 同一オリジン、`requireShopId()`、Portfolio guard、`where: { id: auth.shopId }`
- 関係するファイル: `app/api/admin/menus/route.ts`, `app/api/admin/menus/[menuId]/route.ts`, `app/api/admin/shop/route.ts`
- 初学者向け解説: GETは取得、POSTは作成、PUTは更新、DELETEは削除です。特にPOST/PUT/DELETEはデータを変えるため、より強く守る必要があります。
- なぜ効果があるか: 読み取り・作成・更新・削除のどの操作でも、店舗の所有権を確認する流れになっています。
- まだ注意すべき点: 新規API追加時に同じパターンを守る必要があります。

## 8. 公開APIの情報制限

### 表示に必要なフィールドだけ返す

- 想定されるリスク: 公開APIから管理者向け情報、内部ID、秘密情報、非公開データが漏れる。
- 実装されている対策: Prisma の `select` で返す列を限定しています。`/api/allergens` は `slug`、`nameJa`、`nameEn`、`sortOrder` のみ返します。公開店舗ページや公開メニュー詳細も、表示用フィールド中心です。
- 関係するファイル: `app/api/allergens/route.ts`, `app/api/menus/[menuId]/route.ts`, `app/(public)/shops/page.tsx`, `app/(public)/shops/[shopId]/page.tsx`, `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx`
- 初学者向け解説: `select` は「DBからどの列を取るか」を指定する仕組みです。必要な列だけ取ると、うっかり余計な情報を返しにくくなります。
- なぜ効果があるか: `ownerClerkUserId` や `passwordHash` のような内部情報を公開APIのレスポンスに含める事故を起こしにくくします。
- まだ注意すべき点: `app/api/menus/[menuId]/route.ts` と公開メニュー詳細ページでは `shop.isActive` 条件が不足しています。inactive shop の公開メニュー詳細/APIに `shop: { isActive: true }` 相当の条件を追加する必要があります。

### published / active 条件

- 想定されるリスク: 下書きメニューや準備中店舗が公開される。
- 実装されている対策: 公開店舗一覧 `app/(public)/shops/page.tsx` と公開店舗詳細 `app/(public)/shops/[shopId]/page.tsx` は `isActive: true` と `menus.some.isPublished: true` を見ています。公開メニュー詳細ページと公開メニューAPIは `isPublished: true` を見ています。
- 関係するファイル: `app/(public)/shops/page.tsx`, `app/(public)/shops/[shopId]/page.tsx`, `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx`, `app/api/menus/[menuId]/route.ts`
- 初学者向け解説: `isPublished` はメニューの公開フラグ、`isActive` は店舗の有効状態です。公開画面では両方を見るのが安全寄りです。
- なぜ効果があるか: 下書きや未公開メニューをURL直打ちで見られるリスクを下げます。
- まだ注意すべき点: メニュー詳細/API側の `shop.isActive` 条件追加が必要です。

## 9. PORTFOLIO_MODEによる変更操作の制限

### ポートフォリオ公開時の読み取り専用化

- 想定されるリスク: ポートフォリオを見に来た第三者が、デモ管理画面やAPIからデータを保存・更新・削除する。
- 実装されている対策: `lib/portfolio-mode.ts` の `isPortfolioMode()` が `PORTFOLIO_MODE === "true"` を見ます。`requirePortfolioMutationAccessApi()` は、Portfolio mode中に `publicMetadata.role === "admin"` でないユーザーの変更操作を 403 にします。
- 関係するファイル: `lib/portfolio-mode.ts`, `app/api/admin/menus/route.ts`, `app/api/admin/menus/[menuId]/route.ts`, `app/api/admin/shop/route.ts`, `app/api/admin/upload-menu-image/route.ts`, `app/api/admin/upload-shop-image/route.ts`, `app/api/admin/invitations/route.ts`, `app/api/admin/invitations/[inviteId]/resend/route.ts`, `app/api/admin/invitations/[inviteId]/revoke/route.ts`, `app/api/invitations/accept/route.ts`
- 初学者向け解説: ポートフォリオ公開では「見せること」は必要ですが、「誰でも保存できること」は危険です。そこで閲覧は可能、変更は制限というモードを用意しています。
- なぜ効果があるか: 主要な作成・更新・削除・アップロード・招待承認ルートにガードが入っており、デモ公開中のデータ破壊リスクを下げています。
- まだ注意すべき点: 例外的に変更を許可するのは Clerk の `publicMetadata.role === "admin"` を持つ app-admin です。このメタデータ付与は強い権限なので、運用上の管理が必要です。

## 10. 招待制による管理者登録の制限

### 自由登録を止め、招待制に寄せる

- 想定されるリスク: 誰でも店舗管理者として登録し、スパム店舗や不正店舗を作成する。
- 実装されている対策: `lib/admin-registration.ts` の `getAdminRegistrationMode()` は常に `"disabled"` を返し、旧環境変数が残っていても自由登録に戻らないようにしています。店舗管理者の追加は `AdminInvite` と Clerk invitation を使う設計です。
- 関係するファイル: `lib/admin-registration.ts`, `app/api/admin/register/route.ts`, `app/api/admin/onboarding/route.ts`, `app/api/admin/invitations/route.ts`, `lib/invitations.ts`, `prisma/schema.prisma`
- 初学者向け解説: 招待制とは、運営が招待したメールアドレスだけが管理者になれる仕組みです。URLを知っているだけでは登録できないようにします。
- なぜ効果があるか: 自由登録を閉じ、運営管理者だけが招待を作成できるため、管理者の増加をコントロールできます。
- まだ注意すべき点: `app/api/invitations/accept/route.ts` と `lib/invitations.ts` は Clerk の現在メールと `AdminInvite.email` の一致を見ていますが、メールが verified か、Clerk invitation ticket とローカル招待が強く紐づいているかまでは確認していません。今後、verified email または ticket-binding の確認を追加する必要があります。

### 運営管理者だけが招待を操作する

- 想定されるリスク: 一般店舗管理者が別店舗の管理者招待を作成・再送・取消する。
- 実装されている対策: `lib/admin-platform-auth.ts` の `requirePlatformAdminApi()` が Clerk の `publicMetadata.role === "admin"` を確認します。`app/admin/invitations/page.tsx` も `requirePlatformAdminOrRedirect()` で保護されています。
- 関係するファイル: `lib/admin-platform-auth.ts`, `app/admin/invitations/page.tsx`, `app/api/admin/invitations/route.ts`, `app/api/admin/invitations/[inviteId]/resend/route.ts`, `app/api/admin/invitations/[inviteId]/revoke/route.ts`
- 初学者向け解説: 店舗管理者と運営管理者は別の権限です。店舗管理者は自分の店舗を管理し、運営管理者は招待を管理します。
- なぜ効果があるか: 招待作成を app-admin に限定し、管理者権限の拡散を起こしにくくしています。
- まだ注意すべき点: Clerk の metadata は管理画面やClerk Dashboard側の運用ミスが影響するため、付与・削除の手順を限定する必要があります。

## 11. PrismaによるDB操作とSQL Injection対策

### Prisma Clientによる型付きクエリ

- 想定されるリスク: SQL Injection、つまり入力文字列をSQL文に混ぜてDB操作を改ざんされる攻撃。
- 実装されている対策: ほとんどのDB操作は Prisma Client の `findMany`、`findFirst`、`create`、`update`、`delete`、`createMany` などで実装されています。
- 関係するファイル: `lib/db.ts`, `app/api/admin/menus/route.ts`, `app/api/admin/menus/[menuId]/route.ts`, `app/api/admin/shop/route.ts`, `lib/invitations.ts`
- 初学者向け解説: Prisma はSQLを直接文字列で組み立てる代わりに、オブジェクト形式でDB条件を書ける仕組みです。値は安全にパラメータとして扱われやすくなります。
- なぜ効果があるか: 文字列連結でSQLを作る場面が少なくなり、SQL Injection のリスクを下げます。
- まだ注意すべき点: Prisma はSQL Injectionリスクを下げますが、認可漏れは防いでくれません。`where` 条件に `shopId` や `userId` を含める設計はアプリ側の責任です。

危険な例:

```ts
// SQL文字列に入力値を連結するのは危険
await prisma.$queryRawUnsafe(
    `SELECT * FROM "MenuItem" WHERE "id" = '${menuId}'`,
);
```

安全寄りな例:

```ts
await prisma.menuItem.findFirst({
    where: { id: menuId, shopId: auth.shopId },
});
```

### raw SQL の確認

- 想定されるリスク: `$queryRaw` や `$executeRaw` の使い方を誤り、SQL Injection が起きる。
- 実装されている対策: 確認できた raw SQL は `lib/invitations.ts` の `tx.$queryRaw` と `scripts/backfill-pistachio-allergen.ts` の `prisma.$executeRaw` です。どちらも Prisma のテンプレートタグ形式で、`${email}` や `${allergen.id}` のように値をバインディングしています。
- 関係するファイル: `lib/invitations.ts`, `scripts/backfill-pistachio-allergen.ts`
- 初学者向け解説: バインディングとは、SQL文そのものと入力値を分けてDBへ渡すことです。値がSQL命令として解釈されにくくなります。
- なぜ効果があるか: `queryRawUnsafe` や文字列連結が見つからず、raw SQL箇所も安全寄りの書き方です。
- まだ注意すべき点: raw SQLを追加する場合はテンプレートタグ形式を使い、`$queryRawUnsafe` は避ける必要があります。

## 12. 環境変数と秘密情報の管理

### .envをGit管理しない

- 想定されるリスク: DB接続文字列、Clerk secret、Blob token がGitHub等に漏れる。
- 実装されている対策: `.gitignore` に `.env`、`.env*.local`、`.vercel`、`/.clerk/` が含まれています。`.env.example` は空値またはサンプル値で、実秘密情報は入っていません。
- 関係するファイル: `.gitignore`, `.env.example`, `README.md`
- 初学者向け解説: `.env` は秘密の設定を置くファイルです。Git管理すると、リポジトリを見られる人に秘密が渡ってしまいます。
- なぜ効果があるか: ローカルやVercelで設定する秘密情報をコードから分離できます。
- まだ注意すべき点: 作業ディレクトリには `.env` と `.env.local` が存在しますが、`.gitignore` 対象です。中身をレビュー資料やREADMEに貼らないことが重要です。

### NEXT*PUBLIC* とサーバー専用環境変数の分離

- 想定されるリスク: ブラウザへ公開される `NEXT_PUBLIC_` 変数に秘密情報を入れる。
- 実装されている対策: `.env.example` では `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` と `NEXT_PUBLIC_APP_URL` が公開用で、`CLERK_SECRET_KEY`、`DATABASE_URL`、`DIRECT_URL`、`BLOB_READ_WRITE_TOKEN` は `NEXT_PUBLIC_` なしのサーバー用になっています。
- 関係するファイル: `.env.example`, `lib/auth/clerkAdminCore.ts`, `prisma/schema.prisma`, `lib/upload-images.ts`
- 初学者向け解説: Next.js では `NEXT_PUBLIC_` が付いた環境変数はブラウザ側にも届きます。秘密情報には付けてはいけません。
- なぜ効果があるか: サーバーだけが使うべきトークンをブラウザに露出しにくくしています。
- まだ注意すべき点: 新しい外部サービスを追加するときも、公開キーと秘密キーを分ける必要があります。

## 13. 画像アップロードの制限

### ファイルサイズとMIME type制限

- 想定されるリスク: 巨大ファイルによるストレージ濫用、画像以外のファイルアップロード、不適切な拡張子の保存。
- 実装されている対策: `lib/upload-images.ts` の `validateImageFile()` が `image/jpeg`、`image/png`、`image/webp`、`image/gif`、`image/avif` のみ許可し、サイズは `MAX_UPLOAD_FILE_SIZE = 5 * 1024 * 1024`、つまり5MB以下に制限しています。
- 関係するファイル: `lib/upload-images.ts`, `app/api/admin/upload-menu-image/route.ts`, `app/api/admin/upload-shop-image/route.ts`
- 初学者向け解説: MIME type はファイルの種類を表す情報です。たとえば `image/png` はPNG画像を表します。
- なぜ効果があるか: 明らかに画像ではないファイルや大きすぎるファイルを保存前に弾けます。
- まだ注意すべき点: 現状は `file.type`、つまりクライアントから送られるMIME typeを信頼しています。攻撃者が偽装できる可能性があるため、magic bytes、つまりファイル先頭の実バイト列を確認する対策を追加すべきです。

### 保存先と画像URLポリシー

- 想定されるリスク: 他店舗の画像URLを使い回す、外部の追跡用画像や不適切画像URLをDBに保存する。
- 実装されている対策: メニュー画像は `menu-images/${auth.shopId}/...`、店舗画像は `shops/${auth.shopId}/cover-...` に保存します。`lib/image-url-policy.ts` の `sanitizeStoredImageUrl()` / `validateStoredImageUrl()` は Vercel Blob のホストと、店舗IDを含むパスを確認します。
- 関係するファイル: `lib/image-url-policy.ts`, `lib/upload-images.ts`, `app/api/admin/upload-menu-image/route.ts`, `app/api/admin/upload-shop-image/route.ts`, `app/api/admin/shop/route.ts`, `app/api/admin/menus/route.ts`, `app/api/admin/menus/[menuId]/route.ts`
- 初学者向け解説: 画像URLも入力値です。URLだから安全とは限らないため、「このサービスがアップロードしたURLか」を確認しています。
- なぜ効果があるか: 外部URLの混入や、別店舗画像の流用を起こしにくくします。
- まだ注意すべき点: Blobは `access: "public"` で保存されるため、URLを知っている人は画像を見られます。機密画像を置く用途には向きません。

## 14. エラーハンドリング

### 内部情報を出しすぎないレスポンス

- 想定されるリスク: 例外メッセージ、DB構造、スタックトレースなどが攻撃者に見える。
- 実装されている対策: `app/api/admin/_utils.ts` の `internalError()` は `console.error(e)` でサーバーログへ出し、本番では `{ error: "Internal Server Error" }` のみ返します。画像アップロードでは `buildUploadJsonError()` がBlobの失敗を利用者向けメッセージへ変換しています。
- 関係するファイル: `app/api/admin/_utils.ts`, `lib/upload-images.ts`, `lib/db-errors.ts`
- 初学者向け解説: サーバーログは開発者が見るもの、APIレスポンスは利用者や攻撃者も見られるものです。出す情報を分ける必要があります。
- なぜ効果があるか: 攻撃者が内部構造を推測する材料を減らせます。
- まだ注意すべき点: 開発環境ではエラーメッセージを返す実装があります。本番 `NODE_ENV=production` で運用する必要があります。

### 401 / 403 / 404 / 500 の使い分け

- 想定されるリスク: 認証状態やデータ存在有無を攻撃者に推測される。
- 実装されている対策: `requireShopId()` は未ログインを 401、店舗セットアップ不足を 403 にします。他店舗メニューIDを指定した場合は `menu not found` の 404 です。サーバー例外は 500 です。
- 関係するファイル: `app/api/admin/_utils.ts`, `app/api/admin/menus/[menuId]/route.ts`, `app/api/admin/shop/route.ts`, `app/api/invitations/accept/route.ts`
- 初学者向け解説: 401は「ログインが必要」、403は「ログインしていても権限がない」、404は「見つからない」、500は「サーバー内部エラー」です。
- なぜ効果があるか: 他店舗のデータについては「存在するが権限がない」ではなく「見つからない」と返すため、存在推測をしにくくしています。
- まだ注意すべき点: エラー文言を新しく追加するときは、内部情報や他店舗情報を出しすぎないようにする必要があります。

## 15. アレルゲン情報を守るための設計

### 公開前のアレルゲン未設定チェック

- 想定されるリスク: 未確認のアレルゲン情報が「安全」と誤解され、利用者の健康リスクにつながる。
- 実装されている対策: `lib/allergens.ts` の `getMenuPublishValidationErrors()` が、公開時にメニュー名とアレルゲン29品目の `UNKNOWN` をチェックします。`app/api/admin/menus/route.ts` の作成時、`app/api/admin/menus/[menuId]/route.ts` の更新時にサーバー側で呼ばれています。
- 関係するファイル: `lib/allergens.ts`, `app/api/admin/menus/route.ts`, `app/api/admin/menus/[menuId]/route.ts`, `prisma/schema.prisma`
- 初学者向け解説: `UNKNOWN` は「未設定 / 未確認」です。「含まない」とは違います。未確認のまま公開すると利用者が誤解する危険があります。
- なぜ効果があるか: UIを改ざんしてAPIを直接叩いても、サーバー側の公開条件を満たさない限り公開しにくくしています。
- まだ注意すべき点: 公開後に材料やレシピが変わった場合の更新履歴やレビュー承認フローは、今後の強化余地です。

### 29品目をマスタ基準で表示

- 想定されるリスク: DBに中間テーブル行が欠けたアレルゲンが画面に出ず、情報が欠落する。
- 実装されている対策: `buildAllergenRows()` と `createStatusBySlug()` が、アレルゲンマスタを基準に全品目を `UNKNOWN` で埋めてから保存済み状態で上書きします。
- 関係するファイル: `lib/allergens.ts`, `app/api/admin/menus/[menuId]/route.ts`, `app/api/menus/[menuId]/route.ts`, `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx`
- 初学者向け解説: 「DBに保存されているものだけ表示」だと、保存漏れが見えなくなります。マスタを基準にすると、未設定も未設定として表示できます。
- なぜ効果があるか: 欠損を隠さず `UNKNOWN` として扱うため、誤った安全表示を起こしにくくします。
- まだ注意すべき点: `UNKNOWN` を公開時に止めるルールと、既存データ補修スクリプトを継続する必要があります。

## 16. Security Scanで安全寄りと判断された点

この節は、ユーザー指定の「今回のSecurity Scanで安全寄りと判断された点」を、実コードで再確認した結果としてまとめます。独立したレポートファイルは見つかっていないため、Security Scan由来の観点と実コード確認結果を分けています。

### Admin menu IDOR が起きにくい理由

- Security Scan由来の観点: Admin menu IDOR が起きにくい。
- 実コードで確認できたこと: `app/api/admin/menus/[menuId]/route.ts` の `GET` / `PUT` / `DELETE` と、`app/admin/(dashboard)/menus/[menuId]/edit/page.tsx` が `menuId` と `shopId` の両方で対象メニューを確認しています。
- 初学者向け解説: IDだけでなく所有店舗も見るため、URLのIDを書き換えても他店舗データを取りにくくなっています。
- まだ注意すべき点: 新しいメニュー操作APIを追加した場合も同じ条件が必要です。

### Admin shop API が server-derived auth.shopId を使っている点

- Security Scan由来の観点: Admin shop API がクライアント由来ではなくサーバー由来の `auth.shopId` を使っている。
- 実コードで確認できたこと: `app/api/admin/shop/route.ts` の `GET` / `PUT` は `requireShopId()` 後、`where: { id: auth.shopId }` で店舗を取得・更新しています。
- 初学者向け解説: クライアントから送られた店舗IDを信用せず、ログインユーザーに紐づく店舗IDをサーバーで決めています。
- まだ注意すべき点: 店舗に関する新規フィールド追加時も `auth.shopId` を使うことが重要です。

### PORTFOLIO_MODE mutation guard が主要ルートにある点

- Security Scan由来の観点: 主要な変更ルートに Portfolio mode の mutation guard がある。
- 実コードで確認できたこと: `requirePortfolioMutationAccessApi()` はメニュー作成・更新・削除、店舗更新、画像アップロード、招待作成・再送・取消、招待承認に入っています。
- 初学者向け解説: ポートフォリオ版では見せることを優先し、保存や削除は app-admin 以外できないようにしています。
- まだ注意すべき点: 新しいPOST/PUT/PATCH/DELETE APIを追加したら、このガードの要否を必ず確認します。

### Prisma injection の大きな問題が見つからなかった点

- Security Scan由来の観点: Prisma injection の大きな問題は見つからなかった。
- 実コードで確認できたこと: `queryRawUnsafe` / `executeRawUnsafe` は見つかりませんでした。raw SQL はテンプレートタグ形式でした。
- 初学者向け解説: Prismaの通常APIやテンプレートタグ形式は、SQL文字列連結より安全寄りです。
- まだ注意すべき点: Prismaは認可漏れまでは防がないため、`where` の所有権条件が必要です。

### .env 系の秘密情報露出が見つからなかった点

- Security Scan由来の観点: `.env` 系の秘密情報露出が見つからなかった。
- 実コードで確認できたこと: `.gitignore` は `.env`、`.env*.local`、`.vercel`、`/.clerk/` を除外しています。`rg` で確認した範囲では、実値らしい `CLERK_SECRET_KEY` や `BLOB_READ_WRITE_TOKEN` は見つかりませんでした。
- 初学者向け解説: 秘密情報はGitに入れず、Vercelなどの環境変数として設定します。
- まだ注意すべき点: ローカルには `.env` が存在するため、手動でコミット対象に含めない運用が必要です。

### 公開APIが表示用フィールド中心になっている点

- Security Scan由来の観点: 公開APIが表示用フィールド中心。
- 実コードで確認できたこと: `app/api/allergens/route.ts`、`app/api/menus/[menuId]/route.ts`、公開ページのDB取得は Prisma `select` で表示用フィールドを限定しています。
- 初学者向け解説: APIレスポンスに不要な列を含めないことで、情報漏えいのリスクを下げています。
- まだ注意すべき点: 公開メニュー詳細/APIには `shop.isActive` 条件を追加する必要があります。

## 17. まだ修正・強化すべき点

### inactive shop の public menu detail/API に shop.isActive 条件を追加する

- 想定されるリスク: 店舗を inactive にしても、メニュー詳細URLや `/api/menus/[menuId]` から公開中メニューが見える。
- 実装されている対策: 現状、公開店舗一覧・店舗詳細は `shop.isActive` を見ています。
- 関係するファイル: `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx`, `app/api/menus/[menuId]/route.ts`
- 初学者向け解説: 店舗が無効なら、メニューだけ公開される状態も避けるべきです。
- なぜ効果があるか: `where` に `shop: { isActive: true }` を追加すると、店舗停止時にメニュー詳細も見えにくくなります。
- まだ注意すべき点: 一覧、詳細、APIで公開条件がずれないよう共通化も検討できます。

安全寄りな修正イメージ:

```ts
const menu = await prisma.menuItem.findFirst({
    where: {
        id: menuId,
        shopId,
        isPublished: true,
        shop: { isActive: true },
    },
});
```

### invitation acceptance で verified email または ticket-binding を確認する

- 想定されるリスク: Clerk上の未検証メールや、ローカル招待とClerk invitationの紐づきが弱い状態で招待を受諾される。
- 実装されている対策: 現状は `getCurrentClerkIdentity()` のメールと `AdminInvite.email` の一致を使い、pending・期限内の招待を処理しています。
- 関係するファイル: `app/api/invitations/accept/route.ts`, `lib/invitations.ts`, `lib/auth/getCurrentAppUser.ts`
- 初学者向け解説: verified email は「メールアドレスの持ち主確認済み」という意味です。ticket-binding は「この招待リンクから来た本人か」をより強く結びつける考え方です。
- なぜ効果があるか: 招待メールの宛先本人だけが店舗管理者になれる確度を上げられます。
- まだ注意すべき点: Clerkの招待トークンやメール検証状態をどのAPIで取得するかを設計する必要があります。

### image upload で magic bytes を確認する

- 想定されるリスク: `file.type` を偽装した非画像ファイルがアップロードされる。
- 実装されている対策: MIME type とサイズは `validateImageFile()` で確認済みです。
- 関係するファイル: `lib/upload-images.ts`, `app/api/admin/upload-menu-image/route.ts`, `app/api/admin/upload-shop-image/route.ts`
- 初学者向け解説: magic bytes はファイル先頭にある種類判定用のバイト列です。拡張子やMIME typeより実体確認に近いです。
- なぜ効果があるか: 偽装されたファイルを保存前に検知しやすくなります。
- まだ注意すべき点: AVIFやWebPなど形式ごとの判定ルールを実装するか、信頼できる画像解析ライブラリを使う必要があります。

### 新しくAPIを追加するときに同じ認証・認可ルールを守る

- 想定されるリスク: 既存APIは守られていても、新規APIだけガード漏れになる。
- 実装されている対策: 共通ヘルパー `requireShopId()`、`enforceSameOriginAdminMutation()`、`requirePortfolioMutationAccessApi()` が存在します。
- 関係するファイル: `app/api/admin/_utils.ts`, `lib/admin-api-security.ts`, `lib/portfolio-mode.ts`
- 初学者向け解説: セキュリティは1箇所だけ守ればよいものではありません。新しい入口を作るたびに同じルールが必要です。
- なぜ効果があるか: 共通ヘルパーを使えば、APIごとの実装差による抜けを減らせます。
- まだ注意すべき点: レビュー時のチェックリスト化が必要です。

## 18. 新しくAPIを追加するときのチェックリスト

- そのAPIは公開APIか、管理APIかを最初に決めたか。
- 管理APIなら `app/api/admin/**` 配下に置いたか。
- 管理APIで `requireShopId()` または `requirePlatformAdminApi()` を呼んだか。
- POST / PUT / PATCH / DELETE なら `enforceSameOriginAdminMutation()` を呼んだか。
- PORTFOLIO_MODE中に変更されると困るAPIなら `requirePortfolioMutationAccessApi()` を呼んだか。
- `shopId` をクライアントから受け取って信用していないか。
- URLの `menuId` や `inviteId` を使う場合、所有権または運営管理者権限を確認したか。
- 他店舗データの存在推測を避けるため、必要に応じて 404 を返しているか。
- Prisma の `select` で返すフィールドを必要最小限にしたか。
- 公開APIなら `isPublished`、`shop.isActive` など公開条件を確認したか。
- 入力値を Zod または既存 validator で検証したか。
- 価格など数値は範囲・整数・上限を確認したか。
- 画像URLは `validateStoredImageUrl()` を通したか。
- アップロードは MIME type、サイズ、今後は magic bytes を確認する設計か。
- raw SQL が必要な場合、テンプレートタグ形式を使い、`queryRawUnsafe` を避けたか。
- エラー時に秘密情報・DB詳細・スタックトレースをレスポンスへ出していないか。
- 重要操作は `writeAdminAuditLog()` で監査ログに残すか検討したか。
- 新しい環境変数に `NEXT_PUBLIC_` を付けてよいか確認したか。
- 秘密情報を `.env.example`、README、コードコメントへ実値で書いていないか。

## 19. まとめ

ClearAllergy は、Clerkによる認証、DB上の `ownerClerkUserId` / `shopId` による認可、`requireShopId()` を中心にした管理API保護、`isPublished` や `isActive` による公開制御、PORTFOLIO_MODE による変更操作制限、招待制管理者登録、Prismaによる型付きDB操作、画像URLポリシー、監査ログなどで、主要なリスクを下げています。

特に管理メニュー操作では `menuId` と `auth.shopId` を組み合わせて確認しており、IDORを起こしにくい設計です。また、クライアントから送られる `shopId` を信用せず、サーバー側でログインユーザーから店舗IDを解決する方針は重要な安全策です。

一方で、完全に安全とは言えません。公開メニュー詳細/APIの `shop.isActive` 条件、招待承認時の verified email または ticket-binding、画像アップロードの magic bytes チェック、新規API追加時の同一ルール徹底は、今後優先して強化すべき点です。

## 開発メンバー向けチェックリスト

- 管理APIを作る前に、`requireShopId()` と `requirePlatformAdminApi()` のどちらが必要か決める。
- 変更系APIには `enforceSameOriginAdminMutation()` と `requirePortfolioMutationAccessApi()` を入れる。
- クライアント由来の `shopId` は権限判定に使わない。
- メニュー操作では `menuId` 単体ではなく `shopId` と組み合わせて確認する。
- 公開APIでは `select` を使い、表示に不要な列を返さない。
- 公開条件は `isPublished` だけでなく、必要に応じて `shop.isActive` も見る。
- アレルゲン情報の公開時は `UNKNOWN` を残さない。
- 招待・登録・ログイン・アップロードなど重要操作はレート制限と監査ログを検討する。
- raw SQL は原則避け、必要な場合はテンプレートタグ形式でバインディングする。
- `.env` の実値、Clerk secret、DB URL、Blob token をGit・README・スクリーンショットに含めない。
- 画像アップロードはMIME type・サイズに加えて magic bytes チェックを追加する。
- 新しいAPIを追加したら、この資料のチェックリストでレビューする。
