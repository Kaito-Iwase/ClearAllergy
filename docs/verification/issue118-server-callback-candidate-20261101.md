# Issue #118 callback診断候補と鍵class観測の準備


2026-11-01追補：旧候補 aa92dbba35088f807b8f54a7548556ab4009a37b は試験ProjectのPreviewへ1回配備済み。Deployment dpl_3eX9TYFPF4JyCTTJoBpkwpy1hq3C、branch association test/staging、Ready。診断run41322950043は3GET後TEST_KEY_CLASS_HELDで停止し、JWKSの実fetch前・署名検証未実施。context/browser終了確認済み、ClerkJS/login/session/fixture/DB/Blob操作なし。以下の署名比較の制約は維持し、末尾の鍵class観測だけが現在の未配備追補である。

app基準は6293d5a。SDK/lock/schema/auth判定は変更せず、同じProjectの新しい隔離Preview候補で、callback受信内容を独立比較するためのコード。元Deploymentの実原因や実認証成功を証明するものではない。

## 到達条件と停止

通常requestは従来のclerkMiddlewareへそのまま渡す。`x-issue118-callback-diagnostic: signature-shape-only-v1` を付けたrequestだけ診断分岐へ入る。Project IDはclear-allergy-e2e固定、Environmentはpreview、branch associationはtest/staging、source SHA metadataあり、HTTPS immutable VERCEL_URL一致、GET /admin/login、legacy carrier一つだけを必須とする。alias、Production、main、別Project、nonce混在はHOLD。branch/sourceのmetadataはソースの暗号学的証明ではなく、実行側のfresh receiptとsource manifest照合も必要。

Secretは入力検査後、JWKS取得直前にlazy参照する。sk_test以外は送信しない。送信先は `https://api.clerk.com/v1/jwks` のみ、fetch呼出し1回、GET、redirect manual、8秒期限、1MiB上限。OIDC/header/Cookie/入力URLをBAPIへ引き継がない。Authorizationはこのappの既存test Secretだけ。公開 `@clerk/backend/jwt` のdecodeJwt/hasValidSignatureで署名を比較し、directiveの限定形状を確認する。SDK内部の改変、console/fetchのglobal差替えはない。

callback応答は固定stage/codeとbooleanのJSON、no-store。通常SDKcallback、Cookie適用、ClerkJS、Backend testing/ticket/session API、店舗API/DB/Blobへ進めない。初回GETには診断headerを付けず通常middlewareでhandshakeを開始し、3 GET目のcallbackにだけheaderを付ける。実行側はこの応答で必ず停止して4 GET目やT1を送らない。ヘッダ値は認証鍵ではなく、Vercel AllDeployments保護と既存OIDC信頼を維持する。

1 fetch制限は1 request内の制限。deployment全体で一生一回という保証はしない。CI排他・run_attempt1・新dispatch一回を実行側で管理し、unknown時に再送しない。Clerk側の通常のprovider状態・サービスログの扱いは変更せず、local context/browser終了とprovider状態を混同しない。

## 検査

`node --test tests/issue118-server-callback-diagnostic.test.mjs`。17の公開SDK署名/形状case、13のruntime/query guard負例、正例とfetch/redirect/body上限等を合成で確認する。依存がないローカルworktreeでは `ISSUE118_SDK_MODULE_ROOT` に同版の既存cloneを明示してpublic crypto関数だけを読む。新key・実通信・browserは使わない。CI等の通常依存配置では未指定で当該repoのSDKを読む。

独立比較が正常でも、元SDKがcarrierを認識したか、内部JWKS cache/fetch、directive適用やCookie受理は分からない。RS256だけの限定診断であり、他algや診断boundsのHOLDを製品invalidとしない。

## 未配備：1GETの鍵class観測

同じmiddlewareの既存/admin/loginに `x-issue118-callback-diagnostic: key-class-only-v1` を付ける候補。新URL/公開endpointは作らない。既存のProject/Preview/test/staging/immutable host/HTTPS/GET/source metadata guardを通った後だけ鍵を1回読む。queryは空を必須とし、callback・nonce・追加queryを拒否する。マーカーなしの通常SDK経路、既存signature markerの判定・送信ガードは変更しない。

応答は固定27項目のbooleanだけ。取得試行/完了、存在、undefined/null/string/number/boolean/object/function/symbol/bigintの型、空文字、現行/旧test prefix、production/publishable prefix、16文字条件、CR/LF/NUL/その他ASCII制御文字、trim差、固定SDK Development分類の試行/完了/結果、既存診断ガードなら送信可能だったかを分ける。値、正確な長さ、hash、未知文字列、例外message/stack/causeは出力しない。未知型は内容に触れず、toString/valueOfを呼ばない。trimは差の比較にだけ使い、実際のcredentialや判定を正規化しない。

HTTP200は分類観察が完了した意味だけで、鍵の有効性・認証成功ではない。鍵取得/SDK helperの失敗は該当完了boolean=falseとHTTP409。SDK分類は既存lockが解決する @clerk/shared/keys 4.24.0 の公開helperを使用し、新規依存・版更新なし。transitive exportの利用を対象型検査と実helper合成検査で確認する。

この分岐は結果を返して必ず終了し、JWT decode/署名/callback適用/JWKS/fetch/通常middlewareへ進まない。Clerk通信、Cookie発行、ClerkJS、login/session/token、店舗API、DB/Blobは0。結果はno-store/noindex。既存All Deployments保護とOIDCのapp限定配達は将来の実行前提で、設定を変えるものではない。

合成検査は全predicate、未知型・機密sentinel、例外accessor、SDK helper欠落/誤型/例外、対象/path/method/header/query/userinfo/port/fragment拒否を確認し、decode/signature/fetchの呼出0を別counterでassertする。元signature/JWKSの38ケースも同時に再検証する。初回テストfixtureのBigInt表記とRequestのuserinfo構築前拒否の不備は修正し、初回失敗証跡を保持する。

## 実行前に残す承認と手順

現在はローカル差分・合成検査・限定レビューまで。新候補の配備、実GET、runner/workflow有効化、鍵取得/設定変更は行わない。

次の一括承認案：既存clear-allergy-e2eのPreview/exact test/staging scopeを維持して、この限定候補を1回配備する。新immutableURL/実source SHA/Ready/保護を照合し、既存専用workflow/ref/Environmentとapp限定OIDCのまま、新URLにだけ固定した1GET診断を検査・限定レビュー・両CI確認後に1回実行する。queryなし、Clerk/callback/JWKS/login/DBへ進まず、27 booleanだけ保存する。新しいSecret、scope拡大、main/Production/既存データ変更は含めない。新URLは未発行なので捏造せず、実配備後にrunnerを固定する。自動再試行なし。
