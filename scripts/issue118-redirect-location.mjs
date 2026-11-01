// Classification only. An origin match never authorizes following a redirect.
import { ciIdentity } from './issue118-ci-auth.mjs';
import { previewOrigin } from './issue118-preview-transport.mjs';

export function classifyLocationOnly(value) {
    const result = {
        present: typeof value === 'string' && value.trim().length > 0,
        lengthAllowed: typeof value === 'string' && value.length <= 16384,
        parseable: false, https: false, userinfoAbsent: false,
        defaultPort: false, fragmentAbsent: false,
        samePinnedApp: false, knownClerk: false, knownVercel: false, other: false,
        stopBeforeFollow: true,
    };
    if (!result.present || !result.lengthAllowed) return result;
    try {
        const url = new URL(value, previewOrigin);
        result.parseable = true;
        result.https = url.protocol === 'https:';
        result.userinfoAbsent = !url.username && !url.password;
        result.defaultPort = url.port === '';
        result.fragmentAbsent = url.hash === '';
        result.samePinnedApp = url.origin === previewOrigin;
        result.knownClerk = url.origin === 'https://' + ciIdentity.clerkDomain;
        result.knownVercel = url.origin === 'https://vercel.com';
        result.other = !result.samePinnedApp && !result.knownClerk && !result.knownVercel;
    } catch { /* Never return the input, parser exception, URL or query. */ }
    return result;
}
