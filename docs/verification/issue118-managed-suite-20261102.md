# Issue #118 承認済みの管理下検証

この手順は製品仕様の採用やHOLD解除を意味しない。実行結果は各runの結果JSONと独立SQL照合で判断する。合成テストの成功を実サービス成功へ読み替えない。

## 固定対象と上限

- App: `8bf5bea476d5cf5a8dd6ac38713a2d393d7460b1`、tree `ba8f677798bc22a7752092586436ac82b5394b46`。
- Preview: `dpl_14PXhbZ9EnKuiL2kTQwbuU7d5ebo`、Project `clear-allergy-e2e`。初回の`dpl_E6BEMYCcuE2u7Ha3WEN42kp5u4Kt`はGET 500を保持し、成功扱いにしない。
- 実DBは専用Neon `patient-heart-55595249` / `br-flat-wildflower-aoeragrs` / `clearallergy_main19`。DB接続情報をGitHubへ保存しない。
- 新規メニュー32件、成功メニュー書込み103回、ShopA保存4回、画像5件、一時session7件が上限。失敗・結果不明も台帳から削除しない。
- 各runのfresh receiptには、先行失敗runを含む実消費数`managedPriorSessionConsumption`を必須で設定する。初回は2件、後続armは1件を加え、合計7件を超える場合は認証前に拒否する。suite内部のsession数と全試験の累計を混同しない。
- 保護対象の既存メニュー、本番、main、既存設定・権限・キーは変更しない。画像と監査履歴は削除しない。

## 実行前

1. 専用branchの確定HEADに対するhead/PR CIの成功を確認する。配備抑止のexact branch `false`を維持する。
2. 外部からProject、Deployment、完全App SHA、immutable URL、Preview/Ready、保護、aliasを再確認し、非秘密のidentity receiptを作る。
3. 先行runの終端・session終了・未知write不存在、排他、消費済み予算を照合する。PCの永続dispatch台帳でinitial承認または先行snapshot SHAを`wx`で一度だけclaimしてから送信する。不明な送信も消費済みとして保持する。rerunボタンは使わない。run_attemptは1に限定する。
4. 公開コード取得run `41470110878`のcaller/factory bytesと静的factory chainの対応を確認済み。これはclient action参照の根拠であり認証やDBの成功証拠ではない。

## 初回の管理下run

手動workflow `issue118-live-e2e.yml`の`APPROVE_MANAGED_SUITE`を、固定の専用branch/ref・確定runner SHA・fresh receiptで実行する。専用jobだけが既存Environment keyとOIDCを使う。OIDCは固定appだけ、Clerkへ送らない。session/profile/traceのexportは行わない。

A/B双方の通常の公式テスト認証と所有店舗を確認してから、新規T1を1件実行する。最後に非公開化し、既存保護対象のAPI表現を比較する。同じA/B sessionを再利用してT2/T3/T4、価格のみ・食品不変STOP・無信号対照、cross-owner拒否8件・旧版拒否2件、既知対象の最終非公開化へ進む。

coreの期待予算は21件/79書込み/session2件。無信号は現物の見落しと必要STOP分母0=N/Aを区別する。T4の既開タブ、fresh GET、API、戻る、意図的な1document中断は別観測であり、人の理解を実証しない。

その後、正常配達と送信前遮断の12セル、最後に新規作成の応答返却抑止1セルを実施する。正常Shop画像uploadの直後に対応するShop保存を行う。上流応答後の返却抑止は、clientには結果不明なので必ずHOLDで止める。serverの成功をclient成功にしない。

## 結果不明と再開

2026-11-02 の初回2runではsession計4件を消費した。run41489714874のCREATEは201後に停止し、独立READ ONLY照合で専用fixture `cmvziwd1k0001js07pqfoctkr` の作成成功・非公開29/食品版29を確認した。元runのHOLDは変更しない。現在の`APPROVE_MANAGED_SUITE`はこの既存作成に対する固定の外部SQL証跡を必須とし、新CREATEを繰り返さずINITIAL_PUBLISHからのみ続行する。再開前の所有APIと公開直前の再読取が一致しなければ、cleanupも書込みも行わない。これは再開用jobがSQLを独立実行したという意味ではない。

通常配達のCREATEでは、ブラウザが201を受けて自動GETする前にIDを記録する。終了時は確認済みowned sessionについてだけ、固定Shop管理画面のGET・200・hydration・owner・公開鍵・所有APIを照合してから、既存の限定signout actionを実行する。過去の通信失敗を消す処理ではない。

今回の残session上限は3件。A/Bの2件でcoreと最初のservice armを進め、その後に最大1 armを行える。残りの障害armを全て実施できたとは扱わず、追加sessionの許可がなければ未実施として残す。fixture数と書込み数では、既存の作成1件/1回を二重計上しない。

タイムアウト後のGETだけでは遅延commitを否定できない。元の要求が終端と確認できるまで、再送・自動cleanup・新しいfixtureを禁止する。新規作成201では、補助項目の検証前に実IDを台帳へ登録する。

cross-runの一度消費はPC側の単一dispatcherが担う。CI jobは外部artifact/SQL確認のattestationを受け入れるため、PCのclaimファイルをサービス側で独立検証する保証はない。今回の実行では同じcheckpointの新dispatchを禁止する。無人の共有dispatcherへ移す場合は別の永続claim設計が必要であり、この手順をその完成としない。

各HOLD後は今回のsessionだけを終了照合し、context/browserを個別に終了確認する。元のHOLD・operation claim・requestIdを保持し、親の独立READ ONLY SQLで対象・監査・公開確認履歴・食品版を照合する。後続armはsnapshotと独立terminal receiptを照合してから、必要なA sessionを1件だけ作る。台帳のリセット、旧operationの再実行はしない。

残る応答返却抑止は保存、STOP、メニュー画像、Shop保存、Shop画像の5arm。Shop保存の結果不明後の復元は、独立terminal照合とfresh全体hash/CASが一致した場合だけ行う。競合があれば復元しない。STOPの編集UIは正規の空POSTを使うため、直前状態一致とatomic CASの保証を混同しない。

## 判定

flow、client観測、上流要求、非公開化、Shop復元、保護対象、session終了、local close、独立SQLを別々に記録する。正常なfault検査でも元runのHOLD/exit 2は保持する。全18セル・全fixtureの最終状態・予算・独立照合が揃うまで総合PASSとしない。

`issue118-live-guards`は秘密なしのunit/guard/loopback検査だけである。sandboxのEACCESと通常権限の成功は別結果として残す。実接続は専用の明示的manual jobだけで行い、通常CIには混ぜない。
