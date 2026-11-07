import test from 'node:test';
import assert from 'node:assert/strict';
import { localBaseURL, assertAdminTarget, testAccounts, parseTestAccounts, parseLocalFixtureState, assertLocalFixtureProbe, assertLocalRequestOrigin, ciFixtureDatabase, fixtureServerIdentity } from '../e2e/environment.mjs';

test('E2E target accepts local apps and refuses remote or credential-bearing URLs', () => {
    assert.equal(localBaseURL(), 'http://localhost:3101');
    assert.equal(localBaseURL('http://127.0.0.1:3000/'), 'http://127.0.0.1:3000');
    for (const value of ['https://example.com', 'http://localhost.evil.test:3101', 'http://user:password@localhost:3101',
        'http://localhost:3101/admin', 'http://localhost:3101/?x=1', 'http://localhost:3101/#x', 'not a URL']) {
        assert.throws(() => localBaseURL(value));
    }
});

test('local request guard accepts Next localhost normalization only with the exact HTTP Host and port', () => {
    const base = 'http://127.0.0.1:33162';
    for (const hostname of ['127.0.0.1', 'localhost']) {
        assert.doesNotThrow(() => assertLocalRequestOrigin(`http://${hostname}:33162/e2e-fixture-check`, base, '127.0.0.1:33162'));
    }
});

test('local request guard refuses foreign hosts, ports, credentials, and missing or forged Host', () => {
    const base = 'http://127.0.0.1:33162';
    for (const [url, host] of [
        ['http://example.com:33162/e2e-fixture-check', '127.0.0.1:33162'],
        ['http://localhost.evil.test:33162/e2e-fixture-check', '127.0.0.1:33162'],
        ['http://localhost:33163/e2e-fixture-check', '127.0.0.1:33162'],
        ['https://localhost:33162/e2e-fixture-check', '127.0.0.1:33162'],
        ['http://SYNTHETIC_SECRET_MUST_NOT_APPEAR@localhost:33162/e2e-fixture-check', '127.0.0.1:33162'],
        ['http://localhost:33162/e2e-fixture-check', 'localhost:33162'],
        ['http://localhost:33162/e2e-fixture-check', '127.0.0.1:33163'],
        ['http://localhost:33162/e2e-fixture-check', null],
    ]) {
        assert.throws(() => assertLocalRequestOrigin(url, base, host), { message: 'Local E2E request origin refused.' });
    }
});

test('prepared CI target uses the existing service port or a dedicated local test port', () => {
    for (const port of [5432, 55463]) {
        const url = `postgresql://clearallergy_ci:local_ci_only@127.0.0.1:${port}/clearallergy_ci`;
        assert.deepEqual(ciFixtureDatabase({ CI: 'true', CLEARALLERGY_CI_FIXTURES: 'true', DATABASE_URL: url, DIRECT_URL: url }),
            { name: 'clearallergy_ci', user: 'clearallergy_ci', host: '127.0.0.1', port });
    }
});

test('prepared CI target refuses incomplete flags, different endpoints and non-fixture databases', () => {
    const url = 'postgresql://clearallergy_ci:local_ci_only@127.0.0.1:5432/clearallergy_ci';
    const valid = { CI: 'true', CLEARALLERGY_CI_FIXTURES: 'true', DATABASE_URL: url, DIRECT_URL: url };
    for (const change of [{ CI: 'false' }, { CLEARALLERGY_CI_FIXTURES: undefined }, { DIRECT_URL: undefined },
        { DIRECT_URL: url.replace('5432', '55463') }]) {
        assert.throws(() => ciFixtureDatabase({ ...valid, ...change }), { message: 'E2E requires an explicit prepared loopback CI fixture database.' });
    }
    for (const invalid of [url.replace('127.0.0.1', 'example.com'), url.replace('127.0.0.1', 'localhost'),
        url.replace('/clearallergy_ci', '/production'), url.replace('clearallergy_ci:', 'production:'),
        url.replace('local_ci_only', 'SYNTHETIC_SECRET_MUST_NOT_APPEAR'), url.replace('5432', '22'),
        url + '?schema=production', url + '#fragment']) {
        assert.throws(() => ciFixtureDatabase({ ...valid, DATABASE_URL: invalid, DIRECT_URL: invalid }),
            { message: 'E2E requires an explicit prepared loopback CI fixture database.' });
    }
});

