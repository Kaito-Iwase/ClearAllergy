// Close the context BEFORE the browser; never let one success prove both.
// Results are fixed booleans only; provider errors/handles never escape.
export async function closeIsolatedBrowser(context, browser, attempts = {}) {
    const r = { contextCreateAttempted: attempts.contextCreateAttempted === true,
        browserLaunchAttempted: attempts.browserLaunchAttempted === true,
        contextHandlePresent: !!context, browserHandlePresent: !!browser,
        contextCloseAttempted: false, contextCloseConfirmed: false,
        browserCloseAttempted: false, browserCloseConfirmed: false, allLocalClosed: false };
    if (context) {
        r.contextCloseAttempted = true;
        try { await context.close(); r.contextCloseConfirmed = true; } catch { /* fixed false */ }
    }
    if (browser) {
        r.browserCloseAttempted = true;
        try { await browser.close(); r.browserCloseConfirmed = true; } catch { /* fixed false */ }
    }
    r.allLocalClosed = (!r.contextCreateAttempted && !context || r.contextCloseConfirmed) &&
        (!r.browserLaunchAttempted && !browser || r.browserCloseConfirmed);
    return r;
}
