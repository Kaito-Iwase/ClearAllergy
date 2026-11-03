# Issue #118 固定SDKのbootstrap合成検査

実認証のGET3再handshakeを、Cookie不足だけと断定しないための検査。製品・SDK・通常live transportの処理と転送制限は変更しない。

## 検査と範囲

```powershell
node --test tests/issue118-sdk-bootstrap.test.mjs
node scripts/browser-runner.mjs issue118-live-guards
```

既存CIのoffline guard stepに接続する。`@clerk/backend 3.11.0` の実`authenticateRequest`と実`createInitialHandshakeCandidate`を使うが、RSA鍵・provider応答・Cookie store・未認証documentは合成である。実fetchはSDK import前に固定mockへ置換し、元fetchへは委譲しない。実browser・DB・Clerkへの接続や実credential取得は行わない。SDK内部retryはmock関数の呼出しであり、liveのretry条件は変わらない。

18条件のSDK観測と5条件のrunner接続に加え、未知SDK例外、SDK内部で捕捉された未知例外、driverに包まれるfixture assertionを意図的に混ぜ、期待した停止として受理されないことを確認する。THROWという外形だけで成功判定せず、固定した既知例外分類・mock回数・安全なログ分類を照合する。内側のfixture失敗flagを外側のdriver例外とは独立して保持する。未知例外の値・stack・応答・JWT・Cookie・URLをテスト出力へ出さない。

この試験で期待するSDK契約は次のとおり。実サービスの原因判定には使わない。

| 合成条件 | 契約 |
| --- | --- |
| 有効legacy署名、incoming Cookieなし | queryを除去した固定appのclean URL |
| carrierなし、dev-browser Cookieなし | handshake |
| 署名済みdirectiveがnull / JWKS mock fetch・JSON例外 | generic解決例外からhandshakeへ進み得る |
| 不正署名 / JWKS mock HTTP401・503 | 合成条件に対応する固定例外 |
| clean GETでCookieを落とす | GET4でhandshake（GET3停止と区別） |
| nonce payload失敗 | clean URLでもdirective・認証成功を意味しない |

実runnerの合成正例は4 GETで`DOCUMENT_READY_AUTH_NOT_VERIFIED`になる。200 documentも合成であり、React、Next middleware、実Cookie配送、認証、T1、API/DBのPASSではない。実公開やfixture書込みをこのCI stepへ接続しない。

## 未確認・次の判断

実GET3でcarrierが認識されたか、署名/JWKS処理が成功したか、generic例外が起きたかは不明。Cookie手動コピー、追加handshake、hop上限拡大を正当化する証拠はないため採用しない。現request APIを維持し、値なしのapp側解決分類を得られる正規の既存記録を優先する。新サーバー分類処理・配備や実認証再試行が必要なら、対象・差分・秘密情報の宛先を示す具体承認を別に得る。

通常browser案は未実装。公式Clerk helperはClerk読込済みページが前提で、公開layoutにProviderがないCAでは単純置換でbootstrapできない。CDP `Fetch.continueRequest` のheader overrideは次のredirectへ継承されない契約を持つが、`route.continue({headers})`は継承するためapp限定OIDCに使用しない。CDPへの変更は別途offline実証と、署名付きcallbackが非永続browserのURL/history/Cookieに入る実試験の承認が必要。サーバー側callback解決失敗を直す保証もない。

旧探索scriptの18/18・5/5は例外分類不足で独立レビューHOLDだった記録を保持する。この新検査で解消するのは測定器の誤受理だけであり、過去live失敗の解消や製品原因確定とは扱わない。Issue #118の既存HOLDを解除しない。
