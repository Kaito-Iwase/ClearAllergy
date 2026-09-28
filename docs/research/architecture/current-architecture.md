# Current architecture reconstructed

現行の入門説明は [guide/architecture](../../guide/architecture.md)。この図は研究snapshotの実dependency/control flowであり、target層を遡って当てはめたものではない。

```mermaid
flowchart LR
  P[app pages Server Components] --> F[features public/admin server]
  C[features Client Components] --> H[app/api wrappers]
  H --> O[observability request boundary]
  O --> R[feature Hono handlers]
  R --> A[lib/auth Clerk + local ownership]
  A --> K[Clerk SDK]
  A --> DB[lib/db Prisma]
  F --> DB
  R --> DB
  R --> L[lib/allergens pure policies]
  F --> L
  C --> L
  R --> S[lib/storage validation + Blob]
  S --> B[Vercel Blob public]
  R --> V[lib/public-cache Next cache]
  R --> U[lib/audit-log best effort]
  U --> DB
  DB --> PG[(PostgreSQL constraints / triggers)]
```

Presentation: app wrappers、feature components、components/layout。Application logic: feature server route/pageに分散。Domain logic相当: lib/allergens、menu-update-helpers、publication-review、input schemas（DDD Entityではない）。Infrastructure: lib/db、storage、Clerk helpers、google-places。認証と所有権: lib/auth/admin-auth/platform-auth/API utilsとresource query。

## Main write flow

```mermaid
sequenceDiagram
  participant UI as MenuEditClient
  participant R as Hono PUT
  participant A as server auth
  participant DB as PostgreSQL
  participant N as Next cache
  UI->>UI: confirm review (UI only)
  UI->>R: PUT full form / partial API allowed
  R->>A: same-origin, Clerk, owned active shop, portfolio
  R->>DB: read menu where id + shopId (outside tx)
  R->>R: validate input, merge states, publication policy
  R->>DB: tx update menu by id + replace links
  DB->>DB: deferred publication trigger at commit
  DB-->>R: commit
  R->>DB: best-effort audit
  R->>N: revalidate paths
  R-->>UI: JSON menu or catch error
```

Main writeにはcreate/delete/shopもあり、[tx表](../engineering/transactions-concurrency.md)と[全mutation表](../engineering/authorization.md)に差異を示した。Server Actionは見つからない。

## Main read and publication flow

```mermaid
flowchart TD
  REQ[public page request] --> CACHE{cached route available}
  CACHE -->|yes| HTML[stored HTML/RSC]
  CACHE -->|generate| READ[Prisma active shop + published menus + master]
  READ --> POL[isMenuPublishable]
  POL -->|invalid| NO[404 / excluded]
  POL -->|valid| SUP[other published menus supplement]
  SUP --> PROJ[status + effectiveRisk + safe image URL]
  PROJ --> CLIENT[Client selected allergens / filtering]
  HTML --> CLIENT
  API[GET public menu API] --> READAPI[Prisma menu + master + supplement]
  READAPI --> APIPOL[same publication and semantic helpers]
  APIPOL --> JSON[JSON or 404/500]
```

read側も公開条件を確認するが、既にcacheされたpayloadの内容を毎回DBで確認する構成ではない。Page→APIの内部HTTPではなく、両方がPrismaへ直接到達する。店補足も公開可能menuだけ。

## Allergen update flow

```mermaid
flowchart LR
  FORM[client status map] --> INPUT[Zod enum / known slug validation]
  INPUT --> MERGE[current map + incoming values]
  MERGE --> POLICY[publication evaluation]
  POLICY -->|explicit invalid publish| BAD[400 no save]
  POLICY -->|implicit invalid old publication| FALSE[save unpublished]
  POLICY -->|valid| TX[Menu + links transaction]
  FALSE --> TX
  TX --> DBRULE[deferred DB completeness]
  DBRULE --> CACHE[public invalidation]
  CACHE --> DISPLAY[public read projection]
```

clientの全status送信とAPIの部分更新契約を区別。TX外のcurrent map読取、clientの古い全map、unknown enum fallback、reviewがUIのみ、が主な研究対象。
