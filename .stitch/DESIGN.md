# ClearAllergy Design Guide for Stitch

## 1. Purpose and Source of Truth

This document describes the existing ClearAllergy product and visual system for
Stitch. It is extracted from the current Next.js, Tailwind CSS, Prisma, README,
and public asset implementation.

When generating or revising screens:

- Preserve the existing calm, clean, safety-focused appearance.
- Reuse existing labels, messages, page structures, colors, spacing, cards, and
  buttons before introducing any variation.
- Do not invent features, data fields, routes, legal claims, or marketing copy.
- Do not replace the restrained interface with a decorative, luxury, playful,
  or highly animated visual style.
- Treat allergen status as safety-critical information. Never make `UNKNOWN`
  look equivalent to `FREE`.
- Keep public browsing and authenticated shop administration visually related
  but structurally distinct.

## 2. Product Identity

### Product name

- `ClearAllergy`

### Product purpose

ClearAllergy is a web application for restaurants to register and publish
menu-level allergen information, and for users to check that information before
visiting or ordering.

The product supports confirmation and communication. It does not replace
medical judgment or direct confirmation with a restaurant.

### Existing brand tone

- Safe and reassuring
- Clean and readable
- Practical rather than decorative
- Direct about uncertainty and risk
- Friendly to both diners and restaurant staff

### Existing brand assets

Use the existing assets from `public/images/`:

- `/images/clearallergy-mark.svg`: default green brand mark
- `/images/clearallergy-mark-small.svg`: small mark
- `/images/clearallergy-mark-dark.svg`: dark-background mark
- `/images/clearallergy-mark-black.svg`: monochrome mark
- `/images/clearallergy-logo.svg`: full default logo
- `/images/clearallergy-logo-dark.svg`: full dark-background logo
- `/images/clearallergy-logo-black.svg`: full monochrome logo

The implemented header logo combines the green mark with the text
`ClearAllergy`. The wordmark is heavy, tightly tracked, and not decorative.

## 3. Information Architecture

### Public routes and screens

| Route | Existing screen |
| --- | --- |
| `/` | Top page / service introduction |
| `/shops` | Public shop list |
| `/shops/[shopId]` | Public shop page and public menu list |
| `/shops/[shopId]/menus/[menuId]` | Public menu detail |
| `/terms` | Terms of use |
| `not-found` | Page not found |

### Administration routes and screens

| Route | Existing screen |
| --- | --- |
| `/admin/login` | Shop administrator login |
| `/admin/register` | Registration / initial shop setup |
| `/admin/shop` | Shop information editing and public QR code |
| `/admin/menus` | Menu management list |
| `/admin/menus/new` | New menu form |
| `/admin/menus/[menuId]/edit` | Menu editing |
| `/admin/invitations` | Administrator invitations |
| `/admin/demo` | Read-only portfolio administration demo |

### Primary data model

#### Shop

Represents a restaurant and owns its menus. Existing visible fields include:

- Shop name
- Description
- Address
- Business hours
- Regular holiday
- Phone number
- Note
- Average budget
- Cover image and image display settings
- Public/active state

#### MenuItem

Represents one menu item belonging to a shop. Existing visible fields include:

- Menu name
- Description
- Price
- Category
- Ingredients
- Precaution
- Menu image and image display settings
- Published/draft state
- Allergen statuses

#### Allergen

The master contains 29 allergens. Each allergen has:

- `slug`: stable identifier
- `nameJa`: Japanese name
- `nameEn`: English name
- `sortOrder`: display order

The UI displays the complete master and must not hide a missing menu-allergen
link. Missing links are shown as `UNKNOWN`.

#### MenuItemAllergen

Joins a `MenuItem` and an `Allergen`, with one `AllergenStatus`.

#### AllergenStatus

| Value | Existing Japanese display meaning | Visual meaning |
| --- | --- | --- |
| `CONTAINS` | `含む` | Danger / red |
| `FREE` | `含まない` | Confirmed free / green |
| `MAY_CONTAIN` | `含む可能性があります` | Caution / yellow or amber |
| `UNKNOWN` | `未設定` on administration; `未確認` where effective risk is shown | Unconfirmed / gray |

