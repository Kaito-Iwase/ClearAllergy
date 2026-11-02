// Pure observations only. Never used as permission to follow a redirect.
// No URL, query key/value, header, cookie, payload or exception is returned.
export function inspectHandshakeLocation(value, kind, c, allowLegacyCandidate = false, originalCallback, allowExactRelativeClean = false) {
    const p = { kindKnown: ['APP_TO_CLERK','CLERK_TO_APP','APP_CLEAN_TARGET'].includes(kind),
        valueIsString:false, valuePresent:false, lengthAllowed:false, controlCharactersAbsent:false,
        absoluteParseable:false, relativeReference:false, diagnosticParseable:false,
        https:false, userinfoAbsent:false, defaultPort:false, fragmentAbsent:false,
        samePinnedApp:false, sameConfiguredClerk:false, knownVercel:false, otherOrigin:false,
        pathMatchesLogin:false, pathMatchesHandshake:false, queryAbsent:false,
        queryDelimiterPresent:false, fragmentDelimiterPresent:false, exactCleanApp:false,
        relativeWouldResolveExactCleanApp:false, queryKeysUnique:false, queryValuesNonEmpty:false,
        noncePresent:false, legacyPresent:false, devBrowserPresent:false,
        helpPresent:false, syncedPresent:false, sessionPresent:false, nestedReturnPresent:false,
        queryKeysAllowed:false, additionalQueryPresent:false, unknownQueryPresent:false, carriersExclusive:false, legacyShapeMatches:false,
        originalCallbackComparable:false, matchesOriginalCallback:false,
        legacyEnabled:allowLegacyCandidate===true, nestedReturnMatches:false, apiVersionMatches:false,
        reasonMatches:false, formatMatches:false, suffixedCookiesMatches:false, contractMatches:false };
    try {
        p.valueIsString=typeof value==='string';
        p.valuePresent=p.valueIsString&&value.length>0;p.lengthAllowed=p.valueIsString&&value.length<=16384;
        if(!p.kindKnown||!p.valuePresent||!p.lengthAllowed)return p;
        p.controlCharactersAbsent=!/[\u0000-\u0020\u007f]/.test(value);
        p.queryDelimiterPresent=value.includes('?');p.fragmentDelimiterPresent=value.includes('#');
        let url;try{url=new URL(value);p.absoluteParseable=true;}catch{
            try{url=new URL(value,kind==='CLERK_TO_APP'?c.clerkOrigin+c.clerkPath:c.appLogin);p.relativeReference=true;}catch{return p;}
        }
        p.diagnosticParseable=true;p.https=url.protocol==='https:';p.userinfoAbsent=!url.username&&!url.password;
        p.defaultPort=!url.port;p.fragmentAbsent=!url.hash;
        p.samePinnedApp=url.origin===new URL(c.appLogin).origin;p.sameConfiguredClerk=url.origin===c.clerkOrigin;
        p.knownVercel=url.origin==='https://vercel.com';p.otherOrigin=!p.samePinnedApp&&!p.sameConfiguredClerk&&!p.knownVercel;
        p.pathMatchesLogin=url.pathname==='/admin/login';p.pathMatchesHandshake=url.pathname===c.clerkPath;
        p.queryAbsent=!url.search;p.exactCleanApp=url.href===c.appLogin;
        p.relativeWouldResolveExactCleanApp=p.relativeReference&&p.exactCleanApp;
        if(kind==='APP_CLEAN_TARGET'&&typeof originalCallback==='string'){
            try{const original=new URL(originalCallback);p.originalCallbackComparable=true;p.matchesOriginalCallback=url.href===original.href;}catch{/* bool only */}
        }
        const q=url.searchParams,keys=[...q.keys()];
        p.queryKeysUnique=new Set(keys).size===keys.length;p.queryValuesNonEmpty=[...q.values()].every(v=>v.length>0);
        p.noncePresent=q.has('__clerk_handshake_nonce');p.legacyPresent=q.has('__clerk_handshake');p.devBrowserPresent=q.has('__clerk_db_jwt');
        p.helpPresent=q.has('__clerk_help');p.syncedPresent=q.has('__clerk_synced');p.sessionPresent=q.has('__session');p.nestedReturnPresent=q.has('redirect_url');
        const known=['__clerk_handshake_nonce','__clerk_handshake','__clerk_db_jwt','__clerk_help','__clerk_synced','__session','redirect_url',
            '__clerk_api_version','suffixed_cookies','__clerk_hs_reason','format','__clerk_redirect_count'];
        p.unknownQueryPresent=keys.some(key=>!known.includes(key));
        p.carriersExclusive=p.noncePresent!==p.legacyPresent;
        p.legacyShapeMatches=p.legacyPresent&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(q.get('__clerk_handshake'));
        let allowed=[];let shape=false;
        if(kind==='APP_TO_CLERK'){
            allowed=['redirect_url','__clerk_api_version','suffixed_cookies','__clerk_hs_reason','format'];
            p.nestedReturnMatches=q.get('redirect_url')===c.appLogin;p.apiVersionMatches=q.get('__clerk_api_version')===c.apiVersion;
            p.reasonMatches=q.get('__clerk_hs_reason')===c.reason;p.formatMatches=q.get('format')===c.format;
            p.suffixedCookiesMatches=['true','false'].includes(q.get('suffixed_cookies'));
            shape=p.sameConfiguredClerk&&p.pathMatchesHandshake&&p.nestedReturnMatches&&p.apiVersionMatches&&p.reasonMatches&&p.formatMatches&&p.suffixedCookiesMatches;
        }else if(kind==='CLERK_TO_APP'){
            const legacy=p.legacyEnabled&&p.legacyPresent;
            allowed=legacy?['__clerk_handshake']:['__clerk_handshake_nonce','__clerk_db_jwt'];
            shape=p.samePinnedApp&&p.pathMatchesLogin&&(legacy?p.legacyShapeMatches:p.noncePresent);
        }else shape=p.exactCleanApp;
        p.additionalQueryPresent=keys.some(key=>!allowed.includes(key));p.queryKeysAllowed=!p.additionalQueryPresent;
        p.contractMatches=p.controlCharactersAbsent&&(p.absoluteParseable||allowExactRelativeClean===true&&kind==='APP_CLEAN_TARGET'&&value==='/admin/login')&&p.https&&p.userinfoAbsent&&p.defaultPort&&p.fragmentAbsent&&
            p.queryKeysUnique&&p.queryValuesNonEmpty&&p.queryKeysAllowed&&shape;
    }catch{/* Only fixed booleans survive malformed input/provider-independent errors. */}
    return p;
}
