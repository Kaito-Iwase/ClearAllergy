# Control structure and feedback

```mermaid
flowchart TD
  O[運営 Product policy / 招待 / incident判断] --> S[店舗owner]
  P[仕入先・調理担当 原材料と当日変更] --> S
  S -->|保存・公開・非公開| A[CA Application guards / policy]
  K[Clerk identity] --> A
  A -->|認可済みmutation| D[(PostgreSQL / deferred constraints)]
  D -->|保存結果| A
  A -->|invalidate| C[Next 配信cache]
  D -->|公開query + policy| C
  C -->|情報 + 限界の表示| U[当事者 / 保護者 / 同伴者]
  U -->|質問・訂正申告| S
  S -->|当日の確認| U
  A -->|補助audit / request log| M[運用者]
  M -->|照合・停止依頼| O
  B[Public Blob] -->|画像URL 独立配信| U
```

Controller: owner（入力/公開）、application（validation/auth/transaction）、DB（完全性）、運営（policy/incident）。Controlled process: 情報状態と公開投影。Feedback: 保存response、public read、audit/log、利用者からの申告。

欠けたfeedback: supplier→ownerの変更連動、レビューしたrevisionの記録、利用者がどの時点を閲覧したか、運用alert実配送、停止操作後のopen tab。追加event busより先に、人とシステムの責任・情報が到着する経路を定義する。

Trust boundaries: browser→server、Clerk→server、server→DB、server→Blob、DB→cache→browser、運用credential→DB。API認可とDB operator権限は独立。外部provider成功をDB transactionへ含めることはできない。