### Allergen legal display groups

- `特定原材料9品目`: shrimp, crab, walnut, wheat, buckwheat, egg, milk,
  peanut, cashew
- `特定原材料に準ずるもの20品目`: the remaining 20 allergens, including
  Pistachio / ピスタチオ

On public menu detail, these are displayed as separate notice cards. Pistachio
must not appear in the specified-ingredient group.

## 4. Existing Content and Copy

Use existing copy from the application. Do not replace it with generic
placeholder text or lorem ipsum.

### Existing top-page copy

- `外食前に、安心を確認できる。アレルゲン情報を見やすく届ける。`
- `食物アレルギーを持つ人と、それに応えたい飲食店をつなぐサービスです。`
- `店舗を探す`
- `店舗の方はこちら`
- `メニューごとに確認`
- `見やすく整理`
- `店舗が更新できる`
- `このサイトは ClearAllergy のポートフォリオ公開版です`
- `利用規約を確認する`

### Existing public navigation and page labels

- `店舗一覧`
- `利用規約`
- `公開メニューを見る`
- `店舗ページで他のメニューを見る`
- `店舗詳細へ`
- `公開メニュー`
- `お店の説明`
- `店舗情報`
- `住所`
- `営業時間`
- `定休日`
- `電話番号`
- `平均予算`
- `更新`
- `原材料名`
- `注意事項`
- `アレルゲン（29品目）`
- `あなた向けのアレルゲン設定`
- `コンタミも対象にする`
- `強調する`
- `除外する`
- `リセット`

### Existing allergen notices

- `特定原材料を含みます`
- `特定原材料を含む可能性があります`
- `特定原材料に未設定項目があります`
- `特定原材料は含まれていません`
- `特定原材料に準ずるものを含みます`
- `特定原材料に準ずるものを含む可能性があります`
- `特定原材料に準ずるものに未設定項目があります`
- `特定原材料に準ずるものは含まれていません`
- `判定結果：`
- `未設定:`
- `該当なし`
- `必要に応じて店舗へ確認してください。`

### Existing administration labels

- `店舗情報`
- `メニュー管理`
- `メニュー新規作成`
- `メニュー編集`
- `基本情報`
- `メニュー名`
- `価格（税込・円）`
- `説明`
- `カテゴリ`
- `原材料名`
- `注意書き`
- `食品画像ファイル`
- `画像URL`
- `アレルゲン29品目`
- `公開中`
- `非公開`
- `下書き`
- `未設定あり`
- `アレルゲン設定済み`
- `保存する`
- `変更を保存`
- `メニューを登録する`
- `編集`
- `削除`
- `閲覧専用`
- `店舗管理者ログイン`
- `新規登録`
- `初回セットアップへ進む`
- `招待メールアドレス`
- `招待を送信`
- `最近の招待`

### Existing error, caution, and empty-state language

- `ページが見つかりません`
- `URL が変わったか、公開されていない店舗・メニューの可能性があります。トップまたは店舗一覧から見直してください。`
- `現在データベースへ接続できないため、管理者ログインを一時停止しています。`
- `ログインに失敗しました。メールアドレスまたはパスワードを確認してください。`
- `認証の初期化がまだ完了していません。少し待ってから再度お試しください。`
- `名前は必須です。`
- `価格は数字で入力してください。`
- `価格は整数（円）で入力してください。`
- `価格は0円以上で入力してください。`
- `画像ファイルを選択してください。`
- `作成に失敗しました。時間をおいてもう一度お試しください。`
- `削除に失敗しました。時間をおいてもう一度お試しください。`
- `アレルゲン未設定のメニューが {count} 件あります`
- `公開するにはアレルゲン29品目を確定してください。未設定: {names}`
- `未設定が残っているメニューは、カード内に注意表示します。`
- `店舗情報は公開ページにそのまま表示されるため、誤字や古い情報がないか確認してから保存してください。`
- `招待はまだありません。`

