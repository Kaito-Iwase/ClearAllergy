// Explicit local test bootstrap. Never loads .env, creates Clerk accounts, or installs tools.
import { spawn, execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, writeFile, rm, access, readdir, stat } from 'node:fs/promises';
import { createWriteStream, openSync, closeSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { assertLocalFixtureProbe, parseLocalFixtureState, ciFixtureDatabase, fixtureServerIdentity } from './environment.mjs';

export async function runFixture({ localDatabase } = {}) {
    const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const runId = randomUUID();
    const output = join(source, 'test-results', `${localDatabase ? 'local' : 'ci'}-${runId}`);
    const databaseURL = localDatabase?.url ?? process.env.DATABASE_URL;
    const directURL = localDatabase?.url ?? process.env.DIRECT_URL;
    const ciFlag = localDatabase ? 'true' : process.env.CLEARALLERGY_CI_FIXTURES;
    const callerCI = localDatabase ? 'true' : process.env.CI;
    const runner = resolve(process.env.CLEARALLERGY_BROWSER_RUNNER_DIR || join(tmpdir(), 'clearallergy-browser-1.61.0'));
    const httpPort = 33162;
    const baseURL = `http://127.0.0.1:${httpPort}`;
    const windowsHide = true;
    const allowFontDownload = process.argv.slice(2).length === 1 && process.argv[2] === '--allow-font-download';
    const result = { mode: 'clerk-boundary-double', runId, baseURL, databaseLifecycle: localDatabase ? 'owned' : 'prepared-ci-service', commands: [],
        scope: 'Actual Next UI/HTTP routes/ownership/DB; Clerk identity and middleware mocked. One save500 test explicitly injects an HTTP failure.',
        started: new Date().toISOString(), outcome: 'RUNNING' };
    let ownedRoot, app, stateFile, server, serverLog;
    let database;
    let interrupted = false;
    const children = new Set();
    const pendingStops = new Set();
    const execFileAsync = promisify(execFile);
    const save = () => writeFile(join(output, 'lifecycle.json'), JSON.stringify(result, null, 2) + '\n');
    const systemKeys = new Set(['SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATH', 'PATHEXT', 'SYSTEMDRIVE',
        'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS',
        'LANG', 'LC_ALL', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
        'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
        'BROWSER_EXECUTABLE', 'CLEARALLERGY_BROWSER_RUNNER_DIR']);
    // Preserve supported platform proxy/CA policy, but never inherit credentials,
    // NODE_PATH, project overrides, or caches belonging to another task.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => systemKeys.has(key.toUpperCase())));

    function stopChildTree(child) {
        const promise = stopOwnedTree(child);
        pendingStops.add(promise);
        promise.then(() => pendingStops.delete(promise), () => pendingStops.delete(promise));
        return promise;
    }

    async function stopOwnedTree(child) {
        if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
        const receipt = { pid: child.pid, method: process.platform === 'win32' ? 'taskkill-owned-tree' : 'owned-process-group', confirmed: false };
        (result.processStops ||= []).push(receipt);
        let timer;
        try {
            const exit = once(child, 'exit');
            if (process.platform === 'win32') {
                await execFileAsync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
                    ['/PID', String(child.pid), '/T', '/F'], { windowsHide, timeout: 10_000, env });
            } else {
                // Every owned child below starts its own process group on POSIX.
                process.kill(-child.pid, 'SIGTERM');
            }
            await Promise.race([exit, new Promise((_, no) => { timer = setTimeout(() => no(Error('Owned process exit unconfirmed.')), 10_000); })]);
            if (process.platform !== 'win32') {
                let groupPresent = true;
                for (let i = 0; i < 20; i++) {
                    try { process.kill(-child.pid, 0); }
                    catch (error) { if (error.code === 'ESRCH') { groupPresent = false; break; } throw error; }
                    await new Promise(yes => setTimeout(yes, 100));
                }
                if (groupPresent) throw Error('Owned process group is still present.');
            }
            receipt.confirmed = true;
        } catch {
            result.processCleanupUncertain = true;
            throw Error('Owned process tree/group could not be confirmed stopped.');
        } finally { clearTimeout(timer); }
    }

    const interruptHandler = () => {
        interrupted = true;
        Promise.allSettled([...children].map(stopChildTree)).catch(() => {});
    };
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, interruptHandler);

    function command(label, args, cwd = app, timeout = 180_000) {
        if (interrupted && !['pg-stop', 'cleanup-actors'].includes(label)) throw Error('Local E2E interrupted.');
        return new Promise((yes, no) => {
            // A pg_ctl child starts a daemon which can inherit stdout. A pipe keeps
            // ChildProcess.close pending after pg_ctl exits; a file descriptor does not.
            const log = openSync(join(output, label + '.log'), 'wx');
            const start = Date.now();
            let timedOut = false;
            console.log('START', label);
            let child;
            try { child = spawn(args[0], args.slice(1), { cwd, env, windowsHide, stdio: ['ignore', log, log], detached: process.platform !== 'win32' }); }
            finally { closeSync(log); }
            children.add(child);
            const timer = setTimeout(() => {
                timedOut = true;
                stopChildTree(child).then(() => no(Error(label + ' timed out.')), no);
            }, timeout);
            child.once('error', error => { clearTimeout(timer); children.delete(child); no(error); });
            child.once('close', async (code, signal) => {
                clearTimeout(timer);
                children.delete(child);
                result.commands.push({ label, command: args, code, signal, timedOut, milliseconds: Date.now() - start });
                await save();
                console.log('END', label, code, signal || '');
                if (code === 0 && !timedOut && (!interrupted || ['pg-stop', 'cleanup-actors'].includes(label))) yes();
                else no(Error(label + ' failed; see its saved log.'));
            });
        });
    }

    async function freePort(port) {
        const listener = net.createServer();
        listener.listen(port, '127.0.0.1');
        await once(listener, 'listening');
        await new Promise((yes, no) => listener.close(error => error ? no(error) : yes()));
    }

    async function stopServer() {
        if (!server) return;
        await stopChildTree(server);
        children.delete(server);
        serverLog.end();
        result.nextStopped = true;
    }

    try {
        if (!allowFontDownload) throw Error('This bootstrap compiles Next and may download Noto Sans JP from fonts.googleapis.com/fonts.gstatic.com. Obtain scoped permission, then pass --allow-font-download. No environment was started.');
        database = ciFixtureDatabase({ CI: callerCI, CLEARALLERGY_CI_FIXTURES: ciFlag, DATABASE_URL: databaseURL, DIRECT_URL: directURL });
        result.database = database;
        await mkdir(output, { recursive: true });
        if (localDatabase) await freePort(database.port);
        await freePort(httpPort);
        ownedRoot = await mkdtemp(join(tmpdir(), 'ca-e2e-'));
        app = join(ownedRoot, 'app');
        stateFile = join(ownedRoot, 'state.json');
        result.ownedRoot = ownedRoot;
        await save();
        const profile = join(ownedRoot, 'profile');
        const temporary = join(ownedRoot, 'tmp');
        const roaming = join(profile, 'AppData', 'Roaming');
        const local = join(profile, 'AppData', 'Local');
        for (const directory of [profile, temporary, roaming, local, join(ownedRoot, 'cache')]) await mkdir(directory, { recursive: true });
        Object.assign(env, { TEMP: temporary, TMP: temporary, TMPDIR: temporary, HOME: profile,
            USERPROFILE: profile, APPDATA: roaming, LOCALAPPDATA: local,
            npm_config_cache: join(ownedRoot, 'cache'), TSX_DISABLE_CACHE: '1' });
        // Only this new copy receives auth aliases. Product config/schema remain untouched.
        console.log('COPY existing app sources/dependencies to owned temp');
        await mkdir(app);
        for (const name of ['app', 'features', 'lib', 'components', 'types', 'prisma', 'public', 'scripts', 'tests', 'e2e',
            'package.json', 'package-lock.json', 'tsconfig.json', 'next-env.d.ts', 'next.config.ts', 'proxy.ts', 'instrumentation.ts',
            'postcss.config.mjs', 'tailwind.config.ts', 'eslint.config.mjs', 'playwright.config.mjs']) {
            await cp(join(source, name), join(app, name), { recursive: true });
        }
        await cp(join(source, 'node_modules'), join(app, 'node_modules'), { recursive: true });
        await cp(join(app, 'next.config.ts'), join(app, 'next.product.config.ts'));
        await writeFile(join(app, 'next.config.ts'), `import product from './next.product.config';
    export default {...product, turbopack:{...product.turbopack,resolveAlias:{...product.turbopack?.resolveAlias,
     '@clerk/nextjs/server':'./e2e/local-auth/server.ts','@clerk/nextjs':'./e2e/local-auth/client.tsx'}}};\n`);
        await mkdir(join(app, 'app/e2e-fixture-check'), { recursive: true });
        await cp(join(app, 'e2e/local-auth/route.ts'), join(app, 'app/e2e-fixture-check/route.ts'));
        const url = databaseURL;
        Object.assign(env, {
            DATABASE_URL: url, DIRECT_URL: url, CLEARALLERGY_CI_FIXTURES: 'true', CI: 'true',
            PORTFOLIO_MODE: 'false', ADMIN_REGISTRATION_MODE: 'disabled', NEXT_TELEMETRY_DISABLED: '1',
            NEXT_PUBLIC_APP_URL: baseURL, E2E_BASE_URL: baseURL, E2E_AUTH_MODE: 'local-mock',
            E2E_LOCAL_RUN_ID: runId, E2E_LOCAL_STATE_FILE: stateFile,
            NODE_OPTIONS: '--dns-result-order=ipv4first', PGPASSWORD: 'local_ci_only', PGCONNECT_TIMEOUT: '5',
            npm_config_offline: 'true', CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1',
            CLEARALLERGY_BROWSER_RUNNER_DIR: runner,
        });
        // The prepared CI path uses the platform-native Client generated by the
        // existing workflow. It never installs/generates Prisma or starts/stops PG.
        await command('typecheck-copied-source', [process.execPath, 'node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false', '--pretty', 'false']);
        if (localDatabase) await localDatabase.prepare({ app, ownedRoot, output, env, command });
        await command('seed-actors', [process.execPath, '--import', 'tsx', 'e2e/local-auth/data.mjs', 'seed']);
        const state = parseLocalFixtureState(await readFile(stateFile, 'utf8'), baseURL, runId);
        const receipt = JSON.parse(await readFile(stateFile + '.receipt.json', 'utf8'));
        if (receipt.runId !== runId) throw Error('Fixture receipt belongs to another run.');
        const serverIdentity = fixtureServerIdentity(receipt.serverIdentity, database);
        env.E2E_PUBLIC_SHOP_ID = receipt.publicShopId;
        result.databaseIdentity = receipt.database;
        result.actorShops = receipt.actorShops;
        result.auth = { boundary: 'Clerk auth/currentUser/provider/middleware only', actors: ['a', 'b'], accountsCreatedInClerk: false };
        // Uses the normal Next compiler with explicit test-only Clerk aliases.
        // The explicit flag requires prior authorization for these official font downloads.
        await command('build-auth-fixture', [process.execPath, 'node_modules/next/dist/bin/next', 'build'], app, 600_000);
        serverLog = createWriteStream(join(output, 'next.log'), { flags: 'wx' });
        server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(httpPort)], { cwd: app, env, windowsHide, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
        let serverError;
        server.on('error', error => { serverError = error; });
        children.add(server);
        server.stdout.pipe(serverLog, { end: false });
        server.stderr.pipe(serverLog, { end: false });
        let ready = false;
        result.preflightObservations = [];
        for (let i = 0; i < 80; i++) {
            if (serverError) throw Error('Owned Next server failed to start.');
            if (interrupted) throw Error('Local E2E interrupted.');
            if (server.exitCode !== null || server.signalCode !== null) throw Error('Owned Next server exited.');
            try {
                const response = await fetch(baseURL + '/e2e-fixture-check', { redirect: 'manual', signal: AbortSignal.timeout(1000) });
                const body = await response.json().catch(() => null);
                const observation = { status: response.status, body };
                if (result.preflightObservations.length < 3 && !result.preflightObservations.some(item => JSON.stringify(item) === JSON.stringify(observation))) {
                    result.preflightObservations.push(observation);
                    await save();
                }
                if (response.status === 200) { assertLocalFixtureProbe(state, body, serverIdentity); ready = true; break; }
            } catch (error) {
                result.lastPreflightError = error.name;
                // Bounded wait for this owned server; no raw error/credential is stored.
            }
            await new Promise(yes => setTimeout(yes, 250));
        }
        if (!ready) throw Error('Local fixture preflight did not validate; no E2E mutations attempted.');
        result.preflightValidated = true;
        await command('playwright', [process.execPath, 'scripts/browser-runner.mjs', 'e2e', '--output', join(output, 'browser')], source, 900_000);
        result.outcome = 'PASS';
    } catch (error) {
        result.outcome = 'FAIL_OR_BLOCKED';
        result.error = { name: error.name, message: error.message };
        console.error(error.message);
        process.exitCode = 1;
    } finally {
        const cleanupErrors = [];
        async function cleanupStep(label, operation) {
            try { await operation(); }
            catch (error) { cleanupErrors.push({ label, message: error.message }); }
        }
        await cleanupStep('owned-processes', async () => {
            await stopServer();
            await Promise.all([...children].map(stopChildTree));
            await Promise.all([...pendingStops]);
            if (result.processCleanupUncertain) throw Error('Owned processes are unconfirmed; retaining temp.');
        });
        if (!cleanupErrors.length) await cleanupStep('owned-fixture-rows', async () => {
            if (!stateFile) return;
            let seeded = false;
            try { await access(stateFile); seeded = true; } catch { /* no committed actors */ }
            if (seeded) {
                await command('cleanup-actors', [process.execPath, '--import', 'tsx', 'e2e/local-auth/data.mjs', 'cleanup']);
                result.fixtureCleanup = JSON.parse(await readFile(stateFile + '.receipt.json', 'utf8')).cleanup;
            }
        });
        // The local adapter must stop its own cluster even after another cleanup
        // error. The prepared CI path has no database-stop operation at all.
        if (localDatabase) await cleanupStep('owned-database', async () => {
            result.databaseStopped = await localDatabase.stop({ ownedRoot, output, env, command });
        });
        else result.serviceDatabasePreserved = true;
        if (ownedRoot && !cleanupErrors.length) await cleanupStep('owned-temp', async () => {
            const media = join(app, '.next', 'static', 'media');
            try {
                result.builtFontArtifacts = await Promise.all((await readdir(media)).filter(name => /\.(woff2?|ttf)$/.test(name)).map(async name => ({ name, bytes: (await stat(join(media, name))).size })));
            } catch { result.builtFontArtifacts = []; }
            const suffix = relative(tmpdir(), ownedRoot);
            if (isAbsolute(suffix) || suffix.startsWith('..') || suffix.includes(sep) || !suffix.startsWith('ca-e2e-')) throw Error('Refusing cleanup outside owned temp directory.');
            await rm(ownedRoot, { recursive: true });
            result.ownedTempDeleted = true;
        });
        if (cleanupErrors.length) {
            result.cleanupErrors = cleanupErrors;
            result.outcome = 'FAIL_OR_BLOCKED';
            process.exitCode = 1;
        }
        for (const signal of ['SIGINT', 'SIGTERM']) process.removeListener(signal, interruptHandler);
        result.finished = new Date().toISOString();
        await mkdir(output, { recursive: true });
        await save();
        console.log(result.outcome, output);
    }

    return result;
}
