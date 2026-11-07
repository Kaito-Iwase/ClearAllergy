import { isIP } from 'node:net';

export function localBaseURL(value = 'http://localhost:3101') {
    let url;
    try { url = new URL(value); } catch { throw Error('E2E_BASE_URL must be a local HTTP app URL.'); }
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)
        || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        throw Error('E2E runs against a local fictional-data app only.');
    }
    return url.origin;
}

export function assertAdminTarget(baseURL) {
    const url = new URL(localBaseURL(baseURL));
    if (url.port !== '3101') throw Error('Admin E2E requires the existing dedicated compose.test.yaml app on port3101.');
}

export function testAccounts(state) {
    if (!state || typeof state.instance !== 'string' || !state.instance || !Array.isArray(state.accounts)
        || state.accounts.length !== 2) throw Error('Prepare the existing dedicated A/B test accounts first.');
    const [a, b] = state.accounts;
    for (const account of [a, b]) {
        if (typeof account.email !== 'string' || !account.email.endsWith(`+clerk_test_${state.instance}@example.com`)
            || typeof account.password !== 'string' || !account.password
            || typeof account.shopId !== 'string' || !/^c[a-z0-9]+$/.test(account.shopId)) {
            throw Error('Only the existing fictional A/B test-account manifest is supported.');
        }
    }
    if (a.email === b.email || a.shopId === b.shopId) throw Error('A/B must have distinct accounts and shops.');
    return { a, b };
}

export function parseTestAccounts(serialized) {
    try { return testAccounts(JSON.parse(serialized)); }
    catch { throw Error('The dedicated test-account manifest is missing, invalid, or not fictional A/B data.'); }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const localManifestError = 'Local E2E fixture manifest is invalid or belongs to another run or target.';
const localProbeError = 'Local E2E fixture probe does not match the approved run and database.';

function exactKeys(value, keys) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function validLocalDatabase(database) {
    return exactKeys(database, ['name', 'user', 'host', 'port'])
        && database.name === 'clearallergy_ci' && database.user === 'clearallergy_ci'
        && database.host === '127.0.0.1' && Number.isInteger(database.port)
        && database.port >= 1024 && database.port <= 65535;
}

function validLocalFixtureState(state, baseURL, runId) {
    if (!exactKeys(state, ['mode', 'runId', 'baseURL', 'database', 'accounts'])
        || state.mode !== 'clerk-boundary-double' || typeof runId !== 'string' || !uuid.test(runId)
        || state.runId !== runId || state.baseURL !== localBaseURL(baseURL)
        || !validLocalDatabase(state.database) || !exactKeys(state.accounts, ['a', 'b'])) return false;
    for (const role of ['a', 'b']) {
        const account = state.accounts[role];
        if (!exactKeys(account, ['clerkUserId', 'shopId', 'cookie'])
            || account.clerkUserId !== `e2e_local_${runId}_${role}`
            || typeof account.shopId !== 'string' || !/^c[a-z0-9]{24}$/.test(account.shopId)
            || typeof account.cookie !== 'string' || !uuid.test(account.cookie)) return false;
    }
    const { a, b } = state.accounts;
    return a.clerkUserId !== b.clerkUserId && a.shopId !== b.shopId && a.cookie !== b.cookie;
}

export function parseLocalFixtureState(serialized, baseURL, runId) {
    try {
        if (typeof serialized !== 'string' || typeof baseURL !== 'string') throw Error();
        const state = JSON.parse(serialized);
        if (!validLocalFixtureState(state, baseURL, runId)) throw Error();
        return state;
    } catch { throw Error(localManifestError); }
}

export function fixtureServerIdentity(value, database) {
    try {
        if (!exactKeys(value, ['name', 'user', 'host', 'port'])
            || value.name !== database.name || value.user !== database.user
            || typeof value.host !== 'string' || !isIP(value.host)
            || !Number.isInteger(value.port) || value.port < 1 || value.port > 65535) throw Error();
        return { name: value.name, user: value.user, host: value.host, port: value.port };
    } catch { throw Error('E2E database server identity is invalid.'); }
}

export function assertLocalFixtureProbe(state, body, serverIdentity) {
    try {
        const expectedServer = fixtureServerIdentity(serverIdentity, state.database);
        if (!validLocalFixtureState(state, state?.baseURL, state?.runId)
            || !exactKeys(body, ['mode', 'runId', 'baseURL', 'database', 'serverIdentity'])
            || body.mode !== state.mode || body.runId !== state.runId || body.baseURL !== state.baseURL
            || !validLocalDatabase(body.database)
            || ['name', 'user', 'host', 'port'].some(key => body.database[key] !== state.database[key])
            || ['name', 'user', 'host', 'port'].some(key => body.serverIdentity?.[key] !== expectedServer[key])) throw Error();
        fixtureServerIdentity(body.serverIdentity, body.database);
    } catch { throw Error(localProbeError); }
}

export function assertLocalRequestOrigin(requestURL, expectedOrigin, requestHost) {
    try {
        const expected = new URL(localBaseURL(expectedOrigin));
        const request = new URL(requestURL);
        // Next normalizes a Node request's URL to localhost. The actual HTTP
        // Host and port still have to match this run's literal IPv4 binding.
        if (expected.hostname !== '127.0.0.1' || requestHost !== expected.host
            || request.protocol !== expected.protocol || request.port !== expected.port
            || !['127.0.0.1', 'localhost'].includes(request.hostname)
            || request.username || request.password) throw Error();
    } catch { throw Error('Local E2E request origin refused.'); }
}

export function ciFixtureDatabase(env) {
    try {
        if (env.CI !== 'true' || env.CLEARALLERGY_CI_FIXTURES !== 'true'
            || !env.DATABASE_URL || env.DATABASE_URL !== env.DIRECT_URL) throw Error();
        const url = new URL(env.DATABASE_URL);
        if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1'
            || url.pathname !== '/clearallergy_ci' || url.username !== 'clearallergy_ci'
            || url.password !== 'local_ci_only' || url.search || url.hash
            || !url.port || Number(url.port) < 1024 || Number(url.port) > 65535) throw Error();
        return { name: 'clearallergy_ci', user: 'clearallergy_ci', host: '127.0.0.1', port: Number(url.port) };
    } catch { throw Error('E2E requires an explicit prepared loopback CI fixture database.'); }
}
