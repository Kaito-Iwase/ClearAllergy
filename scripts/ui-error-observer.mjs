import assert from "node:assert/strict";

const react419 = message => message.startsWith("Minified React error #419;");

// Observe every page in a context, including popups, until context.close resolves.
// Keep raw exception messages in memory only: arbitrary errors can contain secrets.
/** @param {{ label: string, notFoundUrl?: string }} options */
export async function observeUIErrors(context, options) {
    const { label, notFoundUrl } = options;
    const errors = [];
    const receipts = [];
    let confirmedPage;
    let closed = false;
    const report = { label, observed: 0, streamedNotFound419: 0, unexpected: 0, closed: false };
    const recoveryUrl = notFoundUrl ? new URL("/shops", notFoundUrl).href : undefined;
    context.on("weberror", event => errors.push({ page: event.page(), message: event.error().message }));

    if (notFoundUrl) {
        // pageerror's serialized Error loses React's digest. Capture only the exact
        // expected digest in the original document, without suppressing the error.
        await context.exposeBinding("__clearallergyNotFoundError", (source, receipt) => {
            if (source.frame === source.page.mainFrame() && receipt.documentUrl === notFoundUrl
                && [notFoundUrl, recoveryUrl].includes(receipt.eventUrl)
                && receipt.digest === "NEXT_HTTP_ERROR_FALLBACK;404"
                && typeof receipt.message === "string" && react419(receipt.message)) {
                receipts.push({ page: source.page, message: receipt.message });
            }
        });
        await context.addInitScript(() => {
            const documentUrl = location.href;
            addEventListener("error", event => {
                if (event.error?.digest === "NEXT_HTTP_ERROR_FALLBACK;404"
                    && typeof event.error.message === "string"
                    && event.error.message.startsWith("Minified React error #419;")) {
                    // The binding is installed before page scripts and the callback is
                    // synchronous on the runner. A missing receipt fails closed.
                    void globalThis.__clearallergyNotFoundError({
                        documentUrl, eventUrl: location.href,
                        message: event.error.message, digest: event.error.digest,
                    });
                }
            });
        });
    }

    return {
        report,
        confirmNotFoundResponse({ page, url, status, html }) {
            assert.equal(url, notFoundUrl, "404 evidence must belong to the requested document");
            assert.ok([200, 404].includes(status), "Unexpected not-found HTTP status");
            const boundary = html.includes('data-dgst="NEXT_HTTP_ERROR_FALLBACK;404"')
                || /\$RX\("[^"\n]+","NEXT_HTTP_ERROR_FALLBACK;404"\)/.test(html);
            assert.ok(boundary && html.includes('<meta name="robots" content="noindex"'), "Missing streamed 404 evidence");
            assert.ok(page, "404 response must identify its page");
            confirmedPage = page;
        },
        async closeAndVerify() {
            assert.equal(closed, false, "An observation can be finalized only once");
            await context.close();
            closed = true;
            // Match one digest receipt to one actual browser exception. In particular,
            // a second #419 with the same message but no digest must still fail.
            const remaining = receipts.filter(receipt => receipt.page === confirmedPage);
            const unexpected = errors.filter(error => {
                const index = remaining.findIndex(receipt => receipt.page === error.page && receipt.message === error.message);
                if (index < 0) return true;
                remaining.splice(index, 1);
                return false;
            });
            Object.assign(report, { observed: errors.length, streamedNotFound419: errors.length - unexpected.length, unexpected: unexpected.length, closed });
            assert.equal(unexpected.length, 0, `${label}: unexpected client exceptions before context closure (${unexpected.length})`);
            return report;
        },
    };
}
