# 公開店舗の重複マスタ取得削減

2026-10-23 JST。対象は `PublicShopListPage.tsx` / `PublicShopDetailPage.tsx` の読取処理。比較元は `91d76cf61ebd8db2602d2508b62205ab6345b4da` で、統合基点 `58f149d32d71ce3068995541e34aae1ed938bc52` でも対象selectは同一。最終測定・検証の実装HEADは同基点へrebaseした `aaa2a2d`。後続変更は検証文書・証拠だけを確定する。本番へのmerge・配備・設定変更は行っていない。

## 変更と維持する境界

両ページはマスタ全体を読む一方で、リンクの `allergen.slug` も別SQLで取得していた。リンクを `allergenId` / `status` のみにし、同じRepeatableRead内で取得したマスタのIDから既存の `{status, allergen: {slug}}` へ組み立てる。照合用IDは公開DTOから除く。

`force-dynamic`、アクセスごとの読取、同snapshot、稼働店舗と公開フラグの条件、食品版と公開対応版、全品目の公開判定、UNKNOWNの扱い、店舗内補足は維持する。欠けたリンクは既存処理でUNKNOWN、マスタにないIDはエラーとし、リンクの脱落やFREEへの補完を行わない。本番DBのデータ、schema/migration/依存は変更しない。

## DB比較

[測定値](public-shop-read-performance-20261023.json)はSQL・パラメータ・行の値・接続情報を含まない。元/変更後のページから実際のselectを抽出し、変更後は実装のresolverで再構築した。同じREAD ONLY / RepeatableRead内で順序を交互に変えて各routeを3組比較し、全組一致。リンクはDBの未指定順に依存しないようslugで並べて比較し、店舗とメニューの順序は維持した。マスタは追加IDを除いた全項目を比較した。

| 対象 | 同snapshot比較 | SELECT数 | 独立transactionの読取平均 | transaction全体平均 |
| --- | --- | --- | --- | --- |
| 店舗一覧 | 3/3一致（5店舗・32メニュー・928リンク・29品目） | 5 → 4 | 428.1 → 350.2ms | 751.9 → 680.7ms |
| 店舗詳細 | 3/3一致（1店舗・6メニュー・174リンク・29品目） | 5 → 4 | 412.5 → 331.6ms | 734.4 → 654.9ms |

上の時間はWindowsホストから既存の本番pooled DBへの読取専用測定で、Prisma 6.19.3、Node 22.15.1。実ページと同じ一覧shop先行・詳細master先行の呼出順で、独立transactionをbaseline/candidate/candidate/baselineの順に各2回測定した小標本の平均であり、p95や負荷試験ではない。測定用の `SET TRANSACTION READ ONLY` を含むSQLイベントは9 → 8。SQLイベントdurationには通信等も含まれ、DB CPU時間と同義ではない。

変更前の候補実験でも全6組が一致し、同じSELECT削減を確認してから実装した。実装後は実際のselectとresolverで上表を再測定した。接続開始や最初のクエリには揺れがあり、最初の値を定常時間として扱わない。接続不能だった試行は成功試行から除外した。

task専用の新規PostgreSQL 17.11コンテナをloopback限定で作成し、既存CI接続ガード下で既存migrationと架空fixtureのみを適用した。同DBでも一覧・詳細の各3組が全一致し、SELECT 5 → 4を確認した（1店舗・3メニュー・87リンク・29品目）。ローカルの数msの差は通信揺れの影響が大きく、一定率の短縮を主張しない。

## 検証

- PASS：`npm.cmd run lint`、`npm.cmd run typecheck`。
- PASS：`npm.cmd test`、基点`58f149d`へのrebase後244/244。4状態・不正値の既存正規化、欠損リンク、未解決IDの失敗、要求ごとのマスタ対応を追加検証。Windowsホストで実行した。
- PASS：`node --import tsx scripts/check-public-read-snapshot.ts`。実SQLのリンクSELECTを止めた間に別接続で食品訂正を確定。snapshotなしの旧食品＋新FREEの反例、最適化snapshot内での旧CONTAINS維持、次の取得で停止が見えることを確認。
- PASS：`npm.cmd --ignore-scripts run build -- --webpack`。最新mainへrebase後の本番buildで公開3ページの動的生成も確認した。schemaと生成済みClientは同じため、共有依存を再生成するprebuildは省略。junctionで既存依存を参照するWindows環境のためwebpackを指定した。
- PASS：既存Playwright 1.61.0の `node scripts/browser-runner.mjs public`、8 group成功。専用DBの既存架空fixtureを読み、公開一覧・店舗詳細・メニュー導線・設定・検索・横幅・共有とクライアント例外なしを確認した。DBを書き換えず、外部リクエストを遮断した回帰である。
- PASS：`node --import tsx scripts/check-publication-propagation.ts` による最終HTTP停止反映。未解決事項の追加・食品訂正後のAPI404、メニュー/店舗本文からの食品消失、全停止後の一覧からの店舗消失、補足元停止の反映を確認した。ストリーム開始後のメニューページはHTTP200のままnot-foundとnoindexを返し、停止食品は含まない。390pxの実Chromiumによる新しい遷移でもnot-foundと食品消失を確認した。

最終HTTP回帰の対象は今回新設したtask専用loopback CI DBとローカル本番buildだけで、本番・他DBへ切り替えていない。テスト用の架空probeを作成して当該probeだけを削除した。実行前後の既存10テーブルの件数と全行ハッシュが一致し、probeの後始末と既存データの不変を確認した。

独立の読取専用reviewは `58f149d..aaa2a2d` を対象に実施し、具体的findingなし。コード・差分・証拠を確認したreviewであり、reviewer自身によるDB接続や全テストの再実行は行っていない。

依存は既存 `node_modules` を参照して再利用し、追加installやlock変更は行っていない。ホストNode 22.15.1/npm 10.9.2とリポジトリ基準Node 22.23.4/npm 11.18.0の差は残る。

## 全体の遅延について未確認の部分

変更前Production `9affd0208d7327430aa61e6f53f97bfdcf713792` のブラウザ観測は、一覧の初回本文表示17.235秒/再読込5.132秒、詳細4.922秒/2.052秒だった。一覧初回の約12秒はrequestStart前にあり、サーバー処理12秒と断定できない。再読込ではHTMLストリーム終了まで約2〜5秒かかっていた。最初の応答時刻には中間応答が含まれ得るため、確定した200ヘッダーやアプリ処理の所要時間として扱わない。

今回減らしたのは両routeのSELECT 1本と、そのLaptop測定での約80msの読取時間である。本番VercelのCPU/DB内訳、Server-Timing、変更後の本番HTTP本文時間、cold startやDB休止の寄与は未確認。ブラウザ測定とLaptopのDB測定を差し引いて原因や解消率を求めない。既に開いた画面・戻る・オフラインへの自動更新も未確認のまま。

関連する `rules.md` の公開条件、`product.md` の画面仕様、AGENTSの作業規則は変えない。取得構成の説明は `architecture.md`、実装と検証の入口は `change-map.md`、この記録への入口は `verification.md` に反映する。
