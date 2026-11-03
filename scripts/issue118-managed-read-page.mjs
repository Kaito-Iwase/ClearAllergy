// Local test-driver scope only. Registration does no browser or provider I/O.
// The caller first reads the known fixture through its verified owner's API.
import { previewOrigin } from './issue118-preview-transport.mjs';

const refuse = () => { throw Error('MANAGED_READ_PAGE_REFUSED'); };
export function createManagedReadPageScope({ context, shopId, assertReady }) {
    if (!context || !/^c[a-z0-9]+$/.test(shopId || '') || typeof assertReady !== 'function') refuse();
    const pages = new Map();
    const current = page => {
        assertReady();
        const binding = pages.get(page);
        if (!binding || page.context() !== context || page.isClosed() || !binding.documents.has(page.url())) refuse();
        return binding;
    };
    const scriptPage = request => {
        try {
            if (request.method() !== 'GET' || request.resourceType() !== 'script') return undefined;
            for (const page of pages.keys()) if (request.frame() === page.mainFrame()) {
                current(page); return page;
            }
        } catch { /* Unknown/stale scope is never a grant. */ }
        return undefined;
    };
    return {
        register(page, menuId) {
            assertReady();
            if (!/^c[a-z0-9]+$/.test(menuId || '') || page.context() !== context || page.isClosed() || pages.has(page) || pages.size >= 1) refuse();
            const binding = {
                documents: new Set([previewOrigin + '/admin/menus/' + menuId + '/edit',
                    previewOrigin + '/shops/' + shopId + '/menus/' + menuId, previewOrigin + '/shops/' + shopId]),
                api: previewOrigin + '/api/admin/menus/' + menuId,
            };
            pages.set(page, binding);
            let released = false;
            return () => { if (!released) { pages.delete(page); released = true; } };
        },
        allowsRead(request) {
            try {
                if (request.method() !== 'GET' || !['fetch', 'xhr'].includes(request.resourceType())) return false;
                for (const page of pages.keys()) if (request.frame() === page.mainFrame()) {
                    const binding = current(page);
                    return request.url() === binding.api;
                }
            } catch { /* Exact raw URL equality also excludes query, fragment and encoded paths. */ }
            return false;
        },
        scriptPage,
        assertScriptPage(request, expectedPage) { if (scriptPage(request) !== expectedPage) refuse(); },
    };
}