test('a malformed account manifest never exposes secret input through JSON.parse errors', () => {
    const secret = 'SYNTHETIC_SECRET_MUST_NOT_APPEAR';
    for (const input of [`{"password":"${secret}" broken`, JSON.stringify({ password: secret })]) {
        assert.throws(() => parseTestAccounts(input), error => {
            assert.ok(!error.message.includes(secret));
            assert.equal(error.cause, undefined);
            return /test-account manifest/.test(error.message);
        });
    }
});
test('admin E2E is limited to the existing dedicated Compose port', () => {
    assert.doesNotThrow(() => assertAdminTarget('http://127.0.0.1:3101'));
    assert.throws(() => assertAdminTarget('http://localhost:3000'));
});
test('test account manifest must identify distinct fictional A/B accounts and shops', () => {
    const state = { instance: 'fixture', accounts: ['a', 'b'].map(role => ({ email: `clearallergy-${role}+clerk_test_fixture@example.com`, password: 'synthetic-only', shopId: 'c' + role.repeat(24) })) };
    assert.equal(testAccounts(state).a.shopId, state.accounts[0].shopId);
    for (const invalid of [{}, { ...state, accounts: state.accounts.slice(0, 1) },
        { ...state, accounts: [state.accounts[0], state.accounts[0]] },
        { ...state, accounts: [{ ...state.accounts[0], email: 'real@example.com' }, state.accounts[1]] }]) {
        assert.throws(() => testAccounts(invalid));
    }
});

const localRunId = '83526442-7e76-49b6-9b7b-70fc87735d5a';
const localURL = 'http://127.0.0.1:3102';
function localState() {
    return {
        mode: 'clerk-boundary-double', runId: localRunId, baseURL: localURL,
        database: { name: 'clearallergy_ci', user: 'clearallergy_ci', host: '127.0.0.1', port: 55462 },
        accounts: {
            a: { clerkUserId: `e2e_local_${localRunId}_a`, shopId: 'c' + 'a'.repeat(24), cookie: '839968e1-330f-4e5a-a8ae-b84befb31a76' },
            b: { clerkUserId: `e2e_local_${localRunId}_b`, shopId: 'c' + 'b'.repeat(24), cookie: '2295aed7-e03d-4ef3-a9c1-1ed7162c6db6' },
        },
    };
}
function probeFor(state) {
    const { mode, runId, baseURL, database } = state;
    return { mode, runId, baseURL, database: { ...database }, serverIdentity: { ...database } };
}
function fixedError(action, message) {
    assert.throws(action, error => {
        assert.equal(error.message, message);
        assert.equal(error.cause, undefined);
        return true;
    });
}
const manifestError = 'Local E2E fixture manifest is invalid or belongs to another run or target.';
const probeError = 'Local E2E fixture probe does not match the approved run and database.';

test('local auth-double manifest binds fictional A/B to an explicit run, app and disposable database', () => {
    const state = localState();
    assert.deepEqual(parseLocalFixtureState(JSON.stringify(state), localURL + '/', localRunId), state);
    assert.doesNotThrow(() => assertLocalFixtureProbe(state, probeFor(state), state.database));
});

test('local disposable database ports include both explicit unprivileged boundaries', () => {
    for (const port of [1024, 65535]) {
        const state = localState(); state.database.port = port;
        const parsed = parseLocalFixtureState(JSON.stringify(state), localURL, localRunId);
        assert.equal(parsed.database.port, port);
        assert.doesNotThrow(() => assertLocalFixtureProbe(parsed, probeFor(state), state.database));
    }
});

test('local manifest refuses another run or app before actors can be admitted', () => {
    const serialized = JSON.stringify(localState());
    for (const [baseURL, runId] of [
        [localURL, undefined], [localURL, 'not-a-uuid'],
        [localURL, '72672a88-9955-4ff6-8473-a53b85f0dfe6'],
        ['http://127.0.0.1:3103', localRunId], ['http://localhost:3102', localRunId],
        ['https://production.example', localRunId], ['http://127.0.0.1', localRunId],
        ['http://user:secret@127.0.0.1:3102', localRunId],
    ]) fixedError(() => parseLocalFixtureState(serialized, baseURL, runId), manifestError);
});

