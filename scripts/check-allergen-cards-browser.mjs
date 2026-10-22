// Real UI components with fictional props. Save responses are simulated;
// no app, DB, Clerk or upload is used.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
    "import {toAdminMenuListRow} from '@/features/admin/menus/server/menu-list-data';",
    "import Detail from '@/features/public/shops/components/PublicMenuDetailBodyClient'; import Prefs from '@/features/public/shops/components/UserAllergenPreferenceClient'; import {buildAllergenRows,buildAllergenDisplayItems} from '@/lib/allergens';",
    "const master=ALLERGEN_MASTER.map((a,i)=>({...a,sortOrder:i+1})); const statuses=Object.fromEntries(master.map(a=>[a.slug,'FREE']));",
    "const reviewedStatuses={...statuses,egg:'CONTAINS'}; const history=[{id:'fictional-review',foodVersion:1,evidenceRefs:'架空資料 test-v1（実食品ではない）',scope:'架空の全対象品目',checkedAt:'2026-10-08T00:00:00Z',recordedAt:'2026-10-09T00:00:00Z',unresolvedIssues:'',contentSnapshot:{name:'入力ガイド確認用',description:null,category:null,ingredients:null,precaution:null,imageUrl:null,allergens:master.map(a=>({slug:a.slug,nameJa:a.nameJa,status:reviewedStatuses[a.slug]}))}}];",
    "const links=overrides=>master.map(a=>({allergen:{slug:a.slug},status:overrides[a.slug]||'FREE'}));",
    "const note='乳：仕入れ品に、乳を扱う製造ラインについての注意表示があります。\\n小麦：小麦を使う料理と揚げ油を共用しています。';",
    "const target={id:'target',name:'ミックスプレート',description:null,category:'デザート',priceYen:880,precaution:note,updatedAt:'2026-10-09T00:00:00Z',allergenLinks:links({egg:'CONTAINS',wheat:'MAY_CONTAIN',milk:'MAY_CONTAIN',soybean:'CONTAINS'})};",
    "const source={...target,id:'source',name:'くるみを使う別メニュー',precaution:null,allergenLinks:links({walnut:'CONTAINS'})};",
    "const listBase={category:'架空検証',priceYen:null,imageUrl:null,isPublished:false,version:5,updatedAt:new Date('2026-10-15T00:00:00Z'),foodVersion:2,reviewedFoodVersion:null,publicationConfirmedFoodVersion:null,allergenLinks:links({}),foodReviews:[]}; const listRows=[{id:'unknown',name:'架空・品目未設定',allergenLinks:links({milk:'UNKNOWN'})},{id:'current',name:'架空・現行確認で公開中',isPublished:true,reviewedFoodVersion:2,publicationConfirmedFoodVersion:2,foodReviews:[{foodVersion:2,unresolvedIssues:null}]},{id:'old',name:'架空・材料更新で旧確認',foodReviews:[{foodVersion:1,unresolvedIssues:null}]},{id:'unresolved',name:'架空・最新記録が未解決',foodReviews:[{foodVersion:2,unresolvedIssues:'非公開の架空仕入れメモ'}]},{id:'missing',name:'架空・確認記録なし'},{id:'stopped',name:'架空・通常の公開停止',reviewedFoodVersion:2,publicationConfirmedFoodVersion:2,foodReviews:[{foodVersion:2,unresolvedIssues:null}]}].map(row=>toAdminMenuListRow({...listBase,...row},master));",
    "function prefs(highlightSlugs=[],excludedSlugs=[],includeMayContain=false){saveUserAllergenPreferences({highlightSlugs,excludedSlugs,includeMayContain,selectedSlugs:[]})}",
    "function App(){const [published,setPublished]=React.useState(true);const [unknown,setUnknown]=React.useState(false);const [long,setLong]=React.useState(false);const current={...target,precaution:long?'小麦：'+ '長い注意書き'.repeat(250):note,allergenLinks:unknown?links({egg:'CONTAINS',milk:'UNKNOWN'}):target.allergenLinks};const menus=published?[current,source]:[current];",
    "if(location.pathname==='/shops/fixture/menus/target')return <Detail shopId='fixture' shopName='架空検証店' menuName={current.name} description={null} category={current.category} priceText='880円' updatedAtText='架空検証時刻' safeImageUrl={null} imageFrame='wide' imageFit='contain' imagePosition='center' imageZoom={100} imagePositionX={50} imagePositionY={50} ingredients='架空の原材料' precaution={note} allergensForClient={master} statusBySlugForClient={Object.fromEntries(current.allergenLinks.map(link=>[link.allergen.slug,link.status]))} rows={buildAllergenDisplayItems(buildAllergenRows(master,current.allergenLinks),getStoreContainsAllergenSlugs(menus,master))} storeHandledAllergenSlugs={[...getStoreContainsAllergenSlugs(menus,master)]}/>;",
    "if(location.pathname.startsWith('/new'))return <NewMenu allergens={master} readOnlyPreview={location.pathname==='/new'}/>;",
    "if(location.pathname==='/list-delete')return <MenuList totalAllergenCount={master.length} initialMenus={[{id:'fixture',name:'架空削除メニュー',category:null,priceYen:null,imageUrl:null,isPublished:false,version:5,updatedAt:'2026-10-09T00:00:00Z',unknownAllergenNames:[],foodReviewState:'current'}]}/>;",
    "if(location.pathname==='/list-stop')return <MenuList totalAllergenCount={master.length} initialMenus={[{...listRows[0],id:'fixture',name:'架空停止メニュー',isPublished:true,version:5}]}/>;",
    "if(location.pathname.startsWith('/review-queue'))return <MenuList totalAllergenCount={master.length} initialMenus={location.pathname==='/review-queue-empty'?[]:listRows} readOnly={location.pathname==='/review-queue-demo'} readOnlyEditHrefBase={location.pathname==='/review-queue-demo'?'/admin/demo/menus':undefined}/>;",
    "if(location.pathname.startsWith('/edit'))return <EditMenu menuId='fixture' initialVersion={5} initialFoodVersion={1} initialReviewedFoodVersion={location.pathname==='/edit-save'?1:null} initialPublicationConfirmedFoodVersion={location.pathname==='/edit-save'?1:null} initialFoodReviews={location.pathname==='/edit-save'?history:[]} initialName='入力ガイド確認用' initialDescription={null} initialPriceYen={null} initialCategory={null} initialIngredients={null} initialPrecaution={null} initialImageUrl={null} initialImageFrame='wide' initialImageFit='contain' initialImagePosition='center' initialImageZoom={100} initialImagePositionX={50} initialImagePositionY={50} initialIsPublished={location.pathname==='/edit-save'} allergens={master} initialStatusBySlug={location.pathname==='/edit-save'?reviewedStatuses:statuses} readOnlyPreview={location.pathname==='/edit'}/>;",
    "return <><h1>架空データによるカード確認</h1><nav style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:16}}><button onClick={()=>prefs()}>設定を解除</button><button onClick={()=>prefs(['milk','walnut'])}>乳とくるみを注目</button><button onClick={()=>prefs([],['walnut'])}>くるみを除外</button><button onClick={()=>prefs([],['milk'])}>乳の可能性は残す</button><button onClick={()=>prefs([],['milk'],true)}>乳の可能性も除外</button><button onClick={()=>setPublished(v=>!v)}>補足元の公開を切替</button><button onClick={()=>setUnknown(v=>!v)}>未確認の入力を切替</button><button onClick={()=>setLong(v=>!v)}>長い注意書きを切替</button></nav><Prefs allergens={master}/><ShopMenus shopId='fixture' menus={menus} allergenMaster={master} storeHandledAllergenSlugs={[...getStoreContainsAllergenSlugs(menus,master)]}/></>}",
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
const cssFiles = ["chunks", "css"].flatMap(directory => {
    const path = join(root, ".next/static", directory);
    return existsSync(path) ? readdirSync(path).filter(name => name.endsWith(".css")).map(name => join(path, name)) : [];
});
assert.ok(cssFiles.length > 0, "Build the application CSS before running this fixture");
const css = cssFiles.map(path => readFileSync(path, "utf8")).join("\n");
const html = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body style="padding:16px"><main style="max-width:1000px;margin:auto"><div id="root"></div></main><script src="/bundle.js"></script></body></html>';
const assets = new Map([["/style.css", ["text/css", css]], ["/bundle.js", ["text/javascript", readFileSync(join(fixture, "bundle.js"))]]]);
// An optional cache of the current layout's public icon CSS/font keeps browser
// requests on loopback. It is a fixture asset, never an app dependency.
if (existsSync(join(output, "material-symbols.css")) && existsSync(join(output, "material-symbols.woff2"))) {
    assets.set("/style.css", ["text/css", css + "\n" + readFileSync(join(output, "material-symbols.css"), "utf8")]);
    assets.set("/material-symbols.woff2", ["font/woff2", readFileSync(join(output, "material-symbols.woff2"))]);
} else {
    console.log("UNVERIFIED: icon-font rendering without a local cache of the current layout stylesheet and font.");
}
assets.set("/image.svg", ["image/svg+xml", '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="green"/></svg>']);
const media = join(root, ".next/static/media");
for (const name of readdirSync(media)) if (name.endsWith(".woff2")) {
    for (const prefix of ["/media/", "/_next/static/media/"]) assets.set(prefix + name, ["font/woff2", readFileSync(join(media, name))]);
}
const server = createServer((request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const asset = assets.get(path) || (["/", "/shops/fixture/menus/target", "/new", "/new-save", "/edit", "/edit-save", "/list-delete", "/list-stop", "/review-queue", "/review-queue-demo", "/review-queue-empty"].includes(path) ? ["text/html", html] : null);
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
    assert.equal(await card.getByRole("group", { name: "他の公開メニューの登録情報", exact: true }).count(), 0);
    assert.match(await page.getByRole("region", { name: "店舗全体の登録情報", exact: true }).innerText(), /くるみ/);
    assert.equal(await page.getByRole("region", { name: "店舗全体の登録情報", exact: true }).count(), 1);
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
    assert.match(await page.getByRole("region", { name: "店舗全体の登録情報", exact: true }).innerText(), /くるみ/);
    await page.getByRole("button", { name: "乳の可能性は残す", exact: true }).click();
    assert.match(await registered.innerText(), /含む可能性あり・要確認\s+乳/);
    await page.getByRole("button", { name: "乳の可能性も除外", exact: true }).click();
    assert.equal(await card.count(), 0);
    await page.getByRole("button", { name: "設定を解除", exact: true }).click();
    pass("Preferences preserve selected scope and MAY exclusion; hiding a source card does not remove its supplement");
    const panel = page.getByRole("region", { name: "あなた向けのアレルゲン設定", exact: true });
    await panel.getByRole("button", { name: /あなた向けのアレルゲン設定/ }).click();
    await panel.getByLabel("くるみの表示設定", { exact: true }).selectOption("highlight");
    await panel.getByLabel("乳の表示設定", { exact: true }).selectOption("highlight");
    const possibility = panel.getByRole("checkbox", { name: /含む可能性があるものを除外・強調/ });
    assert.equal(await possibility.isChecked(), false);
    await panel.getByRole("button", { name: "変更を適用", exact: true }).click();
    assert.equal(await card.getByRole("region", { name: "注目設定に一致", exact: true }).count(), 0);
    assert.match(await registered.innerText(), /含む可能性あり・要確認\s+乳/);
    await panel.getByRole("button", { name: /あなた向けのアレルゲン設定/ }).click();
    await possibility.focus(); await page.keyboard.press("Space");
    assert.equal(await possibility.isChecked(), true);
    assert.equal(await card.getByRole("region", { name: "注目設定に一致", exact: true }).count(), 0, "Draft toggle must not change the list before Apply");
    await panel.getByRole("button", { name: "変更を適用", exact: true }).click();
    const highlight = card.getByRole("region", { name: "注目設定に一致", exact: true });
    assert.match(await highlight.innerText(), /くるみ（別メニューに含む）/);
    assert.match(await highlight.innerText(), /乳（含む可能性あり・要確認）/);
    assert.match(await registered.innerText(), /含む可能性あり・要確認\s+乳\s*（1品目）/);
    assert.match(await card.getByRole("group", { name: "他の公開メニューの登録情報", exact: true }).innerText(), /別メニューに含む/);
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await card.screenshot({ path: join(output, `possibility-highlight-${width}.png`) });
    }
    await page.reload(); await card.waitFor();
    assert.match(await highlight.innerText(), /くるみ（別メニューに含む）/);
    pass("Unified toggle applies independent highlights only after Apply, persists on reload, and leaves registered MAY visible OFF");
    await panel.getByRole("button", { name: /あなた向けのアレルゲン設定/ }).click();
    await panel.getByLabel("くるみの表示設定", { exact: true }).selectOption("exclude");
    await panel.getByRole("button", { name: "変更を適用", exact: true }).click();
    assert.equal(await card.count(), 0);
    await page.getByRole("button", { name: "補足元の公開を切替", exact: true }).click();
    await card.waitFor();
    assert.doesNotMatch(await page.getByRole("region", { name: "店舗全体の登録情報", exact: true }).innerText(), /くるみ/);
    assert.doesNotMatch(await card.innerText(), /別メニューに含む/);
    pass("Other-public-menu exclusion uses the source before filters and disappears when that source is no longer public");
    await page.goto(base + "/shops/fixture/menus/target");
    await page.getByRole("heading", { name: "ミックスプレート", exact: true }).waitFor();
    assert.match(await page.getByRole("region", { name: "一覧の除外設定に一致", exact: true }).innerText(), /くるみ（別メニューに含む）/);
    assert.match(await page.getByRole("region", { name: "注目設定に一致", exact: true }).innerText(), /乳（含む可能性あり・要確認）/);
    assert.equal(await page.getByRole("heading", { name: "含む可能性あり・要確認", exact: true }).count(), 1);
    assert.match(await page.locator("body").innerText(), /くるみ：原材料に含まない/);
    assert.equal(await page.getByRole("heading", { name: "別メニューに含む", exact: true }).count(), 1);
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: join(output, `possibility-direct-detail-${width}.png`) });
    }
    await page.goto(base); await card.count();
    await page.getByRole("button", { name: "設定を解除", exact: true }).click(); await card.waitFor();
    pass("Direct menu URLs explain exclusion while retaining raw FREE, registered MAY and separate public-menu facts");
    await page.getByRole("button", { name: "未確認の入力を切替", exact: true }).click();
    assert.match(await registered.innerText(), /未入力・未確認\s+乳\s*（1品目）/);
    await page.getByRole("button", { name: "長い注意書きを切替", exact: true }).click();
    assert.equal(await card.getByRole("group", { name: "店舗の注意書き", exact: true }).locator("p").innerText(), "小麦：" + "長い注意書き".repeat(250));
    await page.setViewportSize({ width: 320, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    pass("Mixed UNKNOWN remains named and a long note is not truncated or converted into a status");
    await page.getByRole("button", { name: "長い注意書きを切替", exact: true }).focus();
    await page.keyboard.press("Tab");
    assert.equal(await panel.getByRole("button", { name: /あなた向けのアレルゲン設定/ }).evaluate(element => element === document.activeElement), true);
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
        assert.equal(await page.getByLabel("根拠資料・製品識別・資料の版", { exact: true }).count(), 0);
        if (path === "/edit") assert.match(await page.getByRole("region", { name: "保存後の予定", exact: true }).innerText(), /公開操作/);
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
            if (width === 390) await page.screenshot({ path: join(output, path.slice(1) + "-no-review-form-mobile.png") });
        }
        await guide.screenshot({ path: join(output, path.slice(1) + "-allergen-guide.png") });
        await page.screenshot({ path: join(output, path.slice(1) + "-no-review-form.png") });
    }
    assert.deepEqual(writes, []);
    const stopCalls = [];
    let stopResponse = "pending";
    let releaseStop;
    const pendingStop = new Promise(resolve => { releaseStop = resolve; });
    await page.route("**/api/admin/menus/fixture/stop", async route => {
        stopCalls.push(route.request().method());
        if (stopResponse === "pending") await pendingStop;
        if (stopResponse === "network") return route.abort("failed");
        const status = stopResponse === "conflict" ? 409 : stopResponse === "denied" ? 403 : 200;
        const body = status !== 200 ? { error: "最新状態と操作権限を確認してください。" } : stopResponse === "malformed" ? { ok: true, menu: { id: "fixture", isPublished: true, version: 6 } } : { ok: true, menu: { id: "fixture", isPublished: false, version: 6 }, publicRefreshPending: true };
        return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(base + "/list-stop");
    const stopButton = page.getByRole("button", { name: "架空停止メニューの公開を停止", exact: true });
    for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await stopButton.waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: join(output, `menu-list-stop-${width}.png`), fullPage: true });
    }
    await stopButton.focus(); await page.keyboard.press("Enter");
    await stopButton.filter({ hasText: "停止中…" }).waitFor();
    assert.equal(await stopButton.isDisabled(), true);
    assert.match(await page.locator("article").innerText(), /公開中/);
    assert.equal(stopCalls.length, 1);
    stopResponse = "ok"; releaseStop();
    await page.getByRole("status").filter({ hasText: "非公開にしました" }).waitFor();
    assert.match(await page.locator("article").innerText(), /非公開/);
    assert.equal(await stopButton.count(), 0);
    await page.getByRole("alert").filter({ hasText: "反映は未確認" }).waitFor();
    let deleteVersion;
    await page.route("**/api/admin/menus/fixture", route => {
        deleteVersion = route.request().postDataJSON().expectedVersion;
        return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "最新の内容を確認してから削除してください。" }) });
    });
    await page.getByRole("button", { name: "架空停止メニューを削除", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "最新の内容" }).waitFor();
    assert.equal(deleteVersion, 5, "A stop acknowledgement cannot rebase stale content for deletion");
    await page.unroute("**/api/admin/menus/fixture");
    for (const failure of ["network", "conflict", "denied", "malformed"]) {
        stopResponse = failure;
        await page.goto(base + "/list-stop");
        await stopButton.click(); await page.getByRole("alert").waitFor();
        assert.match(await page.locator("article").innerText(), /公開中/);
        assert.equal(await page.getByRole("status").filter({ hasText: "非公開にしました" }).count(), 0);
    }
    await page.unroute("**/api/admin/menus/fixture/stop");
    pass("List emergency stop preserves published state until acknowledgement, blocks duplicate sends, and handles failures without false success");

    let conflict = true;
    let disconnectSave = false;
    const saves = [];
    await page.route("**/api/admin/menus/fixture", async route => {
        assert.equal(route.request().method(), "PUT");
        saves.push(route.request().postDataJSON());
        if (disconnectSave) return route.abort("failed");
        await route.fulfill({ status: conflict ? 409 : 200, contentType: "application/json", body: JSON.stringify(conflict ? { error: "別の変更が保存されています。" } : {
            menu: { id: "fixture", version: 6, foodVersion: 1, reviewedFoodVersion: 1, publicationConfirmedFoodVersion: 1, imageUrl: null, isPublished: true, foodReviews: [] }, publicRefreshPending: true,
        }) });
    });
    await page.goto(base + "/edit-save");
    await page.getByText("保存済みの確認記録（直近5件）", { exact: true }).click();
    await page.getByText("この記録に対応する食品内容", { exact: true }).click();
    assert.equal(await page.getByText("卵：含む", { exact: true }).count(), 1);
    assert.match(await page.getByRole("region", { name: "以前の食品確認記録", exact: true }).innerText(), /架空資料 test-v1/);
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
        { publicationConfirmedFoodVersion: 99 }, { version: -1 }, { imageUrl: {} },
    ];
    for (const broken of malformedSaves) {
        await page.route("**/api/admin/menus/fixture", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
            menu: { id: "fixture", version: 6, foodVersion: 1, reviewedFoodVersion: 1, publicationConfirmedFoodVersion: 1, imageUrl: null, isPublished: true, foodReviews: [], ...broken },
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

    await page.unroute("**/api/admin/menus/fixture");
    await page.goto(base + "/review-queue");
    await page.locator("article").first().waitFor();
    await page.evaluate(async () => { await document.fonts.ready; });
    if (existsSync(join(output, "material-symbols.woff2"))) {
        assert.equal(await page.evaluate(() => [...document.fonts].some(font => /Material Symbols Outlined/.test(font.family) && font.status === "loaded")), true);
    }
    assert.equal(await page.locator("article").count(), 6);
    assert.match(await page.getByRole("status").innerText(), /表示中 6 件/);
    assert.match(await page.locator("article").filter({ hasText: "通常の公開停止" }).innerText(), /非公開.*食品内容の版対応あり/s);
    assert.ok(!(await page.locator("body").innerText()).includes("非公開の架空仕入れメモ"));
    assert.doesNotMatch(await page.locator("body").innerText(), /設定すると公開準備が完了/);
    const reviewFilter = page.getByRole("button", { name: /^公開前の確認待ち/ });
    assert.match(await reviewFilter.innerText(), /4/);
    await reviewFilter.focus();
    await page.keyboard.press("Enter");
    assert.equal(await reviewFilter.getAttribute("aria-pressed"), "true");
    assert.equal(await reviewFilter.evaluate(el => el.matches(":focus-visible") && getComputedStyle(el).outlineStyle !== "none"), true);
    assert.equal(await page.locator("article").count(), 4);
    assert.equal(await page.locator("article").filter({ hasText: "通常の公開停止" }).count(), 0);
    assert.match(await page.locator("body").innerText(), /公開前：保存済み内容の確認待ち/);
    assert.match(await page.locator("body").innerText(), /未解決事項あり/);
    assert.doesNotMatch(await page.locator("body").innerText(), /長文の食品確認フォームは不要です/);
    const reviewLink = page.getByRole("link", { name: "架空・材料更新で旧確認：保存済み内容を見直す", exact: true });
    assert.equal(await reviewLink.getAttribute("href"), "/admin/menus/old/edit");
    await reviewLink.focus();
    assert.equal(await reviewLink.evaluate(el => el.matches(":focus-visible") && getComputedStyle(el).outlineStyle !== "none"), true);
    pass("Review queue counts four pending records, explains missing/outdated/unresolved, and keeps a normal STOP current; keyboard filter and edit focus are visible");
    for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, width + "px review queue overflow");
        if (existsSync(join(output, "material-symbols.woff2"))) {
            assert.equal(await reviewLink.evaluate(element => {
                const box = element.getBoundingClientRect();
                const text = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.includes("保存済み内容を見直す"));
                if (!text) return false;
                const range = document.createRange(); range.selectNodeContents(text);
                return [...range.getClientRects()].every(rect => rect.width > 0 && rect.left >= box.left && rect.right <= box.right + 1 && rect.top >= box.top && rect.bottom <= box.bottom + 1);
            }), true, width + "px edit action text remains inside the link");
        }
        if ([390, 1440].includes(width)) await page.screenshot({ path: join(output, "review-queue-" + width + ".png"), fullPage: true });
    }
    const search = page.getByRole("searchbox", { name: "管理メニューを検索", exact: true });
    await search.fill("材料更新");
    assert.equal(await page.locator("article").count(), 1);
    await search.fill("該当なし");
    assert.equal(await page.locator("article").count(), 0);
    await page.getByText("該当するメニューがありません", { exact: true }).waitFor();
    await search.fill("");
    await page.getByRole("button", { name: /^公開中/ }).click();
    assert.equal(await page.locator("article").count(), 1);
    await page.getByRole("button", { name: /^非公開/ }).click();
    assert.equal(await page.locator("article").count(), 5);
    await page.getByRole("button", { name: /^未設定あり/ }).click();
    assert.equal(await page.locator("article").count(), 1);
    await reviewFilter.click();
    await search.fill("材料更新");
    const queueDeletes = [];
    await page.route("**/api/admin/menus/old", route => {
        assert.equal(route.request().method(), "DELETE"); queueDeletes.push(route.request().postDataJSON());
        return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    });
    await page.getByRole("button", { name: "架空・材料更新で旧確認を削除", exact: true }).click();
    await page.getByText("該当するメニューがありません", { exact: true }).waitFor();
    assert.equal(await search.inputValue(), "材料更新");
    assert.equal(await reviewFilter.getAttribute("aria-pressed"), "true");
    assert.match(await reviewFilter.innerText(), /3/);
    assert.deepEqual(queueDeletes, [{ expectedVersion: 5 }]);
    pass("Review queue supports 320/390/768/1440px, search and each existing filter, zero matches, and simulated versioned deletion with counts/search retained");
    await page.goto(base + "/review-queue-demo");
    await page.locator("article").first().waitFor();
    assert.equal(await page.getByRole("link", { name: "架空・材料更新で旧確認：保存済み内容を見直す", exact: true }).getAttribute("href"), "/admin/demo/menus/old/edit");
    for (const button of await page.getByRole("button", { name: /を削除$/ }).all()) assert.equal(await button.isDisabled(), true);
    const readOnlyStops = await page.getByRole("button", { name: /の公開を停止$/ }).all();
    assert.ok(readOnlyStops.length > 0);
    for (const button of readOnlyStops) assert.equal(await button.isDisabled(), true);
    await page.goto(base + "/review-queue-empty");
    await page.getByText("該当するメニューがありません", { exact: true }).waitFor();
    assert.match(await page.getByRole("status").innerText(), /表示中 0 件 \/ 全 0 件/);
    pass("Read-only demo shares review explanations and demo edit links; deletion stays disabled and empty lists remain usable");
    assert.deepEqual(errors, []);
    pass("Real new/edit forms show the guide and associated help; note text never changes state; cards and note fields support keyboard focus");
    pass("Long review inputs are absent; history, allergen guides and keyboard/mobile layout remain available");
    console.log("PASS: " + groups + " allergen UI groups passed. Real components with fictional props; DB/auth/save/Next routing are unverified.");
} finally {
    if (browser) await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
