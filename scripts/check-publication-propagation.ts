import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertCiDatabaseTarget } from "./ci-environment";
import { publishReviewedFixture } from "./food-review-fixture";

// Loopback production app + guarded fictional CI DB only. No Clerk/Blob.
async function main() {
    assertCiDatabaseTarget();
    const base = new URL(process.env.CLEARALLERGY_BROWSER_BASE_URL ?? "http://127.0.0.1:3102");
    assert.ok(base.protocol === "http:" && ["127.0.0.1", "localhost"].includes(base.hostname));
    const db = new PrismaClient();
    const run = randomUUID();
    const name = `【架空】公開反映検査-${run}`;
    const output = resolve(process.env.CLEARALLERGY_BROWSER_OUTPUT ?? ".local/publication-propagation");
    mkdirSync(output, { recursive: true });
    let shopId: string | undefined;
    try {
        const master = await db.allergen.findMany();
        const shop = await db.shop.create({ data: { name, isActive: true } });
        shopId = shop.id;
        const create = (title: string, contains: boolean) => db.$transaction(async tx => {
            const menu = await tx.menuItem.create({ data: { shopId: shop.id, name: title, allergenLinks: { create: master.map(a => ({ allergenId: a.id, status: contains && a.slug === "egg" ? "CONTAINS" : "FREE" })) } } });
            return publishReviewedFixture(tx, menu.id);
        });
        const source = await create(`【架空】補足元-${run}`, true);
        const target = await create(`【架空】対象-${run}`, false);
        const read = async (path: string) => {
            const response = await fetch(new URL(path, base), { cache: "no-store" });
            return { status: response.status, cache: response.headers.get("x-nextjs-cache"), text: await response.text() };
        };
        const sourcePath = `/shops/${shop.id}/menus/${source.id}`;
        const shopPath = `/shops/${shop.id}`;
        const targetPath = `/api/menus/${target.id}`;
        const initialSource = await read(sourcePath);
        const initialShop = await read(shopPath);
        assert.equal(initialSource.status, 200);
        assert.ok(initialShop.text.includes(source.name));
        assert.equal(JSON.parse((await read(targetPath)).text).menu.allergenDisplayItems.find((a: { slug: string }) => a.slug === "egg").effectiveRisk, "STORE_HANDLED");
        const initialList = await read("/shops");
        await db.menuFoodReview.create({ data: {
            menuItemId: source.id, foodVersion: source.foodVersion, contentSnapshot: {},
            evidenceRefs: "架空の再確認資料", scope: "架空の全品目", checkedAt: new Date(),
            actorUserId: "synthetic-fixture", unresolvedIssues: "架空の仕入れ仕様が未解決",
        } });
        const afterUnresolvedApi = await read(`/api/menus/${source.id}`);
        const afterUnresolvedPage = await read(sourcePath);
        assert.equal(afterUnresolvedApi.status, 404);
        assert.equal(afterUnresolvedPage.text.includes(source.name), false);
        assert.equal(JSON.parse((await read(targetPath)).text).menu.allergenDisplayItems.find((a: { slug: string }) => a.slug === "egg").effectiveRisk, "FREE");
        await db.$transaction(tx => publishReviewedFixture(tx, source.id));
        assert.equal((await read(`/api/menus/${source.id}`)).status, 200);
        await db.menuItem.update({ where: { id: source.id, shopId: shop.id }, data: { ingredients: "架空の食品変更（未再確認）" } });
        const afterSourceApi = await read(`/api/menus/${source.id}`);
        const afterSourcePage = await read(sourcePath);
        const afterShopPage = await read(shopPath);
        const afterTargetApi = JSON.parse((await read(targetPath)).text);
        assert.equal(afterSourceApi.status, 404);
        assert.equal(afterTargetApi.menu.allergenDisplayItems.find((a: { slug: string }) => a.slug === "egg").effectiveRisk, "FREE");
        await db.menuItem.update({ where: { id: target.id, shopId: shop.id }, data: { isPublished: false } });
        const afterList = await read("/shops");
        const result = {
            sourceApiAfterUnresolvedReview: afterUnresolvedApi.status,
            sourcePageStillContainsUnresolvedSource: afterUnresolvedPage.text.includes(source.name),
            sourceApiAfterChange: afterSourceApi.status,
            sourcePageAfterChange: afterSourcePage.status,
            sourcePageCache: afterSourcePage.cache,
            sourcePageStillContainsStoppedSource: afterSourcePage.text.includes(source.name),
            sourcePageShowsNotFound: afterSourcePage.text.includes("ページが見つかりません"),
            sourcePageHasNoindex: /<meta\s+name="robots"\s+content="noindex"\s*\/?\s*>/.test(afterSourcePage.text),
            shopResponseStillContainsStoppedSource: afterShopPage.text.includes(source.name),
            initialListContainsProbeShop: initialList.text.includes(name),
            listResponseContainsShopAfterAllStopped: afterList.text.includes(name),
            supplementDisappearsAfterSourceStops: true,
            alreadyOpenView: "UNVERIFIED - no automatic client refresh asserted",
            browserStoppedView: "UNVERIFIED - optional isolated Playwright not provided",
        };
        // loading.tsx can begin streaming before the DB check finishes. In that
        // case Next retains HTTP 200, renders not-found and injects noindex.
        assert.ok([200, 404].includes(afterSourcePage.status));
        assert.equal(result.sourcePageStillContainsStoppedSource, false, "A new page request must not serve stopped food content");
        assert.equal(result.sourcePageShowsNotFound, true);
        assert.equal(result.sourcePageHasNoindex, true);
        if (process.env.PLAYWRIGHT_MODULE_PATH) {
            const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH);
            const browser = await chromium.launch({ headless: true });
            try {
                const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
                await page.route("**/*", (route: { request(): { url(): string }; continue(): Promise<void>; abort(): Promise<void> }) => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
                await page.goto(new URL(sourcePath, base).href);
                await page.getByRole("heading", { name: "ページが見つかりません", exact: true }).waitFor();
                assert.equal((await page.locator("body").innerText()).includes(source.name), false);
                await page.screenshot({ path: resolve(output, "stopped-menu.png"), fullPage: true });
                result.browserStoppedView = "PASS - fresh navigation renders not-found without stopped food content";
            } finally { await browser.close(); }
        }
        writeFileSync(resolve(output, "propagation.json"), JSON.stringify(result, null, 2), "utf8");
        console.log(JSON.stringify(result));
        assert.equal(result.shopResponseStillContainsStoppedSource, false);
        assert.equal(result.initialListContainsProbeShop, true);
        assert.equal(result.listResponseContainsShopAfterAllStopped, false);
        console.log("PASS: warm public pages/API reflect food invalidation and stop on new requests without revalidatePath; no claim for already-open/offline views");
    } finally {
        if (shopId) await db.shop.delete({ where: { id: shopId, name } });
        await db.$disconnect();
    }
}
main().catch(error => { console.error(error instanceof assert.AssertionError ? error.message : "Publication propagation check failed; raw DB errors are not logged."); process.exitCode = 1; });
