# Issue #118 callback独立比較候補（未配備）

app基準は6293d5a。SDK/lock/schema/auth判定は変更せず、同じProjectの新しい隔離Preview候補で、callback受信内容を独立比較するためのコード。元Deploymentの実原因や実認証成功を証明するものではない。

## 到達条件と停止

通常requestは従来のclerkMiddlewareへそのまま渡す。`x-issue118-callback-diagnostic: signature-shape-only-v1` を付けたrequestだけ診断分岐へ入る。Project IDはclear-allergy-e2e固定、Environmentはpreview、branch associationはtest/staging、source SHA metadataあり、HTTPS immutable VERCEL_URL一致、GET /admin/login、legacy carrier一つだけを必須とする。alias、Production、main、別Project、nonce混在はHOLD。branch/sourceのmetadataはソースの暗号学的証明ではなく、実行側のfresh receiptとsource manifest照合も必要。

Secretは入力検査後、JWKS取得直前にlazy参照する。sk_test以外は送信しない。送信先は `https://api.clerk.com/v1/jwks` のみ、fetch呼出し1回、GET、redirect manual、8秒期限、1MiB上限。OIDC/header/Cookie/入力URLをBAPIへ引き継がない。Authorizationはこのappの既存test Secretだけ。公開 `@clerk/backend/jwt` のdecodeJwt/hasValidSignatureで署名を比較し、directiveの限定形状を確認する。SDK内部の改変、console/fetchのglobal差替えはない。

callback応答は固定stage/codeとbooleanのJSON、no-store。通常SDKcallback、Cookie適用、ClerkJS、Backend testing/ticket/session API、店舗API/DB/Blobへ進めない。初回GETには診断headerを付けず通常middlewareでhandshakeを開始し、3 GET目のcallbackにだけheaderを付ける。実行側はこの応答で必ず停止して4 GET目やT1を送らない。ヘッダ値は認証鍵ではなく、Vercel AllDeployments保護と既存OIDC信頼を維持する。

1 fetch制限は1 request内の制限。deployment全体で一生一回という保証はしない。CI排他・run_attempt1・新dispatch一回を実行側で管理し、unknown時に再送しない。Clerk側の通常のprovider状態・サービスログの扱いは変更せず、local context/browser終了とprovider状態を混同しない。

## 検査

`node --test tests/issue118-server-callback-diagnostic.test.mjs`。17の公開SDK署名/形状case、13のruntime/query guard負例、正例とfetch/redirect/body上限等を合成で確認する。依存がないローカルworktreeでは `ISSUE118_SDK_MODULE_ROOT` に同版の既存cloneを明示してpublic crypto関数だけを読む。新key・実通信・browserは使わない。CI等の通常依存配置では未指定で当該repoのSDKを読む。

独立比較が正常でも、元SDKがcarrierを認識したか、内部JWKS cache/fetch、directive適用やCookie受理は分からない。RS256だけの限定診断であり、他algや診断boundsのHOLDを製品invalidとしない。

## 配備前に残る条件

未配備・live未承認。既存branch限定設定を維持してsource-file Previewをtest/stagingへ関連付ける公式手段はあるが、既存Brave Dashboardでlocal candidate sourceをそのscopeへ送れるかは未確認。新CLI認証/インストール・token発行・Secret取得で埋めない。metadataだけでremote branchを書き換えたように扱わず、実candidate SHA/manifestを記録する。branch aliasは新Previewを指す可能性がある。既存本番Projectやremote main/test/stagingを変えない。

配備・実診断の具体承認は、新SHA/Project/Preview branch association、既存Secretがcandidateへ供給されること、同じ固定Clerk→new candidateへの秘密相当callbackとapp→固定BAPIへの既存test Secret送信をまとめて対象にする。配備後は新URL/Node/保護を照合し、元6293や旧runを遡及PASSにしない。
