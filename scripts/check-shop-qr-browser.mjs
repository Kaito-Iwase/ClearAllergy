// Real QR card fixture only: no admin authentication, DB or external requests.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root,"package.json"));
const ts = require("typescript");
const {webpack} = require("next/dist/compiled/webpack/webpack");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const fixture = mkdtempSync(join(tmpdir(),"clearallergy-qr-"));
const output = process.env.CLEARALLERGY_BROWSER_OUTPUT || fixture;
mkdirSync(output,{recursive:true});
function compile(source,fileName) {
    return ts.transpileModule(source,{fileName,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}}).outputText;
}
writeFileSync(join(fixture,"Card.js"),compile(readFileSync(join(root,"features/admin/shop/components/ShopQrCard.tsx"),"utf8"),"Card.tsx"),"utf8");
writeFileSync(join(fixture,"entry.js"),compile("import React from 'react'; import {createRoot} from 'react-dom/client'; import Card from './Card.js'; createRoot(document.getElementById('root')).render(<Card shopId='fictional-qr-shop' shopName='架空店舗・QRサイズ検証'/>);","entry.tsx"),"utf8");
const compiler = webpack({mode:"production",target:"web",entry:join(fixture,"entry.js"),output:{path:fixture,filename:"bundle.js"},optimization:{minimize:false},
    plugins:[new webpack.DefinePlugin({"process.env":`(${JSON.stringify({NODE_ENV:"production",NEXT_PUBLIC_APP_URL:"https://example.invalid"})})`,"process.env.NEXT_PUBLIC_APP_URL":JSON.stringify("https://example.invalid")})],
    resolve:{modules:[join(root,"node_modules")]},
});
await new Promise((resolveBuild,reject)=>compiler.run((error,stats)=>compiler.close(closeError=>{
    if(error || closeError || stats?.hasErrors()) reject(error || closeError || new Error(stats.toString({all:false,errors:true})));
    else resolveBuild();
})));
const css = readdirSync(join(root,".next/static/chunks")).filter(name=>name.endsWith(".css")).map(name=>readFileSync(join(root,".next/static/chunks",name),"utf8")).join("\n");
const assets = new Map([
    ["/",["text/html",'<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body style="padding:12px"><div id="root"></div><script src="/bundle.js"></script></body></html>']],
    ["/style.css",["text/css",css]],["/bundle.js",["text/javascript",readFileSync(join(fixture,"bundle.js"))]],
]);
const server = createServer((request,response)=>{
    const asset=assets.get(request.url);
    response.writeHead(asset?200:404,{"Content-Type":asset?.[0] || "text/plain"});
    response.end(asset?.[1] || "Not found");
});
let browser;
const measurements=[];
let groups=0;
const pass=message=>{groups++;console.log(`PASS: ${message}`);};
try {
    await new Promise(resolveListen=>server.listen(0,"127.0.0.1",resolveListen));
    const base=`http://127.0.0.1:${server.address().port}`;
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
    const context=await browser.newContext({viewport:{width:1440,height:1100}});
    await context.route("**/*",route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    const page=await context.newPage();
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.goto(base);
    const qr=page.locator(".qr-print-area svg");
    await qr.waitFor();
    const encodedPath=await qr.locator("path").last().getAttribute("d");
    async function setSize(mm) {
        await page.locator("#qr-size").fill(String(mm));
        await page.waitForFunction(mm=>document.querySelector('#qr-size').value===String(mm),mm);
    }
    for(const width of [1440,1024,390,320]) {
        await page.setViewportSize({width,height:1100});
        for(const mm of [35,45,50,60]) {
            await setSize(mm);
            const box=await qr.boundingBox();
            const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
            measurements.push({media:"screen",viewport:width,mm,width:box.width,height:box.height,overflow});
            if(width===1440 && [35,60].includes(mm)) await page.locator("section").screenshot({path:join(output,`qr-screen-${mm}.png`)});
            if(width===1440 && [35,60].includes(mm) && await page.locator(".qr-preview-stage").count()) {
                await page.locator(".qr-preview-stage").screenshot({path:join(output,`qr-stage-${mm}.png`)});
            }
            assert.equal(await qr.locator("path").last().getAttribute("d"),encodedPath,"Changing size preserves QR content");
        }
    }
    writeFileSync(join(output,"qr-measurements.json"),JSON.stringify(measurements,null,2),"utf8");
    console.log("Screen dimensions:",JSON.stringify(measurements));
    for(const width of [1440,1024,390,320]) {
        const rows=measurements.filter(row=>row.viewport===width);
        const max=rows.at(-1);
        for(const row of rows) {
            assert.ok(Math.abs(row.width-row.height)<1,"QR remains square");
            assert.ok(Math.abs(row.width/max.width-row.mm/60)<0.01,"Preview sizes follow selected ratio");
            assert.equal(row.overflow,false,"No horizontal page overflow");
        }
        pass(`${width}px: square QR and proportional 35/45/50/60mm preview`);
    }
    await page.setViewportSize({width:1440,height:1100});
    await page.getByRole("button",{name:/小さめ/}).click();
    assert.equal(await page.locator("#qr-size").inputValue(),"45");
    assert.equal(await page.getByRole("button",{name:/小さめ/}).getAttribute("aria-pressed"),"true");
    await page.locator("#qr-size").focus(); await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#qr-size").inputValue(),"50");
    assert.equal(await page.getByRole("button",{name:/小さめ/}).getAttribute("aria-pressed"),"false");
    pass("Preset selection and keyboard size adjustment");
    // Replace only the OS print dialog. Exercise the actual card print handler.
    await page.evaluate(()=>{window.print=()=>{window.dispatchEvent(new Event('fixture-print'));};});
    for(const mm of [35,45,50,60]) {
        await setSize(mm);
        await page.getByRole("button",{name:"QRを印刷",exact:true}).click();
        await page.waitForFunction(()=>document.body.classList.contains('printing-shop-qr'));
        await page.emulateMedia({media:"print"});
        const box=await qr.boundingBox();
        measurements.push({media:"print",mm,width:box.width,height:box.height});
        assert.ok(Math.abs(box.width-mm*96/25.4)<0.1 && Math.abs(box.height-mm*96/25.4)<0.1,"Print uses selected millimetres on both axes");
        assert.equal(await page.locator("button").filter({hasText:"QRを印刷"}).evaluate(el=>getComputedStyle(el).visibility),"hidden");
        if(await page.locator(".qr-preview-caption").count()) assert.equal(await page.locator(".qr-preview-caption").first().evaluate(el=>getComputedStyle(el).display),"none");
        await page.pdf({path:join(output,`qr-print-${mm}mm.pdf`),format:"A4",scale:1,printBackground:true});
        await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
        assert.equal(await page.evaluate(()=>document.body.classList.contains('printing-shop-qr')),false);
        await page.emulateMedia({media:"screen"});
        pass(`${mm}mm print dimensions and afterprint cleanup`);
    }
    writeFileSync(join(output,"qr-measurements.json"),JSON.stringify(measurements,null,2),"utf8");
    assert.deepEqual(errors,[]);
    pass("No component browser exceptions");
    console.log(`Completed: ${groups} QR groups passed. Printed paper and device scanning are not tested.`);
} finally {
    if(browser) await browser.close();
    await new Promise(resolveClose=>server.close(resolveClose));
}
