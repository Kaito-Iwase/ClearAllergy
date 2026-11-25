// Documentation-only renderer. Reuses an existing Playwright installation.
// No application, database, credentials, package installation, or gallery call.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const modulePath = process.env.PLAYWRIGHT_MODULE_PATH;
assert(modulePath, "Set PLAYWRIGHT_MODULE_PATH to an existing Playwright module directory.");
const { chromium } = require(resolve(modulePath));
const folder = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({
    headless: true,
    ...(process.env.STACK_DIAGRAM_BROWSER_CHANNEL ? { channel: process.env.STACK_DIAGRAM_BROWSER_CHANNEL } : {}),
    args: ["--font-render-hinting=none"],
});
try {
    const context = await browser.newContext({
        viewport: { width: 1540, height: 1450 },
        deviceScaleFactor: 2,
        serviceWorkers: "block",
    });
    const network = [];
    await context.route(/^https?:/, route => {
        network.push(route.request().url());
        return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(pathToFileURL(join(folder, "clearallergy-stack-overview.html")).href);
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: ".scroller,.canvas{border-radius:0!important}.scroller{border:none!important}" });

    for (const theme of ["light", "dark"]) {
        await page.evaluate(theme => {
            document.documentElement.toggleAttribute("data-theme", theme === "dark");
            if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
        }, theme);
        const geometry = await page.evaluate(() => {
            const canvas = document.querySelector(".canvas").getBoundingClientRect();
            const box = element => {
                const r = element.getBoundingClientRect();
                return { x: r.x - canvas.x, y: r.y - canvas.y, w: r.width, h: r.height };
            };
            const nodes = [...document.querySelectorAll(".node")];
            const groups = [...document.querySelectorAll(".group")].map(box);
            const inside = (a, b) => a.x >= b.x && a.y >= b.y && a.x+a.w <= b.x+b.w && a.y+a.h <= b.y+b.h;
            const labels = [...document.querySelectorAll(".name,.role,.g-label,svg text,.panel,.context")];
            const collisions = [];
            for (const path of document.querySelectorAll("svg.edges > path")) {
                const tokens = path.getAttribute("d").match(/[MHV]|-?\d+(?:\.\d+)?/g);
                let x = 0, y = 0;
                while (tokens.length) {
                    const command = tokens.shift();
                    if (command === "M") { x = Number(tokens.shift()); y = Number(tokens.shift()); continue; }
                    const endX = command === "H" ? Number(tokens.shift()) : x;
                    const endY = command === "V" ? Number(tokens.shift()) : y;
                    for (const label of labels) {
                        const r = box(label);
                        const hit = x === endX
                            ? x > r.x-2 && x < r.x+r.w+2 && Math.max(y,endY) > r.y-2 && Math.min(y,endY) < r.y+r.h+2
                            : y > r.y-2 && y < r.y+r.h+2 && Math.max(x,endX) > r.x-2 && Math.min(x,endX) < r.x+r.w+2;
                        if (hit) collisions.push(label.textContent.trim());
                    }
                    x = endX; y = endY;
                }
            }
            return {
                canvas: { width: canvas.width, height: canvas.height },
                nodes: nodes.length,
                images: document.images.length,
                brokenImages: [...document.images].filter(i => !i.complete || i.naturalWidth === 0).length,
                outsideGroup: nodes.filter(n => !groups.some(g => inside(box(n), g))).map(n => n.textContent.trim()),
                clipped: labels.filter(e => !inside(box(e), {x:0,y:0,w:canvas.width,h:canvas.height})).map(e => e.textContent.trim()),
                fonts: { geist: document.fonts.check('15px Geist'), mono: document.fonts.check('11px "JetBrains Mono"') },
                edgeTextCollisions: collisions,
            };
        });
        assert.equal(geometry.brokenImages, 0, "Every embedded logo must render.");
        assert.deepEqual(geometry.outsideGroup, [], "Nodes must stay inside their boundary.");
        assert.deepEqual(geometry.clipped, [], "Labels must stay inside the canvas.");
        assert(geometry.fonts.geist && geometry.fonts.mono, "Embedded fonts must load.");
        assert.deepEqual(geometry.edgeTextCollisions, [], "Arrows must avoid text.");
        const filename = `clearallergy-stack-overview${theme === "dark" ? "-dark" : ""}.png`;
        await page.locator(".canvas").screenshot({ path: join(folder, filename) });
        console.log(JSON.stringify({ theme, filename, ...geometry }));
    }
    // Exercise the static HTML's theme link, independently of export attributes.
    await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
    await page.locator('a[href="#dark"]').click();
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), "dark");
    await page.locator('a[href="#light"]').click();
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), "light");
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.locator(".scroller").evaluate(e => e.scrollWidth > e.clientWidth), "Mobile diagram must scroll.");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Page chrome must fit mobile.");
    assert.deepEqual(network, [], "Offline HTML must not request remote resources.");
    assert.deepEqual(errors, [], "No browser errors expected.");
    console.log(JSON.stringify({ offlineRequests: network.length, pageErrors: errors.length, themeLinks: "PASS", mobile: "PASS", browser: browser.version() }));
} finally {
    await browser.close();
}
