// Real UI components with fictional props. Save responses are simulated;
// no app, DB, Clerk or upload is used.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const { webpack } = require("next/dist/compiled/webpack/webpack");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const fixture = mkdtempSync(join(tmpdir(), "clearallergy-allergen-cards-"));
const output = process.env.CLEARALLERGY_BROWSER_OUTPUT || fixture;
mkdirSync(output, { recursive: true });
writeFileSync(join(fixture, "loader.cjs"), "const ts = require(" + JSON.stringify(require.resolve("typescript")) + "); module.exports = function(source) { return ts.transpileModule(source, {fileName:this.resourcePath, compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}}).outputText; };", "utf8");
// Routing/image adapters delimit this fixture; actual Next routing and uploads are not tested.
writeFileSync(join(fixture, "link.tsx"), "import React from 'react'; export default function Link({prefetch,children,...props}){return <a {...props}>{children}</a>}", "utf8");
writeFileSync(join(fixture, "image.tsx"), "import React from 'react'; export default function Image({fill,priority,...props}){return <img {...props}/>}", "utf8");
writeFileSync(join(fixture, "navigation.ts"), "const router={push:href=>location.assign(href),replace:href=>location.replace(href),refresh:()=>{}}; export function useRouter(){return router} export function useSearchParams(){return new URLSearchParams(location.search)}", "utf8");
const entry = [
    "import React from 'react'; import {createRoot} from 'react-dom/client';",
    "import ShopMenus from '@/features/public/shops/components/ShopMenuListClient'; import NewMenu from '@/features/admin/menus/components/NewMenuForm'; import EditMenu from '@/features/admin/menus/components/MenuEditClient'; import MenuList from '@/features/admin/menus/components/MenuListPageClient';",
    "import {ALLERGEN_MASTER} from '@/lib/constants/allergen-master'; import {getStoreContainsAllergenSlugs} from '@/lib/allergens'; import {saveUserAllergenPreferences} from '@/lib/public-allergen-preferences';",
    "const master=ALLERGEN_MASTER.map((a,i)=>({...a,sortOrder:i+1})); const statuses=Object.fromEntries(master.map(a=>[a.slug,'FREE']));",
    "const reviewedStatuses={...statuses,egg:'CONTAINS'}; const history=[{id:'fictional-review',foodVersion:1,evidenceRefs:'架空資料 test-v1（実食品ではない）',scope:'架空の全対象品目',checkedAt:'2026-10-08T00:00:00Z',recordedAt:'2026-10-09T00:00:00Z',unresolvedIssues:'',contentSnapshot:{name:'入力ガイド確認用',description:null,category:null,ingredients:null,precaution:null,imageUrl:null,allergens:master.map(a=>({slug:a.slug,nameJa:a.nameJa,status:reviewedStatuses[a.slug]}))}}];",
    "const links=overrides=>master.map(a=>({allergen:{slug:a.slug},status:overrides[a.slug]||'FREE'}));",
    "const note='乳：仕入れ品に、乳を扱う製造ラインについての注意表示があります。\\n小麦：小麦を使う料理と揚げ油を共用しています。';",
    "const target={id:'target',name:'ミックスプレート',description:null,category:'デザート',priceYen:880,precaution:note,updatedAt:'2026-10-09T00:00:00Z',allergenLinks:links({egg:'CONTAINS',wheat:'MAY_CONTAIN',milk:'MAY_CONTAIN',soybean:'CONTAINS'})};",
    "const source={...target,id:'source',name:'くるみを使う別メニュー',precaution:null,allergenLinks:links({walnut:'CONTAINS'})};",
    "function prefs(highlightSlugs=[],excludedSlugs=[],includeMayContain=false){saveUserAllergenPreferences({highlightSlugs,excludedSlugs,includeMayContain,selectedSlugs:[]})}",
    "function App(){const [published,setPublished]=React.useState(true);const [unknown,setUnknown]=React.useState(false);const [long,setLong]=React.useState(false);const current={...target,precaution:long?'小麦：'+ '長い注意書き'.repeat(250):note,allergenLinks:unknown?links({egg:'CONTAINS',milk:'UNKNOWN'}):target.allergenLinks};const menus=published?[current,source]:[current];",
    "if(location.pathname.startsWith('/new'))return <NewMenu allergens={master} readOnlyPreview={location.pathname==='/new'}/>;",
    "if(location.pathname==='/list-delete')return <MenuList totalAllergenCount={master.length} initialMenus={[{id:'fixture',name:'架空削除メニュー',category:null,priceYen:null,imageUrl:null,isPublished:false,version:5,updatedAt:'2026-10-09T00:00:00Z',unknownAllergenNames:[]}]}/>;",
    "if(location.pathname.startsWith('/edit'))return <EditMenu menuId='fixture' initialVersion={5} initialFoodVersion={1} initialReviewedFoodVersion={location.pathname==='/edit-save'?1:null} initialFoodReviews={location.pathname==='/edit-save'?history:[]} initialName='入力ガイド確認用' initialDescription={null} initialPriceYen={null} initialCategory={null} initialIngredients={null} initialPrecaution={null} initialImageUrl={null} initialImageFrame='wide' initialImageFit='contain' initialImagePosition='center' initialImageZoom={100} initialImagePositionX={50} initialImagePositionY={50} initialIsPublished={location.pathname==='/edit-save'} allergens={master} initialStatusBySlug={location.pathname==='/edit-save'?reviewedStatuses:statuses} readOnlyPreview={location.pathname==='/edit'}/>;",
    "return <><h1>架空データによるカード確認</h1><nav style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:16}}><button onClick={()=>prefs()}>設定を解除</button><button onClick={()=>prefs(['milk','walnut'])}>乳とくるみを注目</button><button onClick={()=>prefs([],['walnut'])}>くるみを除外</button><button onClick={()=>prefs([],['milk'])}>乳の可能性は残す</button><button onClick={()=>prefs([],['milk'],true)}>乳の可能性も除外</button><button onClick={()=>setPublished(v=>!v)}>補足元の公開を切替</button><button onClick={()=>setUnknown(v=>!v)}>未確認の入力を切替</button><button onClick={()=>setLong(v=>!v)}>長い注意書きを切替</button></nav><ShopMenus shopId='fixture' menus={menus} allergenMaster={master} storeHandledAllergenSlugs={[...getStoreContainsAllergenSlugs(menus,master)]}/></>}",
    "createRoot(document.getElementById('root')).render(<App/>);",
].join("\n");
writeFileSync(join(fixture, "entry.tsx"), entry, "utf8");
const compiler = webpack({ mode: "production", target: "web", entry: join(fixture, "entry.tsx"),
    output: { path: fixture, filename: "bundle.js" }, optimization: { minimize: false },
    module: { rules: [{ test: /\.tsx?$/, use: join(fixture, "loader.cjs") }] },
    plugins: [new webpack.DefinePlugin({ "process.env": JSON.stringify({ NODE_ENV: "production" }) })],
    resolve: { extensions: [".tsx", ".ts", ".js"], modules: [join(root, "node_modules")], alias: {
        "@": root, "next/link": join(fixture, "link.tsx"), "next/navigation": join(fixture, "navigation.ts"), "next/image": join(fixture, "image.tsx"),
    } },
});
await new Promise((resolveBuild, reject) => compiler.run((error, stats) => compiler.close(closeError => {
    if (error || closeError || stats?.hasErrors()) reject(error || closeError || new Error(stats.toString({ all: false, errors: true })));
    else resolveBuild();
})));
const chunks = join(root, ".next/static/chunks");
const css = readdirSync(chunks).filter(name => name.endsWith(".css")).map(name => readFileSync(join(chunks, name), "utf8")).join("\n");
const html = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body style="padding:16px"><main style="max-width:1000px;margin:auto"><div id="root"></div></main><script src="/bundle.js"></script></body></html>';
const assets = new Map([["/style.css", ["text/css", css]], ["/bundle.js", ["text/javascript", readFileSync(join(fixture, "bundle.js"))]]]);
assets.set("/image.svg", ["image/svg+xml", '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="green"/></svg>']);
const media = join(root, ".next/static/media");
for (const name of readdirSync(media)) if (name.endsWith(".woff2")) {
    for (const prefix of ["/media/", "/_next/static/media/"]) assets.set(prefix + name, ["font/woff2", readFileSync(join(media, name))]);
}
const server = createServer((request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const asset = assets.get(path) || (["/", "/new", "/new-save", "/edit", "/edit-save", "/list-delete"].includes(path) ? ["text/html", html] : null);
    response.writeHead(asset ? 200 : 404, { "Content-Type": asset?.[0] || "text/plain" });
    response.end(asset?.[1] || "Not found");
});
let browser;
let groups = 0;
const pass = message => { groups++; console.log("PASS: " + message); };
try {
    await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
    const base = "http://127.0.0.1:" + server.address().port;
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const writes = [];
    await context.route("**/*", route => {
        if (route.request().method() !== "GET") writes.push(route.request().method());
        return new URL(route.request().url()).origin === base ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.on("dialog", dialog => dialog.accept()); // Discard only this fixture's unsaved inputs.
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base);
    const card = page.locator('a[href="/shops/fixture/menus/target"]');
    await card.waitFor();
    const registered = card.getByRole("group", { name: "店舗が登録したアレルゲン", exact: true }).first();
    assert.match(await registered.innerText(), /含む\s+卵\s*（1品目）/);
    assert.match(await registered.innerText(), /含む可能性あり・要確認\s+小麦・乳\s*（2品目）/);
    assert.match(await card.innerText(), /確認対象：特定原材料（9品目）/);
    assert.match(await card.getByRole("group", { name: "その他のアレルゲン", exact: true }).innerText(), /含む\s+大豆\s*（1品目）/);
    assert.match(await card.getByRole("group", { name: "他の公開メニューの登録情報", exact: true }).innerText(), /くるみ：この店舗の別の公開メニュー/);
    assert.doesNotMatch(await registered.innerText(), /くるみ/);
    assert.match(await card.getByRole("group", { name: "店舗の注意書き", exact: true }).innerText(), /乳を扱う製造ライン.*\n小麦：/);
    pass("Names and counts remain scoped; manual uncertainty, automatic supplement and full note are separate");
    for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, width + "px overflow");
        if ([390, 1440].includes(width)) await page.locator("#public-menus").screenshot({ path: join(output, "allergen-cards-" + width + ".png") });
    }
    pass("320/390/768/1440px cards wrap names and full notes without horizontal overflow");
    await page.getByRole("button", { name: "補足元の公開を切替", exact: true }).click();
    assert.equal(await card.getByRole("group", { name: "他の公開メニューの登録情報", exact: true }).count(), 0);
    assert.match(await registered.innerText(), /小麦・乳\s*（2品目）/);
    await page.getByRole("button", { name: "補足元の公開を切替", exact: true }).click();
    await page.getByRole("button", { name: "乳とくるみを注目", exact: true }).click();
    assert.match(await card.innerText(), /確認対象：くるみ・乳/);
    assert.match(await registered.innerText(), /含む可能性あり・要確認\s+乳\s*（1品目）/);
    assert.equal(await card.getByRole("group", { name: "その他のアレルゲン", exact: true }).count(), 0);
    await page.getByRole("button", { name: "くるみを除外", exact: true }).click();
    assert.equal(await card.count(), 1);
    assert.match(await card.innerText(), /別の公開メニューに「含む」登録/);
    await page.getByRole("button", { name: "乳の可能性は残す", exact: true }).click();
    assert.match(await registered.innerText(), /含む可能性あり・要確認\s+乳/);
    await page.getByRole("button", { name: "乳の可能性も除外", exact: true }).click();
    assert.equal(await card.count(), 0);
    await page.getByRole("button", { name: "設定を解除", exact: true }).click();
    pass("Preferences preserve selected scope and MAY exclusion; hiding a source card does not remove its supplement");
    await page.getByRole("button", { name: "未確認の入力を切替", exact: true }).click();
    assert.match(await registered.innerText(), /未入力・未確認\s+乳\s*（1品目）/);
    await page.getByRole("button", { name: "長い注意書きを切替", exact: true }).click();
    assert.equal(await card.getByRole("group", { name: "店舗の注意書き", exact: true }).locator("p").innerText(), "小麦：" + "長い注意書き".repeat(250));
    await page.setViewportSize({ width: 320, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    pass("Mixed UNKNOWN remains named and a long note is not truncated or converted into a status");
    await page.getByRole("button", { name: "長い注意書きを切替", exact: true }).focus();
    await page.keyboard.press("Tab");
    assert.equal(await card.evaluate(element => element === document.activeElement), true);
    assert.equal(await card.evaluate(element => element.matches(":focus-visible")), true);
    assert.equal(await card.evaluate(element => {
        const style = getComputedStyle(element);
        return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
    }), true, "Card keyboard focus must be visible");
    for (const path of ["/new", "/edit"]) {
        await page.goto(base + path);
        const guide = page.getByRole("group", { name: "アレルゲン状態の入力ガイド", exact: true });
        await guide.waitFor();
        assert.match(await guide.innerText(), /工場・製造ライン.*共用器具・揚げ油/);
        assert.match(await guide.innerText(), /資料や確認が不足.*未設定/);
        const milk = page.getByRole("group", { name: "乳", exact: true });
        const review = page.getByRole("region", { name: "食品確認記録", exact: true });
        assert.match(await review.innerText(), /現行の食品内容の確認記録が必要/);
        await review.getByRole("checkbox", { name: "今回の提供内容と原資料を照合した記録を保存する", exact: true }).check();
        const evidence = review.getByLabel("根拠資料・製品識別・資料の版", { exact: true });
        const scope = review.getByLabel("確認した提供内容・バリエーション・構成品・対象アレルゲンの範囲", { exact: true });
        const checkedAt = review.getByLabel("食品根拠を確認した日時", { exact: true });
        for (const field of [evidence, scope, checkedAt]) assert.equal(await field.getAttribute("required"), "");
        await evidence.fill("架空仕様書 test-v1（実食品ではない）");
        await scope.fill("架空の別添・代替・全対象品目");
        await checkedAt.fill("2026-10-08T12:00");
        await review.getByLabel("未解決事項（残っている場合は公開できません）", { exact: true }).fill("架空の未解決事項");
        writeFileSync(join(output, path.slice(1) + "-review-diagnostic.html"), await page.content(), "utf8");
        await page.screenshot({ path: join(output, path.slice(1) + "-review-diagnostic.png"), fullPage: true });
        await evidence.focus();
        await page.keyboard.press("Tab");
        assert.equal(await scope.evaluate(element => element === document.activeElement && element.matches(":focus-visible")), true);
        const original = path === "/new" ? "未設定" : "原材料に含まない登録";
        const noteField = page.getByLabel("注意書き", { exact: true });
        const helpId = await noteField.getAttribute("aria-describedby");
        assert.ok(helpId);
        assert.match(await page.locator("#" + helpId).innerText(), /注意書きだけでは品目別の状態は変わりません/);
        await noteField.focus();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
        assert.equal(await noteField.evaluate(element => element === document.activeElement && element.matches(":focus-visible")), true);
        await noteField.fill("乳：仕入れ品の製造工場に関する注意表示があります。");
        assert.equal(await milk.getByRole("button", { name: original, exact: true }).getAttribute("aria-pressed"), "true");
        await milk.getByRole("button", { name: "含む可能性あり・要確認", exact: true }).click();
        assert.equal(await milk.getByRole("button", { name: "含む可能性あり・要確認", exact: true }).getAttribute("aria-pressed"), "true");
        for (const width of [320, 390, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, path + " at " + width);
            if (width === 390) await review.screenshot({ path: join(output, path.slice(1) + "-food-review-mobile.png") });
        }
        await guide.screenshot({ path: join(output, path.slice(1) + "-allergen-guide.png") });
        await review.screenshot({ path: join(output, path.slice(1) + "-food-review.png") });
    }
    assert.deepEqual(writes, []);
    let conflict = true;
    let disconnectSave = false;
    const saves = [];
    await page.route("**/api/admin/menus/fixture", async route => {
        assert.equal(route.request().method(), "PUT");
        saves.push(route.request().postDataJSON());
        if (disconnectSave) return route.abort("failed");
        await route.fulfill({ status: conflict ? 409 : 200, contentType: "application/json", body: JSON.stringify(conflict ? { error: "別の変更が保存されています。" } : {
            menu: { id: "fixture", version: 6, foodVersion: 1, reviewedFoodVersion: 1, imageUrl: null, isPublished: true, foodReviews: [] }, publicRefreshPending: true,
        }) });
    });
    await page.goto(base + "/edit-save");
    await page.getByText("保存済みの確認記録（直近5件）", { exact: true }).click();
    await page.getByText("この記録に対応する食品内容", { exact: true }).click();
    assert.equal(await page.getByText("卵：含む", { exact: true }).count(), 1);
    assert.match(await page.getByRole("region", { name: "食品確認記録", exact: true }).innerText(), /架空資料 test-v1/);
    const price = page.getByLabel("価格（税込・円）", { exact: true });
    await price.fill("1234");
    await page.getByRole("button", { name: "保存する", exact: true }).click();
    await page.getByRole("alert").waitFor();
    assert.equal(await price.inputValue(), "1234");
    assert.equal(saves[0].expectedVersion, 5);
    assert.equal(saves[0].isPublished, true, "Price-only changes preserve the current confirmation");
    assert.equal(await page.getByRole("link", { name: "最新内容を別タブで確認する", exact: true }).getAttribute("target"), "_blank");
    conflict = false;
    await page.getByRole("button", { name: "保存する", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "公開表示の更新処理" }).waitFor();
    assert.equal(await price.inputValue(), "1234");
    assert.equal(saves[1].expectedVersion, 5, "409 must not silently rebase the stale form");
    assert.equal(await page.getByRole("alert").count(), 0);
    pass("Review history retains CONTAINS; editable UI preserves conflicting inputs/version and separates saved/cache-pending; responses are simulated");
    disconnectSave = true;
    await price.fill("1240");
    await page.getByRole("button", { name: "保存する", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "保存結果を確認できません" }).waitFor();
    assert.equal(await price.inputValue(), "1240");
    assert.equal(saves[2].expectedVersion, 6);
    await page.unroute("**/api/admin/menus/fixture");
    const malformedSaves = [
        { foodReviews: [null] }, { foodReviews: [{ foodVersion: 1 }] }, { foodVersion: null },
        { reviewedFoodVersion: 99 }, { version: -1 }, { imageUrl: {} },
    ];
    for (const broken of malformedSaves) {
        await page.route("**/api/admin/menus/fixture", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
            menu: { id: "fixture", version: 6, foodVersion: 1, reviewedFoodVersion: 1, imageUrl: null, isPublished: true, foodReviews: [], ...broken },
        }) }));
        await page.goto(base + "/edit-save");
        await page.getByLabel("価格（税込・円）", { exact: true }).fill("1260");
        await page.getByRole("button", { name: "保存する", exact: true }).click();
        await page.getByRole("alert").filter({ hasText: "保存結果を確認できません" }).waitFor();
        assert.equal(await page.getByLabel("価格（税込・円）", { exact: true }).inputValue(), "1260");
        assert.equal(await page.getByRole("status").filter({ hasText: "保存しました。" }).count(), 0);
        await page.unroute("**/api/admin/menus/fixture");
    }
    pass("Malformed review rows, versions and image fields cannot replace input or mark it saved; simulated success responses");

    for (const id of [null, {}, "", "../bad", 123]) {
        await page.route("**/api/admin/menus", route => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id }) }));
        await page.goto(base + "/new-save");
        const name = page.getByLabel("メニュー名", { exact: true });
        await name.fill("架空の結果不明メニュー");
        await page.getByRole("button", { name: "この内容で登録する", exact: true }).click();
        await page.getByRole("alert").filter({ hasText: "作成結果を確認できません" }).waitFor();
        assert.equal(await name.inputValue(), "架空の結果不明メニュー");
        assert.equal(page.url(), base + "/new-save");
        await page.unroute("**/api/admin/menus");
    }
    let releaseCreate;
    let creationStarted;
    const pending = new Promise(resolvePending => { releaseCreate = resolvePending; });
    const started = new Promise(resolveStarted => { creationStarted = resolveStarted; });
    await page.route("**/api/admin/menus", async route => {
        creationStarted(); await pending; await route.abort("failed");
    });
    await page.goto(base + "/new-save");
    await page.getByLabel("メニュー名", { exact: true }).fill("架空の送信中メニュー");
    await page.getByLabel("画像URL", { exact: true }).fill(base + "/image.svg");
    await page.getByRole("button", { name: /^詳細調整/ }).click();
    const zoom = page.getByRole("slider", { name: /^ズーム/ });
    const preview = page.getByAltText("メニュー画像プレビュー", { exact: true }).first();
    const viewport = preview.locator("..");
    await viewport.dispatchEvent("wheel", { deltaY: -120 });
    await page.waitForFunction(() => document.querySelector('input[type="range"]')?.value === "105");
    await page.getByRole("button", { name: "この内容で登録する", exact: true }).click();
    await started;
    assert.equal(await zoom.isDisabled(), true);
    await viewport.dispatchEvent("wheel", { deltaY: -120 });
    await viewport.dispatchEvent("dblclick");
    await page.waitForTimeout(50);
    assert.equal(await zoom.inputValue(), "105", "Custom image gestures must not change the submitted draft");
    releaseCreate();
    await page.getByRole("alert").filter({ hasText: "作成結果を確認できません" }).waitFor();
    assert.equal(await zoom.inputValue(), "105");
    await page.unroute("**/api/admin/menus");
    pass("Malformed creation IDs retain drafts; delayed creation freezes custom image gestures and lost response retains input");
    let deleteMode = "malformed";
    const deletions = [];
    await page.route("**/api/admin/menus/fixture", async route => {
        assert.equal(route.request().method(), "DELETE");
        deletions.push(route.request().postDataJSON());
        if (deleteMode === "disconnect") return route.abort("failed");
        await route.fulfill({ status: 200, contentType: "application/json", body: deleteMode === "malformed" ? "not-json" : '{"ok":true,"publicRefreshPending":true}' });
    });
    await page.goto(base + "/list-delete");
    const remove = page.getByRole("button", { name: "架空削除メニューを削除", exact: true });
    for (const mode of ["malformed", "disconnect"]) {
        deleteMode = mode;
        await remove.click();
        await page.getByRole("alert").filter({ hasText: "削除結果を確認できません" }).waitFor();
        assert.equal(await remove.count(), 1, "Unknown deletion result must retain the local row for verification");
    }
    deleteMode = "saved";
    await remove.click();
    await remove.waitFor({ state: "detached" });
    await page.getByRole("alert").filter({ hasText: "削除は保存されました" }).waitFor();
    assert.ok(deletions.every(body => body.expectedVersion === 5));
    pass("Network-lost save retains input; malformed/network-lost delete requests current-state verification; confirmed delete separates cache pending; simulated responses only");
    assert.deepEqual(errors, []);
    pass("Real new/edit forms show the guide and associated help; note text never changes state; cards and note fields support keyboard focus");
    pass("Food review evidence/scope/time inputs are labelled and required; unresolved issues and keyboard/mobile layout remain visible");
    console.log("PASS: " + groups + " allergen UI groups passed. Real components with fictional props; DB/auth/save/Next routing are unverified.");
} finally {
    if (browser) await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