Dynamic values such as shop names, menu names, counts, dates, prices, and
allergen names must come from data rather than invented examples.

## 5. Visual Foundation

### Typography

- Global font stack: `"Manrope", "Noto Sans JP", sans-serif`
- Product wordmark: `font-black`, tight tracking around `-0.04em`
- Main page titles: usually `text-2xl` or `text-3xl`, `font-extrabold` or
  `font-black`
- Public top-page hero: very large heavy text, approximately `44px` to `62px`,
  tight tracking, short line-height
- Section headings: usually `text-lg`, `text-xl`, or `text-2xl`,
  `font-bold`/`font-extrabold`
- Primary body copy: `text-sm` or `text-base`
- Supporting copy and metadata: `text-xs` or `text-sm`, gray
- Japanese copy should remain direct and concise. Avoid ornamental headlines.

### Core colors

Configured theme colors:

| Token | Value | Existing use |
| --- | --- | --- |
| `primary` | `#13ec13` | Main CTA, brand accent, active emphasis |
| `primary-dark` | `#0ea80e` | Main CTA hover |
| `background-light` | `#f6f8f6` | App and public page background |
| `background-dark` | `#102210` | Existing optional dark background |
| `surface-light` | `#ffffff` | Cards, headers, sidebars |
| `surface-dark` | `#1a331a` | Existing optional dark surface |
| `text-main` | `#111811` | Main text |
| `text-sub` | `#618961` | Subdued themed text |

Frequently used implementation colors:

- Dark green administrative action: `#0f4c2f`
- Dark green hover: `#0b3d25`
- Pale green selected surface: `#ecf7ef`
- Neutral page surfaces: `white`, `gray-50`, `gray-100`
- Main text: `gray-900`, `gray-950`, `neutral-900`, `#111811`
- Supporting text: `gray-500`, `gray-600`, `gray-700`

### Safety and status colors

Use light backgrounds, readable dark text, and a thin matching border or ring.
Do not rely on color alone; always show the status label.

| Meaning | Existing treatment |
| --- | --- |
| Danger / contains / errors | `red-50` background, `red-200` border/ring, `red-700` to `red-900` text |
| Caution / may contain / action needed | `yellow-50` or `amber-50` background, `yellow-200` or `amber-200` border, dark yellow/amber text |
| Confirmed free / success | `emerald-50` or `green-50` background, `green-200` border, `green-700` to `green-900` text |
| Unknown / unconfirmed / neutral | `gray-50` or `gray-100` background, `gray-200` border/ring, `gray-700` to `gray-900` text |

### Spacing

The implementation uses Tailwind's standard spacing scale and favors readable,
moderate density:

- Small inline gaps: `gap-2`, `gap-3`
- Form and card groups: `gap-4`, `space-y-4`, `space-y-5`, `space-y-6`
- Major public sections: `gap-6`, `gap-8`, and occasional `gap-12`
- Compact controls: `px-3 py-2`
- Standard controls and buttons: `px-4 py-2` or `px-5 py-3`
- Standard cards: `p-4`, `p-5`, or `p-6`
- Large focused/auth cards: `p-8`

Do not compress safety messages or allergen controls into dense rows that are
hard to scan.

### Corners, borders, and shadows

- Controls and compact cards: `rounded-lg`
- Standard cards, alerts, and buttons: `rounded-xl`
- Feature cards and major forms: `rounded-2xl`
- Large focused panels: occasional `rounded-3xl`
- Pills and status badges: `rounded-full`
- Borders are usually `gray-100`, `gray-200`, or `gray-300`
- Most cards use `shadow-sm`
- Hover elevation is restrained: `hover:shadow-md` or a slight
  `hover:-translate-y-0.5`
- Large hero imagery may use `shadow-2xl`; do not apply this broadly

## 6. Shared Component Rules

### Headers and navigation

#### Public

