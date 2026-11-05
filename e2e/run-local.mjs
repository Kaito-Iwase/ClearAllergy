// Local Windows convenience: own PostgreSQL lifecycle stays outside CI.
import { runFixture } from './run-fixture.mjs';
import { localPostgres } from './local-postgres.mjs';
await runFixture({ localDatabase: localPostgres() });
