# Issue118 初回document限定handshake

基準runner `78cc50c557048a6b5530c006065d19e88f149693`、固定app `6293d5a02758f72a7cf00201fec239afc6b699eb`、Deployment `dpl_FCdWVUy7Zo1GQd2xXdbDiFUD2wz3`。2026-11-01の限定承認に基づき、test driverの初回main-frame document GETだけへ配線する。製品・schema・認可・本番設定は変更しない。実Cookie/FAPI・T1の成否は後続の実測結果で判定する。

分類run41272102052のNode GETは307の転送先が期待Clerk originと一致したが、実pathは未取得。以下は固定SDKから確認した契約の**狭い部分集合**であり、そのrunのpathや全FAPI実装を証明したものではない。未知のpath regexや動的host拡張は使わない。

## 根拠と許す順序

lockは `@clerk/nextjs7.5.13` / `@clerk/backend3.11.0`。backendの `dist/chunk-EXSW62UK.mjs:6614-6645` は固定FAPI originの `/v1/client/handshake` に、元app URLをredirect_url、API版2026-05-12、suffixed_cookies、理由dev-browser-missing、format=nonceを付ける。nonceは`:660-664`の `__clerk_handshake_nonce`、dev-browser値は `__clerk_db_jwt` として受け取り、`:6656`付近でnonceを解決する。DevelopmentのresolveHandshakeは`:6695`付近でhandshake/help/dev-browser/nonce queryを除いた元appへ再転送する。Next SDKはLocationをNextResponse.redirectへ渡し既定307。

| 段階 | GET先と受理条件 | 次へ進む条件 |
| --- | --- | --- |
| APP_INITIAL | 固定Preview `/admin/login`、queryなし。新しいpageのmain-frame document navigation GETのみ | 200ならそのdocumentを返して終了。307なら次行のURLを完全検査 |
| CLERK_HANDSHAKE | `https://one-dolphin-7936.clerk.accounts.dev/v1/client/handshake`。上記5 queryだけ、重複不可。redirect_urlは固定app/login完全一致、版/理由/format固定、suffixed_cookiesはtrue/false。session/dev token/組織/satelliteの追加queryは拒否 | 302/303/307で次行のcallbackだけへ。FAPI側の厳密なstatus契約はSDKに含まれないため、この3 statusは候補の明示的な一時GET転送ポリシー。その他はHOLD |
| APP_CALLBACK | 固定app `/admin/login`、非空nonceが必須、任意の非空 `__clerk_db_jwt` だけ。値はopaqueとして扱い、正当性はサーバーSDKが確認 | 307でqueryなしの固定app/login完全一致へ |
| APP_CLEAN | queryなしの固定app/login | 200だけを元documentへfulfillして終了。再handshake・その他redirect/statusはHOLD |

全URLはabsolute HTTPS、userinfoなし、非標準portなし、fragmentなし。relative Location、別origin/path、未知/重複query、legacy JWT/help/組織/satellite flowはHOLD。maximumは**1 handshake交換中の3 HTTP転送・4 GET**で、3回のhandshake再試行ではない。各fetchはmaxRedirects0/maxRetries0/20秒。初期URLへの最後の1回の復帰だけを順序で認め、途中ループや再使用は拒否する。

nonce callbackの全FAPI挙動は実検証前。想定外の正当な変種でも自動拡張せずHOLDとする。

## credential・Cookie・session境界

既存runnerが作る新しいnonpersistent context/pageに限定。storageState/imported Cookie/global extraHTTPHeadersなしという現在のcreation codeを呼出し点で維持することが前提で、任意の既存ブラウザへ使う汎用helperではない。

| 送信先 | 送られ得る値 | 送らないもの |
| --- | --- | --- |
| 固定app（GET1/3/4） | 毎回既存token()でclaims/期限を確認したGitHub OIDC header。context jarのapp-domain Cookie。callback GET3のみClerkから来たnonce/dev-browser値 | Clerk Secret Key、手入力したCookie、別originのCookie |
| 固定Clerk（GET2） | 固定appを指すredirect_urlとSDKの非秘密metadata。context jarがそのoriginへ管理するCookie。Clerk側で一時client/nonce/Cookieが作られ得る | **OIDC/bypass header、Authorization、app Cookieの手動コピー、Referer/Origin、Clerk Secret Key** |

helperは初期requestのallHeadersを読まず、既知HTML/document headersを新規構築する。既存scopedOidcHeadersを使い、Clerk hopではOIDC supplier自体を呼ばない。supplierはcreateCiAccess内の既存token()を使うことが必須で、署名確認を新設したとの主張はしない。

Playwright1.61の `page.context().request` は同じcontextとCookie storageを共有し、宛先へ自動送信・Set-Cookieを反映する。Cookie値を読取り/コピー/exportせず、手動で跨originへ転送しない。API fetch内で往復を完結し、最終clean app responseだけを元pageへ返すため、中間queryをbrowser navigation historyへ渡さない。URL/query/Location/header/body/tokenは検証runnerのlog/trace/report/Actions artifactへ出さず、固定stage/HTTP status/count/booleanだけをdiagnosticsへ出す。HTTP requestとしてClerkおよびVercel上のappへ値は送られ、サービス側の通常アクセスログ等の保管は未確認・変更しない。そこまで非保存を保証するものではなく、それらの生ログも取得しない。

nonce解決時にはappサーバーが既存のClerk接続を使う可能性がある。helperのdocument-readyは認証/所有者確認ではない。現在のfrontend instance照合→固定owner lookup→公式test認証の順序は別に残す。

