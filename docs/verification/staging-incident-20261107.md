# staging初回停止の診断候補

基点main: 1b8e3db06c1009b285c1bb04a3b7bc9920ea8b72。
隔離した完全cloneで検証。Node22.23.4 / npm10.9.9。

- npm ci: PASS、433 packages。依存/lock/app変更なし。
- Prisma6.19.3 generate: PASS。架空loopback DB設定のみ、DB接続なし。
- npm test: 552/552 PASS、skip0。
- npm run lint / typecheck / build: PASS。
- node構文検査、git diff --check: PASS。
- actionlint1.7.12: 未除外では既存/新workflowのqueue:max schema未対応でFAIL。そのexact診断だけCLIで除外するとPASS。repoにignore追加なし。GitHub service実行済みとは扱わない。

初回npm/Prisma処理は標準cacheのread-only制約で失敗し、未生成Clientに起因するtest/typecheck失敗もあった。隔離/tmp cacheを指定して生成し直した後、上記全チェックを再実行した。実際のsecretやDBは使用していない。

新workflowはmain pushのうち診断entry/workflow変更だけで実行し、main refかつactivation明示falseを要求する。既存staging Environment資格情報をそのGET-only stepだけに渡す。manual dispatchも保持。既存incidentだけへの3GETで、通常create adapterを呼ばない。raw値はboolean/固定enumへ投影し、未確認identityを成功と扱わない。

alias待機は今回の根本原因を解決した証明ではない。API方式のbranch alias自動生成は未確証。診断でdefault GETとGit情報付きGETの差、writer/source metadata、alias状態を照合するまで再配備・再有効化・固定URL変更を行わない。

専用作業branch ci/staging-incident-20261107 は最初のremote commitからexact Gitfalseを含める。mainの通常Productionは止めないためmerge時に通常Production再配備が発生し得る。vercel.json変更によりtest/stagingとcontrol blobが不一致になるので、将来の再有効化前にレビュー済み同期が必要。診断自体はstaging同期を要求しない。

未実施: 実authenticated診断、実alias変更/再配備、実Clerk/Blob/HTTP健康確認、ローカルDB/E2E、変更後GitHub required CI。独立レビューとexact remote headのCI結果はPRへ別途記録する。