const invalidLocalStates = [
    ['live mode', state => { state.mode = 'real-clerk'; }],
    ['remote app', state => { state.baseURL = 'http://remote.example:3102'; }],
    ['production database', state => { state.database.name = 'clearallergy'; }],
    ['different database user', state => { state.database.user = 'neondb_owner'; }],
    ['remote database host', state => { state.database.host = 'example.neon.tech'; }],
    ['ambiguous database host', state => { state.database.host = 'localhost'; }],
    ['string database port', state => { state.database.port = '55462'; }],
    ['privileged database port', state => { state.database.port = 1023; }],
    ['out-of-range database port', state => { state.database.port = 65536; }],
    ['fractional database port', state => { state.database.port = 55462.5; }],
    ['unapproved connection field', state => { state.database.url = 'postgresql://secret@production/db'; }],
    ['copied credential', state => { state.accounts.a.password = 'SYNTHETIC_SECRET_MUST_NOT_APPEAR'; }],
    ['arbitrary user identity', state => { state.accounts.a.clerkUserId = 'user_live_identity'; }],
    ['swapped actor identities', state => { state.accounts.a.clerkUserId = state.accounts.b.clerkUserId; }],
    ['other-run identity', state => { state.accounts.a.clerkUserId = `e2e_local_72672a88-9955-4ff6-8473-a53b85f0dfe6_a`; }],
    ['shared shop', state => { state.accounts.b.shopId = state.accounts.a.shopId; }],
    ['invalid shop ID', state => { state.accounts.a.shopId = 'cshort'; }],
    ['malformed cookie UUID', state => { state.accounts.a.cookie = '839968e1-330f-4e5a-08ae-b84befb31a76'; }],
    ['identity used as cookie', state => { state.accounts.a.cookie = state.accounts.a.clerkUserId; }],
    ['shared cookie', state => { state.accounts.b.cookie = state.accounts.a.cookie; }],
    ['missing actor', state => { delete state.accounts.b; }],
    ['additional actor', state => { state.accounts.c = { ...state.accounts.a }; }],
];
for (const [reason, mutate] of invalidLocalStates) {
    test(`local manifest refuses ${reason}`, () => {
        const state = localState(); mutate(state);
        fixedError(() => parseLocalFixtureState(JSON.stringify(state), localURL, localRunId), manifestError);
    });
}

test('malformed local JSON cannot expose its raw value or cause', () => {
    for (const serialized of ['{"secret":"SYNTHETIC_SECRET_MUST_NOT_APPEAR" broken', 'null', '[]', '{}', undefined]) {
        fixedError(() => parseLocalFixtureState(serialized, localURL, localRunId), manifestError);
    }
});

test('probe refuses another database endpoint, app or run even when the manifest is valid', () => {
    const state = localState();
    for (const mutate of [
        body => { body.runId = '72672a88-9955-4ff6-8473-a53b85f0dfe6'; },
        body => { body.mode = 'real-clerk'; },
        body => { body.baseURL = 'http://127.0.0.1:3103'; },
        body => { body.database.port++; },
        body => { body.database.host = 'localhost'; },
        body => { body.database.name = 'production'; },
        body => { body.database.user = 'production'; },
        body => { body.database.connection = 'SYNTHETIC_SECRET_MUST_NOT_APPEAR'; },
        body => { body.accounts = state.accounts; },
    ]) {
        const body = probeFor(state); mutate(body);
        fixedError(() => assertLocalFixtureProbe(state, body, state.database), probeError);
    }
    for (const body of [null, [], {}, 'SYNTHETIC_SECRET_MUST_NOT_APPEAR']) {
        fixedError(() => assertLocalFixtureProbe(state, body, state.database), probeError);
    }
    const invalid = localState(); invalid.accounts.b.cookie = invalid.accounts.a.cookie;
    fixedError(() => assertLocalFixtureProbe(invalid, probeFor(invalid), invalid.database), probeError);
});

test('Docker server identity is distinct from the guarded loopback client endpoint', () => {
    const state = localState();
    const server = { name: state.database.name, user: state.database.user, host: '172.18.0.2', port: 5432 };
    const body = { ...probeFor(state), serverIdentity: server };
    assert.deepEqual(fixtureServerIdentity(server, state.database), server);
    assert.doesNotThrow(() => assertLocalFixtureProbe(state, body, server));
    assert.equal(body.database.host, '127.0.0.1');
    for (const change of [{ host: '172.18.0.3' }, { port: 5433 }, { name: 'production' }, { user: 'other' }]) {
        fixedError(() => assertLocalFixtureProbe(state, { ...body, serverIdentity: { ...server, ...change } }, server), probeError);
    }
    for (const invalid of [null, { ...server, host: 'not-an-IP' }, { ...server, port: 0 }, { ...server, token: 'SYNTHETIC_SECRET' }]) {
        assert.throws(() => fixtureServerIdentity(invalid, state.database), { message: 'E2E database server identity is invalid.' });
    }
    fixedError(() => assertLocalFixtureProbe(state, body, undefined), probeError);
});
