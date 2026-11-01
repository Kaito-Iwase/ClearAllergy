# Issue118 認証経路の点検と3 GET停止診断候補

対象app sourceは `6293d5a02758f72a7cf00201fec239afc6b699eb`、runner基準は `b48e4ea0b067e86a080c36d8f738b59da60f6213`。この差分はローカル候補であり、push・実通信・dispatch・設定変更はしていない。

## 保持する実測と不明点

run41283051108はFAIL。GET3の307後、APP_CLEAN_TARGET_VALIDATE_HELDで止まった。menu要求・台帳0、fixture IDなし、明示的session作成未開始、context/browser終了は各PASS。実Locationは取得しておらず、どの条件が不一致だったか未確定。307から署名検証やCookie受理の成功を推定しない。新しい観測で過去runを遡及確定しない。

## 固定SDKとdriverの比較

固定sourceのlockとローカル実装はbackend3.11.0／nextjs7.5.13／Next16.4.1で一致。配備内部ファイル自体の採取ではない。

| 境界 | SDK・既存driverの条件 | 候補の観測と停止 |
| --- | --- | --- |
| GET1 app/login | queryなし固定app。200ならdocument-ready、307なら設定Clerkの正規handshake URLだけ | statusと全Location条件をboolean。同じvalidatorで拒否、観測から許可しない |
| GET2 Clerk handshake | SDK固定pathと5 query、戻り先固定。callbackは単一legacyかnonce経路、混在・未知query拒否 | callbackの全条件を同時に観測。署名はdriverで代行せず固定app SDKへ |
| GET3 app callback | backendはnonceならpayload API、legacyならJWKとtyp/alg/署名を検査。Developmentは4種のhandshake関連queryを除去 | clean Locationのheader・parse・安全性・origin/path/query/完全一致・元callback一致・既知Clerk先・既知残存/未知/重複queryをboolean化 |
| GET4 clean app/login | Next middlewareはSDK LocationでNextResponse.redirect（既定307）。driverはqueryなし固定URLへのGET、最後の200だけをfulfill | 通常経路のstatus/fulfillを区別。新診断modeはGET4を常に禁止 |
| document後のClerkJS | 既存authenticateはgoto完了→Clerk.loaded→公開鍵instance一致→固定ownerのBackend照合→一時token/session→admin/shop | この診断では全て未実行。通常コードの進捗booleanと混同しない |
| admin/shop以降 | adminNavigationCompletedはgoto完了。最終URL/HTTP200の明示assertではない。後続所有API・anchor guardが別にある | 今回は挙動・認可・公開条件を変更せず留保。これだけで誤PASSとは断定しない |

根拠：backend `chunk-EXSW62UK.mjs` 6344行付近のderiveUrlFromHeadersはforwarded proto/hostからclerkUrlを作る。6695行付近でhandshake/help/dev-browser/nonce queryを削除しLocationを返す。Next `clerkMiddleware.js` 222〜236行はそのLocationへredirectして残りのheadersを付加する。Next `response.js` 94行以降の既定statusは307。

したがって「SDKが通常queryを除去する」と「戻りoriginがdriverの固定値と必ず一致する」は別。合成forwarded headerで別originが出ることは通信0の実SDK検査で再現したが、**今回の実原因では未確定**。別origin・relative・残存queryを新たに許す根拠にはしない。

## Cookieと最終到達の確認範囲

同じ新規nonpersistent contextのrequest interfaceを全hopで保持する。Playwright1.61のAPIRequestContext仕様ではcontext Cookieを要求へ反映し、応答Cookieでcontextを更新する（bundled typesのfetch記述17594行付近）。maxRedirects0/maxRetries0を明示し、自動followしない。手動Cookie/Referer/Origin/OIDCを転送せず、ClerkへOIDCを送らない。

新booleanはinterface選択・保持という構造上の観測。Cookie内容は読まず、実delivery/受理/保存成功は検証しないので `actualCookieDeliveryVerified:false` を維持する。Set-Cookie値・hash・trace・session exportは作らない。provider状態の失効とlocal closeは別。document responseの200/fulfill成功、page.goto完了、Clerk.loaded、instance/owner、session終了も別の根拠である。

通常API・後続navigation・Clerk/Blob要求は既存のredirect禁止のまま。正規SDKが返す可能性があるだけで例外を増やさない。失敗hopの全条件はまとめて記録するが、失敗ガードを越えて未観測の後続hopを実行することはできない。

## 最小の次回診断候補

既存workflowの `DIAGNOSE_HANDSHAKE_CLEAN_TARGET_ONLY`、CLI `--clean-target-only`。同じref／完全SHA／Environment／attempt1／fresh固定配備receipt／排他条件を要求する。OIDC後、最大APP→Clerk→固定APP callbackの3 GETだけを同じcontext.requestで行い、GET3のLocationをbooleanへ変換して、全条件が一致してもGET4前で必ず停止する。前段のガード違反なら3 GET未満で止まる。

Clerk Secret配達・ClerkJS・Backend testing/sign-in token・明示session作成API・fixtureはskip。既存nonce/legacy callbackの秘密相当値がClerkから同じappへ戻り、SDKが署名payloadのCookie/session関連directiveを消費し得る。client/nonce/Cookie等のprovider状態は作られ得る。`sessionStarted:false`は明示的なsign-in/session APIの開始なしという意味だけで、providerのsession関連状態が未作成という保証ではない。値・URL・未知query名・header/body・生例外は保存しない。観測完了exit0は認証/T1成功ではない。Location読取失敗はそのbooleanをfalseに残す。

通常helperにも同じ全条件の観測を追加するが、許可判断は変更しない既存validatorが行う。各hopの受理/拒否parity、全3 GET停止、header例外、callback不正、秘密非漏出、SDK署名拒否、最終fulfill失敗を合成検査する。実HTTP Cookie継承や実T1の代替成功にはしない。

## 次の具体的承認案

> この観測候補を専用branchへcommit・通常pushし、同SHAの両CI成功後、固定Previewで3 GET停止診断を1回だけ実行していい？ OIDCはappだけへ送り、既存のClerk→固定app callbackまでは行う。署名付きcallbackはCookie/session関連directiveを含み得て、client/nonce/Cookie等のprovider状態が作られ得るが、値は保存しない。4 GET目・ClerkJS・Backend testing/sign-in token API・明示的なsign-in/session API・店舗書込みは行わない。宛先・権限・ガードは変えず、失敗時の追加試行もしない。main・本番・キー・設定・既存データは変更しない。

これは提案だけで、今回その承認や実行を得た扱いにしない。
