# Repository inventory snapshot

2026-09-28。静的棚卸し。全ファイルの実行・全分岐のレビュー済みという意味ではない。相対リンクはリポジトリの現行ファイル。importは直接依存のみで、実行順・動的呼出は本文のflowを参照。

| File | Lines | Direct dependencies |
| --- | ---: | --- |
| [.github/workflows/ci.yml](../../../.github/workflows/ci.yml) | 120 | — |
| [.github/workflows/dependency-audit.yml](../../../.github/workflows/dependency-audit.yml) | 37 | — |
| [app/(public)/layout.tsx](../../../app/%28public%29/layout.tsx) | 18 | `@/components/layout/PublicHeader` |
| [app/(public)/shops/[shopId]/loading.tsx](../../../app/%28public%29/shops/%5BshopId%5D/loading.tsx) | 67 | — |
| [app/(public)/shops/[shopId]/menus/[menuId]/loading.tsx](../../../app/%28public%29/shops/%5BshopId%5D/menus/%5BmenuId%5D/loading.tsx) | 73 | — |
| [app/(public)/shops/[shopId]/menus/[menuId]/page.tsx](../../../app/%28public%29/shops/%5BshopId%5D/menus/%5BmenuId%5D/page.tsx) | 7 | `@/features/public/shops/server/PublicMenuDetailPage` |
| [app/(public)/shops/[shopId]/page.tsx](../../../app/%28public%29/shops/%5BshopId%5D/page.tsx) | 7 | `@/features/public/shops/server/PublicShopDetailPage` |
| [app/(public)/shops/loading.tsx](../../../app/%28public%29/shops/loading.tsx) | 44 | — |
| [app/(public)/shops/page.tsx](../../../app/%28public%29/shops/page.tsx) | 7 | `@/features/public/shops/server/PublicShopListPage` |
| [app/(public)/terms/page.tsx](../../../app/%28public%29/terms/page.tsx) | 97 | `@/lib/public-prototype`, `next/link` |
| [app/admin/(auth)/layout.tsx](../../../app/admin/%28auth%29/layout.tsx) | 6 | `react` |
| [app/admin/(auth)/login/page.tsx](../../../app/admin/%28auth%29/login/page.tsx) | 2 | `@/features/admin/auth/server/AdminLoginPage` |
| [app/admin/(auth)/register/page.tsx](../../../app/admin/%28auth%29/register/page.tsx) | 2 | `@/features/admin/auth/server/AdminRegisterPage` |
| [app/admin/(dashboard)/layout.tsx](../../../app/admin/%28dashboard%29/layout.tsx) | 18 | `react`, `@/components/layout/AdminDashboardShell`, `@/lib/auth/admin-auth` |
| [app/admin/(dashboard)/menus/[menuId]/edit/loading.tsx](../../../app/admin/%28dashboard%29/menus/%5BmenuId%5D/edit/loading.tsx) | 67 | — |
| [app/admin/(dashboard)/menus/[menuId]/edit/page.tsx](../../../app/admin/%28dashboard%29/menus/%5BmenuId%5D/edit/page.tsx) | 2 | `@/features/admin/menus/server/AdminMenuEditPage` |
| [app/admin/(dashboard)/menus/loading.tsx](../../../app/admin/%28dashboard%29/menus/loading.tsx) | 54 | — |
| [app/admin/(dashboard)/menus/new/page.tsx](../../../app/admin/%28dashboard%29/menus/new/page.tsx) | 2 | `@/features/admin/menus/server/AdminMenuNewPage` |
| [app/admin/(dashboard)/menus/page.tsx](../../../app/admin/%28dashboard%29/menus/page.tsx) | 2 | `@/features/admin/menus/server/AdminMenusPage` |
| [app/admin/(dashboard)/shop/page.tsx](../../../app/admin/%28dashboard%29/shop/page.tsx) | 2 | `@/features/admin/shop/server/AdminShopPage` |
| [app/admin/demo/menus/[menuId]/edit/page.tsx](../../../app/admin/demo/menus/%5BmenuId%5D/edit/page.tsx) | 151 | `@/lib/auth/demo-shop`, `next/link`, `next/navigation`, `@/features/admin/menus/components/MenuEditClient`, `@/components/layout/AdminDashboardShell`, `@/lib/allergens`, `@/lib/db`, `@/lib/storage/image-url-policy`, `@/lib/utils/menu-image-display` |
| [app/admin/demo/menus/new/page.tsx](../../../app/admin/demo/menus/new/page.tsx) | 64 | `next/link`, `@/features/admin/menus/components/NewMenuForm`, `@/components/layout/AdminDashboardShell`, `@/lib/db` |
| [app/admin/demo/menus/page.tsx](../../../app/admin/demo/menus/page.tsx) | 119 | `@/lib/auth/demo-shop`, `@/features/admin/menus/components/CreateMenuButton`, `@/features/admin/menus/components/MenuListPageClient`, `@/components/layout/AdminDashboardShell`, `@/lib/allergens`, `@/lib/db` |
| [app/admin/demo/page.tsx](../../../app/admin/demo/page.tsx) | 159 | `@/lib/auth/demo-shop`, `next/link`, `@/components/layout/AdminDashboardShell`, `@/features/admin/shop/components/ShopEditClient`, `@/lib/db`, `@/lib/storage/image-url-policy`, `@/lib/utils/menu-image-display` |
| [app/admin/invitations/page.tsx](../../../app/admin/invitations/page.tsx) | 2 | `@/features/admin/invitations/server/AdminInvitationsPage` |
| [app/admin/layout.tsx](../../../app/admin/layout.tsx) | 7 | `react`, `@clerk/nextjs` |
| [app/admin/page.tsx](../../../app/admin/page.tsx) | 55 | `next/navigation`, `@/features/admin/auth/components/AdminLoginPageClient`, `@/lib/auth/getCurrentAppUser`, `@/lib/auth/admin-auth`, `@/lib/auth/admin-platform-auth`, `@/lib/db/errors` |
| [app/api/admin/auth/login/route.ts](../../../app/api/admin/auth/login/route.ts) | 5 | `@/features/admin/auth/server/adminLoginRoute`, `@/lib/observability` |
| [app/api/admin/auth/sso/route.ts](../../../app/api/admin/auth/sso/route.ts) | 5 | `@/features/admin/auth/server/adminSsoRoute`, `@/lib/observability` |
| [app/api/admin/invitations/[inviteId]/resend/route.ts](../../../app/api/admin/invitations/%5BinviteId%5D/resend/route.ts) | 5 | `@/features/admin/invitations/server/resendInvitationRoute`, `@/lib/observability` |
| [app/api/admin/invitations/[inviteId]/revoke/route.ts](../../../app/api/admin/invitations/%5BinviteId%5D/revoke/route.ts) | 5 | `@/features/admin/invitations/server/revokeInvitationRoute`, `@/lib/observability` |
| [app/api/admin/invitations/route.ts](../../../app/api/admin/invitations/route.ts) | 6 | `@/features/admin/invitations/server/adminInvitationsRoute`, `@/lib/observability` |
| [app/api/admin/menus/[menuId]/route.ts](../../../app/api/admin/menus/%5BmenuId%5D/route.ts) | 7 | `@/features/admin/menus/server/adminMenuRoute`, `@/lib/observability` |
| [app/api/admin/menus/route.ts](../../../app/api/admin/menus/route.ts) | 6 | `@/features/admin/menus/server/adminMenusRoute`, `@/lib/observability` |
| [app/api/admin/onboarding/route.ts](../../../app/api/admin/onboarding/route.ts) | 5 | `@/features/admin/auth/server/adminOnboardingRoute`, `@/lib/observability` |
| [app/api/admin/places/search/route.ts](../../../app/api/admin/places/search/route.ts) | 5 | `@/features/admin/shop/server/adminPlacesSearchRoute`, `@/lib/observability` |
| [app/api/admin/register/route.ts](../../../app/api/admin/register/route.ts) | 5 | `@/features/admin/auth/server/adminRegisterRoute`, `@/lib/observability` |
| [app/api/admin/shop/route.ts](../../../app/api/admin/shop/route.ts) | 6 | `@/features/admin/shop/server/adminShopRoute`, `@/lib/observability` |
| [app/api/admin/upload-menu-image/route.ts](../../../app/api/admin/upload-menu-image/route.ts) | 5 | `@/features/admin/menus/server/uploadMenuImageRoute`, `@/lib/observability` |
| [app/api/admin/upload-shop-image/route.ts](../../../app/api/admin/upload-shop-image/route.ts) | 5 | `@/features/admin/shop/server/uploadShopImageRoute`, `@/lib/observability` |
| [app/api/allergens/route.ts](../../../app/api/allergens/route.ts) | 5 | `@/features/public/shops/server/allergensRoute`, `@/lib/observability` |
| [app/api/invitations/accept/route.ts](../../../app/api/invitations/accept/route.ts) | 5 | `@/features/admin/invitations/server/acceptInvitationRoute`, `@/lib/observability` |
| [app/api/menus/[menuId]/route.ts](../../../app/api/menus/%5BmenuId%5D/route.ts) | 5 | `@/features/public/shops/server/publicMenuRoute`, `@/lib/observability` |
| [app/api/places/search/route.ts](../../../app/api/places/search/route.ts) | 5 | `@/features/public/shops/server/placesSearchRoute`, `@/lib/observability` |
| [app/error.tsx](../../../app/error.tsx) | 14 | — |
| [app/global-error.tsx](../../../app/global-error.tsx) | 16 | — |
| [app/layout.tsx](../../../app/layout.tsx) | 53 | `@/lib/public-prototype`, `next`, `next/font/google`, `@vercel/analytics/next` |
| [app/not-found.tsx](../../../app/not-found.tsx) | 33 | `next/link` |
| [app/page.tsx](../../../app/page.tsx) | 6 | `@/features/public/shops/server/HomePage` |
| [app/sign-in/[[...sign-in]]/page.tsx](../../../app/sign-in/%5B%5B...sign-in%5D%5D/page.tsx) | 8 | `next/navigation` |
| [app/sign-in/layout.tsx](../../../app/sign-in/layout.tsx) | 7 | `react`, `@clerk/nextjs` |
| [app/sign-in/sso-callback/page.tsx](../../../app/sign-in/sso-callback/page.tsx) | 2 | `@/features/admin/auth/server/SignInSsoCallbackPage` |
| [app/sign-up/[[...sign-up]]/page.tsx](../../../app/sign-up/%5B%5B...sign-up%5D%5D/page.tsx) | 2 | `@/features/admin/auth/server/SignUpPage` |
| [app/sign-up/layout.tsx](../../../app/sign-up/layout.tsx) | 7 | `react`, `@clerk/nextjs` |
| [components/layout/AdminDashboardShell.tsx](../../../components/layout/AdminDashboardShell.tsx) | 139 | `react`, `next/link`, `@/components/layout/AdminLogoutButton`, `@/components/layout/BrandLogo` |
| [components/layout/AdminLogoutButton.tsx](../../../components/layout/AdminLogoutButton.tsx) | 48 | `react`, `@clerk/nextjs` |
| [components/layout/BrandLogo.tsx](../../../components/layout/BrandLogo.tsx) | 69 | `next/image` |
| [components/layout/PublicHeader.tsx](../../../components/layout/PublicHeader.tsx) | 49 | `next/link`, `react`, `@/components/layout/BrandLogo`, `@/features/public/shops/components/PublicSearchBox` |
| [features/admin/auth/components/AdminGoogleAuthButton.tsx](../../../features/admin/auth/components/AdminGoogleAuthButton.tsx) | 129 | `@clerk/nextjs` |
| [features/admin/auth/components/AdminGoogleSsoAuditBeacon.tsx](../../../features/admin/auth/components/AdminGoogleSsoAuditBeacon.tsx) | 25 | `react`, `@clerk/nextjs` |
| [features/admin/auth/components/AdminInvitationAcceptPageClient.tsx](../../../features/admin/auth/components/AdminInvitationAcceptPageClient.tsx) | 120 | `@clerk/nextjs`, `next/link`, `next/navigation`, `react`, `@/components/layout/BrandLogo` |
| [features/admin/auth/components/AdminInvitationSignUpPageClient.tsx](../../../features/admin/auth/components/AdminInvitationSignUpPageClient.tsx) | 303 | `next/link`, `next/navigation`, `@clerk/nextjs`, `react`, `@/components/layout/BrandLogo`, `@/lib/auth/clerkErrors` |
| [features/admin/auth/components/AdminLoginPageClient.tsx](../../../features/admin/auth/components/AdminLoginPageClient.tsx) | 574 | `react`, `next/link`, `next/navigation`, `@clerk/nextjs`, `@/features/admin/auth/components/AdminGoogleAuthButton`, `@/components/layout/BrandLogo`, `@/lib/email`, `@/lib/auth/clerkErrors` |
| [features/admin/auth/components/AdminOnboardingPageClient.tsx](../../../features/admin/auth/components/AdminOnboardingPageClient.tsx) | 220 | `@clerk/nextjs`, `next/link`, `next/navigation`, `react`, `@/components/layout/BrandLogo` |
| [features/admin/auth/components/AdminRegisterPageClient.tsx](../../../features/admin/auth/components/AdminRegisterPageClient.tsx) | 489 | `react`, `next/link`, `next/navigation`, `@clerk/nextjs`, `@/features/admin/auth/components/AdminGoogleAuthButton`, `@/components/layout/BrandLogo`, `@/lib/email`, `@/lib/auth/clerkErrors` |
| [features/admin/auth/server/AdminLoginPage.tsx](../../../features/admin/auth/server/AdminLoginPage.tsx) | 100 | `next/navigation`, `@/features/admin/auth/components/AdminLoginPageClient`, `@/lib/auth/clerkAdmin`, `@/lib/auth/getCurrentAppUser`, `@/lib/auth/admin-auth`, `@/lib/auth/admin-platform-auth`, `@/lib/db/errors` |
| [features/admin/auth/server/AdminRegisterPage.tsx](../../../features/admin/auth/server/AdminRegisterPage.tsx) | 170 | `next/navigation`, `@/features/admin/auth/components/AdminRegisterPageClient`, `@/features/admin/auth/components/AdminInvitationAcceptPageClient`, `@/lib/auth/getCurrentAppUser`, `@/lib/auth/clerkAdmin`, `@/lib/auth/admin-auth`, `@/lib/auth/admin-registration`, `@/lib/db/errors`, `@/lib/auth/portfolio-mode` |
| [features/admin/auth/server/SignInSsoCallbackPage.tsx](../../../features/admin/auth/server/SignInSsoCallbackPage.tsx) | 20 | `@clerk/nextjs`, `@/features/admin/auth/components/AdminGoogleSsoAuditBeacon` |
| [features/admin/auth/server/SignUpPage.tsx](../../../features/admin/auth/server/SignUpPage.tsx) | 20 | `@/features/admin/auth/components/AdminInvitationSignUpPageClient` |
| [features/admin/auth/server/adminLoginRoute.ts](../../../features/admin/auth/server/adminLoginRoute.ts) | 154 | `hono`, `next/server`, `@/lib/validators/admin-auth`, `@/lib/auth/admin-api-security`, `@/lib/audit-log`, `@/lib/db/errors`, `@/lib/utils/request-ip`, `@/lib/auth/auth-audit`, `@/lib/observability` |
| [features/admin/auth/server/adminOnboardingRoute.ts](../../../features/admin/auth/server/adminOnboardingRoute.ts) | 259 | `hono`, `@/lib/observability`, `next/server`, `@/lib/auth/getCurrentAppUser`, `@/lib/auth/clerkAdmin`, `@/lib/validators/admin-auth`, `@/lib/auth/admin-api-security`, `@/lib/audit-log`, `@/lib/db`, `@/lib/db/errors`, `@/lib/auth/admin-registration`, `@/lib/utils/request-ip`, `@/lib/auth/portfolio-mode` |
| [features/admin/auth/server/adminRegisterRoute.ts](../../../features/admin/auth/server/adminRegisterRoute.ts) | 335 | `hono`, `@/lib/observability`, `next/server`, `@/lib/db`, `@/lib/db/errors`, `@/lib/auth/admin-registration`, `@/lib/auth/admin-api-security`, `@/lib/validators/admin-auth`, `@/lib/audit-log`, `@/lib/utils/request-ip`, `@/lib/auth/portfolio-mode`, `@/lib/auth/clerkAdminServer`, `@/lib/auth/clerkErrors` |
| [features/admin/auth/server/adminSsoRoute.ts](../../../features/admin/auth/server/adminSsoRoute.ts) | 94 | `hono`, `next/server`, `@/lib/validators/admin-auth`, `@/lib/auth/admin-api-security`, `@/lib/audit-log`, `@/lib/utils/request-ip`, `@/lib/auth/auth-audit`, `@/lib/observability` |
| [features/admin/invitations/components/AdminInvitationManager.tsx](../../../features/admin/invitations/components/AdminInvitationManager.tsx) | 283 | `next/navigation`, `react` |
| [features/admin/invitations/schemas/admin-invitations.ts](../../../features/admin/invitations/schemas/admin-invitations.ts) | 47 | `zod`, `@/lib/email` |
| [features/admin/invitations/server/AdminInvitationsPage.tsx](../../../features/admin/invitations/server/AdminInvitationsPage.tsx) | 72 | `next/link`, `@/lib/db`, `@/lib/auth/admin-platform-auth`, `@/features/admin/invitations/components/AdminInvitationManager`, `@/components/layout/AdminLogoutButton`, `@/components/layout/BrandLogo` |
| [features/admin/invitations/server/acceptInvitationRoute.ts](../../../features/admin/invitations/server/acceptInvitationRoute.ts) | 121 | `@prisma/client`, `hono`, `next/server`, `@/lib/auth/getCurrentAppUser`, `@/lib/auth/admin-api-security`, `@/lib/auth/invitations`, `@/lib/db/errors`, `@/lib/auth/portfolio-mode`, `@/lib/audit-log`, `@/lib/observability` |
| [features/admin/invitations/server/adminInvitationsRoute.ts](../../../features/admin/invitations/server/adminInvitationsRoute.ts) | 329 | `@prisma/client`, `hono`, `next/server`, `@/lib/db`, `@/lib/auth/admin-api-security`, `@/lib/auth/admin-platform-auth`, `@/lib/auth/portfolio-mode`, `@/lib/auth/invitations`, `@/features/admin/invitations/schemas/admin-invitations`, `@/lib/auth/clerkAdminServer`, `@/lib/db/errors`, `@/lib/audit-log`, `@/lib/observability` |
| [features/admin/invitations/server/resendInvitationRoute.ts](../../../features/admin/invitations/server/resendInvitationRoute.ts) | 244 | `@prisma/client`, `hono`, `next/server`, `@/lib/db`, `@/lib/auth/admin-api-security`, `@/lib/auth/admin-platform-auth`, `@/lib/auth/portfolio-mode`, `@/lib/auth/invitations`, `@/lib/auth/clerkAdminServer`, `@/lib/audit-log`, `@/lib/observability`, `@/lib/db/errors` |
| [features/admin/invitations/server/revokeInvitationRoute.ts](../../../features/admin/invitations/server/revokeInvitationRoute.ts) | 157 | `hono`, `next/server`, `@/lib/db`, `@/lib/auth/admin-api-security`, `@/lib/auth/admin-platform-auth`, `@/lib/auth/portfolio-mode`, `@/lib/auth/invitations`, `@/lib/auth/clerkAdminServer`, `@/lib/db/errors`, `@/lib/audit-log`, `@/lib/observability` |
| [features/admin/menus/components/CreateMenuButton.tsx](../../../features/admin/menus/components/CreateMenuButton.tsx) | 37 | `next/link` |
| [features/admin/menus/components/ImageCompositionEditor.tsx](../../../features/admin/menus/components/ImageCompositionEditor.tsx) | 795 | `next/image`, `react`, `@/lib/utils/menu-image-display` |
| [features/admin/menus/components/MenuEditClient.tsx](../../../features/admin/menus/components/MenuEditClient.tsx) | 816 | `../publication-review`, `react`, `next/navigation`, `./useUnsavedMenuChanges`, `@/lib/allergens`, `@/features/admin/menus/components/CreateMenuButton`, `@/features/admin/menus/components/ImageCompositionEditor`, `@/features/admin/menus/components/MenuPublishReadinessNotice`, `@/features/admin/menus/components/menu-form-values`, `@/lib/utils/api-error-message`, `@/lib/utils/menu-image-display` |
| [features/admin/menus/components/MenuListPageClient.tsx](../../../features/admin/menus/components/MenuListPageClient.tsx) | 428 | `next/link`, `next/image`, `react`, `@/lib/utils/api-error-message` |
| [features/admin/menus/components/MenuPublishReadinessNotice.tsx](../../../features/admin/menus/components/MenuPublishReadinessNotice.tsx) | 39 | — |
| [features/admin/menus/components/NewMenuForm.tsx](../../../features/admin/menus/components/NewMenuForm.tsx) | 670 | `../publication-review`, `react`, `next/navigation`, `./useUnsavedMenuChanges`, `@/lib/allergens`, `@/features/admin/menus/components/CreateMenuButton`, `@/features/admin/menus/components/ImageCompositionEditor`, `@/features/admin/menus/components/MenuPublishReadinessNotice`, `@/features/admin/menus/components/menu-form-values`, `@/lib/utils/api-error-message`, `@/lib/utils/menu-image-display` |
| [features/admin/menus/components/menu-form-values.ts](../../../features/admin/menus/components/menu-form-values.ts) | 62 | — |
| [features/admin/menus/components/useUnsavedMenuChanges.ts](../../../features/admin/menus/components/useUnsavedMenuChanges.ts) | 50 | `react` |
| [features/admin/menus/publication-review.ts](../../../features/admin/menus/publication-review.ts) | 13 | — |
| [features/admin/menus/schemas/menu-input.ts](../../../features/admin/menus/schemas/menu-input.ts) | 32 | `zod`, `@/lib/allergens`, `@/lib/utils/menu-image-display` |
| [features/admin/menus/server/AdminMenuEditPage.tsx](../../../features/admin/menus/server/AdminMenuEditPage.tsx) | 136 | `@/features/admin/menus/components/MenuEditClient`, `@/lib/db`, `next/navigation`, `next/link`, `@/lib/allergens`, `@/lib/auth/admin-auth`, `@/lib/storage/image-url-policy`, `@/lib/utils/menu-image-display` |
| [features/admin/menus/server/AdminMenuNewPage.tsx](../../../features/admin/menus/server/AdminMenuNewPage.tsx) | 50 | `next/link`, `@/features/admin/menus/components/NewMenuForm`, `@/lib/db`, `@/lib/auth/admin-auth` |
| [features/admin/menus/server/AdminMenusPage.tsx](../../../features/admin/menus/server/AdminMenusPage.tsx) | 96 | `@/lib/db`, `@/lib/auth/admin-auth`, `@/features/admin/menus/components/MenuListPageClient`, `@/features/admin/menus/components/CreateMenuButton`, `@/lib/allergens` |
| [features/admin/menus/server/adminMenuRoute.ts](../../../features/admin/menus/server/adminMenuRoute.ts) | 584 | `hono`, `@/lib/observability`, `next/server`, `@/lib/db`, `@/lib/auth/admin-api-utils`, `@/lib/allergens`, `@/lib/validators/admin-input`, `@/lib/audit-log`, `@/lib/auth/admin-api-security`, `@/lib/storage/image-url-policy`, `@/lib/auth/portfolio-mode`, `@/lib/public-cache`, `@/features/admin/menus/server/menu-update-helpers`, `@/lib/utils/menu-image-display`, `@/features/admin/menus/schemas/menu-input` |
| [features/admin/menus/server/adminMenusRoute.ts](../../../features/admin/menus/server/adminMenusRoute.ts) | 314 | `hono`, `@/lib/observability`, `next/server`, `@/lib/db`, `@/lib/auth/admin-api-utils`, `@/lib/auth/admin-api-security`, `@/lib/validators/admin-input`, `@/lib/allergens`, `@/lib/audit-log`, `@/lib/storage/image-url-policy`, `@/lib/auth/portfolio-mode`, `@/lib/public-cache`, `@/lib/utils/menu-image-display`, `@/features/admin/menus/schemas/menu-input` |
| [features/admin/menus/server/menu-update-helpers.ts](../../../features/admin/menus/server/menu-update-helpers.ts) | 39 | `@/lib/allergens` |
| [features/admin/menus/server/uploadMenuImageRoute.ts](../../../features/admin/menus/server/uploadMenuImageRoute.ts) | 127 | `@/lib/observability`, `hono`, `next/server`, `@/lib/auth/admin-api-utils`, `@/lib/auth/admin-api-security`, `@/lib/storage/upload-images`, `@/lib/audit-log`, `@/lib/auth/portfolio-mode` |
| [features/admin/shop/components/AdminGooglePlacePicker.tsx](../../../features/admin/shop/components/AdminGooglePlacePicker.tsx) | 101 | `react`, `@/types/google-places` |
| [features/admin/shop/components/ShopEditClient.tsx](../../../features/admin/shop/components/ShopEditClient.tsx) | 1271 | `next/link`, `next/image`, `react`, `@/features/admin/menus/components/useUnsavedMenuChanges`, `@/features/public/shops/components/ShareShopUrlButton`, `@/features/admin/shop/components/ShopQrCard`, `@/features/admin/menus/components/ImageCompositionEditor`, `@/features/admin/shop/components/AdminGooglePlacePicker`, `@/lib/constants/prefectures`, `@/types/google-places`, `@/lib/utils/formatters`, `@/lib/utils/menu-image-display` |
| [features/admin/shop/components/ShopQrCard.tsx](../../../features/admin/shop/components/ShopQrCard.tsx) | 268 | `next/link`, `react`, `qrcode.react` |
| [features/admin/shop/server/AdminShopPage.tsx](../../../features/admin/shop/server/AdminShopPage.tsx) | 120 | `@/lib/db`, `next/navigation`, `@/lib/auth/admin-auth`, `@/features/admin/shop/components/ShopEditClient`, `@/lib/storage/image-url-policy`, `@/lib/utils/menu-image-display` |
| [features/admin/shop/server/adminPlacesSearchRoute.ts](../../../features/admin/shop/server/adminPlacesSearchRoute.ts) | 48 | `hono`, `next/server`, `@/lib/observability`, `@/lib/auth/admin-api-utils`, `@/lib/google-places` |
| [features/admin/shop/server/adminShopRoute.ts](../../../features/admin/shop/server/adminShopRoute.ts) | 512 | `zod`, `hono`, `@/lib/observability`, `next/server`, `@/lib/db`, `@/lib/auth/admin-api-utils`, `@/lib/auth/admin-api-security`, `@/lib/validators/admin-input`, `@/lib/storage/image-url-policy`, `@/lib/audit-log`, `@/lib/auth/portfolio-mode`, `@/lib/public-cache`, `@/lib/utils/menu-image-display`, `@/lib/constants/prefectures` |
| [features/admin/shop/server/uploadShopImageRoute.ts](../../../features/admin/shop/server/uploadShopImageRoute.ts) | 125 | `@/lib/observability`, `hono`, `next/server`, `@/lib/auth/admin-api-utils`, `@/lib/auth/admin-api-security`, `@/lib/storage/upload-images`, `@/lib/audit-log`, `@/lib/auth/portfolio-mode` |
| [features/public/shops/components/HomePageView.tsx](../../../features/public/shops/components/HomePageView.tsx) | 448 | `next/image`, `next/link`, `@/components/layout/BrandLogo`, `@/lib/utils/formatters` |
| [features/public/shops/components/PublicDataUnavailable.tsx](../../../features/public/shops/components/PublicDataUnavailable.tsx) | 39 | `next/link` |
| [features/public/shops/components/PublicMenuDetailBodyClient.tsx](../../../features/public/shops/components/PublicMenuDetailBodyClient.tsx) | 292 | `@/lib/public-prototype`, `next/link`, `next/image`, `react`, `@/features/public/shops/components/SelectedAllergenResultCardsClient`, `@/features/public/shops/components/UserAllergenPreferenceClient`, `@/lib/allergens`, `@/lib/utils/menu-image-display` |
| [features/public/shops/components/PublicMenuSearchSummaryClient.tsx](../../../features/public/shops/components/PublicMenuSearchSummaryClient.tsx) | 49 | `react`, `next/navigation` |
| [features/public/shops/components/PublicSearchBox.tsx](../../../features/public/shops/components/PublicSearchBox.tsx) | 82 | `react`, `next/navigation` |
| [features/public/shops/components/PublicShopListClient.tsx](../../../features/public/shops/components/PublicShopListClient.tsx) | 395 | `next/link`, `react`, `next/navigation`, `@/lib/constants/prefectures`, `@/features/public/shops/components/UserAllergenPreferenceClient`, `@/features/public/shops/components/PublicShopMap`, `@/features/public/shops/components/public-shop-search` |
| [features/public/shops/components/PublicShopMap.tsx](../../../features/public/shops/components/PublicShopMap.tsx) | 34 | — |
| [features/public/shops/components/SelectedAllergenResultCardsClient.tsx](../../../features/public/shops/components/SelectedAllergenResultCardsClient.tsx) | 209 | `@/lib/public-prototype`, `@/lib/public-allergen-preferences`, `react`, `@/lib/allergens`, `@/features/public/shops/components/UserAllergenPreferenceClient` |
| [features/public/shops/components/ShareShopUrlButton.tsx](../../../features/public/shops/components/ShareShopUrlButton.tsx) | 63 | `react` |
| [features/public/shops/components/ShopMenuListClient.tsx](../../../features/public/shops/components/ShopMenuListClient.tsx) | 298 | `@/lib/public-prototype`, `@/lib/public-allergen-preferences`, `react`, `next/link`, `next/navigation`, `@/lib/allergens`, `@/lib/utils/formatters`, `@/features/public/shops/components/UserAllergenPreferenceClient` |
| [features/public/shops/components/UserAllergenPreferenceClient.tsx](../../../features/public/shops/components/UserAllergenPreferenceClient.tsx) | 158 | `react`, `@/lib/public-allergen-preferences`, `@/features/admin/menus/components/useUnsavedMenuChanges` |
| [features/public/shops/components/public-shop-search.ts](../../../features/public/shops/components/public-shop-search.ts) | 278 | `@/lib/allergens`, `@/lib/constants/prefectures` |
| [features/public/shops/server/HomePage.tsx](../../../features/public/shops/server/HomePage.tsx) | 43 | `@/features/public/shops/components/HomePageView` |
| [features/public/shops/server/PublicMenuDetailPage.tsx](../../../features/public/shops/server/PublicMenuDetailPage.tsx) | 202 | `./storeAllergenSupplement`, `next/link`, `next/navigation`, `@/lib/db`, `@/features/public/shops/components/PublicDataUnavailable`, `@/features/public/shops/components/PublicMenuDetailBodyClient`, `@/lib/allergens`, `@/lib/utils/formatters`, `@/lib/storage/image-url-policy`, `@/lib/public-db` |
| [features/public/shops/server/PublicShopDetailPage.tsx](../../../features/public/shops/server/PublicShopDetailPage.tsx) | 462 | `next/link`, `next/image`, `react`, `next/navigation`, `@/lib/db`, `@/features/public/shops/components/ShareShopUrlButton`, `@/features/public/shops/components/ShopMenuListClient`, `@/features/public/shops/components/UserAllergenPreferenceClient`, `@/features/public/shops/components/PublicDataUnavailable`, `@/features/public/shops/components/PublicMenuSearchSummaryClient`, `@/lib/utils/formatters`, `@/lib/storage/image-url-policy`, `@/lib/public-db`, `@/lib/allergens`, `@/lib/utils/menu-image-display` |
| [features/public/shops/server/PublicShopListPage.tsx](../../../features/public/shops/server/PublicShopListPage.tsx) | 141 | `react`, `@/lib/db`, `@/lib/public-db`, `@/features/public/shops/components/PublicShopListClient`, `@/lib/allergens` |
| [features/public/shops/server/allergensRoute.ts](../../../features/public/shops/server/allergensRoute.ts) | 28 | `hono`, `@/lib/observability`, `next/server`, `@/lib/db` |
| [features/public/shops/server/placesSearchRoute.ts](../../../features/public/shops/server/placesSearchRoute.ts) | 26 | `hono`, `@/lib/observability`, `next/server` |
| [features/public/shops/server/publicMenuRoute.ts](../../../features/public/shops/server/publicMenuRoute.ts) | 175 | `./storeAllergenSupplement`, `hono`, `next/server`, `@/lib/observability`, `@/lib/db`, `@/lib/allergens`, `@/lib/storage/image-url-policy`, `@/lib/utils/menu-image-display` |
| [features/public/shops/server/storeAllergenSupplement.ts](../../../features/public/shops/server/storeAllergenSupplement.ts) | 11 | `@/lib/db`, `@/lib/allergens` |
| [lib/allergens.ts](../../../lib/allergens.ts) | 574 | `@/lib/constants/allergen-master` |
| [lib/audit-log.ts](../../../lib/audit-log.ts) | 83 | `@prisma/client`, `@/lib/db`, `@/lib/db/errors`, `@/lib/observability` |
| [lib/auth/admin-api-security.ts](../../../lib/auth/admin-api-security.ts) | 72 | `next/server`, `node:crypto`, `@/lib/utils/rate-limit` |
| [lib/auth/admin-api-utils.ts](../../../lib/auth/admin-api-utils.ts) | 73 | `next/server`, `@/lib/auth/admin-auth`, `@/lib/db/errors`, `@/lib/observability` |
| [lib/auth/admin-auth.ts](../../../lib/auth/admin-auth.ts) | 155 | `next/navigation`, `react`, `@/lib/auth/getCurrentAppUser`, `@/lib/db/errors`, `@/lib/db` |
| [lib/auth/admin-platform-auth.ts](../../../lib/auth/admin-platform-auth.ts) | 62 | `@clerk/nextjs/server`, `next/navigation`, `next/server`, `@/lib/auth/portfolio-mode` |
| [lib/auth/admin-registration.ts](../../../lib/auth/admin-registration.ts) | 59 | — |
| [lib/auth/auth-audit.ts](../../../lib/auth/auth-audit.ts) | 60 | `node:crypto`, `@clerk/nextjs/server`, `next/server`, `@/lib/auth/getCurrentAppUser`, `@/lib/audit-log`, `@/lib/utils/rate-limit`, `@/lib/utils/request-ip` |
| [lib/auth/clerkAdmin.ts](../../../lib/auth/clerkAdmin.ts) | 20 | — |
| [lib/auth/clerkAdminCore.ts](../../../lib/auth/clerkAdminCore.ts) | 248 | `@clerk/backend`, `../db`, `../email` |
| [lib/auth/clerkAdminServer.ts](../../../lib/auth/clerkAdminServer.ts) | 13 | `./clerkAdminCore` |
| [lib/auth/clerkErrors.ts](../../../lib/auth/clerkErrors.ts) | 89 | — |
| [lib/auth/demo-shop.ts](../../../lib/auth/demo-shop.ts) | 7 | — |
| [lib/auth/getCurrentAppUser.ts](../../../lib/auth/getCurrentAppUser.ts) | 134 | `@clerk/nextjs/server`, `@/lib/db`, `@/lib/db/errors`, `@/lib/email` |
| [lib/auth/invitations.ts](../../../lib/auth/invitations.ts) | 303 | `@prisma/client`, `@/lib/db`, `@/lib/email` |
| [lib/auth/portfolio-mode.ts](../../../lib/auth/portfolio-mode.ts) | 101 | `@clerk/nextjs/server`, `next/server`, `@/lib/auth/getCurrentAppUser` |
| [lib/constants/allergen-master.ts](../../../lib/constants/allergen-master.ts) | 73 | — |
| [lib/constants/prefectures.ts](../../../lib/constants/prefectures.ts) | 10 | — |
| [lib/db/errors.ts](../../../lib/db/errors.ts) | 157 | `@prisma/client`, `@/lib/observability` |
| [lib/db/index.ts](../../../lib/db/index.ts) | 18 | `@prisma/client` |
| [lib/email.ts](../../../lib/email.ts) | 14 | — |
| [lib/google-places.ts](../../../lib/google-places.ts) | 100 | `@/types/google-places` |
| [lib/observability.ts](../../../lib/observability.ts) | 102 | `node:async_hooks`, `node:crypto` |
| [lib/public-allergen-preferences.ts](../../../lib/public-allergen-preferences.ts) | 143 | `@/lib/constants/allergen-master` |
| [lib/public-cache.ts](../../../lib/public-cache.ts) | 14 | `next/cache` |
| [lib/public-db.ts](../../../lib/public-db.ts) | 43 | `@/lib/db/errors` |
| [lib/public-prototype.ts](../../../lib/public-prototype.ts) | 3 | — |
| [lib/storage/image-url-policy.ts](../../../lib/storage/image-url-policy.ts) | 70 | — |
| [lib/storage/upload-images.ts](../../../lib/storage/upload-images.ts) | 110 | `@vercel/blob` |
| [lib/utils/api-error-message.ts](../../../lib/utils/api-error-message.ts) | 65 | — |
| [lib/utils/formatters.ts](../../../lib/utils/formatters.ts) | 21 | — |
| [lib/utils/menu-image-display.ts](../../../lib/utils/menu-image-display.ts) | 100 | — |
| [lib/utils/rate-limit.ts](../../../lib/utils/rate-limit.ts) | 82 | — |
| [lib/utils/request-ip.ts](../../../lib/utils/request-ip.ts) | 39 | `node:net` |
| [lib/validators/admin-auth.ts](../../../lib/validators/admin-auth.ts) | 84 | `zod`, `@/lib/email` |
| [lib/validators/admin-input.ts](../../../lib/validators/admin-input.ts) | 136 | — |
| [prisma/demo-menus.ts](../../../prisma/demo-menus.ts) | 153 | `../lib/constants/allergen-master`, `../lib/allergens` |
| [prisma/migrations/20260301144342_init/migration.sql](../../../prisma/migrations/20260301144342_init/migration.sql) | 97 | — |
| [prisma/migrations/20260308085850_add_shop_cover_image/migration.sql](../../../prisma/migrations/20260308085850_add_shop_cover_image/migration.sql) | 3 | — |
| [prisma/migrations/20260404122218_add_clerk_user_id_nullable/migration.sql](../../../prisma/migrations/20260404122218_add_clerk_user_id_nullable/migration.sql) | 17 | — |
| [prisma/migrations/20260404143000_add_shop_average_budget/migration.sql](../../../prisma/migrations/20260404143000_add_shop_average_budget/migration.sql) | 3 | — |
| [prisma/migrations/20260405000000_add_unknown_allergen_status/migration.sql](../../../prisma/migrations/20260405000000_add_unknown_allergen_status/migration.sql) | 2 | — |
| [prisma/migrations/20260405000100_set_unknown_allergen_default/migration.sql](../../../prisma/migrations/20260405000100_set_unknown_allergen_default/migration.sql) | 3 | — |
| [prisma/migrations/20260405010000_add_audit_log/migration.sql](../../../prisma/migrations/20260405010000_add_audit_log/migration.sql) | 26 | — |
| [prisma/migrations/20260420000000_add_admin_invites/migration.sql](../../../prisma/migrations/20260420000000_add_admin_invites/migration.sql) | 58 | — |
| [prisma/migrations/20260420090000_add_menu_image_display_options/migration.sql](../../../prisma/migrations/20260420090000_add_menu_image_display_options/migration.sql) | 4 | — |
| [prisma/migrations/20260420100000_add_menu_image_fine_tuning/migration.sql](../../../prisma/migrations/20260420100000_add_menu_image_fine_tuning/migration.sql) | 5 | — |
| [prisma/migrations/20260420110000_add_menu_image_frame/migration.sql](../../../prisma/migrations/20260420110000_add_menu_image_frame/migration.sql) | 3 | — |
| [prisma/migrations/20260420120000_add_shop_cover_image_display_options/migration.sql](../../../prisma/migrations/20260420120000_add_shop_cover_image_display_options/migration.sql) | 7 | — |
| [prisma/migrations/20260420130000_split_shop_business_fields/migration.sql](../../../prisma/migrations/20260420130000_split_shop_business_fields/migration.sql) | 43 | `(?:定休日|休業日)[[:space:]]*[:：][[:space:]]*([^\r\n]+)`, `(?:電話番号|電話|TEL)[[:space:]]*[:：][[:space:]]*([^\r\n]+)`, `(?:備考|メモ)[[:space:]]*[:：][[:space:]]*([^\r\n]+)` |
| [prisma/migrations/20260424070000_add_pistachio_allergen/migration.sql](../../../prisma/migrations/20260424070000_add_pistachio_allergen/migration.sql) | 33 | — |
| [prisma/migrations/20260611000000_add_shop_area_and_google_place/migration.sql](../../../prisma/migrations/20260611000000_add_shop_area_and_google_place/migration.sql) | 11 | — |
| [prisma/migrations/20260622000000_auto_unpublish_incomplete_menus/migration.sql](../../../prisma/migrations/20260622000000_auto_unpublish_incomplete_menus/migration.sql) | 125 | — |
| [prisma/repair-published-menus.ts](../../../prisma/repair-published-menus.ts) | 96 | `@prisma/client`, `../lib/allergens` |
| [prisma/schema.prisma](../../../prisma/schema.prisma) | 166 | — |
| [prisma/seed.ts](../../../prisma/seed.ts) | 222 | `../lib/auth/demo-shop`, `./demo-menus`, `@next/env`, `bcrypt`, `@prisma/client`, `../lib/auth/clerkAdminCore`, `../lib/constants/allergen-master` |
| [scripts/backfill-pistachio-allergen.ts](../../../scripts/backfill-pistachio-allergen.ts) | 64 | `@next/env`, `@prisma/client`, `../lib/constants/allergen-master` |
| [scripts/browser-runner.mjs](../../../scripts/browser-runner.mjs) | 63 | `node:child_process`, `node:fs`, `node:os`, `node:path`, `node:url` |
| [scripts/check-allergen-master.ts](../../../scripts/check-allergen-master.ts) | 251 | `@next/env`, `@prisma/client`, `../lib/constants/allergen-master`, `../lib/allergens` |
| [scripts/check-ci-database.ts](../../../scripts/check-ci-database.ts) | 13 | `@prisma/client`, `./ci-environment`, `./database-regression` |
| [scripts/check-first-use-browser.mjs](../../../scripts/check-first-use-browser.mjs) | 276 | `node:assert/strict`, `node:module`, `node:fs`, `node:os`, `node:path` |
| [scripts/check-test-browser.mjs](../../../scripts/check-test-browser.mjs) | 210 | `node:assert/strict`, `node:fs`, `node:child_process`, `node:module` |
| [scripts/check-test-database.ts](../../../scripts/check-test-database.ts) | 15 | `@prisma/client`, `./test-environment`, `./database-regression` |
| [scripts/ci-environment.ts](../../../scripts/ci-environment.ts) | 16 | — |
| [scripts/ci-log-summary.ts](../../../scripts/ci-log-summary.ts) | 24 | — |
| [scripts/cleanup-test-images.ts](../../../scripts/cleanup-test-images.ts) | 19 | `node:fs`, `@vercel/blob`, `./test-environment`, `../lib/storage/image-url-policy` |
| [scripts/collect-ci-diagnostics.ts](../../../scripts/collect-ci-diagnostics.ts) | 21 | `node:fs`, `node:path`, `./ci-environment`, `./ci-log-summary` |
| [scripts/create-test-user.ts](../../../scripts/create-test-user.ts) | 7 | — |
| [scripts/database-regression.ts](../../../scripts/database-regression.ts) | 124 | `node:assert/strict`, `node:crypto`, `@prisma/client`, `../lib/constants/allergen-master` |
| [scripts/migrate-users-to-clerk.ts](../../../scripts/migrate-users-to-clerk.ts) | 81 | `@next/env`, `../lib/db`, `../lib/email`, `../lib/auth/clerkAdminCore` |
| [scripts/setup-ci-env.ts](../../../scripts/setup-ci-env.ts) | 43 | `node:child_process`, `@prisma/client`, `./ci-environment`, `../lib/constants/allergen-master`, `../prisma/demo-menus`, `../lib/auth/demo-shop` |
| [scripts/setup-test-env.ts](../../../scripts/setup-test-env.ts) | 91 | `node:crypto`, `node:fs`, `node:child_process`, `@clerk/backend`, `@prisma/client`, `./test-environment`, `../lib/constants/allergen-master`, `../lib/auth/demo-shop`, `../prisma/demo-menus` |
| [scripts/test-environment.ts](../../../scripts/test-environment.ts) | 14 | — |
| [tests/admin-invitation-api.test.ts](../../../tests/admin-invitation-api.test.ts) | 380 | `node:assert/strict`, `node:test`, `node:module`, `@prisma/client`, `../lib/db` |
| [tests/admin-menu-api.test.ts](../../../tests/admin-menu-api.test.ts) | 175 | `node:assert/strict`, `node:test`, `node:module`, `../lib/db`, `../lib/constants/allergen-master` |
| [tests/admin-origin.test.ts](../../../tests/admin-origin.test.ts) | 47 | `node:assert/strict`, `node:test`, `../lib/auth/admin-api-security` |
| [tests/admin-shop-api.test.ts](../../../tests/admin-shop-api.test.ts) | 169 | `node:assert/strict`, `node:test`, `node:module`, `../lib/db` |
| [tests/admin-upload-api.test.ts](../../../tests/admin-upload-api.test.ts) | 175 | `node:assert/strict`, `node:test`, `node:module`, `../lib/db` |
| [tests/allergen-display.test.ts](../../../tests/allergen-display.test.ts) | 144 | `../lib/public-allergen-preferences`, `node:assert/strict`, `node:test`, `../lib/allergens` |
| [tests/auth-audit-api.test.ts](../../../tests/auth-audit-api.test.ts) | 176 | `node:assert/strict`, `node:test`, `node:module`, `../lib/db` |
| [tests/browser-runner.test.ts](../../../tests/browser-runner.test.ts) | 31 | `node:assert/strict`, `node:child_process`, `node:crypto`, `node:fs`, `node:os`, `node:path`, `node:test` |
| [tests/ci-log-summary.test.ts](../../../tests/ci-log-summary.test.ts) | 34 | `node:assert/strict`, `node:test`, `../scripts/ci-log-summary` |
| [tests/demo-menu-fixtures.test.ts](../../../tests/demo-menu-fixtures.test.ts) | 19 | `node:assert/strict`, `node:test`, `../prisma/demo-menus`, `../lib/constants/allergen-master` |
| [tests/formatters.test.ts](../../../tests/formatters.test.ts) | 18 | `node:assert/strict`, `node:test`, `../lib/utils/formatters` |
| [tests/image-url-policy.test.ts](../../../tests/image-url-policy.test.ts) | 42 | `node:assert/strict`, `node:test`, `../lib/storage/image-url-policy` |
| [tests/menu-input.test.ts](../../../tests/menu-input.test.ts) | 22 | `node:assert/strict`, `node:test`, `../features/admin/menus/schemas/menu-input` |
| [tests/menu-publication.test.ts](../../../tests/menu-publication.test.ts) | 115 | `node:assert/strict`, `node:test`, `../lib/constants/allergen-master`, `../lib/allergens` |
| [tests/observability.test.ts](../../../tests/observability.test.ts) | 213 | `node:assert/strict`, `node:test`, `../lib/db`, `../lib/audit-log`, `../lib/observability`, `../instrumentation`, `../app/api/allergens/route` |
| [tests/prisma-config-compat.test.ts](../../../tests/prisma-config-compat.test.ts) | 57 | `node:assert/strict`, `node:fs/promises`, `node:module`, `node:os`, `node:path`, `node:test`, `@prisma/config` |
| [tests/public-allergen-preferences.test.ts](../../../tests/public-allergen-preferences.test.ts) | 70 | `node:assert/strict`, `node:test`, `../lib/public-allergen-preferences` |
| [tests/public-menu-api.test.ts](../../../tests/public-menu-api.test.ts) | 201 | `node:assert/strict`, `node:test`, `../lib/db`, `../lib/constants/allergen-master`, `../features/public/shops/server/publicMenuRoute` |
| [tests/public-places.test.ts](../../../tests/public-places.test.ts) | 24 | `node:assert/strict`, `node:test`, `../features/public/shops/server/placesSearchRoute` |
| [tests/publication-review.test.ts](../../../tests/publication-review.test.ts) | 11 | `node:assert/strict`, `node:test`, `../features/admin/menus/publication-review` |
| [tests/rate-limit.test.ts](../../../tests/rate-limit.test.ts) | 39 | `node:assert/strict`, `node:test`, `../lib/utils/rate-limit`, `../lib/utils/request-ip` |
| [tests/readability-helpers.test.ts](../../../tests/readability-helpers.test.ts) | 220 | `node:assert/strict`, `node:test`, `../features/admin/menus/components/menu-form-values`, `../features/admin/menus/server/menu-update-helpers`, `../features/public/shops/components/public-shop-search` |
| [tests/retired-test-user-command.test.ts](../../../tests/retired-test-user-command.test.ts) | 30 | `node:assert/strict`, `node:child_process`, `node:url`, `node:test` |
| [tests/test-environment.test.ts](../../../tests/test-environment.test.ts) | 28 | `node:assert/strict`, `node:test`, `../scripts/test-environment`, `../scripts/ci-environment` |
| [tests/upload-image-validation.test.ts](../../../tests/upload-image-validation.test.ts) | 97 | `node:assert/strict`, `node:test`, `../lib/storage/upload-images` |