## HOLD・配線条件・未検証範囲

例外・通信断・不正status/Location・expired OIDC・loop・fulfill不明は固定CI_INITIAL_HANDSHAKE_HELD。自動再送/fixture cleanup/別経路なし。Cookieやprovider側一時状態が存在し得る場合はcontextDisposalRequiredを立てる。contextを閉じることはprovider client/nonce/sessionの失効確認ではなく、SIGNOUT_CONFIRMEDとは報告しない。

createCiAccess.authenticateの初回page.gotoのmain-frame documentだけへ適用し、既存token()を渡す。初回windowは成功・失敗とも閉じ、helper完了と診断保存を確認できなければBackend API認証前にHOLDする。API/PUT/POST、2回目navigation、通常の公開操作のredirect guardは一切変えない。既存runnerのfresh-context/global-headerなしのcreation codeとcallsiteを関連mockで照合し、diagnosticsをinitialHandshakeとして秘密なしreceiptへ保存する。通常のfrontend instance/owner確認とtoken/session終了判定は後続で維持する。実試験の回数・対象はその時の具体承認範囲に限定する。

ローカルmockは完全なURL/順序/credentialヘッダー分離/loop/unknown-error HOLDを検査するが、実FAPI・実Cookie動作・実認証・T1成功の保証ではない。過去の別試験成功を流用しない。

検査コマンド:
`node --test tests/issue118-initial-handshake-candidate.test.mjs`

## 2026-11-01 legacy callback候補と承認後の配線

診断41281320271のboolean観察は固定return origin/pathと安全条件一致、nonceなし、既知legacy queryありだった。値の取得・JWT妥当性・SDKでの実消費は未確認。nonce形式を要求した送信元SDKだけから、FAPIが必ずnonceで返すとは保証できなかった。元runをこの診断で遡及証明しない。

固定 `@clerk/backend` 3.11.0 のchunk-EXSW62UK.mjsでは、initHandshakeValues（662行）が `__clerk_handshake` を取得し、getCookiesFromHandshake（6662行）のnonce不在側でverifyHandshakeTokenを呼ぶ。6560行以降でJWKを解決し、6536行以降でtyp/alg/署名を確認したpayloadのhandshake配列だけをcookie directivesへ使う。Developmentは6695行以降でhandshake等のqueryを除去する。これは実装の根拠であり、実サービス値を検証した証拠ではない。

ローカル候補 `allowLegacyCandidate:true` は固定app/loginへの `__clerk_handshake` 1件だけを別の分岐で認める。nonce/dev-browser/追加queryとの混在・重複・空値は拒否。compact JWTの構文だけを確認し、decode・署名検証・payload適用をdriverで代行しない。検証は変更しないappのSDKへ委ね、document-readyを認証成功とは扱わない。nonce経路は既存条件のまま。HTTPS/host/path/userinfo/port/fragment、3転送/4 GET、retry0、ClerkへOIDCを送らない制約は維持する。

候補単独の既定値はfalse。別途承認した通常ci-authの初回document呼出しだけが `allowLegacyCandidate:true` を明示する。nonceとlegacy双方の配線・混在拒否をmockで検査し、新SHAのCI・実試行結果は別記する。既存callback停止診断のcallbackContractMatchesは既定nonce条件のままで、legacy受理や認証の成功とは別である。nonceとの違いは、Clerkからappへのcallbackが参照用nonceではなく署名付きhandshake payloadを運ぶ点。payloadはcookie/session関連directiveを含み得るため秘密相当として扱い、Actions/trace/artifactへ値を保存しない。サービス通常ログの保存範囲は未確認。

offlineでは一時生成した合成RSA鍵だけで実SDKのauthenticateRequestを呼び、合成directiveの受理と署名改ざん拒否、fetch0を検査する。実Clerk鍵の発行や利用ではない。現在のlegacy拒否も既定経路で維持する。

終了処理候補はcontext.close完了後にbrowser.closeを呼び、各attempt/handle/close成功を独立booleanで保持する。context失敗後もbrowser終了は試みるが、一方の成功で両完了にしない。handle未取得も未確認。41281320271の同時closeが原因だったかは未確定で、過去resultを修正しない。provider状態の失効とローカル終了は別である。

## 限定承認の範囲

> 固定試験Previewと、設定済みClerk Developmentの間だけ、初回ログイン画面GETのhandshakeを許可していい？ `/v1/client/handshake` と元の `/admin/login` のnonce callback・query除去に限定し、最大3転送・4 GET、再試行なしにする。OIDCはappだけへ送り、Clerkへは送らない。Clerkの一時client/nonceやCookieが作られ、callback値は同じVercel appへ戻る。こちらのActions log・artifact・session fileには値を保存しないが、各サービス側の通常アクセスログ保管は変更しない。候補を専用runnerへ配線し、限定確認・push・両CI成功後、instance/owner確認を通った場合だけ既存のテスト認証と新fixtureのT1・最後の非公開化を1回実行する。想定外の転送や結果不明ではHOLDにして再送しない。main・Production・新しいキーや権限設定・既存データは変更しない。

参照:
- https://github.com/clerk/clerk-docs/blob/main/docs/guides/how-clerk-works/overview.mdx
- https://github.com/microsoft/playwright/blob/v1.61.0/docs/src/api-testing-js.md
- https://github.com/microsoft/playwright/blob/v1.61.0/docs/src/api/class-apirequestcontext.md
