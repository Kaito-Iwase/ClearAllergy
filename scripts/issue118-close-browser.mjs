// Close the context BEFORE the browser; never let one success prove both.
// Results are fixed booleans only; provider errors/handles never escape.
export async function closeIsolatedBrowser(context, browser, attempts = {}, onStage = () => {}) {
    const r = { contextCreateAttempted: attempts.contextCreateAttempted === true,
        browserLaunchAttempted: attempts.browserLaunchAttempted === true,
        contextHandlePresent: !!context, browserHandlePresent: !!browser,
        contextCloseAttempted: false, contextCloseConfirmed: false,
        browserCloseAttempted: false, browserCloseConfirmed: false, allLocalClosed: false,
        lifecycleObservationFailed: false };
    const observe = stage => { try { onStage(stage); } catch { r.lifecycleObservationFailed = true; } };
    if (context) {
        r.contextCloseAttempted = true;
        observe('CONTEXT_CLOSE_START');
        try { await context.close(); r.contextCloseConfirmed = true; } catch { /* fixed false */ }
        observe('CONTEXT_CLOSE_END');
    }
    if (browser) {
        r.browserCloseAttempted = true;
        observe('BROWSER_CLOSE_START');
        try { await browser.close(); r.browserCloseConfirmed = true; } catch { /* fixed false */ }
        observe('BROWSER_CLOSE_END');
    }
    r.allLocalClosed = (!r.contextCreateAttempted && !context || r.contextCloseConfirmed) &&
        (!r.browserLaunchAttempted && !browser || r.browserCloseConfirmed);
    return r;
}