- Sticky white header with a thin gray bottom border and `shadow-sm`
- Maximum width around `1200px`
- Brand logo on the left
- Links such as `店舗一覧` and `利用規約`
- Search area on larger screens
- Primary login CTA uses bright green with black text

#### Administration

- Desktop: fixed/sticky white left sidebar, approximately `w-64`
- Mobile: sticky white top header and fixed white bottom navigation
- Main administrative page background uses `background-light`
- Core navigation labels are `店舗情報` and `メニュー管理`

### Buttons

- Primary public CTA: bright green `#13ec13`, black bold text
- Primary administrative completion action: bright green or dark green,
  depending on context already used by the screen
- Dark neutral action: gray-900/black with white text
- Secondary action: white with gray border and gray text
- Destructive action: red-tinted button or red text
- Disabled actions: keep shape, reduce opacity, and use a not-allowed cursor
- Button corners are normally `rounded-lg`, `rounded-xl`, or `rounded-2xl`
- Preserve explicit loading labels such as `保存中...`, `登録中...`,
  `作成中...`, and `画像アップロード中...`

### Cards and panels

- Default: white surface, subtle gray border, `shadow-sm`
- Public information cards commonly use `rounded-xl` or `rounded-2xl`
- Administrative form sections commonly use `rounded-2xl bg-white p-5 shadow-sm`
- Large shop editing/QR sections use `rounded-3xl border border-gray-200 bg-white p-6 shadow-sm`
- Use pale tinted cards for notices; do not use saturated full-card backgrounds

### Inputs

- Full-width inputs and textareas
- Gray border on white background
- Usually `rounded-lg` or `rounded-xl`
- Typical height `h-11` or `h-12`, or vertical padding around `py-3`
- Labels are above the input and use small bold or medium text
- Supporting text appears below in `text-xs text-gray-500`
- Focus uses green border and a subtle green focus ring

### Search and filters

- Search fields use a search icon at the left
- Filter controls use horizontal pill buttons
- Selected filter is dark green with white text
- Unselected filter is light gray with dark gray text
- Show current result counts when the existing screen does so

### Status badges

- Use compact rounded pills
- Typical typography: `text-xs` or `text-[11px]`, bold
- Include the status word; do not display a color-only dot
- Common labels include `公開中`, `下書き`, `未設定あり`,
  `アレルゲン設定済み`, `含む`, `含まない`, and `可能性あり`

### Alerts and validation

- Alerts use a pale status background, matching border, dark readable text,
  and `rounded-lg` or `rounded-xl`
- Strong allergen notices may use `p-6`, `shadow-sm`, and a bold
  `text-xl`/`text-2xl` heading
- Error messages must remain explicit and actionable
- Unknown allergen information must remain visible even when another allergen
  is confirmed as contained

## 7. Public Screen Patterns

### Top page

- White hero section on the light green-gray page
- Large black headline with compact line-height
- Clear explanatory paragraph
- Bright green primary CTA and neutral secondary CTA
- Product preview is a white translucent card over a subtle green gradient
- Supporting features use three simple white cards with restrained icons
- Portfolio/demo notices use amber-tinted cards

### Shop list

- Searchable public listing
- White shop cards on the light page background
- Show real shop name, description, public menu count, budget, address, and
  updated timestamp where available
- Avoid fabricated ratings, reviews, reservations, or map interactions

### Shop detail

- Cover image or existing green gradient fallback
- White text over a restrained dark gradient on the cover
- Public menu list is searchable and shows allergen summaries
- Shop information is a separate white card
- Personal allergen preferences appear as a collapsible white panel

### Menu detail

Order the important information for confirmation:

1. Breadcrumb and menu context
2. Personal allergen alert, only when the user has selected allergens
3. Separate classification notices for `特定原材料9品目` and
   `特定原材料に準ずるもの20品目`
4. Menu image, name, category, description, price, and update time
5. Ingredients and precaution
6. Full allergen 29-item status list
7. General caution and shop link

The allergen list is a readable one- or two-column grid. Each row shows the
Japanese allergen name and a status badge.

