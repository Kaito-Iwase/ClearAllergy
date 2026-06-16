# ClearAllergy 面接説明ガイド

## 0. このドキュメントの目的

このドキュメントは、ClearAllergy を面接やポートフォリオ説明で正確に説明するためのガイドです。

盛りすぎず、現在の実装に基づいて説明します。

特に説明すべき中心は次の3つです。

- Clerk 認証と shopId 所有確認で管理 API を守っていること。
- MenuItem と Allergen を MenuItemAllergen 中間テーブルでつなぎ、アレルゲン状態を管理していること。
- 公開画面と管理画面を同じ Next.js App Router プロジェクト内で分けていること。

## 1. 30秒説明

> ClearAllergy は、飲食店がメニューごとのアレルゲン情報を管理し、利用者が公開ページで確認できる Web アプリです。Next.js App Router、TypeScript、Prisma、PostgreSQL、Clerk を使っています。公開側は店舗とメニューを閲覧でき、管理側は店舗管理者がログインして店舗情報やメニュー、アレルゲン29品目を編集できます。管理 API では Clerk の userId からサーバー側で shopId を解決し、その shopId で DB 操作を絞ることで、他店舗のデータを更新できないようにしています。

## 2. 1分説明

> ClearAllergy は、飲食店向けのアレルゲン情報公開・管理アプリです。利用者はログインなしで店舗一覧、店舗詳細、メニュー詳細を見られます。店舗管理者は Clerk でログインし、自分の店舗情報、メニュー情報、画像、アレルゲン状態を管理できます。
>
> 技術構成は Next.js App Router、TypeScript、Prisma、PostgreSQL、Clerk、Vercel Blob、Tailwind CSS です。公開画面と管理画面は同じ Next.js プロジェクト内にあり、`app/(public)` と `app/admin` で分けています。
>
> セキュリティ面では、管理画面だけでなく管理 API でもサーバー側認証を行っています。shopId はクライアントから受け取らず、Clerk の userId から DB の Shop を取得して決めます。メニュー更新では `where: { id: menuId, shopId }` のように所有確認するため、他店舗の menuId を指定されても更新できません。

## 3. 技術スタックを聞かれたら

| 技術 | 説明 |
| --- | --- |
| Next.js App Router | 画面、レイアウト、API Route を同じ構成で作るため |
| TypeScript | 型で入力や DB データの扱いを明確にするため |
| React | UI をコンポーネント単位で作るため |
| Prisma | TypeScript から PostgreSQL を扱いやすくするため |
| PostgreSQL | 店舗、メニュー、アレルゲンのリレーションを扱うため |
| Clerk | ログイン、セッション、ユーザー管理を任せるため |
| Vercel Blob | 店舗画像・メニュー画像を保存するため |
| Tailwind CSS | 画面スタイルを素早く構築するため |

回答例です。

> フロントエンドとサーバー側処理は Next.js App Router で実装しています。DB は PostgreSQL、アクセスには Prisma を使っています。認証は Clerk に任せ、アプリ側では Clerk userId と Shop を紐づけて認可を実装しています。画像は DB に直接保存せず、Vercel Blob に保存して URL を DB に持たせています。

## 4. なぜ Next.js を使ったのですか？

回答例です。

> 公開画面、管理画面、API Route を同じプロジェクト内で扱いたかったためです。Next.js App Router なら、`app/(public)` に公開ページ、`app/admin` に管理ページ、`app/api` に API を置けます。また Server Component で DB 取得をサーバー側に寄せられるため、公開ページや管理ページの初期データ取得が実装しやすいです。

補足です。

- React 単体では、ルーティングや API サーバーを別途構成する必要があります。
- ClearAllergy では画面と API が密接につながるため、Next.js の構成が合っています。

## 5. なぜ Clerk を使ったのですか？

回答例です。

> 自作認証はパスワード管理、セッション管理、攻撃対策の実装ミスが大きなリスクになります。そのため、ログインやセッション管理は Clerk に任せています。アプリ側では Clerk の userId を受け取り、それに紐づく User と Shop を DB から取得して、管理操作の認可に使っています。

「Supabase Auth ではなく Clerk なのはなぜ？」と聞かれた場合です。

> Supabase Auth でも認証は実装できますが、このプロジェクトでは Clerk の Next.js 連携とログイン UI、サーバー側の `auth()` を使う構成にしました。DB は Prisma と PostgreSQL で管理し、認証は Clerk に分離しています。

