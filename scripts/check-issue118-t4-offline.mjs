// Real Chromium against this process's tiny loopback HTTP fixture only.
// Not ClearAllergy, Clerk, PostgreSQL, Blob, a physical change or a live outage.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { prepareT4Observation } from './issue118-t4-observer.mjs';

export async function checkT4ObserverOffline(browser) {
    let published = true, documentGets = 0, pageStatus = 200;
    const fixture = { shopId: 'cshop', menuId: 'cmenu', name: '【架空】T4 loopback observer' };
    const server = createServer((request, response) => {
        if (request.method !== 'GET') { response.writeHead(405).end(); return; }
        response.setHeader('Content-Security-Policy', "default-src 'none'");
        response.setHeader('Cache-Control', 'no-store');
        if (request.url === `/api/menus/${fixture.menuId}`) {
            response.writeHead(published ? 200 : 404, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify(published ? { menu: { id: fixture.menuId } } : { error: 'menu not found' })); return;
        }
        if (request.url === `/shops/${fixture.shopId}/menus/${fixture.menuId}`) {
            documentGets++;
            // Exercise Next's possible streaming200 not-found distinction without pretending this is Next.
            response.writeHead(pageStatus, { 'Content-Type': 'text/html; charset=utf-8' });
            response.end(`<!doctype html><html><body><h1>${published ? fixture.name : 'ページが見つかりません'}</h1></body></html>`); return;
        }
        if (request.url === `/shops/${fixture.shopId}`) { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><h1>Away</h1>'); return; }
        response.writeHead(404).end();
    });
    await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const reports = [];
    try {
        for (const condition of ['changed', 'unchanged-negative', 'api-failure-negative', 'page-failure-negative', 'baseline-page-failure-negative']) {
            published = true; pageStatus = condition === 'baseline-page-failure-negative' ? 500 : 200;
            const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
            let after = false, observer;
            try {
                const prepare = () => prepareT4Observation({ context, fixture: { ...fixture, origin }, evidenceLevel: 'SYNTHETIC_HTTP_BROWSER',
                    assertReadTarget: () => assert.ok(origin.startsWith('http://127.0.0.1:')),
                    readPublicApi: async url => {
                        if (after && condition === 'api-failure-negative') throw Error('synthetic secret exception, must not be recorded');
                        const response = await context.request.get(url, { maxRedirects: 0, maxRetries: 0 });
                        const body = await response.json(); return { status: response.status(), menuId: body.menu?.id };
                    } });
                if (condition === 'baseline-page-failure-negative') {
                    await assert.rejects(prepare(), /PREPARE_UNVERIFIED/);
                    reports.push({ condition, preparation: 'REFUSED_HTTP500_BASELINE', evidenceLevel: 'SYNTHETIC_HTTP_BROWSER' });
                    continue;
                }
                observer = await prepare();
                // External fixture state transition only; never called a CA STOP or a DB commit.
                published = condition === 'unchanged-negative'; after = true;
                pageStatus = condition === 'page-failure-negative' ? 500 : 200;
                const beforeGets = documentGets;
                const report = await observer.afterExternalChange();
                assert.equal(report.held.foodNameVisible, true);
                assert.equal(report.events.filter(e => e.role === 'held' && e.stage === 'AFTER_EXTERNAL_CHANGE').length, 0);
                assert.equal(report.failedRefetch.injection, 'ONE_DOCUMENT_GET_ABORTED_BEFORE_FORWARD');
                assert.equal(report.events.filter(e => e.role === 'refetchFailure' && e.stage === 'AFTER_EXTERNAL_CHANGE').length, 1);
                assert.ok(report.events.some(e => e.role === 'fresh' && e.stage === 'AFTER_EXTERNAL_CHANGE' && e.finished));
                assert.ok(documentGets > beforeGets); // actual new loopback GET, not a pure memory-render test
                assert.equal(report.freshReadOutcome, condition === 'changed' ? 'FRESH_READS_HIDE_TARGET'
                    : condition === 'unchanged-negative' ? 'STOPPED_CONTENT_STILL_OBSERVED' : 'UNVERIFIED');
                assert.equal(report.fresh.targetMatched, true); assert.equal(report.back.targetMatched, true);
                assert.ok([true, false, null].includes(report.back.pageshowPersisted));
                assert.equal(report.externalStopAndDatabase, 'NOT_ATTESTED');
                assert.equal(report.truncated, false); assert.equal(report.observationFailed, false);
                assert.equal('overall' in report, false);
                assert.equal(JSON.stringify(report).includes('secret exception'), false);
                await assert.rejects(observer.afterExternalChange(), /ALREADY_USED/);
                reports.push({ condition, ...report });
            } finally {
                if (observer) assert.equal((await observer.close()).allOwnedPagesClosed, true);
                assert.equal(context.pages().length, 0);
                await context.close();
            }
        }
        return reports;
    } finally { await new Promise((yes, no) => server.close(error => error ? no(error) : yes())); }
}
