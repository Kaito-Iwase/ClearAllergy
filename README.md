# ClearAllergy

外食時のアレルゲン情報確認を、店舗と利用者の双方にとってシンプルにする Web アプリです。

[![Next.js](https://img.shields.io/badge/Next.js-App_Router-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748)](https://www.prisma.io/)

---

## 背景・課題

食物アレルギーを持つ人が外食する際、アレルゲン情報の提示方法は店舗によってばらつきがあり、
来店のたびにスタッフへ確認しなければならないケースも少なくない。

ClearAllergy は「聞かなくても分かる」外食体験を増やすことを目標に、以下の 2 点を重視して設計した。

- **店舗側**：管理画面からメニューとアレルゲン28品目を自分で登録・更新できる
- **利用者側**：QR コードや URL からスマートフォンで素早く確認できる

---

## スクリーンショット

|                    トップページ                     |                    店舗公開ページ                     |                    メニュー編集画面                     |
| :-------------------------------------------------: | :---------------------------------------------------: | :-----------------------------------------------------: |
| ![トップページ](./document/screenshot/rootpage.png) | ![店舗公開ページ](./document/screenshot/menuview.png) | ![メニュー編集画面](./document/screenshot/shopedit.png) |

---

## 機能一覧

### 店舗側（管理画面・要ログイン）

- 店舗情報・画像の編集
- メニューの新規作成・編集・公開切り替え
- アレルゲン28品目の状態設定（含む／含まない／含む可能性あり）
- 価格設定
- 店舗公開 URL の共有・QR コード表示

### 利用者側（公開画面・ログイン不要）

- 店舗・メニュー一覧の閲覧
- メニュー詳細（特定原材料8品目の強調表示・アレルゲン28品目一覧）
- `localStorage` を使った個人アレルゲン設定
- 設定済みアレルゲンを含むメニューへの警告表示

---

## 技術スタック

| カテゴリ       | 技術                 |
| -------------- | -------------------- |
| フレームワーク | Next.js (App Router) |
| 言語           | TypeScript           |
| スタイリング   | Tailwind CSS         |
| ORM            | Prisma               |
| データベース   | PostgreSQL           |
| 認証           | NextAuth.js          |
| ストレージ     | Vercel Blob          |
| ホスティング   | Vercel               |

---

## 設計上の判断

### 1. 管理側と公開側のルーティングを分離する

`app/admin/(dashboard)` と `app/(public)` を明確に分け、API の責務も分離した。
認証が必要な操作と、誰でも閲覧できる操作を混在させないことで、
ミドルウェアによる保護範囲を明確に保てる。

### 2. アレルゲン情報を DB マスタとして管理する

アレルゲン28品目をハードコードせず、DB のマスタとして持ち `sortOrder` で表示順を制御した。
公開側と管理側が同じ基準で描画できるほか、将来の品目追加にも対応しやすい。

### 3. メニュー作成フローを edit 画面に集約する

「新規作成 → 専用ページで入力」ではなく、
「空の下書きを作成 → edit 画面へリダイレクト」する形にした。
作成と編集の UI を統一することで、コードの重複を排除しつつ動作の一貫性を担保している。

### 4. 利用者側の設定をログイン不要にする

利用者のアレルゲン設定は `localStorage` で保持し、アカウント登録を不要にした。
店頭で QR を読み取った人が即座に使えることを優先した判断であり、
導入コストを下げることが利用率に直結するという考えに基づいている。

---

## ルーティング構成

```
app/
├── (public)/
│   ├── page.tsx                          # トップ
│   ├── shops/
│   │   ├── page.tsx                      # 店舗一覧
│   │   └── [shopId]/
│   │       ├── page.tsx                  # 店舗・メニュー一覧
│   │       └── menus/[menuId]/page.tsx   # メニュー詳細
└── admin/
    ├── (auth)/
    │   ├── login/page.tsx
    │   └── register/page.tsx
    └── (dashboard)/
        ├── menus/
        │   ├── page.tsx                  # メニュー管理一覧
        │   ├── new/page.tsx
        │   └── [menuId]/edit/page.tsx
        └── shop/page.tsx                 # 店舗情報編集
```

---

## セットアップ

### 前提条件

- Node.js 20 以上
- PostgreSQL が起動していること

### 1. リポジトリをクローン

```bash
git clone https://github.com/your-name/ClearAllergy.git
cd ClearAllergy
```

### 2. 依存関係をインストール

```bash
npm install
```

### 3. 環境変数を設定

`.env.local` を作成し、以下を設定する。

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/clearallergy
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3000

# 画像アップロードを使う場合（Vercel Blob）
BLOB_READ_WRITE_TOKEN=your-vercel-blob-token
```

### 4. DB スキーマを適用

```bash
npx prisma migrate dev
```

### 5. デモデータを投入

```bash
npm run seed
```

以下が作成される：

- アレルゲン28品目マスタ
- デモ店舗 `Clear Cafe Demo`
- 公開メニュー数件
- デモ管理アカウント

| デモ管理アカウント | 値                        |
| ------------------ | ------------------------- |
| メールアドレス     | `demo@clearallergy.local` |
| パスワード         | `demo1234`                |

### 6. 開発サーバーを起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) で確認できる。

---

## 動作確認チェックリスト

- [ ] `/` からデモ店舗へ遷移できる
- [ ] `/shops/[shopId]/menus/[menuId]` でアレルゲン28品目が表示される
- [ ] 未ログインで `/admin/menus` にアクセスすると `/admin/login` にリダイレクトされる
- [ ] ログイン後にメニューの新規作成・編集が完了できる
- [ ] 個人アレルゲンを設定すると対象メニューに警告が表示される

---

## 今後の課題

- テスト追加（現状ゼロ）
- 画像アップロードのエラーハンドリング改善
- 空状態（メニュー未登録など）の UI 改善
- QR カードの印刷最適化
- スクリーンショット・デモ動画の整備