## 6. 認証と認可はどう実装していますか？

回答例です。

> 認証は Clerk で行っています。サーバー側では `auth()` から Clerk userId を取得します。認可は、DB でその Clerk userId に紐づく Shop を取得し、その shopId を使って管理 API の操作対象を絞ることで実装しています。

図で説明するなら次の流れです。

```txt
Clerk auth()
  ↓
Clerk userId
  ↓
User.clerkUserId
  ↓
Shop.ownerClerkUserId
  ↓
shopId
  ↓
where: { id: menuId, shopId }
```

重要な一言です。

> ログインしているだけでは不十分なので、「その店舗の所有者か」までサーバー側で確認しています。

## 7. 他店舗のデータを更新できないようにどうしていますか？

回答例です。

> shopId をクライアントから受け取らず、サーバー側で Clerk userId から解決しています。メニュー更新 API では、URL の menuId とログインユーザーの shopId を両方使って `where: { id: menuId, shopId: auth.shopId }` で検索します。見つからなければ 404 を返すため、他店舗の menuId を指定されても更新できません。

さらに短く言うなら次です。

> body の shopId は信用せず、サーバーで決めた shopId だけを使います。

IDOR と関連づける説明です。

> IDOR は、他人の ID を指定するだけで他人のデータを見たり変更できてしまう脆弱性です。このアプリでは、menuId だけで更新せず、必ず認証済み shopId も条件に入れることで対策しています。

## 8. DB設計で工夫した点は？

回答例です。

> アレルゲン情報の設計を工夫しました。メニューとアレルゲンは多対多の関係なので、MenuItem と Allergen を直接カラムで持たせるのではなく、MenuItemAllergen という中間テーブルを置いています。この中間テーブルに `CONTAINS`, `FREE`, `MAY_CONTAIN`, `UNKNOWN` の状態を持たせています。

図です。

```txt
Shop 1 ── * MenuItem

MenuItem * ── * Allergen
          ↑
          MenuItemAllergen
          status を持つ
```

なぜ MenuItem に直接持たせないのか聞かれた場合です。

> `eggStatus`, `milkStatus` のように MenuItem に直接カラムを持たせると、品目が増えるたびに DB 構造を変える必要があります。Allergen マスタと中間テーブルに分けることで、品目追加や表示順管理がしやすくなります。

## 9. UNKNOWN を入れた理由は？

回答例です。

> 未確認を「含まない」と誤解させないためです。アレルギー情報では、未入力と安全確認済みはまったく意味が違います。そのため、未設定は UNKNOWN として保存し、FREE とは区別しています。公開時にはサーバー側でも UNKNOWN が残っていないか確認します。

良い言い方です。

> UNKNOWN はデータ不足を安全側に倒すための状態です。

避けた方がよい言い方です。

> UNKNOWN でも多分安全です。

これは危険です。UNKNOWN は安全ではなく、未確認です。

## 10. API設計をどう説明するか

回答例です。

> API は公開 API と管理 API に分けています。公開 API はログイン不要で、公開済みメニューやアレルゲン一覧だけを返します。管理 API は `/api/admin` 配下に置き、Clerk のログイン確認と shopId 所有確認を通した場合だけ作成・更新・削除できます。

代表 API です。

| API | 役割 | 保護 |
| --- | --- | --- |
| `GET /api/allergens` | アレルゲン一覧 | ログイン不要 |
| `GET /api/menus/[menuId]` | 公開メニュー詳細 | `isPublished: true` |
| `GET /api/admin/menus` | 自店舗メニュー一覧 | Clerk + shopId |
| `POST /api/admin/menus` | メニュー作成 | Clerk + shopId |
| `PUT /api/admin/menus/[menuId]` | メニュー更新 | Clerk + `id + shopId` |
| `DELETE /api/admin/menus/[menuId]` | メニュー削除 | Clerk + `id + shopId` |
| `PUT /api/admin/shop` | 店舗情報更新 | Clerk + shopId |

## 11. Server Component と Client Component をどう分けましたか？

回答例です。

> DB 取得や認証確認は Server Component 側で行い、フォーム入力やボタン操作は Client Component に分けています。例えば、管理メニュー編集ページでは Server Component がログイン確認と対象メニュー取得を行い、`MenuEditClient` が入力状態や保存ボタン、画像アップロードを担当します。

