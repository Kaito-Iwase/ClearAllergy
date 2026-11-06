// Fixture rows only. Never migrate, seed the shared DB, stop it, or call Clerk.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { assertCiDatabaseTarget } from '../../scripts/ci-environment.ts';
import { DEMO_USER_EMAIL } from '../../lib/auth/demo-shop.ts';
import { ciFixtureDatabase, parseLocalFixtureState, fixtureServerIdentity } from '../environment.mjs';

assertCiDatabaseTarget();
const database = ciFixtureDatabase(process.env);
const file = process.env.E2E_LOCAL_STATE_FILE;
const runId = process.env.E2E_LOCAL_RUN_ID;
const baseURL = process.env.E2E_BASE_URL;
if (!file || !runId || !baseURL) throw Error('Explicit fixture run paths are required.');
const receiptFile = file + '.receipt.json';
const db = new PrismaClient();
const models = ['user', 'shop', 'menuItem', 'auditLog'];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function baseline(ids) {
    const rows = {};
    for (const model of models) rows[model] = await db[model].findMany({
        ...(ids ? { where: { id: { in: ids[model] } } } : {}), orderBy: { id: 'asc' },
    });
    return { ids: Object.fromEntries(models.map(model => [model, rows[model].map(row => row.id)])), hash: hash(rows) };
}

try {
    const identity = await db.$queryRaw`SELECT current_database() AS name, current_user AS "user", host(inet_server_addr()) AS host, inet_server_port() AS port`;
    if (identity.length !== 1) throw Error('Fixture database identity mismatch.');
    // The allowed client endpoint remains127.0.0.1. A Docker service can report
    // its bridge IP and internal port here; record that actual identity once.
    const serverIdentity = fixtureServerIdentity(identity[0], database);
    const action = process.argv[2];
    if (action === 'seed') {
        const demo = await db.user.findUnique({ where: { email: DEMO_USER_EMAIL }, select: { shop: { select: { id: true } } } });
        if (!demo?.shop || !await db.menuItem.count({ where: { shopId: demo.shop.id, isPublished: true } })) throw Error('Prepare the existing CI fictional public fixture first.');
        const receipt = { runId, database, serverIdentity, publicShopId: demo.shop.id, baseline: await baseline() };
        await writeFile(receiptFile, JSON.stringify(receipt), { flag: 'wx' });
        await db.$transaction(async tx => {
            const state = { mode: 'clerk-boundary-double', runId, baseURL, database, accounts: {} };
            for (const role of ['a', 'b']) {
                const clerkUserId = `e2e_local_${runId}_${role}`;
                const user = await tx.user.create({ data: { clerkUserId, email: `e2e-${runId}-${role}@example.invalid` } });
                const shop = await tx.shop.create({ data: { userId: user.id, ownerClerkUserId: clerkUserId, isActive: true, name: `【架空E2E】店舗${role}`, description: '架空データのみ' } });
                state.accounts[role] = { clerkUserId, shopId: shop.id, cookie: randomUUID() };
            }
            parseLocalFixtureState(JSON.stringify(state), baseURL, runId);
            // A file-write failure rolls back the A/B transaction. A commit failure
            // can leave only this own state file, never committed partial actors.
            await writeFile(file, JSON.stringify(state), { flag: 'wx' });
        });
        const state = parseLocalFixtureState(await readFile(file, 'utf8'), baseURL, runId);
        receipt.actorShops = Object.fromEntries(['a', 'b'].map(role => [role, state.accounts[role].shopId]));
        await writeFile(receiptFile, JSON.stringify(receipt));
        console.log('Seeded this run A/B only; reused existing fictional public fixture.');
    } else if (action === 'cleanup') {
        const state = parseLocalFixtureState(await readFile(file, 'utf8'), baseURL, runId);
        const receipt = JSON.parse(await readFile(receiptFile, 'utf8'));
        if (receipt.runId !== runId) throw Error('Fixture cleanup run mismatch.');
        if (Object.keys(serverIdentity).some(key => serverIdentity[key] !== receipt.serverIdentity?.[key])) throw Error('Fixture database server changed; refusing cleanup.');
        let auditRowsDeleted = 0;
        for (const role of ['a', 'b']) {
            const account = state.accounts[role];
            await db.$transaction(async tx => {
                const user = await tx.user.findUnique({ where: { clerkUserId: account.clerkUserId } });
                const shop = await tx.shop.findUnique({ where: { id: account.shopId } });
                if (shop && (!user || shop.userId !== user.id || shop.ownerClerkUserId !== account.clerkUserId)) throw Error('Fixture ownership changed; refusing deletion.');
                if (user && user.email !== `e2e-${runId}-${role}@example.invalid`) throw Error('Fixture user identity changed; refusing deletion.');
                // AuditLog uses SetNull on User deletion, so remove only this
                // verified new actor's logs before deleting that actor.
                if (user) auditRowsDeleted += (await tx.auditLog.deleteMany({ where: { actorUserId: user.id } })).count;
                if (shop) await tx.shop.delete({ where: { id: account.shopId } });
                if (user) {
                    await tx.user.delete({ where: { id: user.id } });
                }
            });
        }
        const after = await baseline(receipt.baseline.ids);
        if (after.hash !== receipt.baseline.hash) throw Error('Existing CI fixture changed; cleanup did not restore it.');
        if (await db.auditLog.count({ where: { id: { notIn: receipt.baseline.ids.auditLog } } })) throw Error('New audit rows remain; fixture cleanup is incomplete.');
        receipt.cleanup = { actorsDeleted: true, runAuditRowsRemoved: true, auditRowsDeleted, existingFixtureUnchanged: true, serviceDatabaseStopped: false };
        await writeFile(receiptFile, JSON.stringify(receipt));
        console.log('Removed only this run A/B; existing fixture unchanged; service DB retained.');
    } else throw Error('Unknown fixture data operation.');
} catch {
    console.error('Fixture data operation failed; inspect only the owned run receipt.');
    process.exitCode = 1;
} finally { await db.$disconnect(); }
