// Real UI components with fictional props. No app, DB, Clerk, upload or save requests.
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
writeFileSync(join(fixture, "navigation.ts"), "const router={push:href=>location.assign(href),replace:href=>location.replace(href)}; export function useRouter(){return router} export function useSearchParams(){return new URLSearchParams(location.search)}", "utf8");
const entry = [
    "import React from 'react'; import {createRoot} from 'react-dom/client';",
    "import ShopMenus from '@/features/public/shops/components/ShopMenuListClient'; import NewMenu from '@/features/admin/menus/components/NewMenuForm'; import EditMenu from '@/features/admin/menus/components/MenuEditClient';",
    "import {ALLERGEN_MASTER} from '@/lib/constants/allergen-master'; import {getStoreContainsAllergenSlugs} from '@/lib/allergens'; import {saveUserAllergenPreferences} from '@/lib/public-allergen-preferences';",
    "const master=ALLERGEN_MASTER.map((a,i)=>({...a,sortOrder:i+1})); const statuses=Object.fromEntries(master.map(a=>[a.slug,'FREE']));",
    "const links=overrides=>master.map(a=>({allergen:{slug:a.slug},status:overrides[a.slug]||'FREE'}));",
    "const note='乳：仕入れ品に、乳を扱う製造ラインについての注意表示があります。\\n小麦：小麦を使う料理と揚げ油を共用しています。';",
    "const target={id:'target',name:'ミックスプレート',description:null,category:'デザート',priceYen:880,precaution:note,updatedAt:'2026-10-09T00:00:00Z',allergenLinks:links({egg:'CONTAINS',wheat:'MAY_CONTAIN',milk:'MAY_CONTAIN',soybean:'CONTAINS'})};",
    "const source={...target,id:'source',name:'くるみを使う別メニュー',precaution:null,allergenLinks:links({walnut:'CONTAINS'})};",
    "function prefs(highlightSlugs=[],excludedSlugs=[],includeMayContain=false){saveUserAllergenPreferences({highlightSlugs,excludedSlugs,includeMayContain,selectedSlugs:[]})}",
    "function App(){const [published,setPublished]=React.useState(true);const [unknown,setUnknown]=React.useState(false);const [long,setLong]=React.useState(false);const current={...target,precaution:long?'小麦：'+ '長い注意書き'.repeat(250):note,allergenLinks:unknown?links({egg:'CONTAINS',milk:'UNKNOWN'}):target.allergenLinks};const menus=published?[current,source]:[current];",
    "if(location.pathname==='/new')return <NewMenu allergens={master} readOnlyPreview/>;",
    "if(location.pathname==='/edit')return <EditMenu menuId='fixture' initialName='入力ガイド確認用' initialDescription={null} initialPriceYen={null} initialCategory={null} initialIngredients={null} initialPrecaution={null} initialImageUrl={null} initialImageFrame='wide' initialImageFit='contain' initialImagePosition='center' initialImageZoom={100} initialImagePositionX={50} initialImagePositionY={50} initialIsPublished={false} allergens={master} initialStatusBySlug={statuses} readOnlyPreview/>;",
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
const media = join(root, ".next/static/media");
for (const name of readdirSync(media)) if (name.endsWith(".woff2")) {
    for (const prefix of ["/media/", "/_next/static/media/"]) assets.set(prefix + name, ["font/woff2", readFileSync(join(media, name))]);
}
const server = createServer((request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const asset = assets.get(path) || (["/", "/new", "/edit"].includes(path) ? ["text/html", html] : null);
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
        }
        await guide.screenshot({ path: join(output, path.slice(1) + "-allergen-guide.png") });
    }
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    pass("Real new/edit forms show the guide and associated help; note text never changes state; cards and note fields support keyboard focus");
    console.log("PASS: " + groups + " allergen UI groups passed. Real components with fictional props; DB/auth/save/Next routing are unverified.");
} finally {
    if (browser) await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