例です。

| 種類 | ファイル | 役割 |
| --- | --- | --- |
| Server Component | `app/admin/(dashboard)/menus/[menuId]/edit/page.tsx` | 認証確認、自店舗メニュー取得 |
| Client Component | `components/admin/menu/MenuEditClient.tsx` | 入力 state、保存 fetch |
| Server Component | `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx` | 公開メニュー取得 |
| Client Component | `components/public/PublicMenuDetailBodyClient.tsx` | ブラウザ側の表示補助 |

## 12. 画像保存はどうしていますか？

回答例です。

> 画像本体は Vercel Blob に保存し、DB には画像 URL だけ保存しています。DB に画像本体を入れると容量や配信の面で扱いにくいためです。アップロード API では Clerk 認証、shopId 確認、MIME タイプ、5MB のサイズ制限を行っています。また保存する URL は Vercel Blob 由来で、path に自店舗の shopId が含まれるものだけ許可しています。

フローです。

```txt
画像選択
  ↓
POST /api/admin/upload-menu-image
  ↓
Vercel Blob
  ↓
URL を返す
  ↓
PUT /api/admin/menus/[menuId]
  ↓
DB に URL 保存
```

## 13. セキュリティで意識した点は？

回答例です。

> 特に意識したのは、管理 API の認証・認可です。画面でボタンを隠すだけでは API を直接叩けるため、API 側で必ず Clerk のログイン状態を確認しています。さらに、shopId は body から信用せず、サーバー側で Clerk userId から解決しています。メニュー更新では `id` と `shopId` の両方で対象を絞ることで IDOR を防いでいます。

追加で言えることです。

- 更新系 API で Origin を確認している。
- 入力値をバリデーションしている。
- 画像アップロードの MIME とサイズを制限している。
- 画像 URL を許可された Blob URL に限定している。
- エラー詳細を本番で出しすぎないようにしている。
- AuditLog で管理操作を記録している。

## 14. 苦労した点は？

回答例です。

> 認証と認可を分けて考える点が難しかったです。ログイン済みかどうかだけでなく、そのユーザーがどの店舗を操作できるかを DB で確認する必要がありました。特に、shopId をクライアントから送らせるのではなく、Clerk userId からサーバー側で解決する設計にすることで、安全性を高めました。

別の回答例です。

> アレルゲン情報の DB 設計も悩みました。最初はメニューに直接状態を持たせる方法も考えられますが、品目追加や多対多の関係を考えると、中間テーブルで状態を持つ設計が適切だと判断しました。

## 15. 今後改善したい点は？

回答例です。

> 今後はテストを増やしたいです。特に、他店舗の menuId を指定しても更新できないことを確認する認可テスト、公開・非公開メニューの表示テスト、画像アップロードの制限テストを追加したいです。また、アレルギー情報は利用者の安全に関わるため、注意喚起や免責、店舗確認導線をより明確にしたいです。

改善候補です。

| 改善 | 理由 | 優先度 |
| --- | --- | --- |
| API 認可テスト | IDOR 回帰を防ぐ | 高 |
| E2E テスト | ログインから保存まで確認 | 高 |
| error.tsx 整備 | エラー時の UX 改善 | 中 |
| loading.tsx 整備 | 読み込み時の UX 改善 | 中 |
| 古い NextAuth 文書整理 | Clerk 前提に統一 | 高 |
| アレルギー注意表示強化 | 安全性に関わる | 高 |
| AuditLog 閲覧画面 | 運用確認しやすくする | 中 |

## 16. AI を使って開発しましたか？

回答例です。

> AI はコード作成やドキュメント整理、レビュー観点の洗い出しに使いました。ただし、認証・認可・DB 設計のような重要な部分は、実装内容を確認し、自分で説明できるようにしています。特に shopId をサーバー側で解決する設計や、MenuItemAllergen の中間テーブル設計は、なぜ必要かを理解して説明できます。

注意点です。

- 「AI が全部作りました」だけでは弱いです。
- 自分が理解して判断した部分を言えるようにします。
- セキュリティ設計は特に自分の言葉で説明します。

## 17. 深掘り質問と回答例

### Q. なぜ shopId を body から受け取ってはいけないのですか？

