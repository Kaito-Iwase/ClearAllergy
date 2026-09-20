# 変更対応表：機能から調査を始める

[READMEへ](../../README.md) · [操作説明](product.md) · [保守ルール](maintenance.md)

全ページ・主要機能・APIの入口をここだけで管理します。コードパスは**リポジトリルートからの相対パス**です。表は影響範囲の完全な保証ではありません。入口の関数・コンポーネント名を検索して、呼び出し元、共通処理、動的URL、テストを確認してください。行番号だけに依存しません。

表の「テスト」は検査するコードが存在するという意味で、今回実行済みという意味ではありません。「手動」は[開発手順のブラウザ確認](development.md#browser)に従います。専用テスト未整備の機能も、説明対象から除いていません。

<a id="pages"></a>
## 全ページの入口

`(public)` や `(dashboard)` はURLに含まれません。角括弧は動的な部分、`[[...name]]` は基点も含む可変パスです。個々の店舗IDを一覧に載せません。

| URLパターン・機能 | 説明先 | 調査を始める実装 | 関連処理・データ | 確認入口 |
| --- | --- | --- | --- | --- |
| `/` トップ | [利用者](product.md#public) | `app/page.tsx` → `features/public/shops/server/HomePage.tsx`、`features/public/shops/components/HomePageView.tsx` | `features/public/shops/components/PublicSearchBox.tsx`、検索URL | `scripts/check-first-use-browser.mjs`、検索して一覧へ進む手動確認 |
| `/shops` 店舗一覧 | [利用者](product.md#public) | `app/(public)/shops/page.tsx` → `features/public/shops/server/PublicShopListPage.tsx`、`features/public/shops/components/PublicShopListClient.tsx` | `features/public/shops/components/public-shop-search.ts` の `filterAndRankShops`、Shop/MenuItem/Allergen、端末設定 | `tests/readability-helpers.test.ts`（検索処理）、`tests/public-places.test.ts`（旧API）、初回ブラウザ回帰。0件・障害・位置情報拒否は手動 |
| `/shops/[shopId]` 店舗詳細 | [利用者](product.md#public) | `app/(public)/shops/[shopId]/page.tsx` → `features/public/shops/server/PublicShopDetailPage.tsx`、`features/public/shops/components/ShopMenuListClient.tsx` | Shop/MenuItem、公開判定、`features/public/shops/components/ShareShopUrlButton.tsx` | `scripts/check-first-use-browser.mjs`、`scripts/check-test-browser.mjs`、共有失敗は手動 |
| `/shops/[shopId]/menus/[menuId]` メニュー詳細 | [利用者](product.md#public) | `app/(public)/shops/[shopId]/menus/[menuId]/page.tsx` → `features/public/shops/server/PublicMenuDetailPage.tsx`、`features/public/shops/components/PublicMenuDetailBodyClient.tsx` | MenuItem/Allergen/MenuItemAllergen、店舗補足、[公開ルール](rules.md#publication) | `tests/allergen-display.test.ts`、実画面は両ブラウザ回帰。APIテストだけではページ取得は未検証 |
| `/terms` 規約 | [補助画面](product.md#demo) | `app/(public)/terms/page.tsx` | `lib/public-prototype.ts` | 文言の専門レビューは未確認。手動でリンク・共通注意を確認 |
| `/admin` 振り分け | [管理入口](product.md#admin) | `app/admin/page.tsx` | Clerk、`lib/auth/admin-auth.ts`、`lib/auth/admin-platform-auth.ts` | 手動：未認証／未割当／所有者／運営の遷移。全分岐の専用単体テストなし |
| `/admin/login` | [管理入口](product.md#admin) | `app/admin/(auth)/login/page.tsx` → `features/admin/auth/server/AdminLoginPage.tsx`、`features/admin/auth/components/AdminLoginPageClient.tsx` | Clerk、`lib/validators/admin-auth.ts`、認証補助API、User/Shop | `scripts/check-test-browser.mjs`。Googleと失敗全分岐は手動 |
| `/admin/register` | [招待](product.md#invitations) | `app/admin/(auth)/register/page.tsx` → `features/admin/auth/server/AdminRegisterPage.tsx`、`features/admin/auth/components/AdminInvitationAcceptPageClient.tsx` | 登録ガード、ポートフォリオ、招待受諾API | 手動：停止案内／保存しないデモ／招待受諾。専用回帰未整備 |
| `/admin/shop` | [店舗編集](product.md#shop) | `app/admin/(dashboard)/shop/page.tsx` → `features/admin/shop/server/AdminShopPage.tsx`、`features/admin/shop/components/ShopEditClient.tsx` | 店舗・画像・候補API、Shop、`features/admin/shop/components/ShopQrCard.tsx` | `scripts/check-test-browser.mjs` 保存・再読込。QR印刷・候補検索は手動 |
| `/admin/menus` | [メニュー](product.md#menus) | `app/admin/(dashboard)/menus/page.tsx` → `features/admin/menus/server/AdminMenusPage.tsx`、`features/admin/menus/components/MenuListPageClient.tsx` | MenuItem、`features/admin/menus/components/CreateMenuButton.tsx`、メニューAPI | `tests/admin-menu-api.test.ts`、実操作回帰。削除時通信断は手動 |
| `/admin/menus/new` | [メニュー](product.md#menus) | `app/admin/(dashboard)/menus/new/page.tsx` → `features/admin/menus/server/AdminMenuNewPage.tsx`、`features/admin/menus/components/NewMenuForm.tsx` | メニュー・画像API、品目マスタ | `tests/menu-input.test.ts`、`tests/publication-review.test.ts`、両ブラウザ回帰 |
| `/admin/menus/[menuId]/edit` | [メニュー](product.md#menus) | `app/admin/(dashboard)/menus/[menuId]/edit/page.tsx` → `features/admin/menus/server/AdminMenuEditPage.tsx`、`features/admin/menus/components/MenuEditClient.tsx` | メニュー・画像API、公開判定、所有権 | `tests/admin-menu-api.test.ts`、`tests/publication-review.test.ts`、実操作回帰 |
| `/admin/invitations` | [招待](product.md#invitations) | `app/admin/invitations/page.tsx` → `features/admin/invitations/server/AdminInvitationsPage.tsx`、`features/admin/invitations/components/AdminInvitationManager.tsx` | 運営権限、招待API、AdminInvite/Shop/Clerk | 専用回帰未整備。許可された開発環境で作成・重複・再送・取消・期限・別権限を手動確認 |
| `/admin/demo` | [管理デモ](product.md#demo) | `app/admin/demo/page.tsx`、`features/admin/shop/components/ShopEditClient.tsx` の `readOnly` | `lib/auth/demo-shop.ts`、Shop。保存なし | `scripts/check-first-use-browser.mjs`、対象なし・DB障害は手動 |
| `/admin/demo/menus` | [管理デモ](product.md#demo) | `app/admin/demo/menus/page.tsx`、`features/admin/menus/components/MenuListPageClient.tsx` | 専用デモShop/MenuItem | 両ブラウザ回帰のデモ導線 |
| `/admin/demo/menus/new` | [管理デモ](product.md#demo) | `app/admin/demo/menus/new/page.tsx`、`features/admin/menus/components/NewMenuForm.tsx` | Allergen、`readOnlyPreview`。保存なし | 初回ブラウザ回帰：戻り先・未保存・未設定移動 |
| `/admin/demo/menus/[menuId]/edit` | [管理デモ](product.md#demo) | `app/admin/demo/menus/[menuId]/edit/page.tsx`、`features/admin/menus/components/MenuEditClient.tsx` | デモ店舗への所属確認。保存なし | 初回ブラウザ回帰、通常店舗ID拒否は手動 |
| `/sign-in/[[...sign-in]]` | [招待・認証補助](product.md#invitations) | `app/sign-in/[[...sign-in]]/page.tsx` | `/admin/login` へ転送 | 手動。独立ログイン画面ではない |
| `/sign-in/sso-callback` | [招待・認証補助](product.md#invitations) | `app/sign-in/sso-callback/page.tsx` → `features/admin/auth/server/SignInSsoCallbackPage.tsx` | Clerk、`features/admin/auth/components/AdminGoogleSsoAuditBeacon.tsx` | 外部Google/Clerkを伴うため今回未実施。専用回帰なし |
| `/sign-up/[[...sign-up]]` | [招待](product.md#invitations) | `app/sign-up/[[...sign-up]]/page.tsx` → `features/admin/auth/server/SignUpPage.tsx`、`features/admin/auth/components/AdminInvitationSignUpPageClient.tsx` | Clerk招待チケット、受諾画面 | 有効／無効／なしのチケットを開発環境で手動。専用回帰なし |
| レイアウト・404・読込中（独立URLなし） | [補助画面](product.md#demo) | `app/layout.tsx`、`app/(public)/layout.tsx`、`app/admin/layout.tsx`、`app/admin/(dashboard)/layout.tsx`、`app/admin/(auth)/layout.tsx`、`app/sign-in/layout.tsx`、`app/sign-up/layout.tsx`、`app/not-found.tsx` | `components/layout/PublicHeader.tsx`、`components/layout/AdminDashboardShell.tsx`、`components/layout/AdminLogoutButton.tsx`、`app/globals.css` | 手動：モバイル／PC、キーボード、404、注意表示。`loading.tsx` は公開一覧・店舗・メニュー詳細と管理メニュー一覧・編集の5か所に存在 |

<a id="apis"></a>
## API入口と契約の要点

`app/api/` 内の各 `route.ts` は以下の機能実装へ転送します。17ルートのHTTPメソッド（GET=取得、POST=作成・処理開始、PUT=更新、DELETE=削除）を棚卸ししています。全JSON項目をコピーしたAPI仕様書ではなく、変更時に契約の正本を読む入口です。

| APIパターン・メソッド | 実装ファイル（ルートの転送先） | 説明・主な契約・確認 |
| --- | --- | --- |
| `/api/allergens` GET | `features/public/shops/server/allergensRoute.ts` | [状態](rules.md#allergens)。Allergenを表示順で取得し `{ allergens }`。公開用項目だけ。例外の専用応答は未整備 |
| `/api/menus/[menuId]` GET | `features/public/shops/server/publicMenuRoute.ts` | [公開取得](architecture.md#public)。`{ menu }` に状態と補足。非公開・対象なし404、不正ID400。`tests/public-menu-api.test.ts` |
| `/api/places/search` GET | `features/public/shops/server/placesSearchRoute.ts` | [利用者検索](product.md#public)。`q` が2〜120文字でなければ400、それ以外は `available:false` と空配列。外部呼出なし。`tests/public-places.test.ts` |
| `/api/admin/menus` GET / POST | `features/admin/menus/server/adminMenusRoute.ts` | [保存処理](architecture.md#mutation)。自店舗一覧取得／作成。POST成功201と `{ id }`。空オブジェクトの下書き作成は名前を補完し全状態UNKNOWN。`tests/admin-menu-api.test.ts` |
| `/api/admin/menus/[menuId]` GET / PUT / DELETE | `features/admin/menus/server/adminMenuRoute.ts` | [保存処理](architecture.md#mutation)。所有するメニューに限定。PUTは省略と明示値を区別。状態統合は `features/admin/menus/server/menu-update-helpers.ts`。`tests/admin-menu-api.test.ts` |
| `/api/admin/shop` GET / PUT | `features/admin/shop/server/adminShopRoute.ts` | [店舗編集](product.md#shop)。自店舗のみ、名前必須、文字数・座標・場所紐づけ等を検証。省略した任意文字列はnullになり得るため一般的な部分更新APIではない。実操作回帰 |
| `/api/admin/places/search` GET | `features/admin/shop/server/adminPlacesSearchRoute.ts` | [店舗編集](product.md#shop)。認証・店舗確認、`q` 2〜120文字、`lib/google-places.ts`。Google設定不足や失敗を扱う。外部通信の実試験は未確認 |
| `/api/admin/upload-shop-image` POST | `features/admin/shop/server/uploadShopImageRoute.ts` | [画像](rules.md#images)。multipart（ファイル送信形式）の `file`、Blob追加、URL返却。DB保存とは別。実操作回帰の範囲を確認 |
| `/api/admin/upload-menu-image` POST | `features/admin/menus/server/uploadMenuImageRoute.ts` | [画像](rules.md#images)。`file` を受け、認証から解決した店舗のパスへ保存。個別メニューへの紐づけは後のメニュー保存時。`tests/image-url-policy.test.ts` はURL検査だけ、実アップロードは実操作回帰 |
| `/api/admin/auth/login` POST | `features/admin/auth/server/adminLoginRoute.ts` | [認証処理](architecture.md#invitations)。precheck／監査、正常204、入力400・試行過多429。Clerk認証そのものではない。実操作回帰と手動 |
| `/api/admin/auth/sso` POST | `features/admin/auth/server/adminSsoRoute.ts` | [認証処理](architecture.md#invitations)。SSO事前確認・監査。外部ログインは手動。専用単体回帰なし |
| `/api/admin/register` POST | `features/admin/auth/server/adminRegisterRoute.ts` | [自己登録停止](rules.md#ownership)。旧登録処理。ガードで実登録を拒否、portfolio分岐は保存なしデモ応答。作成処理のコードが残るだけで利用可能としない |
| `/api/admin/onboarding` POST | `features/admin/auth/server/adminOnboardingRoute.ts` | [自己登録停止](rules.md#ownership)。旧初回店舗作成。登録ガード・更新制限あり。現在の推奨導線は招待受諾。専用回帰未整備 |
| `/api/admin/invitations` GET / POST | `features/admin/invitations/server/adminInvitationsRoute.ts` | [招待処理](architecture.md#invitations)。運営権限、最新50件／招待作成。AdminInvite・Shop・Clerk。専用回帰未整備 |
| `/api/admin/invitations/[inviteId]/resend` POST | `features/admin/invitations/server/resendInvitationRoute.ts` | [招待処理](architecture.md#invitations)。対象・状態・所有者を検査し再送。外部メール送信を含む。手動 |
| `/api/admin/invitations/[inviteId]/revoke` POST | `features/admin/invitations/server/revokeInvitationRoute.ts` | [招待処理](architecture.md#invitations)。運営権限、Clerk取消、DB状態更新。手動 |
| `/api/invitations/accept` POST | `features/admin/invitations/server/acceptInvitationRoute.ts` | [招待処理](architecture.md#invitations)。本人情報から招待検索、User/Shop/AdminInviteを更新。認証・競合・期限等の手動試験。専用回帰未整備 |

<a id="cross-cutting"></a>
## 複数ページに影響する機能

| 変更対象 | 説明先 | コード・データの入口 | テスト／確認 |
| --- | --- | --- | --- |
| 品目・状態・補足・公開条件 | [共通ルール](rules.md#allergens) | `lib/constants/allergen-master.ts`、`lib/allergens.ts` の `createStatusBySlug` / `isMenuPublishable` / `getAllergenEffectiveRisk`、`features/public/shops/server/storeAllergenSupplement.ts`、`prisma/schema.prisma`、`prisma/migrations/20260622000000_auto_unpublish_incomplete_menus/migration.sql` | `tests/allergen-display.test.ts`、`tests/menu-publication.test.ts`、`tests/public-menu-api.test.ts`、`scripts/check-test-database.ts` |
| 個人設定と結果カード | [操作](product.md#preferences)、[処理](architecture.md#preferences) | `features/public/shops/components/UserAllergenPreferenceClient.tsx`、`lib/public-allergen-preferences.ts`、`features/public/shops/components/SelectedAllergenResultCardsClient.tsx`、`features/public/shops/components/PublicMenuSearchSummaryClient.tsx` | `tests/public-allergen-preferences.test.ts`、`tests/allergen-display.test.ts`、初回ブラウザ回帰 |
| 入力・公開前確認・未保存保護 | [メニュー](product.md#menus) | `features/admin/menus/schemas/menu-input.ts`、`lib/validators/admin-input.ts`、`features/admin/menus/publication-review.ts`、`features/admin/menus/components/MenuPublishReadinessNotice.tsx`、`features/admin/menus/components/useUnsavedMenuChanges.ts`、`features/admin/menus/components/menu-form-values.ts` | `tests/menu-input.test.ts`、`tests/publication-review.test.ts`、`tests/readability-helpers.test.ts`、両ブラウザ回帰。戻る／進むは未対応 |
| 認証・所有権・更新制限 | [権限](rules.md#ownership) | `proxy.ts`、`lib/auth/getCurrentAppUser.ts`、`lib/auth/admin-auth.ts`、`lib/auth/admin-api-utils.ts`、`lib/auth/admin-api-security.ts`、`lib/auth/portfolio-mode.ts`、`lib/auth/admin-platform-auth.ts`、`lib/auth/admin-registration.ts` | `tests/admin-menu-api.test.ts` は管理メニューのモック範囲。実権限は実操作回帰、運営招待は手動 |
| 招待の入力・競合 | [招待処理](architecture.md#invitations) | `features/admin/invitations/schemas/admin-invitations.ts`、`lib/auth/invitations.ts` の `acceptPendingInviteForCurrentUser`、`lib/email.ts`、AdminInvite/User/Shop | 競合・外部失敗の専用回帰未整備。開発用招待で手動 |
| 画像・QR・共有 | [画像](rules.md#images)、[店舗](product.md#shop) | `lib/storage/image-url-policy.ts`、`lib/storage/upload-images.ts`、`lib/utils/menu-image-display.ts`、`features/admin/menus/components/ImageCompositionEditor.tsx`、`next.config.ts`。QR/共有入口はページ表 | `tests/image-url-policy.test.ts`、実操作回帰。QR印刷は手動 |
| 障害・キャッシュ・日時・ログ | [内部処理](architecture.md#public) | `lib/public-db.ts`、`lib/db/errors.ts`、`lib/public-cache.ts`、`lib/utils/api-error-message.ts`、`lib/utils/formatters.ts`、`lib/audit-log.ts`、`lib/utils/rate-limit.ts`、`lib/utils/request-ip.ts` | `tests/formatters.test.ts`。実環境キャッシュ・分散回数制限は未確認 |
| 起動・依存・CI | [開発手順](development.md) | `package.json`、`package-lock.json`、`.node-version`、`Dockerfile`、`compose.yaml`、`compose.test.yaml`、`.github/workflows/ci.yml`、`scripts/setup-ci-env.ts`、`scripts/ci-environment.ts` | `tests/prisma-config-compat.test.ts`、`tests/test-environment.test.ts`、CI実行結果。クラウド管理設定は別確認 |
| テストデータ・運用補正 | [運用](development.md#operations) | `prisma/demo-menus.ts`、`prisma/seed.ts`、`prisma/repair-published-menus.ts`、`scripts/setup-test-env.ts`、`scripts/test-environment.ts`、`scripts/check-allergen-master.ts`、`scripts/backfill-pistachio-allergen.ts`、`scripts/create-test-user.ts`、`scripts/migrate-users-to-clerk.ts`、`scripts/cleanup-test-images.ts` | `tests/demo-menu-fixtures.test.ts`、`tests/test-environment.test.ts`。実行は接続先・副作用・許可を確認してから |

<a id="examples"></a>
## 代表的な変更依頼での使い方

「設定で後から品目を追加したい」なら個人設定行から操作・処理を読み、正規化関数と購読元、一覧の検索、結果カードまで検索します。「公開できない理由を変えたい」なら公開条件行からUI・API・DBトリガーとテストを追います。「店舗へ担当者を追加したい」なら招待行と所有権ルールを読み、単なるフォーム追加でなくDBの一意制約に関わる依頼だと判断します。

「CIが落ちる」なら環境行からジョブの失敗段階と同じコマンドを確認し、実認証を検証していない範囲を分けます。いずれも説明の変更先はこの表の「説明先」で特定し、実際に修正する範囲と確認だけの範囲を[保守ルール](maintenance.md)に従って分けてください。
