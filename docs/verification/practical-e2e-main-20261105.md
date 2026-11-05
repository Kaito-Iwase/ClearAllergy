# main基準の通常Playwright E2E候補（2026-11-05）

[検証・採用状況](../guide/verification.md#practical-e2e-status) · [E2E実行手順](../guide/e2e.md)

前半は公開準備・Windows検証時点の記録で、後半に公開後のLinux実測を追記しています。前半の未コミット・外部未実施は当時の状態です。後続の文書同期commitのCIは対象PRのSHAで別に確認します。

推奨PR baseは、GitHub connectorとGitの読み取りで確認したremote main `51adcb23945b80bb34b110d2d0f263d29629a821`。remote `test/staging` は `6293d5a02758f72a7cf00201fec239afc6b699eb` でした。旧PR #120はDraft、head466dc743/base test/stagingのままです。新候補は専用bare repositoryから作成した独立branch `test/practical-e2e-main-20261105`、baseとHEADは51adcb23945b、変更は未コミットです。remote確認後に公開操作はしていません。公開直前にはremoteの移動を再確認します。

## 差分と必要性

E2Eのconfig/spec、認証境界を模擬する専用copy、Windows所有PGと準備済みCI DBの入口、関連guardと手順、既存CIへの接続、新branchだけのVercel Git配備停止を追加します。製品app/features/lib/components/prisma/schema・migration・proxy・Next設定・依存lockfileは変更しません。

旧#120の76ファイル差分、手動runner、実処理workflowは取り込みません。mainには問題のservice ID guardとmanaged-integration testが存在せず、旧1行timeout修正は不要なので含めません。main採用済みのUTC対応や画像保存方針なども戻しません。

CIはmainのUTC/JST/LA独立jobと専用空DB、checkout@v7、main/develop trigger、通常製品build・旧公開回帰を保持します。新E2Eは既存build jobの準備済みPostgreSQL17、生成済みplatform用Client、隔離Playwright1.61.0/Chromiumを使う別stepです。旧Issue118のCI定義をコピーしません。

## main用の依存・生成物

旧候補とlockfileは同一ですが、main schemaのUTC `dbgenerated` defaultは旧Clientと異なります。依存copyから旧 `.prisma` を除外し、既存6.19.3 CLIと既存Windows engineでこのmain schemaからローカル生成しました。自動package installを無効化し、以前と同じ変更していないJS network deny/native path guardで生成だけを検査しています。guard記録はREADYのみでBLOCKEDや取得試行はなく、195宣言の一致を確認しました。Prismaの取得拒否を再試行したり、別endpointから取得していません。

このJS guardはOS firewallではありません。生成以外のbuildやブラウザー全通信を封じた証拠へ拡張しません。実DB検証には一致した新Clientを使っています。

## 実行結果

環境はWindows、Node22.15.1、npm10.9.2、Prisma6.19.3、既存PostgreSQL17.11、既存Chromiumです。repository pinのNode22.23.4/npm11.18.0、Linux/Docker serviceでの実行とは区別します。

| 検査 | 結果・対象 |
| --- | --- |
| 実Next/HTTP/保存API/架空PG/Chromiumのprepared CI共通経路 | 9/9 PASS、26.8秒、run `ci-635bf824-8463-4923-8444-caf656d2c4c8` |
| 広い単体回帰（hardlink test名除外指定、20秒上限） | 298件PASS、exit0。無除外npm test成功ではない |
| 全体lint＋監査helper修正後の対象lint | exit0 |
| 型検査、コピー先型検査 | exit0 |
| Playwright列挙 | 9件、exit0。起動/接続を伴わない列挙だけ |
| 認証aliasを設定した試験copyのNext build | exit0 |
| 通常npm prebuild+build | 2回ともexit1、下記の失敗を保持 |

9件は公開4件と管理5件です。新規非公開保存→保存済み版で別操作の公開、他店の取得/編集/削除/停止拒否、入力保持、A/B各店舗の旧編集PUT409と同じ旧画面STOP200を含みます。匿名公開API404と公開DOMからの名前・原材料除去を確認します。Clerkのauth/currentUser/provider/middlewareだけを模擬し、保存500の1件だけHTTP失敗を注入します。実Clerkログイン・Blob・実Previewを検証した結果ではありません。

## 既存データと後始末

新規owned PGを外側preparerが作り、既存CI公開fixtureと架空の既存AuditLog1行を準備しました。共通runner前後はUser/Shop/MenuItem/AuditLogの件数 `1|1|3|1` を維持し、既存4モデルのfingerprintも一致しています。

試験が新規作成したA/Bとそのmenuを削除しました。User削除によるAuditLog匿名化を避けるため、runのclerkID・email・shop所有権を確認して、そのUser IDの監査ログ17行だけを先に削除しました。新規監査行の残留なしも確認しました。未知の同時監査書込みがあれば削除せず、成功判定も止めます。

共通runner終了後もサービスDBが存続していました。その後、この新DBを所有する外側preparerだけが停止・削除しました。所有Next停止・TEMP削除と実パス不在も確認済みです。元repoの別作業9件、旧候補、他のDBを変更していません。

## 通常製品buildの未解決

認証を差し替えない元のNext設定で `node <既存npm-cli.js> run build` を実行しました。CI dummy keyとloopback URLだけを使い、環境・credentialファイルはコピーしていません。両回ともprebuildのローカルPrisma生成は成功しました。

1回目は通常権限でNoto Sans JPの公式CSS取得先 `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@100..900&display=swap` への接続に失敗しました。2回目は同じ取得先への正式限定アクセスで実行し、PostCSS処理用の子Nodeが接続前にexit0となるTurbopackInternalErrorで失敗しました。どちらも元ログを残しています。後者の原因は未確定です。明示的なapproval拒否は記録されておらず、異なるproxyやbuild方式で回避していません。

製品build成功とは扱いません。試験copyのalias build成功や、旧466上の通常build・9/9結果も代用しません。Linux CIの最終SHAで通常buildを含む全jobを確認する必要があります。

## 配備抑止・公開時の挙動

`vercel.json` は新branch名そのものの `false` だけを追加し、既存全ルールを保持しています。[Vercel公式Git設定](https://vercel.com/docs/project-configuration/git-configuration)では、この指定はそのbranch commitによるGit配備を抑止します。live Project設定・実pushでのSkip表示は未確認で、CLI/別workflowの配備を止める保証ではありません。

新branchへのpushだけでは現在のCI push filter（main/develop）に入りません。mainへのDraft PRを作るとpull_request CIが起動し得ます。CIはUTC3timezone jobと既存build jobを実行し、新stepに到達するには既存unit・DB・製品build・browser検査も通る必要があります。25分job全体の完走は未確認です。

mainの現行文書は両Vercel ProjectのProduction追跡先がmainと説明しています。新branchのfalseはmainへmergeした後の配備を止めません。テスト用変更だけでもmergeが本番再配備を誘発し得るため、merge・Productionへの影響は別承認です。live設定は今回読み取っていません。

## Windows準備時点の未確認・証跡

Linux/pin版Node・npm、無除外npm test、通常製品build、CI全job・branch保護、実Clerk/Blob、配備抑止のlive動作は未確認です。Windows local-PG wrapperもこの新baseでは再実行せず、prepared共通経路の成功と区別します。

独立read-only reviewはround1で監査ログ残留を指摘し、上記の限定cleanupと残留照合を追加したround2ではP1/P2なしでした。実行後のreceiptを含む最終照合も保存記録に残します。

元ログは今回作業領域の親 `e2e-standalone-preparation-20261105/`、実E2Eはworktree `test-results/ci-635bf824-8463-4923-8444-caf656d2c4c8/` に保存しています。この文書にも対象・結果・未確認を記載しています。commit/push/PR作成/更新/Actions起動/merge/配備は行っていません。

## 公開後のCI定義修正

Draft PR #128の初回head `b8f612bed8d794f39611e6cb464c0611efe59de0` ではDependency auditが成功し、CIはrun42028680835でjob開始前に失敗しました。job-level envの `runner.temp` 参照は[GitHubのcontext利用範囲](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)で許可されていないため、その参照を取り除き、ブラウザー導入前のstepが `$RUNNER_TEMP` から絶対pathを `$GITHUB_ENV` へ書く形に修正しました。既存browser回帰と新E2Eは同じ保存先を引き続き使います。テスト・認証境界・配備停止・UTC独立jobは変えていません。修正後の最終headとLinux実行結果はPRのrunへ結び付けて追跡します。

## 公開後のLinux CI実測（head 5dbba923）

head `5dbba923cf0c4bec4889ffef07ba9c701e99b31d`、base `51adcb23945b80bb34b110d2d0f263d29629a821` の[CI run42030085365](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/42030085365)は全4job成功、[Dependency audit run42030085234](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/42030085234)も成功しました。実checkoutはPR merge候補 `f079371fe36e034e238bae1b1a7a6aaf14117286` です。Ubuntu26.04.1／Node22.23.4、npm11.18.0整合step、PostgreSQL17 serviceで、無除外の単体299/299、lint・型検査・実DB検査・通常製品build・旧browser回帰を通過しています。Windows準備時点の未確認事項とは別の実測です。

新E2Eはrun `ci-fa86c01b-7656-4832-8b98-52a6d6365195` で9/9 PASS、20.8秒。Clerk境界だけを模擬し、1件の500応答を注入する範囲は変えていません。run監査17行の限定削除、既存4モデルのfingerprint保持、サービスDB保持、所有POSIX process group停止、TEMP削除をreceiptで確認しました。client127.0.0.1と実SQL server172.18.0.2も別々に照合しました。

[artifact13416231574](https://github.com/Kaito-Iwase/ClearAllergy/actions/runs/42030085365/artifacts/13416231574)のZIP（4,537,557bytes、SHA256 `f5651a03003df423531e21f3db07c44eb64b53feb24334126b4e8e0aed7a65a8`）を照合し、Playwright logとlifecycleを精査しました。元記録はworktreeの親の `e2e-publication-20261105/` に保存しています。

2026-11-05 12:57 UTCのVercel APIでは、本branchの配備はclear-allergy／clear-allergy-e2eとも0件で、既存Productionのdeployment IDとmain51adcbのSHAは公開前と同じでした。観測期間の事実で、将来の別経路配備まで保証しません。Draftを維持し、main merge・auto merge・手動deployは行っていません。

実Clerk/Blob・新規店舗登録/招待・実配備のcache伝播・Windows通常製品buildの失敗原因は引き続き未検証または未解決です。この文書が示す成功は固定head5dbba923の実測で、後続の文書同期commitのCI結果は対象PRで別に確認します。