## 8. Administration Screen Patterns

### Authentication

- Centered authentication card around `max-w-[480px]`
- White surface, subtle border, `rounded-xl`, `shadow-sm`
- Clear title such as `店舗管理者ログイン`
- Inputs stack vertically with generous gaps
- Use green success notices, amber availability notices, and red errors
- Keep Clerk-related flows inside the existing visual structure

### Menu list

- Page heading plus create action
- Search and filter panel
- Menu cards show image/fallback, menu name, category, price, update time,
  published state, and allergen completion state
- Menus with unknown allergens use an amber border/ring and explicit warning
- Editing actions are prominent; deletion remains visually destructive

### Menu create/edit

- Divide into white cards, primarily `基本情報` and `アレルゲン29品目`
- Use existing form labels and helper text
- Show Japanese and English allergen names together
- Each allergen has four explicit controls:
  `未設定`, `含む`, `含まない`, `含む可能性があります`
- Selected status uses a saturated status color with white text
- Unselected statuses use gray backgrounds
- Preserve public/draft toggle and save/loading states

### Shop editing

- Large white form card with clearly separated fields
- Public-facing data includes explanatory helper text
- QR code is a separate large card with size controls and print guidance
- Input hints use light gray cards; safety-related guidance uses yellow

### Invitations

- Invite form in a white bordered card
- Recent invitations in a divided white list
- Show status, email, created date, expiration, and existing actions
- Success and error results appear immediately below the form

## 9. Responsive Behavior

- Build mobile-first and preserve existing Tailwind breakpoints.
- Public content uses full-width mobile layouts and constrained desktop
  containers (`max-w-[1024px]`, `max-w-[1200px]`, or `max-w-6xl`).
- Multi-column layouts usually become two columns at `md` and larger
  public/admin layouts at `lg`.
- Public header hides secondary navigation and search on small screens.
- Administration hides the desktop sidebar on small screens and uses the
  mobile header plus bottom navigation.
- Buttons may wrap or become full-width where needed.
- Allergen lists remain scannable; use one column on small screens and two
  columns where already implemented.

## 10. Do Not Introduce

- Do not invent reservation, ordering, payment, review, rating, chat, medical
  diagnosis, or AI recommendation features.
- Do not invent new allergen statuses.
- Do not treat `UNKNOWN` as safe or free.
- Do not remove the complete 29-item allergen display.
- Do not merge the two legal allergen classification cards.
- Do not add loud gradients, glass effects, excessive motion, neon-on-dark
  themes, or dense dashboard charts.
- Do not replace the existing green brand with another primary color.
- Do not add placeholder shop/menu names or lorem ipsum.

## 11. Extraction Sources

This guide was extracted from:

- `tailwind.config.ts`: theme colors, font families, and base radius tokens
- `app/globals.css`: global font stack and print-specific QR behavior
- `README.md`: product purpose, features, routes, screen names, and safety
  language
- `prisma/schema.prisma`: Shop, MenuItem, Allergen, MenuItemAllergen, and
  AllergenStatus structure
- `lib/constants/allergen-master.ts`: the 29-item Japanese/English allergen
  master
- `lib/allergens.ts`: allergen status labels, legal groups, status colors, and
  notice behavior
- `components/layout/BrandLogo.tsx`, `PublicHeader.tsx`, and
  `AdminDashboardShell.tsx`: branding, navigation, and responsive shells
- `features/public/shops/components/`: public hero, lists, cards, personal
  preferences, alerts, and menu-detail patterns
- `features/admin/menus/components/`, `features/admin/shop/components/`,
  `features/admin/auth/components/`, and
  `features/admin/invitations/components/`: administration forms, cards,
  actions, labels, errors, and notices
- `app/not-found.tsx` and `app/(public)/terms/page.tsx`: public error and terms
  language
- `public/images/`: existing ClearAllergy logo and mark assets
- `document/`: existing project documentation. README-referenced screenshot
  files were not present in the current workspace and were not used as visual
  evidence.
