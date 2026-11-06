// Windows convenience only. CI uses its existing service DB through run-ci.mjs.
import { access, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export function localPostgres() {
    const port = 55462;
    const url = `postgresql://clearallergy_ci:local_ci_only@127.0.0.1:${port}/clearallergy_ci`;
    let data;
    let started = false;
    const bin = process.env.E2E_PG_BIN && resolve(process.env.E2E_PG_BIN);
    const executable = name => join(bin, name + '.exe');
    return {
        url,
        async prepare({ app, ownedRoot, output, env, command }) {
            if (process.platform !== 'win32' || !bin) throw Error('Local convenience requires Windows and E2E_PG_BIN. Prepared Linux CI uses test:e2e:ci.');
            for (const name of ['initdb', 'pg_ctl', 'createdb']) await access(executable(name));
            // Existing Windows engines only; never generate or acquire Prisma here.
            env.PRISMA_SCHEMA_ENGINE_BINARY = join(app, 'node_modules/@prisma/engines/schema-engine-windows.exe');
            env.PRISMA_QUERY_ENGINE_LIBRARY = join(app, 'node_modules/.prisma/client/query_engine-windows.dll.node');
            await access(env.PRISMA_SCHEMA_ENGINE_BINARY);
            await access(env.PRISMA_QUERY_ENGINE_LIBRARY);
            data = join(ownedRoot, 'db');
            const password = join(ownedRoot, 'password.txt');
            await writeFile(password, 'local_ci_only', { flag: 'wx' });
            await command('initdb', [executable('initdb'), '-D', data, '-U', 'clearallergy_ci', '--pwfile', password, '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C', '--no-sync']);
            await writeFile(join(data, 'postgresql.conf'), `\nlisten_addresses='127.0.0.1'\nport=${port}\ntimezone='UTC'\n`, { flag: 'a' });
            await command('pg-start', [executable('pg_ctl'), '-D', data, '-l', join(output, 'postgres.log'), '-w', 'start']);
            started = true;
            await command('createdb', [executable('createdb'), '-h', '127.0.0.1', '-p', String(port), '-U', 'clearallergy_ci', 'clearallergy_ci']);
            await command('setup-ci-env', [process.execPath, '--import', 'tsx', 'scripts/setup-ci-env.ts']);
        },
        async stop({ command }) {
            if (!data) return false;
            let pid;
            try { pid = await readFile(join(data, 'postmaster.pid'), 'utf8'); }
            catch { return !started; }
            const lines = pid.split(/\r?\n/);
            if (resolve(lines[1]) !== resolve(data) || lines[3] !== String(port)) throw Error('Refusing to stop an unowned PostgreSQL cluster.');
            await command('pg-stop', [executable('pg_ctl'), '-D', data, '-m', 'fast', '-w', 'stop']);
            return true;
        },
    };
}
