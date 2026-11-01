// Diagnostic only: OIDC + at most APP/Clerk GETs; NEVER sends the callback.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { oidcRequestUrl, assertOidcClaims } from './issue118-ci-auth.mjs';
import { assertIdentityReceipt } from './check-issue118-live-t1-browser.mjs';
import { assertRedirectDiagnosticEnvironment } from './check-issue118-preview-redirect.mjs';
import { initialHandshakeContract as contract, validateInitialHandshakeTarget } from './issue118-initial-handshake-candidate.mjs';
import { scopedOidcHeaders } from './issue118-preview-transport.mjs';
import { closeIsolatedBrowser } from './issue118-close-browser.mjs';

export function callbackPredicates(response, base) {
    const p = { locationReadSucceeded:false, singleLocationHeader:false, locationPresent:false,
        locationString:false, locationLengthAllowed:false, controlCharactersAbsent:false,
        absoluteParseable:false, parseable:false, https:false, userinfoAbsent:false, defaultPort:false, fragmentAbsent:false,
        returnOriginMatches:false, returnPathMatches:false, destinationIsConfiguredClerk:false,
        destinationIsKnownVercel:false, destinationIsOther:false,
        nonceKeyPresent:false, nonceNonEmpty:false, nonceExactlyOnce:false,
        devBrowserKeyPresent:false, devBrowserNonEmpty:false, devBrowserExactlyOnce:false,
        hasLegacyHandshakeKey:false, hasHandshakeHelpKey:false, hasClerkSyncedKey:false,
        hasSessionKey:false, hasRedirectUrlKey:false, hasAdditionalQuery:false,
        allQueryKeysKnown:false, queryKeysUnique:false, queryValuesNonEmpty:false, callbackContractMatches:false };
    try {
        const entries=Object.entries(response.headers()).filter(([key])=>key.toLowerCase()==='location');
        p.locationReadSucceeded=true;p.singleLocationHeader=entries.length===1;
        if(!p.singleLocationHeader)return p;
        const raw=entries[0][1];p.locationString=typeof raw==='string';
        p.locationPresent=p.locationString&&raw.length>0;p.locationLengthAllowed=p.locationString&&raw.length<=16384;
        if(!p.locationPresent||!p.locationLengthAllowed)return p;
        p.controlCharactersAbsent=!/[\u0000-\u0020\u007f]/.test(raw);
        try {new URL(raw);p.absoluteParseable=true;}catch{/* bool only */}
        let url;try {url=new URL(raw,base);p.parseable=true;}catch{return p;}
        p.https=url.protocol==='https:';p.userinfoAbsent=!url.username&&!url.password;p.defaultPort=!url.port;p.fragmentAbsent=!url.hash;
        p.returnOriginMatches=url.origin===new URL(contract.appLogin).origin;p.returnPathMatches=url.pathname==='/admin/login';
        p.destinationIsConfiguredClerk=url.origin===contract.clerkOrigin;p.destinationIsKnownVercel=url.origin==='https://vercel.com';
        p.destinationIsOther=!p.returnOriginMatches&&!p.destinationIsConfiguredClerk&&!p.destinationIsKnownVercel;
        const q=url.searchParams,keys=[...q.keys()],allowed=new Set(['__clerk_handshake_nonce','__clerk_db_jwt']);
        p.nonceKeyPresent=q.has('__clerk_handshake_nonce');p.nonceNonEmpty=!!q.get('__clerk_handshake_nonce');p.nonceExactlyOnce=q.getAll('__clerk_handshake_nonce').length===1;
        p.devBrowserKeyPresent=q.has('__clerk_db_jwt');p.devBrowserNonEmpty=!!q.get('__clerk_db_jwt');p.devBrowserExactlyOnce=q.getAll('__clerk_db_jwt').length===1;
        p.hasLegacyHandshakeKey=q.has('__clerk_handshake');p.hasHandshakeHelpKey=q.has('__clerk_help');p.hasClerkSyncedKey=q.has('__clerk_synced');
        p.hasSessionKey=q.has('__session');p.hasRedirectUrlKey=q.has('redirect_url');
        p.hasAdditionalQuery=keys.some(key=>!allowed.has(key));p.allQueryKeysKnown=!p.hasAdditionalQuery;
        p.queryKeysUnique=new Set(keys).size===keys.length;p.queryValuesNonEmpty=[...q.values()].every(value=>value.length>0);
        p.callbackContractMatches=p.locationString&&p.locationPresent&&p.locationLengthAllowed&&p.controlCharactersAbsent&&p.absoluteParseable&&p.https&&
            p.userinfoAbsent&&p.defaultPort&&p.fragmentAbsent&&p.returnOriginMatches&&p.returnPathMatches&&p.allQueryKeysKnown&&p.queryKeysUnique&&
            p.queryValuesNonEmpty&&p.nonceKeyPresent&&p.nonceNonEmpty&&p.nonceExactlyOnce;
    }catch{/* no raw header/value/parser/provider exception survives */}
    return p;
}

