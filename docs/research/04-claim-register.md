# Claim register

Claimは強い表現のまま検証し、反証されたら維持しない。出典IDは [Evidence register](03-evidence-register.md)。

| Claim | Supporting evidence | Counter evidence / alternative | Status / Confidence | Limitation / falsifier |
| --- | --- | --- | --- | --- |
| C01 CAは食品の摂取可否を保証するサービスである | missionからは誤読可能 | R01のprototype注意 | CONTRADICTED / High: 明文 | 実運用scope変更はHD-01 |
| C02 任意の未知状態は全経路でUNKNOWN扱いになる（研究時点） | schema enum、API validation | R02/EX01でFREE/publication通過 | CONTRADICTED / High:実行、歴史的反例 | DB通常入力からの到達は未確認。後続実装はC19 |
| C03 MAY_CONTAIN除外設定をoffにすると安心表示になる | 仮説のみ | R02 summaryは設定に関係なくcaution、RUN01 | CONTRADICTED / High | screenの理解は別。混合状態UX01 |
| C04 公開booleanさえtrueなら全公開面へ出る | DB boolean | R03/R12の取得後policy、RUN01 | CONTRADICTED / High | cacheに残った既存表示は別 |
| C05 transactionがあるので同時編集も保護される | R04 atomic write | read outside tx、全link置換、versionなし | CONTRADICTED / Medium:並行実測なし | client stale全値送信とDB write同時性を別々にT03 |
| C06 proxyを通るだけで全resource認可を満たす | middlewareあり | R05/R06のresource guardが必要 | CONTRADICTED / High | 現行guard有効性は実Clerk/DBでも検証する |
| C07 revalidate=60は公開情報の最大経過時間60秒を保証 | R07 config | X12次回再生成、client tab、DB直接更新、失敗 | CONTRADICTED / High | T04でdeployed response測定。0秒は目標としても保証不能 |
| C08 更新日時・監査ログ・確認dialogで食品確認の証明になる | R08/R11 | schemaに根拠/確認revisionなし、X01–X05 | CONTRADICTED / High | 誤登録・根拠の虚偽は履歴追加でも残る |
| C09 tests/auditの成功だけでrelease-ready | RUN01/RUN02 | real DB/provider/UX/restore未確認 | CONTRADICTED / High | 対象SHAの階層別evidenceで再評価 |
| C10 invite受諾はメール所有をlocalで明示検証する | Clerkからemail取得 | verification未検査・fallbackありR05、X14 | CONTRADICTED（local）/ High | exploitはHYPOTHESIS。Clerk強制verifiedなら緩和される |
| C11 非公開menuの画像URLもアクセス不能 | DB isPublished | R09 public upload、X15 | CONTRADICTED（access設定）/ High | 機密画像を扱う要件自体HD-07 |
| C12 保存API500ならDB未保存 | catch統一 | R04 commit→audit→revalidate→response、後段失敗 | CONTRADICTED / Medium:例外注入未実施 | T07: commit後だけ失敗させDBを確認 |
| C13 guideとcurrent codeは完全一致 | 保守ルールあり | R14 menu0件404 | CONTRADICTED / High | HD-08で現行意図確認。bugを仕様にしない |
| C14 外部地図APIは完全に存在しない | public routeはavailable:false | R15 admin Google Places | CONTRADICTED / High | 地図UIのlive稼働は別 |
| C15 不確実性表示は必ず信頼を大きく損なう | 一般的懸念 | X06では概して小さな影響 | CONTRADICTED（普遍命題）/ Medium | CAの用語に移転できずUX01必要 |
| C16 警告文と色があるから全利用者が理解できる | R11 | X07は理解度検証でない、E6 humanなし | UNKNOWN / Low | keyboard/screen reader/teach-back UX01 |
| C17 大規模architecture変更が必要 | 長いroute、framework依存 | pure rulesとprovider helpersは既存、INF01 | UNKNOWN（必要性を支持する証拠不足）/ Medium:現行境界と局所案の比較 | 局所改善案はE7としてSUPPORTED。試行sliceで変更影響/DB検証工数を測り再評価 |
| C18 29品目を扱えば全食物アレルギーを網羅 | masterが29 | X01対象範囲外、R02有限集合 | CONTRADICTED / High | allergy taxonomyとproduct coverageは別 |
| C19 I01対象の不正状態はUNKNOWNへ正規化し、新しい公開API応答から除外される | RUN03: T01 RED/GREEN、全128tests、source diff | 実PostgreSQL/配備/キャッシュ済み画面は未確認、通常enum/API入力は元から拒否 | SUPPORTED（対象経路）/ High:意図した反例とHTTP結果で検証 | production到達頻度・実DB適用・既存キャッシュまでは主張しない |
| C20 I02対象PUT/DELETEの最終writeはserver店舗IDで制限される | RUN04: source diffとT09 API RED/GREEN、全131tests | 実PostgreSQL回帰未実行、owner/isActive変更raceは対象外 | SUPPORTED（API mockの経路）/ Medium:両HTTP応答とmock rollbackは確認、DB実体未確認 | 専用DBのT09と実Clerk/配備確認まで認可保証を拡張しない |

反証探索は、既存ガードが問題を遮断するか、標準が要求していない設計を強制していないか、地域・populationの違い、prototypeで頻度が不明なrisk、UI注意の既存実装、provider側保証を確認した。Riskの可能性と発生頻度を混同せず、確率やrisk reduction percentageは推計していない。