> body はブラウザから送られる値なので、利用者が書き換えられます。もし body の shopId を信用すると、他店舗の shopId に書き換えて更新できる可能性があります。そのため、shopId は Clerk のログイン情報からサーバー側で解決しています。

### Q. URL の menuId も書き換えられますよね？

> はい。だから menuId だけでは更新しません。API 側で `where: { id: menuId, shopId: auth.shopId }` のように、ログインユーザーの shopId も条件に入れて所有確認します。

### Q. 公開ページはログイン不要で安全ですか？

> 公開ページは読み取り専用で、DB 更新 API にはつながっていません。また、公開ページでは `isActive: true` の店舗と `isPublished: true` のメニューだけを取得しています。更新は `/api/admin` 配下の管理 API に分け、Clerk 認証を必須にしています。

### Q. Prisma の include と select はどう使っていますか？

> 画面や API に必要な列だけを返すために `select` を使っています。relation が必要な場合は、`allergenLinks` や `shop` を `select` の中で指定しています。不要な情報を返さないことで、レスポンスを軽くし、意図しない情報漏れも避けやすくなります。

### Q. MenuItemAllergen を更新するとき、なぜ deleteMany して createMany するのですか？

> フォーム上の29品目の状態と DB を確実に一致させるためです。差分更新もできますが、全品目を再作成する方が実装が単純で、保存後の状態が分かりやすいです。transaction 内で処理しているため、途中で失敗した場合に中途半端な状態が残りにくくなります。

### Q. Vercel Blob の URL をなぜ検証するのですか？

> 外部 URL を自由に保存できると、不適切な画像や追跡用 URL、他店舗の画像 URL を混ぜられる可能性があります。そのため、保存時・表示時に Vercel Blob 由来で、path に自店舗の shopId が含まれる URL だけ許可しています。

## 18. 面接で避けたい表現

避けたい表現です。

- 「Clerk を入れているのでセキュリティは全部安全です」
- 「ログイン画面があるので API も守られています」
- 「UNKNOWN は安全という意味です」
- 「shopId はフォームから送っています」
- 「MenuItem にアレルゲン情報を全部直接持っています」
- 「NextAuth で認証しています」

正しい表現です。

- 「Clerk は認証を担当し、アプリ側では shopId 所有確認で認可しています」
- 「画面だけでなく管理 API 側でも認証・認可しています」
- 「UNKNOWN は未確認という意味で、FREE とは区別しています」
- 「shopId はサーバー側で Clerk userId から解決しています」
- 「MenuItemAllergen 中間テーブルでアレルゲン状態を持っています」
- 「現在の正しい認証基盤は Clerk です」

## 19. ファイルを聞かれたときの答え方

| 聞かれた内容 | 見るファイル |
| --- | --- |
| DB設計 | `prisma/schema.prisma` |
| Prisma Client | `lib/db.ts` |
| Clerk middleware | `proxy.ts` |
| ClerkProvider | `app/admin/layout.tsx` |
| Clerk userId と DB User の対応 | `lib/auth/getCurrentAppUser.ts` |
| 管理者 context | `lib/admin-auth.ts` |
| 管理 API 共通認証 | `app/api/admin/_utils.ts` |
| メニュー管理 API | `app/api/admin/menus/route.ts`, `app/api/admin/menus/[menuId]/route.ts` |
| 店舗管理 API | `app/api/admin/shop/route.ts` |
| 公開メニュー API | `app/api/menus/[menuId]/route.ts` |
| 画像アップロード | `app/api/admin/upload-menu-image/route.ts`, `lib/upload-images.ts` |
| 画像 URL 制約 | `lib/image-url-policy.ts` |
| アレルゲン共通処理 | `lib/allergens.ts` |

## 20. 最後に一番伝えるべきこと

面接で一番伝えるべきことは、単に「Next.js で作りました」ではありません。

一番伝えるべきポイントは次です。

> 管理 API では、Clerk のログイン状態からサーバー側で shopId を解決し、その shopId を使って DB 操作を絞っています。これにより、他店舗の menuId や shopId を指定されても更新できないようにしています。

次に伝えるべきポイントは DB 設計です。

> アレルゲン情報は MenuItem と Allergen の多対多関係なので、MenuItemAllergen 中間テーブルに status を持たせています。UNKNOWN を持たせることで、未確認と含まないを区別しています。

この2つを自分の言葉で説明できれば、ClearAllergy の技術的な核をかなり正確に伝えられます。
