# 調査資料の用語・時点・注意箇所

調査の本文は、作成時点の根拠・提案・未確認を保持しています。現在の作業は[調査・友人テスト方針](product/research-and-friend-testing-policy-20261015.md)、実装説明は[共通ルール](../guide/rules.md)、固定mainの照合は[2026-10-15の技術監査](engineering/current-main-issue-audit-20261015.md)から確認してください。[研究索引](README.md)に戻れます。

## 日付と証拠を読む

- `64163cc`、`e26b608`、`cd502b`などは調査対象のGitコミットです。「現行」「未実装」「未merge」はその時点の意味です。昔の実行結果を現在の本番状態へ読み替えません。
- 公開資料の事実、CAへ当てはめる提案、コードから確認した実装、実行した試験、人・店舗での観察は別の証拠です。論文やCIの成功だけで店舗の負担・人の理解・実食品の正しさは分かりません。
- `PASS`は記載した環境・対象・条件の成功、`UNVERIFIED`は未確認です。`PARTIALLY_READY`は当時の研究上の判定で、公開や実利用の承認ではありません。`HUMAN_DECISION_REQUIRED`は人が判断する未確定事項です。
- 歴史資料の店舗募集・聞き取り案は保存しています。現在は実店舗接触を行わず、公開資料の精査と友人の操作・理解テストを準備します。

## 識別番号の読み方

番号は根拠を追うための参照です。別文書の同じ番号を同一の対象と決めつけず、その文書の表へ戻ります。

| 記号 | この資料群での主な意味・探す先 |
| --- | --- |
| L / H / SR / INV | 損失・危険な状態・安全上の要求・維持する条件。[安全分析](safety/losses-hazards.md)、[制約](safety/safety-constraints.md) |
| R / E / EX / RUN | リスクや論点、根拠、反例の実験、実行記録。[根拠台帳](03-evidence-register.md)、[主張と反証](04-claim-register.md)。Eは当日監査では固定コード証拠の番号にも使う |
| HD / I / D / T / UX | 人の判断待ち、実装課題、設計、検証ケース、理解・操作の課題。[未確定事項](open-questions.md)、[課題台帳](implementation/backlog.md)、各設計・検証表 |
| X / INF | Xは消費者庁・FSA・MIT等の外部資料の根拠ID、INFは推論。合成実験のEXとは別。推論を実行済み事実へ変えない |
| S / C / A〜G | 出典や架空シナリオの記号。原稿ごとに独立。小丼のS0〜S7と鶏料理のA〜Gは別の課題 |
| #番号 / PR | GitHub Issue（課題）とPull Request（変更提案）。Issueがopenでも機能が未実装とは限らず、PRがmerge済みでもmain宛てとは限らない |

## 技術用語

| 用語 | 読むための説明 |
| --- | --- |
| CAS / OCC | Compare-And-Set / Optimistic Concurrency Control。読んだ時の版がまだ同じ場合だけ保存し、古いフォームの上書きを拒否する方式 |
| version / foodVersion / snapshot | 保存競合用の版、食品内容の版、その時点の内容の記録。食品版と保存版は用途が違う。記録の存在は現物一致の証明ではない |
| transaction / tx / commit / rollback | 複数のDB変更を一単位で扱う処理、保存確定、巻戻し。一般的な500応答だけから巻戻し済みとは断定できない |
| RepeatableRead | 一つのDB読取処理で整合した時点の値を使う分離レベル。将来の表示更新や、開いたままの画面の回収を保証しない |
| DTO / RSC | Data Transfer Object（送り出す項目を限定したデータ）/ React Server Components（サーバー側で描画処理する部品）。元の記録すべてが公開されるとは限らない |
| cache / ISR / TTL | 保存済みの応答等、Incremental Static Regeneration（静的生成した内容の再生成）、Time To Live（保持時間の目安）。資料の値を実配信の更新上限とみなさない |
| fail closed / gate | 条件が確認できないときに許可せず止める設計 / 通過条件の判定。実食品の未知を解消する機能ではない |
| fixture / mock / harness / adapter | 固定した試験データ、代用品、試験の実行枠組み、接続先を差し替える部品。実DB・実認証・店舗観察との違いを実行記録で確認する |
| E2E / characterization / RED・GREEN | 一連の経路を通す試験 / 既存挙動を記録する試験 / 修正前に失敗し修正後に成功した段階。E2Eでも含めた境界だけの証拠 |
| backfill / cascade / tombstone / ABA | 既存データの補完 / 関連処理の連鎖 / 削除を示す記録 / 値がA→B→Aに戻り途中の変更を見落とす問題 |
| DDD / ACL | Domain-Driven Design（業務の概念に沿う設計）/ Access Control List（操作許可の一覧）など。ACLは文脈によって外部概念の変換層も指すため元の定義を確認する |
| SLO / SLA / RTT | 運用の目標 / 提供者との合意 / 通信の往復時間。測定値、目標、保証を区別する |
| ASVS / SSDF | OWASPのアプリ検証標準 / NISTの安全なソフトウェア開発枠組み。SSDFのPO・PS・PW・RVは組織準備・ソフトウェア保護・安全な作成・脆弱性対応の区分。CAの認証取得ではない |
| ITT / per-protocol | 割付けた対象を保つ分析 / 計画通り完了した対象での分析。未完了を除いた結果だけを全参加者の成功率へ広げない |

`UNKNOWN`・`FREE`・`CONTAINS`・`MAY_CONTAIN`、店舗内取扱い補足の`STORE_HANDLED`は、[現行ルール](../guide/rules.md#allergens)で確認してください。食品上の危険を防ぐ分析と、不正な操作・情報漏えいを防ぐ分析は、同じ試験の合格ではありません。

## 全文精査で見つかった読み取り上の注意

| 文書・箇所 | 保持している内容と読み方 |
| --- | --- |
| [根拠台帳](03-evidence-register.md) RUN03・RUN04・RUN05 | 見出し9列に対して行が8セル。結果・適用範囲・限界は関連の実行記録と照合する。原稿の列の対応を推測して補完していない |
| [構成棚卸し](engineering/inventory.md) のDirect dependencies | 抽出にSQLの正規表現リテラルも混ざる。全項目を実際の依存パッケージと読まない。冒頭のflowは図への実リンクではない |
| [理解リスク](product/ux-risk.md)、当初の実装計画 | 人数・店舗募集は当時の案。現在の友人テストの募集数や実施済み人数ではない |
| [小丼fixture](product/ingredient-change-trial-fixture-20261015.md) S7 | 「公開下書き」は試験内の手順と初期状態を本文で確認する。進行役用の条件・答えを参加者へ事前に見せない |
| [調査記録](literature/clearallergy-research-20261014.md) §14.3 と [情報提供上の対策](literature/allergen-information-controls-20261014.md) | 対照群の声かけ割合に30.0%と30.5%（165/541）の差がある。今回は原典再取得をしていないため訂正値を確定せず、引用時の原典照合が残る |
| [整合性原稿](literature/ca-overnight-integrity.md) T17〜T18 | 表の間の空行で表示が分かれる。ケース番号を続けて読み、欠落や実行合格と解釈しない |

これらは確認した可読性上の限界です。元の出典・数値・試験結果を無断で訂正するための一覧ではありません。[全文書の精査記録](../guide/document-audit-20261015.md)で対象と未確認範囲を確認できます。