export async function handshakeCallbackDiagnostic(env,receipt,fetcher,browserFactory) {
    const r={contextAccepted:false,receiptAccepted:false,oidcTargetAccepted:false,oidcRequestSent:false,oidcClaimsAccepted:false,
        browserLaunchAttempted:false,browserLaunched:false,contextCreateAttempted:false,contextCreated:false,appGetSent:false,appReplyIs307:false,outboundHandshakeAccepted:false,
        clerkGetSent:false,clerkReplyIs307:false,clerkReplyIsRedirect:false,callbackResponseObserved:false,
        callbackGetSent:false,stoppedBeforeCallback:true,clerkAuthenticationStarted:false,sessionStarted:false,fixtureWriteStarted:false,
        providerStateMayExist:false,diagnosticCompleted:false,diagnosticFailed:false,localCloseConfirmed:false};
    let browser,context;
    try {
        assertRedirectDiagnosticEnvironment(env,'HANDSHAKE_CALLBACK_ONLY');r.contextAccepted=true;
        assertIdentityReceipt(receipt);r.receiptAccepted=true;
        const oidcUrl=oidcRequestUrl(env.ACTIONS_ID_TOKEN_REQUEST_URL);
        if(!env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)throw Error();r.oidcTargetAccepted=true;r.oidcRequestSent=true;
        const issued=await fetcher(oidcUrl,{method:'GET',headers:{Authorization:`bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`},redirect:'error',signal:AbortSignal.timeout(20000)});
        if(!issued.ok)throw Error();const token=assertOidcClaims((await issued.json()).value);r.oidcClaimsAccepted=true;
        r.browserLaunchAttempted=true;browser=await browserFactory();r.browserLaunched=true;
        r.contextCreateAttempted=true;context=await browser.newContext({acceptDownloads:false,serviceWorkers:'block'});r.contextCreated=true;
        const options=(url,value)=>({method:'GET',headers:scopedOidcHeaders(url,{Accept:'text/html','Sec-Fetch-Dest':'document'},value),
            timeout:20000,maxRedirects:0,maxRetries:0,failOnStatusCode:false});
        r.appGetSent=true;r.providerStateMayExist=true;
        const first=await context.request.fetch(contract.appLogin,options(contract.appLogin,assertOidcClaims(token)));
        r.appReplyIs307=first.status()===307;
        if(!r.appReplyIs307){r.diagnosticCompleted=true;return r;}
        const headers=Object.entries(first.headers()).filter(([key])=>key.toLowerCase()==='location');
        if(headers.length!==1)throw Error();
        const clerkUrl=validateInitialHandshakeTarget(headers[0][1]);r.outboundHandshakeAccepted=true;
        r.clerkGetSent=true;r.providerStateMayExist=true;
        const second=await context.request.fetch(clerkUrl,options(clerkUrl,undefined));
        const status=second.status();r.clerkReplyIs307=status===307;r.clerkReplyIsRedirect=status>=300&&status<400;
        r.callbackResponseObserved=true;Object.assign(r,callbackPredicates(second,clerkUrl));
        r.diagnosticCompleted=true;
        // Deliberately NO third fetch, even when every callback predicate matches.
    }catch{r.diagnosticFailed=true;}
    finally{
        const closes=await closeIsolatedBrowser(context,browser,r);
        Object.assign(r,closes);r.localCloseConfirmed=closes.allLocalClosed;
        if(!r.localCloseConfirmed)r.diagnosticFailed=true;
    }
    return r;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    try{
        if(process.argv.slice(2).join(' ')!=='--callback-only'||!process.env.RUNNER_TEMP||!process.env.CLEARALLERGY_ISSUE118_IDENTITY_RECEIPT)throw Error();
        const require=createRequire(import.meta.url);
        const receipt=JSON.parse(readFileSync(process.env.CLEARALLERGY_ISSUE118_IDENTITY_RECEIPT,'utf8'));
        const result=await handshakeCallbackDiagnostic(process.env,receipt,fetch,async()=>{
            const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
            return chromium.launch({headless:true,channel:'chromium'});
        });
        const directory=join(process.env.RUNNER_TEMP,'issue118-handshake-callback');mkdirSync(directory,{recursive:false});
        writeFileSync(join(directory,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));
        if(result.diagnosticFailed||!result.diagnosticCompleted)process.exitCode=1;
    }catch{console.error('HANDSHAKE_CALLBACK_DIAGNOSTIC_REFUSED_NO_RAW_ERROR');process.exitCode=1;}
}
