# Adversarial review

推奨A1に反対する立場から再評価した。これは独立した別reviewer/複数agentによるレビューではない。

| Proposed decision | Adversarial challenge / simpler alternative | Evidence and result | Verdict |
| --- | --- | --- | --- |
| D01 unknown normalization | DB enum/APIで十分では | EX01が現helperの契約不一致。pure関数を数箇所守るだけ、schema不要 | KEEP |
| D02 resource condition at write | 既存read認可で足りるのでは | id+server shop条件は同一ruleのwriteへの適用。新ACL framework不要 | KEEP |
| D03 revision CAS | row lockかupdatedAtで済まないか | lockだけでは古いclient全payloadを判別不可。timestamp案はwriter/精度を別検証 | MODIFY:条件付きrevision案、HD-02までOPEN |
| D03 updateOwnedMenu抽出 | 単にrouteにtx修正を置けばよい | tx内read/merge/CAS/policyがまとまる時だけ意味がある。先行一括抽出はしない | MODIFY |
| D04 cache全廃 | ISRの既存benefitを捨てていないか | 許容staleness不明、実測なし。測定先行が単純 | OPEN |
| D05 verified email必須 | Clerkが既に保証するなら冗長 | local前提を強める価値はあるが実tenant未確認、認可変更 | OPEN HD-06 |
| D06 review table | 全員に履歴と根拠入力を強制しすぎ | prototypeには不要かも。metadata1組案との比較必須 | OPEN HD-03 |
| Entity/Value Object/Aggregate | interface/classを増やして何が守れるか | semantic union+pure policyで足りる。identityはDB/Clerk既存 | REJECT |
| Generic Repository | fakeしやすさだけではないか | variationなし。transaction/constraintを隠す危険 | REJECT |
| Event sourcing/outbox/queue | 完全履歴/再試行に必須では | business review同txと運用照合から開始。外部保証/SLA未定 | REJECT（現段階） |
| D10 private asset | 食品画像は本来公開前提では | draft/confidential要件が不明。公開前提を説明するだけで足りる可能性 | OPEN HD-07 |
| Unified public loader | query重複を全部統合すべきか | policyは共有済み、page/API必要列・errorsが違う。巨大loader化の効果不足 | REJECT先行統合 |
| D07 human study | testsで文言存在を確認すればよいのでは | misunderstandingはtestのassertionで測れない | KEEP |
| D08/09 ops evidence | monitoring SaaSを先に追加すべきか | 既存logs/runbookの実効性測定が先 | KEEP |

実装後の再判定基準: sliceごとの変更ファイル・重複policy数・red reason・DB/公開回帰の検出範囲・review負担を記録。A1でも意味を維持できない場合は新たなRQ/ADRへ戻す。mock call countの増加をtestability向上としない。
